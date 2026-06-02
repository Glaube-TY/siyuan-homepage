import type { AgenticRagState } from "../../graph/state";
import { deriveKbAgentStateContext } from "../state/state-machine";
import type { PlannerContextPack, PreviousEvidencePack } from "./context-pack-types";
import { buildCandidatePack } from "./candidate-pack";
import { buildStructurePack } from "./structure-pack";
import { pushAgentDebugEvent } from "../../debug/agentic-rag-debug";
import { buildPreviousEvidenceHandleIndex } from "./previous-evidence-handle-index";

function buildPreviousEvidencePack(state: AgenticRagState): PreviousEvidencePack | undefined {
  const index = buildPreviousEvidenceHandleIndex(
    state.workspace,
    state.followUpContext,
    state.runtime?.recentContext,
  );

  if (!index || index.readableCount === 0) {
    return undefined;
  }

  const safeHandles = index.items.map((i) => i.handle);
  const items = index.items.map((item) => ({
    handle: item.handle,
    title: item.title,
    turnIndex: item.turnIndex,
    sourceKind: item.sourceKind,
    readable: true,
    alreadyRead: index.handleToDocId.has(item.handle) && (state.workspace?.readDocuments ?? []).some(
      (d) => d.docId === index.handleToDocId.get(item.handle),
    ),
  }));

  const uniqueDocIds = new Set(index.items.map((i) => index.handleToDocId.get(i.handle)).filter(Boolean));
  const duplicateDocIdCollapsedCount = index.readableCount - uniqueDocIds.size;

  pushAgentDebugEvent("PREVIOUS_EVIDENCE_PACK_BUILT_SAFE", {
    readableCount: index.readableCount,
    uniqueDocCount: uniqueDocIds.size,
    duplicateDocIdCollapsedCount,
    totalDisplayedReferenceCount: index.totalDisplayedCount,
    nonReadableReferenceCount: index.nonReadableCount,
    handleCount: safeHandles.length,
    alreadyReadCount: index.alreadyReadCount,
    source: index.items[0]?.sourceKind !== undefined ? "conversation_used_references" : "followUp_context",
  }, "info");

  return {
    readableCount: index.readableCount,
    uniqueDocCount: uniqueDocIds.size,
    totalDisplayedReferenceCount: index.totalDisplayedCount,
    nonReadableReferenceCount: index.nonReadableCount,
    hasPreviousReferences: true,
    safeHandles,
    items,
  };
}

export function buildPlannerContextPack(input: {
  state: AgenticRagState;
}): PlannerContextPack {
  const { state } = input;
  const stateContext = deriveKbAgentStateContext({ state });
  const structurePack = buildStructurePack({ workspace: state.workspace });
  const candidatePack = buildCandidatePack({
    workspace: state.workspace,
    readDocuments: state.workspace.readDocuments,
    query: state.question,
  });
  const previousEvidencePack = buildPreviousEvidencePack(state);

  const hasKnowledgeMap = state.workspace.knowledgeMap?.loaded === true;
  const knowledgeMapNodeCount = state.workspace.knowledgeMap?.returnedNodeCount ?? 0;
  const unreadReadableCandidateCount = candidatePack.readableCandidateUnreadCount;

  const lastAction = state.actionHistory.length > 0 ? state.actionHistory[state.actionHistory.length - 1] : undefined;
  const lastActionType = lastAction?.type;

  let lastActionResultKind: "success" | "zero_hits" | "candidates_added" | "evidence_added" | "no_state_change" | "validation_failed" | undefined;
  if (lastActionType) {
    if (state.lastActionValidationError) {
      lastActionResultKind = "validation_failed";
    } else if (state.lastObservation?.error) {
      lastActionResultKind = "no_state_change";
    } else if (lastActionType === "read_docs" || lastActionType === "read_block_context" || lastActionType === "read_candidate_docs" || lastActionType === "read_previous_evidence") {
      lastActionResultKind = "evidence_added";
    } else if (lastActionType === "search_scope" || lastActionType === "list_scope_docs" || lastActionType === "focus_doc_scope") {
      const candidateCount = state.workspace.candidateDocs.length;
      lastActionResultKind = candidateCount > 0 ? "candidates_added" : "zero_hits";
    } else {
      lastActionResultKind = "success";
    }
  }

  const previousEvidenceReadableCount = previousEvidencePack?.readableCount ?? 0;
  const previousEvidenceUniqueDocCount = previousEvidencePack?.uniqueDocCount ?? 0;
  const previousEvidenceAlreadyReadCount = previousEvidencePack?.items.filter((i) => i.alreadyRead).length ?? 0;
  const previousEvidenceUnreadCount = previousEvidenceReadableCount - previousEvidenceAlreadyReadCount;
  const hasPreviousEvidence = (previousEvidencePack?.hasPreviousReferences ?? false) && previousEvidenceReadableCount > 0;

  const searchTracking = state.searchObservationTracking;
  const consecutiveZeroHitSearchCount = searchTracking?.consecutiveZeroHitSearchCount ?? 0;
  const totalZeroHitSearchCount = searchTracking?.totalZeroHitSearchCount ?? 0;
  const consecutiveNoStateChangeCount = searchTracking?.consecutiveNoStateChangeCount ?? 0;
  const lastSearchAddedCandidateCount = searchTracking?.lastSearchAddedCandidateCount ?? 0;

  pushAgentDebugEvent("PLANNER_STATE_OBSERVATION_SAFE", {
    hasKnowledgeMap,
    knowledgeMapNodeCount,
    unreadReadableCandidateCount,
    lastActionType: lastActionType ?? "none",
    lastActionResultKind: lastActionResultKind ?? "none",
    actionHistoryCount: state.actionHistory.length,
    previousEvidenceReadableCount,
    previousEvidenceUniqueDocCount,
    previousEvidenceUnreadCount,
    previousEvidenceAlreadyReadCount,
    hasPreviousEvidence,
    consecutiveZeroHitSearchCount,
    totalZeroHitSearchCount,
    consecutiveNoStateChangeCount,
    lastSearchAddedCandidateCount,
  }, "info");

  return {
    turn: {
      question: state.question,
      needsKnowledgeBase: stateContext.needsKnowledgeBase,
    },
    state: {
      current: stateContext.state,
      allowedActions: stateContext.allowedActions,
      forbiddenActions: stateContext.forbiddenActions,
      reason: stateContext.reason,
    },
    structurePack: structurePack.loaded ? structurePack : undefined,
    candidatePack: candidatePack.candidateDocCount > 0 || candidatePack.candidateBlockCount > 0 ? candidatePack : undefined,
    previousEvidencePack,
    evidenceSummary: {
      readDocCount: stateContext.readDocCount,
      readBlockContextCount: stateContext.readBlockContextCount,
      evidenceItemCount: stateContext.evidenceItemCount,
      hasEnoughEvidence: stateContext.evidenceItemCount > 0,
    },
    budgets: {
      searchRemaining: stateContext.searchBudgetRemaining,
      readRemaining: stateContext.readBudgetRemaining,
      blockRemaining: stateContext.blockBudgetRemaining,
    },
    turnObservation: {
      hasKnowledgeMap,
      knowledgeMapNodeCount,
      unreadReadableCandidateCount,
      lastActionType,
      lastActionResultKind,
      lastActionCandidateDelta: undefined,
      lastActionReadDelta: undefined,
      previousEvidenceReadableCount,
      previousEvidenceUniqueDocCount,
      previousEvidenceUnreadCount,
      previousEvidenceAlreadyReadCount,
      hasPreviousEvidence,
      consecutiveZeroHitSearchCount,
      totalZeroHitSearchCount,
      consecutiveNoStateChangeCount,
      lastSearchAddedCandidateCount,
    },
  };
}

export function summarizePlannerContextPack(pack: PlannerContextPack): Record<string, unknown> {
  return {
    state: pack.state.current,
    allowedActions: pack.state.allowedActions,
    structureItemCount: pack.structurePack?.items.length ?? 0,
    candidateDocCount: pack.candidatePack?.candidateDocCount ?? 0,
    candidateBlockCount: pack.candidatePack?.candidateBlockCount ?? 0,
    previousEvidenceCount: pack.previousEvidencePack?.readableCount ?? 0,
    hasPreviousEvidence: pack.previousEvidencePack?.hasPreviousReferences ?? false,
    evidenceItemCount: pack.evidenceSummary.evidenceItemCount,
    searchRemaining: pack.budgets.searchRemaining,
    readRemaining: pack.budgets.readRemaining,
    blockRemaining: pack.budgets.blockRemaining,
  };
}
