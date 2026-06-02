import { createKbAgentTraceEvent, type KbAgentTraceEvent } from "../trace/trace-event";
import { summarizeTraceEvents } from "../trace/trace-summary";
import { assertTrace } from "./trace-assertions";
import type { KbAgentParityScenario } from "./scenarios";
import type { ParityReport } from "./parity-report";
import type { KbAgentStateName } from "../state/kb-agent-state";
import { getAllowedActionsForState } from "../state/transition-rules";
import { createDefaultMockPlanner, type MockPlannerDecision } from "./mock-planner";
import { createDefaultMockToolResultFactory } from "./mock-tools";

interface MockState {
  state: KbAgentStateName;
  readDocCount: number;
  candidateDocCount: number;
  evidenceItemCount: number;
  hasKnowledgeMap: boolean;
  hasActiveFocusScope: boolean;
  evidenceGateV2Status: "sufficient" | "insufficient_with_options" | "insufficient_final" | "none";
  loopCount: number;
  maxLoops: number;
  focusedRootTitle?: string;
  candidateOrder: string[];
  legacyGateDecision?: string;
}

function actionEvent(actionType: string, payload: Record<string, unknown> = {}): KbAgentTraceEvent {
  return createKbAgentTraceEvent("TOOL_EXEC_END", { actionType, ...payload });
}

function deriveNextState(
  state: MockState,
  plannerDecision: MockPlannerDecision,
  toolResult: Record<string, unknown>,
): MockState {
  const next = { ...state };
  const actionType = plannerDecision.actionType;

  switch (actionType) {
    case "list_knowledge_map":
      next.hasKnowledgeMap = true;
      next.state = "MAP_LOADED";
      break;
    case "focus_doc_scope":
      next.hasActiveFocusScope = true;
      next.candidateDocCount = (toolResult.candidateDocCount as number) ?? next.candidateDocCount;
      next.state = "FOCUS_SET";
      break;
    case "search_scope":
      next.candidateDocCount = (toolResult.candidateDocCount as number) ?? next.candidateDocCount;
      next.state = "SEARCH_DONE";
      break;
    case "read_candidate_docs":
    case "read_docs":
      next.readDocCount = (toolResult.readDocCount as number) ?? next.readDocCount;
      next.evidenceItemCount = (toolResult.evidenceItemCount as number) ?? next.readDocCount;
      next.state = "EVIDENCE_READ";
      break;
    case "answer":
      next.state = "ANSWER_READY";
      break;
  }

  return next;
}

function deriveEvidenceGateV2(state: MockState): { status: string; missing?: string } {
  if (state.evidenceItemCount >= 1 && state.readDocCount >= 1) {
    return { status: "sufficient", missing: "none" };
  }
  if (state.loopCount >= state.maxLoops) {
    return { status: "insufficient_final", missing: "not_enough_sources" };
  }
  if (state.candidateDocCount > 0 && state.readDocCount === 0) {
    return { status: "insufficient_with_options", missing: "only_candidates" };
  }
  if (state.hasKnowledgeMap && !state.hasActiveFocusScope) {
    return { status: "insufficient_with_options", missing: "only_structure" };
  }
  return { status: "none" };
}

function deriveStateFromGate(state: MockState, gateV2: { status: string }): KbAgentStateName {
  if (gateV2.status === "sufficient") return "EVIDENCE_SUFFICIENT";
  if (gateV2.status === "insufficient_with_options") return "EVIDENCE_INSUFFICIENT_WITH_OPTIONS";
  if (gateV2.status === "insufficient_final") return "EVIDENCE_INSUFFICIENT_FINAL";
  return state.state;
}

export function runMockParityScenario(scenario: KbAgentParityScenario): ParityReport {
  const trace: KbAgentTraceEvent[] = [
    createKbAgentTraceEvent("TURN_START", { scenarioId: scenario.id }),
    createKbAgentTraceEvent("PLANNER_CONTEXT_BUILT", { state: "NEEDS_KB" }),
  ];

  const planner = createDefaultMockPlanner();
  const toolFactory = createDefaultMockToolResultFactory();

  let mockState: MockState = {
    state: "NEEDS_KB",
    readDocCount: 0,
    candidateDocCount: 0,
    evidenceItemCount: 0,
    hasKnowledgeMap: false,
    hasActiveFocusScope: false,
    evidenceGateV2Status: "none",
    loopCount: 0,
    maxLoops: scenario.mockMaxLoops ?? 10,
    focusedRootTitle: undefined,
    candidateOrder: [],
    legacyGateDecision: undefined,
  };

  let answerOccurred = false;

  while (mockState.loopCount < mockState.maxLoops && !answerOccurred) {
    mockState.loopCount++;

    const allowedActions = getAllowedActionsForState({ state: mockState.state });
    const turnContext = {
      turn: {
        question: scenario.question,
        needsKnowledgeBase: true,
      },
      state: {
        current: mockState.state,
        allowedActions,
        forbiddenActions: [],
        reason: "mock state",
      },
      evidenceSummary: {
        evidenceItemCount: mockState.evidenceItemCount,
        readDocCount: mockState.readDocCount,
      },
      budgets: {
        readRemaining: Math.max(0, 5 - mockState.readDocCount),
        searchRemaining: Math.max(0, 3),
        blockRemaining: 5,
      },
    };

    const gateV2BeforeAction = deriveEvidenceGateV2(mockState);
    mockState.evidenceGateV2Status = gateV2BeforeAction.status as any;

    if (gateV2BeforeAction.status === "insufficient_final") {
      trace.push(createKbAgentTraceEvent("EVIDENCE_GATE_CHECKED", {
        status: gateV2BeforeAction.status,
      }));
      trace.push(createKbAgentTraceEvent("SYSTEM_OBSERVATION_RECORDED_SAFE", {
        reason: "insufficient_final with empty evidence uses fixed answer without LLM compose",
        evidenceItemCount: mockState.evidenceItemCount,
      }));
      trace.push(createKbAgentTraceEvent("STATE_TRANSITION", {
        from: mockState.state,
        to: "EVIDENCE_INSUFFICIENT_FINAL",
      }));
      break;
    }

    const forcedDecision = scenario.mockPlannerDecisions?.[mockState.loopCount - 1];
    const plannerDecision = forcedDecision
      ? {
        actionType: forcedDecision.actionType as MockPlannerDecision["actionType"],
        args: forcedDecision.args,
      }
      : planner.decide(turnContext as any);

    if (gateV2BeforeAction.status === "insufficient_with_options" && plannerDecision.actionType === "answer") {
      trace.push(createKbAgentTraceEvent("EVIDENCE_GATE_CHECKED", {
        status: gateV2BeforeAction.status,
      }));
      trace.push(createKbAgentTraceEvent("SYSTEM_OBSERVATION_RECORDED_SAFE", {
        fromActionType: "answer",
        reason: "evidence gate v2 says with_options, answer forbidden, read/search instead",
      }));

      if (gateV2BeforeAction.status === "insufficient_with_options" && allowedActions.includes("read_candidate_docs" as any) && mockState.candidateDocCount > 0) {
        plannerDecision.actionType = "read_candidate_docs" as any;
        plannerDecision.args = { selection: "unread_top_k", k: 3 };
      } else if (gateV2BeforeAction.status === "insufficient_with_options" && allowedActions.includes("search_scope" as any)) {
        plannerDecision.actionType = "search_scope" as any;
        plannerDecision.args = { queries: [{ text: scenario.question }] };
      } else {
        trace.push(createKbAgentTraceEvent("TOOL_OBSERVATION_RECORDED_SAFE", {
          reason: "with_options but no matching allowed action",
        }));
        break;
      }
    }

    if (plannerDecision.actionType === "answer") {
      if (mockState.evidenceItemCount === 0 && scenario.expected.mustNotAnswerBeforeEvidence) {
        trace.push(createKbAgentTraceEvent("SYSTEM_OBSERVATION_RECORDED_SAFE", {
          reason: "mustNotAnswerBeforeEvidence is true but no evidence exists, blocking answer",
        }));
        break;
      }
      answerOccurred = true;
    }

    if (scenario.mockBridgeFailureActionTypes?.includes(plannerDecision.actionType)) {
      trace.push(createKbAgentTraceEvent("SYSTEM_OBSERVATION_RECORDED_SAFE", {
        actionType: plannerDecision.actionType,
        reason: "bridge selected no executable action; using continuation",
      }));
      if (gateV2BeforeAction.status === "insufficient_with_options") {
        plannerDecision.actionType = mockState.candidateDocCount > 0 ? "read_candidate_docs" : "search_scope";
        plannerDecision.args = plannerDecision.actionType === "search_scope"
          ? { queries: [{ text: scenario.question }] }
          : { selection: "unread_top_k", k: 3 };
      }
    }

    const baseToolResult = toolFactory.createResult(plannerDecision.actionType);
    const override = scenario.mockToolResults?.[plannerDecision.actionType];
    const toolResult = override && typeof override === "object" && !Array.isArray(override)
      ? { ...baseToolResult, ...(override as Record<string, unknown>) }
      : baseToolResult;

    trace.push(actionEvent(plannerDecision.actionType, {
      ...toolResult,
      allowedActions,
      state: mockState.state,
    }));

    if (plannerDecision.actionType === "list_knowledge_map") {
      trace.push(createKbAgentTraceEvent("STRUCTURE_PACK_BUILT", { structureItemCount: toolResult.returnedNodeCount ?? 4 }));
    }
    if (plannerDecision.actionType === "focus_doc_scope" || plannerDecision.actionType === "search_scope") {
      trace.push(createKbAgentTraceEvent("CANDIDATE_PACK_BUILT", { candidateDocCount: mockState.candidateDocCount }));
    }

    mockState = deriveNextState(mockState, plannerDecision, toolResult);

    // EVIDENCE_PACK_BUILT 必须 deriveNextState 更新 mockState 之后记录
    if (plannerDecision.actionType === "read_candidate_docs" || plannerDecision.actionType === "read_docs") {
      trace.push(createKbAgentTraceEvent("EVIDENCE_PACK_BUILT", {
        evidenceItemCount: mockState.evidenceItemCount,
        readDocCount: mockState.readDocCount,
      }));
    }

    const gateV2 = deriveEvidenceGateV2(mockState);
    mockState.evidenceGateV2Status = gateV2.status as any;

    // 记录 legacy gate decision（用于断言一致性）
    mockState.legacyGateDecision = gateV2.status === "sufficient" ? "enough" : "needs_planner_decision";

    trace.push(createKbAgentTraceEvent("EVIDENCE_GATE_CHECKED", {
      status: gateV2.status,
      legacyDecision: mockState.legacyGateDecision,
    }));

    // 跟踪 focusedRootTitle（从 focus_doc_scope 工具结果中提取）
    if (plannerDecision.actionType === "focus_doc_scope") {
      const focusedRootTitle = toolResult.focusedRootTitle as string | undefined;
      if (focusedRootTitle) {
        mockState.focusedRootTitle = focusedRootTitle;
        trace.push(createKbAgentTraceEvent("FOCUS_ROOT_TRACKED", {
          focusedRootTitle,
          loopCount: mockState.loopCount,
        }));
      }
    }

    // 跟踪 candidateOrder（从 read_candidate_docs 工具结果中提取）
    if (plannerDecision.actionType === "read_candidate_docs" || plannerDecision.actionType === "read_docs") {
      const readOrder = (toolResult.readOrder as string[]) ?? [];
      mockState.candidateOrder = [...mockState.candidateOrder, ...readOrder];
      trace.push(createKbAgentTraceEvent("CANDIDATE_ORDER_TRACKED", {
        readOrder,
        cumulativeOrder: mockState.candidateOrder,
      }));
    }

    const finalState = deriveStateFromGate(mockState, deriveEvidenceGateV2(mockState));
    trace.push(createKbAgentTraceEvent("STATE_TRANSITION", {
      from: mockState.state,
      to: finalState,
    }));
  }

  if (answerOccurred) {
    trace.push(createKbAgentTraceEvent("ANSWER_STARTED", { actionType: "answer" }));
  }
  trace.push(createKbAgentTraceEvent("TURN_END", { scenarioId: scenario.id }));

  const assertion = assertTrace(trace, scenario.expected);
  return {
    scenarioId: scenario.id,
    passed: assertion.passed,
    failures: assertion.failures,
    traceSummary: summarizeTraceEvents(trace),
  };
}

export function runMockParityScenarios(scenarios: KbAgentParityScenario[]): ParityReport[] {
  return scenarios.map((scenario) => runMockParityScenario(scenario));
}
