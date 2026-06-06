import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  findDiaryDocsInputSchema,
  findDiaryDocsOutputSchema,
} from "./contracts/find-diary-docs.contract";
import type {
  FindDiaryDocsInput,
  FindDiaryDocsOutput,
} from "./contracts/find-diary-docs.contract";

export { findDiaryDocsInputSchema, findDiaryDocsOutputSchema } from "./contracts/find-diary-docs.contract";
export type {
  FindDiaryDocsInput,
  FindDiaryDocsOutput,
} from "./contracts/find-diary-docs.contract";

export interface FindDiaryDocsDeps {
  executeFindDiaryDocs(args: FindDiaryDocsInput): Promise<{ safeOutput: FindDiaryDocsOutput }>;
}

export function createFindDiaryDocsTool(
  deps: FindDiaryDocsDeps,
): ToolContract<FindDiaryDocsInput, FindDiaryDocsOutput> {
  return {
    name: "find_diary_docs",
    title: "定位日记文档",
    description: "按日期或周期定位日记、周记、月记、年记文档，并返回 docId、标题、周期范围和复盘状态。",
    inputSchema: findDiaryDocsInputSchema,
    outputSchema: findDiaryDocsOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "period 可选 day/week/month/year；date 查询单个周期；或同时传 startDate/endDate 查询范围。includeMarkdown 默认 false，maxChars 限制预览字数。",
    boundary: "只读；不创建日记，不补模板，不标记完成，不跳过复盘。需要正文详情时，优先拿 docId 调用 read_docs。",
    plannerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["day", "week", "month", "year"], default: "day" },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        includeMarkdown: { type: "boolean", default: false },
        maxChars: { type: "integer", minimum: 100, maximum: 5000, default: 1000 },
      },
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: FindDiaryDocsInput): Promise<ToolResult<FindDiaryDocsOutput>> {
      try {
        const result = await deps.executeFindDiaryDocs(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: "定位日记文档执行异常。",
            recoverable: true,
            hint: "请检查日期、周期或 maxChars 后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<FindDiaryDocsOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "定位日记文档失败。";
      return `定位到 ${result.data.returned} 个${result.data.period}周期文档结果。`;
    },
  };
}
