import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  listAttributeViewsInputSchema,
  listAttributeViewsOutputSchema,
} from "./contracts/list-attribute-views.contract";
import type {
  ListAttributeViewsInput,
  ListAttributeViewsOutput,
} from "./contracts/list-attribute-views.contract";

export { listAttributeViewsInputSchema, listAttributeViewsOutputSchema } from "./contracts/list-attribute-views.contract";
export type { ListAttributeViewsInput, ListAttributeViewsOutput } from "./contracts/list-attribute-views.contract";

export interface ListAttributeViewsDeps {
  executeListAttributeViews(args: ListAttributeViewsInput): Promise<{ safeOutput: ListAttributeViewsOutput }>;
}

export function createListAttributeViewsTool(
  deps: ListAttributeViewsDeps,
): ToolContract<ListAttributeViewsInput, ListAttributeViewsOutput> {
  return {
    name: "list_attribute_views",
    title: "查找数据库",
    description: "搜索和列出思源数据库/属性视图候选，帮助获取真实 databaseId。",
    inputSchema: listAttributeViewsInputSchema,
    outputSchema: listAttributeViewsOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "keyword 可选；limit 默认 20，最大 50。返回候选后应使用 read_attribute_view 确认 schema。",
    boundary: "只读搜索数据库候选；SQL 兜底结果只是候选，不等同于完整数据库事实。",
    providerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        keyword: { type: "string", maxLength: 100 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ListAttributeViewsInput): Promise<ToolResult<ListAttributeViewsOutput>> {
      try {
        const result = await deps.executeListAttributeViews(args);
        return { ok: true, data: result.safeOutput };
      } catch (error) {
        return {
          ok: false,
          data: null,
          error: {
            code: "attribute_view_search_failed",
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
            hint: "请缩小 keyword 或确认思源版本支持属性视图搜索接口。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ListAttributeViewsOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "数据库查找失败。";
      return `找到 ${result.data.count} 个数据库候选。`;
    },
  };
}
