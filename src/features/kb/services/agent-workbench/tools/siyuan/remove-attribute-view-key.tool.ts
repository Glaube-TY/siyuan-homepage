import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  removeAttributeViewKeyInputSchema,
  removeAttributeViewKeyOutputSchema,
} from "./contracts/remove-attribute-view-key.contract";
import type {
  RemoveAttributeViewKeyInput,
  RemoveAttributeViewKeyOutput,
} from "./contracts/remove-attribute-view-key.contract";

export { removeAttributeViewKeyInputSchema, removeAttributeViewKeyOutputSchema } from "./contracts/remove-attribute-view-key.contract";
export type { RemoveAttributeViewKeyInput, RemoveAttributeViewKeyOutput } from "./contracts/remove-attribute-view-key.contract";

export interface RemoveAttributeViewKeyDeps {
  executeRemoveAttributeViewKey(args: RemoveAttributeViewKeyInput): Promise<{ ok: boolean; safeOutput: RemoveAttributeViewKeyOutput; errorCode?: string }>;
}

export function createRemoveAttributeViewKeyTool(
  deps: RemoveAttributeViewKeyDeps,
): ToolContract<RemoveAttributeViewKeyInput, RemoveAttributeViewKeyOutput> {
  return {
    name: "remove_attribute_view_key",
    title: "删除数据库字段",
    description: "在用户确认后，删除思源数据库/属性视图的一个字段及其所有值。",
    inputSchema: removeAttributeViewKeyInputSchema,
    outputSchema: removeAttributeViewKeyOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "database_assistant" },
    source: "builtin",
    inputHint: "databaseId 和 keyId 必须真实；expectedKeyName 可选用于安全校验。",
    boundary: "只删除字段，不删除数据库、不删除条目。主字段/block 字段不允许删除。relation/rollup 字段暂不开放删除。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        keyId: { type: "string", minLength: 1, maxLength: 256 },
        removeRelationDest: { type: "boolean", default: false },
        expectedKeyName: { type: "string", maxLength: 50 },
        summary: { type: "string", maxLength: 300 },
      },
      required: ["databaseId", "keyId"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: RemoveAttributeViewKeyInput): Promise<ToolResult<RemoveAttributeViewKeyOutput>> {
      try {
        const result = await deps.executeRemoveAttributeViewKey(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "attribute_view_key_remove_failed",
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
            message: error instanceof Error ? error.message : "删除数据库字段执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<RemoveAttributeViewKeyOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "删除数据库字段失败。";
      return result.data.message;
    },
  };
}
