import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  queryDiaryRecordsInputSchema,
  queryDiaryRecordsOutputSchema,
} from "./contracts/query-diary-records.contract";
import type {
  QueryDiaryRecordsInput,
  QueryDiaryRecordsOutput,
} from "./contracts/query-diary-records.contract";

export { queryDiaryRecordsInputSchema, queryDiaryRecordsOutputSchema } from "./contracts/query-diary-records.contract";
export type {
  QueryDiaryRecordsInput,
  QueryDiaryRecordsOutput,
} from "./contracts/query-diary-records.contract";

export interface QueryDiaryRecordsDeps {
  executeQueryDiaryRecords(args: QueryDiaryRecordsInput): Promise<{ safeOutput: QueryDiaryRecordsOutput }>;
}

export function createQueryDiaryRecordsTool(
  deps: QueryDiaryRecordsDeps,
): ToolContract<QueryDiaryRecordsInput, QueryDiaryRecordsOutput> {
  return {
    name: "query_diary_records",
    title: "查询日记快速记录",
    description: "查询某天或日期范围内的强化日记快速记录，支持分类和关键词筛选。",
    inputSchema: queryDiaryRecordsInputSchema,
    outputSchema: queryDiaryRecordsOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "date 查询单日；或同时传 startDate/endDate 查询范围。category、keyword、limit 可选。日期格式 YYYY-MM-DD。",
    boundary: "只读；不新增、不修改、不删除快速记录，不转任务。范围查询沿用现有最近 90 天保护。",
    plannerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        category: { type: "string", minLength: 1, maxLength: 60 },
        keyword: { type: "string", minLength: 1, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 30 },
      },
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: QueryDiaryRecordsInput): Promise<ToolResult<QueryDiaryRecordsOutput>> {
      try {
        const result = await deps.executeQueryDiaryRecords(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: "快速记录查询执行异常。",
            recoverable: true,
            hint: "请检查日期范围、分类或关键词后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<QueryDiaryRecordsOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "快速记录查询失败。";
      return `快速记录查询返回 ${result.data.returned}/${result.data.totalMatched} 条。`;
    },
  };
}
