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
  /** 单 turn 内 block 类工具的最多调用次数。 */
  maxBlockCalls?: number;
}

export interface BudgetState {
  searchRemaining: number;
  readRemaining: number;
  blockRemaining: number;
}

const DEFAULT_CONFIG: Required<BudgetConfig> = {
  maxSearchCalls: 6,
  maxReadCalls: 8,
  maxBlockCalls: 16,
};

/**
 * 把"该工具消耗哪类预算"映射到预算名。
 * 工具自身通过消耗类别声明预算；不声明的视为不消耗。
 */
export type BudgetCategory = "search" | "read" | "block" | "none";

/**
 * 工具名 → 预算类别。
 * - read 类：read_candidate_docs、read_previous_evidence。
 * - search / navigation 类：search_scope、list_knowledge_map、list_scope_docs、
 *   focus_doc_scope、get_conversation_used_references。
 * - block 类：read_docs、read_block_context、get_doc_tree_context。
 * - none 类：answer、unknown。
 */
export function resolveBudgetCategory(toolName: string): BudgetCategory {
  switch (toolName) {
    case "search_scope":
    case "list_knowledge_map":
    case "list_scope_docs":
    case "focus_doc_scope":
    case "get_conversation_used_references":
      return "search";
    case "read_candidate_docs":
    case "read_previous_evidence":
      return "read";
    case "read_docs":
    case "read_block_context":
    case "get_doc_tree_context":
      return "block";
    case "answer":
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
      case "block":
        next.blockRemaining = Math.max(0, state.blockRemaining - 1);
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
      blockRemaining: this.config.maxBlockCalls,
    };
  }

  /**
   * 当前所有预算是否全部耗尽。
   * 仅做事实判断，**不**给出"建议改用 X"。
   */
  isAllExhausted(state: BudgetState): boolean {
    return (
      state.searchRemaining <= 0 &&
      state.readRemaining <= 0 &&
      state.blockRemaining <= 0
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
      case "block":
        return ctx.budgets.blockRemaining;
      case "none":
        return Number.POSITIVE_INFINITY;
    }
  }
}
