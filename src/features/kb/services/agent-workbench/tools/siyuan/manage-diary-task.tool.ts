import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  manageDiaryTaskInputSchema,
  manageDiaryTaskOutputSchema,
} from "./contracts/manage-diary-task.contract";
import type {
  ManageDiaryTaskInput,
  ManageDiaryTaskOutput,
} from "./contracts/manage-diary-task.contract";

export { manageDiaryTaskInputSchema, manageDiaryTaskOutputSchema } from "./contracts/manage-diary-task.contract";
export type {
  ManageDiaryTaskInput,
  ManageDiaryTaskOutput,
} from "./contracts/manage-diary-task.contract";

export interface ManageDiaryTaskDeps {
  executeManageDiaryTask(args: ManageDiaryTaskInput): Promise<{ ok: boolean; safeOutput: ManageDiaryTaskOutput; errorCode?: string }>;
}

export function createManageDiaryTaskTool(
  deps: ManageDiaryTaskDeps,
): ToolContract<ManageDiaryTaskInput, ManageDiaryTaskOutput> {
  return {
    name: "manage_diary_task",
    title: "管理日记任务",
    description: "统一管理强化日记任务：新增（create）、迁移（migrate）、修改状态（set_status）、更新字段（update）、推迟（postpone）、删除（delete）。",
    inputSchema: manageDiaryTaskInputSchema,
    outputSchema: manageDiaryTaskOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "operation（必填）：create/migrate/set_status/update/postpone/delete；target 用于定位已有任务；task 用于任务字段。priority 用数字 1-4（1=❗低 2=❗❗中 3=❗❗❗高 4=❗❗❗❗最高），不要传中文。clearFields 用于 update 操作清空指定字段。",
    boundary: "迁移/修改/推迟/删除前必须通过 query_tasks 获取真实 blockId/taskId；不编造 ID；不能用 create 冒充 migrate；priority 必须是 1-4 数字。delete 可操作任意查询到的任务，默认 deleteMode=log（记录日志后删除），deleteMode=delete 会直接删除且属高风险；测试时只允许删除本轮创建的 disposable 任务。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["create", "migrate", "set_status", "update", "postpone", "delete"] },
        target: {
          type: "object",
          properties: {
            blockId: { type: "string" },
            taskId: { type: "string" },
          },
          additionalProperties: false,
        },
        task: {
          type: "object",
          properties: {
            taskname: { type: "string", minLength: 1, maxLength: 200 },
            priority: { type: "integer", enum: [1, 2, 3, 4] },
            startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            deadline: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            recurrence: { type: "string", maxLength: 100 },
            reminder: { type: "string", maxLength: 100 },
            location: { type: "string", maxLength: 200 },
            tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 60 }, maxItems: 20 },
          },
          additionalProperties: false,
        },
        clearFields: { type: "array", items: { type: "string", enum: ["priority", "startDate", "deadline", "recurrence", "reminder", "location", "tags"] } },
        completed: { type: "boolean" },
        postponeTo: { type: "string", enum: ["tomorrow", "next_week"] },
        deleteMode: { type: "string", enum: ["log", "delete"] },
      },
      required: ["operation"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ManageDiaryTaskInput): Promise<ToolResult<ManageDiaryTaskOutput>> {
      try {
        const result = await deps.executeManageDiaryTask(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "task_update_failed",
              message: result.safeOutput.message,
              recoverable: true,
            },
          };
        }
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: "管理日记任务执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ManageDiaryTaskOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "管理日记任务失败。";
      return result.data.message;
    },
  };
}
