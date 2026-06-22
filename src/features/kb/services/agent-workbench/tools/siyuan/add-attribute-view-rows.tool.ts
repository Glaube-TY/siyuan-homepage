import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  addAttributeViewRowsInputSchema,
  addAttributeViewRowsOutputSchema,
} from "./contracts/add-attribute-view-rows.contract";
import type {
  AddAttributeViewRowsInput,
  AddAttributeViewRowsOutput,
} from "./contracts/add-attribute-view-rows.contract";

export { addAttributeViewRowsInputSchema, addAttributeViewRowsOutputSchema } from "./contracts/add-attribute-view-rows.contract";
export type { AddAttributeViewRowsInput, AddAttributeViewRowsOutput } from "./contracts/add-attribute-view-rows.contract";

export interface AddAttributeViewRowsDeps {
  executeAddAttributeViewRows(args: AddAttributeViewRowsInput): Promise<{ ok: boolean; safeOutput: AddAttributeViewRowsOutput; errorCode?: string }>;
}

export function createAddAttributeViewRowsTool(
  deps: AddAttributeViewRowsDeps,
): ToolContract<AddAttributeViewRowsInput, AddAttributeViewRowsOutput> {
  return {
    name: "add_attribute_view_rows",
    title: "添加条目到数据库",
    description: "在用户确认后，将已有块加入数据库，或添加少量脱离块条目。",
    inputSchema: addAttributeViewRowsInputSchema,
    outputSchema: addAttributeViewRowsOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "database_assistant" },
    source: "builtin",
    inputHint: "databaseId 必填；databaseBlockId 可选，来自 list_attribute_views 的 blockId；blockIds 是要加入数据库的已有块，最多 20 个；defaultValues 使用真实 keyId 更可靠。",
    boundary: "只添加条目，不删除、不移除绑定块、不批量替换整库。已有块和脱离块语义不同。",
    providerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        databaseBlockId: { type: "string", minLength: 1, maxLength: 256 },
        blockIds: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 256 },
          maxItems: 20,
        },
        detachedRows: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: 200 },
              values: {
                type: "object",
                additionalProperties: { type: "string", maxLength: 1000 },
              },
            },
            additionalProperties: false,
          },
        },
        defaultValues: {
          type: "object",
          additionalProperties: { type: "string", maxLength: 1000 },
        },
        summary: { type: "string", maxLength: 300 },
      },
      required: ["databaseId"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: AddAttributeViewRowsInput): Promise<ToolResult<AddAttributeViewRowsOutput>> {
      try {
        const result = await deps.executeAddAttributeViewRows(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "attribute_view_rows_add_failed",
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
            message: error instanceof Error ? error.message : "添加数据库条目执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<AddAttributeViewRowsOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "添加数据库条目失败。";
      return result.data.message;
    },
  };
}
