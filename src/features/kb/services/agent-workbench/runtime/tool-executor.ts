/**
 * ToolExecutor — the SINGLE JSON observation envelope generator.
 *
 * Tools only return ToolResult (data + optional error).
 * ToolExecutor:
 * 1. Validates args (inputSchema)
 * 2. Executes tool
 * 3. Validates output (outputSchema, if present)
 * 4. Builds a unified JSON observation envelope
 * 5. Pushes to ObservationLog
 *
 * No business logic. No tool-specific rendering.
 */

import type { ToolRegistry } from "../registries/tool-registry";
import type { ToolResult, ToolRuntimeContext } from "../contracts/tool-contract";
import type { SkillObservation } from "../contracts/skill-contract";
import type { ObservationLog } from "./observation-log";

export interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ExecutionOutcome {
  ok: boolean;
  toolName: string;
  observation: SkillObservation;
}

/**
 * Unified error envelope for Planner.
 * Tools return ToolErrorDetail with { code, message, ... };
 * ToolExecutor normalizes into this structure.
 */
export interface JsonErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
  hint?: string;
  recoverable?: boolean;
  field?: string;
  expected?: string;
  received?: string;
}

export class ToolExecutor {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly observationLog: ObservationLog,
  ) {}

  async execute(call: ToolCall, ctx: ToolRuntimeContext): Promise<ExecutionOutcome> {
    const tool = this.toolRegistry.getTool(call.toolName);
    if (!tool) {
      return this.fail(call.toolName, {
        code: "tool_not_registered",
        message: "工具未注册。",
        recoverable: false,
      });
    }

    // Hard availability check
    const availability = tool.availability(ctx);
    if (!availability.available) {
      return this.fail(call.toolName, {
        code: availability.reasonCode ?? "unavailable",
        message: availability.hint ?? "工具当前不可用。",
        recoverable: false,
      });
    }

    // Validate input (Zod)
    const parsed = tool.inputSchema.safeParse(call.args);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      return this.fail(call.toolName, {
        code: "invalid_args",
        message: `参数校验失败：${issues[0]?.message ?? "格式错误"}`,
        details: { issues },
        recoverable: true,
      });
    }

    // Execute
    let result: ToolResult;
    try {
      result = await tool.execute(ctx, parsed.data);
    } catch (err) {
      return this.fail(call.toolName, {
        code: "tool_execution_error",
        message: err instanceof Error ? err.message : "工具执行异常。",
        recoverable: true,
      });
    }

    // Validate output (outputSchema, if present)
    // Use parsed data from outputSchema as the canonical Planner-visible data
    if (result.ok && tool.outputSchema) {
      const outputParsed = tool.outputSchema.safeParse(result.data);
      if (!outputParsed.success) {
        const issues = outputParsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        }));
        return this.fail(call.toolName, {
          code: "invalid_tool_output",
          message: "工具输出不符合 schema。",
          details: { issues },
          recoverable: false,
        });
      }
      // Use parsed/stripped data as the canonical Planner data
      result = { ...result, data: outputParsed.data as typeof result.data };
    }

    // Build unified observation envelope — ToolExecutor is the single builder.
    if (result.ok) {
      return this.succeed(call.toolName, result, tool.summarizeResult?.(result, ctx));
    }

    // Failure: normalize error from ToolErrorDetail into JSON error envelope
    return this.fail(call.toolName, {
      code: result.error?.code ?? "unknown_error",
      message: result.error?.message ?? "工具执行失败。",
      details: result.error?.details,
      hint: result.error?.hint,
      recoverable: result.error?.recoverable,
      field: result.error?.field,
      expected: result.error?.expected,
      received: result.error?.received,
    });
  }

  // ── success envelope ──

  private succeed(
    toolName: string,
    result: ToolResult,
    summary?: string,
  ): ExecutionOutcome {
    const obs: SkillObservation = {
      kind: "tool_executed",
      toolName,
      summary: summary ?? `工具 ${toolName} 执行成功。`,
      content: result.data,
    };
    this.observationLog.push(obs);
    return { ok: true, toolName, observation: obs };
  }

  // ── failure envelope ──

  private fail(
    toolName: string,
    error: JsonErrorEnvelope,
  ): ExecutionOutcome {
    const summary = error.message;

    const errorEnvelope: Record<string, unknown> = {
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) errorEnvelope.details = error.details;
    if (error.hint !== undefined) errorEnvelope.hint = error.hint;
    if (error.recoverable !== undefined) errorEnvelope.recoverable = error.recoverable;
    if (error.field !== undefined) errorEnvelope.field = error.field;
    if (error.expected !== undefined) errorEnvelope.expected = error.expected;
    if (error.received !== undefined) errorEnvelope.received = error.received;

    const obs: SkillObservation = {
      kind: "tool_failed",
      toolName,
      summary,
      reasonCode: error.code,
      content: { error: errorEnvelope },
    };
    this.observationLog.push(obs);
    return { ok: false, toolName, observation: obs };
  }
}
