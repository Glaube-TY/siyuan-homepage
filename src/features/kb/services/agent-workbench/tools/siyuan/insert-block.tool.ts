import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  insertBlockInputSchema,
  insertBlockOutputSchema,
} from "./contracts/insert-block.contract";
import type { InsertBlockInput, InsertBlockOutput } from "./contracts/insert-block.contract";
import { insertBlockInputJsonSchemaOverride } from "./contracts/insert-block.contract";

export interface InsertBlockDeps {
  executeInsertBlock(args: InsertBlockInput, abortSignal?: AbortSignal): Promise<{ output: InsertBlockOutput }>;
}

export function createInsertBlockTool(deps: InsertBlockDeps): ToolContract<InsertBlockInput, InsertBlockOutput> {
  return {
    name: "insert_block",
    title: "插入内容块",
    description:
      "在指定位置插入 Markdown 内容，并返回操作结果。",
    inputSchema: insertBlockInputSchema,
    outputSchema: insertBlockOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "referenceBlockId（参考块 ID），position（插入位置：before/after/child），markdown（要插入的 Markdown 内容）",
    boundary: "只能基于明确给出的真实 referenceBlockId 插入内容。不编造 ID。",
    providerVisible: true,
    inputJsonSchemaOverride: insertBlockInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(ctx: ToolRuntimeContext, args: InsertBlockInput): Promise<ToolResult<InsertBlockOutput>> {
      try {
        const result = await deps.executeInsertBlock(args, ctx.abortSignal);
        const data = result.output;
        if (data.status === "success") {
          return { ok: true, data };
        }
        if (data.status === "rejected") {
          return {
            ok: false,
            data: null,
            error: {
              code: "user_rejected",
              message: data.message || "用户已拒绝操作。",
              recoverable: false,
              details: data.target ? { target: data.target } : undefined,
            },
          };
        }
        return {
          ok: false,
          data: null,
          error: {
            code: "write_operation_failed",
            message: data.message || "写入操作失败。",
            recoverable: false,
            details: data.target ? { target: data.target } : undefined,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: `内容插入失败：${message}`,
            recoverable: true,
            hint: "请检查 referenceBlockId 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<InsertBlockOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "内容插入失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return "内容已插入。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `内容未插入：${data.message}`;
    },
  };
}
