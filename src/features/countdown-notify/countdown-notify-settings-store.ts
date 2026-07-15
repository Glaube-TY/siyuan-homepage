import { z } from "zod";
import { normalizeNotificationDeliveryTargets } from "@/features/notification-center/notification-center-target-resolver";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
import { broadcastNotificationCenterEvent } from "@/features/notification-center/notification-center-events";
import { readJSON, writeJSON } from "@/features/notification-center/notification-center-storage";
import { assertNotificationCenterFeatureAvailable } from "@/features/notification-center/notification-center-plugin";
import { DEFAULT_COUNTDOWN_NOTIFY_SETTINGS, COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, COUNTDOWN_NOTIFY_SETTINGS_KEY } from "./constants";
import type { CountdownNotifyRule, CountdownNotifyRuleType, CountdownNotifySettings } from "./types";

let pluginInstance: any = null;

export function setCountdownNotifyPlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Countdown Notify 尚未初始化。");
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

function normalizeRuleType(value: unknown): CountdownNotifyRuleType | null {
  if (value === "today_events" || value === "advance_events" || value === "upcoming_digest") return value;
  return null;
}

function normalizeRule(raw: unknown): CountdownNotifyRule | null {
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
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : (type === "today_events" ? "今日事件提醒" : "预备提醒"),
    time: normalizeTime(value.time) ?? undefined,
    advanceDays: Array.isArray(value.advanceDays) ? value.advanceDays.filter((d: unknown): d is number => typeof d === "number" && Number.isFinite(d)) : undefined,
    upcomingDays: typeof value.upcomingDays === "number" && Number.isFinite(value.upcomingDays) ? Math.max(1, Math.min(365, Math.round(value.upcomingDays))) : undefined,
    deliveryTargets: Array.isArray(value.deliveryTargets)
      ? normalizeNotificationDeliveryTargets(value.deliveryTargets)
      : (migrateChannelIds(value.channelIds) ?? [{ kind: "external-default" }]),
  };
}

export function normalizeCountdownNotifySettings(raw: unknown): CountdownNotifySettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_COUNTDOWN_NOTIFY_SETTINGS, rules: [] };
  }
  const value = raw as Record<string, unknown>;
  const rawRules = Array.isArray(value.rules) ? value.rules : [];
  const normalizedRules: CountdownNotifyRule[] = [];
  const seenSingleton = new Set<string>();
  for (const r of rawRules) {
    const rule = normalizeRule(r);
    if (!rule) continue;
    if (rule.type !== "advance_events" && rule.type !== "upcoming_digest") {
      if (seenSingleton.has(rule.type)) continue;
      seenSingleton.add(rule.type);
    }
    normalizedRules.push(rule);
  }
  return {
    version: 3,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    scanIntervalMs: clampNumber(value.scanIntervalMs, 60000, 10000, 3600000),
    catchUpWindowMinutes: clampNumber(value.catchUpWindowMinutes, 30, 1, 1440),
    maxEventsPerMessage: clampNumber(value.maxEventsPerMessage, 20, 1, 100),
    rules: normalizedRules,
  };
}

const deliveryTargetSchema: z.ZodSchema<NotificationDeliveryTarget> = z.union([
  z.object({ kind: z.literal("desktop") }),
  z.object({ kind: z.literal("mobile") }),
  z.object({ kind: z.literal("external-default") }),
  z.object({ kind: z.literal("external"), channelId: z.string() }),
]);

const countdownNotifyRuleSchema: z.ZodSchema<CountdownNotifyRule> = z.object({
  id: z.string(),
  enabled: z.boolean(),
  type: z.enum(["today_events", "advance_events", "upcoming_digest"]),
  title: z.string(),
  time: z.string().optional(),
  advanceDays: z.array(z.number()).optional(),
  upcomingDays: z.number().optional(),
  deliveryTargets: z.array(deliveryTargetSchema),
});

const countdownNotifySettingsSchema: z.ZodSchema<CountdownNotifySettings> = z.object({
  version: z.literal(3),
  enabled: z.boolean(),
  scanIntervalMs: z.number(),
  catchUpWindowMinutes: z.number(),
  maxEventsPerMessage: z.number(),
  rules: z.array(countdownNotifyRuleSchema),
});

const storedSettingsObjectSchema = z.record(z.string(), z.unknown());

async function safeReadCountdownNotifySettings(): Promise<CountdownNotifySettings | null> {
  getPlugin();
  let raw: Record<string, unknown> | null;
  try {
    raw = await readJSON(COUNTDOWN_NOTIFY_SETTINGS_KEY, storedSettingsObjectSchema);
  } catch (error) {
    throw new Error(`纪念日通知设置读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === null) return null;
  try {
    return countdownNotifySettingsSchema.parse(normalizeCountdownNotifySettings(raw));
  } catch (error) {
    throw new Error(`纪念日通知设置格式校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadCountdownNotifySettings(): Promise<CountdownNotifySettings> {
  const raw = await safeReadCountdownNotifySettings();
  if (raw === null) return normalizeCountdownNotifySettings(null);
  return normalizeCountdownNotifySettings(raw);
}

function validateSavedCountdownNotifySettings(settings: CountdownNotifySettings, original: CountdownNotifySettings): void {
  if (settings.version !== 3) throw new Error("纪念日通知设置保存后版本校验失败。");
  if (settings.enabled !== original.enabled) throw new Error("纪念日通知总开关保存后校验失败。");
  if (settings.scanIntervalMs !== original.scanIntervalMs) throw new Error("纪念日通知扫描间隔保存后校验失败。");
  if (settings.catchUpWindowMinutes !== original.catchUpWindowMinutes) throw new Error("纪念日通知补发窗口保存后校验失败。");
  if (settings.maxEventsPerMessage !== original.maxEventsPerMessage) throw new Error("纪念日通知消息数量上限保存后校验失败。");
  if (settings.rules.length !== original.rules.length) throw new Error("纪念日通知规则数量保存后校验失败。");
  for (let index = 0; index < original.rules.length; index += 1) {
    const expected = original.rules[index];
    const actual = settings.rules[index];
    if (!actual || actual.id !== expected.id || actual.type !== expected.type || actual.enabled !== expected.enabled || actual.title !== expected.title || actual.time !== expected.time) {
      throw new Error(`纪念日通知规则 ${expected.id} 基础字段保存后校验失败。`);
    }
    if (JSON.stringify(actual.deliveryTargets) !== JSON.stringify(expected.deliveryTargets)) throw new Error(`纪念日通知规则 ${expected.id} 投递目标保存后校验失败。`);
    if (JSON.stringify(actual.advanceDays) !== JSON.stringify(expected.advanceDays) || actual.upcomingDays !== expected.upcomingDays) throw new Error(`纪念日通知规则 ${expected.id} 专属字段保存后校验失败。`);
  }
}

async function saveCountdownNotifySettingsChecked(settings: CountdownNotifySettings): Promise<CountdownNotifySettings> {
  const normalized = normalizeCountdownNotifySettings(settings);
  let validated: CountdownNotifySettings;
  try {
    validated = countdownNotifySettingsSchema.parse(normalized);
  } catch (error) {
    throw new Error(`纪念日通知设置保存前校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
  getPlugin();
  await writeJSON(COUNTDOWN_NOTIFY_SETTINGS_KEY, validated, countdownNotifySettingsSchema);
  const saved = await safeReadCountdownNotifySettings();
  if (saved === null) throw new Error("纪念日通知设置保存后读取为空。");
  const verified = normalizeCountdownNotifySettings(saved);
  validateSavedCountdownNotifySettings(verified, normalized);
  window.dispatchEvent(new CustomEvent(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, {
    detail: {
      version: verified.version,
      enabled: verified.enabled,
      ruleCount: verified.rules.length,
    },
  }));
  broadcastNotificationCenterEvent(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, { version: verified.version });
  return verified;
}

export function saveCountdownNotifySettings(settings: CountdownNotifySettings): Promise<CountdownNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  return saveCountdownNotifySettingsChecked(settings);
}

export function saveCountdownNotifySettingsForMigration(settings: CountdownNotifySettings): Promise<CountdownNotifySettings> {
  return saveCountdownNotifySettingsChecked(settings);
}
