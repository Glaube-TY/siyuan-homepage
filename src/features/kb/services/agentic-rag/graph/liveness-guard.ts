/**
 * State Check Guard
 *
 * 检测状态是否需要返回给 Planner 继续决策。
 *
 * 职责：
 * - 无证据、有预算、无可执行 action 时，返回 needsContinue=true
 * - evidenceGate 要求继续但 Planner 产出 answer 时，返回 needsContinue=true
 * - 只使用结构字段，不解析用户原文
 * - 不返回业务工具；具体恢复由 State Machine / Graph 决定
 */

import type { AgenticRagState } from "../graph/state";

export interface StateCheckResult {
  needsContinue: boolean;
  reason?: string;
}

export function checkGraphLiveness(state: AgenticRagState): StateCheckResult {
  const hasReadEvidence = state.workspace.readDocuments.length > 0 || state.workspace.readBlockContexts.length > 0;
  const hasSearchBudget = (state.budget.maxSearchCalls ?? 0) - (state.counters.searchCallCount ?? 0) > 0;
  const hasPerTurnLegacyReadBudget = (state.budget.maxReadDocs ?? 0) - (state.workspace.readDocuments.length ?? 0) > 0;
  const hasBlockBudget = (state.budget.maxBlockContexts ?? 0) - (state.workspace.readBlockContexts.length ?? 0) > 0;

  const maxTotalResearchDocs = state.budget.maxTotalResearchDocs ?? 30;
  const totalReadSoFar = state.workspace.readDocuments.length;
  const hasResearchReadBudget = totalReadSoFar < maxTotalResearchDocs;
  const maxResearchBatches = state.budget.maxResearchBatches ?? 3;
  const pool = state.workspace.researchCandidatePool;
  const currentBatches = pool?.batchCount ?? 0;
  const hasResearchBatchBudget = currentBatches < maxResearchBatches;

  const poolRemaining = pool
    ? pool.candidateDocIdsInRankOrder.length - pool.readDocIds.length - pool.skippedDocIds.length
    : 0;

  const hasResearchBudget = hasResearchReadBudget && hasResearchBatchBudget && poolRemaining > 0;
  const hasAnyBudget = hasSearchBudget || hasPerTurnLegacyReadBudget || hasBlockBudget || hasResearchBudget;
  const hasNoAction = !state.currentAction && !state.finalAnswerAction;
  const hasNoPlannerAction = !state.plannerAction || !state.plannerMaterializedAction;

  const gateRequiresContinue = state.evidenceGateDecision?.shouldContinue === true && state.evidenceGateDecision?.shouldAnswer === false;

  if (gateRequiresContinue && (hasNoAction || hasNoPlannerAction)) {
    return {
      needsContinue: true,
      reason: "evidence gate requires continue, no executable action",
    };
  }

  if (gateRequiresContinue && state.currentAction?.type === "answer") {
    return {
      needsContinue: true,
      reason: "evidence gate requires continue, but planner produced answer",
    };
  }

  if (
    !hasReadEvidence &&
    hasAnyBudget &&
    (hasNoAction || hasNoPlannerAction)
  ) {
    return {
      needsContinue: true,
      reason: "no evidence, budget available, no executable action",
    };
  }

  if (
    !hasReadEvidence &&
    hasAnyBudget &&
    state.currentAction?.type === "answer"
  ) {
    return {
      needsContinue: true,
      reason: "answer attempted with no evidence and budget available",
    };
  }

  return { needsContinue: false };
}
