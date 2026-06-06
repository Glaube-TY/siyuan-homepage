import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  getDailyWorkspaceOverviewInputSchema,
  getDailyWorkspaceOverviewOutputSchema,
} from "./contracts/get-daily-workspace-overview.contract";
import type {
  GetDailyWorkspaceOverviewInput,
  GetDailyWorkspaceOverviewOutput,
} from "./contracts/get-daily-workspace-overview.contract";

export { getDailyWorkspaceOverviewInputSchema, getDailyWorkspaceOverviewOutputSchema } from "./contracts/get-daily-workspace-overview.contract";
export type {
  GetDailyWorkspaceOverviewInput,
  GetDailyWorkspaceOverviewOutput,
} from "./contracts/get-daily-workspace-overview.contract";

export interface GetDailyWorkspaceOverviewDeps {
  executeGetDailyWorkspaceOverview(args: GetDailyWorkspaceOverviewInput): Promise<{ safeOutput: GetDailyWorkspaceOverviewOutput }>;
}

export function createGetDailyWorkspaceOverviewTool(
  deps: GetDailyWorkspaceOverviewDeps,
): ToolContract<GetDailyWorkspaceOverviewInput, GetDailyWorkspaceOverviewOutput> {
  return {
    name: "get_daily_workspace_overview",
    title: "获取日记工作台概览",
    description: "获取某一天强化日记工作台的只读概览，可包含摘要、任务、快速记录、项目、通知、复盘卡片和计划承接。",
    inputSchema: getDailyWorkspaceOverviewInputSchema,
    outputSchema: getDailyWorkspaceOverviewOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "date 可选，YYYY-MM-DD，默认本地今天；include 可选，选择 summary/tasks/records/projects/notifications/reviews/carryover。",
    boundary: "只读；不创建日记，不补模板，不写入任务，不迁移任务，不修改记录。输出按数量和字符数限制截断。",
    plannerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["summary", "tasks", "records", "projects", "notifications", "reviews", "carryover"],
          },
          minItems: 1,
          maxItems: 7,
          default: ["summary", "tasks", "records", "projects", "notifications", "reviews", "carryover"],
        },
      },
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: GetDailyWorkspaceOverviewInput): Promise<ToolResult<GetDailyWorkspaceOverviewOutput>> {
      try {
        const result = await deps.executeGetDailyWorkspaceOverview(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: "获取日记工作台概览异常。",
            recoverable: true,
            hint: "请检查日期参数，或缩小 include 范围后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<GetDailyWorkspaceOverviewOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "获取日记工作台概览失败。";
      const data = result.data;
      return `已获取 ${data.date} 日记工作台概览。`;
    },
  };
}
