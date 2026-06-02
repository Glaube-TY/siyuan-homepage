/**
 * PlannerLoop
 *
 * 核心循环：每轮重建 Planner context，让 AI Planner 自主选 Tool。
 * - 工具执行结果以 observation 形式回给 Planner。
 * - 预算耗尽时仅追加 observation，不替 Planner 选工具。
 * - maxSteps 耗尽时 fail closed。
 */

import { ObservationStore } from "./observation-store";
import { BudgetGuard, type BudgetState } from "./budget-guard";
import {
  buildPlannerContext,
  type PlannerContext,
  type PlannerContextInput,
} from "./planner-context";
import { validatePlannerDecision, type PlannerDecision } from "../contracts/planner-decision";
import { ExecutionEngine, type AnswerDraft } from "./execution-engine";
import type { SkillRegistry } from "../registries/skill-registry";
import type { ToolRegistry } from "../registries/tool-registry";
import type { ToolRuntimeContext, BudgetSnapshot } from "../contracts/tool-contract";
import type { SkillObservation } from "../contracts/skill-contract";
import { sanitizePlannerVisibleError } from "../guards/planner-visible-error";

export interface PlannerLoopDeps {
  skillRegistry: SkillRegistry;
  toolRegistry: ToolRegistry;
  budgetGuard: BudgetGuard;
  observationStore: ObservationStore;
  executionEngine: ExecutionEngine;
  /**
   * Planner 决策提供者：把 PlannerContext 喂给底层 LLM，返回 raw decision object。
   * PlannerLoop 仅做校验与执行，不替 Planner 选工具。
   */
  decideNextStep: (ctx: PlannerContext) => Promise<unknown>;
  /** 可注入的测试用时钟。 */
  now?: () => number;
  /** 循环上限。 */
  maxSteps?: number;
}

export interface PlannerLoopInput {
  question: string;
  needsKnowledgeBase: boolean;
  userEnabledSkillNames: readonly string[];
  userDisabledSkillNames?: readonly string[];
  candidateSummary?: PlannerContextInput["candidateSummary"];
  evidenceSummary?: PlannerContextInput["evidenceSummary"];
  /** 初始 observations（仅作为种子；循环内由 observationStore 提供）。 */
  initialObservations?: SkillObservation[];
  /**
   * Tool 运行时上下文模板。callCounts 由循环覆盖；budgets 由循环每轮重算。
   */
  toolRuntimeContextBase: Omit<ToolRuntimeContext, "callCounts" | "budgets">;
}

export interface PlannerLoopResult {
  status:
    | "answer_ready"
    | "stopped_by_planner"
    | "fail_closed_max_steps"
    | "fail_closed_no_planner_decision";
  answerDraft?: AnswerDraft;
  stopReasonCode?: string;
  steps: number;
  /** 循环结束时 observation store 内的所有 observations。 */
  observations: SkillObservation[];
  /** 最终 PlannerContext（debug）。 */
  finalContext: PlannerContext | null;
}

/**
 * 构造 tool 运行时上下文。budgets 来自当前循环的 budget 状态。
 */
function buildToolRuntimeContext(
  base: Omit<ToolRuntimeContext, "callCounts" | "budgets">,
  budget: BudgetSnapshot,
  store: ObservationStore,
): ToolRuntimeContext {
  return {
    ...base,
    budgets: budget,
    callCounts: store.callCounts(),
  };
}

export class PlannerLoop {
  private readonly deps: PlannerLoopDeps;
  private readonly maxSteps: number;

  constructor(deps: PlannerLoopDeps) {
    this.deps = deps;
    this.maxSteps = deps.maxSteps ?? 12;
  }

  async run(input: PlannerLoopInput): Promise<PlannerLoopResult> {
    const now = this.deps.now ?? (() => Date.now());
    const store = this.deps.observationStore;
    const budgetGuard = this.deps.budgetGuard;
    let budget: BudgetState = budgetGuard.init();
    let stepIndex = 0;
    let lastContext: PlannerContext | null = null;
    let lastDecision: PlannerDecision | null = null;
    let pendingAnswerDraft: AnswerDraft | undefined = undefined;
    let budgetExhaustedEmitted = false;

    store.reset();

    if (input.initialObservations) {
      for (const obs of input.initialObservations) {
        store.push(obs);
      }
    }

    store.push({
      kind: "turn_started",
      facts: {
        stepIndex: 0,
        searchRemaining: budget.searchRemaining,
        readRemaining: budget.readRemaining,
        blockRemaining: budget.blockRemaining,
      },
      timestamp: now(),
    } as SkillObservation);

    while (stepIndex < this.maxSteps) {
      stepIndex += 1;

      // 每轮重建前先把 budget 状态写成 observation，
      // 确保 Planner 在 buildPlannerContext 之后立即看到。
      if (budgetGuard.isAllExhausted(budget) && !budgetExhaustedEmitted) {
        store.push({
          kind: "budget_exhausted",
          facts: {
            searchRemaining: 0,
            readRemaining: 0,
            blockRemaining: 0,
            stepIndex,
          },
        } as SkillObservation);
        budgetExhaustedEmitted = true;
      }

      const ctxInput: PlannerContextInput = {
        question: input.question,
        needsKnowledgeBase: input.needsKnowledgeBase,
        budgets: {
          searchRemaining: budget.searchRemaining,
          readRemaining: budget.readRemaining,
          blockRemaining: budget.blockRemaining,
        },
        candidateSummary: input.candidateSummary,
        evidenceSummary: input.evidenceSummary,
        observations: input.initialObservations ?? [],
        observationStore: store,
        userEnabledSkillNames: input.userEnabledSkillNames,
        userDisabledSkillNames: input.userDisabledSkillNames,
        callCounts: store.callCounts(),
      };
      const ctx = buildPlannerContext(ctxInput, {
        skillRegistry: this.deps.skillRegistry,
        toolRegistry: this.deps.toolRegistry,
        budgetGuard: this.deps.budgetGuard,
      });
      lastContext = ctx;

      let decision: PlannerDecision;
      try {
        const rawDecision = await this.deps.decideNextStep(ctx);
        decision = validatePlannerDecision(rawDecision);
      } catch (err) {
        // summary 不得回显原始 err.message；统一由 sanitizePlannerVisibleError 兜底。
        // facts.errorCode 仅在两个事实类别间选择：planner_decision_invalid / planner_decision_missing，
        // 不携带任何业务下一步建议。
        const errMessage = err instanceof Error ? err.message : String(err);
        const errorCode = errMessage.includes("must be")
          ? "planner_decision_invalid"
          : "planner_decision_missing";
        store.push({
          kind: "planner_returned_no_action",
          facts: { errorCode },
          summary: sanitizePlannerVisibleError(
            err,
            "Planner decision failed validation.",
          ),
        } as SkillObservation);
        return {
          status: "fail_closed_no_planner_decision",
          stopReasonCode: "planner_decision_invalid",
          steps: stepIndex,
          observations: store.getPlannerObservations(),
          finalContext: lastContext,
        };
      }
      lastDecision = decision;

      if (decision.type === "stop") {
        return {
          status: "stopped_by_planner",
          stopReasonCode: decision.reasonCode,
          steps: stepIndex,
          observations: store.getPlannerObservations(),
          finalContext: lastContext,
        };
      }

      const toolCtx = buildToolRuntimeContext(
        input.toolRuntimeContextBase,
        {
          searchRemaining: budget.searchRemaining,
          readRemaining: budget.readRemaining,
          blockRemaining: budget.blockRemaining,
        },
        store,
      );

      if (decision.type === "answer") {
        const outcome = await this.deps.executionEngine.execute(
          {
            toolName: decision.toolName,
            args: decision.args,
            rationale: decision.rationale,
          },
          toolCtx,
          budget,
        );
        budget = outcome.budgetAfter;
        if (outcome.ok && outcome.answerDraft) {
          pendingAnswerDraft = outcome.answerDraft;
        }
        // answer 工具失败不抛错：tool_failed observation 已写入 store，
        // 留给下一轮 Planner 决定是否重试或换路径。
        if (pendingAnswerDraft) {
          return {
            status: "answer_ready",
            answerDraft: pendingAnswerDraft,
            steps: stepIndex,
            observations: store.getPlannerObservations(),
            finalContext: lastContext,
          };
        }
        continue;
      }

      // decision.type === "tool"
      const outcome = await this.deps.executionEngine.execute(
        {
          toolName: decision.toolName,
          args: decision.args,
          rationale: decision.rationale,
        },
        toolCtx,
        budget,
      );
      budget = outcome.budgetAfter;
    }

    void lastDecision;
    return {
      status: "fail_closed_max_steps",
      stopReasonCode: "max_steps_exhausted",
      steps: stepIndex,
      observations: store.getPlannerObservations(),
      finalContext: lastContext,
    };
  }
}
