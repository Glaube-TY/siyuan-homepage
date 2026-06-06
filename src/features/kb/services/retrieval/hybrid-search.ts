/**
 * Keyword + Fuzzy Retrieval - 统一检索框架
 * 
 * 架构设计：
 * 1. RetrievalScope: 可扩展的检索范围描述符
 * 2. RetrievalChannel: 检索子通道抽象（keyword, fts）
 * 3. RetrievalOrchestrator: 统一检索编排
 * 
 * 说明：
 * - 关键词/模糊检索统一走 siyuan-sql-retrieval
 */

import type { SearchHit } from "../../types/search";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";

// ==================== Scope Descriptor ====================

/** 检索范围类型 */
export type RetrievalScopeType = "whole_kb" | "notebook" | "doc_tree" | "doc";

/** 检索范围描述符基接口 */
export interface RetrievalScope {
  type: RetrievalScopeType;
}

/** 全库范围 */
export interface WholeKbScope extends RetrievalScope {
  type: "whole_kb";
}

/** 笔记本范围 */
export interface NotebookScope extends RetrievalScope {
  type: "notebook";
  notebookId: string;
  notebookName?: string;
}

/** 文档树范围（当前文档及其子文档） */
export interface DocTreeScope extends RetrievalScope {
  type: "doc_tree";
  rootDocId: string;
  rootDocTitle?: string;
  box: string;
}

/** 单文档范围 */
export interface DocScope extends RetrievalScope {
  type: "doc";
  docId: string;
}

/** 联合类型 */
export type AnyRetrievalScope = WholeKbScope | NotebookScope | DocTreeScope | DocScope;

// ==================== Channel Interface ====================

/** 检索通道配置 */
export interface ChannelConfig {
  enabled: boolean;
  weight: number;
}

/** Resolver 输出的文档元信息（轻量） */
interface ResolvedDocMeta {
  docId: string;
  title: string;
  /** 思源内部路径，用于范围过滤 */
  path: string;
  box: string;
}

/** Resolver 输出的共享数据 */
export interface ResolvedScopeData {
  docs: ResolvedDocMeta[];
  scope: AnyRetrievalScope;
}

/** 检索通道抽象 */
export interface RetrievalChannel {
  name: string;
  search(query: string, resolvedData: ResolvedScopeData, limit: number): Promise<SearchHit[]>;
}

// ==================== Hybrid Search Options & Result ====================

/** 检索选项 */
export interface HybridSearchOptions {
  limit?: number;
  channels?: {
    keyword?: ChannelConfig;
    fts?: ChannelConfig;
  };
  trace?: boolean;
  /** 要排除的文档路径列表（用于 incremental retrieval） */
  excludeDocPaths?: string[];
  /** 要排除的 block ID 列表（用于 incremental retrieval，优先于 excludeDocPaths） */
  excludeBlockIds?: string[];
  /**
   * Per-channel query override
   * - 若提供，对应通道将使用该 query 而非公共 query
   * - 若未提供，回退到公共 query
   */
  channelQueries?: {
    keyword?: string;
    fts?: string;
  };
  /**
   * Per-channel enabled override
   * - 若某路显式为 false，则该通道本轮不执行
   * - 若未提供，保持当前通道默认启用逻辑
   */
  channelEnabled?: {
    keyword?: boolean;
    fts?: boolean;
  };
  /**
   * Per-channel weight multipliers
   * - 在基础权重（CHANNEL_WEIGHTS）上乘以此倍率
   * - 不覆盖用户设置，只表达策略倾向
   * - 默认 1.0（无倍率）
   */
  channelWeightMultipliers?: {
    keyword?: number;
    fts?: number;
  };
  /**
   * 预加载的文档列表
   * - 如果提供，将直接使用这些 docs 构造 resolvedData，避免重复 SQL 加载
   * - 字段兼容 doc_id/docId 两种命名
   */
  preloadedDocs?: Array<{
    docId?: string;
    doc_id?: string;
    title?: string;
    path?: string;
    box?: string;
  }>;
}

/** Hybrid 候选 */
export interface HybridCandidate {
  docId: string;
  box: string;
  title: string;
  /** 思源内部路径 */
  path: string;
  type: "doc" | "heading" | "paragraph" | "listItem" | "quote" | "code" | "math" | "table" | "html";
  score: number;
  preview: string;
  sourceBlockIds: string[];
  backend: "keyword" | "fts";
}

export type RetrievalCandidate = HybridCandidate;

/** Doc 级聚合评分信息 */
export interface DocScoreInfo {
  maxScore: number;
  hitCount: number;
  hasDocHit: boolean;
  backends: Set<string>;
  /** 该文档下所有 block 的融合分数，用于计算 doc 级聚合 */
  blockScores: number[];
}

/** 检索结果 */
export interface HybridSearchResult {
  candidates: HybridCandidate[];
  docScores: Map<string, DocScoreInfo>;
  scope: AnyRetrievalScope;
  query: string;
}

// ==================== Scope Resolver ====================

/**
 * Scope Resolver - 将 scope 解析为各通道可用的数据
 */
export interface ScopeResolver {
  resolve(scope: AnyRetrievalScope): Promise<ResolvedScopeData>;
}

// ==================== Default Implementations ====================

import { CHANNEL_WEIGHTS, DOC_SCORE_WEIGHTS } from "../../constants/retrieval-config";

// 新增：思源 SQL 检索
import { searchBlocksKeyword, searchBlocksFuzzy } from "../siyuan-sql-retrieval";
import type { SearchScope } from "../siyuan-sql-retrieval/types";
import { scoreBlockHits } from "../siyuan-sql-retrieval/block-score";
import { buildRetrievalQueryVariants } from "../siyuan-sql-retrieval/query-variants";
import { sql } from "@/api";
import { buildDocumentCandidates } from "../siyuan-sql-retrieval/document-candidate-builder";

/**
 * 从思源 SQL 加载指定 scope 的文档列表
 */
async function loadDocsFromSql(scope: AnyRetrievalScope): Promise<Array<{ docId: string; title: string; path: string; box: string }>> {
  
  switch (scope.type) {
    case "whole_kb": {
      const sqlStmt = `
        SELECT id as docId, content as title, path, box
        FROM blocks
        WHERE type = 'd'
        ORDER BY updated DESC
      `;
      const rows = await sql(sqlStmt);
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        docId: r.docId || "",
        title: r.title || "",
        path: r.path || "",
        box: r.box || "",
      })).filter(d => d.docId);
    }
    
    case "notebook": {
      const escapedBox = scope.notebookId.replace(/'/g, "''");
      const sqlStmt = `
        SELECT id as docId, content as title, path, box
        FROM blocks
        WHERE box = '${escapedBox}' AND type = 'd'
        ORDER BY updated DESC
      `;
      const rows = await sql(sqlStmt);
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        docId: r.docId || "",
        title: r.title || "",
        path: r.path || "",
        box: r.box || "",
      })).filter(d => d.docId);
    }
    
    case "doc_tree": {
      const { rootDocId, box } = scope;
      const escapedBox = box.replace(/'/g, "''");
      const escapedRootDocId = rootDocId.replace(/'/g, "''");
      const sqlStmt = `
        SELECT id as docId, content as title, path, box
        FROM blocks
        WHERE box = '${escapedBox}' AND type = 'd'
          AND (id = '${escapedRootDocId}' OR path LIKE '%/${escapedRootDocId}/%')
        ORDER BY updated DESC
      `;
      const rows = await sql(sqlStmt);
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        docId: r.docId || "",
        title: r.title || "",
        path: r.path || "",
        box: r.box || "",
      })).filter(d => d.docId);
    }
    
    case "doc":
    default:
      return [];
  }
}

/**
 * 将 AnyRetrievalScope 转换为 SQL SearchScope
 */
function convertScopeToSearchScope(scope: AnyRetrievalScope): SearchScope | null {
  switch (scope.type) {
    case "whole_kb":
      return { mode: "whole_kb" };
    case "notebook":
      return { mode: "notebook", box: scope.notebookId };
    case "doc_tree":
      return { mode: "doc_tree", box: scope.box, docId: scope.rootDocId };
    case "doc":
      return { mode: "doc", docId: scope.docId };
    default:
      return null;
  }
}

/**
 * 归一化预加载的 docs，兼容 doc_id/docId 两种命名
 * - docId = doc.docId || doc.doc_id
 * - title/path/box 为空时给空字符串
 * - 过滤掉无 docId 的项
 */
function normalizePreloadedDocs(
  preloadedDocs: Array<{ docId?: string; doc_id?: string; title?: string; path?: string; box?: string }> | undefined
): ResolvedDocMeta[] {
  if (!preloadedDocs || preloadedDocs.length === 0) {
    return [];
  }

  return preloadedDocs
    .map((doc) => {
      const docId = doc.docId || doc.doc_id;
      if (!docId) return null;
      return {
        docId,
        title: doc.title || "",
        path: doc.path || "",
        box: doc.box || "",
      };
    })
    .filter((d): d is ResolvedDocMeta => d !== null);
}

/**
 * Hit 级 scope guard
 * - whole_kb：始终通过
 * - 有 allowedDocIds：检查 docId 是否在集合中
 * - notebook：检查 hit.unit.box === scope.notebookId
 * - doc_tree：检查 box 匹配且 docId 或 path 匹配 rootDocId
 * - doc：检查 docId 匹配
 */
function isHitInScope(
  hit: SearchHit,
  scope: AnyRetrievalScope,
  allowedDocIds: Set<string> | null
): boolean {
  if (scope.type === "whole_kb") return true;
  if (allowedDocIds && allowedDocIds.size > 0) {
    return allowedDocIds.has(hit.unit.docId);
  }

  if (scope.type === "notebook") {
    return hit.unit.box === scope.notebookId;
  }

  if (scope.type === "doc_tree") {
    const path = hit.unit.path || "";
    return hit.unit.box === scope.box &&
      (hit.unit.docId === scope.rootDocId || path.includes(`/${scope.rootDocId}/`));
  }

  if (scope.type === "doc") {
    return hit.unit.docId === scope.docId;
  }

  return false;
}

/**
 * 默认 Scope Resolver 实现
 *
 * 说明：
 * - 从思源 SQL 直接查询文档列表
 * - 后续检索使用 siyuan-sql-retrieval 直接查询 SQL
 */
export class DefaultScopeResolver implements ScopeResolver {
  async resolve(scope: AnyRetrievalScope): Promise<ResolvedScopeData> {
    const docs = await loadDocsFromSql(scope);
    return { docs, scope };
  }
}

// ==================== Channel Implementations ====================

/**
 * Keyword 检索通道
 * 
 * 说明：
 * - 使用 siyuan-sql-retrieval 的 searchBlocksKeyword
 * - 支持按 scope 过滤
 */
class KeywordChannel implements RetrievalChannel {
  name = "keyword";

  async search(query: string, resolvedData: ResolvedScopeData, limit: number): Promise<SearchHit[]> {
    // 直接使用 resolvedData.scope 转换 SQL scope，不再反推
    const sqlScope = convertScopeToSearchScope(resolvedData.scope);
    return this.searchWithSql(query, sqlScope, limit);
  }

  private async searchWithSql(query: string, scope: SearchScope | null, limit: number): Promise<SearchHit[]> {
    if (!query.trim()) return [];

    // 使用思源 SQL 关键词检索
    const variants = buildRetrievalQueryVariants(query);
    const primaryQuery = variants[0] || query;
    const hits = await searchBlocksKeyword({ 
      query: primaryQuery, 
      scope: scope || undefined, 
      limit 
    });

    if (hits.length === 0) return [];

    // 打分并构建文档候选
    const scoredHits = await scoreBlockHits(hits, { query: primaryQuery });
    
    // 构建文档候选
    const candidates = buildDocumentCandidates(scoredHits);

    // 转换为 SearchHit 格式
    return this.candidatesToSearchHits(candidates);
  }

  private candidatesToSearchHits(candidates: import("../siyuan-sql-retrieval/types").DocumentCandidate[]): SearchHit[] {
    const hits: SearchHit[] = [];
    
    for (const candidate of candidates) {
      // 取每个候选结果的最佳 block
      const bestBlock = candidate.matchedBlocks[0];
      if (!bestBlock) continue;

      hits.push({
        unit: {
          id: bestBlock.blockId,
          docId: candidate.docId,
          box: candidate.box,
          type: this.mapBlockType(bestBlock.type),
          title: candidate.title,
          path: candidate.path,
          text: bestBlock.content,
          preview: bestBlock.content.slice(0, 200),
          headingPath: [candidate.title],
          sourceBlockIds: candidate.matchedBlocks.map(b => b.blockId),
        },
        score: candidate.docScore,
      });
    }

    return hits.sort((a, b) => b.score - a.score);
  }

  private mapBlockType(type: string): "heading" | "paragraph" | "list" | "code" | "table" | "other" {
    const typeMap: Record<string, "heading" | "paragraph" | "list" | "code" | "table" | "other"> = {
      "d": "other",
      "h": "heading",
      "p": "paragraph",
      "i": "list",
      "q": "other",
      "c": "code",
      "m": "other",
      "t": "table",
      "html": "other",
    };
    return typeMap[type] || "other";
  }
}

// ==================== Hybrid Search Orchestrator ====================

/**
 * FTS 检索通道
 * 
 * 说明：
 * - 使用 siyuan-sql-retrieval 的 searchBlocksFuzzy（LIKE 模糊匹配）
 * - 思源 SQL blocks 表不支持 FTS5，使用 LIKE 作为替代
 * - 支持按 scope 过滤
 */
class FtsChannel implements RetrievalChannel {
  name = "fts";

  async search(query: string, resolvedData: ResolvedScopeData, limit: number): Promise<SearchHit[]> {
    // 直接使用 resolvedData.scope 转换 SQL scope，不再反推
    const sqlScope = convertScopeToSearchScope(resolvedData.scope);
    return this.searchWithSql(query, sqlScope, limit);
  }

  private async searchWithSql(query: string, scope: SearchScope | null, limit: number): Promise<SearchHit[]> {
    if (!query.trim()) return [];

    // 使用思源 SQL 模糊检索（替代 FTS）
    const variants = buildRetrievalQueryVariants(query);
    const primaryQuery = variants[0] || query;
    const hits = await searchBlocksFuzzy({ 
      query: primaryQuery, 
      scope: scope || undefined, 
      limit 
    });

    if (hits.length === 0) return [];

    // 打分并构建文档候选
    const scoredHits = await scoreBlockHits(hits, { query: primaryQuery });
    
    // 构建文档候选
    const candidates = buildDocumentCandidates(scoredHits);

    // 转换为 SearchHit 格式
    return this.candidatesToSearchHits(candidates);
  }

  private candidatesToSearchHits(candidates: import("../siyuan-sql-retrieval/types").DocumentCandidate[]): SearchHit[] {
    const hits: SearchHit[] = [];
    
    for (const candidate of candidates) {
      // 取每个候选结果的最佳 block
      const bestBlock = candidate.matchedBlocks[0];
      if (!bestBlock) continue;

      hits.push({
        unit: {
          id: bestBlock.blockId,
          docId: candidate.docId,
          box: candidate.box,
          type: this.mapBlockType(bestBlock.type),
          title: candidate.title,
          path: candidate.path,
          text: bestBlock.content,
          preview: bestBlock.content.slice(0, 200),
          headingPath: [candidate.title],
          sourceBlockIds: candidate.matchedBlocks.map(b => b.blockId),
        },
        score: candidate.docScore,
      });
    }

    return hits.sort((a, b) => b.score - a.score);
  }

  private mapBlockType(type: string): "heading" | "paragraph" | "list" | "code" | "table" | "other" {
    const typeMap: Record<string, "heading" | "paragraph" | "list" | "code" | "table" | "other"> = {
      "d": "other",
      "h": "heading",
      "p": "paragraph",
      "i": "list",
      "q": "other",
      "c": "code",
      "m": "other",
      "t": "table",
      "html": "other",
    };
    return typeMap[type] || "other";
  }
}

// ==================== Retrieval Orchestrator ====================

/**
 * 统一检索入口
 * @param query 检索词
 * @param scope 检索范围
 * @param options 检索选项
 * @returns 检索结果
 */
export async function searchHybridInScope(
  query: string,
  scope: AnyRetrievalScope,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResult> {
  const { limit = 50, channels = {}, trace = false, excludeDocPaths, excludeBlockIds, channelQueries, channelEnabled, channelWeightMultipliers } = options;

  const excludePathSet = excludeDocPaths && excludeDocPaths.length > 0
    ? new Set(excludeDocPaths)
    : null;

  const excludeBlockIdSet = excludeBlockIds && excludeBlockIds.length > 0
    ? new Set(excludeBlockIds)
    : null;

  const keywordMultiplier = channelWeightMultipliers?.keyword ?? 1.0;
  const ftsMultiplier = channelWeightMultipliers?.fts ?? 1.0;

  const keywordConfig = channels.keyword ?? { enabled: true, weight: CHANNEL_WEIGHTS.keyword * keywordMultiplier };
  const ftsConfig = channels.fts ?? { enabled: true, weight: CHANNEL_WEIGHTS.fts * ftsMultiplier };

  const isKeywordEnabled = channelEnabled?.keyword !== false && keywordConfig.enabled;
  const isFtsEnabled = channelEnabled?.fts !== false && ftsConfig.enabled;

  const keywordQuery = channelQueries?.keyword ?? query;
  const ftsQuery = channelQueries?.fts ?? query;

  // 先 resolve scope，只解析一次，共享给各 channel
  // 如果提供了 preloadedDocs，直接使用，避免重复 SQL 加载
  const normalizedPreloadedDocs = normalizePreloadedDocs(options.preloadedDocs);
  let resolvedData: ResolvedScopeData;

  if (normalizedPreloadedDocs.length > 0) {
    // 使用预加载的 docs
    resolvedData = { docs: normalizedPreloadedDocs, scope };
    if (trace) {
      console.debug(`[searchHybridInScope] Using ${normalizedPreloadedDocs.length} preloaded docs`);
    }
  } else if (scope.type === "whole_kb" || scope.type === "notebook") {
    // whole_kb 和 notebook 不需要预加载 docs，使用 lazy scope
  // keyword/fts 通道通过 SQL 直接查 blocks（带 scope 限制）
    resolvedData = { docs: [], scope };
    if (trace) {
      console.debug(`[searchHybridInScope] ${scope.type} mode: skip loading all docs, use lazy scope`);
    }
  } else {
    // fallback 到 DefaultScopeResolver（doc_tree/doc）
    const resolver = new DefaultScopeResolver();
    resolvedData = await resolver.resolve(scope);
  }

  // 按 blockId 聚合多通道候选
  const candidateMap = new Map<string, {
    docId: string;
    box: string;
    title: string;
    path: string;
    type: "doc" | "heading" | "paragraph" | "listItem" | "quote" | "code" | "math" | "table" | "html";
    preview: string;
    sourceBlockIds: string[];
    scores: { backend: "keyword" | "fts"; score: number }[];
  }>();

  let allowedDocIds: Set<string> | null = null;

  if (resolvedData.docs.length > 0) {
    allowedDocIds = new Set(resolvedData.docs.map(d => d.docId));
  } else if (scope.type === "doc") {
    allowedDocIds = new Set([scope.docId]);
  }

  const searchWithChannel = async (
    channelName: "keyword" | "fts",
    channel: RetrievalChannel,
    channelQuery: string,
  ): Promise<{ channelName: string; hits: SearchHit[]; durationMs: number }> => {
    const start = Date.now();
    try {
      const hits = await channel.search(channelQuery, resolvedData, limit);
      return { channelName, hits, durationMs: Date.now() - start };
    } catch {
      return { channelName, hits: [], durationMs: Date.now() - start };
    }
  };

  const channelTasks: Promise<{ channelName: string; hits: SearchHit[]; durationMs: number }>[] = [];
  if (isKeywordEnabled) {
    channelTasks.push(searchWithChannel("keyword", new KeywordChannel(), keywordQuery));
  }
  if (isFtsEnabled) {
    channelTasks.push(searchWithChannel("fts", new FtsChannel(), ftsQuery));
  }

  const channelResults = await Promise.allSettled(channelTasks);

  const scopeType = scope.type;
  for (const settled of channelResults) {
    if (settled.status === "rejected") continue;
    const { channelName, hits, durationMs } = settled.value;
    pushAgentDebugEvent("RETRIEVAL_CHANNEL_TIMING_SAFE", {
      scopeType,
      channel: channelName,
      durationMs,
      hitCount: hits.length,
      enabled: true,
    });
  }

  const mergeChannelHits = (hits: SearchHit[], backend: "keyword" | "fts", weight: number) => {
    for (const hit of hits) {
      if (!isHitInScope(hit, scope, allowedDocIds)) continue;
      const blockId = hit.unit.sourceBlockIds[0] || hit.unit.id;
      const weightedScore = hit.score * weight;
      const existing = candidateMap.get(blockId);
      if (existing) {
        existing.scores.push({ backend, score: weightedScore });
      } else {
        candidateMap.set(blockId, {
          docId: hit.unit.docId,
          box: hit.unit.box,
          title: hit.unit.title,
          path: hit.unit.path || "",
          type: hit.unit.type as "doc" | "heading" | "paragraph" | "listItem" | "quote" | "code" | "math" | "table" | "html",
          preview: hit.unit.preview,
          sourceBlockIds: hit.unit.sourceBlockIds,
          scores: [{ backend, score: weightedScore }],
        });
      }
    }
  };

  for (const settled of channelResults) {
    if (settled.status === "rejected") continue;
    const { channelName, hits } = settled.value;
    if (channelName === "keyword") mergeChannelHits(hits, "keyword", keywordConfig.weight);
    else if (channelName === "fts") mergeChannelHits(hits, "fts", ftsConfig.weight);
  }

  // 计算 block 级融合分数：maxScore + 多通道加成
  function calculateFusedScore(scores: { backend: string; score: number }[]): number {
    if (scores.length === 0) return 0;
    if (scores.length === 1) return scores[0].score;

    const maxScore = Math.max(...scores.map(s => s.score));
    const backends = new Set(scores.map(s => s.backend));

    // 多通道加成策略：
    // 1. 基础分：最高分
    // 2. 多通道奖励：每多一个通道 +0.05
    // 3. 次级通道小幅加成：非最高分的通道各贡献 20% 的分数
    const multiBackendBonus = (backends.size - 1) * 0.05;

    const secondaryScores = scores
      .filter(s => s.score < maxScore)
      .map(s => s.score * 0.2);
    const secondaryBonus = secondaryScores.reduce((sum, s) => sum + s, 0);

    // 上限保护：融合分不超过 maxScore * 1.5
    const rawFusedScore = maxScore + multiBackendBonus + secondaryBonus;
    return Math.min(rawFusedScore, maxScore * 1.5);
  }

  // 将聚合后的候选转换为 RetrievalCandidate，使用融合分数
  let candidates: HybridCandidate[] = [];
  for (const [_blockId, data] of candidateMap) {
    const fusedScore = calculateFusedScore(data.scores);
    const primaryBackend = data.scores[0].backend; // 以第一个命中的通道为主

    candidates.push({
      docId: data.docId,
      box: data.box,
      title: data.title,
      path: data.path,
      type: data.type,
      score: fusedScore,
      preview: data.preview,
      sourceBlockIds: data.sourceBlockIds,
      backend: primaryBackend,
    });
  }

  // 按 score 排序
  candidates.sort((a, b) => b.score - a.score);

  // incremental retrieval：排除已知 primary blocks 或 docs
  // 第一版策略：优先 block 级排除，允许同文档其他 section 再次被召回
  // 只有当 blockIds 为空时，才回退到 doc path 级排除
  if (excludeBlockIdSet) {
    // 优先使用 block 级排除
    candidates = candidates.filter((c) => {
      // 如果 candidate 的任意 sourceBlockId 在排除集中，则排除该 candidate
      return !c.sourceBlockIds.some((blockId) => excludeBlockIdSet.has(blockId));
    });
  } else if (excludePathSet) {
    // 只有当 blockIds 为空时，才回退到 doc path 级排除
    candidates = candidates.filter((c) => !excludePathSet.has(c.path));
  }

  // Doc 级聚合评分 - 收集每个 doc 的所有 block scores
  // 注意：若传了 excludeBlockIds 或 excludeDocPaths，docScores 也应同步排除
  const docScores = new Map<string, DocScoreInfo>();
  for (const [blockId, data] of candidateMap) {
    // 优先 block 级排除
    if (excludeBlockIdSet && excludeBlockIdSet.has(blockId)) {
      continue;
    }
    // 只有当 blockIds 为空时，才回退到 doc path 级排除
    if (!excludeBlockIdSet && excludePathSet && excludePathSet.has(data.path)) {
      continue;
    }

    const fusedScore = calculateFusedScore(data.scores);
    const backends = new Set(data.scores.map(s => s.backend));
    const isDocHit = data.type === "doc";

    const existing = docScores.get(data.docId);
    if (existing) {
      existing.maxScore = Math.max(existing.maxScore, fusedScore);
      existing.hitCount++;
      existing.hasDocHit = existing.hasDocHit || isDocHit;
      existing.blockScores.push(fusedScore);
      for (const backend of backends) {
        existing.backends.add(backend);
      }
    } else {
      docScores.set(data.docId, {
        maxScore: fusedScore,
        hitCount: 1,
        hasDocHit: isDocHit,
        backends,
        blockScores: [fusedScore],
      });
    }
  }

  const result: HybridSearchResult = {
    candidates: candidates.slice(0, limit),
    docScores,
    scope,
    query,
  };

  // Trace
  if (trace) {
    const queryHash = (() => {
      let h = 0;
      for (let i = 0; i < query.length; i++) {
        h = ((h << 5) - h + query.charCodeAt(i)) | 0;
      }
      return Math.abs(h).toString(16).padStart(8, "0").slice(0, 8);
    })();
    console.groupCollapsed(`[Retrieval] ${scope.type} queryHash=${queryHash} chars=${query.length}`);
    console.log("Candidates:", candidates.length);
    console.log("DocScores:", docScores.size);
    console.groupEnd();
  }

  return result;
}

/**
 * 计算 doc 聚合评分
 * 使用 top 3 blocks 的递减权重策略，避免弱命中堆积
 */
export function calculateDocAggregateScore(
  docId: string,
  docScores: Map<string, DocScoreInfo>
): number {
  const score = docScores.get(docId);
  if (!score) return 0;

  const { docHitBonus, multiBackendBonus } = DOC_SCORE_WEIGHTS;

  // 取该文档下所有 block 分数降序排列
  const sortedBlockScores = [...score.blockScores].sort((a, b) => b - a);

  // 仅保留 top 3 参与聚合，使用递减权重
  // top1: 100%, top2: 50%, top3: 25%
  const weights = [1.0, 0.5, 0.25];
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < Math.min(sortedBlockScores.length, 3); i++) {
    weightedSum += sortedBlockScores[i] * weights[i];
    totalWeight += weights[i];
  }

  // 基础分：加权平均分
  let aggregateScore = totalWeight > 0 ? weightedSum / totalWeight * Math.min(sortedBlockScores.length, 3) : 0;

  // 保留 multi-backend bonus，但限制其影响
  if (score.backends.size > 1) {
    aggregateScore += Math.min(multiBackendBonus, aggregateScore * 0.1);
  }

  // doc hit 奖励
  if (score.hasDocHit) aggregateScore += docHitBonus;

  return aggregateScore;
}
