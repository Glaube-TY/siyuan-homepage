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

export class StormBreaker {
  private readonly successfulWriteCalls = new Set<string>();

  shouldBlockWrite(toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    const key = `${toolCall.name}:${stableStringify(stripRuntimeFields(args))}`;
    return this.successfulWriteCalls.has(key);
  }

  markWriteSuccess(toolCall: AgentToolCall, args: Record<string, unknown>): void {
    const key = `${toolCall.name}:${stableStringify(stripRuntimeFields(args))}`;
    this.successfulWriteCalls.add(key);
  }
}

