/**
 * Context Compression Service
 *
 * Compression is based only on Planner-provided stage summaries. It does not
 * call LLMs, read tool observations, or derive summary text from assistant
 * answers.
 *
 * Emergency Context Compaction: when usage reaches forceCompressionRatio or
 * >=90% and normal stage-summary-based compression cannot safely compress,
 * a one-shot LLM compressor generates emergency stage summaries. This is a
 * system action, not a tool — it does not appear in the tool manifest, does
 * not write ObservationLog, and does not emit ToolDispatch/ToolResult.
 */

import type { ChatMessage, ConversationStageSummary } from "../types/chat";
import type { ContextCompressionState } from "../types/context-usage";
import { pushAgentDebugEvent } from "./agent-workbench/debug/workbench-debug";
import { getCompleteConversationTurns } from "./agent-workbench/runtime/conversation-turns";
import { callLlmJson } from "./qa/llm-client";

const COMPRESSION_VERSION = 3;

const DEFAULT_AUTO_COMPRESSION_ENABLED = true;
const DEFAULT_AUTO_COMPRESSION_RATIO = 0.75;
const DEFAULT_FORCE_COMPRESSION_RATIO = 0.9;
const DEFAULT_MAX_COMPRESSED_SUMMARY_CHARS = 8000;
const ARCHIVE_MARKER = "[更早阶段摘要已折叠，不进入 Planner]";
const NO_STAGE_SUMMARY_ERROR = "当前还没有历史摘要，暂时无法压缩。";

export interface CompressionRange {
  candidateMessages: ChatMessage[];
  preservedMessages: ChatMessage[];
  compactableMessageIds: Set<string>;
  candidateTurnCount: number;
  latestCoveredTurnIndex: number;
  latestStageSummary?: ConversationStageSummary;
  reason?: "no_stage_summary_coverage" | "stage_summary_boundary_missing";
}

export interface CompressionResult {
  success: boolean;
  summary?: string;
  compressionState?: ContextCompressionState;
  compactedMessageIds?: string[];
  error?: string;
}

export interface AutoCompressionPolicy {
  autoCompressionEnabled: boolean;
  autoCompressionRatio: number;
  forceCompressionRatio: number;
  maxCompressedSummaryChars: number;
}

export interface MaybeAutoCompressParams {
  messages: ChatMessage[];
  stageSummaries?: ConversationStageSummary[];
  compressedContextSummary?: string;
  compressionState?: ContextCompressionState;
  usageRatio: number;
  policy?: Partial<AutoCompressionPolicy>;
  maxContextTokens?: number;
  maxContextSource?: import("../types/context-usage").ContextUsageMaxContextSource;
}

export interface MaybeAutoCompressResult {
  action: "no_op" | "compressed" | "emergency_compressed";
  updatedMessages?: ChatMessage[];
  newCompressedContextSummary?: string;
  newCompressionState?: ContextCompressionState;
  compactedMessageIds?: string[];
  newStageSummaries?: ConversationStageSummary[];
}

function resolvePolicy(partial: Partial<AutoCompressionPolicy> | undefined, state?: ContextCompressionState): AutoCompressionPolicy {
  return {
    autoCompressionEnabled: partial?.autoCompressionEnabled ?? state?.autoCompressionEnabled ?? DEFAULT_AUTO_COMPRESSION_ENABLED,
    autoCompressionRatio: partial?.autoCompressionRatio ?? state?.autoCompressionRatio ?? DEFAULT_AUTO_COMPRESSION_RATIO,
    forceCompressionRatio: partial?.forceCompressionRatio ?? state?.forceCompressionRatio ?? DEFAULT_FORCE_COMPRESSION_RATIO,
    maxCompressedSummaryChars: partial?.maxCompressedSummaryChars ?? state?.maxCompressedSummaryChars ?? DEFAULT_MAX_COMPRESSED_SUMMARY_CHARS,
  };
}

function getSortedStageSummaries(stageSummaries: readonly ConversationStageSummary[] | undefined): ConversationStageSummary[] {
  return [...(stageSummaries ?? [])]
    .filter((item) => (item.source === "planner_stage_summary" || item.source === "emergency_llm_stage_summary") && item.summary.trim().length > 0)
    .sort((a, b) => a.index - b.index);
}

export function selectCompressionRange(
  messages: ChatMessage[],
  stageSummaries: readonly ConversationStageSummary[] | undefined,
): CompressionRange {
  const sortedStageSummaries = getSortedStageSummaries(stageSummaries);
  const latestStageSummary = sortedStageSummaries[sortedStageSummaries.length - 1];
  const emptyRange = (reason: CompressionRange["reason"]): CompressionRange => ({
    candidateMessages: [],
    preservedMessages: messages,
    compactableMessageIds: new Set<string>(),
    candidateTurnCount: 0,
    latestCoveredTurnIndex: latestStageSummary?.endTurnIndex ?? 0,
    latestStageSummary,
    reason,
  });

  if (!latestStageSummary) {
    return emptyRange("no_stage_summary_coverage");
  }

  const completeTurns = getCompleteConversationTurns(messages);
  const boundaryTurn = completeTurns.find((turn) => (
    turn.turnIndex === latestStageSummary.endTurnIndex &&
    turn.user.id === latestStageSummary.endUserMessageId &&
    turn.assistant.id === latestStageSummary.endAssistantMessageId
  ));

  if (!boundaryTurn) {
    pushAgentDebugEvent("CONTEXT_COMPRESSION_STAGE_BOUNDARY_MISSING", {
      latestStageIndex: latestStageSummary.index,
      latestCoveredTurnIndex: latestStageSummary.endTurnIndex,
      endUserMessageId: latestStageSummary.endUserMessageId,
      endAssistantMessageId: latestStageSummary.endAssistantMessageId,
    }, "warn");
    return emptyRange("stage_summary_boundary_missing");
  }

  const compactableMessageIds = new Set<string>();
  const candidateMessages: ChatMessage[] = [];
  let candidateTurnCount = 0;

  for (const turn of completeTurns) {
    if (turn.turnIndex > latestStageSummary.endTurnIndex) continue;
    if (turn.user.compacted || turn.assistant.compacted) continue;
    compactableMessageIds.add(turn.user.id);
    compactableMessageIds.add(turn.assistant.id);
    candidateMessages.push(turn.user, turn.assistant);
    candidateTurnCount += 1;
  }

  const preservedMessages = messages.filter((message) => !compactableMessageIds.has(message.id));

  pushAgentDebugEvent("CONTEXT_COMPRESSION_SELECTION_STAGE_BOUNDARY", {
    messageCount: messages.length,
    stageSummaryCount: sortedStageSummaries.length,
    latestStageIndex: latestStageSummary.index,
    latestCoveredTurnIndex: latestStageSummary.endTurnIndex,
    candidateMessageCount: candidateMessages.length,
    candidateTurnCount,
    preservedMessageCount: preservedMessages.length,
  }, "info");

  return {
    candidateMessages,
    preservedMessages,
    compactableMessageIds,
    candidateTurnCount,
    latestCoveredTurnIndex: latestStageSummary.endTurnIndex,
    latestStageSummary,
  };
}

function rollCompressedSummary(summary: string, maxChars: number): { rolled: string; droppedChars: number } {
  if (summary.length <= maxChars) {
    return { rolled: summary, droppedChars: 0 };
  }

  const markerLine = `${ARCHIVE_MARKER}\n`;
  const cleaned = summary.replace(markerLine, "");
  const contentBudget = Math.floor(maxChars * 0.7);
  const tail = cleaned.slice(-contentBudget);
  return {
    rolled: markerLine + tail,
    droppedChars: cleaned.length - tail.length,
  };
}

function renderCompressedSummary(params: {
  stageSummaries: readonly ConversationStageSummary[];
  latestStageIndex: number;
  maxCompressedSummaryChars: number;
}): { summary: string; stageSummaryCount: number; droppedChars: number } {
  const selected = getSortedStageSummaries(params.stageSummaries)
    .filter((stage) => stage.index <= params.latestStageIndex);
  const raw = selected
    .map((stage) => [
      `阶段 ${stage.index}（第 ${stage.startTurnIndex}-${stage.endTurnIndex} 轮）：`,
      stage.summary.trim(),
    ].join("\n"))
    .join("\n\n");
  const { rolled, droppedChars } = rollCompressedSummary(raw, params.maxCompressedSummaryChars);
  return {
    summary: rolled,
    stageSummaryCount: selected.length,
    droppedChars,
  };
}

function buildCompressionState(params: {
  existingState?: ContextCompressionState;
  range: CompressionRange;
  rendered: { summary: string; stageSummaryCount: number; droppedChars: number };
  policy: AutoCompressionPolicy;
  trigger: "manual" | "auto" | "force";
}): ContextCompressionState {
  const summaryTokenEstimate = Math.round(params.rendered.summary.length / 3.5);
  return {
    enabled: true,
    lastCompressedAt: Date.now(),
    ...(params.trigger !== "manual" ? { lastAutoCompressedAt: Date.now() } : {}),
    compressedMessageCount: (params.existingState?.compressedMessageCount ?? 0) + params.range.compactableMessageIds.size,
    compressedTurnCount: (params.existingState?.compressedTurnCount ?? 0) + params.range.candidateTurnCount,
    compressedStageSummaryCount: params.rendered.stageSummaryCount,
    latestCompressedStageIndex: params.range.latestStageSummary?.index,
    latestCompressedTurnIndex: params.range.latestCoveredTurnIndex,
    summaryChars: params.rendered.summary.length,
    summaryTokenEstimate,
    version: COMPRESSION_VERSION,
    autoCompressionEnabled: params.policy.autoCompressionEnabled,
    autoCompressionRatio: params.policy.autoCompressionRatio,
    forceCompressionRatio: params.policy.forceCompressionRatio,
    maxCompressedSummaryChars: params.policy.maxCompressedSummaryChars,
    autoCompressedCount: (params.existingState?.autoCompressedCount ?? 0) + (params.trigger === "manual" ? 0 : 1),
    rolledSummaryCount: (params.existingState?.rolledSummaryCount ?? 0) + (params.rendered.droppedChars > 0 ? 1 : 0),
    lastCompressionTrigger: params.trigger,
  };
}

export async function executeCompression(
  messages: ChatMessage[],
  stageSummaries: readonly ConversationStageSummary[] | undefined,
  _existingSummary?: string,
  existingState?: ContextCompressionState,
): Promise<CompressionResult> {
  const policy = resolvePolicy(undefined, existingState);
  const range = selectCompressionRange(messages, stageSummaries);

  pushAgentDebugEvent("CONTEXT_COMPRESSION_REQUESTED_STAGE_BOUNDARY", {
    messageCount: messages.length,
    trigger: "manual",
    stageSummaryCount: stageSummaries?.length ?? 0,
  }, "info");

  if (range.reason === "no_stage_summary_coverage") {
    return { success: false, error: NO_STAGE_SUMMARY_ERROR };
  }
  if (range.reason === "stage_summary_boundary_missing") {
    return { success: false, error: "历史摘要边界不完整，暂时无法压缩。" };
  }
  if (range.candidateMessages.length === 0) {
    return { success: false, error: "没有新的可压缩内容。" };
  }

  const rendered = renderCompressedSummary({
    stageSummaries: stageSummaries ?? [],
    latestStageIndex: range.latestStageSummary?.index ?? 0,
    maxCompressedSummaryChars: policy.maxCompressedSummaryChars,
  });

  if (!rendered.summary.trim()) {
    return { success: false, error: NO_STAGE_SUMMARY_ERROR };
  }

  const compressionState = buildCompressionState({
    existingState,
    range,
    rendered,
    policy,
    trigger: "manual",
  });

  pushAgentDebugEvent("CONTEXT_COMPRESSION_APPLIED_STAGE_BOUNDARY", {
    compressedMessageCount: range.compactableMessageIds.size,
    compressedTurnCount: range.candidateTurnCount,
    compressedStageSummaryCount: rendered.stageSummaryCount,
    latestCompressedStageIndex: compressionState.latestCompressedStageIndex,
    latestCompressedTurnIndex: compressionState.latestCompressedTurnIndex,
    summaryChars: rendered.summary.length,
    droppedChars: rendered.droppedChars,
    trigger: "manual",
  }, "info");

  return {
    success: true,
    summary: rendered.summary,
    compressionState,
    compactedMessageIds: Array.from(range.compactableMessageIds),
  };
}

export async function maybeAutoCompressContext(
  params: MaybeAutoCompressParams,
): Promise<MaybeAutoCompressResult> {
  const {
    messages,
    stageSummaries,
    compressionState,
    usageRatio,
    maxContextTokens,
    maxContextSource,
  } = params;
  const policy = resolvePolicy(params.policy, compressionState);

  if (!policy.autoCompressionEnabled) {
    pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_SKIPPED", {
      reason: "disabled",
      usageRatioPct: Math.round(usageRatio * 100),
      maxContextTokens,
      maxContextSource,
    }, "info");
    return { action: "no_op" };
  }

  const isForce = usageRatio >= policy.forceCompressionRatio;
  const isAuto = usageRatio >= policy.autoCompressionRatio;

  if (!isAuto && !isForce) {
    pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_SKIPPED", {
      reason: "below_threshold",
      usageRatioPct: Math.round(usageRatio * 100),
      thresholdPct: Math.round(policy.autoCompressionRatio * 100),
      maxContextTokens,
      maxContextSource,
    }, "info");
    return { action: "no_op" };
  }

  const trigger: "auto" | "force" = isForce ? "force" : "auto";

  try {
    const range = selectCompressionRange(messages, stageSummaries);

    if (range.reason === "no_stage_summary_coverage") {
      // When force threshold is reached and no stage summary coverage,
      // trigger emergency context compaction
      if (isForce) {
        pushAgentDebugEvent("CONTEXT_COMPRESSION_EMERGENCY_TRIGGERED", {
          usageRatioPct: Math.round(usageRatio * 100),
          reason: "no_stage_summary_coverage",
        }, "warn");

        const emergencyResult = await emergencyCompressContext({
          messages,
          stageSummaries: stageSummaries ?? [],
          usageRatio,
          maxContextTokens: maxContextTokens ?? 128000,
        });

        if (emergencyResult.success && emergencyResult.newStageSummaries) {
          return {
            action: "emergency_compressed",
            newStageSummaries: emergencyResult.newStageSummaries,
          };
        }

        // Emergency compression failed — return no_op, caller handles toast
        return { action: "no_op" };
      }

      pushAgentDebugEvent("CONTEXT_COMPRESSION_SKIPPED_NO_STAGE_SUMMARY_COVERAGE", {
        usageRatioPct: Math.round(usageRatio * 100),
        trigger,
      }, "info");
      return { action: "no_op" };
    }

    if (range.reason === "stage_summary_boundary_missing") {
      // Also try emergency compression if force threshold
      if (isForce) {
        pushAgentDebugEvent("CONTEXT_COMPRESSION_EMERGENCY_TRIGGERED", {
          usageRatioPct: Math.round(usageRatio * 100),
          reason: "stage_summary_boundary_missing",
        }, "warn");

        const emergencyResult = await emergencyCompressContext({
          messages,
          stageSummaries: stageSummaries ?? [],
          usageRatio,
          maxContextTokens: maxContextTokens ?? 128000,
        });

        if (emergencyResult.success && emergencyResult.newStageSummaries) {
          return {
            action: "emergency_compressed",
            newStageSummaries: emergencyResult.newStageSummaries,
          };
        }

        return { action: "no_op" };
      }

      pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_SKIPPED", {
        reason: "stage_summary_boundary_missing",
        usageRatioPct: Math.round(usageRatio * 100),
      }, "warn");
      return { action: "no_op" };
    }

    if (range.candidateMessages.length === 0) {
      pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_SKIPPED", {
        reason: "no_uncompacted_covered_turns",
        usageRatioPct: Math.round(usageRatio * 100),
      }, "info");
      return { action: "no_op" };
    }

    const rendered = renderCompressedSummary({
      stageSummaries: stageSummaries ?? [],
      latestStageIndex: range.latestStageSummary?.index ?? 0,
      maxCompressedSummaryChars: policy.maxCompressedSummaryChars,
    });

    if (!rendered.summary.trim()) {
      pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_SKIPPED", {
        reason: "empty_stage_summary_render",
        usageRatioPct: Math.round(usageRatio * 100),
      }, "info");
      return { action: "no_op" };
    }

    const newCompressionState = buildCompressionState({
      existingState: compressionState,
      range,
      rendered,
      policy,
      trigger,
    });

    const compactedIds = range.compactableMessageIds;
    const updatedMessages = messages.map((message) => {
      if (compactedIds.has(message.id) && (message.role === "user" || message.role === "assistant")) {
        return { ...message, compacted: true };
      }
      return message;
    });

    pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_APPLIED", {
      trigger,
      usageRatioPct: Math.round(usageRatio * 100),
      compactedMessageCount: compactedIds.size,
      compactedTurnCount: range.candidateTurnCount,
      compressedStageSummaryCount: rendered.stageSummaryCount,
      latestCompressedStageIndex: newCompressionState.latestCompressedStageIndex,
      latestCompressedTurnIndex: newCompressionState.latestCompressedTurnIndex,
      summaryChars: rendered.summary.length,
      droppedChars: rendered.droppedChars,
      autoCompressedCount: newCompressionState.autoCompressedCount,
      maxContextTokens,
      maxContextSource,
    }, "info");

    return {
      action: "compressed",
      updatedMessages,
      newCompressedContextSummary: rendered.summary,
      newCompressionState,
      compactedMessageIds: Array.from(compactedIds),
    };
  } catch (err) {
    pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_FAILED", {
      error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      usageRatioPct: Math.round(usageRatio * 100),
    }, "warn");
    return { action: "no_op" };
  }
}

// ==================== Emergency Context Compaction ====================

const EMERGENCY_COMPRESSION_MAX_SUMMARY_CHARS = 1500;
const EMERGENCY_COMPRESSION_PROMPT = `你是一个对话阶段摘要生成器。根据以下对话信息，生成结构化的阶段摘要。

规则：
1. 只总结用户消息和助手最终回答中的实质内容
2. 不得包含工具调用结果、ToolDispatch、ToolResult、workbenchEvents、debug trace、工具返回正文、内部路径
3. 每个阶段的 summary 必须 150-1500 字
4. startTurnIndex 必须大于上一阶段的 endTurnIndex
5. endTurnIndex 不能超过当前已完成轮次
6. 范围必须连续，不能有间隙
7. 不能覆盖当前用户消息、loading/error/incomplete 的助手消息
8. 输出严格为 JSON

输出格式：
{
  "stageSummaries": [
    {
      "summary": "阶段摘要正文",
      "startTurnIndex": 1,
      "endTurnIndex": 3
    }
  ]
}

对话信息：
`;

interface EmergencyStageSummaryEntry {
  summary: string;
  startTurnIndex: number;
  endTurnIndex: number;
}

interface EmergencyCompressionOutput {
  stageSummaries: EmergencyStageSummaryEntry[];
}

interface EmergencyTurnInput {
  turnIndex: number;
  userMessageId: string;
  userText: string;
  assistantMessageId: string;
  assistantFinalAnswer: string;
  groundedReferences?: Array<{
    docId?: string;
    title?: string;
    sourceType?: string;
  }>;
}

function buildEmergencyCompressionInput(
  messages: ChatMessage[],
  stageSummaries: ConversationStageSummary[],
): { prompt: string; completedTurnCount: number } {
  const completeTurns = getCompleteConversationTurns(messages);
  const lastSummarizedTurnIndex = stageSummaries.length > 0
    ? Math.max(...stageSummaries.map((s) => s.endTurnIndex))
    : 0;

  const turnsInput: EmergencyTurnInput[] = [];
  for (const turn of completeTurns) {
    if (turn.turnIndex <= lastSummarizedTurnIndex) continue;
    if (turn.user.compacted || turn.assistant.compacted) continue;

    const groundedRefs = turn.assistant.citedReferences
      ?.filter((ref) => ref.grounded === true)
      .map((ref) => ({
        docId: ref.docId,
        title: ref.docTitle || ref.displayTitle,
      }))
      .filter((ref) => ref.docId || ref.title);

    turnsInput.push({
      turnIndex: turn.turnIndex,
      userMessageId: turn.user.id,
      userText: (turn.user.content ?? "").slice(0, 500),
      assistantMessageId: turn.assistant.id,
      assistantFinalAnswer: (turn.assistant.content ?? "").slice(0, 1000),
      ...(groundedRefs?.length ? { groundedReferences: groundedRefs } : {}),
    });
  }

  const existingBoundaryInfo = stageSummaries.length > 0
    ? `已有阶段摘要边界：${stageSummaries.map((s) => `阶段${s.index}(轮次${s.startTurnIndex}-${s.endTurnIndex})`).join(", ")}\n`
    : "";

  const prompt = EMERGENCY_COMPRESSION_PROMPT +
    existingBoundaryInfo +
    `已完成轮次总数：${completeTurns.length}\n` +
    `未总结轮次：${JSON.stringify(turnsInput, null, 2)}`;

  return { prompt, completedTurnCount: completeTurns.length };
}

function validateEmergencyOutput(
  output: EmergencyCompressionOutput,
  completedTurnCount: number,
  lastSummarizedTurnIndex: number,
): { valid: boolean; error?: string } {
  if (!output.stageSummaries || !Array.isArray(output.stageSummaries)) {
    return { valid: false, error: "stageSummaries 不是数组" };
  }

  let prevEndTurnIndex = lastSummarizedTurnIndex;
  for (let i = 0; i < output.stageSummaries.length; i++) {
    const entry = output.stageSummaries[i];

    if (!entry.summary || typeof entry.summary !== "string" || entry.summary.trim().length === 0) {
      return { valid: false, error: `阶段 ${i} summary 为空` };
    }
    if (entry.summary.length > EMERGENCY_COMPRESSION_MAX_SUMMARY_CHARS) {
      return { valid: false, error: `阶段 ${i} summary 超过 ${EMERGENCY_COMPRESSION_MAX_SUMMARY_CHARS} 字` };
    }
    if (typeof entry.startTurnIndex !== "number" || typeof entry.endTurnIndex !== "number") {
      return { valid: false, error: `阶段 ${i} startTurnIndex/endTurnIndex 不是数字` };
    }
    if (entry.startTurnIndex <= prevEndTurnIndex) {
      return { valid: false, error: `阶段 ${i} startTurnIndex(${entry.startTurnIndex}) 必须大于上一阶段 endTurnIndex(${prevEndTurnIndex})` };
    }
    if (entry.endTurnIndex > completedTurnCount) {
      return { valid: false, error: `阶段 ${i} endTurnIndex(${entry.endTurnIndex}) 超过已完成轮次(${completedTurnCount})` };
    }
    if (entry.startTurnIndex > entry.endTurnIndex) {
      return { valid: false, error: `阶段 ${i} startTurnIndex > endTurnIndex` };
    }

    prevEndTurnIndex = entry.endTurnIndex;
  }

  return { valid: true };
}

export interface EmergencyCompressParams {
  messages: ChatMessage[];
  stageSummaries: ConversationStageSummary[];
  usageRatio: number;
  maxContextTokens: number;
}

export interface EmergencyCompressResult {
  success: boolean;
  newStageSummaries?: ConversationStageSummary[];
  error?: string;
}

export async function emergencyCompressContext(
  params: EmergencyCompressParams,
): Promise<EmergencyCompressResult> {
  const { messages, stageSummaries, usageRatio, maxContextTokens } = params;

  pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_STARTED", {
    usageRatioPct: Math.round(usageRatio * 100),
    maxContextTokens,
    existingStageSummaryCount: stageSummaries.length,
  }, "warn");

  try {
    const { prompt, completedTurnCount } = buildEmergencyCompressionInput(messages, stageSummaries);
    const lastSummarizedTurnIndex = stageSummaries.length > 0
      ? Math.max(...stageSummaries.map((s) => s.endTurnIndex))
      : 0;

    const llmOutput = await callLlmJson<EmergencyCompressionOutput>(prompt, {
      temperature: 0.3,
      maxOutputTokens: 2000,
    });

    const validation = validateEmergencyOutput(llmOutput, completedTurnCount, lastSummarizedTurnIndex);
    if (!validation.valid) {
      pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
        error: validation.error,
        usageRatioPct: Math.round(usageRatio * 100),
      }, "error");
      return { success: false, error: `紧急压缩校验失败: ${validation.error}` };
    }

    const existingMaxIndex = stageSummaries.length > 0
      ? Math.max(...stageSummaries.map((s) => s.index))
      : 0;

    const allTurns = getCompleteConversationTurns(messages);

    const newStageSummaries: ConversationStageSummary[] = llmOutput.stageSummaries.map((entry, i) => {
      const endTurn = allTurns.find((t) => t.turnIndex === entry.endTurnIndex);
      const prevTurn = entry.startTurnIndex > 1
        ? allTurns.find((t) => t.turnIndex === entry.startTurnIndex - 1)
        : undefined;
      const summaryText = entry.summary.trim();

      return {
        id: `emergency-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        index: existingMaxIndex + i + 1,
        summary: summaryText,
        startTurnIndex: entry.startTurnIndex,
        endTurnIndex: entry.endTurnIndex,
        ...(prevTurn ? { startAfterAssistantMessageId: prevTurn.assistant.id } : {}),
        endUserMessageId: endTurn?.user.id ?? "",
        endAssistantMessageId: endTurn?.assistant.id ?? "",
        createdAt: Date.now(),
        source: "emergency_llm_stage_summary" as const,
        summaryChars: summaryText.length,
      };
    });

    pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_SUCCEEDED", {
      newStageSummaryCount: newStageSummaries.length,
      usageRatioPct: Math.round(usageRatio * 100),
    }, "info");

    return { success: true, newStageSummaries };
  } catch (err) {
    pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
      error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      usageRatioPct: Math.round(usageRatio * 100),
    }, "error");
    return { success: false, error: "紧急压缩 LLM 调用失败" };
  }
}
