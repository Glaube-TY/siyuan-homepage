import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  listItemsByTimeInputSchema,
  listItemsByTimeOutputSchema,
} from "./contracts/list-items-by-time.contract";
import type {
  ListItemsByTimeInput,
  ListItemsByTimeOutput,
} from "./contracts/list-items-by-time.contract";

export { listItemsByTimeInputSchema } from "./contracts/list-items-by-time.contract";
export type {
  ListTimeItem,
  ListItemsByTimeInput,
  ListItemsByTimeOutput,
} from "./contracts/list-items-by-time.contract";

export interface ListItemsByTimeDeps {
  executeListItemsByTime(args: ListItemsByTimeInput): Promise<{ safeOutput: ListItemsByTimeOutput }>;
}

export function createListItemsByTimeTool(deps: ListItemsByTimeDeps): ToolContract<ListItemsByTimeInput, ListItemsByTimeOutput> {
  return {
    name: "list_items_by_time",
    title: "查看文档与内容块时间列表",
    description: "按创建时间或更新时间列出当前知识库范围内的文档或内容块。itemType=\"doc\" 列出文档，itemType=\"block\" 列出段落、标题、列表项等内容块。只返回 ID、标题、时间等状态线索，不读取正文。",
    inputSchema: listItemsByTimeInputSchema,
    outputSchema: listItemsByTimeOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "itemType（必填，doc/block）；sortBy（可选，默认 updated）；order（可选，默认 desc）；limit（可选，默认 20，范围 1-100）；startTime/endTime（可选，YYYY-MM-DD 等格式）；blockTypes（可选，仅 block 模式可用，如 [\"p\",\"h\",\"l\"]）。",
    boundary: "只返回时间排序的状态列表，不读取正文。blockTypes 仅在 itemType=\"block\" 时有效。范围由聊天框当前知识库范围限定。需要正文证据时请使用 read_doc_blocks 或 read_docs。",
    providerVisible: false,

    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        itemType: { type: "string", enum: ["doc", "block"] },
        sortBy: { type: "string", enum: ["updated", "created"], default: "updated" },
        order: { type: "string", enum: ["desc", "asc"], default: "desc" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        startTime: { type: "string" },
        endTime: { type: "string" },
        blockTypes: {
          type: "array",
          items: { type: "string", enum: ["p", "h", "l", "i", "b", "c", "m", "t", "s", "html", "tb", "widget", "iframe", "query_embed", "super"] },
        },
      },
      required: ["itemType"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ListItemsByTimeInput): Promise<ToolResult<ListItemsByTimeOutput>> {
      try {
        const result = await deps.executeListItemsByTime(args);
        return { ok: true, data: result.safeOutput };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isInvalidArgs = msg.startsWith("[invalid_args]");
        return {
          ok: false, data: null,
          error: {
            code: isInvalidArgs ? "invalid_args" : "tool_internal_error",
            message: msg.replace(/^\[invalid_args\]\s*/, ""),
            recoverable: true,
            hint: isInvalidArgs
              ? "请检查时间格式，支持 YYYY-MM-DD 或 YYYYMMDDHHmmss。"
              : "请检查排序参数是否合法后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ListItemsByTimeOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "时间列表获取失败。";
      }
      const data = result.data;
      const label = data.itemType === "doc" ? "文档" : "内容块";
      const timeInfo = data.timeRange
        ? `（${data.sortBy === "created" ? "创建时间" : "更新时间"}范围 ${data.timeRange.startTime ?? "不限"} ~ ${data.timeRange.endTime ?? "不限"}）`
        : "";
      return `返回 ${data.returnedCount} 个${label}${data.truncated ? "（结果已截断）" : ""}（按${data.sortBy === "created" ? "创建时间" : "更新时间"}${data.order === "asc" ? "升序" : "降序"}）${timeInfo}。`;
    },
  };
}
