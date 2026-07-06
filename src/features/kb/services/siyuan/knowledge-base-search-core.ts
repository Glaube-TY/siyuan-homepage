/**
 * Knowledge Base Search Core
 *
 * 共享只读检索核心，为 Workbench search_scope 和手动文档搜索提供统一检索能力。
 *
 * 职责：
 * - 主通道检索：siyuan_kernel_search
 * - title_catalog_search / project_hybrid_search 暂时退役，仅保留 channelStats 可观测性
 * - 输入：query、scope、limit、channels、caller
 * - 输出统一结构：blockHits、docResults、channelStats
 * - scope 支持 whole_kb / notebook / doc_tree / doc
 * - 不读取文档全文，不输出正文片段
 * - 默认检索链路不调用 SQL；正文检索使用思源 fullTextSearchBlock
 * - 不做自然语言理解、关键词表、特殊词补丁
 * - 不触发 Agent，不写 workspace
 * - search_scope 0 命中后仍由 Agent 决定下一步
 */

import type { AnyRetrievalScope } from "../retrieval/hybrid-search";

import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import {
  fullTextSearchBlockAllPagesReadonly,
  getBlockInfoReadonly,
  getHPathByIDReadonly,
  getPathByIDReadonly,
} from "./read-only-kernel";

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
  retiredByKernelApi?: boolean;
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
  content: string;
  score: number;
}

interface AggregatedDocInfo {
  hitCount: number;
  maxScore: number;
  box: string;
  path: string;
  hPath?: string;
  title: string;
  titlePriority: number;
  channel: RetrievalChannelName;
}

const DEFAULT_CHANNELS: Record<RetrievalChannelName, boolean> = {
  siyuan_kernel_search: true,
  title_catalog_search: false,
  project_hybrid_search: false,
};

const DOC_INFO_HPATH_API_LIMIT = 10;
const DOC_INFO_PATH_API_LIMIT = 10;
const DOC_INFO_BLOCK_API_LIMIT = 10;

function isChannelEnabled(
  channels: Partial<Record<RetrievalChannelName, boolean>> | undefined,
  name: RetrievalChannelName
): boolean {
  if (name === "title_catalog_search" || name === "project_hybrid_search") {
    return false;
  }
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

function stripSearchMarkup(value: string): string {
  return value
    .replace(/<\/?mark>/gi, "")
    .replace(/&lt;\/?mark&gt;/gi, "")
    .trim();
}

function getLastPathSegment(value: string | undefined): string {
  if (!value) return "";
  const parts = value.split(/[\\/]/).map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return stripSearchMarkup(last.replace(/\.sy$/i, ""));
}

function getTitleCandidateFromHit(hit: KernelSearchHit): { title: string; priority: number } {
  const hPathTitle = getLastPathSegment(hit.hPath);
  if (hPathTitle) {
    return { title: hPathTitle, priority: 3 };
  }

  if (hit.type === "d") {
    const docTitle = stripSearchMarkup(hit.content || "");
    if (docTitle) {
      return { title: docTitle, priority: 2 };
    }
  }

  const pathTitle = getLastPathSegment(hit.path);
  if (pathTitle) {
    return { title: pathTitle, priority: 1 };
  }

  return { title: "", priority: 0 };
}

function readStringField(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return "";
}

function readPathByIdResult(value: unknown): { box: string; path: string } {
  if (typeof value === "string") {
    return { box: "", path: value };
  }
  return {
    box: readStringField(value, ["box", "notebook", "notebookId"]),
    path: readStringField(value, ["path", "filePath"]),
  };
}

function joinSearchBoxPath(box: string, path: string): string {
  const cleanBox = box.trim();
  const cleanPath = path.trim();
  if (!cleanBox) return "";
  if (!cleanPath) return cleanBox;
  return `${cleanBox}${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
}

async function buildKernelSearchPaths(scope: AnyRetrievalScope): Promise<string[] | undefined> {
  if (scope.type === "notebook") {
    return [scope.notebookId];
  }

  if (scope.type !== "doc_tree") {
    return undefined;
  }

  try {
    const pathInfo = readPathByIdResult(await getPathByIDReadonly(scope.rootDocId));
    const searchPath = joinSearchBoxPath(pathInfo.box || scope.box, pathInfo.path);
    return searchPath ? [searchPath] : undefined;
  } catch {
    return undefined;
  }
}

async function searchViaKernelApi(
  query: string,
  limit: number,
  scope: AnyRetrievalScope
): Promise<KernelSearchHit[]> {
  const hits: KernelSearchHit[] = [];
  try {
    const paths = await buildKernelSearchPaths(scope);
    const searchOptions = {
      pageSize: 64,
      maxPages: 3,
      maxRows: Math.min(150, Math.max(limit, 64)),
      method: 0,
      orderBy: 7,
      groupBy: 0,
    };
    const collectScopedHits = (blocks: NonNullable<Awaited<ReturnType<typeof fullTextSearchBlockAllPagesReadonly>>["blocks"]>) => {
      for (const block of blocks) {
        const docId = block.rootID || (block.type === "d" ? block.id : "");
        if (!docId) continue;

        const hit: KernelSearchHit = {
          blockId: block.id,
          rootId: docId,
          box: block.box || "",
          path: block.path || "",
          hPath: block.hPath,
          type: block.type,
          content: block.content || "",
          score: typeof block.score === "number" ? block.score : 1.0,
        };

        if (!isKernelHitInScope(hit, scope)) continue;

        hits.push(hit);
      }
    };

    const result = await fullTextSearchBlockAllPagesReadonly(query, { ...searchOptions, paths });
    collectScopedHits(result?.blocks ?? []);

    if (hits.length === 0 && paths && paths.length > 0) {
      const fallbackResult = await fullTextSearchBlockAllPagesReadonly(query, searchOptions);
      collectScopedHits(fallbackResult?.blocks ?? []);
    }
  } catch {
    // kernel API unavailable
  }
  return hits.slice(0, limit);
}

async function resolveDocInfoByApi(
  docIds: string[],
  docMap: Map<string, AggregatedDocInfo>,
  caller: RetrievalCaller
): Promise<Map<string, { title: string; box: string; path: string; updated: string; hPath?: string }>> {
  const result = new Map<string, { title: string; box: string; path: string; updated: string; hPath?: string }>();
  if (docIds.length === 0) return result;

  for (const docId of docIds) {
    const info = docMap.get(docId);
    result.set(docId, {
      title: info?.title || "",
      box: info?.box || "",
      path: info?.path || "",
      updated: "",
      hPath: info?.hPath,
    });
  }

  let hPathRequestCount = 0;
  let hPathSuccessCount = 0;
  let pathRequestCount = 0;
  let pathSuccessCount = 0;
  let blockInfoRequestCount = 0;
  let blockInfoSuccessCount = 0;

  for (const docId of docIds) {
    const current = result.get(docId) || { title: "", box: "", path: "", updated: "" };

    if (!current.title && hPathRequestCount < DOC_INFO_HPATH_API_LIMIT) {
      hPathRequestCount++;
      try {
        const hPath = await getHPathByIDReadonly(docId);
        if (hPath) {
          hPathSuccessCount++;
          current.hPath = hPath;
          const hPathTitle = getLastPathSegment(hPath);
          if (hPathTitle) {
            current.title = hPathTitle;
          }
        }
      } catch {
        // hPath is optional for search result display
      }
    }

    if ((!current.path || !current.box) && pathRequestCount < DOC_INFO_PATH_API_LIMIT) {
      pathRequestCount++;
      try {
        const pathInfo = readPathByIdResult(await getPathByIDReadonly(docId));
        if (pathInfo.path || pathInfo.box) {
          pathSuccessCount++;
        }
        current.path = pathInfo.path || current.path;
        current.box = pathInfo.box || current.box;
      } catch {
        // path fallback handled below
      }
    }

    if ((!current.title || !current.box || !current.path) && blockInfoRequestCount < DOC_INFO_BLOCK_API_LIMIT) {
      blockInfoRequestCount++;
      try {
        const blockInfo = await getBlockInfoReadonly(docId);
        blockInfoSuccessCount++;
        current.title = current.title || readStringField(blockInfo, ["content", "title", "name"]);
        current.box = current.box || readStringField(blockInfo, ["box", "notebook", "notebookId"]);
        current.path = current.path || readStringField(blockInfo, ["path", "filePath"]);
        current.updated = current.updated || readStringField(blockInfo, ["updated", "updatedAt"]);
      } catch {
        // block info is best-effort metadata
      }
    }

    if (!current.title) {
      current.title = getLastPathSegment(current.path) || docId;
    }

    result.set(docId, current);
  }

  pushAgentDebugEvent("RETRIEVAL_DOC_INFO_API_COMPLETION_SAFE", {
    caller,
    docCount: docIds.length,
    hPathRequestCount,
    hPathSuccessCount,
    pathRequestCount,
    pathSuccessCount,
    blockInfoRequestCount,
    blockInfoSuccessCount,
  }, "debug");

  return result;
}

function aggregateHitsToDocs(
  hits: KernelSearchHit[],
  channel: RetrievalChannelName
): Map<string, AggregatedDocInfo> {
  const docMap = new Map<string, AggregatedDocInfo>();

  for (const hit of hits) {
    const docId = hit.rootId;
    const titleCandidate = getTitleCandidateFromHit(hit);
    const existing = docMap.get(docId);
    if (existing) {
      existing.hitCount++;
      if (hit.score > existing.maxScore) existing.maxScore = hit.score;
      if (!existing.box && hit.box) existing.box = hit.box;
      if (!existing.path && hit.path) existing.path = hit.path;
      if (!existing.hPath && hit.hPath) existing.hPath = hit.hPath;
      if (titleCandidate.title && titleCandidate.priority > existing.titlePriority) {
        existing.title = titleCandidate.title;
        existing.titlePriority = titleCandidate.priority;
      }
    } else {
      docMap.set(docId, {
        hitCount: 1,
        maxScore: hit.score,
        box: hit.box,
        path: hit.path,
        hPath: hit.hPath,
        title: titleCandidate.title,
        titlePriority: titleCandidate.priority,
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

function createInitialChannelStats(): Record<RetrievalChannelName, ChannelStats> {
  return {
    siyuan_kernel_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: false, enabled: false },
    title_catalog_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: true, enabled: false, retiredByKernelApi: true },
    project_hybrid_search: { rawHitCount: 0, docHitCount: 0, durationMs: 0, success: true, enabled: false, retiredByKernelApi: true },
  };
}

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
    const emptyStats = createInitialChannelStats();
    emptyStats.siyuan_kernel_search.success = true;
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

  const channelStats = createInitialChannelStats();
  const mergedDocMap = new Map<string, DocResult>();
  const allBlockHits: BlockHit[] = [];

  let kernelDocCount = 0;
  const titleDocCount = 0;
  const hybridDocCount = 0;

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
        const titleMap = await resolveDocInfoByApi(docIds, kernelDocMap, caller);

        for (const [docId, info] of kernelDocMap) {
          const titleInfo = titleMap.get(docId);
          mergedDocMap.set(docId, {
            docId,
            title: titleInfo?.title || info.title || docId,
            box: titleInfo?.box || info.box || "",
            path: titleInfo?.path || info.path || "",
            updated: titleInfo?.updated || "",
            hPath: titleInfo?.hPath || info.hPath,
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
