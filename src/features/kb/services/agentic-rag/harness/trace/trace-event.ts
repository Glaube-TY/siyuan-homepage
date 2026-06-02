export type KbAgentTraceEventType =
  | "TURN_START"
  | "SCOPE_RESOLVED"
  | "STATE_TRANSITION"
  | "PLANNER_CONTEXT_BUILT"
  | "PLANNER_DECISION"
  | "ACTION_MATERIALIZED"
  | "ACTION_VALIDATED"
  | "TOOL_EXEC_START"
  | "TOOL_EXEC_END"
  | "TOOL_OBSERVATION_RECORDED_SAFE"
  | "SYSTEM_OBSERVATION_RECORDED_SAFE"
  | "WORKSPACE_UPDATED"
  | "STRUCTURE_PACK_BUILT"
  | "CANDIDATE_PACK_BUILT"
  | "EVIDENCE_GATE_CHECKED"
  | "EVIDENCE_PACK_BUILT"
  | "ANSWER_STARTED"
  | "ANSWER_FINISHED"
  | "COMPOSE_START"
  | "COMPOSE_EVIDENCE_TOKENIZATION_SAFE"
  | "ANSWER_STREAM_START"
  | "TURN_END"
  | "FOCUS_ROOT_TRACKED"
  | "CANDIDATE_ORDER_TRACKED"
  | "PLANNER_ONLY_ACTION_MATERIALIZED_SAFE"
  | "EXEC_START_in_plan_next"
  | "EXEC_END_in_plan_next"
  | "EXEC_START_in_validate_action"
  | "EXEC_END_in_validate_action"
  | "EXEC_START_in_execute_action"
  | "EXEC_END_in_execute_action"
  | "EXEC_START_in_evidence_gate"
  | "EXEC_END_in_evidence_gate";

export interface KbAgentTraceEvent {
  time: string;
  type: KbAgentTraceEventType;
  level: "debug" | "info" | "warn" | "error";
  safePayload: Record<string, unknown>;
}

export function createKbAgentTraceEvent(
  type: KbAgentTraceEventType,
  safePayload: Record<string, unknown> = {},
  level: KbAgentTraceEvent["level"] = "info",
): KbAgentTraceEvent {
  return {
    time: new Date().toISOString(),
    type,
    level,
    safePayload,
  };
}
