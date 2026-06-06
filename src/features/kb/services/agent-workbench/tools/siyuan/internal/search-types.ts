/**
 * Agent Workbench Search Types
 *
 * 本地 search 类型定义。
 *
 * 职责：
 * - 定义 SiyuanSearchHit / SiyuanSearchStrategy / SearchKnowledgeBlocksParams / SiyuanSearchResult
 * - 定义独立的 SiyuanSearchStrategy，不依赖外层聊天编排
 * - metadata 保留 backend/sourceBlockIds/type 作为内部候选来源信息
 */

import type { AgentScope } from "../../../scope/types";

/**
 * Agent Workbench 检索命中项
 */
export interface SiyuanSearchHit {
  docId: string;
  docTitle: string;
  blockId: string;
  content: string;
  score?: number;
  box?: string;
  path?: string;
  source?: "keyword_fuzzy" | "keyword" | "fuzzy" | "kernel_search" | "title_catalog";
  metadata?: Record<string, unknown>;
}

/**
 * Agent Workbench 检索策略
 *
 * 支持 mode 权重倍率、分通道 query、分通道启用/禁用。
 */
export interface SiyuanSearchStrategy {
  mode?: "balanced" | "keyword_first" | "exact_only";
  queries?: { keyword?: string; fts?: string };
  channels?: { keyword?: boolean; fts?: boolean };
}

/**
 * Agent Workbench 检索参数
 */
export interface SearchKnowledgeBlocksParams {
  scope: AgentScope;
  query: string;
  limit?: number;
  trace?: boolean;
  excludeDocIds?: string[];
  includeDocIds?: string[];
  retrievalStrategy?: SiyuanSearchStrategy;
}

/**
 * Agent Workbench 检索结果
 */
export interface SiyuanDocHit {
  docId: string;
  docTitle: string;
  box?: string;
  path?: string;
  score?: number;
  source?: "kernel_search" | "title_catalog" | "hybrid_doc";
  metadata?: Record<string, unknown>;
}

export interface SiyuanSearchResult {
  hits: SiyuanSearchHit[];
  docHits: SiyuanDocHit[];
  searchedScopeType: string;
  candidateDocCount?: number;
  warnings: string[];
  lexicalSearched?: boolean;
  lexicalHitCount?: number;
  noHits?: boolean;
}
