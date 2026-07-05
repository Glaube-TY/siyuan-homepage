import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  queryTasksInputSchema,
  queryTasksOutputSchema,
} from "./contracts/query-tasks.contract";
import type {
  QueryTasksInput,
  QueryTasksOutput,
} from "./contracts/query-tasks.contract";

export { queryTasksInputSchema, queryTasksOutputSchema } from "./contracts/query-tasks.contract";
export type {
  QueryTasksInput,
  QueryTasksOutput,
} from "./contracts/query-tasks.contract";

export interface QueryTasksDeps {
  executeQueryTasks(args: QueryTasksInput): Promise<{ safeOutput: QueryTasksOutput }>;
}

export function createQueryTasksTool(
  deps: QueryTasksDeps,
): ToolContract<QueryTasksInput, QueryTasksOutput> {
  return {
    name: "query_tasks",
    title: "查询任务",
    description: "查询 Tasks Plus / 强化日记任务，支持范围、完成状态、关键词、标签和优先级等只读筛选。",
    inputSchema: queryTasksInputSchema,
    outputSchema: queryTasksOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "scope 可选 all/today/overdue/upcoming/completed/open；date 为参考日期；startDate/endDate 为 YYYY-MM-DD 范围；status、keyword、tags、priority、limit 可选。",
    boundary: "只读；不修改任务完成状态，不创建任务，不迁移任务，不删除任务，不刷新循环任务。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["all", "today", "overdue", "upcoming", "completed", "open"], default: "all" },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        status: { type: "string", enum: ["done", "not_done", "any"], default: "any" },
        keyword: { type: "string", minLength: 1, maxLength: 200 },
        tags: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 60 },
          maxItems: 20,
        },
        priority: {
          type: "array",
          items: { type: "integer", minimum: 1, maximum: 9 },
          maxItems: 9,
        },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 30 },
      },
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: QueryTasksInput): Promise<ToolResult<QueryTasksOutput>> {
      try {
        const result = await deps.executeQueryTasks(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: "任务查询执行异常。",
            recoverable: true,
            hint: "请检查日期范围、关键词或筛选参数后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<QueryTasksOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "任务查询失败。";
      return `任务查询返回 ${result.data.returned}/${result.data.totalMatched} 条。`;
    },
  };
}
