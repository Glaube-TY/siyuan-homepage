import { z } from "zod";
import { normalizeNotificationDeliveryTargets } from "@/features/notification-center/notification-center-target-resolver";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
import { broadcastNotificationCenterEvent } from "@/features/notification-center/notification-center-events";
import { readJSON, writeJSON } from "@/features/notification-center/notification-center-storage";
import { assertNotificationCenterFeatureAvailable } from "@/features/notification-center/notification-center-plugin";
import { DEFAULT_TASK_NOTIFY_SETTINGS, TASK_NOTIFY_SETTINGS_CHANGED_EVENT, TASK_NOTIFY_SETTINGS_KEY } from "./constants";
import type { TaskNotifyRule, TaskNotifyRuleType, TaskNotifySettings } from "./types";

let pluginInstance: any = null;

export function setTaskNotifyPlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Task Notify 尚未初始化。");
  }
  return pluginInstance;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return undefined;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function migrateChannelIds(value: unknown): NotificationDeliveryTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  return ids.length > 0 ? ids.map((channelId) => ({ kind: "external", channelId })) : [{ kind: "external-default" }];
}

function normalizeRuleType(value: unknown): TaskNotifyRuleType | null {
  if (
    value === "task_reminder" ||
    value === "today_digest" ||
    value === "tomorrow_digest" ||
    value === "overdue_digest" ||
    value === "priority_digest" ||
    value === "custom_filter_digest"
  ) return value;
  return null;
}

function normalizeRule(raw: unknown): TaskNotifyRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const type = normalizeRuleType(value.type);
  if (!type) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  if (!id) return null;
  return {
    id,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    type,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : (type === "task_reminder" ? "任务提醒" : "任务摘要"),
    time: normalizeTime(value.time) ?? undefined,
    deliveryTargets: Array.isArray(value.deliveryTargets)
      ? normalizeNotificationDeliveryTargets(value.deliveryTargets)
      : (migrateChannelIds(value.channelIds) ?? [{ kind: "external-default" }]),
    priorityMin: clampNumber(value.priorityMin, 4, 1, 4),
    customFilter: typeof value.customFilter === "string" ? value.customFilter : undefined,
  };
}

export function normalizeTaskNotifySettings(raw: unknown): TaskNotifySettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TASK_NOTIFY_SETTINGS, rules: [] };
  }
  const value = raw as Record<string, unknown>;
  const rawRules = Array.isArray(value.rules) ? value.rules : [];
  const normalizedRules: TaskNotifyRule[] = [];
  const seenSingletonTypes = new Set<string>();

  for (const r of rawRules) {
    const rule = normalizeRule(r);
    if (!rule) continue;
    if (rule.type !== "custom_filter_digest") {
      if (seenSingletonTypes.has(rule.type)) continue;
      seenSingletonTypes.add(rule.type);
    }
    normalizedRules.push(rule);
  }

  return {
    version: 2,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    scanIntervalMs: clampNumber(value.scanIntervalMs, 60000, 10000, 3600000),
    catchUpWindowMinutes: clampNumber(value.catchUpWindowMinutes, 30, 1, 1440),
    maxTasksPerMessage: clampNumber(value.maxTasksPerMessage, 20, 1, 100),
    includeSourcePath: typeof value.includeSourcePath === "boolean" ? value.includeSourcePath : true,
    includeSiyuanLink: typeof value.includeSiyuanLink === "boolean" ? value.includeSiyuanLink : true,
    rules: normalizedRules,
  };
}

const deliveryTargetSchema: z.ZodSchema<NotificationDeliveryTarget> = z.union([
  z.object({ kind: z.literal("desktop") }),
  z.object({ kind: z.literal("mobile") }),
  z.object({ kind: z.literal("external-default") }),
  z.object({ kind: z.literal("external"), channelId: z.string() }),
]);

const taskNotifyRuleSchema: z.ZodSchema<TaskNotifyRule> = z.object({
  id: z.string(),
  enabled: z.boolean(),
  type: z.enum(["task_reminder", "today_digest", "tomorrow_digest", "overdue_digest", "priority_digest", "custom_filter_digest"]),
  title: z.string(),
  time: z.string().optional(),
  deliveryTargets: z.array(deliveryTargetSchema),
  priorityMin: z.number().optional(),
  customFilter: z.string().optional(),
});

const taskNotifySettingsSchema: z.ZodSchema<TaskNotifySettings> = z.object({
  version: z.literal(2),
  enabled: z.boolean(),
  scanIntervalMs: z.number(),
  catchUpWindowMinutes: z.number(),
  maxTasksPerMessage: z.number(),
  includeSourcePath: z.boolean(),
  includeSiyuanLink: z.boolean(),
  rules: z.array(taskNotifyRuleSchema),
});

const storedSettingsObjectSchema = z.record(z.string(), z.unknown());

async function safeReadTaskNotifySettings(): Promise<TaskNotifySettings | null> {
  getPlugin();
  let raw: Record<string, unknown> | null;
  try {
    raw = await readJSON(TASK_NOTIFY_SETTINGS_KEY, storedSettingsObjectSchema);
  } catch (error) {
    throw new Error(`任务通知设置读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === null) return null;
  try {
    return taskNotifySettingsSchema.parse(normalizeTaskNotifySettings(raw));
  } catch (error) {
    throw new Error(`任务通知设置格式校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadTaskNotifySettings(): Promise<TaskNotifySettings> {
  const raw = await safeReadTaskNotifySettings();
  if (raw === null) return normalizeTaskNotifySettings(null);
  return normalizeTaskNotifySettings(raw);
}

function validateSavedTaskNotifySettings(settings: TaskNotifySettings, original: TaskNotifySettings): void {
  if (settings.version !== 2) throw new Error("任务通知设置保存后版本校验失败。");
  if (settings.enabled !== original.enabled) throw new Error("任务通知总开关保存后校验失败。");
  if (settings.scanIntervalMs !== original.scanIntervalMs) throw new Error("任务通知扫描间隔保存后校验失败。");
  if (settings.catchUpWindowMinutes !== original.catchUpWindowMinutes) throw new Error("任务通知补发窗口保存后校验失败。");
  if (settings.maxTasksPerMessage !== original.maxTasksPerMessage) throw new Error("任务通知消息数量上限保存后校验失败。");
  if (settings.includeSourcePath !== original.includeSourcePath || settings.includeSiyuanLink !== original.includeSiyuanLink) throw new Error("任务通知显示选项保存后校验失败。");
  if (settings.rules.length !== original.rules.length) throw new Error("任务通知规则数量保存后校验失败。");
  for (let index = 0; index < original.rules.length; index += 1) {
    const expected = original.rules[index];
    const actual = settings.rules[index];
    if (!actual || actual.id !== expected.id || actual.type !== expected.type || actual.enabled !== expected.enabled || actual.title !== expected.title || actual.time !== expected.time) {
      throw new Error(`任务通知规则 ${expected.id} 基础字段保存后校验失败。`);
    }
    if (JSON.stringify(actual.deliveryTargets) !== JSON.stringify(expected.deliveryTargets)) throw new Error(`任务通知规则 ${expected.id} 投递目标保存后校验失败。`);
    if (actual.priorityMin !== expected.priorityMin || actual.customFilter !== expected.customFilter) throw new Error(`任务通知规则 ${expected.id} 专属字段保存后校验失败。`);
  }
}

async function saveTaskNotifySettingsChecked(settings: TaskNotifySettings): Promise<TaskNotifySettings> {
  const normalized = normalizeTaskNotifySettings(settings);
  let validated: TaskNotifySettings;
  try {
    validated = taskNotifySettingsSchema.parse(normalized);
  } catch (error) {
    throw new Error(`任务通知设置保存前校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
  getPlugin();
  await writeJSON(TASK_NOTIFY_SETTINGS_KEY, validated, taskNotifySettingsSchema);
  const saved = await safeReadTaskNotifySettings();
  if (saved === null) throw new Error("任务通知设置保存后读取为空。");
  const verified = normalizeTaskNotifySettings(saved);
  validateSavedTaskNotifySettings(verified, normalized);
  window.dispatchEvent(new CustomEvent(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, {
    detail: {
      version: verified.version,
      enabled: verified.enabled,
      ruleCount: verified.rules.length,
    },
  }));
  broadcastNotificationCenterEvent(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, { version: verified.version });
  return verified;
}

export function saveTaskNotifySettings(settings: TaskNotifySettings): Promise<TaskNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  return saveTaskNotifySettingsChecked(settings);
}

export function saveTaskNotifySettingsForMigration(settings: TaskNotifySettings): Promise<TaskNotifySettings> {
  return saveTaskNotifySettingsChecked(settings);
}
