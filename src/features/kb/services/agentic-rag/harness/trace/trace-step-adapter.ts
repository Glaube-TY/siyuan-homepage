import type { TraceStep } from "../../graph/state";
import { createKbAgentTraceEvent, type KbAgentTraceEvent, type KbAgentTraceEventType } from "./trace-event";
import { sanitizeTracePayload } from "./trace-sanitizer";

function parseDetail(detail?: string): Record<string, unknown> {
  if (!detail) return {};
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return { detail };
  }
}

function mapStepNameToTraceEventType(name: string): KbAgentTraceEventType {
  if (name.includes("turn_start")) return "TURN_START";
  if (name.includes("resolve_scope") || name.includes("SCOPE_RESOLVED")) return "SCOPE_RESOLVED";
  if (name.includes("STATE_TRANSITION")) return "STATE_TRANSITION";
  if (name.includes("PLANNER_CONTEXT")) return "PLANNER_CONTEXT_BUILT";
  if (name.includes("PLANNER_ACTION_SELECTED") || name.includes("PLANNER_ACTION_VALIDATED")) return "PLANNER_DECISION";
  if (name.includes("MATERIALIZED")) return "ACTION_MATERIALIZED";
  if (name.includes("validate_action") || name.includes("ACTION_VALIDATED")) return "ACTION_VALIDATED";
  if (name.includes("execute_action_start") || name.includes("TOOL_EXEC_START")) return "TOOL_EXEC_START";
  if (name.includes("execute_action") || name.includes("TOOL_EXEC") || name.includes("_tool")) return "TOOL_EXEC_END";
  if (name.includes("workspace")) return "WORKSPACE_UPDATED";
  if (name.includes("STRUCTURE_PACK")) return "STRUCTURE_PACK_BUILT";
  if (name.includes("CANDIDATE_PACK")) return "CANDIDATE_PACK_BUILT";
  if (name.includes("EVIDENCE_GATE")) return "EVIDENCE_GATE_CHECKED";
  if (name.includes("EVIDENCE_PACK")) return "EVIDENCE_PACK_BUILT";
  if (name.includes("compose_start") || name.includes("ANSWER_STARTED")) return "ANSWER_STARTED";
  if (name.includes("compose_end") || name.includes("ANSWER_FINISHED")) return "ANSWER_FINISHED";
  if (name.includes("graph_end") || name.includes("TURN_END")) return "TURN_END";
  return "TOOL_EXEC_END";
}

function inferActionType(step: TraceStep, payload: Record<string, unknown>): string | undefined {
  const explicit = payload.actionType ?? payload.materializedActionType ?? payload.plannerActionType;
  if (typeof explicit === "string") return explicit;

  const lower = step.name.toLowerCase();
  const knownActions = [
    "list_knowledge_map",
    "focus_doc_scope",
    "search_scope",
    "list_scope_docs",
    "read_candidate_docs",
    "read_previous_evidence",
    "read_docs",
    "read_block_context",
    "get_doc_tree_context",
    "get_conversation_used_references",
    "answer",
  ];
  return knownActions.find((action) => lower.includes(action));
}

export function mapTraceStepToEvent(step: TraceStep): KbAgentTraceEvent {
  const parsed = parseDetail(step.detail);
  const actionType = inferActionType(step, parsed);
  const safePayload = sanitizeTracePayload({
    eventName: step.name,
    status: step.status,
    ...parsed,
    actionType: actionType ?? parsed.actionType,
  });

  return createKbAgentTraceEvent(
    mapStepNameToTraceEventType(step.name),
    safePayload,
    step.status === "failed" || step.status === "schema_failure" ? "error" : "info",
  );
}

export function mapTraceStepsToEvents(steps: TraceStep[]): KbAgentTraceEvent[] {
  return steps.map((step) => mapTraceStepToEvent(step));
}
