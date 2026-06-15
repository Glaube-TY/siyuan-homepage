/**
 * 全局记忆类型定义
 */

export interface GlobalMemoryContent {
  /** 拼接后的记忆正文 */
  content: string;
  /** 是否被截断 */
  truncated: boolean;
  /** 文档 ID */
  docId: string;
  /** 是否读取成功（区分真实空文档和读取失败） */
  readOk: boolean;
  /** 读取失败时的简短原因 */
  errorMessage?: string;
}

/** 单条段落记忆 */
export interface GlobalMemoryItem {
  /** 块 ID */
  id: string;
  /** 纯文本内容 */
  text: string;
  /** Markdown 内容 */
  markdown: string;
  /** 当前顺序索引 */
  index: number;
}
