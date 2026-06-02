/**
 * Agentic RAG Evidence Types
 *
 * 无 taskType 的证据包类型，不依赖 AgentTaskPlan / AgentTaskType。
 */

import type { SafeTextMeta } from "../debug/agentic-rag-debug";

export type AgenticReadLevel = "document" | "section" | "snippet" | "outline" | "recent";

export interface AgenticEvidenceItem {
  id: string;
  docId: string;
  docTitle: string;
  box?: string;
  path?: string;
  sourceBlockIds?: string[];
  readLevel: AgenticReadLevel;
  content: string;
  metadata?: Record<string, unknown>;
  truncated?: boolean;
}

export interface AgenticEvidencePack {
  items: AgenticEvidenceItem[];
  coverage: {
    selectedDocCount: number;
    readDocCount: number;
    readBlockContextCount: number;
    outlineCount: number;
    recentEvidenceCount: number;
    searchedQueryMetas: SafeTextMeta[];
    warnings: string[];
    candidateDocCount?: number;
    candidateBlockCount?: number;
    selectedEvidenceItemCount?: number;
    hasSubstantiveEvidence?: boolean;
    evidenceAvailability?: "available" | "empty";
    evidenceModeConflict?: boolean;
    discoveredSourceCount?: number;
    readSourceCount?: number;
    unreadSourceCount?: number;
    sourceCoverageRatio?: number;
  };
  evidenceMode: "with_evidence" | "insufficient_evidence" | "without_kb_evidence";
}
