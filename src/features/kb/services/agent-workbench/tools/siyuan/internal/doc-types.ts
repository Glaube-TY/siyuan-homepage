/**
 * Agent Workbench Document Types
 *
 * 职责：
 * - 定义本地只读文档类型
 * - 不保留 sourceBlockIds 到最终 memory
 */

/**
 * 轻量文档类型（用于文档枚举、搜索候选和读取工具）
 */
export interface SiyuanDocLite {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  updated?: string;
  created?: string;
  titlePath?: string;
  parentTitles?: string[];
}

/**
 * 文档全文类型（用于内容读取工具输出）
 */
export interface SiyuanDocFull {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  content: string;
  contentFormat: "markdown";
  truncated: boolean;
  contentChars: number;
  originalContentChars?: number;
  startOffset?: number;
  returnedContentChars?: number;
  remainingChars?: number;
  nextStartOffset?: number;
}

/**
 * 枚举文档参数
 */
import type { AgentScope } from "../../../scope/types";

export interface ListSiyuanDocsForToolParams {
  scope: AgentScope;
  limit?: number;
  query?: string;
  trace?: boolean;
}

/**
 * 读取单个文档全文参数
 */
export interface ReadSiyuanDocForToolParams {
  doc: SiyuanDocLite;
  maxChars?: number;
  startOffset?: number;
  trace?: boolean;
}

/**
 * 批量读取文档全文参数
 */
export interface ReadSiyuanDocsForToolParams {
  docs: SiyuanDocLite[];
  maxChars?: number;
  startOffset?: number;
  concurrency?: number;
  trace?: boolean;
}
