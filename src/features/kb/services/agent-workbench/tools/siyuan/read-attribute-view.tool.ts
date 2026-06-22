import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  readAttributeViewInputSchema,
  readAttributeViewOutputSchema,
} from "./contracts/read-attribute-view.contract";
import type {
  ReadAttributeViewInput,
  ReadAttributeViewOutput,
} from "./contracts/read-attribute-view.contract";

export { readAttributeViewInputSchema, readAttributeViewOutputSchema } from "./contracts/read-attribute-view.contract";
export type { ReadAttributeViewInput, ReadAttributeViewOutput } from "./contracts/read-attribute-view.contract";

export interface ReadAttributeViewDeps {
  executeReadAttributeView(args: ReadAttributeViewInput): Promise<{ safeOutput: ReadAttributeViewOutput }>;
}

export function createReadAttributeViewTool(
  deps: ReadAttributeViewDeps,
): ToolContract<ReadAttributeViewInput, ReadAttributeViewOutput> {
  return {
    name: "read_attribute_view",
    title: "读取数据库",
    description: "读取思源数据库/属性视图的字段 schema、视图和有限行数据。",
    inputSchema: readAttributeViewInputSchema,
    outputSchema: readAttributeViewOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "databaseId 必须是真实属性视图 ID；viewId 可选且不能当 databaseId；rowLimit 默认 30，最大 100。",
    boundary: "只读读取数据库结构和有限行摘要；不会写入、删除或修改数据库。",
    providerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        viewId: { type: ["string", "null"], minLength: 1, maxLength: 256 },
        includeRows: { type: "boolean" },
        rowLimit: { type: "integer", minimum: 1, maximum: 100 },
        includeRaw: { type: "boolean" },
      },
      required: ["databaseId"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ReadAttributeViewInput): Promise<ToolResult<ReadAttributeViewOutput>> {
      try {
        const result = await deps.executeReadAttributeView(args);
        return { ok: true, data: result.safeOutput };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        let code: string;
        let hint: string;

        if (msg.startsWith("[invalid_database_id]")) {
          code = "invalid_database_id";
          hint = "databaseId 不能为空。请提供 list_attribute_views 中 usableForRead=true 的真实属性视图 ID。";
        } else if (msg.startsWith("[resource_not_found]")) {
          code = "resource_not_found";
          hint = "请确认 databaseId 是真实属性视图 ID，来自 list_attribute_views 或用户提供的 ID。";
        } else {
          code = "attribute_view_read_failed";
          hint = "请确认 databaseId 来自 list_attribute_views 或用户提供的真实属性视图 ID。";
        }

        return {
          ok: false,
          data: null,
          error: {
            code,
            message: msg.replace(/^\[[^\]]+\]\s*/, ""),
            recoverable: true,
            hint,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ReadAttributeViewOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "数据库读取失败。";
      return `数据库「${result.data.database.name || result.data.database.databaseId}」已读取，字段 ${result.data.schema.length} 个，行 ${result.data.rowCount} 条。`;
    },
  };
}
