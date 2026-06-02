/**
 * Candidate Quality Helper
 *
 * 纯函数判断 candidateDoc 是范围清单（inventory）还是强信号候选（strong candidate）。
 *
 * 职责：
 * - 用统一函数判断 candidateDoc 是否只是范围清单，还是由搜索/query/block 等强信号产生的候选
 * - 不调用 API、不调用 LLM、不执行工具、不读写 state
 * - 不写具体场景词规则
 * - 不按标题词判断，不屏蔽日记/Untitled/目录文档
 *
 * 规则：
 * 1. inventoryOnly === true 或 lifecycle === "inventory" 视为 inventory
 * 2. provenance === "list_scope_docs" 且 hasQuery !== true 视为 inventory
 * 3. provenance === "search_scope" 且 hasQuery === true 视为 strong candidate
 * 4. provenance === "list_scope_docs_query" 且 hasQuery === true 视为 strong candidate
 * 5. provenance === "structural_focus" 视为 strong candidate
 * 6. provenance === "doc_tree_context" 视为 strong candidate
 * 7. candidateBlocks 视为 strong signal，因为来自具体块命中
 */

import type { EvidenceWorkspace, CandidateDoc } from "./evidence-workspace";

export function isInventoryOnlyCandidateDoc(doc: CandidateDoc): boolean {
  if (doc.inventoryOnly === true) return true;
  if (doc.lifecycle === "inventory") return true;
  if (doc.provenance === "list_scope_docs" && doc.hasQuery !== true) return true;
  return false;
}

export function isQueryDrivenCandidateDoc(doc: CandidateDoc): boolean {
  return doc.hasQuery === true && doc.inventoryOnly !== true;
}

export function isSearchCandidateDoc(doc: CandidateDoc): boolean {
  return doc.provenance === "search_scope" && doc.hasQuery === true;
}

export function isStrongCandidateDoc(doc: CandidateDoc): boolean {
  if (doc.inventoryOnly === true) return false;
  if (doc.lifecycle === "inventory") return false;
  if (doc.provenance === "search_scope" && doc.hasQuery === true) return true;
  if (doc.provenance === "list_scope_docs_query" && doc.hasQuery === true) return true;
  if (doc.provenance === "structural_focus") return true;
  if (doc.provenance === "doc_tree_context") return true;
  if (doc.hasQuery === true) return true;
  return false;
}

export function getStrongCandidateDocs(workspace: EvidenceWorkspace): CandidateDoc[] {
  return workspace.candidateDocs.filter(isStrongCandidateDoc);
}

export function getInventoryOnlyCandidateDocs(workspace: EvidenceWorkspace): CandidateDoc[] {
  return workspace.candidateDocs.filter(isInventoryOnlyCandidateDoc);
}

export function hasStrongCandidates(workspace: EvidenceWorkspace): boolean {
  return workspace.candidateDocs.some(isStrongCandidateDoc);
}

export function hasOnlyInventoryCandidates(workspace: EvidenceWorkspace): boolean {
  if (workspace.candidateDocs.length === 0) return false;
  return workspace.candidateDocs.every(isInventoryOnlyCandidateDoc);
}

export function getStrongUnreadCandidateDocIds(workspace: EvidenceWorkspace, readDocIds: string[]): string[] {
  const readDocIdSet = new Set(readDocIds);
  return getStrongCandidateDocs(workspace)
    .filter((doc) => !readDocIdSet.has(doc.docId))
    .map((doc) => doc.docId);
}

export function getDocIdsFromCandidateBlocks(workspace: EvidenceWorkspace, readDocIds: string[]): string[] {
  const readDocIdSet = new Set(readDocIds);
  const blockDocIds = workspace.candidateBlocks
    .map((block) => block.docId)
    .filter((docId) => !readDocIdSet.has(docId));
  return [...new Set(blockDocIds)];
}

/**
 * 从 candidateBlocks 聚合 docIds，并按 candidateDocs 的分数排序。
 * 
 * 规则：
 * 1. 从 candidateBlocks 提取未读的 docIds
 * 2. 如果 docId 在 candidateDocs 中存在，按 candidateDocs 的分数排序
 * 3. 如果 docId 不在 candidateDocs 中，保留但排在最后
 */
export function getDocIdsFromCandidateBlocksWithDocScore(
  workspace: EvidenceWorkspace,
  readDocIds: string[]
): string[] {
  const readDocIdSet = new Set(readDocIds);
  
  // 从 blocks 聚合未读 docIds
  const blockDocIds = workspace.candidateBlocks
    .map((block) => block.docId)
    .filter((docId) => docId && !readDocIdSet.has(docId));
  
  const uniqueBlockDocIds = [...new Set(blockDocIds)];
  if (uniqueBlockDocIds.length === 0) return [];
  
  // 构建 candidateDocs 的分数映射
  const docScoreMap = new Map<string, number>();
  for (const doc of workspace.candidateDocs) {
    if (!docScoreMap.has(doc.docId)) {
      const score = typeof doc.aggregateScore === "number" ? doc.aggregateScore
        : typeof doc.relevanceScore === "number" ? doc.relevanceScore
        : typeof doc.score === "number" ? doc.score
        : 0;
      docScoreMap.set(doc.docId, score);
    }
  }
  
  // 分离在 candidateDocs 中和不在的 docIds
  const inCandidates: string[] = [];
  const notInCandidates: string[] = [];
  
  for (const docId of uniqueBlockDocIds) {
    if (docScoreMap.has(docId)) {
      inCandidates.push(docId);
    } else {
      notInCandidates.push(docId);
    }
  }
  
  // 按分数排序在 candidateDocs 中的 docIds
  inCandidates.sort((a, b) => (docScoreMap.get(b) ?? 0) - (docScoreMap.get(a) ?? 0));
  
  // 合并：有分数的在前，无分数的在后
  return [...inCandidates, ...notInCandidates];
}

/**
 * 从 candidateBlocks 聚合 docIds，但只保留能在 candidateDocs 中找到的（非 inventoryOnly）。
 * 用于 doc-first 路径：block-derived docIds 必须能映射到可读 candidateDocs 才优先进入 read_docs。
 */
export function getMappedBlockDerivedCandidateDocIds(
  workspace: EvidenceWorkspace,
  readDocIds: string[],
  failedReadDocIds?: Set<string>
): string[] {
  const readDocIdSet = new Set(readDocIds);
  const failedSet = failedReadDocIds ?? new Set<string>();
  
  // 构建可读 candidateDocs 的 docId 集合（排除 inventoryOnly）
  const readableCandidateDocIds = new Set<string>();
  const docScoreMap = new Map<string, number>();
  for (const doc of workspace.candidateDocs) {
    if (isInventoryOnlyCandidateDoc(doc)) continue;
    if (readDocIdSet.has(doc.docId) || failedSet.has(doc.docId)) continue;
    readableCandidateDocIds.add(doc.docId);
    if (!docScoreMap.has(doc.docId)) {
      const score = typeof doc.aggregateScore === "number" ? doc.aggregateScore
        : typeof doc.relevanceScore === "number" ? doc.relevanceScore
        : typeof doc.score === "number" ? doc.score
        : 0;
      docScoreMap.set(doc.docId, score);
    }
  }
  
  // 从 blocks 提取 docId，只保留在 readableCandidateDocIds 中的
  const mappedDocIds = workspace.candidateBlocks
    .map((block) => block.docId)
    .filter((docId) => docId && readableCandidateDocIds.has(docId));
  
  const uniqueMapped = [...new Set(mappedDocIds)];
  uniqueMapped.sort((a, b) => (docScoreMap.get(b) ?? 0) - (docScoreMap.get(a) ?? 0));
  return uniqueMapped;
}

/**
 * 从 candidateBlocks 聚合 docIds，只保留不能在 candidateDocs 中找到的（兜底用）。
 */
export function getUnmappedBlockDocIds(
  workspace: EvidenceWorkspace,
  readDocIds: string[],
  failedReadDocIds?: Set<string>
): string[] {
  const readDocIdSet = new Set(readDocIds);
  const failedSet = failedReadDocIds ?? new Set<string>();
  
  const candidateDocIdSet = new Set<string>();
  for (const doc of workspace.candidateDocs) {
    candidateDocIdSet.add(doc.docId);
  }
  
  const unmappedDocIds = workspace.candidateBlocks
    .map((block) => block.docId)
    .filter((docId) => docId && !readDocIdSet.has(docId) && !failedSet.has(docId) && !candidateDocIdSet.has(docId));
  
  return [...new Set(unmappedDocIds)];
}

/**
 * 判断是否存在可读的 candidateDocs（排除 inventoryOnly、已读、失败）。
 */
export function hasReadableCandidateDocs(
  workspace: EvidenceWorkspace,
  readDocIds: Set<string>,
  failedReadDocIds?: Set<string>
): boolean {
  const failedSet = failedReadDocIds ?? new Set<string>();
  return workspace.candidateDocs.some(
    (d) => !isInventoryOnlyCandidateDoc(d) && !readDocIds.has(d.docId) && !failedSet.has(d.docId)
  );
}

/**
 * 获取未读的非 inventory candidateDoc 数量。
 */
export function getUnreadCandidateDocCount(
  workspace: EvidenceWorkspace,
  readDocIds: Set<string>,
  failedReadDocIds?: Set<string>
): number {
  const failedSet = failedReadDocIds ?? new Set<string>();
  return workspace.candidateDocs.filter(
    (d) => !isInventoryOnlyCandidateDoc(d) && !readDocIds.has(d.docId) && !failedSet.has(d.docId)
  ).length;
}
