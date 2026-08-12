import { z } from "zod";
import { getNotificationDeviceId } from "@/features/notification-center";
import { createAutomationJobId, automationDeliveryTargetSchema, automationTaskSchema, automationTriggerSchema } from "@/features/agent-platform/automation/automation-job-contract";
import { automationJobStore } from "@/features/agent-platform/automation/automation-job-store";
import { requestAutomationRunNow } from "@/features/agent-platform/automation/automation-control";
import { createAggregateTool } from "../aggregate/aggregate-tool-factory";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
import { createBackgroundJobAgentProfile } from "@/features/agent-platform/agent-profile";

export interface AutomationManageToolOptions { source: { profileId: string; surface: string; conversationId?: string; messageId?: string } }

const id = z.string().trim().min(1).max(100);
const listSchema = z.object({ limit: z.number().int().min(1).max(100).default(30) }).strict();
const getSchema = z.object({ jobId: id }).strict();
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: automationTriggerSchema,
  task: automationTaskSchema,
  targets: z.array(automationDeliveryTargetSchema).min(1).max(16),
  enabled: z.boolean().default(true),
}).strict();
const updateSchema = z.object({
  jobId: id, expectedRevision: z.number().int().min(1), name: z.string().trim().min(1).max(120).optional(),
  trigger: automationTriggerSchema.optional(), task: automationTaskSchema.optional(),
  targets: z.array(automationDeliveryTargetSchema).min(1).max(16).optional(), enabled: z.boolean().optional(),
}).strict();
const mutateSchema = z.object({ jobId: id, expectedRevision: z.number().int().min(1) }).strict();

function result(ok: boolean, data: unknown, message?: string): ToolResult {
  return ok ? { ok: true, data } : { ok: false, data: null, error: { code: "automation_operation_failed", message: message ?? "自动化操作失败。", recoverable: true } };
}

function action<T>(name: string, title: string, description: string, schema: z.ZodType<T>, readOnly: boolean, execute: ToolContract<T>["execute"]): ToolContract<T> {
  return {
    name, title, description, inputSchema: schema, readOnly,
    safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" },
    source: "builtin", providerVisible: false, availability: () => ({ available: true }), execute,
  };
}

function validateBackgroundTask(task: z.infer<typeof automationTaskSchema>): string | undefined {
  const execution = task.kind === "agent" ? task.execution : task.kind === "monitor" && task.reaction.kind === "agent" ? task.reaction.execution : undefined;
  if (!execution) return;
  try {
    createBackgroundJobAgentProfile({ ...execution, maxToolCalls: execution.budget.maxToolCalls });
  } catch (error) { return error instanceof Error ? error.message : String(error); }
}

export function createAutomationManageTool(options: AutomationManageToolOptions): ToolContract {
  const list = action("automation_list", "列出自动化", "列出自动化任务及状态。", listSchema, true, async (_ctx, args) => {
    const jobs = (await automationJobStore.listJobs()).slice(0, args.limit);
    return result(true, { items: await Promise.all(jobs.map(async (job) => ({ job, state: await automationJobStore.getState(job.jobId) }))) });
  });
  const get = action("automation_get", "查看自动化", "读取一条自动化任务。", getSchema, true, async (_ctx, args) => result(true, { job: await automationJobStore.getJob(args.jobId), state: await automationJobStore.getState(args.jobId) }));
  const create = action("automation_create", "创建自动化", "创建固定提醒、后台 Agent 或变化监测任务。", createSchema, false, async (_ctx, args) => {
    const validationError = validateBackgroundTask(args.task);
    if (validationError) return result(false, null, validationError);
    const now = Date.now();
    const job = await automationJobStore.saveJob({
      schemaVersion: 1, jobId: createAutomationJobId(), revision: 1, name: args.name, enabled: args.enabled,
      source: { surface: options.source.surface === "远程机器人对话" ? "robot" : "kb-chat", profileId: options.source.profileId, conversationId: options.source.conversationId, messageId: options.source.messageId },
      trigger: args.trigger, task: args.task,
      runner: { deviceId: getNotificationDeviceId(), runtime: "frontend", requiredCapabilities: [] },
      policy: { catchUp: "latest", overlap: "skip", maxRetries: 1, maxConsecutiveFailures: 3, expiresAfterMs: 86_400_000 },
      delivery: { targets: args.targets, notifyWhen: args.task.kind === "reminder" ? "always" : args.task.kind === "monitor" ? "change-only" : "result-or-error" },
      createdAt: now, updatedAt: now,
    });
    return result(true, { job });
  });
  const update = action("automation_update", "更新自动化", "更新任务定义或启用状态。", updateSchema, false, async (_ctx, args) => {
    const current = await automationJobStore.getJob(args.jobId);
    if (!current || current.revision !== args.expectedRevision) return result(false, null, "任务不存在或版本已变化。");
    const validationError = validateBackgroundTask(args.task ?? current.task);
    if (validationError) return result(false, null, validationError);
    const job = await automationJobStore.saveJob({
      ...current, revision: current.revision + 1, updatedAt: Date.now(),
      ...(args.name !== undefined ? { name: args.name } : {}), ...(args.trigger ? { trigger: args.trigger } : {}),
      ...(args.task ? { task: args.task } : {}), ...(args.targets ? { delivery: { ...current.delivery, targets: args.targets } } : {}),
      ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
    }, current.revision);
    return result(true, { job });
  });
  const runNow = action("automation_run_now", "立即运行", "立即触发一次任务。", mutateSchema, false, async (_ctx, args) => {
    const job = await automationJobStore.getJob(args.jobId);
    if (!job || job.revision !== args.expectedRevision) return result(false, null, "任务不存在或版本已变化。");
    await requestAutomationRunNow(job.jobId); return result(true, { queued: true, jobId: job.jobId });
  });
  const remove = action("automation_delete", "删除自动化", "永久删除任务定义；保留历史运行记录。", mutateSchema, false, async (_ctx, args) => {
    await automationJobStore.deleteJob(args.jobId, args.expectedRevision); return result(true, { deleted: true, jobId: args.jobId });
  });
  const runs = action("automation_runs", "查看运行记录", "列出最近运行结果。", listSchema, true, async (_ctx, args) => result(true, { items: await automationJobStore.listRecentRuns(args.limit) }));
  return createAggregateTool({
    name: "automation_manage", title: "自动化中心", description: "创建和管理定时提醒、后台 Agent 与变化监测。",
    boundary: "所有未来执行都会持久化、受预算限制并写入运行记录；后台 Agent 首期仅允许只读工具。",
    actions: [
      { action: "list", tool: list }, { action: "get", tool: get }, { action: "create", tool: create },
      { action: "update", tool: update }, { action: "run_now", tool: runNow }, { action: "delete", tool: remove }, { action: "runs", tool: runs },
    ],
  });
}
