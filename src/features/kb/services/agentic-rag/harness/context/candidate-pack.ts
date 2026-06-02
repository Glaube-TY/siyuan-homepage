/**
 * Candidate Pack Builder
 *
 * 构建候选包，排序仅基于非语义因素：
 * provenance、relationToFocus、alreadyRead、检索引擎原始分数、文档树结构。
 * 不理解 query 文本，不拆分 title，不做语义匹配。
 */

import type { EvidenceWorkspace } from "../../workspace/evidence-workspace";
import type { EvidenceDocument } from "../../workspace/evidence-workspace";
import type { CandidatePack, CandidatePackItem } from "./context-pack-types";
import { isStrongCandidateDoc, isInventoryOnlyCandidateDoc } from "../../workspace/candidate-quality";

function normalizeProvenance(value?: string): CandidatePackItem["provenance"] {
  switch (value) {
    case "structural_focus":
      return "structural_focus";
    case "list_scope_docs":
    case "list_scope_docs_query":
      return "list_scope_docs";
    case "doc_tree_context":
      return "doc_tree_context";
    case "previous_evidence":
      return "conversation_reference";
    case "search_scope":
    default:
      return "search_scope";
  }
}

function scoreCandidate(candidate: { aggregateScore?: number; relevanceScore?: number; score?: number }): number | undefined {
  if (typeof candidate.aggregateScore === "number" && !isNaN(candidate.aggregateScore)) return candidate.aggregateScore;
  if (typeof candidate.relevanceScore === "number" && !isNaN(candidate.relevanceScore)) return candidate.relevanceScore;
  if (typeof candidate.score === "number" && !isNaN(candidate.score)) return candidate.score;
  return undefined;
}

function computeReadPriority(
  item: {
    provenance?: string;
    aggregateScore?: number;
    relevanceScore?: number;
    score?: number;
    source?: string;
    relationToFocus?: string;
  },
): number {
  const provenance = normalizeProvenance(item.provenance ?? item.source);

  let basePriority: number;
  if (provenance === "structural_focus") {
    basePriority = 90;
  } else if (provenance === "doc_tree_context") {
    basePriority = 75;
  } else if (provenance === "list_scope_docs") {
    basePriority = 55;
  } else if (provenance === "conversation_reference") {
    basePriority = 20;
  } else {
    const score = scoreCandidate(item);
    basePriority = score !== undefined ? Math.max(30, Math.min(80, Math.round(score * 100))) : 40;
  }

  let structuralBonus = 0;
  if (item.relationToFocus === "branch_root" || item.relationToFocus === "root") {
    structuralBonus = 10;
  } else if (item.relationToFocus === "descendant") {
    structuralBonus = 5;
  }

  return Math.max(5, Math.min(100, basePriority + structuralBonus));
}

export function priorityFor(
  item: {
    provenance?: string;
    aggregateScore?: number;
    relevanceScore?: number;
    score?: number;
    source?: string;
    relationToFocus?: string;
  },
): number {
  return computeReadPriority(item);
}

export function buildCandidatePack(input: {
  workspace: EvidenceWorkspace;
  readDocuments: EvidenceDocument[];
  query?: string;
  maxItems?: number;
}): CandidatePack {
  const { workspace, readDocuments } = input;
  const maxItems = input.maxItems ?? 30;
  const readDocIds = new Set(readDocuments.map((doc) => doc.docId));

  const docItems: CandidatePackItem[] = workspace.candidateDocs.map((candidate, index) => {
    const provenance = normalizeProvenance((candidate as { provenance?: string }).provenance ?? candidate.source);
    const alreadyRead = readDocIds.has(candidate.docId);
    const relationToFocus = (candidate as { relationToFocus?: string }).relationToFocus;
    const structuralReason = (candidate as { structuralReason?: string }).structuralReason;

    return {
      safeIndex: index,
      title: candidate.title?.trim() || "Untitled document",
      titlePath: candidate.titlePath,
      provenance,
      relationToFocus,
      structuralReason,
      relevanceScore: scoreCandidate(candidate),
      readPriority: computeReadPriority({
        ...candidate,
        relationToFocus,
      }),
      alreadyRead,
      shouldRead: !alreadyRead,
      contentHint: candidate.sourceQueryMeta,
    };
  });

  const items = docItems
    .sort((a, b) => b.readPriority - a.readPriority)
    .slice(0, maxItems)
    .map((item, index) => ({ ...item, safeIndex: index }));

  const unreadCandidateDocCount = docItems.filter((item) => !item.alreadyRead).length;
  const unreadCandidateBlockCount = workspace.candidateBlocks.length;
  const strongCandidateDocCount = workspace.candidateDocs.filter(isStrongCandidateDoc).length;
  const inventoryOnlyCandidateCount = workspace.candidateDocs.filter(isInventoryOnlyCandidateDoc).length;
  const readableCandidateUnreadCount = workspace.candidateDocs.filter(
    (d) => !isInventoryOnlyCandidateDoc(d) && !readDocIds.has(d.docId)
  ).length;

  return {
    candidateDocCount: workspace.candidateDocs.length,
    strongCandidateDocCount,
    inventoryOnlyCandidateCount,
    readableCandidateUnreadCount,
    candidateBlockCount: workspace.candidateBlocks.length,
    unreadCandidateDocCount,
    unreadCandidateBlockCount,
    items,
    summaryText: `候选文档 ${workspace.candidateDocs.length} 个（${strongCandidateDocCount} 个可读候选，${inventoryOnlyCandidateCount} 个目录/导航），候选块 ${workspace.candidateBlocks.length} 个；${readableCandidateUnreadCount} 个可读候选未读。`,
  };
}
