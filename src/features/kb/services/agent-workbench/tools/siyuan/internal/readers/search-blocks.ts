/**
 * Search Blocks For Agent Workbench
 *
 * 职责：
 * - 在 AgentScope 限定范围内检索候选块/候选结果
 * - 使用共享检索核心 (searchKnowledgeBaseCore) 的 kernel search 通道
 * - AgentScope 从 agent-workbench/scope/types 导入
 * - 不导入写入 API，不直接导入 @/api
 * - 不暴露 raw SQL action 参数
 * - 不使用 hpath/name/alias 作为核心检索字段
 * - metadata 保留 backend/sourceBlockIds/type 作为内部候选来源信息，不写入 memory
 */

import type { AnyRetrievalScope } from "../../../../../retrieval/hybrid-search";

import {
  searchKnowledgeBaseCore,
  type BlockHit,
  type DocResult,
  type RetrievalChannelName,
} from "../../../../../siyuan/knowledge-base-search-core";

import { pushAgentDebugEvent } from "../../../../debug/workbench-debug";
import { getKbSettings } from "../../../../../settings/kb-settings-service";
import type { AgentScope } from "../../../../scope/types";
import type {
  SiyuanSearchHit,
  SearchKnowledgeBlocksParams,
  SiyuanSearchResult,
  SiyuanDocHit,
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
    case "doc_neighborhood":
      // 底层使用 whole_kb 检索，结果由 resolvedIncludeDocIds 过滤
      return { type: "whole_kb" };
    case "current_doc":
    case "custom_docs":
      return null;
    default:
      return null;
  }
}

function convertCoreBlockHitToSiyuanHit(blockHit: BlockHit, docTitle: string): SiyuanSearchHit {
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

function mapChannelToSource(channel: RetrievalChannelName): SiyuanSearchHit["source"] {
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

function mapBestChannelToDocSource(channel: RetrievalChannelName): SiyuanDocHit["source"] {
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

function convertCoreDocResultToSiyuanDocHit(doc: DocResult): SiyuanDocHit {
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

function getHitKey(hit: SiyuanSearchHit): string {
  if (hit.blockId) {
    return hit.blockId;
  }
  return `${hit.docId}:placeholder`;
}

export async function searchKnowledgeBlocks(
  params: SearchKnowledgeBlocksParams
): Promise<SiyuanSearchResult> {
  const { scope, query, limit, trace = false, excludeDocIds, includeDocIds } = params;
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
    warnings.push("固定文档范围不开放 search_scope。");
    return {
      hits: [],
      docHits: [],
      searchedScopeType: scope.type,
      warnings,
    };
  }

  let resolvedIncludeDocIds: string[] | undefined;
  if (scope.type === "doc_neighborhood") {
    if (!scope.docIds || scope.docIds.length === 0) {
      warnings.push("文档邻域范围为空");
      return {
        hits: [],
        docHits: [],
        searchedScopeType: scope.type,
        warnings,
      };
    }
    const neighborhoodIds = [...new Set(scope.docIds.filter(Boolean))];
    if (includeDocIds && includeDocIds.length > 0) {
      const externalSet = new Set(includeDocIds.filter(Boolean));
      resolvedIncludeDocIds = neighborhoodIds.filter((id) => externalSet.has(id));
    } else {
      resolvedIncludeDocIds = neighborhoodIds;
    }
    if (resolvedIncludeDocIds.length === 0) {
      warnings.push("文档邻域与过滤条件无交集");
      return {
        hits: [],
        docHits: [],
        searchedScopeType: scope.type,
        warnings,
      };
    }
  } else if (includeDocIds && includeDocIds.length > 0) {
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

  pushAgentDebugEvent("SEARCH_SCOPE_CHANNELS_RESOLVED", {
    kernelSearchEnabled: true,
    titleCatalogSearchEnabled: false,
    projectHybridSearchEnabled: false,
  }, "debug");

  const hitMap = new Map<string, SiyuanSearchHit>();
  const docHitMap = new Map<string, SiyuanDocHit>();
  let candidateDocCount = 0;
  let lexicalSearched = false;
  let totalLexicalHits = 0;

  // ---- Shared retrieval core: kernel search channel ----
  let kernelDocCount = 0;
  let titleDocCount = 0;
  try {
    const coreResult = await searchKnowledgeBaseCore({
      query,
      scope: retrievalScope,
      limit: searchLimit,
      channels: {
        siyuan_kernel_search: true,
        title_catalog_search: false,
        project_hybrid_search: false,
      },
      caller: "search_scope_tool",
    });

    kernelDocCount = coreResult.kernelDocCount;
    titleDocCount = coreResult.titleDocCount;

    const docTitleMap = new Map<string, string>();
    for (const doc of coreResult.docResults) {
      docTitleMap.set(doc.docId, doc.title);
    }

    for (const blockHit of coreResult.blockHits) {
      const docTitle = docTitleMap.get(blockHit.docId) || "";
      const hit = convertCoreBlockHitToSiyuanHit(blockHit, docTitle);

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

      const docHit = convertCoreDocResultToSiyuanDocHit(docResult);
      const existing = docHitMap.get(docHit.docId);
      if (!existing || (docHit.score ?? 0) > (existing.score ?? 0)) {
        docHitMap.set(docHit.docId, docHit);
      }
    }

    candidateDocCount += coreResult.docResults.length;
  } catch {
    warnings.push("共享检索核心 (kernel) 失败");
  }

  const hybridDocCount = 0;

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
    scopeType: scope.type,
    candidateDocCount,
    candidateBlockCount: hits.length,
    kernelDocCount,
    titleDocCount,
    hybridDocCount,
    docLevelCandidateCount,
    blockLevelCandidateCount,
    neighborhoodDocCount: scope.type === "doc_neighborhood" ? scope.docIds.length : undefined,
  }, "info");

  if (trace) {
    pushAgentDebugEvent("SEARCH_FINAL_HITS", {
      blocks: hits.length,
      docs: docHits.length,
      kernelDoc: kernelDocCount,
      titleDoc: titleDocCount,
      hybridDoc: hybridDocCount,
    }, "debug");
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
