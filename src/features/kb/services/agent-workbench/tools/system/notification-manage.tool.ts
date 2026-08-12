import { z } from "zod";
import { scheduledTriggerSchema } from "@/features/background-runtime/schedule-contract";
import {
  createNotificationRuleId,
  deleteNotificationRule,
  getNotificationRule,
  listNotificationRules,
  loadNotificationCenterSettings,
  saveNotificationRule,
} from "@/features/notification-center";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
import { createAggregateTool } from "../aggregate/aggregate-tool-factory";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";

const id = z.string().trim().min(1).max(100);
const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("desktop") }).strict(),
  z.object({ kind: z.literal("mobile") }).strict(),
  z.object({ kind: z.literal("external-default") }).strict(),
  z.object({ kind: z.literal("external"), channelId: id }).strict(),
]);
const listSchema = z.object({ limit: z.number().int().min(1).max(100).default(30) }).strict();
const getSchema = z.object({ ruleId: id }).strict();
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(4_000),
  trigger: scheduledTriggerSchema,
  targets: z.array(targetSchema).min(1).max(16).optional(),
  enabled: z.boolean().default(true),
}).strict();
const updateSchema = z.object({
  ruleId: id,
  expectedRevision: z.number().int().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(4_000).optional(),
  trigger: scheduledTriggerSchema.optional(),
  targets: z.array(targetSchema).min(1).max(16).optional(),
  enabled: z.boolean().optional(),
}).strict();
const mutateSchema = z.object({ ruleId: id, expectedRevision: z.number().int().min(1) }).strict();

function result(ok: boolean, data: unknown, message?: string): ToolResult {
  return ok ? { ok: true, data } : { ok: false, data: null, error: { code: "notification_operation_failed", message: message ?? "通知规则操作失败。", recoverable: true } };
}

function action<T>(name: string, title: string, description: string, schema: z.ZodType<T>, readOnly: boolean, execute: ToolContract<T>["execute"]): ToolContract<T> {
  return {
    name, title, description, inputSchema: schema, readOnly,
    safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" },
    source: "builtin", providerVisible: false, availability: () => ({ available: true }), execute,
  };
}

async function defaultTargets(): Promise<NotificationDeliveryTarget[]> {
  const settings = await loadNotificationCenterSettings();
  const targets: NotificationDeliveryTarget[] = [];
  if (settings.desktop.enabled) targets.push({ kind: "desktop" });
  if (settings.mobile.enabled) targets.push({ kind: "mobile" });
  if (settings.external.enabled) targets.push({ kind: "external-default" });
  if (targets.length === 0) throw new Error("通知中心尚未开启任何通知渠道。");
  return targets;
}

export function createNotificationManageTool(): ToolContract {
  const list = action("notification_list", "列出通知规则", "列出由 Agent 管理的通知规则。", listSchema, true, async (_ctx, args) => result(true, { items: (await listNotificationRules()).slice(0, args.limit) }));
  const get = action("notification_get", "查看通知规则", "读取一条通知规则。", getSchema, true, async (_ctx, args) => result(true, { rule: await getNotificationRule(args.ruleId) }));
  const create = action("notification_create", "创建通知规则", "按固定内容和时间创建通知。", createSchema, false, async (_ctx, args) => {
    try {
      const now = Date.now();
      const rule = await saveNotificationRule({
        schemaVersion: 1, ruleId: createNotificationRuleId(), revision: 1,
        name: args.name, title: args.title, content: args.content, trigger: args.trigger,
        targets: args.targets ?? await defaultTargets(), enabled: args.enabled,
        createdAt: now, updatedAt: now,
      });
      return result(true, { rule });
    } catch (error) { return result(false, null, error instanceof Error ? error.message : String(error)); }
  });
  const update = action("notification_update", "更新通知规则", "修改通知内容、时间、渠道或启用状态。", updateSchema, false, async (_ctx, args) => {
    const current = await getNotificationRule(args.ruleId);
    if (!current || current.revision !== args.expectedRevision) return result(false, null, "通知规则不存在或版本已变化。");
    const rule = await saveNotificationRule({
      ...current, revision: current.revision + 1, updatedAt: Date.now(),
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.trigger !== undefined ? { trigger: args.trigger } : {}),
      ...(args.targets !== undefined ? { targets: args.targets } : {}),
      ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
    }, current.revision);
    return result(true, { rule });
  });
  const remove = action("notification_delete", "删除通知规则", "永久删除通知规则。", mutateSchema, false, async (_ctx, args) => {
    await deleteNotificationRule(args.ruleId, args.expectedRevision);
    return result(true, { deleted: true, ruleId: args.ruleId });
  });
  return createAggregateTool({
    name: "notification_manage", title: "通知中心", description: "创建和管理固定内容的定时通知。",
    boundary: "只负责在指定时间投递已经确定的内容；需要到点读取数据、归纳或调用工具时必须使用 automation_manage。",
    actions: [{ action: "list", tool: list }, { action: "get", tool: get }, { action: "create", tool: create }, { action: "update", tool: update }, { action: "delete", tool: remove }],
  });
}
