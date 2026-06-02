import type { EvidenceGateDecision } from "../../evidence/evidence-gate";
import type { AgenticRagState } from "../../graph/state";

export interface EvidenceGateV2Result {
  status: "sufficient" | "insufficient_with_options" | "insufficient_final";
  reasons: string[];
  missing:
    | "no_evidence"
    | "only_structure"
    | "only_candidates"
    | "not_enough_sources"
    | "not_enough_chars"
    | "needs_tree_expansion"
    | "needs_link_expansion"
    | "none";
}

function hasEvidence(state: AgenticRagState): boolean {
  return state.workspace.readDocuments.length > 0 || state.workspace.readBlockContexts.length > 0;
}

function hasCandidates(state: AgenticRagState): boolean {
  return state.workspace.candidateDocs.length > 0 || state.workspace.candidateBlocks.length > 0;
}

function hasStructureOnly(state: AgenticRagState): boolean {
  return !hasEvidence(state) && !hasCandidates(state) && (
    state.workspace.knowledgeMap?.loaded === true || !!state.workspace.activeFocusScope
  );
}

function hasRecoverableBudget(state: AgenticRagState): boolean {
  const remainingRead = Math.max(0, (state.budget.maxTotalResearchDocs ?? state.budget.maxReadDocs ?? 0) - state.workspace.readDocuments.length);
  const remainingSearch = Math.max(0, (state.budget.maxSearchCalls ?? 0) - (state.counters.searchCallCount ?? 0));
  const remainingBlocks = Math.max(0, (state.budget.maxBlockContexts ?? 0) - state.workspace.readBlockContexts.length);
  return remainingRead > 0 || remainingSearch > 0 || remainingBlocks > 0;
}

function hasAvailableStructuralPaths(state: AgenticRagState): {
  hasPaths: boolean;
  pathCount: number;
  paths: string[];
} {
  const paths: string[] = [];
  const remainingRead = Math.max(0, (state.budget.maxTotalResearchDocs ?? state.budget.maxReadDocs ?? 0) - state.workspace.readDocuments.length);
  const remainingBlocks = Math.max(0, (state.budget.maxBlockContexts ?? 0) - state.workspace.readBlockContexts.length);

  if (state.workspace.knowledgeMap?.loaded === true) {
    paths.push("knowledgeMap_loaded");
  }
  if (state.workspace.activeFocusScope) {
    paths.push("activeFocusScope");
  }
  const inventoryOnlyCount = state.workspace.candidateDocs.filter(
    (d) => d.inventoryOnly || d.lifecycle === "inventory"
  ).length;
  if (inventoryOnlyCount > 0) {
    paths.push(`inventoryOnly_candidates=${inventoryOnlyCount}`);
  }
  const readDocIdSet = new Set(state.workspace.readDocuments.map((d) => d.docId));
  const readableUnreadCount = state.workspace.candidateDocs.filter(
    (d) => !d.inventoryOnly && d.lifecycle !== "inventory" && !readDocIdSet.has(d.docId)
  ).length;
  if (readableUnreadCount > 0 && remainingRead > 0) {
    paths.push(`readable_unread=${readableUnreadCount}`);
  }
  if (state.workspace.candidateBlocks.length > 0 && remainingBlocks > 0) {
    paths.push(`candidateBlocks=${state.workspace.candidateBlocks.length}`);
  }

  return {
    hasPaths: paths.length > 0,
    pathCount: paths.length,
    paths,
  };
}

export function mapEvidenceGateDecisionToV2(input: {
  decision: EvidenceGateDecision;
  state: AgenticRagState;
  totalContentChars?: number;
}): EvidenceGateV2Result {
  const { decision, state } = input;
  const evidenceExists = hasEvidence(state);
  const candidatesExist = hasCandidates(state);
  const hasBudgetRemaining = hasRecoverableBudget(state);
  const structuralPaths = hasAvailableStructuralPaths(state);
  const readDocCount = state.workspace.readDocuments.length;

  if (evidenceExists) {
    return {
      status: "sufficient",
      reasons: [
        ...decision.reasons,
        `readDocCount=${readDocCount}, evidence exists`,
      ],
      missing: "none",
    };
  }

  // 没有 read evidence 时的判断
  // budget_exhausted 不应无条件映射为 insufficient_final
  // 只有当 search/read/block/structure/navigation/focus 路径都不可继续时才允许 insufficient_final
  const isBudgetExhausted = decision.status === "budget_exhausted";
  const allPathsExhausted = !hasBudgetRemaining && !structuralPaths.hasPaths;

  if ((isBudgetExhausted && allPathsExhausted) || (decision.shouldAnswer && allPathsExhausted) || (!hasBudgetRemaining && !structuralPaths.hasPaths)) {
    return {
      status: "insufficient_final",
      reasons: [...decision.reasons, ...structuralPaths.paths.length > 0 ? [`structuralPaths=${structuralPaths.paths.join(",")}`] : ["all_paths_exhausted"]],
      missing: candidatesExist ? "only_candidates" : hasStructureOnly(state) ? "only_structure" : "no_evidence",
    };
  }

  // budget_exhausted 但仍有结构性路径可探索
  return {
    status: "insufficient_with_options",
    reasons: [...decision.reasons, `structuralPathCount=${structuralPaths.pathCount}`],
    missing: candidatesExist ? "only_candidates" : hasStructureOnly(state) ? "only_structure" : "no_evidence",
  };
}
