import type { ZodSchema } from "zod";
import type { AgentActionName } from "../../actions/action-types";
import type { PlannerActionType } from "../../planner/planner-action";

export type KbAgentToolFamily =
  | "map"
  | "focus"
  | "search"
  | "read"
  | "tree"
  | "history"
  | "answer";

export type KbAgentToolProduces =
  | "navigation"
  | "focus"
  | "candidates"
  | "evidence"
  | "answer";

export type KbAgentEvidenceRole =
  | "none"
  | "navigation_only"
  | "candidate_only"
  | "evidence";

export interface KbAgentToolContract {
  name: AgentActionName;
  plannerType?: PlannerActionType;
  family: KbAgentToolFamily;
  canStartPlan: boolean;
  canContinuePlan: boolean;
  inputSchema: ZodSchema;
  plannerSchema?: ZodSchema;
  produces: KbAgentToolProduces;
  evidenceRole: KbAgentEvidenceRole;
  allowedNext: readonly AgentActionName[];
  materializesTo?: readonly AgentActionName[];
  statePreconditions?: readonly string[];
  stateTransitions?: readonly {
    from: string;
    to: string;
    reason: string;
  }[];
  prompt: {
    title: string;
    capability: string;
    args: string;
    returns: string;
    boundary: string;
  };
  security: {
    readOnly: boolean;
    requiresCurrentDoc: boolean;
    exposesRealDocIds: false;
    exposesRealPaths: false;
    exposesRealBox: false;
    plannerMayProvideRealIds: false;
  };
  debug: {
    safeEventName: string;
    safeFields: string[];
  };
}
