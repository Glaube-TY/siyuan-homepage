/**
 * Agentic RAG Document Types
 *
 * 职责：
 * - 定义本地只读文档类型，不再依赖旧 agent-core 的 AgentDocLite / AgentDocFull
 * - 字段与当前旧工具输出保持兼容
 * - 不保留 sourceBlockIds 到最终 memory
 */

/**
 * 轻量文档类型（用于 list_scope_docs 输出）
 */
export interface AgenticDocLite {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  updated?: string;
  titlePath?: string;
  parentTitles?: string[];
}

/**
 * 文档全文类型（用于 read_docs 输出）
 */
export interface AgenticDocFull {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  content: string;
  contentFormat: "markdown";
  truncated: boolean;
  contentChars: number;
  originalContentChars?: number;
}

/**
 * 枚举文档参数
 */
export interface ListDocsForAgenticRagParams {
  scope: import("../scope/types").AgentScope;
  limit?: number;
  query?: string;
  trace?: boolean;
}

/**
 * 读取单个文档全文参数
 */
export interface ReadDocFullForAgenticRagParams {
  doc: AgenticDocLite;
  maxChars?: number;
  trace?: boolean;
}

/**
 * 批量读取文档全文参数
 */
export interface ReadDocsFullForAgenticRagParams {
  docs: AgenticDocLite[];
  maxChars?: number;
  concurrency?: number;
  trace?: boolean;
}
