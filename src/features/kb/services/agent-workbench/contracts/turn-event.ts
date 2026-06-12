import type { AgentToolCall } from "../../agent-core/messages/agent-message";
import type { ToolExecutionResult } from "../../agent-core/tools/native-tool";
import type { ToolPermissionPreview } from "../../agent-core/permissions/tool-preview";

export type AgentWorkbenchEventType =
  | "assistant_text_delta"
  | "assistant_reasoning_delta"
  | "assistant_reasoning_reset"
  | "assistant_text_reset"
  | "tool_call_delta"
  | "tool_start"
  | "permission_required"
  | "permission_resolved"
  | "tool_result"
  | "assistant_final"
  | "notice"
  | "error"
  | "done";

export interface AgentWorkbenchEventBase {
  type: AgentWorkbenchEventType;
  at: number;
  stepIndex?: number;
}

export interface AssistantTextDeltaEvent extends AgentWorkbenchEventBase {
  type: "assistant_text_delta";
  delta: string;
  fullContent: string;
}

export interface AssistantReasoningDeltaEvent extends AgentWorkbenchEventBase {
  type: "assistant_reasoning_delta";
  delta: string;
  fullReasoning: string;
}

export interface AssistantReasoningResetEvent extends AgentWorkbenchEventBase {
  type: "assistant_reasoning_reset";
}

export interface AssistantTextResetEvent extends AgentWorkbenchEventBase {
  type: "assistant_text_reset";
}

export interface ToolCallDeltaEvent extends AgentWorkbenchEventBase {
  type: "tool_call_delta";
  call: Partial<AgentToolCall> & { index: number };
}

export interface ToolStartEvent extends AgentWorkbenchEventBase {
  type: "tool_start";
  stepIndex: number;
  toolCallId: string;
  toolName: string;
  argsPreview: Record<string, unknown>;
  readOnly: boolean;
  startedAt: number;
}

export interface PermissionRequiredEvent extends AgentWorkbenchEventBase {
  type: "permission_required";
  stepIndex: number;
  toolCallId: string;
  preview: ToolPermissionPreview;
}

export interface PermissionResolvedEvent extends AgentWorkbenchEventBase {
  type: "permission_resolved";
  stepIndex: number;
  toolCallId: string;
  approved: boolean;
  reason?: string;
}

export interface ToolResultEvent extends AgentWorkbenchEventBase {
  type: "tool_result";
  stepIndex: number;
  toolCallId: string;
  toolName: string;
  result: ToolExecutionResult;
  durationMs: number;
}

export interface AssistantFinalEvent extends AgentWorkbenchEventBase {
  type: "assistant_final";
  answer: string;
}

export interface NoticeEvent extends AgentWorkbenchEventBase {
  type: "notice";
  message: string;
}

export interface ErrorEvent extends AgentWorkbenchEventBase {
  type: "error";
  code: string;
  message: string;
}

export interface DoneEvent extends AgentWorkbenchEventBase {
  type: "done";
  status: "answer_ready" | "failed" | "cancelled";
}

export interface SafeTargetPreview {
  targetDocIds?: string[];
  targetBlockIds?: string[];
  targetTitles?: string[];
  requestedCount?: number;
  affectedCount?: number;
  reasonCode?: string;
}

export type AgentWorkbenchEvent =
  | AssistantTextDeltaEvent
  | AssistantReasoningDeltaEvent
  | AssistantReasoningResetEvent
  | AssistantTextResetEvent
  | ToolCallDeltaEvent
  | ToolStartEvent
  | PermissionRequiredEvent
  | PermissionResolvedEvent
  | ToolResultEvent
  | AssistantFinalEvent
  | NoticeEvent
  | ErrorEvent
  | DoneEvent;
