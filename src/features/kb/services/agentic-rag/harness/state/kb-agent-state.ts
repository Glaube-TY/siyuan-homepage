import type { AgentActionName } from "../../actions/action-types";
import type { AgenticRagState } from "../../graph/state";

export type KbAgentStateName =
  | "TURN_STARTED"
  | "SCOPE_RESOLVED"
  | "NEEDS_KB"
  | "NO_KB_REQUIRED"
  | "MAP_REQUIRED"
  | "MAP_LOADED"
  | "FOCUS_REQUIRED"
  | "FOCUS_SET"
  | "SEARCH_REQUIRED"
  | "SEARCH_DONE"
  | "CANDIDATES_READY"
  | "READ_REQUIRED"
  | "EVIDENCE_READ"
  | "TREE_EXPANSION_REQUIRED"
  | "LINK_EXPANSION_REQUIRED"
  | "EVIDENCE_SUFFICIENT"
  | "EVIDENCE_INSUFFICIENT_WITH_OPTIONS"
  | "EVIDENCE_INSUFFICIENT_FINAL"
  | "ANSWER_READY"
  | "FINALIZED";

export interface KbAgentStateContext {
  state: KbAgentStateName;
  reason: string;
  scopeType: string;
  needsKnowledgeBase: boolean;
  hasKnowledgeMap: boolean;
  hasActiveFocusScope: boolean;
  candidateDocCount: number;
  candidateBlockCount: number;
  readDocCount: number;
  readBlockContextCount: number;
  evidenceItemCount: number;
  evidenceTotalChars: number;
  searchCallCount: number;
  readBudgetRemaining: number;
  searchBudgetRemaining: number;
  blockBudgetRemaining: number;
  hasStructurePack: boolean;
  hasCandidatePack: boolean;
  hasEvidencePack: boolean;
  lastActionType?: AgentActionName;
  lastActionSuccess?: boolean;
  lastErrorType?: string;
  activeToolFamily?: string;
  allowedActions: AgentActionName[];
  forbiddenActions: AgentActionName[];
}

export interface DeriveKbAgentStateContextInput {
  state: AgenticRagState;
}
