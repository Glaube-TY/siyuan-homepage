/**
 * Knowledge Map Types
 *
 * 文档图谱工具的类型定义。
 *
 * 职责：
 * - 定义 KnowledgeMapState、KnowledgeDocHandleMapping、ActiveFocusScope
 * - 定义 SafeKnowledgeMapNode、SafeKnowledgeMapNotebook、ListKnowledgeMapSafeOutput
 * - 定义 FocusDocScopeSafeOutput
 * - 不暴露真实 docId/blockId/path/box 给 AI
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
 * 文档 handle 映射
 * 安全 handle 到真实 docId 的映射，不暴露给 AI
 */
export interface KnowledgeDocHandleMapping {
  handle: string;
  internalDocId: string;
  title: string;
  titlePath?: string;
  box?: string;
  path?: string;
  depth: number;
  childCount?: number;
  source: "knowledge_map" | "doc_tree_context" | "conversation_reference";
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
  handles: string[];
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
    handle: string;
  };
}

/**
 * 安全图谱节点（对 AI 可见）
 */
export interface SafeKnowledgeMapNode {
  handle: string;
  title: string;
  depth: number;
  childCount: number;
  children?: SafeKnowledgeMapNode[];
  truncatedChildren?: boolean;
}

/**
 * 安全图谱笔记本（对 AI 可见）
 */
export interface SafeKnowledgeMapNotebook {
  handle: string;
  title: string;
  docCount: number;
  roots: SafeKnowledgeMapNode[];
  truncated?: boolean;
}

/**
 * list_knowledge_map 工具安全输出（对 AI 可见）
 */
export interface ListKnowledgeMapSafeOutput {
  notebooks: SafeKnowledgeMapNotebook[];
  totalNodeCount: number;
  returnedNodeCount: number;
  truncated: boolean;
}

/**
 * list_knowledge_map 工具内部输出（对 workspace 可见）
 */
export interface ListKnowledgeMapInternalOutput {
  safeOutput: ListKnowledgeMapSafeOutput;
  internalMapping: KnowledgeDocHandleMapping[];
}

/**
 * focus_doc_scope 工具安全输出（对 AI 可见）
 */
export interface FocusDocScopeSafeOutput {
  focusedHandleCount: number;
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
