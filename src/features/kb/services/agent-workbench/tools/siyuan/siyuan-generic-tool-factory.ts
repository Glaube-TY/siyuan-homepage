import type { ZodSchema } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import { pushAgentDebugEvent } from "../../debug/workbench-debug";
import { siyuanToolOutputSchema, type SiyuanToolOutput } from "./contracts/siyuan-common.contract";

export interface GenericSiyuanToolDeps<TArgs> {
  execute(args: TArgs): Promise<{ output: SiyuanToolOutput }>;
}

export interface GenericSiyuanToolOptions<TArgs> {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodSchema<TArgs>;
  readOnly: boolean;
  inputHint: string;
  boundary: string;
  deps: GenericSiyuanToolDeps<TArgs>;
  inputJsonSchemaOverride: unknown;
}

export function createGenericSiyuanTool<TArgs>(
  options: GenericSiyuanToolOptions<TArgs>,
): ToolContract<TArgs, SiyuanToolOutput> {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: siyuanToolOutputSchema,
    readOnly: options.readOnly,
    safety: options.readOnly
      ? { readOnly: true }
      : { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: options.inputHint,
    boundary: options.boundary,
    providerVisible: true,
    inputJsonSchemaOverride: options.inputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: TArgs): Promise<ToolResult<SiyuanToolOutput>> {
      const action = typeof (args as Record<string, unknown>).action === "string"
        ? String((args as Record<string, unknown>).action)
        : options.name;
      try {
        const result = await options.deps.execute(args);
        pushAgentDebugEvent("SIYUAN_TOOL_EXECUTED", {
          toolName: options.name,
          action,
          truncated: result.output.truncated === true,
          hasMore: result.output.hasMore === true,
        }, "info");
        if (result.output.truncated === true) {
          pushAgentDebugEvent("SIYUAN_TOOL_RESULT_TRUNCATED", {
            toolName: options.name,
            action,
          }, "info");
        }
        return { ok: true, data: result.output };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        pushAgentDebugEvent("SIYUAN_TOOL_FAILED", {
          toolName: options.name,
          action,
          error: message.slice(0, 160),
        }, "warn");
        // Distinguish API failures from argument/tool logic failures
        const isApiFailure = message.includes("思源 API 调用失败");
        return {
          ok: false,
          data: null,
          error: {
            code: message.startsWith("[invalid_args]")
              ? "invalid_args"
              : isApiFailure
                ? "siyuan_api_failed"
                : "siyuan_tool_failed",
            message: isApiFailure
              ? message
              : message.replace(/^\[invalid_args\]\s*/, ""),
            recoverable: true,
            hint: isApiFailure
              ? "思源内核 API 调用失败，请检查块 ID、路径或笔记本是否有效，或内核是否正常运行。"
              : "请检查参数是否来自真实的思源 ID、路径或工具返回结果。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<SiyuanToolOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? `${options.title}执行失败。`;
      }
      return `${options.title}已执行：${result.data.action}${result.data.truncated ? "（结果已截断）" : ""}。`;
    },
  };
}
