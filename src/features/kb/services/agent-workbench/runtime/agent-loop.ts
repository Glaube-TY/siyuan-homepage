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
import { validatePlannerDecision, type AnswerResourceRef, type AnswerStageSummary } from "../contracts/planner-decision";
import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import type { PlannerProvider } from "./planner-provider";
import type { ConversationContextSnapshot } from "./conversation-context-builder";

export interface AnswerDraft {
  body: string;
  references?: AnswerResourceRef[];
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
}

export class AgentLoop {
  private readonly deps: AgentLoopDeps;
  private readonly maxInvalidDecisions = 3;

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
      };
      const ctx = buildPlannerContext(ctxInput, {
        skillRegistry: this.deps.skillRegistry,
        toolRegistry: this.deps.toolRegistry,
        observationLog: log,
      });
      // Get decision via planner provider
      let rawDecision: unknown;
      try {
        rawDecision = await this.deps.plannerProvider.decide({ context: ctx, abortSignal: this.deps.abortSignal });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        track({
          type: "TurnFailed",
          stepIndex,
          at: now(),
          status: "fail_closed_no_planner_decision",
          message: `模型调用失败：${msg}`,
        });
        return { status: "fail_closed_no_planner_decision", steps: stepIndex, events };
      }

      // Validate decision
      let decision: ReturnType<typeof validatePlannerDecision>;
      try {
        decision = validatePlannerDecision(rawDecision);
        invalidCount = 0;
      } catch (err) {
        invalidCount += 1;
        const msg = err instanceof Error ? err.message : String(err);
        log.push({
          kind: "planner_returned_no_action",
          summary: `输出格式错误：${msg}。请只输出一个纯 JSON object。`,
          reasonCode: "planner_decision_invalid",
        });

        if (invalidCount >= this.maxInvalidDecisions) {
          track({
            type: "TurnFailed",
            stepIndex,
            at: now(),
            status: "fail_closed_no_planner_decision",
            message: "模型连续输出无效决策。",
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
          message: decision.message ?? "模型停止了本轮执行。",
        });
        return { status: "stopped_by_planner", steps: stepIndex, events };
      }

      // Handle answer — internal system action, completely isolated from
      // the ordinary ToolExecutor / ObservationLog pipeline.
      // The answer protocol: Planner outputs {"type":"answer","args":{...}}.
      // We validate/normalize via final_answer tool's schema + execute,
      // but never push to ObservationLog, never affect callCounts.
      if (decision.type === "answer") {
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
          message: result.errorMessage ?? "最终回答校验失败。",
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
  references?: AnswerResourceRef[];
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
    references: result.data.references as AnswerResourceRef[],
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
