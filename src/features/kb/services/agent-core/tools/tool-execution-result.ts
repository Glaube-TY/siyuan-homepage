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
  return JSON.stringify(envelope);
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

