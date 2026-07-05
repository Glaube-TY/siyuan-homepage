import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  ATTRIBUTE_VIEW_KEY_TYPE_VALUES,
  addAttributeViewKeyInputSchema,
  addAttributeViewKeyOutputSchema,
} from "./contracts/add-attribute-view-key.contract";
import type {
  AddAttributeViewKeyInput,
  AddAttributeViewKeyOutput,
} from "./contracts/add-attribute-view-key.contract";

export { addAttributeViewKeyInputSchema, addAttributeViewKeyOutputSchema } from "./contracts/add-attribute-view-key.contract";
export type { AddAttributeViewKeyInput, AddAttributeViewKeyOutput } from "./contracts/add-attribute-view-key.contract";

export interface AddAttributeViewKeyDeps {
  executeAddAttributeViewKey(args: AddAttributeViewKeyInput): Promise<{ ok: boolean; safeOutput: AddAttributeViewKeyOutput; errorCode?: string }>;
}

export function createAddAttributeViewKeyTool(
  deps: AddAttributeViewKeyDeps,
): ToolContract<AddAttributeViewKeyInput, AddAttributeViewKeyOutput> {
  return {
    name: "add_attribute_view_key",
    title: "新增数据库字段",
    description: "在用户确认后，给思源数据库/属性视图新增一个字段。",
    inputSchema: addAttributeViewKeyInputSchema,
    outputSchema: addAttributeViewKeyOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "database_assistant" },
    source: "builtin",
    inputHint: "databaseId 必须真实；keyName 1-50 字；keyType 使用白名单类型。",
    boundary: "只新增字段，不删除字段、不删除行、不修改布局或分组。字段名重复时拒绝。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        keyName: { type: "string", minLength: 1, maxLength: 50 },
        keyType: { type: "string", enum: [...ATTRIBUTE_VIEW_KEY_TYPE_VALUES] },
        keyIcon: { type: "string", maxLength: 20 },
        previousKeyId: { type: "string", maxLength: 256 },
        summary: { type: "string", maxLength: 300 },
      },
      required: ["databaseId", "keyName", "keyType"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: AddAttributeViewKeyInput): Promise<ToolResult<AddAttributeViewKeyOutput>> {
      try {
        const result = await deps.executeAddAttributeViewKey(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "attribute_view_key_add_failed",
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
            message: error instanceof Error ? error.message : "新增数据库字段执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<AddAttributeViewKeyOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "新增数据库字段失败。";
      return result.data.message;
    },
  };
}
