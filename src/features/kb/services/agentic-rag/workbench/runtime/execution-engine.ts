/**
 * ExecutionEngine
 *
 * 职责：validate / execute / observe。
 * 不替 Planner 选工具，不替 Planner 决定回答内容。
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
  body: string;
  references?: import("../../skills/system/answer/answer.tool").ResourceRef[];
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
  /**
   * progress_answer 工具成功时的进展 body。
   * 不结束 PlannerLoop，由 runV3 通过 onAnswerChunk 推送给 UI。
   */
  progressBody?: string;
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
          "工具未注册。",
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
          "该工具仅供内部执行，不可由 Planner 直接选择。",
        ),
      );
    }

    const budgetCheck = this.deps.budgetGuard.check(call.toolName, ctx);
    if (!budgetCheck.available) {
      const observation: ToolObservation = {
        toolName: call.toolName,
        ok: false,
        outputKind: "error_only",
        facts: {
          errorCode: "budget_exhausted",
          errorRecoverable: false,
          errorHint: "工具预算已用尽，无法继续调用该工具。",
        },
        summary: sanitizePlannerVisibleError(
          new Error(budgetCheck.hint ?? ""),
          "工具预算已用尽。",
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
        facts: {
          errorCode: availability.reasonCode ?? "unavailable",
          errorRecoverable: false,
          errorHint: availability.hint ?? "工具当前不可用。",
        },
        summary: sanitizePlannerVisibleError(
          new Error(availability.hint ?? ""),
          "工具不可用。",
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
      const firstIssue = parsed.error.issues[0];
      // 诊断日志
      console.info("[AgenticRagV3] TOOL_INPUT_VALIDATION_FAILED", {
        toolName: call.toolName,
        issuePath: firstIssue?.path?.join(".") ?? "",
        issueMessage: firstIssue?.message ?? "",
        issueCode: firstIssue?.code ?? "",
        argsSummary: summarizeArgs(call.args),
      });
      const failObs = this.makeToolFailedObservation(
        call.toolName,
        "validation_failed",
        sanitizePlannerVisibleError(
          new Error(parsed.error.message),
          "工具参数校验失败。",
        ),
        {
          recoverable: true,
          field: firstIssue?.path?.join(".") ?? "args",
          expected: "符合工具 inputSchema 的参数",
          received: firstIssue?.message ?? "参数格式错误",
          hint: "请检查参数格式是否符合工具定义。",
        },
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
        sanitizePlannerVisibleError(err, "工具执行失败。"),
        {
          recoverable: false,
          hint: "工具执行时发生异常，请尝试调整参数或换一种方式调用。",
        },
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
            "工具输出校验失败。",
          ),
          {
            recoverable: false,
            expected: "符合工具 outputSchema 的输出",
            received: outputParsed.error?.message ?? "输出格式错误",
            hint: "工具返回结果格式不符合定义，请重试或换一种方式调用。",
          },
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
          "observationFormatter 执行失败。",
        ),
        {
          recoverable: false,
          hint: "工具结果格式化失败，请重试。",
        },
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
    if ((call.toolName === "final_answer" || call.toolName === "answer") && result.ok) {
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
            "回答工具结果格式错误。",
          ),
          {
            recoverable: true,
            expected: "包含 body 字段的回答对象",
            received: "回答格式错误",
            hint: "请确保回答包含 body 字段，且 references 为字符串数组。",
          },
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

    // progress_answer 工具：提取 progress body，不结束循环。
    let progressBody: string | undefined;
    if (call.toolName === "progress_answer" && result.ok) {
      const data = result.data as { body?: string } | undefined;
      if (data && typeof data.body === "string") {
        progressBody = data.body;
      }
    }

    return {
      ok: pushed.ok && result.ok,
      toolName: call.toolName,
      observation: pushed.observation,
      budgetAfter,
      answerDraft,
      progressBody,
    };
  }

  private makeToolFailedObservation(
    toolName: string,
    reasonCode: string,
    summary: string,
    detail?: {
      recoverable?: boolean;
      field?: string;
      expected?: string;
      received?: string;
      hint?: string;
    },
  ): ToolObservation {
    const facts: Record<string, unknown> = { errorCode: reasonCode };
    if (detail?.recoverable !== undefined) {
      facts.errorRecoverable = detail.recoverable;
    }
    if (detail?.field) {
      facts.errorField = detail.field;
    }
    if (detail?.expected) {
      facts.errorExpected = detail.expected;
    }
    if (detail?.received) {
      facts.errorReceived = detail.received;
    }
    if (detail?.hint) {
      facts.errorHint = detail.hint;
    }
    return {
      toolName,
      ok: false,
      outputKind: "error_only",
      facts,
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
 * Safely extracts the global final_answer payload.
 * - references, when present, must be array.
 * - references must be safe resource handles and must not contain internal IDs or paths.
 */
function summarizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") return {};
  const a = args as Record<string, unknown>;
  const s: Record<string, unknown> = {};
  if (typeof a.query === "string") { s.queryChars = a.query.length; s.queryPreview = a.query.slice(0, 40); }
  if (Array.isArray(a.docIds)) { s.docIdCount = a.docIds.length; s.docIds = a.docIds.slice(0, 3); }
  if (Array.isArray(a.blockIds)) { s.blockIdCount = a.blockIds.length; s.blockIds = a.blockIds.slice(0, 3); }
  if (Array.isArray(a.docs)) {
    s.docsCount = a.docs.length;
    const docItems = a.docs as Array<Record<string, unknown>>;
    s.docsDocIdCount = docItems.filter((d) => typeof d.docId === "string").length;
    s.docsBlockIdCount = docItems.filter((d) => typeof d.blockId === "string").length;
    s.docsSourceTypes = [...new Set(docItems.map((d) => d.sourceType).filter(Boolean))].slice(0, 3);
  }
  if (typeof a.readMode === "string") s.readMode = a.readMode;
  if (typeof a.cursor === "string") s.hasCursor = a.cursor.length > 0;
  return s;
}

export function extractAnswerDraft(data: unknown): AnswerDraft {
  if (!data || typeof data !== "object") {
    throw new Error(
      `[ExecutionEngine] answer tool result.data must be an object (got ${typeof data}).`,
    );
  }
  const obj = data as Partial<AnswerToolData>;
  if (typeof obj.body !== "string") {
    throw new Error(
      `[ExecutionEngine] answer tool result.data.body must be an object.`,
    );
  }
  let references: import("../../skills/system/answer/answer.tool").ResourceRef[] | undefined;
  if (obj.references !== undefined) {
    if (!Array.isArray(obj.references)) {
      throw new Error(
        `[ExecutionEngine] answer tool result.data.references must be array.`,
      );
    }
    references = [];
    for (let i = 0; i < obj.references.length; i += 1) {
      const h = obj.references[i];
      if (typeof h !== "object") {
        throw new Error(
          `[ExecutionEngine] answer tool result.data.references[${i}] must be an object (got ${typeof h}).`,
        );
      }
      references.push(h as import("../../skills/system/answer/answer.tool").ResourceRef);
    }
  }
  return {
    body: obj.body,
    references,
  };
}

export function isExecutionOnlyTool(name: string): boolean {
  return EXECUTION_ONLY_TOOL_NAMES.has(name);
}

export type { ToolContract, ToolInput, ToolResult, ToolObservation, ToolManifest, ToolRuntimeContext };
