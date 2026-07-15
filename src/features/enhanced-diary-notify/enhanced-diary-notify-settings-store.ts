import { z } from "zod";
import { normalizeNotificationDeliveryTargets } from "@/features/notification-center/notification-center-target-resolver";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
import { broadcastNotificationCenterEvent } from "@/features/notification-center/notification-center-events";
import { readJSON, writeJSON } from "@/features/notification-center/notification-center-storage";
import { assertNotificationCenterFeatureAvailable } from "@/features/notification-center/notification-center-plugin";
import { DEFAULT_ENHANCED_DIARY_NOTIFY_SETTINGS, ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, ENHANCED_DIARY_NOTIFY_SETTINGS_KEY } from "./constants";
import type { EnhancedDiaryNotifyRule, EnhancedDiaryNotifyRuleType, EnhancedDiaryNotifySettings } from "./types";

let pluginInstance: any = null;

export function setEnhancedDiaryNotifyPlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Enhanced Diary Notify 尚未初始化。");
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

function normalizeRuleType(value: unknown): EnhancedDiaryNotifyRuleType | null {
  const types: EnhancedDiaryNotifyRuleType[] = [
    "today_diary_missing", "yesterday_review_missing", "unmigrated_tasks_digest", "weekly_review_reminder",
    "daily_review_due", "monthly_review_due", "yearly_review_due", "workspace_overdue_tasks_digest",
    "stale_workspace_tasks_digest", "project_overdue_digest", "project_stale_digest",
    "project_completed_digest", "project_weekly_digest",
  ];
  if (types.includes(value as EnhancedDiaryNotifyRuleType)) return value as EnhancedDiaryNotifyRuleType;
  return null;
}

function normalizeRule(raw: unknown): EnhancedDiaryNotifyRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const type = normalizeRuleType(value.type);
  if (!type) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  if (!id) return null;
  const rawWeekday = typeof value.weekday === "number" ? Math.round(value.weekday) : undefined;
  const weekday = rawWeekday == null ? undefined : Math.max(0, Math.min(6,
    rawWeekday === 7 ? 0 : rawWeekday,
  ));
  return {
    id,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    type,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "强化日记通知",
    time: normalizeTime(value.time) ?? undefined,
    weekday,
    inactiveDaysThreshold: type === "project_stale_digest"
      ? clampNumber(value.inactiveDaysThreshold, 14, 1, 365)
      : type === "stale_workspace_tasks_digest"
        ? clampNumber(value.inactiveDaysThreshold, 7, 1, 365)
        : undefined,
    deliveryTargets: Array.isArray(value.deliveryTargets)
      ? normalizeNotificationDeliveryTargets(value.deliveryTargets)
      : (migrateChannelIds(value.channelIds) ?? [{ kind: "external-default" }]),
  };
}

export function normalizeEnhancedDiaryNotifySettings(raw: unknown): EnhancedDiaryNotifySettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_ENHANCED_DIARY_NOTIFY_SETTINGS, rules: [] };
  }
  const value = raw as Record<string, unknown>;
  const rawRules = Array.isArray(value.rules) ? value.rules : [];
  const normalizedRules: EnhancedDiaryNotifyRule[] = [];
  const seenSingletonTypes = new Set<string>();

  for (const r of rawRules) {
    const rule = normalizeRule(r);
    if (!rule) continue;
    if (rule.type === "today_diary_missing" || rule.type === "yesterday_review_missing") {
      if (seenSingletonTypes.has(rule.type)) continue;
      seenSingletonTypes.add(rule.type);
    }
    normalizedRules.push(rule);
  }

  return {
    version: 3,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    scanIntervalMs: clampNumber(value.scanIntervalMs, 60000, 10000, 3600000),
    catchUpWindowMinutes: clampNumber(value.catchUpWindowMinutes, 30, 1, 1440),
    maxItemsPerMessage: clampNumber(value.maxItemsPerMessage, 20, 1, 100),
    includeSiyuanLink: typeof value.includeSiyuanLink === "boolean" ? value.includeSiyuanLink : true,
    includeProjectPath: typeof value.includeProjectPath === "boolean" ? value.includeProjectPath : true,
    rules: normalizedRules,
  };
}

const deliveryTargetSchema: z.ZodSchema<NotificationDeliveryTarget> = z.union([
  z.object({ kind: z.literal("desktop") }),
  z.object({ kind: z.literal("mobile") }),
  z.object({ kind: z.literal("external-default") }),
  z.object({ kind: z.literal("external"), channelId: z.string() }),
]);

const enhancedDiaryNotifyRuleSchema: z.ZodSchema<EnhancedDiaryNotifyRule> = z.object({
  id: z.string(),
  enabled: z.boolean(),
  type: z.enum([
    "today_diary_missing", "yesterday_review_missing", "unmigrated_tasks_digest", "weekly_review_reminder",
    "daily_review_due", "monthly_review_due", "yearly_review_due", "workspace_overdue_tasks_digest",
    "stale_workspace_tasks_digest", "project_overdue_digest", "project_stale_digest",
    "project_completed_digest", "project_weekly_digest",
  ]),
  title: z.string(),
  time: z.string().optional(),
  weekday: z.number().optional(),
  inactiveDaysThreshold: z.number().optional(),
  deliveryTargets: z.array(deliveryTargetSchema),
});

const enhancedDiaryNotifySettingsSchema: z.ZodSchema<EnhancedDiaryNotifySettings> = z.object({
  version: z.literal(3),
  enabled: z.boolean(),
  scanIntervalMs: z.number(),
  catchUpWindowMinutes: z.number(),
  maxItemsPerMessage: z.number(),
  includeSiyuanLink: z.boolean(),
  includeProjectPath: z.boolean(),
  rules: z.array(enhancedDiaryNotifyRuleSchema),
});

const storedSettingsObjectSchema = z.record(z.string(), z.unknown());

async function safeReadEnhancedDiaryNotifySettings(): Promise<EnhancedDiaryNotifySettings | null> {
  getPlugin();
  let raw: Record<string, unknown> | null;
  try {
    raw = await readJSON(ENHANCED_DIARY_NOTIFY_SETTINGS_KEY, storedSettingsObjectSchema);
  } catch (error) {
    throw new Error(`强化日记通知设置读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === null) return null;
  try {
    return enhancedDiaryNotifySettingsSchema.parse(normalizeEnhancedDiaryNotifySettings(raw));
  } catch (error) {
    throw new Error(`强化日记通知设置格式校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadEnhancedDiaryNotifySettings(): Promise<EnhancedDiaryNotifySettings> {
  const raw = await safeReadEnhancedDiaryNotifySettings();
  if (raw === null) return normalizeEnhancedDiaryNotifySettings(null);
  return normalizeEnhancedDiaryNotifySettings(raw);
}

function validateSavedEnhancedDiaryNotifySettings(settings: EnhancedDiaryNotifySettings, original: EnhancedDiaryNotifySettings): void {
  if (settings.version !== 3) throw new Error("强化日记通知设置保存后版本校验失败。");
  if (settings.enabled !== original.enabled) throw new Error("强化日记通知总开关保存后校验失败。");
  if (settings.scanIntervalMs !== original.scanIntervalMs) throw new Error("强化日记通知扫描间隔保存后校验失败。");
  if (settings.catchUpWindowMinutes !== original.catchUpWindowMinutes) throw new Error("强化日记通知补发窗口保存后校验失败。");
  if (settings.maxItemsPerMessage !== original.maxItemsPerMessage) throw new Error("强化日记通知消息数量上限保存后校验失败。");
  if (settings.includeSiyuanLink !== original.includeSiyuanLink) throw new Error("强化日记通知链接选项保存后校验失败。");
  if (settings.includeProjectPath !== original.includeProjectPath) throw new Error("强化日记通知项目路径选项保存后校验失败。");
  if (settings.rules.length !== original.rules.length) throw new Error("强化日记通知规则数量保存后校验失败。");
  for (let index = 0; index < original.rules.length; index += 1) {
    const expected = original.rules[index];
    const actual = settings.rules[index];
    if (!actual || actual.id !== expected.id || actual.type !== expected.type || actual.enabled !== expected.enabled || actual.title !== expected.title || actual.time !== expected.time) {
      throw new Error(`强化日记通知规则 ${expected.id} 基础字段保存后校验失败。`);
    }
    if (JSON.stringify(actual.deliveryTargets) !== JSON.stringify(expected.deliveryTargets)) throw new Error(`强化日记通知规则 ${expected.id} 投递目标保存后校验失败。`);
    if (actual.weekday !== expected.weekday) throw new Error(`强化日记通知规则 ${expected.id} 专属字段保存后校验失败。`);
    if (actual.inactiveDaysThreshold !== expected.inactiveDaysThreshold) throw new Error(`强化日记通知规则 ${expected.id} 阈值字段保存后校验失败。`);
  }
}

async function saveEnhancedDiaryNotifySettingsChecked(settings: EnhancedDiaryNotifySettings): Promise<EnhancedDiaryNotifySettings> {
  const normalized = normalizeEnhancedDiaryNotifySettings(settings);
  let validated: EnhancedDiaryNotifySettings;
  try {
    validated = enhancedDiaryNotifySettingsSchema.parse(normalized);
  } catch (error) {
    throw new Error(`强化日记通知设置保存前校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
  getPlugin();
  await writeJSON(ENHANCED_DIARY_NOTIFY_SETTINGS_KEY, validated, enhancedDiaryNotifySettingsSchema);
  const saved = await safeReadEnhancedDiaryNotifySettings();
  if (saved === null) throw new Error("强化日记通知设置保存后读取为空。");
  const verified = normalizeEnhancedDiaryNotifySettings(saved);
  validateSavedEnhancedDiaryNotifySettings(verified, normalized);
  window.dispatchEvent(new CustomEvent(ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, {
    detail: {
      version: verified.version,
      enabled: verified.enabled,
      ruleCount: verified.rules.length,
    },
  }));
  broadcastNotificationCenterEvent(ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, { version: verified.version });
  return verified;
}

export function saveEnhancedDiaryNotifySettings(settings: EnhancedDiaryNotifySettings): Promise<EnhancedDiaryNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  return saveEnhancedDiaryNotifySettingsChecked(settings);
}

export function saveEnhancedDiaryNotifySettingsForMigration(settings: EnhancedDiaryNotifySettings): Promise<EnhancedDiaryNotifySettings> {
  return saveEnhancedDiaryNotifySettingsChecked(settings);
}
