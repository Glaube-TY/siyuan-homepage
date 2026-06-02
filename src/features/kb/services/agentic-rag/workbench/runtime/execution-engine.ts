/**
 * ExecutionEngine
 *
 * 职责：validate / execute / observe。
 * 不替 Planner 选工具，不替 Planner 决定 evidenceMode。
 * 错误信息统一过 sanitizePlannerVisibleError。
 */

import type { ToolRegistry } from "../registries/tool-registry";
import type {
  AnswerToolData,
  ToolContract,
  ToolInput,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
  ToolManifest,
} from "../contracts/tool-contract";
import { EXECUTION_ONLY_TOOL_NAMES } from "../registries/tool-registry";
import { BudgetGuard } from "./budget-guard";
import type { BudgetState } from "./budget-guard";
import { ObservationStore } from "./observation-store";
import { assertSafeDisplayedHandle } from "../evidence/evidence-pack";
import { sanitizePlannerVisibleError } from "../guards/planner-visible-error";

export interface ExecutionEngineDeps {
  toolRegistry: ToolRegistry;
  budgetGuard: BudgetGuard;
  observationStore: ObservationStore;
}

export interface PlannedToolCall {
  toolName: string;
  args: unknown;
  /** Planner 选 Tool 时附带的备注；仅事实。 */
  rationale?: string;
}

export interface AnswerDraft {
  evidenceMode: "with_evidence" | "insufficient_evidence" | "without_kb_evidence";
  body: string;
  /** UI 展示句柄，**不含**真实 docId / blockId / path。 */
  displayedReferenceHandles?: string[];
}

export interface ExecutionOutcome {
  ok: boolean;
  toolName: string;
  observation: ToolObservation;
  /** 更新后的 budget state。 */
  budgetAfter: BudgetState;
  /**
   * 当执行的是 answer 工具且成功时，从其 data 提取出的 AnswerDraft。
   * 任何"代码自动构造 answer"**不**允许。
   */
  answerDraft?: AnswerDraft;
}

export class ExecutionEngine {
  constructor(private readonly deps: ExecutionEngineDeps) {}

  async execute(
    call: PlannedToolCall,
    ctx: ToolRuntimeContext,
    budget: BudgetState,
  ): Promise<ExecutionOutcome> {
    const tool = this.deps.toolRegistry.getTool(call.toolName);
    if (!tool) {
      return this.fail(
        call.toolName,
        budget,
        "tool_not_registered",
        sanitizePlannerVisibleError(
          undefined,
          "Tool is not registered.",
        ),
      );
    }

    if (EXECUTION_ONLY_TOOL_NAMES.has(call.toolName)) {
      return this.fail(
        call.toolName,
        budget,
        "execution_only_helper",
        sanitizePlannerVisibleError(
          undefined,
          "Tool is execution-only and must not be chosen directly by Planner.",
        ),
      );
    }

    const budgetCheck = this.deps.budgetGuard.check(call.toolName, ctx);
    if (!budgetCheck.available) {
      const observation: ToolObservation = {
        toolName: call.toolName,
        ok: false,
        outputKind: "error_only",
        facts: { errorCode: "budget_exhausted" },
        summary: sanitizePlannerVisibleError(
          new Error(budgetCheck.hint ?? ""),
          "Tool budget exhausted.",
        ),
      };
      const pushed = this.pushObservationOrFailure(observation);
      if (pushed.ok) {
        return {
          ok: false,
          toolName: call.toolName,
          observation: pushed.observation,
          budgetAfter: budget,
        };
      }
      return {
        ok: false,
        toolName: call.toolName,
        observation: pushed.observation,
        budgetAfter: budget,
      };
    }

    // 工具硬可用性检查（不含 budget，budget 已在上方检查）。
    const availability = tool.availability(ctx);
    if (!availability.available) {
      const observation: ToolObservation = {
        toolName: call.toolName,
        ok: false,
        outputKind: "error_only",
        facts: { errorCode: availability.reasonCode ?? "unavailable" },
        summary: sanitizePlannerVisibleError(
          new Error(availability.hint ?? ""),
          "Tool unavailable.",
        ),
      };
      const pushed = this.pushObservationOrFailure(observation);
      return {
        ok: false,
        toolName: call.toolName,
        observation: pushed.observation,
        budgetAfter: budget,
      };
    }

    // 入参校验
    const parsed = tool.inputSchema.safeParse(call.args);
    if (!parsed.success) {
      const failObs = this.makeToolFailedObservation(
        call.toolName,
        "validation_failed",
        sanitizePlannerVisibleError(
          new Error(parsed.error.message),
          "Tool args failed schema validation.",
        ),
      );
      const pushed = this.pushObservationOrFailure(failObs);
      return {
        ok: false,
        toolName: call.toolName,
        observation: pushed.observation,
        budgetAfter: budget,
      };
    }

    // execute
    let result: ToolResult;
    try {
      result = await tool.execute(parsed.data as ToolInput, ctx);
    } catch (err) {
      // 工具已进入 execute：视为已被尝试执行，需要消耗预算，
      // 避免 Planner 反复用同一个有 bug 的工具消耗 budget。answer 属于 none 类，
      // consume 不会改动预算。
      const budgetAfter = this.deps.budgetGuard.consume(call.toolName, budget);
      const failObs = this.makeToolFailedObservation(
        call.toolName,
        "execution_error",
        sanitizePlannerVisibleError(err, "Tool execution failed."),
      );
      const pushed = this.pushObservationOrFailure(failObs);
      return {
        ok: false,
        toolName: call.toolName,
        observation: pushed.observation,
        budgetAfter,
      };
    }

    // outputSchema 校验
    if (tool.outputSchema && result.ok) {
      const outputParsed = (tool.outputSchema as { safeParse?: (d: unknown) => { success: boolean; error?: { message: string } } }).safeParse?.(result.data);
      if (outputParsed && !outputParsed.success) {
        const budgetAfter = this.deps.budgetGuard.consume(call.toolName, budget);
        const failObs = this.makeToolFailedObservation(
          call.toolName,
          "output_validation_failed",
          sanitizePlannerVisibleError(
            new Error(outputParsed.error?.message ?? ""),
            "Tool output failed schema validation.",
          ),
        );
        const pushed = this.pushObservationOrFailure(failObs);
        return {
          ok: false,
          toolName: call.toolName,
          observation: pushed.observation,
          budgetAfter,
        };
      }
    }

    // observationFormatter
    let observation: ToolObservation;
    try {
      observation = tool.observationFormatter(result, ctx);
    } catch (err) {
      const budgetAfter = this.deps.budgetGuard.consume(call.toolName, budget);
      const failObs = this.makeToolFailedObservation(
        call.toolName,
        "observation_format_failed",
        sanitizePlannerVisibleError(
          err,
          "observationFormatter threw an error.",
        ),
      );
      const pushed = this.pushObservationOrFailure(failObs);
      return {
        ok: false,
        toolName: call.toolName,
        observation: pushed.observation,
        budgetAfter,
      };
    }

    // 扣 budget
    const budgetAfter = this.deps.budgetGuard.consume(call.toolName, budget);

    // push observation：原始 observation 成功则保留，失败则回退为 observation_rejected。
    const pushed = this.pushObservationOrFailure(observation);

    // answer 工具：尝试提取 AnswerDraft。失败时转为 tool_failed observation，
    // 留给下一轮 Planner 决定（**不**直接 throw 让循环崩溃）。
    let answerDraft: AnswerDraft | undefined;
    if (call.toolName === "answer" && result.ok) {
      // 若 answer observation 本身被 store 拒绝，绝不产生 answerDraft。
      if (!pushed.ok) {
        return {
          ok: false,
          toolName: call.toolName,
          observation: pushed.observation,
          budgetAfter,
        };
      }
      try {
        answerDraft = extractAnswerDraft(result.data);
      } catch (err) {
        const failObservation = this.makeToolFailedObservation(
          call.toolName,
          "answer_extract_failed",
          sanitizePlannerVisibleError(
            err,
            "answer tool result is malformed.",
          ),
        );
        const pushedFail = this.pushObservationOrFailure(failObservation);
        return {
          ok: false,
          toolName: call.toolName,
          observation: pushedFail.observation,
          budgetAfter,
        };
      }
    }

    return {
      ok: pushed.ok && result.ok,
      toolName: call.toolName,
      observation: pushed.observation,
      budgetAfter,
      answerDraft,
    };
  }

  private makeToolFailedObservation(
    toolName: string,
    reasonCode: string,
    summary: string,
  ): ToolObservation {
    return {
      toolName,
      ok: false,
      outputKind: "error_only",
      facts: { errorCode: reasonCode },
      summary,
    };
  }

  private fail(
    toolName: string,
    budget: BudgetState,
    reasonCode: string,
    summary: string,
  ): ExecutionOutcome {
    const observation = this.makeToolFailedObservation(toolName, reasonCode, summary);
    const pushed = this.pushObservationOrFailure(observation);
    return {
      ok: false,
      toolName,
      observation: pushed.observation,
      budgetAfter: budget,
    };
  }

  /**
   * 写入 observation，并显式报告结果。
   *
   * - observationStore.push 成功：返回 { ok: true, observation }。
   * - 原始 observation 被拒绝：构造 fallback tool_failed observation（facts.errorCode =
   *   "observation_rejected"，summary 为安全摘要，不含真实 docId / blockId / path），
   *   尝试 push 一次。
   *   - fallback push 成功：返回 { ok: false, observation: fallback }。
   *   - fallback push 仍失败：返回 { ok: false, observation: 内存中的 fallback }，
   *     execute **不** throw，PlannerLoop 不会因此崩溃。
   */
  private pushObservationOrFailure(
    observation: ToolObservation,
  ): { ok: boolean; observation: ToolObservation } {
    try {
      this.deps.observationStore.push(observation);
      return { ok: true, observation };
    } catch {
      const fallbackObs: ToolObservation = {
        toolName: observation.toolName,
        ok: false,
        outputKind: "error_only",
        facts: { errorCode: "observation_rejected" },
        summary: sanitizePlannerVisibleError(
          new Error(`observation rejected for ${observation.toolName}`),
          "Observation was rejected by store.",
        ),
      };
      try {
        this.deps.observationStore.push(fallbackObs);
        return { ok: false, observation: fallbackObs };
      } catch {
        return { ok: false, observation: fallbackObs };
      }
    }
  }
}

/**
 * 从 answer tool 的 ToolResult.data 中安全提取 AnswerDraft。
 * - displayedReferenceHandles 如果存在，必须整体是 string[]。
 * - 非 string 元素直接 throw（由 ExecutionEngine 转成 tool_failed observation）。
 * - 不得包含 docId / blockId / path 形式。
 */
export function extractAnswerDraft(data: unknown): AnswerDraft {
  if (!data || typeof data !== "object") {
    throw new Error(
      `[ExecutionEngine] answer tool result.data must be an object (got ${typeof data}).`,
    );
  }
  const obj = data as Partial<AnswerToolData>;
  if (typeof obj.body !== "string") {
    throw new Error(
      `[ExecutionEngine] answer tool result.data.body must be a string.`,
    );
  }
  if (
    obj.evidenceMode !== "with_evidence" &&
    obj.evidenceMode !== "insufficient_evidence" &&
    obj.evidenceMode !== "without_kb_evidence"
  ) {
    throw new Error(
      `[ExecutionEngine] answer tool result.data.evidenceMode must be one of ` +
        `with_evidence | insufficient_evidence | without_kb_evidence (got ${String(obj.evidenceMode)}).`,
    );
  }
  let handles: string[] | undefined;
  if (obj.displayedReferenceHandles !== undefined) {
    if (!Array.isArray(obj.displayedReferenceHandles)) {
      throw new Error(
        `[ExecutionEngine] answer tool result.data.displayedReferenceHandles must be string[].`,
      );
    }
    handles = [];
    for (let i = 0; i < obj.displayedReferenceHandles.length; i += 1) {
      const h = obj.displayedReferenceHandles[i];
      if (typeof h !== "string") {
        throw new Error(
          `[ExecutionEngine] answer tool result.data.displayedReferenceHandles[${i}] must be a string (got ${typeof h}).`,
        );
      }
      assertSafeDisplayedHandle(h);
      handles.push(h);
    }
  }
  return {
    evidenceMode: obj.evidenceMode,
    body: obj.body,
    displayedReferenceHandles: handles,
  };
}

/** 闸门：是否 execution-only helper。 */
export function isExecutionOnlyTool(name: string): boolean {
  return EXECUTION_ONLY_TOOL_NAMES.has(name);
}

export type { ToolContract, ToolInput, ToolResult, ToolObservation, ToolManifest, ToolRuntimeContext };
