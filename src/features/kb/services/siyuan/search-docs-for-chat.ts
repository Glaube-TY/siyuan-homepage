/**
 * Search Docs For Chat Attachment
 *
 * 职责：
 * - 为聊天输入框提供只读文档搜索能力
 * - 使用共享检索核心 (searchKnowledgeBaseCore) 三通道搜索
 * - 只返回轻量元信息，不读取正文
 * - 这是 UI 搜索服务，不写入 Agent Workbench 运行态
 * - 不触发 Planner
 */

import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { searchKnowledgeBaseCore, type DocResult } from "./knowledge-base-search-core";

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
  totalDocCount: number;
  totalBlockCount: number;
  hasKernelSearchApi: boolean;
  canReadBlocksTable: boolean;
}

async function checkSearchHealth(): Promise<HealthCheckResult> {
  let totalDocCount = 0;
  let totalBlockCount = 0;
  let hasKernelSearchApi = false;
  let canReadBlocksTable = false;

  try {
    const { sqlSelectReadonly } = await import("./read-only-kernel");
    const docRows = await sqlSelectReadonly<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM blocks WHERE type = 'd'`,
      { maxLimit: 1, allowedTables: ["blocks"] }
    );
    totalDocCount = docRows?.[0]?.cnt ?? 0;
    canReadBlocksTable = true;
  } catch {
    canReadBlocksTable = false;
  }

  try {
    const { sqlSelectReadonly } = await import("./read-only-kernel");
    const blockRows = await sqlSelectReadonly<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM blocks`,
      { maxLimit: 1, allowedTables: ["blocks"] }
    );
    totalBlockCount = blockRows?.[0]?.cnt ?? 0;
  } catch {
    // ignore
  }

  try {
    const { fullTextSearchBlockReadonly } = await import("./read-only-kernel");
    const testResult = await fullTextSearchBlockReadonly("", 0);
    hasKernelSearchApi = testResult !== null;
  } catch {
    hasKernelSearchApi = false;
  }

  return { totalDocCount, totalBlockCount, hasKernelSearchApi, canReadBlocksTable };
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
        totalDocCount: health.totalDocCount,
        totalBlockCount: health.totalBlockCount,
        hasKernelSearchApi: health.hasKernelSearchApi,
        canReadBlocksTable: health.canReadBlocksTable,
      }, "info");
    } catch {
      pushAgentDebugEvent("MANUAL_DOC_SEARCH_HEALTH_SAFE", {
        totalDocCount: 0,
        totalBlockCount: 0,
        hasKernelSearchApi: false,
        canReadBlocksTable: false,
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
      title_catalog_search: true,
      project_hybrid_search: true,
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
    console.warn("[searchDocsForChatAttachment] service failed");
    pushAgentDebugEvent("MANUAL_DOC_SEARCH_SERVICE_START_SAFE", {
      queryChars: trimmed.length,
      limit: safeLimit,
      errorCode: "service_failed",
    }, "warn");
    return [];
  }
}
