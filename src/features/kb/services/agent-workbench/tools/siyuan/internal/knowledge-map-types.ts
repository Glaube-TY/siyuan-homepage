/**
 * Knowledge Map Types
 *
 * 文档图谱工具的类型定义。
 *
 * 职责：
 * - 定义 KnowledgeMapState、KnowledgeDocResource
 * - 定义 KnowledgeMapNode、KnowledgeMapNotebook、ListKnowledgeMapSafeOutput
 * - 使用真实资源 ID（docId），不生成或暴露 opaque identifier
 */

/**
 * 文档图谱状态
 * 记录图谱加载状态，不存储具体数据
 */
export interface KnowledgeMapState {
  loaded: boolean;
  query?: string;
  totalNodeCount: number;
  returnedNodeCount: number;
  truncated: boolean;
  loadedAtActionIndex: number;
}

/**
 * 文档资源映射
 * 真实 docId 到资源元数据的映射，不生成 identifier
 */
export interface KnowledgeDocResource {
  internalDocId: string;
  title: string;
  titlePath?: string;
  box?: string;
  path?: string;
  depth: number;
  parentDocId?: string;
  childCount?: number;
}

/**
 * 知识图谱节点（对 AI 可见）
 * 使用真实 docId，不生成 identifier
 */
export interface KnowledgeMapNode {
  docId: string;
  title: string;
  notebookId?: string;
  notebookName?: string;
  depth: number;
  childCount: number;
  parentDocId?: string;
  hasChildren?: boolean;
  children?: KnowledgeMapNode[];
}

/**
 * 知识图谱笔记本（对 AI 可见）
 */
export interface KnowledgeMapNotebook {
  notebookId: string;
  title: string;
  notebookName?: string;
  docCount: number;
  roots: KnowledgeMapNode[];
  truncated?: boolean;
}

/**
 * list_knowledge_map 工具安全输出（对 AI 可见）
 */
export interface ListKnowledgeMapSafeOutput {
  notebooks: KnowledgeMapNotebook[];
  totalNodeCount: number;
  returnedNodeCount: number;
  truncated: boolean;
  notebookApiLoaded?: boolean;
  notebookCount?: number;
  missingNotebookNameCount?: number;
  note?: string;
}

/**
 * list_knowledge_map 工具内部输出（仅运行时可见）
 */
export interface ListKnowledgeMapInternalOutput {
  safeOutput: ListKnowledgeMapSafeOutput;
  internalMapping: KnowledgeDocResource[];
}
