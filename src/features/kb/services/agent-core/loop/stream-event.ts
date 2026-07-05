import type { AgentToolCall } from "../messages/agent-message";
import type { ToolExecutionResult } from "../tools/native-tool";
import type { ToolPermissionPreview } from "../permissions/tool-preview";

export type AgentStreamEvent =
  | { type: "assistant_text_delta"; delta: string; fullContent: string }
  | { type: "assistant_reasoning_delta"; delta: string; fullReasoning: string }
  | { type: "assistant_reasoning_reset" }
  | { type: "assistant_text_reset" }
  | { type: "tool_call_delta"; call: Partial<AgentToolCall> & { index: number } }
  | { type: "tool_start"; stepIndex: number; toolCallId: string; toolName: string; argsPreview: Record<string, unknown>; readOnly: boolean; startedAt: number }
  | { type: "permission_required"; stepIndex: number; toolCallId: string; preview: ToolPermissionPreview }
  | { type: "permission_resolved"; stepIndex: number; toolCallId: string; approved: boolean; reason?: string }
  | { type: "tool_result"; stepIndex: number; toolCallId: string; toolName: string; result: ToolExecutionResult; durationMs: number; argsPreview?: Record<string, unknown> }
  | { type: "assistant_final"; answer: string }
  | { type: "notice"; message: string }
  | { type: "error"; code: string; message: string }
  | { type: "done"; status: "answer_ready" | "failed" | "cancelled" };
