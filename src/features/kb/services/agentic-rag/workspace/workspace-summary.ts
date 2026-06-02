/**
 * Workspace Summary
 *
 * 输出给后续 controller prompt 使用的轻量 EvidenceWorkspace 摘要。
 *
 * 职责：
 * - 输出 candidate doc/block 数量、已读文档标题、块上下文数量、大纲数量、recent evidence 数量、warnings、coverage
 * - 不输出全文内容，不输出 sourceBlockIds 全量
 * - 不写具体问法规则
 */

import type { EvidenceWorkspace } from "./evidence-workspace";
import type { SafeTextMeta } from "../debug/agentic-rag-debug";
import { buildSourceCoverageSummary } from "./source-coverage";

export interface EvidenceWorkspaceSummaryOptions {
  maxReadDocTitles?: number;
  maxWarnings?: number;
  maxCandidateDocPreviews?: number;
  maxCandidateBlockPreviews?: number;
  maxBlockPreviewChars?: number;
}

export interface CandidateDocPreview {
  docId: string;
  title: string;
  titlePath?: string;
  parentTitles?: string[];
  updated?: string;
  source?: string;
  path?: string;
  provenance?: string;
  sourceQueryMeta?: SafeTextMeta;
  hasQuery?: boolean;
  inventoryOnly?: boolean;
  lifecycle?: string;
  relevanceScore?: number;
}

export interface CandidateBlockPreview {
  blockId: string;
  docId: string;
  docTitle: string;
  content: string;
  source?: string;
}

export interface EvidenceWorkspaceSummary {
  candidateDocCount: number;
  candidateBlockCount: number;
  candidateDocPreviews: CandidateDocPreview[];
  candidateBlockPreviews: CandidateBlockPreview[];
  readDocCount: number;
  readDocTitles: string[];
  readBlockContextCount: number;
  outlineCount: number;
  recentEvidenceCount: number;
  metadataHitsCount: number;
  linkGraphNodeCount: number;
  linkGraphEdgeCount: number;
  warnings: string[];
  coverage: {
    searchedQueryMetas: SafeTextMeta[];
    searchCallCount: number;
    readDocCount: number;
    readBlockContextCount: number;
    reusedRecentDocCount: number;
    listedDocCount: number;
  };
  sourceCoverage: {
    discoveredSourceCount: number;
    readSourceCount: number;
    unreadSourceCount: number;
    sourceCoverageRatio: number;
    unreadSourceDocIds: string[];
    readSourceDocIds: string[];
    matrix: Array<{
      docId: string;
      title: string;
      titlePath?: string;
      coverageLevel: string;
    }>;
    unreadSourcePreviews: Array<{
      docId: string;
      title: string;
      titlePath?: string;
      parentTitles?: string[];
      coverageLevel: string;
    }>;
  };
}

export interface PlannerCandidateDocPreview {
  title: string;
  titlePath?: string;
  parentTitles?: string[];
  provenance?: string;
  sourceQueryMeta?: SafeTextMeta;
  hasQuery?: boolean;
  inventoryOnly?: boolean;
  lifecycle?: string;
  relevanceScore?: number;
}

export interface PlannerCandidateBlockPreview {
  docTitle: string;
  content: string;
  source?: string;
}

export interface PlannerKnowledgeMapPreview {
  handle: string;
  title: string;
  titlePath?: string;
  depth: number;
  childCount?: number;
}

export interface PlannerWorkspaceSummary {
  candidateDocCount: number;
  candidateBlockCount: number;
  candidateDocPreviews: PlannerCandidateDocPreview[];
  candidateBlockPreviews: PlannerCandidateBlockPreview[];
  readDocCount: number;
  readDocTitles: string[];
  readBlockContextCount: number;
  outlineCount: number;
  recentEvidenceCount: number;
  warnings: string[];
  coverage: {
    searchedQueryMetas: SafeTextMeta[];
    searchCallCount: number;
    readDocCount: number;
    readBlockContextCount: number;
    reusedRecentDocCount: number;
    listedDocCount: number;
  };
  knowledgeMapLoaded: boolean;
  knowledgeMapReturnedNodeCount?: number;
  knowledgeMapMatchedNodeCount?: number;
  knowledgeMapPreviews?: PlannerKnowledgeMapPreview[];
  activeFocusScopeSet: boolean;
  activeFocusDocCount?: number;
  activeFocusMode?: string;
}

export function summarizeEvidenceWorkspaceForPlanner(
  workspace: EvidenceWorkspace,
  options?: EvidenceWorkspaceSummaryOptions
): PlannerWorkspaceSummary {
  const maxTitles = options?.maxReadDocTitles ?? 10;
  const maxWarnings = options?.maxWarnings ?? 5;
  const maxDocPreviews = options?.maxCandidateDocPreviews ?? 12;
  const maxBlockPreviews = options?.maxCandidateBlockPreviews ?? 8;
  const maxBlockChars = options?.maxBlockPreviewChars ?? 80;

  const candidateDocPreviews: PlannerCandidateDocPreview[] = workspace.candidateDocs.slice(0, maxDocPreviews).map((d) => ({
    title: d.title,
    titlePath: d.titlePath,
    parentTitles: d.parentTitles,
    provenance: d.provenance,
    sourceQueryMeta: d.sourceQueryMeta,
    hasQuery: d.hasQuery,
    inventoryOnly: d.inventoryOnly,
    lifecycle: d.lifecycle,
    relevanceScore: d.relevanceScore,
  }));

  const candidateBlockPreviews: PlannerCandidateBlockPreview[] = workspace.candidateBlocks.slice(0, maxBlockPreviews).map((b) => {
    const content = b.content && b.content.length > maxBlockChars ? b.content.slice(0, maxBlockChars) + "..." : (b.content || "");
    return {
      docTitle: b.docTitle,
      content,
      source: b.source,
    };
  });

  // 构建知识图谱安全预览（最多30条，按文档树返回顺序）
  const knowledgeMapPreviews: PlannerKnowledgeMapPreview[] = [];
  if (workspace.docHandleMappings && workspace.docHandleMappings.length > 0) {
    const mappings = workspace.docHandleMappings;
    
    for (const m of mappings.slice(0, 30)) {
      knowledgeMapPreviews.push({
        handle: m.handle,
        title: m.title,
        titlePath: m.titlePath,
        depth: m.depth,
        childCount: m.childCount,
      });
    }
  }

  return {
    candidateDocCount: workspace.candidateDocs.length,
    candidateBlockCount: workspace.candidateBlocks.length,
    candidateDocPreviews,
    candidateBlockPreviews,
    readDocCount: workspace.readDocuments.length,
    readDocTitles: workspace.readDocuments.slice(0, maxTitles).map((d) => d.title),
    readBlockContextCount: workspace.readBlockContexts.length,
    outlineCount: workspace.docOutlines.length,
    recentEvidenceCount: workspace.recentEvidence.length,
    warnings: workspace.warnings.slice(0, maxWarnings),
    coverage: {
      searchedQueryMetas: workspace.coverage.searchedQueryMetas,
      searchCallCount: workspace.coverage.searchCallCount,
      readDocCount: workspace.coverage.readDocCount,
      readBlockContextCount: workspace.coverage.readBlockContextCount,
      reusedRecentDocCount: workspace.coverage.reusedRecentDocCount,
      listedDocCount: workspace.coverage.listedDocCount,
    },
    knowledgeMapLoaded: !!workspace.knowledgeMap?.loaded,
    knowledgeMapReturnedNodeCount: workspace.knowledgeMap?.returnedNodeCount,
    knowledgeMapPreviews: knowledgeMapPreviews.length > 0 ? knowledgeMapPreviews : undefined,
    activeFocusScopeSet: !!workspace.activeFocusScope,
    activeFocusDocCount: workspace.activeFocusScope?.docIds.length,
    activeFocusMode: workspace.activeFocusScope?.mode,
  };
}

export function summarizeEvidenceWorkspace(
  workspace: EvidenceWorkspace,
  options?: EvidenceWorkspaceSummaryOptions
): EvidenceWorkspaceSummary {
  const maxTitles = options?.maxReadDocTitles ?? 10;
  const maxWarnings = options?.maxWarnings ?? 5;
  const maxDocPreviews = options?.maxCandidateDocPreviews ?? 12;
  const maxBlockPreviews = options?.maxCandidateBlockPreviews ?? 8;
  const maxBlockChars = options?.maxBlockPreviewChars ?? 80;

  const candidateDocPreviews: CandidateDocPreview[] = workspace.candidateDocs.slice(0, maxDocPreviews).map((d) => ({
    docId: d.docId,
    title: d.title,
    titlePath: d.titlePath,
    parentTitles: d.parentTitles,
    updated: d.updated,
    source: d.source,
    path: d.path,
    provenance: d.provenance,
    sourceQueryMeta: d.sourceQueryMeta,
    hasQuery: d.hasQuery,
    inventoryOnly: d.inventoryOnly,
    lifecycle: d.lifecycle,
    relevanceScore: d.relevanceScore,
  }));

  const candidateBlockPreviews: CandidateBlockPreview[] = workspace.candidateBlocks.slice(0, maxBlockPreviews).map((b) => {
    const content = b.content && b.content.length > maxBlockChars ? b.content.slice(0, maxBlockChars) + "..." : (b.content || "");
    return {
      blockId: b.blockId,
      docId: b.docId,
      docTitle: b.docTitle,
      content,
      source: b.source,
    };
  });

  const sourceCoverage = buildSourceCoverageSummary(workspace);
  const maxMatrixItems = 12;
  const maxUnreadPreviews = 8;

  const unreadSourcePreviews = sourceCoverage.matrix
    .filter((item) => item.coverageLevel !== "document" && item.coverageLevel !== "section")
    .slice(0, maxUnreadPreviews)
    .map((item) => ({
      docId: item.docId,
      title: item.title,
      titlePath: item.titlePath,
      parentTitles: item.parentTitles,
      coverageLevel: item.coverageLevel,
    }));

  const sourceCoverageSummary = {
    discoveredSourceCount: sourceCoverage.discoveredSourceCount,
    readSourceCount: sourceCoverage.readSourceCount,
    unreadSourceCount: sourceCoverage.unreadSourceCount,
    sourceCoverageRatio: sourceCoverage.sourceCoverageRatio,
    unreadSourceDocIds: sourceCoverage.unreadSourceDocIds,
    readSourceDocIds: sourceCoverage.readSourceDocIds,
    matrix: sourceCoverage.matrix.slice(0, maxMatrixItems).map((item) => ({
      docId: item.docId,
      title: item.title,
      titlePath: item.titlePath,
      coverageLevel: item.coverageLevel,
    })),
    unreadSourcePreviews,
  };

  return {
    candidateDocCount: workspace.candidateDocs.length,
    candidateBlockCount: workspace.candidateBlocks.length,
    candidateDocPreviews,
    candidateBlockPreviews,
    readDocCount: workspace.readDocuments.length,
    readDocTitles: workspace.readDocuments.slice(0, maxTitles).map((d) => d.title),
    readBlockContextCount: workspace.readBlockContexts.length,
    outlineCount: workspace.docOutlines.length,
    recentEvidenceCount: workspace.recentEvidence.length,
    metadataHitsCount: workspace.metadataHits.length,
    linkGraphNodeCount: workspace.linkGraph?.nodes.length ?? 0,
    linkGraphEdgeCount: workspace.linkGraph?.edges.length ?? 0,
    warnings: workspace.warnings.slice(0, maxWarnings),
    coverage: {
      searchedQueryMetas: workspace.coverage.searchedQueryMetas,
      searchCallCount: workspace.coverage.searchCallCount,
      readDocCount: workspace.coverage.readDocCount,
      readBlockContextCount: workspace.coverage.readBlockContextCount,
      reusedRecentDocCount: workspace.coverage.reusedRecentDocCount,
      listedDocCount: workspace.coverage.listedDocCount,
    },
    sourceCoverage: sourceCoverageSummary,
  };
}
