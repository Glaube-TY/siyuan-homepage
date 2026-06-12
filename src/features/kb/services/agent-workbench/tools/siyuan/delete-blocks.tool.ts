import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  deleteBlocksInputSchema,
  deleteBlocksOutputSchema,
} from "./contracts/delete-blocks.contract";
import type { DeleteBlocksInput, DeleteBlocksOutput } from "./contracts/delete-blocks.contract";
import { deleteBlocksInputJsonSchemaOverride } from "./contracts/delete-blocks.contract";

export interface DeleteBlocksDeps {
  executeDeleteBlocks(args: DeleteBlocksInput, abortSignal?: AbortSignal): Promise<{ output: DeleteBlocksOutput }>;
}

export function createDeleteBlocksTool(deps: DeleteBlocksDeps): ToolContract<DeleteBlocksInput, DeleteBlocksOutput> {
  return {
    name: "delete_blocks",
    title: "删除内容块",
    description:
      "删除一个或多个内容块。删除单个块时传入单元素数组，删除多个块时传入多个 blockId。一次确认后批量删除。",
    inputSchema: deleteBlocksInputSchema,
    outputSchema: deleteBlocksOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "blockIds（目标块 ID 列表，最多 50 个，必须属于同一文档）",
    boundary: "只能删除明确给出的真实 blockId。blockIds 必须属于同一文档。不编造 ID。",
    providerVisible: true,
    inputJsonSchemaOverride: deleteBlocksInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(ctx: ToolRuntimeContext, args: DeleteBlocksInput): Promise<ToolResult<DeleteBlocksOutput>> {
      try {
        const result = await deps.executeDeleteBlocks(args, ctx.abortSignal);
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
        // Failed — map by reasonCode
        const reasonCode = data.reasonCode ?? "unknown_error";
        if (reasonCode === "precondition_changed") {
          return {
            ok: false,
            data: null,
            error: {
              code: "write_precondition_changed",
              message: data.message || "目标内容已变化，未执行批量删除。",
              recoverable: true,
              details: {
                target: data.target,
                requestedCount: data.requestedCount,
                deletedCount: data.deletedCount ?? 0,
                reasonCode: data.reasonCode,
              },
            },
          };
        }
        if (reasonCode === "target_not_found") {
          return {
            ok: false,
            data: null,
            error: {
              code: "write_target_not_found",
              message: data.message || "目标内容块不存在。",
              recoverable: true,
              details: {
                target: data.target,
                requestedCount: data.requestedCount,
                deletedCount: data.deletedCount ?? 0,
                reasonCode: data.reasonCode,
              },
            },
          };
        }
        if (reasonCode === "partial_delete_failed") {
          return {
            ok: false,
            data: null,
            error: {
              code: "write_partial_failed",
              message: data.message || "部分块可能已删除，请重新读取文档确认当前状态。",
              recoverable: true,
              details: {
                target: data.target,
                requestedCount: data.requestedCount,
                deletedCount: data.deletedCount ?? 0,
                reasonCode: data.reasonCode,
              },
            },
          };
        }
        return {
          ok: false,
          data: null,
          error: {
            code: "write_operation_failed",
            message: data.message || "批量删除内容块失败。",
            recoverable: false,
            details: data.target ? { target: data.target, requestedCount: data.requestedCount, deletedCount: data.deletedCount ?? 0 } : undefined,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: `批量删除内容块失败：${message}`,
            recoverable: true,
            hint: "请检查 blockIds 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<DeleteBlocksOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "批量删除内容块失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return `已删除 ${data.deletedCount ?? data.requestedCount ?? "?"} 个内容块。`;
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `批量删除内容块失败：${data.message}`;
    },
  };
}
