import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  updateAttributeViewCellInputSchema,
  updateAttributeViewCellOutputSchema,
} from "./contracts/update-attribute-view-cell.contract";
import type {
  UpdateAttributeViewCellInput,
  UpdateAttributeViewCellOutput,
} from "./contracts/update-attribute-view-cell.contract";

export { updateAttributeViewCellInputSchema, updateAttributeViewCellOutputSchema } from "./contracts/update-attribute-view-cell.contract";
export type { UpdateAttributeViewCellInput, UpdateAttributeViewCellOutput } from "./contracts/update-attribute-view-cell.contract";

export interface UpdateAttributeViewCellDeps {
  executeUpdateAttributeViewCell(args: UpdateAttributeViewCellInput): Promise<{ ok: boolean; safeOutput: UpdateAttributeViewCellOutput; errorCode?: string }>;
}

export function createUpdateAttributeViewCellTool(
  deps: UpdateAttributeViewCellDeps,
): ToolContract<UpdateAttributeViewCellInput, UpdateAttributeViewCellOutput> {
  return {
    name: "update_attribute_view_cell",
    title: "更新数据库单元格",
    description: "更新一个或多个数据库单元格。支持单个模式（databaseId + rowId + keyId + valueText）和批量模式（databaseId + updates[]）。",
    inputSchema: updateAttributeViewCellInputSchema,
    outputSchema: updateAttributeViewCellOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "database_assistant" },
    source: "builtin",
    inputHint: "单个模式：databaseId + rowId + keyId + valueText；批量模式：databaseId + updates[]（最多 20 项）。字段名、标题和 boundBlockId 不能代替 keyId/条目 ID。",
    boundary: "更新一个或多个单元格；不删除数据库、字段或行；写入前必须已读取 schema。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        rowId: { type: "string", minLength: 1, maxLength: 256 },
        keyId: { type: "string", minLength: 1, maxLength: 256 },
        valueText: { type: "string", maxLength: 1000 },
        valueTypeHint: { type: "string", maxLength: 50 },
        expectedFieldName: { type: "string", maxLength: 50 },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rowId: { type: "string", minLength: 1, maxLength: 256 },
              keyId: { type: "string", minLength: 1, maxLength: 256 },
              valueText: { type: "string", maxLength: 1000 },
              valueTypeHint: { type: "string", maxLength: 50 },
              expectedFieldName: { type: "string", maxLength: 50 },
            },
            required: ["rowId", "keyId", "valueText"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 20,
        },
        summary: { type: "string", maxLength: 300 },
      },
      required: ["databaseId"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: UpdateAttributeViewCellInput): Promise<ToolResult<UpdateAttributeViewCellOutput>> {
      try {
        const result = await deps.executeUpdateAttributeViewCell(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "attribute_view_cell_update_failed",
              message: result.safeOutput.message,
              recoverable: true,
            },
          };
        }
        return { ok: true, data: result.safeOutput };
      } catch (error) {
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: error instanceof Error ? error.message : "更新数据库单元格执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<UpdateAttributeViewCellOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "更新数据库单元格失败。";
      return result.data.message;
    },
  };
}
