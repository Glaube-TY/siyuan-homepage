/**
 * ⚠️ LEGACY FLOW-CONTROL ⚠️
 *
 * 本文件是 v2 状态机"按状态推 allowedActions / forbiddenActions"的实现。
 * 属于"legacy flow-control，待迁移为 observation-only"。
 *
 * v3 方向（见 docs/notebrain/agent-skill-workbench-v3-design.md §9）：
 * - State Machine 降级为 UI/Trace Status Producer。
 * - 状态机迁移只能由 Planner 行为驱动，不能反向驱动 Planner。
 * - 状态机不在某 state 强行要求某 tool。
 *
 * 迁移期约束：
 * - 本轮**不**新增新流程逻辑。
 * - 旧调用方暂不破坏。
 * - 后续轮次：把状态机的"按状态裁剪 allowedActions"逻辑逐步剥离，
 *   改为基于工具的硬可用性（ToolRegistry.availability + BudgetGuard）计算。
 */

import type { AgentActionName } from "../../actions/action-types";
import type { AgenticRagState } from "../../graph/state";
import { isAgentRetrievalScope } from "../../scope/types";
import type { DeriveKbAgentStateContextInput, KbAgentStateContext, KbAgentStateName } from "./kb-agent-state";
import { getAllowedActionsForState, getAllowedActionsForStateContext, getForbiddenActionsForState } from "./transition-rules";
import { getUnreadCandidateDocCount } from "../../workspace/candidate-quality";

function getEvidenceTotalChars(state: AgenticRagState): number {
  let total = 0;
  for (const doc of state.workspace.readDocuments) {
    total += doc.contentChars ?? doc.content?.length ?? 0;
  }
  for (const block of state.workspace.readBlockContexts) {
    total += block.contentChars ?? block.content?.length ?? 0;
  }
  return total;
}

function isStructuralCandidatePresent(state: AgenticRagState): boolean {
  return state.workspace.candidateDocs.some((candidate) =>
    (candidate as { provenance?: string }).provenance === "structural_focus"
  );
}

function deriveStateName(state: AgenticRagState): { stateName: KbAgentStateName; reason: string } {
  if (state.composedAnswer) {
    return { stateName: "FINALIZED", reason: "composed answer exists" };
  }

  if (state.finalAnswerAction) {
    return { stateName: "ANSWER_READY", reason: "final answer action exists" };
  }

  const needsKnowledgeBase = state.runtimeTurnFacts?.modeRequiresKb ?? true;
  if (!needsKnowledgeBase) {
    return { stateName: "NO_KB_REQUIRED", reason: "turn understanding says knowledge base is not required" };
  }

  // Evidence Gate v2 是最高状态约束：必须优先检查
  const gateV2 = state.evidenceGateV2;
  if (gateV2) {
    if (gateV2.status === "sufficient") {
      const hasReadEvidence = state.workspace.readDocuments.length > 0 || state.workspace.readBlockContexts.length > 0;
      if (hasReadEvidence) {
        return { stateName: "EVIDENCE_SUFFICIENT", reason: "evidence gate v2 says sufficient with read evidence" };
      }
    }

    if (gateV2.status === "insufficient_with_options") {
      return { stateName: "EVIDENCE_INSUFFICIENT_WITH_OPTIONS", reason: "evidence gate v2 says with options" };
    }

    if (gateV2.status === "insufficient_final") {
      return { stateName: "EVIDENCE_INSUFFICIENT_FINAL", reason: "evidence gate v2 says insufficient final" };
    }
  }

  const hasReadEvidence = state.workspace.readDocuments.length > 0 || state.workspace.readBlockContexts.length > 0;
  const gateDecision = state.evidenceGateDecision;
  if (gateDecision?.shouldAnswer && hasReadEvidence) {
    return { stateName: "EVIDENCE_SUFFICIENT", reason: "evidence gate allows answer with read evidence" };
  }
  if (gateDecision?.shouldAnswer && !hasReadEvidence) {
    return { stateName: "EVIDENCE_INSUFFICIENT_FINAL", reason: "evidence gate allows answer without read evidence" };
  }
  if (hasReadEvidence) {
    return { stateName: "EVIDENCE_READ", reason: "read document or block evidence exists" };
  }

  const candidateDocCount = state.workspace.candidateDocs.length;
  const candidateBlockCount = state.workspace.candidateBlocks.length;
  const hasCandidates = candidateDocCount > 0 || candidateBlockCount > 0;
  const readBudgetRemaining = Math.max(
    0,
    (state.budget.maxTotalResearchDocs ?? state.budget.maxReadDocs ?? 0) - state.workspace.readDocuments.length,
  );

  if (hasCandidates && readBudgetRemaining > 0) {
    if (isStructuralCandidatePresent(state)) {
      return { stateName: "READ_REQUIRED", reason: "structural or search candidates exist and read budget remains" };
    }
    return { stateName: "CANDIDATES_READY", reason: "candidate documents or blocks exist" };
  }

  if (state.workspace.activeFocusScope && state.workspace.activeFocusScope.docIds.length > 0) {
    return { stateName: "FOCUS_SET", reason: "active focus scope exists" };
  }

  // knowledgeMap 存在且无 focus/candidates/evidence 时，进入结构决策状态
  // 让 AI Planner 有机会根据目录选择 focus_doc_scope
  const hasKnowledgeMap = state.workspace.knowledgeMap?.loaded === true;
  const hasNoCandidates = candidateDocCount === 0 && candidateBlockCount === 0;
  const hasNoEvidence = !hasReadEvidence;
  const hasNoFocus = !state.workspace.activeFocusScope;
  if (hasKnowledgeMap && hasNoCandidates && hasNoEvidence && hasNoFocus) {
    return { stateName: "MAP_LOADED", reason: "knowledge map loaded, no candidates/evidence/focus yet, awaiting planner structure decision" };
  }

  if (isAgentRetrievalScope(state.mode)) {
    return { stateName: "MAP_REQUIRED", reason: "retrieval scope has no map, candidates, or evidence" };
  }

  if (state.scope) {
    return { stateName: "SCOPE_RESOLVED", reason: "scope exists but no retrieval state has advanced yet" };
  }

  return { stateName: "TURN_STARTED", reason: "turn has started" };
}

function getLastActionType(state: AgenticRagState): AgentActionName | undefined {
  const last = state.actionHistory[state.actionHistory.length - 1]?.type ?? state.currentAction?.type;
  return last as AgentActionName | undefined;
}

export function deriveKbAgentStateContext(
  input: DeriveKbAgentStateContextInput,
): KbAgentStateContext {
  const { state } = input;
  const derived = deriveStateName(state);
  const readDocCount = state.workspace.readDocuments.length;
  const readBlockContextCount = state.workspace.readBlockContexts.length;
  const evidenceItemCount = readDocCount + readBlockContextCount;
  const contextShell = { state: derived.stateName };
  const baseAllowedActions = getAllowedActionsForState(contextShell);
  const hasExecutedListKnowledgeMap = state.actionHistory.some((a) => a.type === "list_knowledge_map");
  const readDocIdSet = new Set(state.workspace.readDocuments.map((d) => d.docId));
  const readableCandidateDocCount = getUnreadCandidateDocCount(state.workspace, readDocIdSet);
  const previousReferenceDocIdsCount = state.followUpContext?.previousReferenceDocIds?.length ?? 0;
  const readBudgetRemaining = Math.max(0, (state.budget.maxTotalResearchDocs ?? state.budget.maxReadDocs ?? 0) - readDocCount);
  const dynamicAllowedActions = getAllowedActionsForStateContext({
    state: derived.stateName,
    gateMissing: state.evidenceGateV2?.missing,
    candidateDocCount: state.workspace.candidateDocs.length,
    readableCandidateDocCount,
    candidateBlockCount: state.workspace.candidateBlocks.length,
    readDocCount,
    readBlockContextCount,
    hasKnowledgeMap: state.workspace.knowledgeMap?.loaded === true,
    hasActiveFocusScope: !!state.workspace.activeFocusScope,
    searchBudgetRemaining: Math.max(0, (state.budget.maxSearchCalls ?? 0) - (state.counters.searchCallCount ?? 0)),
    readBudgetRemaining,
    hasExecutedListKnowledgeMap,
    previousReferenceDocIdsCount,
  });
  let allowedActions = dynamicAllowedActions ?? baseAllowedActions;

  const canReadPreviousEvidence = previousReferenceDocIdsCount > 0 && readBudgetRemaining > 0;
  if (!canReadPreviousEvidence) {
    allowedActions = allowedActions.filter((a) => a !== "read_previous_evidence");
  }

  const forbiddenActions = getForbiddenActionsForState({ state: derived.stateName, allowedActions });
  const lastToolResult = state.lastToolResult;

  return {
    state: derived.stateName,
    reason: derived.reason,
    scopeType: state.scope?.type ?? state.mode ?? "unknown",
    needsKnowledgeBase: state.runtimeTurnFacts?.modeRequiresKb ?? true,
    hasKnowledgeMap: state.workspace.knowledgeMap?.loaded === true,
    hasActiveFocusScope: !!state.workspace.activeFocusScope,
    candidateDocCount: state.workspace.candidateDocs.length,
    candidateBlockCount: state.workspace.candidateBlocks.length,
    readDocCount,
    readBlockContextCount,
    evidenceItemCount,
    evidenceTotalChars: getEvidenceTotalChars(state),
    searchCallCount: state.counters.searchCallCount ?? state.workspace.coverage.searchCallCount ?? 0,
    readBudgetRemaining: Math.max(0, (state.budget.maxTotalResearchDocs ?? state.budget.maxReadDocs ?? 0) - readDocCount),
    searchBudgetRemaining: Math.max(0, (state.budget.maxSearchCalls ?? 0) - (state.counters.searchCallCount ?? 0)),
    blockBudgetRemaining: Math.max(0, (state.budget.maxBlockContexts ?? 0) - readBlockContextCount),
    hasStructurePack: state.workspace.knowledgeMap?.loaded === true || !!state.workspace.activeFocusScope,
    hasCandidatePack: state.workspace.candidateDocs.length > 0 || state.workspace.candidateBlocks.length > 0,
    hasEvidencePack: evidenceItemCount > 0 || (state.finalEvidencePack?.items.length ?? 0) > 0,
    lastActionType: getLastActionType(state),
    lastActionSuccess: lastToolResult?.success,
    lastErrorType: lastToolResult && !lastToolResult.success ? "tool_error" : undefined,
    activeToolFamily: undefined,
    allowedActions,
    forbiddenActions,
  };
}

export function summarizeKbAgentStateContext(context: KbAgentStateContext): Record<string, unknown> {
  return {
    state: context.state,
    reason: context.reason,
    scopeType: context.scopeType,
    needsKnowledgeBase: context.needsKnowledgeBase,
    hasKnowledgeMap: context.hasKnowledgeMap,
    hasActiveFocusScope: context.hasActiveFocusScope,
    candidateDocCount: context.candidateDocCount,
    candidateBlockCount: context.candidateBlockCount,
    readDocCount: context.readDocCount,
    readBlockContextCount: context.readBlockContextCount,
    evidenceItemCount: context.evidenceItemCount,
    searchCallCount: context.searchCallCount,
    readBudgetRemaining: context.readBudgetRemaining,
    searchBudgetRemaining: context.searchBudgetRemaining,
    blockBudgetRemaining: context.blockBudgetRemaining,
    allowedActions: context.allowedActions,
    forbiddenActions: context.forbiddenActions,
  };
}
