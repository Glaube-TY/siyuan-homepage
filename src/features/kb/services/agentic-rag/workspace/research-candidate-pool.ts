/**
 * Research Candidate Pool
 *
 * 候选池分页/批次阅读结构。
 *
 * 职责：
 * - 维护候选文档排序列表、已读/跳过状态
 * - 支持按批次从候选池中选取下一批未读文档
 * - 提供统一的未读候选计算，避免 gate/liveness/materializer 不一致
 * - 不输出真实 docId 到日志
 */

import type { EvidenceWorkspace, CandidateDoc } from "./evidence-workspace";
import type { FollowUpContext } from "../runtime/follow-up-context";

export interface ResearchCandidatePool {
  queryKey: string;
  candidateDocIdsInRankOrder: string[];
  readDocIds: string[];
  skippedDocIds: string[];
  exhausted: boolean;
  lastBatchSize: number;
  totalCandidateCount: number;
  batchCount: number;
}

export function createEmptyResearchCandidatePool(): ResearchCandidatePool {
  return {
    queryKey: "",
    candidateDocIdsInRankOrder: [],
    readDocIds: [],
    skippedDocIds: [],
    exhausted: false,
    lastBatchSize: 0,
    totalCandidateCount: 0,
    batchCount: 0,
  };
}

export function getNextBatchFromPool(
  pool: ResearchCandidatePool,
  batchSize: number,
  excludeDocIds: Set<string>
): { docIds: string[]; exhausted: boolean } {
  const readSet = new Set(pool.readDocIds);
  const skippedSet = new Set(pool.skippedDocIds);

  const remaining = pool.candidateDocIdsInRankOrder.filter(
    (id) => !readSet.has(id) && !skippedSet.has(id) && !excludeDocIds.has(id)
  );

  if (remaining.length === 0) {
    return { docIds: [], exhausted: true };
  }

  const batch = remaining.slice(0, batchSize);
  const exhausted = batch.length >= remaining.length;

  return { docIds: batch, exhausted };
}

export function markDocsAsReadInPool(
  pool: ResearchCandidatePool,
  docIds: string[]
): ResearchCandidatePool {
  const readSet = new Set(pool.readDocIds);
  for (const id of docIds) {
    readSet.add(id);
  }
  return {
    ...pool,
    readDocIds: [...readSet],
    lastBatchSize: docIds.length,
    batchCount: pool.batchCount + 1,
  };
}

export function mergeCandidateDocIdsIntoPool(
  pool: ResearchCandidatePool,
  newDocIds: string[],
  queryKey: string
): ResearchCandidatePool {
  const existingSet = new Set(pool.candidateDocIdsInRankOrder);
  const merged: string[] = [...pool.candidateDocIdsInRankOrder];
  for (const id of newDocIds) {
    if (!existingSet.has(id)) {
      merged.push(id);
      existingSet.add(id);
    }
  }
  return {
    ...pool,
    queryKey,
    candidateDocIdsInRankOrder: merged,
    totalCandidateCount: merged.length,
    exhausted: false,
    batchCount: pool.batchCount,
  };
}

export interface UnreadResearchCandidatesResult {
  unreadCandidates: CandidateDoc[];
  readDocCount: number;
  poolRemaining: number;
  workspaceCandidateCount: number;
}

export function getUnreadResearchCandidates(
  workspace: EvidenceWorkspace,
  _followUpContext?: FollowUpContext
): UnreadResearchCandidatesResult {
  const readDocIdSet = new Set<string>(workspace.readDocuments.map((d) => d.docId));
  const pool = workspace.researchCandidatePool;

  if (pool) {
    for (const id of pool.readDocIds) readDocIdSet.add(id);
    for (const id of pool.skippedDocIds) readDocIdSet.add(id);
  }

  const poolRemaining = pool
    ? pool.candidateDocIdsInRankOrder.length - pool.readDocIds.length - pool.skippedDocIds.length
    : 0;

  const unreadCandidates = workspace.candidateDocs.filter(
    (d) => !readDocIdSet.has(d.docId)
  );

  return {
    unreadCandidates,
    readDocCount: workspace.readDocuments.length,
    poolRemaining,
    workspaceCandidateCount: workspace.candidateDocs.length,
  };
}