/**
 * BudgetGuard
 *
 * 预算的事实判定。budget 耗尽时只返回 unavailable；Planner 自己决定怎么处理。
 */

import type { ToolAvailability } from "../contracts/tool-contract";

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
 * 预算类别。
 * 工具通过 ToolContract.budgetCategory 自行声明；不声明的视为 "none"。
 */
export type BudgetCategory = "search" | "read" | "none";

/**
 * BudgetGuard：根据预算类别 + 当前预算状态判定是否可用。
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
   * 检查某预算类别是否还有余额。
   * 返回 ToolAvailability：available=false 时 reasonCode="budget_exhausted"。
   */
  check(category: BudgetCategory, state: BudgetState): ToolAvailability {
    const remaining = this.remainingForCategory(category, state);
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
  consume(category: BudgetCategory, state: BudgetState): BudgetState {
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
    state: BudgetState,
  ): number {
    switch (category) {
      case "search":
        return state.searchRemaining;
      case "read":
        return state.readRemaining;
      case "none":
        return Number.POSITIVE_INFINITY;
    }
  }
}
