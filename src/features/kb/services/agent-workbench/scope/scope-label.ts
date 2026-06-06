/**
 * Agent Workbench Scope Label
 *
 * 职责：
 * - 提供 AgentScope 的显示标签和摘要生成
 * - 不参与工具选择或读取决策
 */

import type { AgentScope, AgentScopeSummary } from "./types";

/**
 * 获取 AgentScope 的显示标签
 * @param scope AgentScope
 * @returns 显示标签
 */
export function getAgentScopeLabel(scope: AgentScope): string {
  switch (scope.type) {
    case "current_doc":
      return scope.title || "当前文档";
    case "doc_tree":
      return scope.rootTitle || "当前文档及子文档";
    case "notebook":
      return scope.notebookName || scope.notebookId || "当前笔记本";
    case "whole_kb":
      return "全库";
    case "custom_docs":
      return `自定义文档（${scope.docIds.length}篇）`;
    default:
      return "未知范围";
  }
}

/**
 * 生成 AgentScope 摘要
 * @param scope AgentScope
 * @param options 可选参数（文档数、是否 lazy）
 * @returns AgentScopeSummary
 */
export function summarizeAgentScope(
  scope: AgentScope,
  options?: { docCount?: number; isLazy?: boolean }
): AgentScopeSummary {
  return {
    type: scope.type,
    title: getAgentScopeLabel(scope),
    docCount: options?.docCount,
    isLazy: options?.isLazy,
  };
}
