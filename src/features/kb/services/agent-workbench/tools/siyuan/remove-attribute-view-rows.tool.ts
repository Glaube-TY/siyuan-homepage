import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  removeAttributeViewRowsInputSchema,
  removeAttributeViewRowsOutputSchema,
} from "./contracts/remove-attribute-view-rows.contract";
import type {
  RemoveAttributeViewRowsInput,
  RemoveAttributeViewRowsOutput,
} from "./contracts/remove-attribute-view-rows.contract";

export { removeAttributeViewRowsInputSchema, removeAttributeViewRowsOutputSchema } from "./contracts/remove-attribute-view-rows.contract";
export type { RemoveAttributeViewRowsInput, RemoveAttributeViewRowsOutput } from "./contracts/remove-attribute-view-rows.contract";

export interface RemoveAttributeViewRowsDeps {
  executeRemoveAttributeViewRows(args: RemoveAttributeViewRowsInput): Promise<{ ok: boolean; safeOutput: RemoveAttributeViewRowsOutput; errorCode?: string }>;
}

export function createRemoveAttributeViewRowsTool(
  deps: RemoveAttributeViewRowsDeps,
): ToolContract<RemoveAttributeViewRowsInput, RemoveAttributeViewRowsOutput> {
  return {
    name: "remove_attribute_view_rows",
    title: "删除数据库条目",
    description: "在用户确认后，删除思源数据库的一个或多个条目。",
    inputSchema: removeAttributeViewRowsInputSchema,
    outputSchema: removeAttributeViewRowsOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "database_assistant" },
    source: "builtin",
    inputHint: "databaseId 和 rowIds 必须真实；rowIds 必须是 read_attribute_view 返回的 rowId/itemID。",
    boundary: "只删除条目，不删除数据库、不删除字段。一次最多删除 20 行。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        rowIds: { type: "array", items: { type: "string", minLength: 1, maxLength: 256 }, minItems: 1, maxItems: 20 },
        databaseBlockId: { type: "string", maxLength: 256 },
        expectedTitles: { type: "array", items: { type: "string", maxLength: 200 } },
        summary: { type: "string", maxLength: 300 },
      },
      required: ["databaseId", "rowIds"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: RemoveAttributeViewRowsInput): Promise<ToolResult<RemoveAttributeViewRowsOutput>> {
      try {
        const result = await deps.executeRemoveAttributeViewRows(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "attribute_view_rows_remove_failed",
              message: result.safeOutput.message,
              recoverable: result.errorCode !== "write_result_unknown",
            },
          };
        }
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false,
          data: null,
          error: {
            code: "write_result_unknown",
            message: "移除工具执行异常，结果未知；必须先回读，禁止自动重试。",
            recoverable: false,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<RemoveAttributeViewRowsOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "删除数据库条目失败。";
      return result.data.message;
    },
  };
}
