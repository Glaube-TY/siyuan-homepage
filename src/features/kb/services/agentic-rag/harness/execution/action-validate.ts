/**
 * Action Validate
 *
 * 第一铁律：Harness 只能 validate / execute / observe / return_to_planner，
 * 不拦截或推荐业务动作。
 */

import type { AgentAction } from "../../actions/action-types";
import type { AgenticRagState } from "../../graph/state";

export type ActionGateSource =
  | "planner"
  | "deterministic_requirement"
  | "requirement";

export interface ActionGateResult {
  allowed: boolean;
  reason?: string;
  action?: AgentAction;
  newState: AgenticRagState;
}

export function assertActionAllowedByActiveToolPlan(
  action: AgentAction,
  _source: ActionGateSource,
  state: AgenticRagState,
): ActionGateResult {
  return { allowed: true, action, newState: state };
}
