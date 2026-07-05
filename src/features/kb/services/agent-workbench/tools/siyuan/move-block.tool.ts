import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  moveBlockInputSchema,
  moveBlockOutputSchema,
} from "./contracts/move-block.contract";
import type { MoveBlockInput, MoveBlockOutput } from "./contracts/move-block.contract";
import { moveBlockInputJsonSchemaOverride } from "./contracts/move-block.contract";

export interface MoveBlockDeps {
  executeMoveBlock(args: MoveBlockInput, abortSignal?: AbortSignal): Promise<{ output: MoveBlockOutput }>;
}

export function createMoveBlockTool(deps: MoveBlockDeps): ToolContract<MoveBlockInput, MoveBlockOutput> {
  return {
    name: "move_block",
    title: "移动内容块",
    description:
      "移动指定块，并返回操作结果。",
    inputSchema: moveBlockInputSchema,
    outputSchema: moveBlockOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "blockId（要移动的块 ID），previousID（移动到该块后，可选），parentID（移动到该块下，可选）",
    boundary: "只能移动明确给出的真实 blockId；previousID 和 parentID 至少提供一个。不编造 ID。",
    providerVisible: false,
    inputJsonSchemaOverride: moveBlockInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(ctx: ToolRuntimeContext, args: MoveBlockInput): Promise<ToolResult<MoveBlockOutput>> {
      try {
        const result = await deps.executeMoveBlock(args, ctx.abortSignal);
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
            message: `块移动失败：${message}`,
            recoverable: true,
            hint: "请检查 blockId、previousID、parentID 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<MoveBlockOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "块移动失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return "块已移动。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `块未移动：${data.message}`;
    },
  };
}
