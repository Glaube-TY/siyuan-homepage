import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  updateBlockInputSchema,
  updateBlockOutputSchema,
} from "./contracts/update-block.contract";
import type { UpdateBlockInput, UpdateBlockOutput } from "./contracts/update-block.contract";
import { updateBlockInputJsonSchemaOverride } from "./contracts/update-block.contract";

export interface UpdateBlockDeps {
  executeUpdateBlock(args: UpdateBlockInput, abortSignal?: AbortSignal): Promise<{ output: UpdateBlockOutput }>;
}

export function createUpdateBlockTool(deps: UpdateBlockDeps): ToolContract<UpdateBlockInput, UpdateBlockOutput> {
  return {
    name: "update_block",
    title: "更新块内容",
    description:
      "更新指定块的 Markdown 内容，并返回操作结果。",
    inputSchema: updateBlockInputSchema,
    outputSchema: updateBlockOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "blockId（目标块 ID），markdown（更新后的 Markdown 内容）",
    boundary: "只能更新已经明确给出的真实 blockId。不编造 ID。",
    providerVisible: false,
    inputJsonSchemaOverride: updateBlockInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(ctx: ToolRuntimeContext, args: UpdateBlockInput): Promise<ToolResult<UpdateBlockOutput>> {
      try {
        const result = await deps.executeUpdateBlock(args, ctx.abortSignal);
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
            message: `块内容更新失败：${message}`,
            recoverable: true,
            hint: "请检查 blockId 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<UpdateBlockOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "块内容更新失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return "块内容已更新。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `块内容未更新：${data.message}`;
    },
  };
}
