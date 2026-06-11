/**
 * Agent Workbench event types — standardized event stream for UI.
 */

export type AgentWorkbenchEventType =
  | "TurnStarted"
  | "AssistantMessageStarted"
  | "ToolDispatch"
  | "ToolResult"
  | "AssistantFinal"
  | "TurnFailed"
  | "Notice";

export interface AgentWorkbenchEventBase {
  type: AgentWorkbenchEventType;
  stepIndex?: number;
  at: number;
}

export interface ToolDispatchEvent extends AgentWorkbenchEventBase {
  type: "ToolDispatch";
  toolCallId: string;
  toolName: string;
  argsPreview: Record<string, unknown>;
  readOnly: boolean;
  startedAt: number;
}

export interface ToolResultEvent extends AgentWorkbenchEventBase {
  type: "ToolResult";
  toolCallId: string;
  toolName: string;
  ok: boolean;
  outputSummary?: string;
  observationPreview?: string;
  errorCode?: string;
  durationMs: number;
  truncated?: boolean;
}

export interface NoticeEvent extends AgentWorkbenchEventBase {
  type: "Notice";
  message: string;
}

export type AgentWorkbenchEvent =
  | (AgentWorkbenchEventBase & { type: "TurnStarted" | "AssistantMessageStarted" | "AssistantFinal" | "TurnFailed"; message?: string; status?: string; errorCode?: string })
  | ToolDispatchEvent
  | ToolResultEvent
  | NoticeEvent;
