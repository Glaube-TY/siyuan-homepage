import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  deleteBlockInputSchema,
  deleteBlockOutputSchema,
} from "./contracts/delete-block.contract";
import type { DeleteBlockInput, DeleteBlockOutput } from "./contracts/delete-block.contract";
import { deleteBlockInputJsonSchemaOverride } from "./contracts/delete-block.contract";

export interface DeleteBlockDeps {
  executeDeleteBlock(args: DeleteBlockInput): Promise<{ output: DeleteBlockOutput }>;
}

export function createDeleteBlockTool(deps: DeleteBlockDeps): ToolContract<DeleteBlockInput, DeleteBlockOutput> {
  return {
    name: "delete_block",
    title: "删除内容块",
    description:
      "删除指定块，并返回操作结果。",
    inputSchema: deleteBlockInputSchema,
    outputSchema: deleteBlockOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "blockId（目标块 ID）",
    boundary: "只能删除明确给出的真实 blockId 对应的块。不编造 ID。",
    plannerVisible: true,
    inputJsonSchemaOverride: deleteBlockInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: DeleteBlockInput): Promise<ToolResult<DeleteBlockOutput>> {
      try {
        const result = await deps.executeDeleteBlock(args);
        return { ok: true, data: result.output };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: `块删除失败：${message}`,
            recoverable: true,
            hint: "请检查 blockId 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<DeleteBlockOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "块删除失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return "块已删除。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `块未删除：${data.message}`;
    },
  };
}
