import type { AgentToolCall } from "../messages/agent-message";

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

export class StormBreaker {
  private readonly seenWriteCalls = new Set<string>();

  shouldBlockWrite(toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    const key = `${toolCall.name}:${stableStringify(args)}`;
    if (this.seenWriteCalls.has(key)) return true;
    this.seenWriteCalls.add(key);
    return false;
  }
}

