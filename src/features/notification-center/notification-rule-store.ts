import { z } from "zod";
import { createRuntimeId } from "@/libs/runtime-id";
import { scheduledTriggerSchema } from "@/features/background-runtime/schedule-contract";
import { readJSON, writeJSON } from "./notification-center-storage";
import { NOTIFICATION_RULES_CHANGED_EVENT } from "./constants";
import { broadcastNotificationCenterEvent } from "./notification-center-events";
import { notificationLockName, withNotificationLock } from "./notification-center-locks";
import type { NotificationRule } from "./types";

const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("desktop") }).strict(), z.object({ kind: z.literal("mobile") }).strict(),
  z.object({ kind: z.literal("external-default") }).strict(), z.object({ kind: z.literal("external"), channelId: z.string().trim().min(1).max(100) }).strict(),
]);
export const notificationRuleSchema = z.object({
  schemaVersion: z.literal(1), ruleId: z.string().regex(/^notification-rule-[A-Za-z0-9_-]+$/), revision: z.number().int().min(1),
  name: z.string().trim().min(1).max(120), enabled: z.boolean(), title: z.string().trim().min(1).max(300), content: z.string().trim().min(1).max(4_000),
  trigger: scheduledTriggerSchema, targets: z.array(target).min(1).max(16), createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
}).strict();
const fileSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), items: z.array(notificationRuleSchema), updatedAt: z.number().int().nonnegative() }).strict();
const KEY = "notification-center/rules.json";
const LOCK = notificationLockName("rules", KEY);

async function loadFile(): Promise<{ schemaVersion: 1; revision: number; items: NotificationRule[]; updatedAt: number }> {
  return (await readJSON(KEY, fileSchema) as { schemaVersion: 1; revision: number; items: NotificationRule[]; updatedAt: number } | null)
    ?? { schemaVersion: 1, revision: 0, items: [], updatedAt: 0 };
}
async function saveFile(file: z.infer<typeof fileSchema>) {
  const saved = await writeJSON(KEY, file, fileSchema);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_RULES_CHANGED_EVENT));
    broadcastNotificationCenterEvent(NOTIFICATION_RULES_CHANGED_EVENT);
  }
  return saved;
}

export function createNotificationRuleId(): string { return createRuntimeId("notification-rule"); }
export async function listNotificationRules(): Promise<NotificationRule[]> { return (await loadFile()).items.sort((a, b) => b.updatedAt - a.updatedAt); }
export async function getNotificationRule(ruleId: string): Promise<NotificationRule | undefined> { return (await loadFile()).items.find((item) => item.ruleId === ruleId); }
export async function saveNotificationRule(rule: NotificationRule, expectedRevision?: number): Promise<NotificationRule> {
  return withNotificationLock(LOCK, async () => {
    const parsed = notificationRuleSchema.parse(rule) as NotificationRule;
    const file = await loadFile();
    const current = file.items.find((item) => item.ruleId === parsed.ruleId);
    if (!current && parsed.revision !== 1) throw new Error("新通知规则 revision 必须为 1。");
    if (current && (expectedRevision !== current.revision || parsed.revision !== current.revision + 1)) throw new Error("通知规则已变化，请刷新后重试。");
    file.items = [...file.items.filter((item) => item.ruleId !== parsed.ruleId), parsed]; file.revision += 1; file.updatedAt = Date.now();
    const saved = await saveFile(file);
    return saved.items.find((item) => item.ruleId === parsed.ruleId) as NotificationRule;
  });
}
export async function deleteNotificationRule(ruleId: string, expectedRevision: number): Promise<void> {
  await withNotificationLock(LOCK, async () => {
    const file = await loadFile();
    const current = file.items.find((item) => item.ruleId === ruleId);
    if (!current) return;
    if (current.revision !== expectedRevision) throw new Error("通知规则已变化，请刷新后重试。");
    file.items = file.items.filter((item) => item.ruleId !== ruleId); file.revision += 1; file.updatedAt = Date.now();
    await saveFile(file);
    if ((await loadFile()).items.some((item) => item.ruleId === ruleId)) throw new Error("通知规则删除后校验失败。");
  });
}
