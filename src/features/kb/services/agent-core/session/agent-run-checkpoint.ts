import type { AgentMessage, AgentToolCall } from "../messages/agent-message";
import type { AgentRunIdentity } from "../../../../agent-platform/agent-run-protocol";

export type AgentRunCheckpointPhase =
  | "before_model"
  | "before_tool"
  | "waiting_confirmation"
  | "after_tool"
  | "final";

export interface AgentRunCheckpoint {
  schemaVersion: 1;
  identity: AgentRunIdentity;
  phase: AgentRunCheckpointPhase;
  stepIndex: number;
  messages: AgentMessage[];
  pendingToolCalls?: AgentToolCall[];
  sideEffectState: "not_started" | "committed" | "unknown";
  createdAt: number;
}

export interface AgentRunResumeDecision {
  resumable: boolean;
  reason: "safe_boundary" | "run_finished" | "side_effect_unknown" | "confirmation_pending" | "tool_pending";
}

export function inspectAgentRunResume(checkpoint: AgentRunCheckpoint): AgentRunResumeDecision {
  if (checkpoint.phase === "final") return { resumable: false, reason: "run_finished" };
  if (checkpoint.sideEffectState === "unknown") return { resumable: false, reason: "side_effect_unknown" };
  if (checkpoint.phase === "waiting_confirmation") return { resumable: false, reason: "confirmation_pending" };
  if (checkpoint.phase === "before_tool") return { resumable: false, reason: "tool_pending" };
  return { resumable: true, reason: "safe_boundary" };
}
