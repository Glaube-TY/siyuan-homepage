/**
 * Context Compression Service
 *
 * 用户手动触发的上下文压缩。
 *
 * 职责：
 * - 按结构规则选择压缩范围（不基于语义判断）
 * - 拼接已有 hiddenTurnSummary / agenticMemory.answerSummary（不调用 LLM）
 * - 标记旧消息为 compacted（不物理删除）
 *
 * 铁律边界：
 * - 不调用 search/list/focus/read/answer
 * - 不影响 Planner allowedActions
 * - 不因为压缩失败自动切换模型
 * - 不写入思源知识库
 * - 不作为全局记忆保存
 * - 不新增 recommendedState/suggestedAction/recommendedAction/fallbackAction
 */

import type { ChatMessage } from "../types/chat";
import type { ContextCompressionState } from "../types/context-usage";
import { pushAgentDebugEvent } from "./agentic-rag/debug/agentic-rag-debug";

const PRESERVED_RECENT_TURN_COUNT = 4;
const COMPRESSION_VERSION = 1;

export interface CompressionRange {
  candidateMessages: ChatMessage[];
  preservedMessages: ChatMessage[];
  compactableMessageIds: Set<string>;
}

export interface CompressionResult {
  success: boolean;
  summary?: string;
  compressionState?: ContextCompressionState;
  compactedMessageIds?: string[];
  error?: string;
}

/**
 * 按结构规则选择压缩范围
 * - 保留最近 N 轮 user+assistant 原文
 * - 保留当前 streaming 中的消息
 * - 保留 error/pending 消息
 * - 保留带 attachedDocs 的最近一轮 user message 原文
 */
export function selectCompressionRange(
  messages: ChatMessage[],
  preservedRecentTurnCount: number = PRESERVED_RECENT_TURN_COUNT,
): CompressionRange {
  const totalMessageCount = messages.length;

  const preserved = new Set<string>();
  const candidates: ChatMessage[] = [];

  const recentTurnStartIdx = Math.max(0, messages.length - preservedRecentTurnCount * 2);
  const recentMessages = messages.slice(recentTurnStartIdx);
  for (const msg of recentMessages) {
    preserved.add(msg.id);
  }

  let lastAttachedDocsUserMsgId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && msg.attachedDocs && msg.attachedDocs.length > 0) {
      lastAttachedDocsUserMsgId = msg.id;
      break;
    }
  }
  if (lastAttachedDocsUserMsgId) {
    preserved.add(lastAttachedDocsUserMsgId);
  }

  for (const msg of messages) {
    if (preserved.has(msg.id)) continue;
    if (msg.role === "error") {
      preserved.add(msg.id);
      continue;
    }
    if (msg.role === "assistant" && msg.isComplete === false) {
      preserved.add(msg.id);
      continue;
    }
    if (msg.role === "loading") {
      preserved.add(msg.id);
      continue;
    }
    candidates.push(msg);
  }

  const preservedMessages = messages.filter((m) => preserved.has(m.id));
  const compactableMessageIds = new Set(candidates.map((m) => m.id));

  pushAgentDebugEvent("CONTEXT_COMPRESSION_SELECTION_SAFE", {
    totalMessageCount,
    candidateMessageCount: candidates.length,
    preservedMessageCount: preservedMessages.length,
    preservedRecentTurnCount,
  }, "info");

  return {
    candidateMessages: candidates,
    preservedMessages,
    compactableMessageIds,
  };
}

/**
 * 执行压缩：选择范围 → 拼接已有 turn summaries → 构建结果
 * 不调用 LLM，不重读旧消息
 * 失败时不修改 messages
 */
export async function executeCompression(
  messages: ChatMessage[],
): Promise<CompressionResult> {
  const range = selectCompressionRange(messages);

  pushAgentDebugEvent("CONTEXT_COMPRESSION_REQUESTED_SAFE", {
    usageRatioPct: 0,
    messageCount: messages.length,
    trigger: "user_click",
  }, "info");

  if (range.candidateMessages.length === 0) {
    return {
      success: false,
      error: "没有可压缩的消息",
    };
  }

  const summaryParts: string[] = [];
  let missingTurnSummaryCount = 0;

  for (const msg of range.candidateMessages) {
    if (msg.role !== "assistant") continue;
    const assistant = msg as import("../types/chat").AssistantChatMessage;

    if (assistant.hiddenTurnSummary) {
      summaryParts.push(assistant.hiddenTurnSummary);
    } else if (assistant.agenticMemory?.answerSummary) {
      summaryParts.push(assistant.agenticMemory.answerSummary);
    } else if (assistant.content.trim()) {
      summaryParts.push(assistant.content.slice(0, 100));
      missingTurnSummaryCount++;
    } else {
      missingTurnSummaryCount++;
    }
  }

  const summary = summaryParts.join("\n");
  if (!summary) {
    return {
      success: false,
      error: "没有可拼接的摘要",
    };
  }

  const summaryTokenEstimate = Math.round(summary.length / 3.5);

  pushAgentDebugEvent("CONTEXT_COMPRESSION_APPLIED_SAFE", {
    compressedMessageCount: range.compactableMessageIds.size,
    summaryChars: summary.length,
    summarySource: "turn_summaries",
    missingTurnSummaryCount,
  }, "info");

  const compressionState: ContextCompressionState = {
    enabled: true,
    lastCompressedAt: Date.now(),
    compressedMessageCount: range.compactableMessageIds.size,
    summaryChars: summary.length,
    summaryTokenEstimate,
    preservedRecentTurnCount: PRESERVED_RECENT_TURN_COUNT,
    version: COMPRESSION_VERSION,
  };

  return {
    success: true,
    summary,
    compressionState,
    compactedMessageIds: Array.from(range.compactableMessageIds),
  };
}

const TURN_SUMMARY_VERSION = 1;
const MAX_TURN_SUMMARY_CHARS = 150;

export interface TurnSummaryInput {
  userQuestion: string;
  answerContent: string;
  answerSummary?: string;
  footerReferenceDocIds?: string[];
  footerReferenceTitles?: string[];
  scopeMode?: string;
  citedReferenceTitles?: string[];
}

/**
 * 生成轮次隐藏摘要
 * 优先复用已有 answerSummary，不需要调用 LLM
 */
export function buildTurnSummary(input: TurnSummaryInput): {
  summary: string;
  meta: import("../types/chat").AssistantChatMessage["hiddenTurnSummaryMeta"];
} {
  const {
    userQuestion,
    answerContent,
    answerSummary,
    footerReferenceDocIds,
    footerReferenceTitles,
    scopeMode,
    citedReferenceTitles,
  } = input;

  const now = Date.now();

  if (answerSummary && answerSummary.length <= MAX_TURN_SUMMARY_CHARS) {
    const refTitles = footerReferenceTitles?.length
      ? footerReferenceTitles.slice(0, 3)
      : citedReferenceTitles?.slice(0, 3) ?? [];
    const refPart = refTitles.length > 0 ? ` 引用：${refTitles.join("、")}` : "";
    const scopePart = scopeMode ? ` [${scopeMode}]` : "";
    const summary = `${answerSummary}${refPart}${scopePart}`;

    pushAgentDebugEvent("TURN_SUMMARY_GENERATED_SAFE", {
      summaryChars: summary.length,
      success: true,
      scopeMode: scopeMode ?? "unknown",
      hasReferences: (footerReferenceDocIds?.length ?? 0) > 0,
      summarySource: "agentic_memory",
    }, "info");

    return {
      summary: summary.slice(0, MAX_TURN_SUMMARY_CHARS),
      meta: {
        summaryVersion: TURN_SUMMARY_VERSION,
        summaryCreatedAt: now,
        summarySource: "agentic_memory",
      },
    };
  }

  try {
    const questionPart = userQuestion.slice(0, 40);
    const answerPart = answerContent.slice(0, 80);
    const refTitles = footerReferenceTitles?.length
      ? footerReferenceTitles.slice(0, 3)
      : citedReferenceTitles?.slice(0, 3) ?? [];
    const refPart = refTitles.length > 0 ? ` 引用：${refTitles.join("、")}` : "";
    const scopePart = scopeMode ? ` [${scopeMode}]` : "";
    const summary = `问：${questionPart} 答：${answerPart}${refPart}${scopePart}`.slice(0, MAX_TURN_SUMMARY_CHARS);

    pushAgentDebugEvent("TURN_SUMMARY_GENERATED_SAFE", {
      summaryChars: summary.length,
      success: true,
      scopeMode: scopeMode ?? "unknown",
      hasReferences: (footerReferenceDocIds?.length ?? 0) > 0,
      summarySource: "content_truncated",
    }, "info");

    return {
      summary,
      meta: {
        summaryVersion: TURN_SUMMARY_VERSION,
        summaryCreatedAt: now,
        summarySource: "content_truncated",
      },
    };
  } catch {
    pushAgentDebugEvent("TURN_SUMMARY_GENERATED_SAFE", {
      summaryChars: 0,
      success: false,
      scopeMode: scopeMode ?? "unknown",
      hasReferences: false,
      summarySource: "content_truncated",
    }, "warn");

    return {
      summary: "",
      meta: {
        summaryVersion: TURN_SUMMARY_VERSION,
        summaryCreatedAt: now,
        summarySource: "content_truncated",
        summaryFailed: true,
      },
    };
  }
}
