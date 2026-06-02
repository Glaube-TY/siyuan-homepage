import type { AgentActionName } from "../../actions/action-types";
import type { KbAgentStateName } from "../state/kb-agent-state";

export type StructureRelationToFocus =
  | "root"
  | "ancestor"
  | "descendant"
  | "sibling"
  | "branch_root"
  | "structural_candidate";

export interface StructurePackItem {
  title: string;
  titlePath?: string;
  relationToFocus: StructureRelationToFocus;
  structuralReason: string;
  shouldRead: boolean;
  readPriority: number;
  source: "knowledge_map" | "focus_doc_scope" | "doc_tree_context";
}

export interface StructurePack {
  loaded: boolean;
  focusedRootTitle?: string;
  focusedRootTitlePath?: string;
  relationRules: string[];
  items: StructurePackItem[];
  summaryText: string;
  warning?: string;
}

export interface CandidatePackItem {
  safeIndex: number;
  title: string;
  titlePath?: string;
  provenance:
    | "structural_focus"
    | "search_scope"
    | "list_scope_docs"
    | "doc_tree_context"
    | "conversation_reference";
  relationToFocus?: string;
  structuralReason?: string;
  relevanceScore?: number;
  readPriority: number;
  alreadyRead: boolean;
  shouldRead: boolean;
  contentHint?: { hasText: boolean; chars: number; hash?: string };
}

export interface CandidatePack {
  candidateDocCount: number;
  strongCandidateDocCount: number;
  inventoryOnlyCandidateCount: number;
  readableCandidateUnreadCount: number;
  candidateBlockCount: number;
  unreadCandidateDocCount: number;
  unreadCandidateBlockCount: number;
  items: CandidatePackItem[];
  summaryText: string;
}

export interface EvidencePackItem {
  handle: string;
  docTitle: string;
  titlePath?: string;
  readLevel: "document" | "block_context";
  sourceRole: "direct_evidence" | "structural_evidence" | "supporting_context";
  content: string;
  contentChars: number;
  relationToFocus?: string;
  structuralReason?: string;
  citationEligible: boolean;
}

export interface EvidencePack {
  itemCount: number;
  totalContentChars: number;
  compacted: boolean;
  items: EvidencePackItem[];
  evidenceMode: "with_evidence" | "insufficient_evidence" | "without_kb_evidence";
  summaryText: string;
}

export interface PreviousEvidencePackItem {
  handle: string;
  title?: string;
  turnIndex?: number;
  sourceKind?: string;
  readable: boolean;
  alreadyRead: boolean;
}

export interface PreviousEvidencePack {
  readableCount: number;
  uniqueDocCount: number;
  totalDisplayedReferenceCount: number;
  nonReadableReferenceCount: number;
  hasPreviousReferences: boolean;
  safeHandles: string[];
  items: PreviousEvidencePackItem[];
}

export interface PlannerContextPack {
  turn: {
    question: string;
    needsKnowledgeBase: boolean;
  };
  state: {
    current: KbAgentStateName;
    allowedActions: AgentActionName[];
    forbiddenActions: AgentActionName[];
    reason: string;
  };
  structurePack?: StructurePack;
  candidatePack?: CandidatePack;
  previousEvidencePack?: PreviousEvidencePack;
  evidenceSummary: {
    readDocCount: number;
    readBlockContextCount: number;
    evidenceItemCount: number;
    hasEnoughEvidence: boolean;
  };
  budgets: {
    searchRemaining: number;
    readRemaining: number;
    blockRemaining: number;
  };
  turnObservation?: {
    hasKnowledgeMap: boolean;
    knowledgeMapNodeCount: number;
    unreadReadableCandidateCount: number;
    lastActionType?: string;
    lastActionResultKind?: "success" | "zero_hits" | "candidates_added" | "evidence_added" | "no_state_change" | "validation_failed";
    lastActionCandidateDelta?: number;
    lastActionReadDelta?: number;
    previousEvidenceReadableCount: number;
    previousEvidenceUniqueDocCount: number;
    previousEvidenceUnreadCount: number;
    previousEvidenceAlreadyReadCount: number;
    hasPreviousEvidence: boolean;
    consecutiveZeroHitSearchCount: number;
    totalZeroHitSearchCount: number;
    consecutiveNoStateChangeCount: number;
    lastSearchAddedCandidateCount: number;
  };
}

export interface ComposeContextPack {
  question: string;
  structureSummary?: string;
  evidencePack: EvidencePack;
  answerPolicy: {
    mustUseEvidence: boolean;
    mayUseStructureAsRelevanceExplanation: boolean;
    mustNotTreatStructureAsContentEvidence: boolean;
    insufficientEvidenceBehavior: string;
  };
  citationPolicy: {
    includeFooterReferences: boolean;
    preferUsedEvidenceDocs: boolean;
  };
}
