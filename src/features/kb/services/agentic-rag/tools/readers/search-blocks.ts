/**
 * Search Blocks For Agentic RAG
 *
 * 职责：
 * - 在 AgentScope 限定范围内检索候选块/候选文档
 * - 使用共享检索核心 (searchKnowledgeBaseCore) 的 kernel + title 通道
 * - 保留 searchHybridInScope 的完整检索策略控制
 * - AgentScope 从 agentic-rag/scope/types 导入
 * - AgenticRetrievalStrategy 从 agentic-rag/tools/search-types 导入
 * - 不导入写入 API，不直接导入 @/api
 * - 不暴露 raw SQL action 参数
 * - 不使用 hpath/name/alias 作为核心检索字段
 * - metadata 保留 backend/sourceBlockIds/type 作为内部候选来源信息，不写入 memory
 */

import {
  searchHybridInScope,
  type AnyRetrievalScope,
  type RetrievalCandidate,
} from "../../../retrieval/hybrid-search";

import {
  searchKnowledgeBaseCore,
  type BlockHit,
  type DocResult,
  type RetrievalChannelName,
} from "../../../siyuan/knowledge-base-search-core";

import { stableShortHash, pushAgentDebugEvent } from "../../debug/agentic-rag-debug";
import { getKbSettings } from "../../../settings/kb-settings-service";
import type { AgentScope } from "../../scope/types";
import type {
  AgenticSearchHit,
  AgenticRetrievalStrategy,
  SearchBlocksForAgenticRagParams,
  AgenticSearchResult,
  AgenticDocHit,
} from "../search-types";

function convertAgentScopeToRetrievalScope(scope: AgentScope): AnyRetrievalScope | null {
  switch (scope.type) {
    case "whole_kb":
      return { type: "whole_kb" };
    case "notebook":
      return {
        type: "notebook",
        notebookId: scope.notebookId,
        notebookName: scope.notebookName,
      };
    case "doc_tree":
      return {
        type: "doc_tree",
        rootDocId: scope.rootDocId,
        rootDocTitle: scope.rootTitle,
        box: scope.box,
      };
    case "current_doc":
    case "custom_docs":
      return null;
    default:
      return null;
  }
}

function convertCoreBlockHitToAgenticHit(blockHit: BlockHit, docTitle: string): AgenticSearchHit {
  return {
    docId: blockHit.docId,
    docTitle,
    blockId: blockHit.blockId,
    content: "",
    score: blockHit.score,
    box: blockHit.box,
    path: blockHit.path,
    source: mapChannelToSource(blockHit.channel),
    metadata: {
      channel: blockHit.channel,
      type: blockHit.type,
    },
  };
}

function mapChannelToSource(channel: RetrievalChannelName): AgenticSearchHit["source"] {
  switch (channel) {
    case "siyuan_kernel_search":
      return "kernel_search";
    case "title_catalog_search":
      return "title_catalog";
    case "project_hybrid_search":
      return "keyword_fuzzy";
    default:
      return "keyword_fuzzy";
  }
}

function mapBestChannelToDocSource(channel: RetrievalChannelName): AgenticDocHit["source"] {
  switch (channel) {
    case "siyuan_kernel_search":
      return "kernel_search";
    case "title_catalog_search":
      return "title_catalog";
    case "project_hybrid_search":
      return "hybrid_doc";
    default:
      return "hybrid_doc";
  }
}

function convertCoreDocResultToAgenticDocHit(doc: DocResult): AgenticDocHit {
  return {
    docId: doc.docId,
    docTitle: doc.title,
    box: doc.box,
    path: doc.path,
    score: doc.score,
    source: mapBestChannelToDocSource(doc.bestChannel),
    metadata: {
      bestChannel: doc.bestChannel,
      hitCount: doc.hitCount,
      type: "doc_candidate",
    },
  };
}

function convertRetrievalCandidateToAgenticHit(candidate: RetrievalCandidate): AgenticSearchHit {
  const blockId = candidate.sourceBlockIds[0] || candidate.docId;

  return {
    docId: candidate.docId,
    docTitle: candidate.title,
    blockId,
    content: candidate.preview,
    score: candidate.score,
    box: candidate.box,
    path: candidate.path,
    source: "keyword_fuzzy",
    metadata: {
      backend: candidate.backend,
      sourceBlockIds: candidate.sourceBlockIds,
      type: candidate.type,
    },
  };
}

function getHitKey(hit: AgenticSearchHit): string {
  if (hit.blockId) {
    return hit.blockId;
  }
  return `${hit.docId}:placeholder`;
}

interface ModeStrategyDefaults {
  enabled: { keyword: boolean; fts: boolean };
  weightMultipliers: { keyword: number; fts: number };
}

const MODE_DEFAULTS: Record<NonNullable<AgenticRetrievalStrategy["mode"]>, ModeStrategyDefaults> = {
  balanced: {
    enabled: { keyword: true, fts: true },
    weightMultipliers: { keyword: 1.0, fts: 1.0 },
  },
  keyword_first: {
    enabled: { keyword: true, fts: true },
    weightMultipliers: { keyword: 1.3, fts: 1.3 },
  },
  exact_only: {
    enabled: { keyword: true, fts: true },
    weightMultipliers: { keyword: 1.3, fts: 1.3 },
  },
};

function resolveRetrievalStrategyOptions(
  strategy: AgenticRetrievalStrategy | undefined,
  trace: boolean
): {
  channelQueries: { keyword?: string; fts?: string };
  channelEnabled: { keyword?: boolean; fts?: boolean };
  channelWeightMultipliers: { keyword?: number; fts?: number };
  debugDetail: string;
} {
  const channelQueries: { keyword?: string; fts?: string } = {};
  const channelEnabled: { keyword?: boolean; fts?: boolean } = {};
  const channelWeightMultipliers: { keyword?: number; fts?: number } = {};

  if (!strategy) {
    return { channelQueries, channelEnabled, channelWeightMultipliers, debugDetail: "no strategy" };
  }

  if (strategy.queries) {
    if (strategy.queries.keyword) channelQueries.keyword = strategy.queries.keyword;
    if (strategy.queries.fts) channelQueries.fts = strategy.queries.fts;
  }

  const mode = strategy.mode || "balanced";
  const modeDefaults = MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.balanced;
  channelEnabled.keyword = modeDefaults.enabled.keyword;
  channelEnabled.fts = modeDefaults.enabled.fts;
  channelWeightMultipliers.keyword = modeDefaults.weightMultipliers.keyword;
  channelWeightMultipliers.fts = modeDefaults.weightMultipliers.fts;

  if (strategy.channels) {
    if (typeof strategy.channels.keyword === "boolean") channelEnabled.keyword = strategy.channels.keyword;
    if (typeof strategy.channels.fts === "boolean") channelEnabled.fts = strategy.channels.fts;
  }

  const anyEnabled = channelEnabled.keyword || channelEnabled.fts;
  if (!anyEnabled) {
    const balanced = MODE_DEFAULTS.balanced;
    channelEnabled.keyword = balanced.enabled.keyword;
    channelEnabled.fts = balanced.enabled.fts;
  }

  const enabledNames: string[] = [];
  if (channelEnabled.keyword) enabledNames.push("keyword");
  if (channelEnabled.fts) enabledNames.push("fuzzy");
  const enabledStr = enabledNames.join(",") || "none";
  const detail = `mode=${mode}, channels=[${enabledStr}]`;

  if (trace) {
    const mainQuery = strategy.queries?.keyword || strategy.queries?.fts || "";
    const queryChars = mainQuery.length;
    const queryHash = mainQuery.length > 0 ? stableShortHash(mainQuery) : undefined;
    const queryInfo = queryChars > 0 ? `, queryChars=${queryChars}, queryHash=${queryHash}` : "";
    console.debug(`[AgenticSearchBlocks] 检索策略: ${detail}${queryInfo}`);
  }

  return { channelQueries, channelEnabled, channelWeightMultipliers, debugDetail: detail };
}

export async function searchBlocksForAgenticRag(
  params: SearchBlocksForAgenticRagParams
): Promise<AgenticSearchResult> {
  const { scope, query, limit, trace = false, excludeDocIds, includeDocIds, retrievalStrategy } = params;
  const warnings: string[] = [];
  const excludeSet = new Set(excludeDocIds ?? []);

  const settings = await getKbSettings();
  const defaultLimit = Number.isFinite(settings.firstPassMaxHits) ? settings.firstPassMaxHits : 50;
  const effectiveLimit = Math.min(Math.max(1, limit ?? defaultLimit), defaultLimit);

  if (!query || !query.trim()) {
    warnings.push("查询为空");
    return {
      hits: [],
      docHits: [],
      searchedScopeType: scope.type,
      warnings,
    };
  }

  if (scope.type === "current_doc" || scope.type === "custom_docs") {
    warnings.push("固定范围应使用 read_docs/read_block_context 而不是 search_scope");
    return {
      hits: [],
      docHits: [],
      searchedScopeType: scope.type,
      warnings,
    };
  }

  let resolvedIncludeDocIds: string[] | undefined;
  if (includeDocIds && includeDocIds.length > 0) {
    resolvedIncludeDocIds = [...new Set(includeDocIds.filter(Boolean))];
    if (resolvedIncludeDocIds.length === 0) {
      warnings.push("includeDocIds 被去重后为空集");
      return {
        hits: [],
        docHits: [],
        searchedScopeType: scope.type,
        warnings,
      };
    }
  }

  const searchLimit = resolvedIncludeDocIds
    ? Math.min(150, Math.max(effectiveLimit * 3, effectiveLimit + resolvedIncludeDocIds.length))
    : excludeSet.size > 0
      ? Math.min(120, Math.max(effectiveLimit * 2, effectiveLimit + excludeSet.size))
      : effectiveLimit;

  const retrievalScope = convertAgentScopeToRetrievalScope(scope);
  if (!retrievalScope) {
    warnings.push(`不支持的范围类型：${scope.type}`);
    return {
      hits: [],
      docHits: [],
      searchedScopeType: scope.type,
      warnings,
    };
  }

  const { channelQueries, channelEnabled, channelWeightMultipliers } = resolveRetrievalStrategyOptions(retrievalStrategy, trace);

  console.info("[KB-AGENT | SEARCH_SCOPE_CHANNELS_RESOLVED_SAFE]", {
    keywordEnabled: channelEnabled.keyword !== false,
    fuzzyEnabled: channelEnabled.fts !== false,
    reason: "shared_core_plus_hybrid",
  });

  const hitMap = new Map<string, AgenticSearchHit>();
  const docHitMap = new Map<string, AgenticDocHit>();
  let candidateDocCount = 0;
  let lexicalSearched = false;
  let totalLexicalHits = 0;

  // ---- Shared retrieval core: kernel + title channels ----
  let kernelDocCount = 0;
  let titleDocCount = 0;
  try {
    const coreResult = await searchKnowledgeBaseCore({
      query,
      scope: retrievalScope,
      limit: searchLimit,
      channels: {
        siyuan_kernel_search: true,
        title_catalog_search: true,
        project_hybrid_search: false,
      },
      caller: "agentic_search_scope",
    });

    kernelDocCount = coreResult.kernelDocCount;
    titleDocCount = coreResult.titleDocCount;

    const docTitleMap = new Map<string, string>();
    for (const doc of coreResult.docResults) {
      docTitleMap.set(doc.docId, doc.title);
    }

    for (const blockHit of coreResult.blockHits) {
      const docTitle = docTitleMap.get(blockHit.docId) || "";
      const hit = convertCoreBlockHitToAgenticHit(blockHit, docTitle);

      if (excludeSet.has(hit.docId)) continue;
      if (resolvedIncludeDocIds && !resolvedIncludeDocIds.includes(hit.docId)) continue;

      const key = getHitKey(hit);
      const existing = hitMap.get(key);
      if (!existing || (hit.score ?? 0) > (existing.score ?? 0)) {
        hitMap.set(key, hit);
      }
    }

    for (const docResult of coreResult.docResults) {
      if (excludeSet.has(docResult.docId)) continue;
      if (resolvedIncludeDocIds && !resolvedIncludeDocIds.includes(docResult.docId)) continue;

      const docHit = convertCoreDocResultToAgenticDocHit(docResult);
      const existing = docHitMap.get(docHit.docId);
      if (!existing || (docHit.score ?? 0) > (existing.score ?? 0)) {
        docHitMap.set(docHit.docId, docHit);
      }
    }

    candidateDocCount += coreResult.docResults.length;
  } catch {
    warnings.push("共享检索核心 (kernel+title) 失败");
  }

  // ---- Hybrid search channel (with full retrieval strategy) ----
  let hybridDocCount = 0;
  try {
    if (trace) {
      const qChars = query.length;
      const qHash = stableShortHash(query);
      console.debug(
        `[AgenticSearchBlocks] hybrid channel: scope=${scope.type}, queryChars=${qChars}, queryHash=${qHash}, limit=${searchLimit}`
      );
    }

    const result = await searchHybridInScope(query, retrievalScope, {
      limit: searchLimit,
      trace,
      channelQueries: Object.keys(channelQueries).length > 0 ? channelQueries : undefined,
      channelEnabled: Object.keys(channelEnabled).length > 0 ? channelEnabled : undefined,
      channelWeightMultipliers: Object.keys(channelWeightMultipliers).length > 0 ? channelWeightMultipliers : undefined,
    });

    const rawHits = result.candidates || [];
    hybridDocCount = result.docScores?.size || 0;
    lexicalSearched = rawHits.some(h => h.backend === "keyword" || h.backend === "fts") || rawHits.length === 0;

    for (const candidate of rawHits) {
      const hit = convertRetrievalCandidateToAgenticHit(candidate);

      if (excludeSet.has(hit.docId)) continue;
      if (resolvedIncludeDocIds && !resolvedIncludeDocIds.includes(hit.docId)) continue;

      const key = getHitKey(hit);
      const existing = hitMap.get(key);
      if (!existing || (hit.score ?? 0) > (existing.score ?? 0)) {
        hitMap.set(key, hit);
      }
    }

    for (const [docId, scoreInfo] of result.docScores ?? []) {
      if (excludeSet.has(docId)) continue;
      if (resolvedIncludeDocIds && !resolvedIncludeDocIds.includes(docId)) continue;

      const existingDocHit = docHitMap.get(docId);
      const candidate = rawHits.find(c => c.docId === docId);
      const hybridScore = (scoreInfo as any)?.aggregateScore ?? (scoreInfo as any)?.score ?? candidate?.score ?? 0;

      if (!existingDocHit) {
        docHitMap.set(docId, {
          docId,
          docTitle: candidate?.title || "",
          box: candidate?.box,
          path: candidate?.path,
          score: hybridScore,
          source: "hybrid_doc",
          metadata: {
            bestChannel: "project_hybrid_search",
            hitCount: (scoreInfo as any)?.hitCount ?? 1,
            type: "doc_candidate",
          },
        });
      }
    }

    candidateDocCount += hybridDocCount;
  } catch {
    warnings.push("hybrid 检索失败");
    lexicalSearched = false;
  }

  if (resolvedIncludeDocIds) {
    const hitDocIds = new Set(Array.from(hitMap.values()).map((h) => h.docId));
    const unknownIncludeCount = resolvedIncludeDocIds.filter((id) => !hitDocIds.has(id)).length;
    if (unknownIncludeCount > 0) {
      warnings.push(`在搜索结果中未找到 ${unknownIncludeCount} 个 includeDocIds`);
    }
  }

  let hits = Array.from(hitMap.values());
  hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  hits = hits.slice(0, effectiveLimit);

  let docHits = Array.from(docHitMap.values());
  docHits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  docHits = docHits.slice(0, effectiveLimit);

  totalLexicalHits = hits.filter(h => h.source === "keyword" || h.source === "keyword_fuzzy").length;

  if (excludeSet.size > 0) {
    warnings.push(`已排除 ${excludeSet.size} 个近期文档`);
  }

  const docLevelCandidateCount = docHits.length;
  const blockLevelCandidateCount = hits.length;

  pushAgentDebugEvent("SEARCH_SCOPE_SHARED_CORE_USED_SAFE", {
    candidateDocCount,
    candidateBlockCount: hits.length,
    kernelDocCount,
    titleDocCount,
    hybridDocCount,
    docLevelCandidateCount,
    blockLevelCandidateCount,
  }, "info");

  if (trace) {
    console.debug(
      `[AgenticSearchBlocks] 最终命中数: blocks=${hits.length}, docs=${docHits.length}, kernelDoc=${kernelDocCount}, titleDoc=${titleDocCount}, hybridDoc=${hybridDocCount}`
    );
  }

  return {
    hits,
    docHits,
    searchedScopeType: scope.type,
    candidateDocCount,
    warnings,
    lexicalSearched,
    lexicalHitCount: totalLexicalHits,
    noHits: hits.length === 0 && docHits.length === 0,
  };
}
