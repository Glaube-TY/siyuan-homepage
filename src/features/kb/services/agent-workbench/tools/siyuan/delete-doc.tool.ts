import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  deleteDocInputSchema,
  deleteDocOutputSchema,
} from "./contracts/delete-doc.contract";
import type { DeleteDocInput, DeleteDocOutput } from "./contracts/delete-doc.contract";
import { deleteDocInputJsonSchemaOverride } from "./contracts/delete-doc.contract";

export interface DeleteDocDeps {
  executeDeleteDoc(args: DeleteDocInput): Promise<{ output: DeleteDocOutput }>;
}

export function createDeleteDocTool(deps: DeleteDocDeps): ToolContract<DeleteDocInput, DeleteDocOutput> {
  return {
    name: "delete_doc",
    title: "删除文档",
    description:
      "删除指定文档，并返回操作结果。",
    inputSchema: deleteDocInputSchema,
    outputSchema: deleteDocOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "docId（目标文档 ID）",
    boundary: "只能删除明确给出的真实 docId 对应文档。不编造 ID。",
    plannerVisible: true,
    inputJsonSchemaOverride: deleteDocInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: DeleteDocInput): Promise<ToolResult<DeleteDocOutput>> {
      try {
        const result = await deps.executeDeleteDoc(args);
        return { ok: true, data: result.output };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: `文档删除失败：${message}`,
            recoverable: true,
            hint: "请检查 docId 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<DeleteDocOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "文档删除失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return "文档已删除。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `文档未删除：${data.message}`;
    },
  };
}
