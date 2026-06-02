import type { KbAgentTraceEventType } from "../trace/trace-event";

export interface ExpectedTrace {
  mustIncludeEvents: KbAgentTraceEventType[];
  mustNotIncludeEvents?: KbAgentTraceEventType[];
  mustIncludeActionTypes?: string[];
  mustNotIncludeActionTypes?: string[];
  mustIncludeActionSequence?: string[];
  mustIncludeStates?: string[];
  mustNotIncludeStates?: string[];
  minReadDocCount?: number;
  minEvidenceItemCount?: number;
  minCandidateDocCount?: number;
  maxInvalidActionCount?: number;
  mustNotAnswerBeforeEvidence?: boolean;
}
