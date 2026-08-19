/**
 * Persistent, structured context compaction state.
 *
 * This is a projection of the transcript, not a replacement for it. The
 * complete transcript remains the source of truth and this snapshot may be
 * rebuilt whenever covered history is edited or deleted.
 */

export type ContextCompactionTrigger = "manual" | "auto" | "hard";

export interface ContextCompactionSnapshotState {
  currentGoal: string;
  userConstraints: string[];
  importantDecisions: string[];
  completedWork: string[];
  currentState: string[];
  unresolvedIssues: string[];
  nextActions: string[];
  importantReferences: string[];
  verifiedWriteOutcomes: string[];
}

export interface ContextCompactionSnapshot {
  version: 2;
  generation: number;
  createdAt: number;
  trigger: ContextCompactionTrigger;
  coveredThroughTurnIndex: number;
  coveredThroughMessageId: string;
  sourceHash: string;
  state: ContextCompactionSnapshotState;
  estimatedTokens?: number;
  stale?: boolean;
}

export const EMPTY_CONTEXT_COMPACTION_STATE: ContextCompactionSnapshotState = {
  currentGoal: "",
  userConstraints: [],
  importantDecisions: [],
  completedWork: [],
  currentState: [],
  unresolvedIssues: [],
  nextActions: [],
  importantReferences: [],
  verifiedWriteOutcomes: [],
};
