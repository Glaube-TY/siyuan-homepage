/**
 * BudgetGuard
 *
 * 预算的事实判定。budget 耗尽时只返回 unavailable；Planner 自己决定怎么处理。
 */

import type { ToolAvailability, ToolRuntimeContext } from "../contracts/tool-contract";

export interface BudgetConfig {
  /** 单 turn 内 search 类工具的最多调用次数。 */
  maxSearchCalls?: number;
  /** 单 turn 内 read 类工具的最多调用次数。 */
  maxReadCalls?: number;
}

export interface BudgetState {
  searchRemaining: number;
  readRemaining: number;
}

const DEFAULT_CONFIG: Required<BudgetConfig> = {
  maxSearchCalls: 6,
  maxReadCalls: 8,
};

/**
 * 把"该工具消耗哪类预算"映射到预算名。
 * 工具自身通过消耗类别声明预算；不声明的视为不消耗。
 */
export type BudgetCategory = "search" | "read" | "none";

/**
 * 工具名 → 预算类别。
 * - read 类：read_candidate_docs、read_reference_content。
 * - search / navigation 类：search_scope、list_knowledge_map、focus_doc_scope、
 *   list_recent_references。
 * - none 类：final_answer、progress_answer、unknown。
 */
export function resolveBudgetCategory(toolName: string): BudgetCategory {
  switch (toolName) {
    case "search_scope":
    case "list_knowledge_map":
    case "focus_doc_scope":
    case "list_recent_references":
      return "search";
    case "read_candidate_docs":
    case "read_reference_content":
      return "read";
    case "final_answer":
    case "progress_answer":
      return "none";
    default:
      return "none";
  }
}

/**
 * BudgetGuard：根据工具名 + 当前预算状态判定是否可用。
 * 只能"硬拒绝"或"放行"，**不**给 Planner 任何建议。
 */
export class BudgetGuard {
  private readonly config: Required<BudgetConfig>;

  constructor(config: BudgetConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configSnapshot(): Required<BudgetConfig> {
    return { ...this.config };
  }

  /**
   * 检查某工具的预算是否够用。
   * 返回 ToolAvailability：available=false 时 reasonCode="budget_exhausted"。
   */
  check(toolName: string, ctx: ToolRuntimeContext): ToolAvailability {
    const category = resolveBudgetCategory(toolName);
    const remaining = this.remainingForCategory(category, ctx);
    if (category === "none") {
      return { available: true };
    }
    if (remaining <= 0) {
      return {
        available: false,
        reasonCode: "budget_exhausted",
        hint: `${category} budget exhausted`,
      };
    }
    return { available: true };
  }

  /**
   * 预算消耗。
   * 返回更新后的 budget state（不修改入参对象）。
   * 调用方在 Tool execute 之后调用一次。
   */
  consume(toolName: string, state: BudgetState): BudgetState {
    const category = resolveBudgetCategory(toolName);
    if (category === "none") return state;
    const next: BudgetState = { ...state };
    switch (category) {
      case "search":
        next.searchRemaining = Math.max(0, state.searchRemaining - 1);
        break;
      case "read":
        next.readRemaining = Math.max(0, state.readRemaining - 1);
        break;
    }
    return next;
  }

  /**
   * 初始化 budget state（turn 开始时调用）。
   */
  init(): BudgetState {
    return {
      searchRemaining: this.config.maxSearchCalls,
      readRemaining: this.config.maxReadCalls,
    };
  }

  /**
   * 当前所有预算是否全部耗尽。
   * 仅做事实判断，**不**给出"建议改用 X"。
   */
  isAllExhausted(state: BudgetState): boolean {
    return (
      state.searchRemaining <= 0 &&
      state.readRemaining <= 0
    );
  }

  private remainingForCategory(
    category: BudgetCategory,
    ctx: ToolRuntimeContext,
  ): number {
    switch (category) {
      case "search":
        return ctx.budgets.searchRemaining;
      case "read":
        return ctx.budgets.readRemaining;
      case "none":
        return Number.POSITIVE_INFINITY;
    }
  }
}
