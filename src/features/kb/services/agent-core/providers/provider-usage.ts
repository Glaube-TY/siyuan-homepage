import type { AgentTokenUsage } from "../../../../agent-platform/agent-run-protocol";

function readNumber(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  }
  return 0;
}

function readNestedNumber(source: Record<string, unknown>, parent: string, ...keys: string[]): number {
  const value = source[parent];
  return value && typeof value === "object" && !Array.isArray(value)
    ? readNumber(value as Record<string, unknown>, ...keys)
    : 0;
}

export function normalizeProviderUsage(raw: unknown): AgentTokenUsage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const inputTokens = readNumber(source, "prompt_tokens", "input_tokens", "promptTokenCount");
  const outputTokens = readNumber(source, "completion_tokens", "output_tokens", "candidatesTokenCount");
  const reportedTotal = readNumber(source, "total_tokens", "totalTokenCount");
  const cachedInputTokens = readNumber(source, "cache_read_input_tokens", "cachedContentTokenCount")
    || readNestedNumber(source, "prompt_tokens_details", "cached_tokens");
  const reasoningTokens = readNumber(source, "thoughtsTokenCount")
    || readNestedNumber(source, "completion_tokens_details", "reasoning_tokens");
  if (inputTokens + outputTokens + reportedTotal + cachedInputTokens + reasoningTokens === 0) return undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens: reportedTotal || inputTokens + outputTokens,
    cachedInputTokens,
    reasoningTokens,
  };
}

export function mergeLatestAgentTokenUsage(
  current: AgentTokenUsage | undefined,
  next: AgentTokenUsage,
): AgentTokenUsage {
  if (!current) return { ...next };
  const inputTokens = Math.max(current.inputTokens, next.inputTokens);
  const outputTokens = Math.max(current.outputTokens, next.outputTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: Math.max(current.totalTokens, next.totalTokens, inputTokens + outputTokens),
    cachedInputTokens: Math.max(current.cachedInputTokens, next.cachedInputTokens),
    reasoningTokens: Math.max(current.reasoningTokens, next.reasoningTokens),
  };
}

export function addAgentTokenUsage(
  total: AgentTokenUsage | undefined,
  step: AgentTokenUsage,
): AgentTokenUsage {
  return {
    inputTokens: (total?.inputTokens ?? 0) + step.inputTokens,
    outputTokens: (total?.outputTokens ?? 0) + step.outputTokens,
    totalTokens: (total?.totalTokens ?? 0) + step.totalTokens,
    cachedInputTokens: (total?.cachedInputTokens ?? 0) + step.cachedInputTokens,
    reasoningTokens: (total?.reasoningTokens ?? 0) + step.reasoningTokens,
  };
}
