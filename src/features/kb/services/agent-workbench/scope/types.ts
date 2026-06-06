/**
 * Agent Workbench Scope Types
 *
 * 职责：
 * - 定义 Agent Workbench 使用的 AgentScope / AgentScopeSummary / AgentScopeType / AgentScopeMode
 * - 不依赖外层聊天编排的 scope 类型
 */

/**
 * Agent 任务执行范围
 */
export type AgentScope =
  | { type: "current_doc"; docId: string; title?: string; box?: string }
  | { type: "doc_tree"; rootDocId: string; rootTitle?: string; box: string }
  | { type: "notebook"; notebookId: string; notebookName?: string }
  | { type: "whole_kb" }
  | { type: "custom_docs"; docIds: string[] };

/**
 * Agent 范围类型
 */
export type AgentScopeType = AgentScope["type"];

/**
 * Agent 范围摘要
 * 用于 UI 展示和日志
 */
export interface AgentScopeSummary {
  type: AgentScopeType;
  title: string;
  docCount?: number;
  isLazy?: boolean;
}

/**
 * Agent Scope 模式类型
 * 兼容现有聊天模式
 */
export type AgentScopeMode =
  | "current_doc"
  | "current_doc_with_children"
  | "current_notebook"
  | "whole_kb"
  | "custom_docs";

/**
 * 解析 Agent Scope 参数
 */
export interface ResolveAgentScopeParams {
  mode: AgentScopeMode;
  customDocIds?: string[];
  trace?: boolean;
}

/**
 * 解析后的 Agent Scope 结果
 */
export interface ResolvedAgentScope {
  scope: AgentScope;
  summary: AgentScopeSummary;
}

/**
 * 判断是否为固定文档范围。
 * current_doc / custom_docs 不开放 search_scope，调用方需要显式读取指定文档。
 */
export function isFixedDocumentScope(mode: AgentScopeMode): boolean {
  return mode === "current_doc" || mode === "custom_docs";
}

/**
 * 判断是否为检索型 Agent 范围。
 * whole_kb / current_notebook / current_doc_with_children 可使用 Agent Workbench 检索工具。
 */
export function isAgentRetrievalScope(mode: AgentScopeMode): boolean {
  return mode === "whole_kb" || mode === "current_notebook" || mode === "current_doc_with_children";
}
