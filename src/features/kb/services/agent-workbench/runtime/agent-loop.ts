/**
 * AgentLoop: thin generic harness.
 *
 * while true:
 *   build context → model decides → execute tool → append observation → repeat
 *   until answer / stop / abort / repeated invalid decisions
 *
 * The loop knows nothing about search_scope, list_knowledge_map, read_docs,
 * or any business logic.
 */

import type { SkillRegistry } from "../registries/skill-registry";
import type { ToolRegistry } from "../registries/tool-registry";
import type { ToolRuntimeContext } from "../contracts/tool-contract";
import { ToolExecutor } from "./tool-executor";
import { ObservationLog } from "./observation-log";
import { buildPlannerContext, type PlannerContextInput } from "./planner-context-builder";
import { validatePlannerDecision, PlannerDecisionValidationError, type AnswerStageSummary } from "../contracts/planner-decision";
import type { AgentWorkbenchEvent, ToolResultEvent } from "../contracts/turn-event";
import type { SkillObservation } from "../contracts/skill-contract";
import type { PlannerProvider } from "./planner-provider";
import type { ConversationContextSnapshot } from "./conversation-context-builder";
import { pushAgentDebugEvent } from "../debug/workbench-debug";

/**
 * Extract stable error code from Planner provider errors.
 * AgentControlPlaneError carries reasonCode; generic errors fall back.
 * Does NOT import llm-client directly to avoid cross-layer coupling.
 */
function getPlannerErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const reasonCode = (error as { reasonCode?: unknown }).reasonCode;
    if (typeof reasonCode === "string" && reasonCode.length > 0) {
      return reasonCode;
    }
  }
  return "planner_model_call_failed";
}

/**
 * Maps Planner error codes to user-safe message strings.
 * No internal terms (Planner, JSON, provider, etc.) in output.
 */
function getPlannerErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case "stream_idle_timeout":
    case "control_plane_timeout":
      return "模型没有在设定时间内返回可继续执行的内容。";
    case "reasoning_only_control_plane":
    case "empty_content":
      return "模型没有返回可执行内容。";
    case "json_parse_failed":
      return "模型响应格式不符合要求。";
    case "invalid_json":
      return "模型输出格式不符合自动操作要求。";
    case "output_truncated":
      return "模型输出被截断。";
    case "native_tool_calls_not_supported_here":
      return "模型返回了当前模式不支持的内容。";
    case "user_aborted":
      return "用户取消了操作。";
    case "http_401":
      return "连接失败：当前 API Key 未通过鉴权。";
    case "http_403":
      return "连接失败：当前 API Key 没有调用该模型的权限。";
    case "http_429":
      return "请求过于频繁或额度受限，请稍后重试。";
    case "http_5xx":
      return "服务商暂时无法完成请求，请稍后重试。";
    case "http_xxx":
      return "模型请求失败。";
    case "control_plane_fetch_failed":
    case "network_error":
      return "模型请求失败。";
    default:
      return "模型没有返回可继续执行的内容。";
  }
}

/** Error codes that can be repaired by giving Planner one more chance */
function isRecoverablePlannerDecisionError(errorCode: string): boolean {
  return [
    "invalid_json",
    "json_parse_failed",
    "native_tool_calls_not_supported_here",
    "output_truncated",
    "empty_content",
    "reasoning_only_control_plane",
  ].includes(errorCode);
}

/** True when at least one tool has completed successfully this turn */
function hasCompletedToolResult(events: AgentWorkbenchEvent[]): boolean {
  return events.some(
    (e) => e.type === "ToolResult" && (e as ToolResultEvent).ok === true,
  );
}

/** Validation error codes that are repairable (format errors only, not safety boundary) */
const REPAIRABLE_VALIDATION_CODES = new Set([
  "invalid_shape",
  "invalid_answer_shape",
  "invalid_stop_shape",
]);

function isRepairableValidationCode(code: string): boolean {
  return REPAIRABLE_VALIDATION_CODES.has(code);
}

export interface AnswerDraft {
  body: string;
  references?: unknown[];
  stageSummary?: AnswerStageSummary;
}

export interface AgentLoopResult {
  status: "answer_ready" | "stopped_by_planner" | "fail_closed_no_planner_decision";
  answerDraft?: AnswerDraft;
  steps: number;
  events: AgentWorkbenchEvent[];
}

export interface AgentLoopDeps {
  skillRegistry: SkillRegistry;
  toolRegistry: ToolRegistry;
  observationLog: ObservationLog;
  toolExecutor: ToolExecutor;
  /** Planner provider — abstraction over model decision */
  plannerProvider: PlannerProvider;
  /** UI event callback */
  onEvent?: (event: AgentWorkbenchEvent) => void;
  /** Clock */
  now?: () => number;
  /** Abort signal */
  abortSignal?: AbortSignal;
}

export interface AgentLoopInput {
  question: string;
  conversationContext?: ConversationContextSnapshot;
  userEnabledSkillNames: readonly string[];
  userDisabledSkillNames?: readonly string[];
  /** 全局记忆内容（已截断处理） */
  globalMemory?: string;
}

export class AgentLoop {
  private readonly deps: AgentLoopDeps;
  private readonly maxInvalidDecisions = 1;
  private readonly maxToolCallsPerTurn = 12;

  constructor(deps: AgentLoopDeps) {
    this.deps = deps;
  }

  async run(input: AgentLoopInput): Promise<AgentLoopResult> {
    const now = this.deps.now ?? (() => Date.now());
    const log = this.deps.observationLog;
    const emit = (event: AgentWorkbenchEvent): void => {
      this.deps.onEvent?.(event);
    };
    const toolCtx = (): ToolRuntimeContext => ({
      question: input.question,
      callCounts: log.callCounts(),
    });

    let stepIndex = 0;
    let invalidCount = 0;
    let toolCallCount = 0;
    let plannerDecisionRepairUsed = false;
    const events: AgentWorkbenchEvent[] = [];
    const track = (e: AgentWorkbenchEvent): void => {
      events.push(e);
      emit(e);
    };

    log.reset();

    track({
      type: "TurnStarted",
      stepIndex: 0,
      at: now(),
      message: "本轮开始",
    });

    track({
      type: "AssistantMessageStarted",
      stepIndex: 0,
      at: now(),
      message: "准备调用模型",
    });

    while (true) {
      // Check abort
      if (this.deps.abortSignal?.aborted) {
        track({
          type: "TurnFailed",
          stepIndex,
          at: now(),
          status: "aborted",
          errorCode: "user_aborted",
          message: "用户取消了操作。",
        });
        return { status: "stopped_by_planner", steps: stepIndex, events };
      }

      stepIndex += 1;

      // Build context
      const ctxInput: PlannerContextInput = {
        question: input.question,
        conversationContext: input.conversationContext,
        userEnabledSkillNames: input.userEnabledSkillNames,
        userDisabledSkillNames: input.userDisabledSkillNames,
        callCounts: log.callCounts(),
        globalMemory: input.globalMemory,
      };
      const ctx = buildPlannerContext(ctxInput, {
        skillRegistry: this.deps.skillRegistry,
        toolRegistry: this.deps.toolRegistry,
        observationLog: log,
      });
      // Emit generic status before planner decision; cleared by ToolDispatch when a tool runs.
      track({
        type: "Notice",
        stepIndex,
        at: now(),
        message: "正在分析已有信息...",
      });

      // Get decision via planner provider
      let rawDecision: unknown;
      try {
        rawDecision = await this.deps.plannerProvider.decide({ context: ctx, abortSignal: this.deps.abortSignal });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const errorCode = getPlannerErrorCode(err);

        pushAgentDebugEvent("PLANNER_MODEL_CALL_FAILED", {
          errorCode,
          sanitizedMessage: msg.slice(0, 200),
        }, "warn");

        // ── Planner decision repair: if recoverable format error + tools completed ──
        if (
          !plannerDecisionRepairUsed &&
          isRecoverablePlannerDecisionError(errorCode) &&
          hasCompletedToolResult(events)
        ) {
          plannerDecisionRepairUsed = true;

          const repairObservation: SkillObservation = {
            kind: "skill_observation",
            reasonCode: "planner_invalid_decision",
            summary: "上一条模型决策格式无效，请基于当前已有工具结果重新给出合法动作或最终回答。",
            content: {
              ok: false,
              code: "planner_invalid_decision",
              message: "上一条模型决策格式无效，请基于当前已有工具结果重新给出合法动作或最终回答。",
              note: "当前轮已有工具结果仍可用；不要无必要重复执行已经成功且结果仍在上下文中的工具。",
            },
          };
          log.push(repairObservation);

          pushAgentDebugEvent("PLANNER_DECISION_REPAIR", {
            repairUsed: true,
            repairReasonCode: errorCode,
            completedToolCount: events.filter((e) => e.type === "ToolResult" && (e as ToolResultEvent).ok === true).length,
            source: "provider_error",
            message: "已追加一次性决策修正 observation。",
          }, "info");

          track({
            type: "Notice",
            stepIndex,
            at: now(),
            message: "正在重新整理模型决策……",
          });

          continue;
        }

        const userMessage = getPlannerErrorMessage(errorCode);

        track({
          type: "TurnFailed",
          stepIndex,
          at: now(),
          status: "fail_closed_no_planner_decision",
          errorCode,
          message: userMessage,
        });
        return { status: "fail_closed_no_planner_decision", steps: stepIndex, events };
      }

      // Validate decision
      let decision: ReturnType<typeof validatePlannerDecision>;
      try {
        decision = validatePlannerDecision(rawDecision, ctx.toolManifest);
        invalidCount = 0;
      } catch (err) {
        invalidCount += 1;
        const msg = err instanceof Error ? err.message : String(err);

        // ── Safety boundary errors (forbidden_field, forbidden_flow_control) → no repair ──
        if (err instanceof PlannerDecisionValidationError &&
            !isRepairableValidationCode(err.code)) {
          pushAgentDebugEvent("INVALID_PLANNER_DECISION", {
            error: msg.slice(0, 200),
            validationCode: err.code,
          }, "warn");
          track({
            type: "TurnFailed",
            stepIndex,
            at: now(),
            status: "fail_closed_no_planner_decision",
            errorCode: err.code,
            message: "模型输出包含不允许的字段，本轮已停止。",
          });
          return { status: "fail_closed_no_planner_decision", steps: stepIndex, events };
        }

        // ── Planner decision repair: repairable validation error + tools completed ──
        if (
          !plannerDecisionRepairUsed &&
          (err instanceof PlannerDecisionValidationError && isRepairableValidationCode(err.code)) &&
          hasCompletedToolResult(events)
        ) {
          plannerDecisionRepairUsed = true;
          invalidCount = 0;

          const repairObservation: SkillObservation = {
            kind: "skill_observation",
            reasonCode: "planner_invalid_decision",
            summary: "上一条模型决策格式无效，请基于当前已有工具结果重新给出合法动作或最终回答。",
            content: {
              ok: false,
              code: "planner_invalid_decision",
              message: "上一条模型决策格式无效，请基于当前已有工具结果重新给出合法动作或最终回答。",
              note: "当前轮已有工具结果仍可用；不要无必要重复执行已经成功且结果仍在上下文中的工具。",
            },
          };
          log.push(repairObservation);

          pushAgentDebugEvent("PLANNER_DECISION_REPAIR", {
            repairUsed: true,
            repairReasonCode: err.code,
            completedToolCount: events.filter((e) => e.type === "ToolResult" && (e as ToolResultEvent).ok === true).length,
            source: "decision_validation",
            message: "已追加一次性决策修正 observation。",
          }, "info");

          track({
            type: "Notice",
            stepIndex,
            at: now(),
            message: "正在重新整理模型决策……",
          });

          continue;
        }

        if (invalidCount >= this.maxInvalidDecisions) {
          pushAgentDebugEvent("INVALID_PLANNER_DECISION", {
            error: msg.slice(0, 200),
          }, "warn");
          track({
            type: "TurnFailed",
            stepIndex,
            at: now(),
            status: "fail_closed_no_planner_decision",
            errorCode: "invalid_planner_decision",
            message: "模型输出格式不符合自动操作要求。",
          });
          return { status: "fail_closed_no_planner_decision", steps: stepIndex, events };
        }
        continue;
      }

      // Handle stop
      if (decision.type === "stop") {
        track({
          type: "TurnFailed",
          stepIndex,
          at: now(),
          status: "stopped_by_planner",
          errorCode: "planner_stopped",
          message: "模型停止了本轮执行。",
        });
        return { status: "stopped_by_planner", steps: stepIndex, events };
      }

      // Handle answer — internal system action, completely isolated from
      // the ordinary ToolExecutor / ObservationLog pipeline.
      // The answer protocol: Planner outputs {"type":"answer","args":{...}}.
      // We validate/normalize via final_answer tool's schema + execute,
      // but never push to ObservationLog, never affect callCounts.
      if (decision.type === "answer") {
        // Required web access guard: if mode is "required" and no web tool
        // has been called yet, fail closed immediately.
        const webAccess = input.conversationContext?.currentTurn?.webAccess;
        if (webAccess?.mode === "required") {
          const counts = log.callCounts();
          if (!counts["web_search"] && !counts["web_read_page"]) {
            track({
              type: "TurnFailed",
              stepIndex,
              at: now(),
              status: "fail_closed_no_planner_decision",
              errorCode: "required_web_not_used",
              message: "本轮要求联网，但模型没有使用联网能力。",
            });
            return { status: "fail_closed_no_planner_decision", steps: stepIndex, events };
          }
        }

        const result = await executeFinalAnswerSystemAction(
          this.deps.toolRegistry,
          decision.args,
        );

        if (result.ok) {
          track({
            type: "AssistantFinal",
            stepIndex,
            at: now(),
            message: "最终回答已生成",
          });
          return {
            status: "answer_ready",
            answerDraft: {
              body: result.body,
              references: result.references,
              stageSummary: result.stageSummary,
            },
            steps: stepIndex,
            events,
          };
        }

        // Validation failed — emit as TurnFailed, not a regular tool failure
        // result.ok is false here (narrowed by the early return above)
        track({
          type: "TurnFailed",
          stepIndex,
          at: now(),
          status: "fail_closed_no_planner_decision",
          errorCode: "final_answer_invalid",
          message: "最终回答格式不符合要求。",
        });
        return { status: "fail_closed_no_planner_decision", steps: stepIndex, events };
      }

      // Anti-storm safety valve: prevent infinite tool call loops
      if (toolCallCount >= this.maxToolCallsPerTurn) {
        track({
          type: "TurnFailed",
          stepIndex,
          at: now(),
          status: "fail_closed_no_planner_decision",
          errorCode: "tool_call_limit_reached",
          message: "工具调用次数达到本轮安全上限。",
        });
        return { status: "fail_closed_no_planner_decision", steps: stepIndex, events };
      }

      // Handle tool
      const toolCallId = `tool-${stepIndex}-${decision.toolName}`;
      const tool = this.deps.toolRegistry.getTool(decision.toolName);
      const startedAt = now();

      track({
        type: "ToolDispatch",
        stepIndex,
        toolCallId,
        toolName: decision.toolName,
        argsPreview: (summarizeArgsRecord(decision.args) ?? {}) as Record<string, unknown>,
        readOnly: tool?.readOnly ?? true,
        startedAt,
        at: startedAt,
      });

      const outcome = await this.deps.toolExecutor.execute(
        { toolName: decision.toolName, args: decision.args },
        toolCtx(),
      );
      const finishedAt = now();

      track({
        type: "ToolResult",
        stepIndex,
        toolCallId,
        toolName: decision.toolName,
        ok: outcome.ok,
        outputSummary: outcome.observation.summary,
        observationPreview: outcome.observation.summary
          ? outcome.observation.summary.slice(0, 240)
          : undefined,
        errorCode: outcome.observation.reasonCode,
        durationMs: Math.max(0, finishedAt - startedAt),
        at: finishedAt,
      });

      // Increment after execution
      toolCallCount += 1;

      // Continue loop
    }
  }

}

/**
 * Execute final_answer as an internal system action.
 *
 * This is completely isolated from the ordinary ToolExecutor / ObservationLog
 * pipeline. It validates args via the tool's inputSchema, calls tool.execute
 * for normalization, and returns the result directly.
 *
 * Does NOT: push ObservationLog, affect callCounts, emit ToolDispatch/ToolResult.
 */
interface FinalAnswerSystemActionResult {
  ok: boolean;
  body?: string;
  references?: unknown[];
  stageSummary?: AnswerStageSummary;
  errorMessage?: string;
}

async function executeFinalAnswerSystemAction(
  toolRegistry: ToolRegistry,
  args: unknown,
): Promise<FinalAnswerSystemActionResult> {
  const tool = toolRegistry.getTool("final_answer");
  if (!tool) {
    return { ok: false, errorMessage: "final_answer 系统工具未注册。" };
  }

  // Validate args via inputSchema
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      errorMessage: `最终回答参数校验失败：${firstIssue?.message ?? "格式错误"}`,
    };
  }

  // Execute for normalization (tool.execute is async but does no I/O)
  let result;
  try {
    result = await tool.execute({ question: "" } as any, parsed.data);
  } catch (err) {
    return {
      ok: false,
      errorMessage: `最终回答执行异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!result.ok || !result.data) {
    return { ok: false, errorMessage: "最终回答生成失败。" };
  }

  return {
    ok: true,
    body: result.data.body,
    references: result.data.references,
    stageSummary: result.data.stageSummary,
  };
}

/**
 * Generic args preview for UI/trace only.
 * Recursively summarizes args up to maxDepth levels deep.
 * Strings truncated to MAX_PREVIEW_CHARS.
 * Arrays show first 3 items + total count.
 * Objects limited to 2 levels.
 */
const MAX_PREVIEW_CHARS = 80;
const MAX_ARRAY_ITEMS = 3;
const MAX_DEPTH = 2;

function summarizeArgsRecord(args: unknown, depth: number = 0): unknown {
  if (args == null) return args;
  if (depth > MAX_DEPTH) return "{...}";

  if (typeof args === "string") {
    return args.length > MAX_PREVIEW_CHARS ? args.slice(0, MAX_PREVIEW_CHARS) + "…" : args;
  }
  if (typeof args === "number" || typeof args === "boolean") {
    return args;
  }

  if (Array.isArray(args)) {
    const preview = args.slice(0, MAX_ARRAY_ITEMS).map((v) => summarizeArgsRecord(v, depth + 1));
    if (args.length > MAX_ARRAY_ITEMS) {
      preview.push(`...共 ${args.length} 项`);
    }
    return preview;
  }

  if (typeof args === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      out[key] = summarizeArgsRecord(value, depth + 1);
    }
    return out;
  }

  return String(args);
}
