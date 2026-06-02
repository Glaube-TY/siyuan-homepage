/**
 * ⚠️ LEGACY FLOW-CONTROL ⚠️
 *
 * Evidence Gate Node
 *
 * 属于"legacy flow-control，待迁移为 observation-only"。
 *
 * 历史职责（v2）：
 * - 评估 evidence state。
 * - 历史上曾被用于"在某种 evidence 状态时把 allowedActions 裁剪成只剩 answer"，
 *   这属于把流程控制塞进 Evidence Gate，违反第一铁律。
 *
 * v3 方向（见 docs/notebrain/agent-skill-workbench-v3-design.md §8）：
 * - Evidence Gate 降级为 Observation Producer。
 * - 输出：evidenceStatus / missingCategories / budget。
 * - **不**再输出会影响 Planner 选择的 READ_REQUIRED / MAP_LOADED / EVIDENCE_SUFFICIENT
 *   作为业务路线。
 * - **不**推荐下一业务工具。
 *
 * 迁移期约束：
 * - 本轮**不**新增新流程逻辑。
 * - 旧调用方暂不破坏。
 * - 后续轮次：把 Evidence Gate 的输出完全转化为 observation，移除对
 *   allowedActions 的"按 evidence 状态裁剪"逻辑。
 */

import type { AgenticRagState } from "../state";
import type { AgentAction, AnswerAction } from "../../actions/action-types";
import { evaluateEvidenceGate } from "../../evidence/evidence-gate";
import { deriveEffectiveCandidatePolicy } from "../../planner/effective-planner-constraints";
import { pushAgentDebugEvent } from "../../debug/agentic-rag-debug";
import { mapEvidenceGateDecisionToV2 } from "../../harness/state/evidence-state";
import { getRemainingSearchCalls, getRemainingReadDocs, getRemainingBlockContexts } from "../../safety/budget-guard";

export interface EvidenceGateNodeInput {
  state: AgenticRagState;
}

export interface EvidenceGateNodeOutput {
  state: AgenticRagState;
}

function isStaleExecutedAction(currentAction: AgentAction | undefined, actionHistory: AgentAction[]): boolean {
  if (!currentAction || currentAction.type === "answer") return false;
  const lastAction = actionHistory[actionHistory.length - 1];
  return !!lastAction && lastAction.type === currentAction.type;
}

export function evidenceGateNode(input: EvidenceGateNodeInput): EvidenceGateNodeOutput {
  const { state } = input;

  const traceLog = [...state.traceLog];
  const warnings = [...state.warnings];
  const pendingAction = isStaleExecutedAction(state.currentAction, state.actionHistory)
    ? undefined
    : state.currentAction;

  if (state.currentAction && !pendingAction) {
    traceLog.push({
      name: "STALE_CURRENT_ACTION_IGNORED_SAFE",
      status: "skipped",
      detail: JSON.stringify({
        actionType: state.currentAction.type,
        actionHistoryCount: state.actionHistory.length,
      }),
    });
    pushAgentDebugEvent("STALE_CURRENT_ACTION_IGNORED_SAFE", {
      actionType: state.currentAction.type,
      actionHistoryCount: state.actionHistory.length,
    }, "warn");
  }

  const effectivePolicy = state.plannerAction
    ? deriveEffectiveCandidatePolicy({
        plannerAction: state.plannerAction,
      })
    : undefined;

  const decision = evaluateEvidenceGate({
    workspace: state.workspace,
    budget: state.budget,
    counters: state.counters,
    currentAction: pendingAction,
    lastToolResult: state.lastToolResult,
    actionHistory: state.actionHistory,
    effectivePolicy,
    needsKnowledgeBase: state.runtimeTurnFacts?.modeRequiresKb,
  });

  const evidenceGateV2 = mapEvidenceGateDecisionToV2({ decision, state });
  let v2AlignedDecision = decision;
  if (evidenceGateV2.status === "sufficient" && decision.status === "needs_planner_decision") {
    v2AlignedDecision = {
      ...decision,
      status: "enough",
      shouldAnswer: true,
      shouldContinue: false,
      reasons: evidenceGateV2.reasons,
    };
  }

  const isWithOptions = evidenceGateV2.status === "insufficient_with_options";
  const effectiveShouldAnswer = isWithOptions ? false : v2AlignedDecision.shouldAnswer;
  const effectiveStatus = isWithOptions ? "with_options" : v2AlignedDecision.status;

  const payload = {
    rawStatus: decision.status,
    rawShouldAnswer: decision.shouldAnswer,
    effectiveStatus,
    effectiveShouldAnswer,
    evidenceGateV2Status: evidenceGateV2.status,
    readDocCount: state.workspace.readDocuments.length,
    readBlockContextCount: state.workspace.readBlockContexts.length,
    hasPendingAction: !!pendingAction,
    pendingActionType: pendingAction?.type,
  };

  if (state.trace) {
    console.info("[KB-AGENT | EVIDENCE_GATE_V2_CHECKED_SAFE]", payload);
  }
  pushAgentDebugEvent("EVIDENCE_GATE_V2_CHECKED_SAFE", payload, "info");
  traceLog.push({
    name: "EVIDENCE_GATE_V2_CHECKED_SAFE",
    status: "success",
    detail: JSON.stringify(payload),
  });

  const effectiveDecisionPayload = {
    rawStatus: decision.status,
    rawShouldAnswer: decision.shouldAnswer,
    effectiveStatus,
    effectiveShouldAnswer,
    evidenceGateV2Status: evidenceGateV2.status,
  };
  traceLog.push({
    name: "EVIDENCE_GATE_EFFECTIVE_DECISION_SAFE",
    status: "success",
    detail: JSON.stringify(effectiveDecisionPayload),
  });
  pushAgentDebugEvent("EVIDENCE_GATE_EFFECTIVE_DECISION_SAFE", effectiveDecisionPayload, "info");

  const budgetContext = { budget: state.budget, counters: state.counters };
  const searchBudgetRemaining = getRemainingSearchCalls(state.budget, budgetContext);
  const readBudgetRemaining = getRemainingReadDocs(state.budget, budgetContext);
  const blockBudgetRemaining = getRemainingBlockContexts(state.budget, budgetContext);
  const hasKnowledgeMap = state.workspace.knowledgeMap?.loaded === true;
  const hasActiveFocusScope = !!state.workspace.activeFocusScope;
  const inventoryOnlyCandidateCount = state.workspace.candidateDocs.filter(
    (d) => d.inventoryOnly || d.lifecycle === "inventory"
  ).length;
  const readDocIdSet = new Set(state.workspace.readDocuments.map((d) => d.docId));
  const readableCandidateUnreadCount = state.workspace.candidateDocs.filter(
    (d) => !d.inventoryOnly && d.lifecycle !== "inventory" && !readDocIdSet.has(d.docId)
  ).length;
  const candidateBlockCount = state.workspace.candidateBlocks.length;

  let availablePathCount = 0;
  if (hasKnowledgeMap) availablePathCount++;
  if (hasActiveFocusScope) availablePathCount++;
  if (inventoryOnlyCandidateCount > 0) availablePathCount++;
  if (readableCandidateUnreadCount > 0 && readBudgetRemaining > 0) availablePathCount++;
  if (candidateBlockCount > 0 && blockBudgetRemaining > 0) availablePathCount++;

  traceLog.push({
    name: "EVIDENCE_PATH_OPTIONS_SAFE",
    status: "success",
    detail: JSON.stringify({
      searchBudgetRemaining,
      readBudgetRemaining,
      blockBudgetRemaining,
      hasKnowledgeMap,
      hasInventoryOnlyCandidates: inventoryOnlyCandidateCount > 0,
      readableCandidateUnreadCount,
      candidateBlockCount,
      hasActiveFocusScope,
      availablePathCount,
      finalityReasonCode: evidenceGateV2.status === "insufficient_final" ? "all_paths_exhausted" : evidenceGateV2.status,
    }),
  });

  const broadCoverageRequested = effectivePolicy?.broadCoverageRequested === true;

  traceLog.push({
    name: "EVIDENCE_COVERAGE_POLICY_SAFE",
    status: "success",
    detail: JSON.stringify({
      coverage: effectivePolicy?.evidenceGoalCoverage ?? "unknown",
      minimumReadDocs: effectivePolicy?.minimumReadDocs ?? 0,
      preferredReadDocs: effectivePolicy?.preferredReadDocs ?? 0,
      broadCoverageRequested,
      readDocCount: state.workspace.readDocuments.length,
      readableCandidateUnreadCount,
    }),
  });

  if (v2AlignedDecision.status === "insufficient" && v2AlignedDecision.failureMessage) {
    traceLog.push({
      name: "EVIDENCE_GATE_INSUFFICIENT",
      status: "failed",
      detail: v2AlignedDecision.failureMessage,
    });
    return {
      state: {
        ...state,
        currentAction: pendingAction,
        evidenceGateDecision: v2AlignedDecision,
        evidenceGateV2,
        traceLog,
        warnings,
        insufficientMessage: v2AlignedDecision.failureMessage,
      },
    };
  }

  if (v2AlignedDecision.status === "answer_with_tree_empty" && v2AlignedDecision.treeEmptyMessage) {
    traceLog.push({
      name: "EVIDENCE_GATE_TREE_EMPTY",
      status: "success",
      detail: v2AlignedDecision.treeEmptyMessage,
    });
    return {
      state: {
        ...state,
        currentAction: pendingAction,
        evidenceGateDecision: v2AlignedDecision,
        evidenceGateV2,
        traceLog,
        warnings,
        treeEmptyMessage: v2AlignedDecision.treeEmptyMessage,
      },
    };
  }

  if (v2AlignedDecision.status === "budget_exhausted") {
    warnings.push("Evidence gate budget exhausted; returning observation to Planner.");
  } else if (v2AlignedDecision.status === "none") {
    warnings.push("Evidence gate found no usable evidence; returning observation to Planner.");
  }

  const newState: AgenticRagState = {
    ...state,
    currentAction: pendingAction,
    evidenceGateDecision: v2AlignedDecision,
    evidenceGateV2,
    traceLog,
    warnings,
  };

  if (pendingAction?.type === "answer" && v2AlignedDecision.shouldAnswer && !state.finalAnswerAction) {
    const existingAnswer = pendingAction as AnswerAction;
    traceLog.push({
      name: "ANSWER_FINALIZED_BY_EVIDENCE_GATE",
      status: "success",
      detail: JSON.stringify({
        plannerEvidenceMode: existingAnswer.args?.evidenceMode ?? "unknown",
        status: v2AlignedDecision.status,
        reasonCount: v2AlignedDecision.reasons.length,
        readDocCount: state.workspace.readDocuments.length,
        readBlockContextCount: state.workspace.readBlockContexts.length,
      }),
    });

    return {
      state: {
        ...newState,
        finalAnswerAction: existingAnswer,
        traceLog,
      },
    };
  }

  if (v2AlignedDecision.shouldAnswer && !state.finalAnswerAction && pendingAction?.type !== "answer") {
    traceLog.push({
      name: "EVIDENCE_GATE_READY_OBSERVED",
      status: "success",
      detail: JSON.stringify({
        status: v2AlignedDecision.status,
        reasonCount: v2AlignedDecision.reasons.length,
        readDocCount: state.workspace.readDocuments.length,
        readBlockContextCount: state.workspace.readBlockContexts.length,
      }),
    });

    return {
      state: {
        ...newState,
        traceLog,
      },
    };
  }

  return { state: newState };
}
