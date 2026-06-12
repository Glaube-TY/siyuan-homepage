import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  listDocsByTimeInputSchema,
  listDocsByTimeOutputSchema,
} from "./contracts/list-docs-by-time.contract";
import type {
  ListDocsByTimeInput,
  ListDocsByTimeOutput,
} from "./contracts/list-docs-by-time.contract";

export { listDocsByTimeInputSchema } from "./contracts/list-docs-by-time.contract";
export type {
  DocTimeItem,
  ListDocsByTimeInput,
  ListDocsByTimeOutput,
} from "./contracts/list-docs-by-time.contract";

export interface ListDocsByTimeDeps {
  executeListDocsByTime(args: ListDocsByTimeInput): Promise<{ safeOutput: ListDocsByTimeOutput }>;
}

export function createListDocsByTimeTool(deps: ListDocsByTimeDeps): ToolContract<ListDocsByTimeInput, ListDocsByTimeOutput> {
  return {
    name: "list_docs_by_time",
    title: "查看文档状态列表",
    description: "按创建时间或更新时间列出当前知识库范围内的文档，也可限定时间段，帮助了解最近新增或最近修改的笔记。只返回文档 ID、标题和排序时间，不读取正文。",
    inputSchema: listDocsByTimeInputSchema,
    outputSchema: listDocsByTimeOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "sortBy（可选，默认 updated，可选 created），order（可选，默认 desc，可选 asc），limit（可选，默认 20，范围 1-100），startTime/endTime（可选，支持 YYYY-MM-DD 等格式，限定时间范围）。",
    boundary: "只返回文档状态列表（docId、标题、时间），不读取正文。时间范围作用于当前排序字段。范围由聊天框当前知识库范围限定。",
    providerVisible: true,

    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        sortBy: { type: "string", enum: ["updated", "created"], default: "updated" },
        order: { type: "string", enum: ["desc", "asc"], default: "desc" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        startTime: { type: "string" },
        endTime: { type: "string" },
      },
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ListDocsByTimeInput): Promise<ToolResult<ListDocsByTimeOutput>> {
      try {
        const result = await deps.executeListDocsByTime(args);
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

    summarizeResult(result: ToolResult<ListDocsByTimeOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "文档状态列表获取失败。";
      }
      const data = result.data;
      const timeInfo = data.timeRange
        ? `（${data.sortBy === "created" ? "创建时间" : "更新时间"}范围 ${data.timeRange.startTime ?? "不限"} ~ ${data.timeRange.endTime ?? "不限"}）`
        : "";
      return `返回 ${data.returnedCount} 篇文档${data.truncated ? "（结果已截断）" : ""}（按${data.sortBy === "created" ? "创建时间" : "更新时间"}${data.order === "asc" ? "升序" : "降序"}）${timeInfo}。`;
    },
  };
}
