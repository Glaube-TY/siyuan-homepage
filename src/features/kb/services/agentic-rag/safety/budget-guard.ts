/**
 * Budget Guard
 *
 * 统一判断 step/search/read/blockContext/invalidAction 预算。
 *
 * 职责：
 * - 提供纯函数判断剩余预算和是否可以继续操作
 * - 兼容 workspace.coverage 计数
 * - 预算不足时返回结构化 reason，不抛致命错误
 * - 不写最终默认预算硬编码；预算默认值后续由 settings 汇总
 */

import type { AgenticRagBudget, AgenticRagCounters } from "../runtime/budget";
import type { WorkspaceCoverage } from "../workspace/evidence-workspace";

export interface BudgetGuardContext {
  budget?: AgenticRagBudget;
  counters?: AgenticRagCounters;
  workspaceCoverage?: WorkspaceCoverage;
}

function getUsedCount(
  counters: AgenticRagCounters | undefined,
  coverage: WorkspaceCoverage | undefined,
  key: keyof AgenticRagCounters | keyof WorkspaceCoverage
): number {
  if (counters && key in counters) {
    return (counters as unknown as Record<string, number>)[key] ?? 0;
  }
  if (coverage && key in coverage) {
    return (coverage as unknown as Record<string, number>)[key] ?? 0;
  }
  return 0;
}

export function getRemainingSteps(
  budget: AgenticRagBudget,
  counters: AgenticRagCounters
): number {
  const max = budget.maxSteps ?? 0;
  const used = counters.stepCount ?? 0;
  return Math.max(0, max - used);
}

export function getRemainingSearchCalls(
  budget: AgenticRagBudget,
  context: BudgetGuardContext
): number {
  const max = budget.maxSearchCalls ?? 0;
  const used = getUsedCount(context.counters, context.workspaceCoverage, "searchCallCount");
  return Math.max(0, max - used);
}

export function getRemainingReadDocs(
  budget: AgenticRagBudget,
  context: BudgetGuardContext
): number {
  const max = budget.maxReadDocs ?? 0;
  const used = getUsedCount(context.counters, context.workspaceCoverage, "readDocCount");
  return Math.max(0, max - used);
}

export function getRemainingBlockContexts(
  budget: AgenticRagBudget,
  context: BudgetGuardContext
): number {
  const max = budget.maxBlockContexts ?? 0;
  const used = getUsedCount(context.counters, context.workspaceCoverage, "readBlockContextCount");
  return Math.max(0, max - used);
}

export function canCallSearchScope(
  budget: AgenticRagBudget | undefined,
  context: BudgetGuardContext
): { allowed: boolean; reason?: string } {
  if (!budget) {
    return { allowed: false, reason: "预算未初始化" };
  }
  const remaining = getRemainingSearchCalls(budget, context);
  if (remaining <= 0) {
    return { allowed: false, reason: "检索调用预算已耗尽" };
  }
  return { allowed: true };
}

export function canReadMoreDocs(
  budget: AgenticRagBudget | undefined,
  context: BudgetGuardContext
): { allowed: boolean; reason?: string } {
  if (!budget) {
    return { allowed: false, reason: "预算未初始化" };
  }
  const remaining = getRemainingReadDocs(budget, context);
  if (remaining <= 0) {
    return { allowed: false, reason: "读取文档预算已耗尽" };
  }
  return { allowed: true };
}

export function canReadMoreBlockContexts(
  budget: AgenticRagBudget | undefined,
  context: BudgetGuardContext
): { allowed: boolean; reason?: string } {
  if (!budget) {
    return { allowed: false, reason: "预算未初始化" };
  }
  const remaining = getRemainingBlockContexts(budget, context);
  if (remaining <= 0) {
    return { allowed: false, reason: "块上下文预算已耗尽" };
  }
  return { allowed: true };
}

export function canContinueAgentLoop(
  budget: AgenticRagBudget | undefined,
  counters: AgenticRagCounters | undefined
): { allowed: boolean; reason?: string } {
  if (!budget || !counters) {
    return { allowed: false, reason: "预算或计数器未初始化" };
  }
  const remaining = getRemainingSteps(budget, counters);
  if (remaining <= 0) {
    return { allowed: false, reason: "步骤预算已耗尽" };
  }
  const invalidMax = budget.maxInvalidActions ?? 0;
  const invalidUsed = counters.invalidActionCount ?? 0;
  if (invalidUsed >= invalidMax) {
    return { allowed: false, reason: "无效动作次数已达上限" };
  }
  return { allowed: true };
}

export function clampByBudget<T>(items: T[], remaining: number): T[] {
  if (remaining <= 0) return [];
  return items.slice(0, remaining);
}
