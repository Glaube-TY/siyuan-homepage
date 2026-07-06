/**
 * Search Docs For Chat Attachment
 *
 * 职责：
 * - 为聊天输入框提供只读文档搜索能力
 * - 使用共享检索核心 (searchKnowledgeBaseCore) 的 kernel search 通道
 * - 只返回轻量元信息，不读取正文
 * - 这是 UI 搜索服务，不写入 Agent Workbench 运行态
 * - 不触发 Agent
 */

import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { searchKnowledgeBaseCore, type DocResult } from "./knowledge-base-search-core";
import { fullTextSearchBlockReadonly } from "./read-only-kernel";

export interface ChatDocSearchResult {
  docId: string;
  title: string;
  box: string;
  path: string;
  updated: string;
  matchSource: "siyuan_kernel_search" | "title_catalog_search" | "project_hybrid_search";
  hitCount: number;
  score: number;
}

export interface DocSelectionResult {
  results: ChatDocSearchResult[];
  kernelDocCount: number;
  titleDocCount: number;
  hybridDocCount: number;
  mergedDocCount: number;
  durationMs: number;
}

let healthChecked = false;

interface HealthCheckResult {
  hasKernelSearchApi: boolean;
}

async function checkSearchHealth(): Promise<HealthCheckResult> {
  let hasKernelSearchApi = false;

  try {
    const testResult = await fullTextSearchBlockReadonly("", {
      page: 1,
      pageSize: 1,
      method: 0,
      orderBy: 7,
      groupBy: 0,
    });
    hasKernelSearchApi = testResult !== null;
  } catch {
    hasKernelSearchApi = false;
  }

  return { hasKernelSearchApi };
}

function mapDocResultToChatDocSearchResult(doc: DocResult): ChatDocSearchResult {
  return {
    docId: doc.docId,
    title: doc.title,
    box: doc.box,
    path: doc.path,
    updated: doc.updated,
    matchSource: doc.bestChannel,
    hitCount: doc.hitCount,
    score: doc.score,
  };
}

export async function searchDocumentsForSelectionCore(
  query: string,
  limit: number = 20
): Promise<DocSelectionResult> {
  const startMs = Date.now();
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], kernelDocCount: 0, titleDocCount: 0, hybridDocCount: 0, mergedDocCount: 0, durationMs: Date.now() - startMs };
  }

  const safeLimit = Math.min(Math.max(limit, 1), 50);

  if (!healthChecked) {
    healthChecked = true;
    try {
      const health = await checkSearchHealth();
      pushAgentDebugEvent("MANUAL_DOC_SEARCH_HEALTH_SAFE", {
        hasKernelSearchApi: health.hasKernelSearchApi,
      }, "info");
    } catch {
      pushAgentDebugEvent("MANUAL_DOC_SEARCH_HEALTH_SAFE", {
        hasKernelSearchApi: false,
        errorCode: "health_check_failed",
      }, "warn");
    }
  }

  pushAgentDebugEvent("MANUAL_DOC_RETRIEVAL_CORE_START_SAFE", {
    queryChars: trimmed.length,
    limit: safeLimit,
  }, "debug");

  const coreResult = await searchKnowledgeBaseCore({
    query: trimmed,
    scope: { type: "whole_kb" },
    limit: safeLimit,
    channels: {
      siyuan_kernel_search: true,
      title_catalog_search: false,
      project_hybrid_search: false,
    },
    caller: "manual_doc_search",
  });

  const results = coreResult.docResults.map(mapDocResultToChatDocSearchResult);

  pushAgentDebugEvent("MANUAL_DOC_SEARCH_MERGED_SAFE", {
    kernelDocCount: coreResult.kernelDocCount,
    titleDocCount: coreResult.titleDocCount,
    hybridDocCount: coreResult.hybridDocCount,
    mergedDocCount: coreResult.mergedDocCount,
    limit: safeLimit,
  }, "info");

  pushAgentDebugEvent("MANUAL_DOC_SHARED_CORE_USED_SAFE", {
    docResultCount: results.length,
    kernelDocCount: coreResult.kernelDocCount,
    titleDocCount: coreResult.titleDocCount,
    hybridDocCount: coreResult.hybridDocCount,
  }, "info");

  return {
    results,
    kernelDocCount: coreResult.kernelDocCount,
    titleDocCount: coreResult.titleDocCount,
    hybridDocCount: coreResult.hybridDocCount,
    mergedDocCount: coreResult.mergedDocCount,
    durationMs: Date.now() - startMs,
  };
}

export async function searchDocsForChatAttachment(
  query: string,
  limit: number = 20
): Promise<ChatDocSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 50);

  pushAgentDebugEvent("MANUAL_DOC_SEARCH_SERVICE_START_SAFE", {
    queryChars: trimmed.length,
    limit: safeLimit,
  }, "debug");

  try {
    const selectionResult = await searchDocumentsForSelectionCore(trimmed, safeLimit);
    return selectionResult.results;
  } catch {
    pushAgentDebugEvent("MANUAL_DOC_SEARCH_SERVICE_START_SAFE", {
      queryChars: trimmed.length,
      limit: safeLimit,
      errorCode: "service_failed",
    }, "warn");
    return [];
  }
}
