/**
 * Agentic RAG Search Types
 *
 * 本地 search 类型定义，脱离旧 agent-core/tools/search-blocks-tool。
 *
 * 职责：
 * - 定义 AgenticSearchHit / AgenticRetrievalStrategy / SearchBlocksForAgenticRagParams / AgenticSearchResult
 * - 兼容旧结构，不从 agent-core/agent-task-plan 导入 RetrievalStrategy
 * - metadata 保留 backend/sourceBlockIds/type 作为内部候选来源信息
 */

import type { AgentScope } from "../scope/types";

/**
 * Agentic RAG 检索命中项
 */
export interface AgenticSearchHit {
  docId: string;
  docTitle: string;
  blockId: string;
  content: string;
  score?: number;
  box?: string;
  path?: string;
  source?: "keyword_fuzzy" | "keyword" | "fuzzy" | "fallback" | "kernel_search" | "title_catalog";
  metadata?: Record<string, unknown>;
}

/**
 * Agentic RAG 检索策略
 *
 * 支持 mode 权重倍率、分通道 query、分通道启用/禁用。
 */
export interface AgenticRetrievalStrategy {
  mode?: "balanced" | "keyword_first" | "exact_only";
  queries?: { keyword?: string; fts?: string };
  channels?: { keyword?: boolean; fts?: boolean };
}

/**
 * Agentic RAG 检索参数
 */
export interface SearchBlocksForAgenticRagParams {
  scope: AgentScope;
  query: string;
  limit?: number;
  trace?: boolean;
  excludeDocIds?: string[];
  includeDocIds?: string[];
  retrievalStrategy?: AgenticRetrievalStrategy;
}

/**
 * Agentic RAG 检索结果
 */
export interface AgenticDocHit {
  docId: string;
  docTitle: string;
  box?: string;
  path?: string;
  score?: number;
  source?: "kernel_search" | "title_catalog" | "hybrid_doc";
  metadata?: Record<string, unknown>;
}

export interface AgenticSearchResult {
  hits: AgenticSearchHit[];
  docHits: AgenticDocHit[];
  searchedScopeType: string;
  candidateDocCount?: number;
  warnings: string[];
  lexicalSearched?: boolean;
  lexicalHitCount?: number;
  noHits?: boolean;
}
