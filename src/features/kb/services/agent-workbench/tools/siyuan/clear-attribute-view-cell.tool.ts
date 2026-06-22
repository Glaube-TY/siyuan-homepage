import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  clearAttributeViewCellInputSchema,
  clearAttributeViewCellOutputSchema,
} from "./contracts/clear-attribute-view-cell.contract";
import type {
  ClearAttributeViewCellInput,
  ClearAttributeViewCellOutput,
} from "./contracts/clear-attribute-view-cell.contract";

export { clearAttributeViewCellInputSchema, clearAttributeViewCellOutputSchema } from "./contracts/clear-attribute-view-cell.contract";
export type { ClearAttributeViewCellInput, ClearAttributeViewCellOutput } from "./contracts/clear-attribute-view-cell.contract";

export interface ClearAttributeViewCellDeps {
  executeClearAttributeViewCell(args: ClearAttributeViewCellInput): Promise<{ ok: boolean; safeOutput: ClearAttributeViewCellOutput; errorCode?: string }>;
}

export function createClearAttributeViewCellTool(
  deps: ClearAttributeViewCellDeps,
): ToolContract<ClearAttributeViewCellInput, ClearAttributeViewCellOutput> {
  return {
    name: "clear_attribute_view_cell",
    title: "清空数据库单元格",
    description: "在用户确认后，清空思源数据库/属性视图中指定单元格的值。",
    inputSchema: clearAttributeViewCellInputSchema,
    outputSchema: clearAttributeViewCellOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "database_assistant" },
    source: "builtin",
    inputHint: "databaseId、rowId、keyId 必须真实；rowId 必须是 itemID。",
    boundary: "只清空单元格值，不删除字段、不删除条目。block 主字段不允许清空。relation/rollup 暂不支持。",
    providerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        rowId: { type: "string", minLength: 1, maxLength: 256 },
        keyId: { type: "string", minLength: 1, maxLength: 256 },
        expectedFieldName: { type: "string", maxLength: 50 },
        summary: { type: "string", maxLength: 300 },
      },
      required: ["databaseId", "rowId", "keyId"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ClearAttributeViewCellInput): Promise<ToolResult<ClearAttributeViewCellOutput>> {
      try {
        const result = await deps.executeClearAttributeViewCell(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "attribute_view_cell_clear_failed",
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
            message: error instanceof Error ? error.message : "清空数据库单元格执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ClearAttributeViewCellOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "清空数据库单元格失败。";
      return result.data.message;
    },
  };
}
