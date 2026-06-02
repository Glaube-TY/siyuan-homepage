/**
 * Effective Planner Constraints
 *
 * 纯结构 helper：从 Planner constraints 推导 effective policy。
 *
 * 职责：
 * - 不解析用户原文，不判断具体语言或问法
 * - 只基于 Planner 自身 constraints 和 runtime facts
 * 输出只包含结构字段：requireUnreadFromPreviousTurn、excludePreviousReferenceDocIds、derivedFromTurnContext
 * - policy debug 只输出 count/boolean，不输出真实 docId/path/blockId
 */

import type { PlannerAction } from "../planner/planner-action";

export interface EffectivePlannerConstraints {
  requireUnreadFromPreviousTurn: boolean;
  excludePreviousReferenceDocIds: boolean;
  derivedFromTurnContext: boolean;
  broadCoverageRequested: boolean;
  evidenceGoalCoverage?: string;
  minimumReadDocs?: number;
  preferredReadDocs?: number;
}

export interface DeriveEffectiveConstraintsParams {
  plannerAction: PlannerAction;
}

export function deriveEffectiveCandidatePolicy(
  params: DeriveEffectiveConstraintsParams
): EffectivePlannerConstraints {
  const { plannerAction } = params;

  const plannerConstraints = plannerAction.constraints;

  let requireUnreadFromPreviousTurn = plannerConstraints?.requireUnreadFromPreviousTurn ?? false;
  let derivedFromTurnContext = false;

  if (plannerAction.type === "read_previous_evidence") {
    requireUnreadFromPreviousTurn = false;
    derivedFromTurnContext = false;
  }

  const excludePreviousReferenceDocIds = requireUnreadFromPreviousTurn;

  const evidenceGoalCoverage = plannerAction.evidenceGoal?.coverage;
  const broadCoverageRequested = evidenceGoalCoverage === "broad";

  return {
    requireUnreadFromPreviousTurn,
    excludePreviousReferenceDocIds,
    derivedFromTurnContext,
    broadCoverageRequested,
    evidenceGoalCoverage,
    minimumReadDocs: plannerAction.evidenceGoal?.minimumReadDocs,
    preferredReadDocs: plannerAction.evidenceGoal?.preferredReadDocs,
  };
}
