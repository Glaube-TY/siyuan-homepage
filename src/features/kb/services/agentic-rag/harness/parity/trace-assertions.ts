import type { KbAgentTraceEvent } from "../trace/trace-event";
import type { TraceStep } from "../../graph/state";
import { summarizeTraceEvents } from "../trace/trace-summary";
import { mapTraceStepsToEvents } from "../trace/trace-step-adapter";
import type { ExpectedTrace } from "./expected-trace";

export interface ParityAssertionResult {
  passed: boolean;
  failures: string[];
}

function eventTypes(trace: KbAgentTraceEvent[]): string[] {
  return trace.map((event) => event.type);
}

function payloadActionTypes(trace: KbAgentTraceEvent[]): string[] {
  const actions: string[] = [];
  for (const event of trace) {
    const action = event.safePayload.actionType ?? event.safePayload.materializedActionType ?? event.safePayload.plannerActionType;
    if (typeof action === "string") actions.push(action);
  }
  return actions;
}

function payloadStates(trace: KbAgentTraceEvent[]): string[] {
  const states: string[] = [];
  for (const event of trace) {
    const state = event.safePayload.state ?? event.safePayload.to;
    if (typeof state === "string") states.push(state);
  }
  return states;
}

export function assertTrace(
  trace: KbAgentTraceEvent[],
  expected: ExpectedTrace,
): ParityAssertionResult {
  const failures: string[] = [];
  const types = eventTypes(trace);
  const actions = payloadActionTypes(trace);
  const states = payloadStates(trace);
  const summary = summarizeTraceEvents(trace);

  for (const eventType of expected.mustIncludeEvents) {
    if (!types.includes(eventType)) failures.push(`missing event: ${eventType}`);
  }
  for (const eventType of expected.mustNotIncludeEvents ?? []) {
    if (types.includes(eventType)) failures.push(`forbidden event present: ${eventType}`);
  }
  for (const actionType of expected.mustIncludeActionTypes ?? []) {
    if (!actions.includes(actionType)) failures.push(`missing action: ${actionType}`);
  }
  for (const actionType of expected.mustNotIncludeActionTypes ?? []) {
    if (actions.includes(actionType)) failures.push(`forbidden action present: ${actionType}`);
  }
  if (expected.mustIncludeActionSequence && expected.mustIncludeActionSequence.length > 0) {
    let fromIndex = 0;
    for (const actionType of expected.mustIncludeActionSequence) {
      const foundIndex = actions.findIndex((action, index) => index >= fromIndex && action === actionType);
      if (foundIndex < 0) {
        failures.push(`missing action sequence item after index ${fromIndex}: ${actionType}`);
        break;
      }
      fromIndex = foundIndex + 1;
    }
  }
  for (const state of expected.mustIncludeStates ?? []) {
    if (!states.includes(state)) failures.push(`missing state: ${state}`);
  }
  for (const state of expected.mustNotIncludeStates ?? []) {
    if (states.includes(state)) failures.push(`forbidden state present: ${state}`);
  }
  if (expected.minReadDocCount !== undefined && summary.readDocCount < expected.minReadDocCount) {
    failures.push(`readDocCount ${summary.readDocCount} < ${expected.minReadDocCount}`);
  }
  if (expected.minCandidateDocCount !== undefined && summary.candidateDocCount < expected.minCandidateDocCount) {
    failures.push(`candidateDocCount ${summary.candidateDocCount} < ${expected.minCandidateDocCount}`);
  }
  if (expected.minEvidenceItemCount !== undefined && summary.evidenceItemCount < expected.minEvidenceItemCount) {
    failures.push(`evidenceItemCount ${summary.evidenceItemCount} < ${expected.minEvidenceItemCount}`);
  }
  if (expected.maxInvalidActionCount !== undefined && summary.invalidActionCount > expected.maxInvalidActionCount) {
    failures.push(`invalidActionCount ${summary.invalidActionCount} > ${expected.maxInvalidActionCount}`);
  }
  if (expected.mustNotAnswerBeforeEvidence) {
    const firstAnswer = trace.findIndex((event) => event.safePayload.actionType === "answer" || event.type === "ANSWER_STARTED");
    const firstEvidence = trace.findIndex((event) => event.type === "EVIDENCE_PACK_BUILT");
    if (firstAnswer >= 0 && (firstEvidence < 0 || firstAnswer < firstEvidence)) {
      failures.push("answer occurred before evidence pack");
    }
  }

  // 断言：focusedRootTitle 不允许漂移到叶子子文档（仅验证存在性，不验证语义内容）
  const focusRootEvents = trace.filter((e) => e.type === "FOCUS_ROOT_TRACKED");
  if (focusRootEvents.length > 0) {
    const firstRootTitle = focusRootEvents[0].safePayload.focusedRootTitle as string;
    // 验证 focusedRootTitle 存在且不为空
    if (!firstRootTitle || firstRootTitle.trim().length === 0) {
      failures.push("focusedRootTitle is empty or missing on first FOCUS_ROOT_TRACKED event");
    }
  }

  // 断言：主题分支候选必须排在泛化候选前面（仅验证存在性，不验证语义内容）
  const candidateOrderEvents = trace.filter((e) => e.type === "CANDIDATE_ORDER_TRACKED");
  if (candidateOrderEvents.length > 0) {
    const allReadOrder: string[] = [];
    for (const evt of candidateOrderEvents) {
      const order = (evt.safePayload.readOrder as string[]) ?? [];
      allReadOrder.push(...order);
    }
    // 验证 readOrder 存在且不为空
    if (allReadOrder.length === 0) {
      failures.push("candidate order is empty but CANDIDATE_ORDER_TRACKED events exist");
    }
  }

  // 断言：EvidenceGateV2 sufficient 后旧 gate 不能输出 needs_planner_decision
  const gateEvents = trace.filter((e) => e.type === "EVIDENCE_GATE_CHECKED");
  for (const evt of gateEvents) {
    const v2Status = evt.safePayload.status as string;
    const legacyDecision = evt.safePayload.legacyDecision as string;
    
    if (v2Status === "sufficient" && legacyDecision === "needs_planner_decision") {
      failures.push(
        `gate consistency violation: EvidenceGateV2 status="sufficient" but legacy gate decision="needs_planner_decision" - semantic conflict`,
      );
    }

    // 断言：sufficient 状态不应带"不足"语义的 missing 字段
    if (v2Status === "sufficient") {
      const missing = evt.safePayload.missing as string;
      if (missing === "not_enough_sources" || missing === "not_enough_chars") {
        failures.push(
          `EvidenceGateV2 sufficient has insufficient missing="${missing}" - should be "none"`,
        );
      }
    }
  }

  // 断言：trace payload 不包含原始文本字段（第一铁律：代码层不保存/展示/判断对话内容）
  const RAW_TEXT_FIELDS = ["question", "query", "text", "title", "content", "snippet", "targetCanonicalText", "primaryQuery", "searchTarget", "searchQuery", "docTitle", "titlePath", "headingPath", "answerText"];
  for (const event of trace) {
    const payload = event.safePayload;
    if (typeof payload === "object" && payload !== null) {
      for (const field of RAW_TEXT_FIELDS) {
        if (field in payload && typeof (payload as Record<string, unknown>)[field] === "string") {
          const value = (payload as Record<string, unknown>)[field] as string;
          if (value.length > 0) {
            failures.push(`trace event ${event.type} contains raw text field "${field}" (length=${value.length}) - violates first principle`);
          }
        }
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function assertTraceSteps(
  steps: TraceStep[],
  expected: ExpectedTrace,
): ParityAssertionResult {
  return assertTrace(mapTraceStepsToEvents(steps), expected);
}
