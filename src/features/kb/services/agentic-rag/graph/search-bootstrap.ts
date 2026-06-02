/**
 * Search Bootstrap Helper
 *
 * 职责：
 * - 判断是否需要强制启动初始检索（纯结构诊断）
 *
 * 触发条件（全部满足）：
 * - needsKnowledgeBase === true
 * - 无已读文档/块上下文/候选文档/候选块/最近证据
 * - 无当前 action / finalAnswerAction
 * - 无活跃工具计划或工具计划非 running
 * - 还有搜索预算
 * - 当前 scope 不是固定文档直读范围
 *
 * 禁止：
 * - 不得返回 PlannerAction
 * - 不得构造 list_knowledge_map / search_scope / 任何业务动作
 * - 不得从 state.question / turnContextFact / runtimeTurnFacts 拼业务工具参数
 */

import type { AgenticRagState } from "./state";
import { isFixedDocumentScope } from "../scope/types";

export interface BootstrapDiagnostic {
  needsPlannerDecision: boolean;
  hasQuery: boolean;
  queryChars: number;
  queryHash: string;
  scopeType?: string;
  searchBudgetRemaining: number;
}

export function shouldBootstrapInitialSearch(state: AgenticRagState): boolean {
  if (state.currentAction || state.finalAnswerAction) {
    return false;
  }

  const needsKnowledgeBase = state.runtimeTurnFacts?.modeRequiresKb;
  if (needsKnowledgeBase !== true) {
    return false;
  }

  const workspace = state.workspace;
  if (
    workspace.readDocuments.length > 0 ||
    workspace.readBlockContexts.length > 0 ||
    workspace.candidateDocs.length > 0 ||
    workspace.candidateBlocks.length > 0 ||
    workspace.recentEvidence.length > 0
  ) {
    return false;
  }

  const searchCallCount = state.counters.searchCallCount ?? 0;
  const maxSearchCalls = state.budget.maxSearchCalls ?? 0;
  if (searchCallCount >= maxSearchCalls) {
    return false;
  }

  const mode = state.mode;
  if (isFixedDocumentScope(mode)) {
    return false;
  }

  return true;
}

function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function diagnoseInitialSearchBootstrapNeed(state: AgenticRagState): BootstrapDiagnostic {
  const query =
    state.question?.trim() ??
    "";

  const searchCallCount = state.counters.searchCallCount ?? 0;
  const maxSearchCalls = state.budget.maxSearchCalls ?? 0;

  return {
    needsPlannerDecision: true,
    hasQuery: query.length > 0,
    queryChars: query.length,
    queryHash: query.length > 0 ? simpleHash(query) : "",
    scopeType: state.scope?.type,
    searchBudgetRemaining: Math.max(0, maxSearchCalls - searchCallCount),
  };
}
