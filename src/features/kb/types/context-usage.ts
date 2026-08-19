/**
 * Prompt budget and context usage.
 *
 * The budget is calculated from the prompt pieces that are actually about to
 * be sent. The character/token conversion is intentionally conservative: the
 * provider tokenizer is not available in the browser runtime.
 */

import type { ChatMessage } from "./chat";
import type { ContextCompactionSnapshot } from "./context-compaction";

export type ContextUsageLevel = "normal" | "warn" | "critical";
export type ContextUsageMaxContextSource = "model_config" | "default";

export const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
/** Shared runtime observation ceiling; the resolved budget is model-size dependent. */
export const RUNTIME_TOOL_RESULT_MAX_TOKENS = 24_000;
export const RUNTIME_TOOL_RESULT_MIN_TOKENS = 4_096;
export const RUNTIME_TOOL_RESULT_MAX_CHARS = 18_000;
const IDLE_PROVIDER_RESERVE_MIN_TOKENS = 4_096;
const IDLE_PROVIDER_RESERVE_MAX_TOKENS = 16_000;
export const PROMPT_SAFETY_MARGIN_RATIO = 0.05;
export const PROMPT_SOFT_THRESHOLD_RATIO = 0.72;
export const PROMPT_HARD_THRESHOLD_RATIO = 0.88;
export const PROMPT_TARGET_RATIO = 0.5;

/**
 * Provider tokenizers are not available in the browser runtime. This is a
 * deliberately high estimate: ASCII/Latin text is counted at 3.5 chars per
 * token, CJK code points at 1.1 tokens, and emoji/other non-ASCII symbols at
 * 2 tokens. It is used for guards, not billing.
 */
export function estimateTextTokensConservative(value: string): number {
  let tokens = 0;
  let asciiRun = 0;
  const flushAscii = (): void => {
    if (asciiRun > 0) {
      tokens += Math.ceil(asciiRun / 3.5);
      asciiRun = 0;
    }
  };
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      asciiRun += 1;
      continue;
    }
    flushAscii();
    if (
      (codePoint >= 0x3400 && codePoint <= 0x9fff)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
      || (codePoint >= 0x3040 && codePoint <= 0x30ff)
      || (codePoint >= 0xac00 && codePoint <= 0xd7af)
    ) {
      tokens += 1.1;
    } else {
      tokens += 2;
    }
  }
  flushAscii();
  return Math.max(0, Math.ceil(tokens));
}

function normalizeContextWindowTokens(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? Math.floor(value!)
    : DEFAULT_MAX_CONTEXT_TOKENS;
}

/** Resolve the maximum observation that the next Agent tool call may add. */
export function resolveRuntimeObservationBudget(contextWindowTokens?: number): number {
  const contextWindow = normalizeContextWindowTokens(contextWindowTokens);
  return Math.min(
    contextWindow,
    RUNTIME_TOOL_RESULT_MAX_TOKENS,
    Math.max(RUNTIME_TOOL_RESULT_MIN_TOKENS, Math.floor(contextWindow * 0.125)),
  );
}

/** Conservative idle estimate for provider-fixed prompt parts not yet assembled. */
export function resolveIdleProviderReserve(contextWindowTokens?: number): number {
  const contextWindow = normalizeContextWindowTokens(contextWindowTokens);
  return Math.min(
    contextWindow,
    IDLE_PROVIDER_RESERVE_MAX_TOKENS,
    Math.max(IDLE_PROVIDER_RESERVE_MIN_TOKENS, Math.floor(contextWindow * 0.1)),
  );
}

export const DEFAULT_NEXT_TOOL_RESULT_HEADROOM_TOKENS =
  resolveRuntimeObservationBudget(DEFAULT_MAX_CONTEXT_TOKENS);
/** Used when the idle UI cannot construct the current provider's dynamic prompt. */
export const DEFAULT_PROVIDER_STATIC_RESERVE_TOKENS =
  resolveIdleProviderReserve(DEFAULT_MAX_CONTEXT_TOKENS);

export function estimateValueTokens(value: unknown): number {
  if (typeof value === "string") return estimateTextTokensConservative(value);
  if (value == null) return 0;
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    return 0;
  }
  return estimateTextTokensConservative(serialized);
}

export function estimateAgentMessagesTokens(value: unknown): number {
  if (!Array.isArray(value)) return estimateValueTokens(value);
  return value.reduce((total, message) => {
    const record = message && typeof message === "object"
      ? message as Record<string, unknown>
      : {};
    const role = typeof record.role === "string" ? record.role : "unknown";
    const content = typeof record.content === "string" ? record.content : "";
    const toolCalls = record.toolCalls;
    return total
      + 4
      + estimateTextTokensConservative(role)
      + estimateTextTokensConservative(content)
      + (toolCalls ? estimateValueTokens(toolCalls) + 8 : 0)
      + (typeof record.name === "string" ? estimateTextTokensConservative(record.name) + 2 : 0);
  }, 0);
}

export interface PromptBudgetBreakdown {
  systemPrompt: number;
  contextInstructions: number;
  globalMemory: number;
  compactionSnapshot: number;
  recentConversation: number;
  currentQuestion: number;
  activeToolDefinitions: number;
  /** Provider prompt categories used to distinguish reducible history from fixed pressure. */
  fixedPromptTokens: number;
  conversationTokens: number;
  toolDefinitionTokens: number;
  currentUserTokens: number;
  runtimeObservationTokens: number;
  recoveryInstruction: number;
  runtimeContext: number;
  providerMessages: number;
  providerTools: number;
  providerStaticReserve: number;
  nextToolResultHeadroom: number;
  safetyMargin: number;
}

export interface PromptBudget {
  contextWindowTokens: number;
  maxOutputTokens: number;
  nextToolResultHeadroomTokens: number;
  safetyMarginTokens: number;
  effectiveInputBudget: number;
  inputTokens: number;
  usageRatio: number;
  softThresholdTokens: number;
  hardThresholdTokens: number;
  targetInputTokens: number;
  breakdown: PromptBudgetBreakdown;
}

export interface PromptBudgetInput {
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  nextToolResultHeadroomTokens?: number;
  systemPrompt?: string;
  contextInstructions?: string;
  globalMemory?: string;
  compactionSnapshot?: ContextCompactionSnapshot | unknown;
  recentConversation?: ChatMessage[] | unknown;
  currentQuestion?: string;
  activeToolDefinitions?: unknown;
  recoveryInstruction?: string;
  runtimeContext?: unknown;
  /** Exact provider payload. When present, message components are not summed again. */
  providerMessages?: unknown;
  /** Exact provider tool definitions accompanying providerMessages. */
  providerTools?: unknown;
  /** Conservative reserve for idle UI when the dynamic provider components are unavailable. */
  providerStaticReserveTokens?: number;
  /** True role-bearing historical messages, not JSON embedded in a system prompt. */
  historicalMessages?: unknown;
  /** Current-run messages (current user, recovery and transient instructions). */
  currentRunMessages?: unknown;
}

export interface ContextUsageBreakdown {
  conversationMessages: number;
  attachedDocsMeta: number;
  runtimeReferences: number;
  agentTraceExcluded: number;
  finalPromptEstimate: number;
  prompt?: PromptBudgetBreakdown;
}

export type ContextUsageEstimateKind = "full_provider_prompt" | "conversation_context";

export interface ContextUsageSnapshot {
  usedChars: number;
  estimatedTokens: number;
  maxContextTokens: number;
  maxContextSource: ContextUsageMaxContextSource;
  usageRatio: number;
  unclampedRatioPct: number;
  level: ContextUsageLevel;
  estimateKind: ContextUsageEstimateKind;
  breakdown: ContextUsageBreakdown;
  budget?: PromptBudget;
  compactionCoverageTurnIndex?: number;
  lastCompactedAt?: number;
  snapshotEstimatedTokens?: number;
  uncoveredCompletedTurnCount?: number;
  compactableTurnCount?: number;
}

export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 3.5);
}

function resolveLevel(ratio: number): ContextUsageLevel {
  if (ratio >= PROMPT_HARD_THRESHOLD_RATIO) return "critical";
  if (ratio >= PROMPT_SOFT_THRESHOLD_RATIO) return "warn";
  return "normal";
}

export function buildPromptBudget(input: PromptBudgetInput): PromptBudget {
  const contextWindowTokens = input.contextWindowTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  const maxOutputTokens = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const nextToolResultHeadroomTokens =
    input.nextToolResultHeadroomTokens ?? resolveRuntimeObservationBudget(contextWindowTokens);
  const safetyMarginTokens = Math.max(256, Math.ceil(contextWindowTokens * PROMPT_SAFETY_MARGIN_RATIO));
  const effectiveInputBudget = Math.max(
    1,
    contextWindowTokens - maxOutputTokens - nextToolResultHeadroomTokens - safetyMarginTokens,
  );
  const historicalMessages = input.historicalMessages ?? input.recentConversation;
  const currentRunMessages = input.currentRunMessages ?? (
    input.currentQuestion ? [{ role: "user", content: input.currentQuestion }] : undefined
  );
  const exactMessages = input.providerMessages ?? [
    ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
    ...(input.contextInstructions ? [{ role: "system", content: input.contextInstructions }] : []),
    ...(!input.contextInstructions && input.compactionSnapshot
      ? [{ role: "system", content: JSON.stringify({ compactionSnapshot: input.compactionSnapshot }) }]
      : []),
    ...(Array.isArray(historicalMessages) ? historicalMessages : []),
    ...(Array.isArray(currentRunMessages) ? currentRunMessages : []),
    ...(input.recoveryInstruction ? [{ role: "system", content: input.recoveryInstruction }] : []),
  ];
  const providerMessages = estimateAgentMessagesTokens(exactMessages);
  const rawProviderTools = input.providerTools ?? input.activeToolDefinitions;
  const providerTools = Array.isArray(rawProviderTools) && rawProviderTools.length === 0
    ? 0
    : estimateValueTokens(rawProviderTools);
  const providerStaticReserve = input.providerMessages !== undefined
    ? 0
    : Math.max(0, Math.ceil(input.providerStaticReserveTokens ?? 0));
  const conversationMessages = Array.isArray(historicalMessages) ? historicalMessages : [];
  const currentMessages = Array.isArray(currentRunMessages) ? currentRunMessages : [];
  const conversationTokens = estimateAgentMessagesTokens(conversationMessages);
  const currentUserTokens = estimateAgentMessagesTokens(currentMessages);
  const runtimeObservationTokens = [...conversationMessages, ...currentMessages].reduce((total, message) => {
    const record = message && typeof message === "object" ? message as Record<string, unknown> : {};
    return total + (record.role === "tool" ? estimateAgentMessagesTokens([message]) : 0);
  }, 0);
  const fixedPromptTokens = Math.max(
    0,
    estimateValueTokens(input.systemPrompt)
      + estimateValueTokens(input.contextInstructions)
      + estimateValueTokens(input.globalMemory)
      + estimateValueTokens(input.recoveryInstruction)
      + estimateValueTokens(input.runtimeContext)
      + providerTools
      + providerStaticReserve
      + safetyMarginTokens,
  );
  const breakdown: PromptBudgetBreakdown = {
    systemPrompt: estimateValueTokens(input.systemPrompt),
    contextInstructions: estimateValueTokens(input.contextInstructions),
    globalMemory: estimateValueTokens(input.globalMemory),
    compactionSnapshot: estimateValueTokens(input.compactionSnapshot),
    recentConversation: estimateValueTokens(input.historicalMessages ?? input.recentConversation),
    currentQuestion: estimateValueTokens(input.currentQuestion),
    activeToolDefinitions: providerTools,
    fixedPromptTokens,
    conversationTokens,
    toolDefinitionTokens: providerTools,
    currentUserTokens,
    runtimeObservationTokens,
    recoveryInstruction: estimateValueTokens(input.recoveryInstruction),
    runtimeContext: estimateValueTokens(input.runtimeContext),
    providerMessages,
    providerTools,
    providerStaticReserve,
    nextToolResultHeadroom: nextToolResultHeadroomTokens,
    safetyMargin: safetyMarginTokens,
  };
  const inputTokens = providerMessages + providerTools + providerStaticReserve;
  return {
    contextWindowTokens,
    maxOutputTokens,
    nextToolResultHeadroomTokens,
    safetyMarginTokens,
    effectiveInputBudget,
    inputTokens,
    usageRatio: inputTokens / effectiveInputBudget,
    softThresholdTokens: Math.floor(effectiveInputBudget * PROMPT_SOFT_THRESHOLD_RATIO),
    hardThresholdTokens: Math.floor(effectiveInputBudget * PROMPT_HARD_THRESHOLD_RATIO),
    targetInputTokens: Math.floor(effectiveInputBudget * PROMPT_TARGET_RATIO),
    breakdown,
  };
}

export interface EstimateContextUsageParams {
  messages: ChatMessage[];
  attachedDocCount: number;
  runtimeReferenceDocCount?: number;
  contextWindowTokens?: number;
  compactionSnapshot?: ContextCompactionSnapshot;
  currentQuestion?: string;
  systemPrompt?: string;
  contextInstructions?: string;
  globalMemory?: string;
  activeToolDefinitions?: unknown;
  recoveryInstruction?: string;
  runtimeContext?: unknown;
  providerMessages?: unknown;
  historicalMessages?: unknown;
  currentRunMessages?: unknown;
  providerTools?: unknown;
  providerStaticReserveTokens?: number;
  estimateKind?: ContextUsageEstimateKind;
}

export function estimateContextUsage(params: EstimateContextUsageParams): ContextUsageSnapshot {
  const budget = buildPromptBudget({
    contextWindowTokens: params.contextWindowTokens,
    recentConversation: params.messages,
    currentQuestion: params.currentQuestion,
    systemPrompt: params.systemPrompt,
    contextInstructions: params.contextInstructions,
    globalMemory: params.globalMemory,
    compactionSnapshot: params.compactionSnapshot,
    activeToolDefinitions: params.activeToolDefinitions,
    recoveryInstruction: params.recoveryInstruction,
    runtimeContext: params.runtimeContext,
    providerMessages: params.providerMessages,
    historicalMessages: params.historicalMessages,
    currentRunMessages: params.currentRunMessages,
    providerTools: params.providerTools,
    providerStaticReserveTokens: params.providerStaticReserveTokens,
  });
  const conversationMessages = budget.breakdown.recentConversation;
  const attachedDocsMeta = Math.max(0, params.attachedDocCount) * 80;
  const runtimeReferences = Math.max(0, params.runtimeReferenceDocCount ?? 0) * 120;
  const finalPromptEstimate = budget.inputTokens;
  const usedChars = Math.ceil(budget.inputTokens * 3.5);
  const rawRatio = budget.usageRatio;
  const snapshot = params.compactionSnapshot;
  return {
    usedChars,
    estimatedTokens: budget.inputTokens,
    maxContextTokens: budget.contextWindowTokens,
    maxContextSource: params.contextWindowTokens ? "model_config" : "default",
    usageRatio: Math.min(rawRatio, 1),
    unclampedRatioPct: Math.round(rawRatio * 100),
    level: resolveLevel(rawRatio),
    estimateKind: params.estimateKind
      ?? (params.providerMessages !== undefined && params.providerTools !== undefined
        ? "full_provider_prompt"
        : "conversation_context"),
    breakdown: {
      conversationMessages,
      attachedDocsMeta,
      runtimeReferences,
      agentTraceExcluded: 0,
      finalPromptEstimate,
      prompt: budget.breakdown,
    },
    budget,
    ...(snapshot ? { compactionCoverageTurnIndex: snapshot.coveredThroughTurnIndex } : {}),
    ...(snapshot?.createdAt ? { lastCompactedAt: snapshot.createdAt } : {}),
    ...(snapshot?.estimatedTokens ? { snapshotEstimatedTokens: snapshot.estimatedTokens } : {}),
  };
}
