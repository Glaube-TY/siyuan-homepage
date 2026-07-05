import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  renameDocInputSchema,
  renameDocOutputSchema,
} from "./contracts/rename-doc.contract";
import type { RenameDocInput, RenameDocOutput } from "./contracts/rename-doc.contract";
import { renameDocInputJsonSchemaOverride } from "./contracts/rename-doc.contract";

export interface RenameDocDeps {
  executeRenameDoc(args: RenameDocInput, abortSignal?: AbortSignal): Promise<{ output: RenameDocOutput }>;
}

export function createRenameDocTool(deps: RenameDocDeps): ToolContract<RenameDocInput, RenameDocOutput> {
  return {
    name: "rename_doc",
    title: "重命名文档",
    description:
      "重命名指定文档的标题，并返回操作结果。",
    inputSchema: renameDocInputSchema,
    outputSchema: renameDocOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "docId（目标文档 ID），title（新标题）",
    boundary: "只能基于明确给出的真实 docId 重命名文档。不编造 ID。",
    providerVisible: false,
    inputJsonSchemaOverride: renameDocInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(ctx: ToolRuntimeContext, args: RenameDocInput): Promise<ToolResult<RenameDocOutput>> {
      try {
        const result = await deps.executeRenameDoc(args, ctx.abortSignal);
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
            message: `文档重命名失败：${message}`,
            recoverable: true,
            hint: "请检查 docId 和 title 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<RenameDocOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "文档重命名失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return data.message || "文档已重命名。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `文档未重命名：${data.message}`;
    },
  };
}
