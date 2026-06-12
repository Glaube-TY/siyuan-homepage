import type { AgentToolCall } from "./agent-message";

export function parseToolCallArguments(call: AgentToolCall): {
  ok: true;
  args: Record<string, unknown>;
} | {
  ok: false;
  message: string;
} {
  const raw = call.arguments?.trim() || "{}";
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "Tool arguments must be a JSON object." };
    }
    return { ok: true, args: parsed as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Invalid JSON arguments.",
    };
  }
}

export function toolCallKey(call: AgentToolCall): string {
  return `${call.name}:${call.id}`;
}

export function makeToolErrorContent(params: {
  toolName: string;
  code: string;
  message: string;
  recoverable?: boolean;
}): string {
  return JSON.stringify({
    ok: false,
    toolName: params.toolName,
    code: params.code,
    message: params.message,
    recoverable: params.recoverable ?? true,
  });
}

