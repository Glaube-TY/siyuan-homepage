/**
 * Knowledge Base Search Core
 *
 * 共享只读检索核心，为 Workbench search_scope 和手动文档搜索提供统一检索能力。
 *
 * 职责：
 * - 三通道检索：siyuan_kernel_search → title_catalog_search → project_hybrid_search
 * - 输入：query、scope、limit、channels、caller
 * - 输出统一结构：blockHits、docResults、channelStats
 * - scope 支持 whole_kb / notebook / doc_tree / doc
 * - 不读取文档全文，不输出正文片段
 * - 所有 SQL 只读；正文检索使用 blocks_fts MATCH，path 等元数据 LIKE 仍保留
 * - 不做自然语言理解、关键词表、特殊词补丁
 * - 不触发 Agent，不写 workspace
 * - search_scope 0 命中后仍由 Agent 决定下一步
 */

import {
  searchHybridInScope,
  calculateDocAggregateScore,
  type AnyRetrievalScope,
} from "../retrieval/hybrid-search";

import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { escapeSqlLike } from "../siyuan-sql-retrieval/sql-utils";
import { buildFtsMatchClause } from "@/components/tools/siyuanSqlPaging";
import { sqlSelectReadonlyPaged, fullTextSearchBlockAllPagesReadonly } from "./read-only-kernel";

export type RetrievalChannelName =
  | "siyuan_kernel_search"
  | "title_catalog_search"
  | "project_hybrid_search";

export type RetrievalCaller =
  | "search_scope_tool"
  | "manual_doc_search";

export interface RetrievalCoreInput {
  query: string;
  scope: AnyRetrievalScope;
  limit: number;
  channels?: Partial<Record<RetrievalChannelName, boolean>>;
  caller: RetrievalCaller;
}

export interface BlockHit {
  blockId: string;
  docId: string;
  type: string;
  score: number;
  channel: RetrievalChannelName;
  box?: string;
  path?: string;
}

export interface DocResult {
  docId: string;
  title: string;
  box: string;
  path: string;
  updated: string;
  hPath?: string;
  hitCount: number;
  score: number;
  bestChannel: RetrievalChannelName;
}

export interface ChannelStats {
  rawHitCount: number;
  docHitCount: number;
  durationMs: number;
  success: boolean;
  enabled: boolean;
  errorCode?: string;
}

export interface RetrievalCoreResult {
  blockHits: BlockHit[];
  docResults: DocResult[];
  channelStats: Record<RetrievalChannelName, ChannelStats>;
  mergedDocCount: number;
  kernelDocCount: number;
  titleDocCount: number;
  hybridDocCount: number;
}

interface KernelSearchHit {
  blockId: string;
  rootId: string;
  box: string;
  path: string;
  hPath?: string;
  type: string;
  score: number;
}

interface TitleHitRow {
  id: string;
  content: string;
  box: string;
  path: string;
  updated: string;
}

interface DocMetaRow {
  id: string;
  content: string;
  box: string;
  path: string;
  updated: string;
}

const DEFAULT_CHANNELS: Record<RetrievalChannelName, boolean> = {
  siyuan_kernel_search: true,
  title_catalog_search: true,
  project_hybrid_search: true,
};

function isChannelEnabled(
  channels: Partial<Record<RetrievalChannelName, boolean>> | undefined,
  name: RetrievalChannelName
): boolean {
  if (!channels) return DEFAULT_CHANNELS[name];
  if (channels[name] === false) return false;
  return true;
}

function clampLimit(limit: number, min: number, max: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return min;
  return Math.min(Math.max(limit, min), max);
}

function isKernelHitInScope(
  hit: KernelSearchHit,
  scope: AnyRetrievalScope
): boolean {
  if (scope.type === "whole_kb") return true;
  if (scope.type === "notebook") {
    return hit.box === scope.notebookId;
  }
  if (scope.type === "doc_tree") {
    const pathMatch =
      hit.rootId === scope.rootDocId ||
      hit.path.includes(`/${scope.rootDocId}/`);
    return hit.box === scope.box && pathMatch;
  }
  if (scope.type === "doc") {
    return hit.rootId === scope.docId;
  }
  return true;
}

async function searchViaKernelApi(
  query: string,
  limit: number,
  scope: AnyRetrievalScope
): Promise<KernelSearchHit[]> {
  const hits: KernelSearchHit[] = [];
  try {
    const result = await fullTextSearchBlockAllPagesReadonly(query, { maxPages: 5, maxRows: limit * 2 });
    if (!result || !result.blocks) return hits;

    for (const block of result.blocks) {
      const docId = block.rootID || (block.type === "d" ? block.id : "");
      if (!docId) continue;

      const hit: KernelSearchHit = {
        blockId: block.id,
        rootId: docId,
        box: block.box || "",
        path: block.path || "",
        hPath: block.hPath,
        type: block.type,
        score: typeof block.score === "number" ? block.score : 1.0,
      };

      if (!isKernelHitInScope(hit, scope)) continue;

      hits.push(hit);
    }
  } catch {
    // kernel API unavailable
  }
  return hits.slice(0, limit);
}

async function searchViaTitleCatalog(
  query: string,
  limit: number,
  scope: AnyRetrievalScope
): Promise<KernelSearchHit[]> {
  const hits: KernelSearchHit[] = [];
  const escaped = escapeSqlLike(query);
  const likePattern = `%${escaped}%`;
  const titleTerms = query.trim().split(/\s+/).filter((t) => t.length > 0);
  const contentFtsClause = titleTerms.length > 0
    ? buildFtsMatchClause(titleTerms, ["content"], { limit })
    : "1=0";

  let whereClause = `type = 'd' AND (${contentFtsClause} OR path LIKE '${likePattern}' ESCAPE '\\')`;

  if (scope.type === "notebook") {
    const escapedBox = scope.notebookId.replace(/'/g, "''");
    whereClause += ` AND box = '${escapedBox}'`;
  } else if (scope.type === "doc_tree") {
    const escapedBox = scope.box.replace(/'/g, "''");
    const escapedRootId = scope.rootDocId.replace(/'/g, "''");
    whereClause += ` AND box = '${escapedBox}' AND (id = '${escapedRootId}' OR path LIKE '%/${escapedRootId}/%')`;
  } else if (scope.type === "doc") {
    const escapedDocId = scope.docId.replace(/'/g, "''");
    whereClause += ` AND id = '${escapedDocId}'`;
  }

  try {
    const rows = await sqlSelectReadonlyPaged<TitleHitRow>(
      `SELECT id, content, box, path, updated FROM blocks WHERE ${whereClause} ORDER BY updated DESC, id DESC`,
      { maxRows: limit, allowedTables: ["blocks", "blocks_fts"] }
    );
    for (const r of rows ?? []) {
      hits.push({
        blockId: r.id,
        rootId: r.id,
        box: r.box || "",
        path: r.path || "",
        type: "d",
        score: 0.5,
      });
    }
  } catch {
    // SQL failed
  }
  return hits;
}

async function resolveDocTitlesByIds(
  docIds: string[]
): Promise<Map<string, { title: string; box: string; path: string; updated: string }>> {
  const result = new Map<string, { title: string; box: string; path: string; updated: string }>();
  if (docIds.length === 0) return result;

  // Batch by 64 to avoid SiYuan's default query result limit.
  const BATCH_SIZE = 64;
  for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
    const batch = docIds.slice(i, i + BATCH_SIZE);
    const idPlaceholders = batch
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    try {
      const rows = await sqlSelectReadonlyPaged<DocMetaRow>(
        `SELECT id, content, box, path, updated FROM blocks WHERE type = 'd' AND id IN (${idPlaceholders}) ORDER BY updated DESC, id DESC`,
        { maxRows: batch.length, allowedTables: ["blocks"] }
      );
      for (const r of rows ?? []) {
        result.set(r.id, {
          title: r.content || "",
          box: r.box || "",
          path: r.path || "",
          updated: r.updated || "",
        });
      }
    } catch {
      // title resolution failed for this batch
    }
  }

  return result;
}

function aggregateHitsToDocs(
  hits: KernelSearchHit[],
  channel: RetrievalChannelName
): Map<string, { hitCount: number; maxScore: number; box: string; path: string; hPath?: string; channel: RetrievalChannelName }> {
  const docMap = new Map<string, { hitCount: number; maxScore: number; box: string; path: string; hPath?: string; channel: RetrievalChannelName }>();

  for (const hit of hits) {
    const docId = hit.rootId;
    const existing = docMap.get(docId);
    if (existing) {
      existing.hitCount++;
      if (hit.score > existing.maxScore) existing.maxScore = hit.score;
    } else {
      docMap.set(docId, {
        hitCount: 1,
        maxScore: hit.score,
        box: hit.box,
        path: hit.path,
        hPath: hit.hPath,
        channel,
      });
    }
  }

  return docMap;
}

const CHANNEL_SCORE_BASELINE: Record<RetrievalChannelName, number> = {
  siyuan_kernel_search: 100,
  title_catalog_search: 50,
  project_hybrid_search: 10,
};

export async function searchKnowledgeBaseCore(
  input: RetrievalCoreInput
): Promise<RetrievalCoreResult> {
  const { query, scope, caller } = input;
  const limit = clampLimit(input.limit, 1, 50);
  const trimmed = query.trim();

  const enabledChannels: RetrievalChannelName[] = [];
  for (const name of Object.keys(DEFAULT_CHANNELS) as RetrievalChannelName[]) {
    if (isChannelEnabled(input.channels, name)) {
      enabledChannels.push(name);
    }
  }

  pushAgentDebugEvent("RETRIEVAL_CORE_START_SAFE", {
    caller,
    scopeType: scope.type,
    queryChars: trimmed.length,
    limit,
    enabledChannelCount: enabledChannels.length,
  }, "debug");

  if (!trimmed) {
    const emptyStats: Record<RetrievalChannelName, ChannelStats> = {
      siyuan_kernel_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: true, enabled: false },
      title_catalog_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: true, enabled: false },
      project_hybrid_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: true, enabled: false },
    };
    return {
      blockHits: [],
      docResults: [],
      channelStats: emptyStats,
      mergedDocCount: 0,
      kernelDocCount: 0,
      titleDocCount: 0,
      hybridDocCount: 0,
    };
  }

  const channelStats: Record<RetrievalChannelName, ChannelStats> = {
    siyuan_kernel_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: false, enabled: false },
    title_catalog_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: false, enabled: false },
    project_hybrid_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: false, enabled: false },
  };

  const mergedDocMap = new Map<string, DocResult>();
  const allBlockHits: BlockHit[] = [];

  // Channel 1: siyuan_kernel_search
  let kernelDocCount = 0;
  if (isChannelEnabled(input.channels, "siyuan_kernel_search")) {
    channelStats.siyuan_kernel_search.enabled = true;
    const startMs = Date.now();
    try {
      const kernelHits = await searchViaKernelApi(trimmed, limit * 3, scope);
      const kernelDocMap = aggregateHitsToDocs(kernelHits, "siyuan_kernel_search");
      kernelDocCount = kernelDocMap.size;

      for (const hit of kernelHits) {
        allBlockHits.push({
          blockId: hit.blockId,
          docId: hit.rootId,
          type: hit.type,
          score: hit.score,
          channel: "siyuan_kernel_search",
          box: hit.box,
          path: hit.path,
        });
      }

      if (kernelDocMap.size > 0) {
        const docIds = Array.from(kernelDocMap.keys());
        const titleMap = await resolveDocTitlesByIds(docIds);

        for (const [docId, info] of kernelDocMap) {
          const titleInfo = titleMap.get(docId);
          mergedDocMap.set(docId, {
            docId,
            title: titleInfo?.title || "",
            box: titleInfo?.box || info.box || "",
            path: titleInfo?.path || info.path || "",
            updated: titleInfo?.updated || "",
            hPath: info.hPath,
            hitCount: info.hitCount,
            score: info.maxScore * CHANNEL_SCORE_BASELINE.siyuan_kernel_search,
            bestChannel: "siyuan_kernel_search",
          });
        }
      }

      channelStats.siyuan_kernel_search = {
        rawHitCount: kernelHits.length,
        docHitCount: kernelDocMap.size,
        durationMs: Date.now() - startMs,
        success: true,
        enabled: true,
      };
    } catch {
      channelStats.siyuan_kernel_search = {
        rawHitCount: 0,
        docHitCount: 0,
        durationMs: Date.now() - startMs,
        success: false,
        enabled: true,
        errorCode: "kernel_api_failed",
      };
    }

    pushAgentDebugEvent("RETRIEVAL_CORE_CHANNEL_RESULT_SAFE", {
      caller,
      channel: "siyuan_kernel_search",
      rawHitCount: channelStats.siyuan_kernel_search.rawHitCount,
      docHitCount: channelStats.siyuan_kernel_search.docHitCount,
      durationMs: channelStats.siyuan_kernel_search.durationMs,
      success: channelStats.siyuan_kernel_search.success,
    }, "debug");
  }

  // Channel 2: title_catalog_search
  let titleDocCount = 0;
  if (isChannelEnabled(input.channels, "title_catalog_search")) {
    channelStats.title_catalog_search.enabled = true;
    const startMs = Date.now();
    try {
      const titleHits = await searchViaTitleCatalog(trimmed, limit, scope);
      const titleDocMap = aggregateHitsToDocs(titleHits, "title_catalog_search");
      titleDocCount = titleDocMap.size;

      for (const hit of titleHits) {
        allBlockHits.push({
          blockId: hit.blockId,
          docId: hit.rootId,
          type: hit.type,
          score: hit.score,
          channel: "title_catalog_search",
          box: hit.box,
          path: hit.path,
        });
      }

      if (titleDocMap.size > 0) {
        const docIds = Array.from(titleDocMap.keys()).filter((id) => !mergedDocMap.has(id));
        if (docIds.length > 0) {
          const titleMap = await resolveDocTitlesByIds(docIds);

          for (const [docId, info] of titleDocMap) {
            if (mergedDocMap.has(docId)) continue;
            const titleInfo = titleMap.get(docId);
            mergedDocMap.set(docId, {
              docId,
              title: titleInfo?.title || "",
              box: titleInfo?.box || info.box || "",
              path: titleInfo?.path || info.path || "",
              updated: titleInfo?.updated || "",
              hitCount: info.hitCount,
              score: CHANNEL_SCORE_BASELINE.title_catalog_search,
              bestChannel: "title_catalog_search",
            });
          }
        }
      }

      const titleContentHitCount = titleHits.filter((h) => h.type === "d").length;
      const titlePathHitCount = titleHits.filter((h) => h.path).length;

      channelStats.title_catalog_search = {
        rawHitCount: titleHits.length,
        docHitCount: titleDocMap.size,
        durationMs: Date.now() - startMs,
        success: true,
        enabled: true,
      };

      pushAgentDebugEvent("RETRIEVAL_CORE_CHANNEL_RESULT_SAFE", {
        caller,
        channel: "title_catalog_search",
        rawHitCount: titleHits.length,
        docHitCount: titleDocMap.size,
        durationMs: channelStats.title_catalog_search.durationMs,
        success: true,
        titleContentHitCount,
        titlePathHitCount,
      }, "debug");
    } catch {
      channelStats.title_catalog_search = {
        rawHitCount: 0,
        docHitCount: 0,
        durationMs: Date.now() - startMs,
        success: false,
        enabled: true,
        errorCode: "title_catalog_failed",
      };

      pushAgentDebugEvent("RETRIEVAL_CORE_CHANNEL_RESULT_SAFE", {
        caller,
        channel: "title_catalog_search",
        rawHitCount: 0,
        docHitCount: 0,
        durationMs: channelStats.title_catalog_search.durationMs,
        success: false,
        errorCode: "title_catalog_failed",
      }, "warn");
    }
  }

  // Channel 3: project_hybrid_search
  let hybridDocCount = 0;
  if (isChannelEnabled(input.channels, "project_hybrid_search")) {
    channelStats.project_hybrid_search.enabled = true;
    const startMs = Date.now();
    try {
      const hybridResult = await searchHybridInScope(
        query,
        scope,
        {
          limit: limit * 2,
          channels: {
            keyword: { enabled: true, weight: 1.0 },
            fts: { enabled: true, weight: 0.8 },
          },
          channelEnabled: {
            keyword: true,
            fts: true,
          },
        }
      );

      const candidateCount = hybridResult.candidates.length;
      hybridDocCount = hybridResult.docScores.size;

      for (const c of hybridResult.candidates) {
        allBlockHits.push({
          blockId: c.sourceBlockIds[0] || c.docId,
          docId: c.docId,
          type: c.type,
          score: c.score,
          channel: "project_hybrid_search",
          box: c.box,
          path: c.path,
        });
      }

      if (hybridResult.docScores.size > 0) {
        const docMetaMap = new Map<string, { title: string; box: string; path: string }>();
        for (const c of hybridResult.candidates) {
          if (!docMetaMap.has(c.docId)) {
            docMetaMap.set(c.docId, {
              title: c.title || "",
              box: c.box || "",
              path: c.path || "",
            });
          }
        }

        for (const [docId, scoreInfo] of hybridResult.docScores) {
          if (mergedDocMap.has(docId)) continue;
          const meta = docMetaMap.get(docId);
          const aggregateScore = calculateDocAggregateScore(docId, hybridResult.docScores);
          mergedDocMap.set(docId, {
            docId,
            title: meta?.title || "",
            box: meta?.box || "",
            path: meta?.path || "",
            updated: "",
            hitCount: scoreInfo.hitCount,
            score: aggregateScore * CHANNEL_SCORE_BASELINE.project_hybrid_search,
            bestChannel: "project_hybrid_search",
          });
        }
      }

      channelStats.project_hybrid_search = {
        rawHitCount: candidateCount,
        docHitCount: hybridDocCount,
        durationMs: Date.now() - startMs,
        success: true,
        enabled: true,
      };
    } catch {
      channelStats.project_hybrid_search = {
        rawHitCount: 0,
        docHitCount: 0,
        durationMs: Date.now() - startMs,
        success: false,
        enabled: true,
        errorCode: "hybrid_failed",
      };
    }

    pushAgentDebugEvent("RETRIEVAL_CORE_CHANNEL_RESULT_SAFE", {
      caller,
      channel: "project_hybrid_search",
      rawHitCount: channelStats.project_hybrid_search.rawHitCount,
      docHitCount: channelStats.project_hybrid_search.docHitCount,
      durationMs: channelStats.project_hybrid_search.durationMs,
      success: channelStats.project_hybrid_search.success,
    }, "debug");
  }

  const results = Array.from(mergedDocMap.values());
  results.sort((a, b) => b.score - a.score || b.hitCount - a.hitCount);
  const finalResults = results.slice(0, limit);

  pushAgentDebugEvent("RETRIEVAL_CORE_MERGED_SAFE", {
    caller,
    blockHitCount: allBlockHits.length,
    docResultCount: results.length,
    candidateDocCount: finalResults.length,
    candidateBlockCount: allBlockHits.length,
    kernelDocCount,
    titleDocCount,
    hybridDocCount,
    mergedDocCount: finalResults.length,
  }, "info");

  return {
    blockHits: allBlockHits,
    docResults: finalResults,
    channelStats,
    mergedDocCount: finalResults.length,
    kernelDocCount,
    titleDocCount,
    hybridDocCount,
  };
}
