import type { TraceStep } from "../../graph/state";
import type { KbAgentTraceEvent } from "./trace-event";
import { mapTraceStepsToEvents } from "./trace-step-adapter";

export interface KbAgentTraceSummary {
  actions: string[];
  states: string[];
  readDocCount: number;
  candidateDocCount: number;
  evidenceItemCount: number;
  invalidActionCount: number;
  focusedRootTitle?: string;
  candidateOrder?: string[];
  gateConsistencyOk: boolean;
}

export function summarizeTraceEvents(events: KbAgentTraceEvent[]): KbAgentTraceSummary {
  const actions: string[] = [];
  const states: string[] = [];
  let readDocCount = 0;
  let candidateDocCount = 0;
  let evidenceItemCount = 0;
  let invalidActionCount = 0;
  let focusedRootTitle: string | undefined;
  let candidateOrder: string[] = [];
  let gateConsistencyOk = true;

  for (const event of events) {
    const actionType = event.safePayload.actionType ?? event.safePayload.materializedActionType ?? event.safePayload.plannerActionType;
    if (typeof actionType === "string") actions.push(actionType);
    const state = event.safePayload.state ?? event.safePayload.to;
    if (typeof state === "string") states.push(state);
    if (typeof event.safePayload.readDocCount === "number") readDocCount = Math.max(readDocCount, event.safePayload.readDocCount);
    if (typeof event.safePayload.candidateDocCount === "number") candidateDocCount = Math.max(candidateDocCount, event.safePayload.candidateDocCount);
    if (typeof event.safePayload.evidenceItemCount === "number") evidenceItemCount = Math.max(evidenceItemCount, event.safePayload.evidenceItemCount);
    if (event.safePayload.actionType === "INVALID_ACTION" || event.safePayload.invalidAction === true) invalidActionCount++;
    if (event.type === "FOCUS_ROOT_TRACKED" && typeof event.safePayload.focusedRootTitle === "string") {
      focusedRootTitle = event.safePayload.focusedRootTitle as string;
    }
    if (event.type === "CANDIDATE_ORDER_TRACKED" && Array.isArray(event.safePayload.cumulativeOrder)) {
      candidateOrder = event.safePayload.cumulativeOrder as string[];
    }
    if (event.type === "EVIDENCE_GATE_CHECKED") {
      const v2Status = event.safePayload.status as string;
      const legacyDecision = event.safePayload.legacyDecision as string;
      if (v2Status === "sufficient" && legacyDecision === "needs_planner_decision") {
        gateConsistencyOk = false;
      }
    }
  }

  return {
    actions,
    states,
    readDocCount,
    candidateDocCount,
    evidenceItemCount,
    invalidActionCount,
    focusedRootTitle,
    candidateOrder,
    gateConsistencyOk,
  };
}

export function summarizeTraceSteps(steps: TraceStep[]): KbAgentTraceSummary {
  return summarizeTraceEvents(mapTraceStepsToEvents(steps));
}
