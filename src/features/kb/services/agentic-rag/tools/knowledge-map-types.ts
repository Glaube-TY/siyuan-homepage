/**
 * Knowledge Map Types
 *
 * 文档图谱工具的类型定义。
 *
 * 职责：
 * - 定义 KnowledgeMapState、KnowledgeDocResource、ActiveFocusScope
 * - 定义 KnowledgeMapNode、KnowledgeMapNotebook、ListKnowledgeMapSafeOutput
 * - 定义 FocusDocScopeSafeOutput
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
  siblingCount?: number;
  childCount?: number;
  source:
    | "knowledge_map"
    | "conversation_reference"
    | "search_scope"
    | "focus_doc_scope"
    | "read_candidate_docs";
}

/**
 * 聚焦范围模式
 */
export type FocusScopeMode = "exact" | "subtree" | "siblings" | "notebook";

export interface ExpandedFocusDoc {
  docId: string;
  title: string;
  titlePath?: string;
  parentTitle?: string;
  relationToFocus: "root" | "descendant" | "sibling" | "branch_root";
  structuralReason?: string;
  depth: number;
}

/**
 * 活跃聚焦范围
 * AI 根据图谱选择的临时检索范围
 */
export interface ActiveFocusScope {
  docIds: string[];
  mode: FocusScopeMode;
  reason: string;
  source: "focus_doc_scope";
  createdAtActionIndex: number;
  maxDocIds: number;
  expandedDocs?: ExpandedFocusDoc[];
  primaryRoot?: {
    title: string;
    titlePath?: string;
    docId: string;
  };
}

/**
 * 知识图谱节点（对 AI 可见）
 * 使用真实 docId，不生成 identifier
 */
export interface KnowledgeMapNode {
  docId: string;
  title: string;
  depth: number;
  childCount: number;
  parentDocId?: string;
  siblingCount?: number;
  children?: KnowledgeMapNode[];
  truncatedChildren?: boolean;
}

/**
 * 知识图谱笔记本（对 AI 可见）
 */
export interface KnowledgeMapNotebook {
  notebookId: string;
  title: string;
  notebookName?: string;
  notebookNameStatus?: "available" | "unavailable";
  icon?: string;
  sort?: number;
  sortMode?: number;
  closed?: boolean;
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
}

/**
 * list_knowledge_map 工具内部输出（对 workspace 可见）
 */
export interface ListKnowledgeMapInternalOutput {
  safeOutput: ListKnowledgeMapSafeOutput;
  internalMapping: KnowledgeDocResource[];
}

/**
 * focus_doc_scope 工具安全输出（对 AI 可见）
 */
export interface FocusDocScopeSafeOutput {
  focusedDocCount: number;
  mode: FocusScopeMode;
  truncated: boolean;
}

/**
 * focus_doc_scope 工具内部输出（对 workspace 可见）
 */
export interface FocusDocScopeInternalOutput {
  safeOutput: FocusDocScopeSafeOutput;
  activeFocusScope: ActiveFocusScope;
}
