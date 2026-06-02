/**
 * Build Agentic Recent Context
 *
 * 从聊天消息历史中构建 Agentic RAG 专用的 recentContext。
 *
 * 职责：
 * - 两阶段流程：先按原始顺序过滤+配对 turns，再截取最近 maxTurns
 * - 跳过 pending 空 assistant、isComplete=false 且无 agenticMemory 的半截回答
 * - assistant 优先读取 agenticMemory，同时合并 citedReferences 作为补充
 * - 只保存 displayed references（footer + cited），不保存 hidden evidence
 * - 不保存正文，不传播 taskType/sourceTaskType
 */

import type { ChatMessage } from "../../../types/chat";
import type { AgenticRuntimeRecentContext, ConversationTurnMemoryForContext } from "./recent-context-types";

export interface AgenticRecentContext extends AgenticRuntimeRecentContext {
  summary: string;
  recentUserQuestions: string[];
  recentAssistantSummaries: string[];
  recentReferenceDocIds: string[];
  recentReferenceTitles: string[];
  lastUserQuestion?: string;
  lastAssistantSummary?: string;
  lastReferenceDocIds?: string[];
  lastReferenceTitles?: string[];
}

export interface BuildAgenticRecentContextParams {
  messages: ChatMessage[];
  excludeMessageIds?: string[];
  maxTurns?: number;
  maxChars?: number;
  compressedContextSummary?: string;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

interface AssistantRecentMemory {
  summary?: string;
  footerDocIds: string[];
  footerTitles: string[];
  citedDocIds: string[];
  citedTitles: string[];
}

function readLegacyAnswerSummary(msg: ChatMessage): string | undefined {
  if (msg.role !== "assistant") return undefined;
  const legacy = (msg as Record<string, unknown>).agentMemory as Record<string, unknown> | undefined;
  if (legacy && typeof legacy.answerSummary === "string") {
    return legacy.answerSummary;
  }
  return undefined;
}

function readLegacyFooterReferences(msg: ChatMessage): { docIds: string[]; titles: string[] } {
  if (msg.role !== "assistant") return { docIds: [], titles: [] };
  const legacy = (msg as Record<string, unknown>).agentMemory as Record<string, unknown> | undefined;
  if (!legacy) return { docIds: [], titles: [] };

  const docIds: string[] = [];
  const titles: string[] = [];

  const footerDocIds = legacy.footerReferenceDocIds;
  if (Array.isArray(footerDocIds)) {
    for (const id of footerDocIds) {
      if (typeof id === "string") docIds.push(id);
    }
  }

  const footerTitles = legacy.footerReferenceTitles;
  if (Array.isArray(footerTitles)) {
    for (const t of footerTitles) {
      if (typeof t === "string") titles.push(t);
    }
  }

  return { docIds, titles };
}

function extractCitedReferences(msg: ChatMessage): { docIds: string[]; titles: string[] } {
  if (msg.role !== "assistant") return { docIds: [], titles: [] };
  const cited = msg.citedReferences;
  if (!cited || cited.length === 0) return { docIds: [], titles: [] };

  const docIds: string[] = [];
  const titles: string[] = [];
  const seenDocIds = new Set<string>();
  const seenTitles = new Set<string>();

  for (const ref of cited) {
    if (ref.docId && !seenDocIds.has(ref.docId)) {
      seenDocIds.add(ref.docId);
      docIds.push(ref.docId);
    }
    if (ref.docTitle && !seenTitles.has(ref.docTitle)) {
      seenTitles.add(ref.docTitle);
      titles.push(ref.docTitle);
    }
  }

  return { docIds, titles };
}

function extractAssistantRecentMemory(msg: ChatMessage & { role: "assistant" }): AssistantRecentMemory {
  const result: AssistantRecentMemory = {
    footerDocIds: [],
    footerTitles: [],
    citedDocIds: [],
    citedTitles: [],
  };

  if (msg.agenticMemory) {
    result.summary = msg.agenticMemory.answerSummary;
    result.footerDocIds = msg.agenticMemory.footerReferenceDocIds ?? [];
    result.footerTitles = msg.agenticMemory.footerReferenceTitles ?? [];

    const cited = extractCitedReferences(msg);
    result.citedDocIds = cited.docIds;
    result.citedTitles = cited.titles;
  } else {
    const legacySummary = readLegacyAnswerSummary(msg);
    if (legacySummary) {
      result.summary = legacySummary;
    } else if (msg.content.trim()) {
      result.summary = truncateText(msg.content, 200);
    }

    const legacyFooter = readLegacyFooterReferences(msg);
    result.footerDocIds = legacyFooter.docIds;
    result.footerTitles = legacyFooter.titles;

    const cited = extractCitedReferences(msg);
    result.citedDocIds = cited.docIds;
    result.citedTitles = cited.titles;
  }

  return result;
}

function isPendingEmptyAssistant(msg: ChatMessage): boolean {
  if (msg.role !== "assistant") return false;
  if (msg.content.trim()) return false;
  if (msg.agenticMemory) return false;
  if (msg.citedReferences && msg.citedReferences.length > 0) return false;
  return true;
}

function isIncompleteHalfAnswer(msg: ChatMessage): boolean {
  if (msg.role !== "assistant") return false;
  if (msg.isComplete === false && !msg.agenticMemory) return true;
  return false;
}

interface RecentTurn {
  userQuestion?: string;
  assistantSummary?: string;
  assistantBound?: boolean;
  footerDocIds: string[];
  footerTitles: string[];
  citedDocIds: string[];
  citedTitles: string[];
}

function hasTurnContent(turn: RecentTurn): boolean {
  if (turn.userQuestion) return true;
  if (turn.assistantSummary) return true;
  if (turn.footerDocIds.length > 0) return true;
  if (turn.footerTitles.length > 0) return true;
  if (turn.citedDocIds.length > 0) return true;
  if (turn.citedTitles.length > 0) return true;
  return false;
}

export function buildAgenticRecentContext(
  params: BuildAgenticRecentContextParams
): AgenticRecentContext | null {
  const { messages, excludeMessageIds, maxTurns = 6, maxChars = 2400, compressedContextSummary } = params;

  const excludeSet = new Set(excludeMessageIds ?? []);

  const validMessages = messages.filter(
    (m): m is ChatMessage =>
      (m.role === "user" || m.role === "assistant") &&
      !excludeSet.has(m.id) &&
      !(m as { compacted?: boolean }).compacted
  );

  const allTurns: RecentTurn[] = [];
  let currentTurn: RecentTurn | null = null;

  function flushCurrentTurn(): void {
    if (currentTurn && hasTurnContent(currentTurn)) {
      allTurns.push(currentTurn);
      currentTurn = null;
    }
  }

  for (const msg of validMessages) {
    if (msg.role === "user") {
      flushCurrentTurn();
      currentTurn = {
        userQuestion: msg.content,
        footerDocIds: [],
        footerTitles: [],
        citedDocIds: [],
        citedTitles: [],
      };
      continue;
    }

    if (msg.role === "assistant") {
      if (isPendingEmptyAssistant(msg)) continue;
      if (isIncompleteHalfAnswer(msg)) continue;

      const memory = extractAssistantRecentMemory(msg);

      if (currentTurn && currentTurn.assistantBound !== true) {
        currentTurn.assistantSummary = memory.summary;
        currentTurn.footerDocIds = memory.footerDocIds;
        currentTurn.footerTitles = memory.footerTitles;
        currentTurn.citedDocIds = memory.citedDocIds;
        currentTurn.citedTitles = memory.citedTitles;
        currentTurn.assistantBound = true;
      } else {
        flushCurrentTurn();
        currentTurn = {
          userQuestion: undefined,
          assistantSummary: memory.summary,
          assistantBound: true,
          footerDocIds: memory.footerDocIds,
          footerTitles: memory.footerTitles,
          citedDocIds: memory.citedDocIds,
          citedTitles: memory.citedTitles,
        };
      }
    }
  }

  flushCurrentTurn();

  const recentTurns = allTurns.slice(-maxTurns);

  const recentUserQuestions: string[] = [];
  const recentAssistantSummaries: string[] = [];
  const recentReferenceDocIds: string[] = [];
  const recentReferenceTitles: string[] = [];

  const seenReferenceDocIds = new Set<string>();
  const seenReferenceTitles = new Set<string>();

  for (const turn of recentTurns) {
    if (turn.userQuestion) {
      recentUserQuestions.push(turn.userQuestion);
    }
    if (turn.assistantSummary) {
      recentAssistantSummaries.push(turn.assistantSummary);
    }

    for (const docId of turn.footerDocIds) {
      if (!seenReferenceDocIds.has(docId)) {
        seenReferenceDocIds.add(docId);
        recentReferenceDocIds.push(docId);
      }
    }

    for (const docId of turn.citedDocIds) {
      if (!seenReferenceDocIds.has(docId)) {
        seenReferenceDocIds.add(docId);
        recentReferenceDocIds.push(docId);
      }
    }

    for (const title of turn.citedTitles) {
      if (!seenReferenceTitles.has(title)) {
        seenReferenceTitles.add(title);
        recentReferenceTitles.push(title);
      }
    }

    for (const title of turn.footerTitles) {
      if (!seenReferenceTitles.has(title)) {
        seenReferenceTitles.add(title);
        recentReferenceTitles.push(title);
      }
    }
  }

  let lastUserQuestion: string | undefined;
  let lastAssistantSummary: string | undefined;
  let lastReferenceDocIds: string[] | undefined;
  let lastReferenceTitles: string[] | undefined;

  for (let i = recentTurns.length - 1; i >= 0; i--) {
    const turn = recentTurns[i];
    const hasAssistantContent = turn.assistantSummary || turn.footerDocIds.length > 0 || turn.footerTitles.length > 0 || turn.citedDocIds.length > 0 || turn.citedTitles.length > 0;
    if (!hasAssistantContent) continue;

    lastUserQuestion = turn.userQuestion;
    lastAssistantSummary = turn.assistantSummary;

    const refDocIds = [...turn.footerDocIds, ...turn.citedDocIds];
    const refTitles = [...turn.footerTitles, ...turn.citedTitles].filter(
      (t) => t && t !== "未命名文档"
    );
    if (refDocIds.length > 0 || refTitles.length > 0) {
      lastReferenceDocIds = refDocIds;
      lastReferenceTitles = refTitles;
    }

    break;
  }

  const summaryParts: string[] = [];
  if (compressedContextSummary) {
    summaryParts.push(`[历史摘要] ${compressedContextSummary}`);
  }
  if (recentUserQuestions.length > 0) {
    summaryParts.push(`最近问题: ${recentUserQuestions.slice(-2).join(" | ")}`);
  }
  if (recentAssistantSummaries.length > 0) {
    summaryParts.push(`最近回答: ${recentAssistantSummaries.slice(-2).join(" | ")}`);
  }
  if (recentReferenceDocIds.length > 0 || recentReferenceTitles.length > 0) {
    summaryParts.push(`最近显示参考资料: ${recentReferenceTitles.slice(0, 3).join("、")}`);
  }

  const summary = summaryParts.length > 0
    ? truncateText(summaryParts.join("\n"), maxChars)
    : "";

  const conversationTurns: ConversationTurnMemoryForContext[] = [];
  for (const turn of recentTurns) {
    if (turn.assistantSummary || turn.userQuestion) {
      const footerDocIdToTitle = new Map<string, string>();
      for (let i = 0; i < turn.footerDocIds.length; i++) {
        const docId = turn.footerDocIds[i];
        const title = turn.footerTitles[i];
        if (docId && title) {
          footerDocIdToTitle.set(docId, title);
        }
      }

      const maxLen = Math.max(turn.footerDocIds.length, turn.footerTitles.length);
      const footerRefs: Array<{ docId?: string; docTitle: string }> = [];
      for (let i = 0; i < maxLen; i++) {
        const docId = turn.footerDocIds[i];
        const docTitle = turn.footerTitles[i] ?? "";
        if (docId || docTitle) {
          footerRefs.push({ docId, docTitle });
        }
      }

      conversationTurns.push({
        turnId: `turn_${conversationTurns.length}`,
        userQuestion: turn.userQuestion ?? "",
        assistantSummary: turn.assistantSummary ?? "",
        answerItems: [],
        footerRefs,
      });
    }
  }

  if (!summary && recentUserQuestions.length === 0 && recentReferenceTitles.length === 0 && conversationTurns.length === 0) {
    return null;
  }

  console.info("[KB-AGENT | RECENT_CONTEXT_VISIBLE_REFERENCES_ONLY_SAFE]", {
    turnCount: recentTurns.length,
    footerRefCount: recentReferenceDocIds.length,
    persistedFullText: false,
  });

  return {
    summary,
    recentUserQuestions,
    recentAssistantSummaries,
    recentReferenceDocIds,
    recentReferenceTitles,
    lastUserQuestion,
    lastAssistantSummary,
    lastReferenceDocIds,
    lastReferenceTitles,
    conversationTurns: conversationTurns.length > 0 ? conversationTurns : undefined,
  };
}
