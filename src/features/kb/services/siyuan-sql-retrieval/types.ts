/**
 * 思源 SQL 检索类型定义
 *
 * 核心原则：
 * - content 是检索主字段
 * - type=d 的 content 是文档名
 * - path 是内部文档 id 层级路径，只用于结构判断，不直接展示给用户
 * - name / alias 不参与核心检索
 * - 不使用 hpath
 * - 不给 AI 裸 SQL
 */

/**
 * 检索范围约束，用于安全 SQL 工具的范围过滤
 */
export interface SearchScope {
  mode: "whole_kb" | "notebook" | "doc_tree" | "doc";
  box?: string;
  docId?: string;
  pathPrefix?: string;
}

/**
 * 排除条件，用于排除已用资料
 */
export interface SearchExclude {
  blockIds?: string[];
  docIds?: string[];
  pathPrefixes?: string[];
}

/**
 * 检索模式
 */
export type SearchMode = "keyword" | "fuzzy";

/**
 * 块级得分构成明细
 */
export interface BlockSearchScoreParts {
  keyword?: number;
  fuzzy?: number;
  typeWeight?: number;
  tagBoost?: number;
  structureBoost?: number;
  recencyBoost?: number;
}

/**
 * 块级召回结果（检索中间结果，不直接提供给回答生成）
 *
 * 字段约束：
 * - content 是检索主字段
 * - tag 可作为标签匹配和加权字段
 * - 不包含 name / alias / markdown / hpath
 */
export interface BlockSearchHit {
  blockId: string;
  docId: string;
  box: string;
  path: string;
  parentId?: string;
  type: string;
  subtype?: string;
  content: string;
  tag?: string;
  created?: string;
  updated?: string;
  hash?: string;
  searchMode: SearchMode;
  blockScore: number;
  scoreParts: BlockSearchScoreParts;
}

/**
 * 文档命中摘要，用于快速了解文档匹配情况
 */
export interface DocumentMatchedSummary {
  titleMatched: boolean;
  tagMatched: boolean;
  headingMatched: boolean;
  paragraphMatched: boolean;
  listMatched: boolean;
  tableMatched: boolean;
  codeMatched: boolean;
  matchedBlockCount: number;
}

/**
 * 文档级候选（排序后，用于决定是否读取全文）
 *
 * title 来自 type=d 的 content 字段
 * docScore 由 matchedBlocks 的 blockScore 聚合而来
 */
export interface DocumentCandidate {
  docId: string;
  box: string;
  path: string;
  title: string;
  matchedBlocks: BlockSearchHit[];
  docScore: number;
  matchedSummary: DocumentMatchedSummary;
  updated?: string;
  hash?: string;
}
