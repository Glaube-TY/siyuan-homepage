import { z } from "zod";
import { createRuntimeId } from "../../../libs/runtime-id";
import { isValidStorageId } from "../../kb/services/agent-workbench/storage/notebrain-storage-keys";

const timestampSchema = z.number().int().nonnegative();
const storageIdSchema = z.string().refine(isValidStorageId, "ID 格式无效。");
const shortIdSchema = z.string().trim().min(1).max(100);
const uniqueShortIdsSchema = z.array(shortIdSchema).max(64).refine(
  (values) => new Set(values).size === values.length,
  "列表中不能包含重复项。",
);
const timeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间必须为 HH:mm。");
const timeZoneSchema = z.string().trim().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}, "IANA 时区无效。");

export const automationTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: timestampSchema, timeZone: timeZoneSchema }).strict(),
  z.object({ kind: z.literal("daily"), time: timeOfDaySchema, timeZone: timeZoneSchema }).strict(),
  z.object({
    kind: z.literal("weekly"),
    time: timeOfDaySchema,
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
      .refine((values) => new Set(values).size === values.length, "星期不能重复。"),
    timeZone: timeZoneSchema,
  }).strict(),
  z.object({
    kind: z.literal("monthly"),
    time: timeOfDaySchema,
    daysOfMonth: z.array(z.number().int().min(1).max(31)).min(1).max(31)
      .refine((values) => new Set(values).size === values.length, "日期不能重复。"),
    timeZone: timeZoneSchema,
  }).strict(),
  z.object({
    kind: z.literal("interval"),
    intervalMinutes: z.number().int().min(1).max(43_200),
    anchorAt: timestampSchema,
    timeZone: timeZoneSchema,
  }).strict(),
  z.object({
    kind: z.literal("sensor"),
    sensorId: shortIdSchema,
    intervalMinutes: z.number().int().min(1).max(10_080),
    timeZone: timeZoneSchema,
  }).strict(),
]);

const agentExecutionSchema = z.object({
  goal: z.string().trim().min(1).max(8_000),
  profileId: shortIdSchema,
  allowedToolNames: uniqueShortIdsSchema,
  allowedActionNames: uniqueShortIdsSchema,
  memoryAccess: z.enum(["none", "read"]),
  budget: z.object({
    maxTokens: z.number().int().min(1).max(1_000_000),
    maxToolCalls: z.number().int().min(0).max(200),
    maxDurationMs: z.number().int().min(1_000).max(3_600_000),
  }).strict(),
}).strict();

export const automationTaskSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reminder"),
    message: z.string().trim().min(1).max(4_000),
  }).strict(),
  z.object({
    kind: z.literal("agent"),
    execution: agentExecutionSchema,
  }).strict(),
  z.object({
    kind: z.literal("monitor"),
    reaction: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("notify"), message: z.string().trim().min(1).max(4_000) }).strict(),
      z.object({ kind: z.literal("agent"), execution: agentExecutionSchema }).strict(),
    ]),
  }).strict(),
]);

export const automationDeliveryTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("desktop") }).strict(),
  z.object({ kind: z.literal("mobile") }).strict(),
  z.object({ kind: z.literal("external-default") }).strict(),
  z.object({ kind: z.literal("external"), channelId: shortIdSchema }).strict(),
  z.object({ kind: z.literal("robot"), routeRef: z.string().trim().min(1).max(500) }).strict(),
]);

const sourceSchema = z.object({
  surface: z.enum(["kb-chat", "robot", "settings", "internal"]),
  profileId: shortIdSchema.optional(),
  conversationId: shortIdSchema.optional(),
  messageId: shortIdSchema.optional(),
}).strict();

const runnerSchema = z.object({
  deviceId: shortIdSchema,
  runtime: z.enum(["frontend", "electron", "kernel"]),
  requiredCapabilities: uniqueShortIdsSchema,
}).strict();

const policySchema = z.object({
  catchUp: z.enum(["skip", "run-once", "latest"]),
  overlap: z.enum(["skip", "queue-latest"]),
  maxRetries: z.number().int().min(0).max(5),
  maxConsecutiveFailures: z.number().int().min(1).max(20),
  expiresAfterMs: z.number().int().min(60_000).max(31_536_000_000).optional(),
}).strict();

const deliverySchema = z.object({
  targets: z.array(automationDeliveryTargetSchema).min(1).max(16).refine((targets) => {
    const keys = targets.map((target) => target.kind === "external"
      ? `external:${target.channelId}`
      : target.kind === "robot" ? `robot:${target.routeRef}` : target.kind);
    return new Set(keys).size === keys.length;
  }, "投递目标不能重复。"),
  notifyWhen: z.enum(["always", "result-or-error", "failure-or-action", "change-only"]),
}).strict();

export const automationJobDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: storageIdSchema,
  revision: z.number().int().min(1),
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  source: sourceSchema,
  trigger: automationTriggerSchema,
  task: automationTaskSchema,
  runner: runnerSchema,
  policy: policySchema,
  delivery: deliverySchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((job, context) => {
  if (job.task.kind === "monitor" && job.trigger.kind !== "sensor") {
    context.addIssue({ code: "custom", path: ["trigger"], message: "监测任务必须使用 sensor 触发器。" });
  }
  if (job.task.kind !== "monitor" && job.trigger.kind === "sensor") {
    context.addIssue({ code: "custom", path: ["trigger"], message: "sensor 触发器只能用于监测任务。" });
  }
  if (job.task.kind === "reminder" && job.delivery.notifyWhen !== "always") {
    context.addIssue({ code: "custom", path: ["delivery", "notifyWhen"], message: "固定提醒必须始终投递。" });
  }
  if (job.createdAt > job.updatedAt) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "更新时间不能早于创建时间。" });
  }
});

export const automationJobStateSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: storageIdSchema,
  revision: z.number().int().min(1),
  jobRevision: z.number().int().min(1),
  status: z.enum(["idle", "queued", "running", "paused", "blocked", "failed"]),
  nextRunAt: timestampSchema.optional(),
  pendingScheduledAt: timestampSchema.optional(),
  manualRunRequestedAt: timestampSchema.optional(),
  activeRunId: storageIdSchema.optional(),
  activeRunMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  lastOccurrenceKey: z.string().trim().min(1).max(300).optional(),
  lastScheduledAt: timestampSchema.optional(),
  lastStartedAt: timestampSchema.optional(),
  lastCompletedAt: timestampSchema.optional(),
  sensorCheckpoint: z.object({
    fingerprint: z.string().trim().min(1).max(300),
    checkedAt: timestampSchema,
    summary: z.string().max(2_000).optional(),
  }).strict().optional(),
  consecutiveFailures: z.number().int().nonnegative(),
  pauseReason: z.string().trim().min(1).max(500).optional(),
  updatedAt: timestampSchema,
}).strict().superRefine((state, context) => {
  if (Boolean(state.activeRunId) !== Boolean(state.activeRunMonth)) {
    context.addIssue({ code: "custom", path: ["activeRunId"], message: "活动运行 ID 与月份必须同时存在。" });
  }
});

const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
}).strict();

export const automationRunRecordSchema = z.object({
  schemaVersion: z.literal(1),
  runId: storageIdSchema,
  revision: z.number().int().min(1),
  jobId: storageIdSchema,
  jobRevision: z.number().int().min(1),
  occurrenceKey: z.string().trim().min(1).max(300),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled", "skipped", "waiting-approval"]),
  scheduledAt: timestampSchema,
  queuedAt: timestampSchema,
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  runner: runnerSchema,
  usage: tokenUsageSchema.optional(),
  toolSummaries: z.array(z.object({
    toolName: shortIdSchema,
    action: shortIdSchema.optional(),
    summary: z.string().max(1_000).optional(),
  }).strict()).max(200),
  result: z.object({
    summary: z.string().trim().min(1).max(20_000),
    artifactIds: z.array(storageIdSchema).max(100),
  }).strict().optional(),
  error: z.object({
    code: shortIdSchema,
    message: z.string().trim().min(1).max(2_000),
    retryable: z.boolean(),
    safeToReplay: z.boolean(),
  }).strict().optional(),
  checkpoint: z.object({
    phase: z.enum(["before_model", "before_tool", "waiting_confirmation", "after_tool", "final"]),
    stepIndex: z.number().int().nonnegative(),
    sideEffectState: z.enum(["not_started", "committed", "unknown"]),
    createdAt: timestampSchema,
  }).strict().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((run, context) => {
  if (run.startedAt !== undefined && run.startedAt < run.queuedAt) {
    context.addIssue({ code: "custom", path: ["startedAt"], message: "开始时间不能早于入队时间。" });
  }
  if (run.completedAt !== undefined && run.startedAt !== undefined && run.completedAt < run.startedAt) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "完成时间不能早于开始时间。" });
  }
  if (run.status === "succeeded" && !run.result) {
    context.addIssue({ code: "custom", path: ["result"], message: "成功运行必须包含结果。" });
  }
  if (run.status === "failed" && !run.error) {
    context.addIssue({ code: "custom", path: ["error"], message: "失败运行必须包含错误。" });
  }
  if (["succeeded", "failed", "cancelled", "skipped"].includes(run.status) && run.completedAt === undefined) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "终态运行必须包含完成时间。" });
  }
});

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationTask = z.infer<typeof automationTaskSchema>;
export type AutomationDeliveryTarget = z.infer<typeof automationDeliveryTargetSchema>;
export type AutomationJobDefinition = z.infer<typeof automationJobDefinitionSchema>;
export type AutomationJobState = z.infer<typeof automationJobStateSchema>;
export type AutomationRunRecord = z.infer<typeof automationRunRecordSchema>;

export function createAutomationJobId(): string {
  return createRuntimeId("job");
}

export function createAutomationRunId(): string {
  return createRuntimeId("automation-run");
}
