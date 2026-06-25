import type { AgentToolCall } from "../messages/agent-message";

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

/** Strip runtime-injected temporary fields (keys starting with _) before generating the guard key. */
function stripRuntimeFields(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!key.startsWith("_")) out[key] = value;
  }
  return out;
}

function buildGuardKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(stripRuntimeFields(args))}`;
}

export class StormBreaker {
  private readonly successfulWriteCalls = new Set<string>();
  private readonly readCallHistory = new Set<string>();

  shouldBlockWrite(toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    const key = buildGuardKey(toolCall.name, args);
    return this.successfulWriteCalls.has(key);
  }

  markWriteSuccess(toolCall: AgentToolCall, args: Record<string, unknown>): void {
    const key = buildGuardKey(toolCall.name, args);
    this.successfulWriteCalls.add(key);
  }

  /**
   * Reserve a read-only tool call key BEFORE execution. Returns true if the
   * key is newly reserved (should execute), false if it was already reserved
   * (duplicate, should block). Atomic — concurrent calls with the same key
   * in a Promise.all batch will only get one reservation.
   */
  tryReserveRead(toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    const key = buildGuardKey(toolCall.name, args);
    if (this.readCallHistory.has(key)) return false;
    this.readCallHistory.add(key);
    return true;
  }
}

