import type { ToolExecutionResult } from "./native-tool";

export function stringifyToolResultContent(input: {
  ok: boolean;
  toolName: string;
  data?: unknown;
  code?: string;
  message?: string;
  recoverable?: boolean;
}): string {
  const envelope: Record<string, unknown> = {
    ok: input.ok,
    toolName: input.toolName,
  };
  if (input.ok) {
    envelope.data = input.data ?? null;
  } else {
    envelope.code = input.code ?? "unknown_error";
    envelope.message = input.message ?? "Tool execution failed.";
    if (input.recoverable !== undefined) envelope.recoverable = input.recoverable;
  }
  const json = JSON.stringify(envelope);
  // Prefix failed results so the model can easily spot them when summarising tool outcomes.
  return input.ok ? json : `[TOOL_FAILED] ${json}`;
}

/**
 * Parse a tool result content envelope.
 *
 * Handles both plain JSON and the `[TOOL_FAILED] {...}` prefix used by
 * stringifyToolResultContent for failed results. Returns undefined if the
 * content cannot be parsed as a JSON object.
 */
export function parseToolResultContentEnvelope(
  content: string,
): Record<string, unknown> | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch { /* fall through */ }

  const prefix = "[TOOL_FAILED]";
  if (trimmed.startsWith(prefix)) {
    try {
      const parsed = JSON.parse(trimmed.slice(prefix.length).trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* fall through */ }
  }

  return undefined;
}

export function createToolExecutionFailure(params: {
  toolName: string;
  code: string;
  message: string;
  recoverable?: boolean;
}): ToolExecutionResult {
  return {
    ok: false,
    code: params.code,
    summary: params.message,
    errorCode: params.code,
    content: stringifyToolResultContent({
      ok: false,
      toolName: params.toolName,
      code: params.code,
      message: params.message,
      recoverable: params.recoverable ?? true,
    }),
  };
}

