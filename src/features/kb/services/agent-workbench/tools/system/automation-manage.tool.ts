import { z } from "zod";
import { getNotificationDeviceId } from "@/features/notification-center";
import {
  createAutomationJobId,
  automationTaskSchema,
  automationTriggerSchema,
} from "@/features/agent-platform/automation/automation-job-contract";
import { automationJobStore } from "@/features/agent-platform/automation/automation-job-store";
import { requestAutomationRunNow } from "@/features/agent-platform/automation/automation-control";
import { createAggregateTool } from "../aggregate/aggregate-tool-factory";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
import { createBackgroundJobAgentProfile } from "@/features/agent-platform/agent-profile";

export interface AutomationManageToolOptions {
  source: {
    profileId: string;
    surface: string;
    conversationId?: string;
    messageId?: string;
  };
  resolveRunnerDeviceId?(): string | undefined | Promise<string | undefined>;
}

const id = z.string().trim().min(1).max(100);
const listSchema = z
  .object({ limit: z.number().int().min(1).max(100).default(30) })
  .strict();
const getSchema = z.object({ jobId: id }).strict();
const createSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    trigger: automationTriggerSchema,
    task: automationTaskSchema,
    robotRouteRef: z.string().trim().min(1).max(500).optional(),
    robotConversationId: id.optional(),
    enabled: z.boolean().default(true),
  })
  .strict();
const updateSchema = z
  .object({
    jobId: id,
    expectedRevision: z.number().int().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    trigger: automationTriggerSchema.optional(),
    task: automationTaskSchema.optional(),
    robotRouteRef: z.string().trim().min(1).max(500).nullable().optional(),
    robotConversationId: id.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
const mutateSchema = z
  .object({ jobId: id, expectedRevision: z.number().int().min(1) })
  .strict();

function result(ok: boolean, data: unknown, message?: string): ToolResult {
  return ok
    ? { ok: true, data }
    : {
        ok: false,
        data: null,
        error: {
          code: "automation_operation_failed",
          message: message ?? "自动化操作失败。",
          recoverable: true,
        },
      };
}

function action<T>(
  name: string,
  title: string,
  description: string,
  schema: z.ZodType<T>,
  readOnly: boolean,
  execute: ToolContract<T>["execute"],
): ToolContract<T> {
  return {
    name,
    title,
    description,
    inputSchema: schema,
    readOnly,
    safety: readOnly
      ? { readOnly: true }
      : {
          readOnly: false,
          canWrite: true,
          requiresConfirmation: true,
          riskLevel: "medium",
        },
    source: "builtin",
    providerVisible: false,
    availability: () => ({ available: true }),
    execute,
  };
}

function validateBackgroundTask(
  task: z.infer<typeof automationTaskSchema>,
): string | undefined {
  const execution = task.execution;
  try {
    createBackgroundJobAgentProfile({
      ...execution,
      maxToolCalls: execution.budget.maxToolCalls,
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function createAutomationManageTool(
  options: AutomationManageToolOptions,
): ToolContract {
  const list = action(
    "automation_list",
    "列出自动化",
    "列出自动化任务及状态。",
    listSchema,
    true,
    async (_ctx, args) => {
      const jobs = (await automationJobStore.listJobs()).slice(0, args.limit);
      return result(true, {
        items: await Promise.all(
          jobs.map(async (job) => ({
            job,
            state: await automationJobStore.getState(job.jobId),
          })),
        ),
      });
    },
  );
  const get = action(
    "automation_get",
    "查看自动化",
    "读取一条自动化任务。",
    getSchema,
    true,
    async (_ctx, args) =>
      result(true, {
        job: await automationJobStore.getJob(args.jobId),
        state: await automationJobStore.getState(args.jobId),
      }),
  );
  const create = action(
    "automation_create",
    "创建 Agent 自动任务",
    "创建定时 Agent 或心跳任务。",
    createSchema,
    false,
    async (_ctx, args) => {
      const validationError = validateBackgroundTask(args.task);
      if (validationError) return result(false, null, validationError);
      const now = Date.now();
      const runnerDeviceId =
        (await options.resolveRunnerDeviceId?.())?.trim() ||
        getNotificationDeviceId();
      const replyTarget = args.robotRouteRef
        ? {
            kind: "robot" as const,
            routeRef: args.robotRouteRef,
            conversationMode: "existing" as const,
            ...(args.robotConversationId
              ? { conversationId: args.robotConversationId }
              : {}),
          }
        : options.source.surface !== "远程机器人对话" &&
            options.source.conversationId
          ? {
              kind: "kb-conversation" as const,
              conversationMode: "existing" as const,
              conversationId: options.source.conversationId,
            }
          : undefined;
      const job = await automationJobStore.saveJob({
        schemaVersion: 1,
        jobId: createAutomationJobId(),
        revision: 1,
        name: args.name,
        enabled: args.enabled,
        source: {
          surface:
            options.source.surface === "远程机器人对话" ? "robot" : "kb-chat",
          profileId: options.source.profileId,
          conversationId: options.source.conversationId,
          messageId: options.source.messageId,
        },
        trigger: args.trigger,
        task: args.task,
        runner: {
          deviceId: runnerDeviceId,
          runtime: "frontend",
          requiredCapabilities: [],
        },
        policy: {
          catchUp: "latest",
          overlap: "skip",
          maxRetries: 1,
          maxConsecutiveFailures: 3,
          expiresAfterMs: 86_400_000,
        },
        output: { ...(replyTarget ? { replyTarget } : {}) },
        createdAt: now,
        updatedAt: now,
      });
      return result(true, { job });
    },
  );
  const update = action(
    "automation_update",
    "更新自动化",
    "更新任务定义或启用状态。",
    updateSchema,
    false,
    async (_ctx, args) => {
      const current = await automationJobStore.getJob(args.jobId);
      if (!current || current.revision !== args.expectedRevision)
        return result(false, null, "任务不存在或版本已变化。");
      const validationError = validateBackgroundTask(args.task ?? current.task);
      if (validationError) return result(false, null, validationError);
      const job = await automationJobStore.saveJob(
        {
          ...current,
          revision: current.revision + 1,
          updatedAt: Date.now(),
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.trigger ? { trigger: args.trigger } : {}),
          ...(args.task ? { task: args.task } : {}),
          ...(args.robotRouteRef !== undefined
            ? {
                output: args.robotRouteRef
                  ? {
                      replyTarget: {
                        kind: "robot" as const,
                        routeRef: args.robotRouteRef,
                        conversationMode: "existing" as const,
                        ...(args.robotConversationId
                          ? { conversationId: args.robotConversationId }
                          : {}),
                      },
                    }
                  : {},
              }
            : {}),
          ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
        },
        current.revision,
      );
      return result(true, { job });
    },
  );
  const runNow = action(
    "automation_run_now",
    "立即运行",
    "立即触发一次任务。",
    mutateSchema,
    false,
    async (_ctx, args) => {
      const job = await automationJobStore.getJob(args.jobId);
      if (!job || job.revision !== args.expectedRevision)
        return result(false, null, "任务不存在或版本已变化。");
      await requestAutomationRunNow(job.jobId);
      return result(true, { queued: true, jobId: job.jobId });
    },
  );
  const remove = action(
    "automation_delete",
    "删除自动化",
    "永久删除任务定义；保留历史运行记录。",
    mutateSchema,
    false,
    async (_ctx, args) => {
      await automationJobStore.deleteJob(args.jobId, args.expectedRevision);
      return result(true, { deleted: true, jobId: args.jobId });
    },
  );
  const runs = action(
    "automation_runs",
    "查看运行记录",
    "列出最近运行结果。",
    listSchema,
    true,
    async (_ctx, args) =>
      result(true, {
        items: await automationJobStore.listRecentRuns(args.limit),
      }),
  );
  return createAggregateTool({
    name: "automation_manage",
    title: "Agent 自动化",
    description: "创建和管理定时 Agent 与心跳工作流。",
    boundary:
      "只管理需要 Agent 实际执行的工作流；普通提醒必须使用 notification_manage。所有运行都会持久化、受预算限制并写入运行记录。",
    actions: [
      { action: "list", tool: list },
      { action: "get", tool: get },
      { action: "create", tool: create },
      { action: "update", tool: update },
      { action: "run_now", tool: runNow },
      { action: "delete", tool: remove },
      { action: "runs", tool: runs },
    ],
  });
}
