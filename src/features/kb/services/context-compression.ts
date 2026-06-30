/**
 * Context Compression Service
 *
 * Regular compression is based only on agent-provided stage summaries.
 * It does not call LLMs, read tool observations, or derive summary text from
 * assistant answers.
 *
 * Emergency Context Compaction: when usage reaches forceCompressionRatio
 * (default 0.9) and normal stage-summary-based compression cannot safely
 * compress, a one-shot LLM call generates emergency stage summaries for
 * uncovered completed turns. This is a system action, not a tool — it does
 * not appear in the tool manifest, does not write ToolResultLog, does not
 * read tool observations, does not write long-term memory, and does not emit
 * tool_start/tool_result. It only produces in-session stage summaries.
 */

import type { ChatMessage, ConversationStageSummary } from "../types/chat";
import type { ContextCompressionState } from "../types/context-usage";
import type { ChatModelSelection } from "../types/chat-model-selection";
import { pushAgentDebugEvent } from "./agent-workbench/debug/workbench-debug";
import { getCompleteConversationTurns } from "./agent-workbench/runtime/conversation-turns";
import { sanitizePersistedSummaryText } from "./session/persisted-summary-sanitizer";
import { callModelText } from "./qa/kb-model-call";

const COMPRESSION_VERSION = 3;

const DEFAULT_AUTO_COMPRESSION_ENABLED = true;
const DEFAULT_AUTO_COMPRESSION_RATIO = 0.75;
const DEFAULT_FORCE_COMPRESSION_RATIO = 0.9;
const DEFAULT_MAX_COMPRESSED_SUMMARY_CHARS = 8000;
const ARCHIVE_MARKER = "[更早阶段摘要已折叠]";
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
  /** 当前选中的模型，emergency 压缩时使用 */
  chatModelSelection?: ChatModelSelection;
  /** 中断信号，emergency 压缩时检查 */
  abortSignal?: AbortSignal;
  /** 是否允许触发 emergency 压缩；retry 普通压缩时应设为 false 避免递归 */
  allowEmergency?: boolean;
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
    .filter((item) => (item.source === "agent_stage_summary" || item.source === "emergency_llm_stage_summary") && item.summary.trim().length > 0)
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
}):
  { summary: string; stageSummaryCount: number; droppedChars: number } {
  const selected = getSortedStageSummaries(params.stageSummaries)
    .filter((stage) => stage.index <= params.latestStageIndex);
  const raw = selected
    .map((stage) => [
      `阶段 ${stage.index}（第 ${stage.startTurnIndex}-${stage.endTurnIndex} 轮）：`,
      stage.summary.trim(),
    ].join("\n"))
    .join("\n\n");
  const { rolled, droppedChars } = rollCompressedSummary(raw, params.maxCompressedSummaryChars);
  const summary = sanitizePersistedSummaryText(rolled, params.maxCompressedSummaryChars) ?? rolled;
  return {
    summary,
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
      if (isForce && (params.allowEmergency !== false)) {
        pushAgentDebugEvent("CONTEXT_COMPRESSION_EMERGENCY_TRIGGERED", {
          usageRatioPct: Math.round(usageRatio * 100),
          reason: "no_stage_summary_coverage",
        }, "warn");

        const emergencyResult = await emergencyCompressContext({
          messages,
          stageSummaries: stageSummaries ?? [],
          usageRatio,
          maxContextTokens: maxContextTokens ?? 128000,
          chatModelSelection: params.chatModelSelection,
          abortSignal: params.abortSignal,
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
      if (isForce && (params.allowEmergency !== false)) {
        pushAgentDebugEvent("CONTEXT_COMPRESSION_EMERGENCY_TRIGGERED", {
          usageRatioPct: Math.round(usageRatio * 100),
          reason: "stage_summary_boundary_missing",
        }, "warn");

        const emergencyResult = await emergencyCompressContext({
          messages,
          stageSummaries: stageSummaries ?? [],
          usageRatio,
          maxContextTokens: maxContextTokens ?? 128000,
          chatModelSelection: params.chatModelSelection,
          abortSignal: params.abortSignal,
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
      const completeTurns = getCompleteConversationTurns(messages);
      const hasUncoveredTurns = completeTurns.length > 0 &&
        completeTurns[completeTurns.length - 1].turnIndex > range.latestCoveredTurnIndex;

      if (isForce && hasUncoveredTurns && (params.allowEmergency !== false)) {
        pushAgentDebugEvent("CONTEXT_COMPRESSION_EMERGENCY_TRIGGERED", {
          usageRatioPct: Math.round(usageRatio * 100),
          reason: "has_uncovered_turns_but_no_uncompacted_covered",
          latestCoveredTurnIndex: range.latestCoveredTurnIndex,
          totalCompletedTurns: completeTurns.length,
        }, "warn");

        const emergencyResult = await emergencyCompressContext({
          messages,
          stageSummaries: stageSummaries ?? [],
          usageRatio,
          maxContextTokens: maxContextTokens ?? 128000,
          chatModelSelection: params.chatModelSelection,
          abortSignal: params.abortSignal,
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
const EMERGENCY_COMPRESSION_PROMPT = `你是一个对话阶段摘要生成器。根据以下对话片段，生成该片段的阶段摘要。

规则：
1. 只总结用户消息和助手最终回答中的实质内容
2. 不得包含工具调用结果、tool_start、tool_result、workbenchEvents、debug trace、工具返回正文、内部路径
3. summary 必须 150-1500 字，非空
4. startTurnIndex 必须等于本片段的第一轮轮次
5. endTurnIndex 必须等于本片段的最后一轮轮次
6. 不能覆盖当前用户消息、loading/error/incomplete 的助手消息
7. 输出严格为 JSON

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

interface EmergencyChunk {
  turns: EmergencyTurnInput[];
  startTurnIndex: number;
  endTurnIndex: number;
}

const EMERGENCY_INPUT_SAFE_BUDGET_RATIO = 0.3;
const EMERGENCY_INPUT_MIN_SAFE_CHARS = 4000;
const EMERGENCY_INPUT_MAX_SAFE_CHARS = 12000;

function computeEmergencyInputSafeBudget(maxContextTokens: number): number {
  const fromTokens = Math.floor(maxContextTokens * EMERGENCY_INPUT_SAFE_BUDGET_RATIO);
  return Math.max(EMERGENCY_INPUT_MIN_SAFE_CHARS, Math.min(fromTokens, EMERGENCY_INPUT_MAX_SAFE_CHARS));
}

function buildChunkPrompt(
  chunk: EmergencyChunk,
  stageSummaries: ConversationStageSummary[],
  completedTurnCount: number,
  chunkIndex: number,
  totalChunks: number,
): string {
  const existingBoundaryInfo = stageSummaries.length > 0
    ? `已有阶段摘要边界：${stageSummaries.map((s) => `阶段${s.index}(轮次${s.startTurnIndex}-${s.endTurnIndex})`).join(", ")}\n`
    : "";

  const chunkInfo = totalChunks > 1
    ? `【分块 ${chunkIndex + 1}/${totalChunks}】本片段轮次范围：第 ${chunk.startTurnIndex}-${chunk.endTurnIndex} 轮\n`
    : "";

  return EMERGENCY_COMPRESSION_PROMPT +
    existingBoundaryInfo +
    chunkInfo +
    `已完成轮次总数：${completedTurnCount}\n` +
    `本片段轮次范围：第 ${chunk.startTurnIndex}-${chunk.endTurnIndex} 轮\n` +
    "对话片段：\n" +
    JSON.stringify(chunk.turns, null, 2);
}

function truncateSingleTurn(
  turn: EmergencyTurnInput,
  safeBudget: number,
  stageSummaries: ConversationStageSummary[],
  completedTurnCount: number,
): { turn: EmergencyTurnInput; error?: string } {
  const MAX_SINGLE_TURN_RATIO = 0.35;

  const truncated: EmergencyTurnInput = { ...turn };

  if (turn.userText.length > 0) {
    const keepChars = Math.max(80, Math.floor(turn.userText.length * MAX_SINGLE_TURN_RATIO));
    const head = turn.userText.slice(0, keepChars);
    const tail = turn.userText.slice(-keepChars);
    truncated.userText = head + "\n[单轮内容过长，中间省略]\n" + tail;
  }

  if (turn.assistantFinalAnswer.length > 0) {
    const keepChars = Math.max(80, Math.floor(turn.assistantFinalAnswer.length * MAX_SINGLE_TURN_RATIO));
    const head = turn.assistantFinalAnswer.slice(0, keepChars);
    const tail = turn.assistantFinalAnswer.slice(-keepChars);
    truncated.assistantFinalAnswer = head + "\n[单轮内容过长，中间省略]\n" + tail;
  }

  // Test truncated length
  const testChunk: EmergencyChunk = {
    turns: [truncated],
    startTurnIndex: turn.turnIndex,
    endTurnIndex: turn.turnIndex,
  };
  const testPrompt = buildChunkPrompt(testChunk, stageSummaries, completedTurnCount, 0, 1);

  if (testPrompt.length <= safeBudget) {
    return { turn: truncated };
  }

  // Further aggressive truncation
  const MIN_KEEP_CHARS = 40;
  truncated.userText = turn.userText.slice(0, MIN_KEEP_CHARS) + "\n[单轮内容过长，中间省略]\n" + turn.userText.slice(-MIN_KEEP_CHARS);
  truncated.assistantFinalAnswer = turn.assistantFinalAnswer.slice(0, MIN_KEEP_CHARS) + "\n[单轮内容过长，中间省略]\n" + turn.assistantFinalAnswer.slice(-MIN_KEEP_CHARS);

  const testPrompt2 = buildChunkPrompt(testChunk, stageSummaries, completedTurnCount, 0, 1);
  if (testPrompt2.length <= safeBudget) {
    return { turn: truncated };
  }

  return { turn, error: `单轮内容（轮次 ${turn.turnIndex}）过长，即使截断后仍超过安全预算。建议开启新对话。` };
}

function splitTurnsIntoChunks(
  turns: EmergencyTurnInput[],
  safeBudget: number,
  stageSummaries: ConversationStageSummary[],
  completedTurnCount: number,
): { chunks: EmergencyChunk[]; error?: string } {
  if (turns.length === 0) {
    return { chunks: [], error: "没有需要紧急压缩的轮次" };
  }

  // First, handle single-turn truncation for oversized turns
  const processedTurns: EmergencyTurnInput[] = [];
  for (const turn of turns) {
    const testChunk: EmergencyChunk = {
      turns: [turn],
      startTurnIndex: turn.turnIndex,
      endTurnIndex: turn.turnIndex,
    };
    const testPrompt = buildChunkPrompt(testChunk, stageSummaries, completedTurnCount, 0, 1);
    if (testPrompt.length <= safeBudget) {
      processedTurns.push(turn);
      continue;
    }

    const truncated = truncateSingleTurn(turn, safeBudget, stageSummaries, completedTurnCount);
    if (truncated.error) {
      return { chunks: [], error: truncated.error };
    }
    processedTurns.push(truncated.turn);
  }

  // Greedy chunking: accumulate turns until prompt would exceed budget
  const chunks: EmergencyChunk[] = [];
  let currentTurns: EmergencyTurnInput[] = [];

  for (let i = 0; i < processedTurns.length; i++) {
    const testTurns = [...currentTurns, processedTurns[i]];
    const testChunk: EmergencyChunk = {
      turns: testTurns,
      startTurnIndex: testTurns[0].turnIndex,
      endTurnIndex: testTurns[testTurns.length - 1].turnIndex,
    };
    const testPrompt = buildChunkPrompt(testChunk, stageSummaries, completedTurnCount, 0, 1);

    if (testPrompt.length <= safeBudget) {
      currentTurns.push(processedTurns[i]);
    } else {
      // Current chunk is full
      if (currentTurns.length > 0) {
        chunks.push({
          turns: currentTurns,
          startTurnIndex: currentTurns[0].turnIndex,
          endTurnIndex: currentTurns[currentTurns.length - 1].turnIndex,
        });
      }

      // Start new chunk with current turn
      currentTurns = [processedTurns[i]];
      const singlePrompt = buildChunkPrompt({
        turns: currentTurns,
        startTurnIndex: currentTurns[0].turnIndex,
        endTurnIndex: currentTurns[0].turnIndex,
      }, stageSummaries, completedTurnCount, 0, 1);

      if (singlePrompt.length > safeBudget) {
        // Should not happen since we already truncated single turns
        return { chunks: [], error: `轮次 ${processedTurns[i].turnIndex} 即使单独成块仍超过安全预算。建议开启新对话。` };
      }
    }
  }

  if (currentTurns.length > 0) {
    chunks.push({
      turns: currentTurns,
      startTurnIndex: currentTurns[0].turnIndex,
      endTurnIndex: currentTurns[currentTurns.length - 1].turnIndex,
    });
  }

  return { chunks, error: undefined };
}

function collectEmergencyTurns(
  messages: ChatMessage[],
  stageSummaries: ConversationStageSummary[],
): { turns: EmergencyTurnInput[]; completedTurnCount: number } {
  const completeTurns = getCompleteConversationTurns(messages);
  const lastSummarizedTurnIndex = stageSummaries.length > 0
    ? Math.max(...stageSummaries.map((s) => s.endTurnIndex))
    : 0;

  const turns: EmergencyTurnInput[] = [];
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

    turns.push({
      turnIndex: turn.turnIndex,
      userMessageId: turn.user.id,
      userText: turn.user.content ?? "",
      assistantMessageId: turn.assistant.id,
      assistantFinalAnswer: turn.assistant.content ?? "",
      ...(groundedRefs?.length ? { groundedReferences: groundedRefs } : {}),
    });
  }

  return { turns, completedTurnCount: completeTurns.length };
}

function validateEmergencyOutput(
  output: EmergencyCompressionOutput,
  completedTurnCount: number,
  lastSummarizedTurnIndex: number,
  chunk?: EmergencyChunk,
): { valid: boolean; error?: string } {
  if (!output.stageSummaries || !Array.isArray(output.stageSummaries)) {
    return { valid: false, error: "stageSummaries 不是数组" };
  }
  if (output.stageSummaries.length === 0) {
    return { valid: false, error: "stageSummaries 为空" };
  }

  // When chunk is provided, expect exactly 1 stageSummary covering the chunk range
  if (chunk) {
    if (output.stageSummaries.length !== 1) {
      return { valid: false, error: `每个 chunk 应只输出 1 个 stageSummary，实际输出 ${output.stageSummaries.length} 个` };
    }
    const entry = output.stageSummaries[0];
    if (entry.startTurnIndex !== chunk.startTurnIndex) {
      return { valid: false, error: `chunk startTurnIndex 不匹配: 期望 ${chunk.startTurnIndex}，实际 ${entry.startTurnIndex}` };
    }
    if (entry.endTurnIndex !== chunk.endTurnIndex) {
      return { valid: false, error: `chunk endTurnIndex 不匹配: 期望 ${chunk.endTurnIndex}，实际 ${entry.endTurnIndex}` };
    }
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
    // In chunk mode, skip global contiguity check; cross-chunk validation handles continuity
    if (!chunk && entry.startTurnIndex !== prevEndTurnIndex + 1) {
      return { valid: false, error: `阶段 ${i} startTurnIndex(${entry.startTurnIndex}) 必须等于上一阶段 endTurnIndex + 1(${prevEndTurnIndex + 1})` };
    }
    if (entry.endTurnIndex > completedTurnCount) {
      return { valid: false, error: `阶段 ${i} endTurnIndex(${entry.endTurnIndex}) 超过已完成轮次(${completedTurnCount})` };
    }
    if (entry.startTurnIndex < 1) {
      return { valid: false, error: `阶段 ${i} startTurnIndex(${entry.startTurnIndex}) 必须 >= 1` };
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
  /** 当前选中的模型 */
  chatModelSelection?: ChatModelSelection;
  /** 中断信号 */
  abortSignal?: AbortSignal;
}

export interface EmergencyCompressResult {
  success: boolean;
  newStageSummaries?: ConversationStageSummary[];
  error?: string;
}

export async function emergencyCompressContext(
  params: EmergencyCompressParams,
): Promise<EmergencyCompressResult> {
  const { messages, stageSummaries, usageRatio, maxContextTokens, chatModelSelection, abortSignal } = params;

  if (abortSignal?.aborted) {
    pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_ABORTED", {
      usageRatioPct: Math.round(usageRatio * 100),
      reason: "pre_start",
    }, "warn");
    return { success: false, error: "紧急压缩已中断" };
  }

  pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_STARTED", {
    usageRatioPct: Math.round(usageRatio * 100),
    maxContextTokens,
    existingStageSummaryCount: stageSummaries.length,
  }, "warn");

  try {
    const { turns, completedTurnCount } = collectEmergencyTurns(messages, stageSummaries);

    if (turns.length === 0) {
      pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
        error: "没有需要紧急压缩的未覆盖轮次",
        usageRatioPct: Math.round(usageRatio * 100),
      }, "warn");
      return { success: false, error: "没有需要紧急压缩的未覆盖轮次" };
    }

    const safeBudget = computeEmergencyInputSafeBudget(maxContextTokens);
    const chunkResult = splitTurnsIntoChunks(turns, safeBudget, stageSummaries, completedTurnCount);
    if (chunkResult.error) {
      pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
        error: chunkResult.error,
        usageRatioPct: Math.round(usageRatio * 100),
      }, "warn");
      return { success: false, error: chunkResult.error };
    }

    const chunks = chunkResult.chunks;
    const lastSummarizedTurnIndex = stageSummaries.length > 0
      ? Math.max(...stageSummaries.map((s) => s.endTurnIndex))
      : 0;
    const existingMaxIndex = stageSummaries.length > 0
      ? Math.max(...stageSummaries.map((s) => s.index))
      : 0;
    const allTurns = getCompleteConversationTurns(messages);

    const allNewStageSummaries: ConversationStageSummary[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (abortSignal?.aborted) {
        pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_ABORTED", {
          usageRatioPct: Math.round(usageRatio * 100),
          reason: "chunk_loop",
        }, "warn");
        return { success: false, error: "紧急压缩已中断" };
      }

      const chunk = chunks[i];
      const prompt = buildChunkPrompt(chunk, stageSummaries, completedTurnCount, i, chunks.length);

      pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_CHUNK", {
        chunkIndex: i,
        totalChunks: chunks.length,
        chunkTurnCount: chunk.turns.length,
        chunkStartTurn: chunk.startTurnIndex,
        chunkEndTurn: chunk.endTurnIndex,
        promptLength: prompt.length,
      }, "info");

      const rawText = await callModelText(prompt, "off", {
        temperature: 0.3,
        maxOutputTokens: 2000,
        chatModelSelection: chatModelSelection ?? undefined,
        abortSignal: abortSignal ?? undefined,
        purpose: "generic",
      });

      // JSON 提取（兼容 markdown 代码块）
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const cleanText = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
      const llmOutput = JSON.parse(cleanText) as EmergencyCompressionOutput;

      const validation = validateEmergencyOutput(llmOutput, completedTurnCount, lastSummarizedTurnIndex, chunk);
      if (!validation.valid) {
        pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
          error: validation.error,
          chunkIndex: i,
          usageRatioPct: Math.round(usageRatio * 100),
        }, "error");
        return { success: false, error: `紧急压缩校验失败: ${validation.error}` };
      }

      // Process the single stageSummary from this chunk
      const entry = llmOutput.stageSummaries[0];
      const endTurn = allTurns.find((t) => t.turnIndex === entry.endTurnIndex);
      if (!endTurn) {
        pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
          error: `chunk ${i} 找不到 endTurnIndex(${entry.endTurnIndex}) 对应的已完成轮次`,
          usageRatioPct: Math.round(usageRatio * 100),
        }, "error");
        return { success: false, error: `紧急压缩校验失败: chunk ${i} 找不到 endTurnIndex(${entry.endTurnIndex}) 对应的轮次` };
      }

      const prevTurn = entry.startTurnIndex > 1
        ? allTurns.find((t) => t.turnIndex === entry.startTurnIndex - 1)
        : undefined;
      const summaryText = sanitizePersistedSummaryText(entry.summary.trim(), 6000) ?? entry.summary.trim();

      allNewStageSummaries.push({
        id: `emergency-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        index: existingMaxIndex + allNewStageSummaries.length + 1,
        summary: summaryText,
        startTurnIndex: entry.startTurnIndex,
        endTurnIndex: entry.endTurnIndex,
        ...(prevTurn ? { startAfterAssistantMessageId: prevTurn.assistant.id } : {}),
        endUserMessageId: endTurn.user.id,
        endAssistantMessageId: endTurn.assistant.id,
        createdAt: Date.now(),
        source: "emergency_llm_stage_summary" as const,
        summaryChars: summaryText.length,
      });
    }

    // Cross-chunk continuity validation
    for (let i = 1; i < allNewStageSummaries.length; i++) {
      const prev = allNewStageSummaries[i - 1];
      const curr = allNewStageSummaries[i];
      if (curr.startTurnIndex !== prev.endTurnIndex + 1) {
        pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
          error: `chunk 间不连续: 阶段 ${curr.index} startTurnIndex(${curr.startTurnIndex}) ≠ 阶段 ${prev.index} endTurnIndex + 1(${prev.endTurnIndex + 1})`,
          usageRatioPct: Math.round(usageRatio * 100),
        }, "error");
        return { success: false, error: `紧急压缩校验失败: chunk 间不连续` };
      }
    }

    pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_SUCCEEDED", {
      newStageSummaryCount: allNewStageSummaries.length,
      chunkCount: chunks.length,
      usageRatioPct: Math.round(usageRatio * 100),
    }, "info");

    return { success: true, newStageSummaries: allNewStageSummaries };
  } catch (err) {
    if (abortSignal?.aborted) {
      pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_ABORTED", {
        usageRatioPct: Math.round(usageRatio * 100),
        reason: "exception",
      }, "warn");
      return { success: false, error: "紧急压缩已中断" };
    }
    pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_FAILED", {
      error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      usageRatioPct: Math.round(usageRatio * 100),
    }, "error");
    return { success: false, error: "紧急压缩 LLM 调用失败" };
  }
}
