export interface AgentRunIdentity {
  sessionId: string;
  runId: string;
  correlationId: string;
  startedAt: number;
}

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
}

let fallbackIdSequence = 0;

function createRuntimeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  fallbackIdSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackIdSequence.toString(36)}`;
}

export function createAgentRunIdentity(params: {
  sessionId: string;
  runId?: string;
  correlationId?: string;
  startedAt?: number;
}): AgentRunIdentity {
  const sessionId = params.sessionId.trim();
  if (!sessionId) throw new Error("Agent sessionId 不能为空。");
  const runId = params.runId?.trim() || createRuntimeId("run");
  return Object.freeze({
    sessionId,
    runId,
    correlationId: params.correlationId?.trim() || runId,
    startedAt: params.startedAt ?? Date.now(),
  });
}

export function createAgentEventId(runId: string, ordinal: number): string {
  return `${runId}:event:${ordinal}`;
}

