/**
 * Unified transcript compaction.
 *
 * Manual, automatic, and hard-threshold compaction differ only by trigger.
 * The transcript is never rewritten or marked as compacted; the snapshot is
 * a bounded, rebuildable projection of complete past turns.
 */

import type { ChatMessage } from "../types/chat";
import type {
  ContextCompactionSnapshot,
  ContextCompactionSnapshotState,
  ContextCompactionTrigger,
} from "../types/context-compaction";
import {
  EMPTY_CONTEXT_COMPACTION_STATE,
} from "../types/context-compaction";
import type { ChatModelSelection } from "../types/chat-model-selection";
import {
  estimateTextTokensConservative,
  estimateValueTokens,
  type PromptBudget,
} from "../types/context-usage";
import { callModelText } from "./qa/kb-model-call";
import { sanitizePersistedSummaryText } from "./session/persisted-summary-sanitizer";
import {
  getCompleteConversationTurns,
  type CompleteConversationTurn,
} from "./agent-workbench/runtime/conversation-turns";
import { pushAgentDebugEvent } from "./agent-workbench/debug/workbench-debug";

const DEFAULT_RECENT_TURN_COUNT = 6;
const HARD_RECENT_TURN_COUNT = 2;
const MIN_RECENT_TURN_COUNT = 2;
const MAX_STATE_ITEM_CHARS = 320;
const MAX_CURRENT_GOAL_CHARS = 500;
const MAX_STATE_ITEMS = 20;
const MAX_SNAPSHOT_CHARS = 24_000;
const COMPACTION_MAX_OUTPUT_TOKENS = 1_200;
const COMPACTION_SAFETY_MARGIN_RATIO = 0.05;
const COMPACTION_FIXED_PROMPT_OVERHEAD_TOKENS = 512;
const MIN_COMPACTION_BATCH_TARGET_TOKENS = 8_000;
const MAX_COMPACTION_BATCH_TARGET_TOKENS = 32_000;
const MAX_COMPACTION_STATE_TOKENS = 12_000;

export interface CompactionSelection {
  completeTurns: CompleteConversationTurn[];
  recentTurns: CompleteConversationTurn[];
  compactableTurns: CompleteConversationTurn[];
  previousSnapshotUsable: boolean;
}

export interface ContextCompactionParams {
  previousSnapshot?: ContextCompactionSnapshot;
  messages: ChatMessage[];
  currentUserMessageId?: string;
  promptBudget: PromptBudget;
  trigger: ContextCompactionTrigger;
  chatModelSelection?: ChatModelSelection | null;
  abortSignal?: AbortSignal;
}

export interface ContextCompactionResult {
  success: boolean;
  snapshot?: ContextCompactionSnapshot;
  compactedTurnIndices?: number[];
  fallbackUsed?: boolean;
  error?: string;
  reason?: "no_compactable_turns" | "irreducible_overflow";
}

function truncate(value: unknown, maxChars: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function safeString(value: unknown, maxChars: number): string | undefined {
  return sanitizePersistedSummaryText(value, maxChars);
}

function safeTurn(turn: CompleteConversationTurn): Record<string, unknown> {
  const user = turn.user;
  const assistant = turn.assistant;
  const memory = assistant.agentMemory;
  const trace = memory?.actionTraceSummary;
  const outcomes = trace?.outcomes?.slice(-8).map((outcome) => ({
    toolName: safeString(outcome.toolName, 100),
    ok: outcome.ok,
    readOnly: outcome.readOnly,
    writeOperation: outcome.writeOperation,
    summary: safeString(outcome.summary, 160),
    errorCode: safeString(outcome.errorCode, 80),
    targetDocIds: outcome.targetDocIds?.slice(0, 5),
    targetBlockIds: outcome.targetBlockIds?.slice(0, 5),
    targetTitles: outcome.targetTitles?.slice(0, 5).map((title) => safeString(title, 120)),
  }));
  return {
    turnIndex: turn.turnIndex,
    user: {
      question: safeString(user.content, 1_600),
      attachedDocs: user.attachedDocs?.slice(0, 8).map((doc) => ({
        docId: doc.docId,
        title: safeString(doc.title, 160),
      })),
    },
    assistant: {
      answer: safeString(assistant.content, 1_600),
      actions: trace
        ? {
            toolNames: trace.toolNames.slice(0, 20),
            outcomes,
            lastWriteStatus: trace.lastWriteStatus,
            lastWriteSummary: safeString(trace.lastWriteSummary, 160),
          }
        : undefined,
      references: memory?.footerReferenceDocIds?.slice(0, 8).map((docId, index) => ({
        docId,
        title: safeString(memory.footerReferenceTitles?.[index], 160),
        sourceType: safeString(memory.footerReferenceSourceTypes?.[index], 60),
        url: safeString(memory.footerReferenceUrls?.[index], 300),
      })),
    },
  };
}

/** Full transcript identity used for invalidation; never sent to the model. */
function hashableTurn(turn: CompleteConversationTurn): Record<string, unknown> {
  return {
    turnIndex: turn.turnIndex,
    user: {
      id: turn.user.id,
      createdAt: turn.user.createdAt,
      content: turn.user.content,
      attachedDocs: turn.user.attachedDocs,
      requestContext: turn.user.requestContext,
    },
    assistant: {
      id: turn.assistant.id,
      createdAt: turn.assistant.createdAt,
      content: turn.assistant.content,
      isComplete: turn.assistant.isComplete,
      agentMemory: turn.assistant.agentMemory,
      citedReferences: turn.assistant.citedReferences,
    },
  };
}

function snapshotState(value: unknown): ContextCompactionSnapshotState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const list = (key: keyof ContextCompactionSnapshotState): string[] => {
    const raw = source[key];
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw
      .map((item) => safeString(item, MAX_STATE_ITEM_CHARS))
      .filter((item): item is string => !!item))]
      .slice(0, MAX_STATE_ITEMS);
  };
  return {
    currentGoal: safeString(source.currentGoal, MAX_CURRENT_GOAL_CHARS) ?? "",
    userConstraints: list("userConstraints"),
    importantDecisions: list("importantDecisions"),
    completedWork: list("completedWork"),
    currentState: list("currentState"),
    unresolvedIssues: list("unresolvedIssues"),
    nextActions: list("nextActions"),
    importantReferences: list("importantReferences"),
    verifiedWriteOutcomes: list("verifiedWriteOutcomes"),
  };
}

function fitStateToBudget(state: ContextCompactionSnapshotState, promptBudget: PromptBudget): ContextCompactionSnapshotState {
  const providerInputBudget = compactionProviderInputBudget(promptBudget);
  const emptyPromptTokens = estimateCompactionPromptTokens(undefined, []);
  const stateBudget = Math.max(256, providerInputBudget - emptyPromptTokens - COMPACTION_FIXED_PROMPT_OVERHEAD_TOKENS);
  const maxChars = Math.min(
    MAX_SNAPSHOT_CHARS,
    Math.max(1_000, Math.floor(stateBudget * 3.5)),
  );
  const maxTokens = Math.min(MAX_COMPACTION_STATE_TOKENS, stateBudget);
  const result = snapshotState(state);
  // Low-value history is pruned first. Goal, constraints, unresolved issues
  // and verified writes are protected until every lower-priority list is empty.
  const listKeys: Array<keyof ContextCompactionSnapshotState> = [
    "completedWork",
    "currentState",
    "importantReferences",
    "nextActions",
    "importantDecisions",
    "unresolvedIssues",
    "verifiedWriteOutcomes",
    "userConstraints",
  ];
  while (estimateValueTokens(result) > maxTokens) {
    const key = listKeys.find((item) => result[item].length > 0 && (
      item !== "userConstraints" || result[item].length > 1
    ));
    if (!key) break;
    (result as unknown as Record<string, string | string[]>)[key] = result[key].slice(0, -1);
  }
  if (estimateValueTokens(result) > maxTokens) {
    result.currentGoal = truncate(result.currentGoal, Math.max(80, Math.floor(maxChars * 0.55)));
    while (estimateValueTokens(result) > maxTokens && result.currentGoal.length > 0) {
      result.currentGoal = truncate(result.currentGoal, Math.max(0, Math.floor(result.currentGoal.length * 0.75)));
    }
  }
  // Keep the snapshot itself compatible with the independent compaction
  // request. A state that cannot fit by itself must never make every later
  // turn look oversized.
  if (estimateCompactionPromptTokens(result, []) > providerInputBudget) {
    return { ...EMPTY_CONTEXT_COMPACTION_STATE };
  }
  return result;
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sourceHash(turns: readonly CompleteConversationTurn[], throughTurnIndex: number): string {
  return hashText(JSON.stringify(turns.filter((turn) => turn.turnIndex <= throughTurnIndex).map(hashableTurn)));
}

function usablePreviousSnapshot(
  snapshot: ContextCompactionSnapshot | undefined,
  turns: readonly CompleteConversationTurn[],
): boolean {
  if (!snapshot || snapshot.version !== 2 || snapshot.stale) return false;
  const covered = turns.find((turn) => turn.turnIndex === snapshot.coveredThroughTurnIndex);
  if (!covered || covered.assistant.id !== snapshot.coveredThroughMessageId) return false;
  return sourceHash(turns, snapshot.coveredThroughTurnIndex) === snapshot.sourceHash;
}

export function isCompactionSnapshotStale(
  snapshot: ContextCompactionSnapshot | undefined,
  messages: readonly ChatMessage[],
): boolean {
  if (!snapshot || snapshot.version !== 2 || snapshot.stale) return !!snapshot?.stale;
  const turns = getCompleteConversationTurns(messages);
  return !usablePreviousSnapshot(snapshot, turns);
}

export function markCompactionSnapshotStale(
  snapshot: ContextCompactionSnapshot | undefined,
): ContextCompactionSnapshot | undefined {
  return snapshot ? { ...snapshot, stale: true } : undefined;
}

export function selectCompactionTurns(params: Pick<ContextCompactionParams, "messages" | "currentUserMessageId" | "previousSnapshot" | "promptBudget" | "trigger">): CompactionSelection {
  const completeTurns = getCompleteConversationTurns(params.messages);
  const previousSnapshotUsable = usablePreviousSnapshot(params.previousSnapshot, completeTurns);
  const current = completeTurns.filter((turn) => turn.user.id !== params.currentUserMessageId);
  let recentCount = params.trigger === "hard" ? HARD_RECENT_TURN_COUNT : DEFAULT_RECENT_TURN_COUNT;
  while (recentCount > MIN_RECENT_TURN_COUNT && estimateValueTokens(current.slice(-recentCount).map(safeTurn)) > params.promptBudget.targetInputTokens) {
    recentCount -= 1;
  }
  const retainedRecentTurns = current.slice(-Math.max(MIN_RECENT_TURN_COUNT, recentCount));
  const coveredThrough = previousSnapshotUsable ? params.previousSnapshot!.coveredThroughTurnIndex : 0;
  const recentIds = new Set(retainedRecentTurns.map((turn) => turn.assistant.id));
  const compactableTurns = current.filter((turn) => (
    turn.turnIndex > coveredThrough && !recentIds.has(turn.assistant.id)
  ));
  return {
    completeTurns,
    recentTurns: retainedRecentTurns,
    compactableTurns,
    previousSnapshotUsable,
  };
}

function fallbackState(turns: readonly CompleteConversationTurn[]): ContextCompactionSnapshotState {
  const state: ContextCompactionSnapshotState = {
    currentGoal: EMPTY_CONTEXT_COMPACTION_STATE.currentGoal,
    userConstraints: [],
    importantDecisions: [],
    completedWork: [],
    currentState: [],
    unresolvedIssues: [],
    nextActions: [],
    importantReferences: [],
    verifiedWriteOutcomes: [],
  };
  const latest = turns[turns.length - 1];
  if (!latest) return state;
  state.currentGoal = safeString(latest.user.content, MAX_CURRENT_GOAL_CHARS) ?? "";
  for (const turn of turns) {
    const userText = safeString(turn.user.content, MAX_STATE_ITEM_CHARS);
    const assistantText = safeString(turn.assistant.content, MAX_STATE_ITEM_CHARS);
    if (userText) state.currentState.push(`用户目标：${userText}`);
    if (assistantText) state.currentState.push(`助手结论：${assistantText}`);
    const memory = turn.assistant.agentMemory;
    const trace = memory?.actionTraceSummary;
    if (trace?.lastWriteStatus && trace.lastWriteStatus !== "none") {
      const summary = safeString(trace.lastWriteSummary, MAX_STATE_ITEM_CHARS);
      state.verifiedWriteOutcomes.push(
        summary ? `${trace.lastWriteStatus}: ${summary}` : trace.lastWriteStatus,
      );
    }
    if (trace?.outcomes) {
      for (const outcome of trace.outcomes.slice(-4)) {
        const summary = safeString(outcome.summary, MAX_STATE_ITEM_CHARS);
        if (outcome.ok && summary) state.completedWork.push(summary);
        if (!outcome.ok && summary) state.unresolvedIssues.push(summary);
      }
    }
    for (const [index, docId] of (memory?.footerReferenceDocIds ?? []).slice(0, 4).entries()) {
      const title = safeString(memory?.footerReferenceTitles?.[index], 120);
      state.importantReferences.push(title ? `${title} (${docId})` : docId);
    }
  }
  return snapshotState(state);
}

function mergeFallbackState(
  previous: ContextCompactionSnapshotState | undefined,
  next: ContextCompactionSnapshotState,
): ContextCompactionSnapshotState {
  const base = previous ?? EMPTY_CONTEXT_COMPACTION_STATE;
  const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(-MAX_STATE_ITEMS);
  return {
    currentGoal: next.currentGoal || base.currentGoal,
    userConstraints: merge(base.userConstraints, next.userConstraints),
    importantDecisions: merge(base.importantDecisions, next.importantDecisions),
    completedWork: merge(base.completedWork, next.completedWork),
    currentState: merge(base.currentState, next.currentState),
    unresolvedIssues: merge(base.unresolvedIssues, next.unresolvedIssues),
    nextActions: merge(base.nextActions, next.nextActions),
    importantReferences: merge(base.importantReferences, next.importantReferences),
    verifiedWriteOutcomes: merge(base.verifiedWriteOutcomes, next.verifiedWriteOutcomes),
  };
}

function parseModelState(raw: string): ContextCompactionSnapshotState | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
    return snapshotState(parsed.state ?? parsed);
  } catch {
    return undefined;
  }
}

function buildCompactionPrompt(
  previous: ContextCompactionSnapshotState | undefined,
  turns: readonly CompleteConversationTurn[],
): string {
  const input = {
    previousState: previous ?? EMPTY_CONTEXT_COMPACTION_STATE,
    turns: turns.map(safeTurn),
  };
  return [
    "你是对话上下文整理器。仅根据给定的安全结构化输入输出 JSON，不要输出 Markdown。",
    "把 previousState 与新增完整对话合并为一个短小、可继续工作的状态。",
    "禁止写入工具返回正文、调试信息、推理过程、confirmationId、密钥、绝对路径或整篇文档内容。",
    "必须输出 state 对象，字段固定为 currentGoal、userConstraints、importantDecisions、completedWork、currentState、unresolvedIssues、nextActions、importantReferences、verifiedWriteOutcomes；数组只保留必要事实。",
    JSON.stringify(input),
  ].join("\n");
}

export function estimateCompactionPromptTokens(
  previous: ContextCompactionSnapshotState | undefined,
  turns: readonly CompleteConversationTurn[],
): number {
  return estimateTextTokensConservative(buildCompactionPrompt(previous, turns));
}

export function compactionProviderInputBudget(promptBudget: PromptBudget): number {
  const safetyMarginTokens = Math.max(
    256,
    Math.ceil(promptBudget.contextWindowTokens * COMPACTION_SAFETY_MARGIN_RATIO),
  );
  return Math.max(
    1,
    promptBudget.contextWindowTokens
      - COMPACTION_MAX_OUTPUT_TOKENS
      - safetyMarginTokens
      - COMPACTION_FIXED_PROMPT_OVERHEAD_TOKENS,
  );
}

function compactionBatchTarget(providerInputBudget: number): number {
  return Math.min(
    providerInputBudget,
    Math.max(
      MIN_COMPACTION_BATCH_TARGET_TOKENS,
      Math.min(MAX_COMPACTION_BATCH_TARGET_TOKENS, Math.floor(providerInputBudget * 0.25)),
    ),
  );
}

export interface NextCompactionBatch {
  batch: CompleteConversationTurn[];
  nextIndex: number;
  /** Full input budget available to this tool-free compaction provider call. */
  inputBudget: number;
  batchTargetTokens: number;
  oversizedTurn?: CompleteConversationTurn;
}

export function selectNextCompactionBatch(
  turns: readonly CompleteConversationTurn[],
  startIndex: number,
  previous: ContextCompactionSnapshotState | undefined,
  promptBudget: PromptBudget,
): NextCompactionBatch {
  const inputBudget = compactionProviderInputBudget(promptBudget);
  const batchTargetTokens = compactionBatchTarget(inputBudget);
  const batch: CompleteConversationTurn[] = [];
  for (let index = startIndex; index < turns.length; index += 1) {
    const candidate = [...batch, turns[index]];
    const candidateTokens = estimateCompactionPromptTokens(previous, candidate);
    if (candidateTokens > inputBudget) {
      if (batch.length === 0) {
        return {
          batch: [],
          nextIndex: index + 1,
          inputBudget,
          batchTargetTokens,
          oversizedTurn: turns[index],
        };
      }
      break;
    }
    // A normal first turn may use the full provider budget; subsequent turns
    // use the dynamic target so large histories are folded in batches.
    if (batch.length > 0 && candidateTokens > batchTargetTokens) break;
    batch.push(turns[index]);
  }
  return { batch, nextIndex: startIndex + batch.length, inputBudget, batchTargetTokens };
}

async function generateState(params: {
  turns: readonly CompleteConversationTurn[];
  previous?: ContextCompactionSnapshotState;
  chatModelSelection?: ChatModelSelection | null;
  abortSignal?: AbortSignal;
  maxInputTokens: number;
}): Promise<{ state?: ContextCompactionSnapshotState; fallbackUsed: boolean }> {
  const prompt = buildCompactionPrompt(params.previous, params.turns);
  // A single safe turn that cannot fit is handled deterministically by the
  // caller. Never send an over-budget compaction request to the provider.
  if (estimateTextTokensConservative(prompt) > params.maxInputTokens) {
    return { fallbackUsed: true };
  }
  try {
    const output = await callModelText(prompt, "off", {
      chatModelSelection: params.chatModelSelection,
      abortSignal: params.abortSignal,
      maxOutputTokens: COMPACTION_MAX_OUTPUT_TOKENS,
      temperature: 0.1,
      purpose: "generic",
    });
    const state = parseModelState(output);
    if (state) return { state, fallbackUsed: false };
  } catch (error) {
    pushAgentDebugEvent("CONTEXT_COMPACTION_PROVIDER_FALLBACK", {
      error: error instanceof Error ? error.message.slice(0, 120) : String(error),
    }, "warn");
  }
  return { fallbackUsed: true };
}

export async function runContextCompaction(
  params: ContextCompactionParams,
): Promise<ContextCompactionResult> {
  const selection = selectCompactionTurns(params);
  if (selection.compactableTurns.length === 0) {
    return {
      success: false,
      reason: "no_compactable_turns",
      error: "没有可压缩的完整历史轮次。",
    };
  }

  let previousState = selection.previousSnapshotUsable
    ? params.previousSnapshot?.state
    : undefined;
  let fallbackUsed = false;
  let cursor = 0;
  while (cursor < selection.compactableTurns.length) {
    previousState = fitStateToBudget(
      previousState ?? EMPTY_CONTEXT_COMPACTION_STATE,
      params.promptBudget,
    );
    const plan = selectNextCompactionBatch(
      selection.compactableTurns,
      cursor,
      previousState,
      params.promptBudget,
    );
    if (plan.batch.length === 0) {
      previousState = fitStateToBudget(
        mergeFallbackState(previousState, fallbackState([plan.oversizedTurn!])),
        params.promptBudget,
      );
      fallbackUsed = true;
      cursor = plan.nextIndex;
      continue;
    }
    const generated = await generateState({
      turns: plan.batch,
      previous: previousState,
      chatModelSelection: params.chatModelSelection,
      abortSignal: params.abortSignal,
      maxInputTokens: plan.inputBudget,
    });
    // A valid model result is authoritative. Only the deterministic fallback
    // folds the batch into the previous state because it has no semantic view.
    previousState = fitStateToBudget(
      generated.state ?? mergeFallbackState(previousState, fallbackState(plan.batch)),
      params.promptBudget,
    );
    fallbackUsed ||= generated.fallbackUsed;
    cursor = plan.nextIndex;
  }
  const finalState = fitStateToBudget(previousState ?? EMPTY_CONTEXT_COMPACTION_STATE, params.promptBudget);
  const last = selection.compactableTurns[selection.compactableTurns.length - 1];
  const snapshot: ContextCompactionSnapshot = {
    version: 2,
    generation: (selection.previousSnapshotUsable ? params.previousSnapshot?.generation ?? 0 : 0) + 1,
    createdAt: Date.now(),
    trigger: params.trigger,
    coveredThroughTurnIndex: last.turnIndex,
    coveredThroughMessageId: last.assistant.id,
    sourceHash: sourceHash(selection.completeTurns, last.turnIndex),
    state: finalState,
    estimatedTokens: estimateValueTokens(finalState),
  };
  pushAgentDebugEvent("CONTEXT_COMPACTION_SNAPSHOT_READY", {
    trigger: params.trigger,
    generation: snapshot.generation,
    coveredThroughTurnIndex: snapshot.coveredThroughTurnIndex,
    compactedTurnCount: selection.compactableTurns.length,
    fallbackUsed,
    estimatedTokens: snapshot.estimatedTokens,
  }, "info");
  return {
    success: true,
    snapshot,
    compactedTurnIndices: selection.compactableTurns.map((turn) => turn.turnIndex),
    fallbackUsed,
  };
}
