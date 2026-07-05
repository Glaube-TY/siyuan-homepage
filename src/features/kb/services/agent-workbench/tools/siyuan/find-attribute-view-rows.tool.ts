import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  findAttributeViewRowsInputSchema,
  findAttributeViewRowsOutputSchema,
} from "./contracts/find-attribute-view-rows.contract";
import type {
  FindAttributeViewRowsInput,
  FindAttributeViewRowsOutput,
} from "./contracts/find-attribute-view-rows.contract";

export { findAttributeViewRowsInputSchema, findAttributeViewRowsOutputSchema } from "./contracts/find-attribute-view-rows.contract";
export type { FindAttributeViewRowsInput, FindAttributeViewRowsOutput } from "./contracts/find-attribute-view-rows.contract";

export interface FindAttributeViewRowsDeps {
  executeFindAttributeViewRows(args: FindAttributeViewRowsInput): Promise<{ safeOutput: FindAttributeViewRowsOutput }>;
}

export function createFindAttributeViewRowsTool(
  deps: FindAttributeViewRowsDeps,
): ToolContract<FindAttributeViewRowsInput, FindAttributeViewRowsOutput> {
  return {
    name: "find_attribute_view_rows",
    title: "查找数据库条目",
    description: "在某个数据库内按关键词或字段条件查找条目，返回真实 rowId 和字段摘要。",
    inputSchema: findAttributeViewRowsInputSchema,
    outputSchema: findAttributeViewRowsOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "databaseId 必填；query/fieldName/fieldValue 可选；fieldName 必须能在 schema 中唯一匹配。",
    boundary: "只读本地过滤有限行数据，不执行写入。字段名不存在或重名时会要求先读取 schema/keyId。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        databaseId: { type: "string", minLength: 1, maxLength: 256 },
        viewId: { type: ["string", "null"], minLength: 1, maxLength: 256 },
        query: { type: "string", maxLength: 200 },
        fieldName: { type: "string", minLength: 1, maxLength: 100 },
        fieldValue: { type: "string", maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["databaseId"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: FindAttributeViewRowsInput): Promise<ToolResult<FindAttributeViewRowsOutput>> {
      try {
        const result = await deps.executeFindAttributeViewRows(args);
        return { ok: true, data: result.safeOutput };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const code = msg.startsWith("[field_not_found]")
          ? "field_not_found"
          : msg.startsWith("[ambiguous_field]")
            ? "ambiguous_field"
            : "attribute_view_find_rows_failed";
        return {
          ok: false,
          data: null,
          error: {
            code,
            message: msg.replace(/^\[[^\]]+\]\s*/, ""),
            recoverable: true,
            hint: "请先使用 read_attribute_view 查看真实字段结构，必要时改用 keyId 判断。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<FindAttributeViewRowsOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "数据库条目查找失败。";
      return `找到 ${result.data.count} 条匹配数据库条目。`;
    },
  };
}
