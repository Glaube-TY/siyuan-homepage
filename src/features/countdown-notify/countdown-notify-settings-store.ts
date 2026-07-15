import { z } from "zod";
import { COUNTDOWN_EVENT_KINDS } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
import { normalizeNotificationDeliveryTargets } from "@/features/notification-center/notification-center-target-resolver";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
import { broadcastNotificationCenterEvent } from "@/features/notification-center/notification-center-events";
import {
  readJSON,
  writeJSON,
} from "@/features/notification-center/notification-center-storage";
import { assertNotificationCenterFeatureAvailable } from "@/features/notification-center/notification-center-plugin";
import {
  notificationLockName,
  withNotificationLock,
} from "@/features/notification-center/notification-center-locks";
import {
  DEFAULT_COUNTDOWN_NOTIFY_SETTINGS,
  COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT,
  COUNTDOWN_NOTIFY_SETTINGS_KEY,
} from "./constants";
import type {
  CountdownEventNotifyOverride,
  CountdownNotifyRule,
  CountdownNotifyRuleScope,
  CountdownNotifyRuleType,
  CountdownNotifySettings,
} from "./types";

const COUNTDOWN_NOTIFY_SETTINGS_LOCK = notificationLockName(
  "settings",
  COUNTDOWN_NOTIFY_SETTINGS_KEY,
);

let pluginInstance: any = null;
export function setCountdownNotifyPlugin(plugin: any): void {
  pluginInstance = plugin;
}
function getPlugin(): any {
  if (!pluginInstance) throw new Error("Countdown Notify 尚未初始化。");
  return pluginInstance;
}
function clamp(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.round(number)))
    : fallback;
}
function time(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : fallback;
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]
    : [];
}
function migrateChannelIds(
  value: unknown,
): NotificationDeliveryTarget[] | undefined {
  const ids = strings(value);
  return ids.length
    ? ids.map((channelId) => ({ kind: "external", channelId }))
    : Array.isArray(value)
      ? [{ kind: "external-default" }]
      : undefined;
}
function targets(
  value: unknown,
  channelIds?: unknown,
): NotificationDeliveryTarget[] {
  return Array.isArray(value)
    ? normalizeNotificationDeliveryTargets(value)
    : (migrateChannelIds(channelIds) ?? [{ kind: "external-default" }]);
}
function scope(value: unknown): CountdownNotifyRuleScope {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const kinds = new Set(COUNTDOWN_EVENT_KINDS);
  return {
    categoryIds: strings(raw.categoryIds),
    tags: strings(raw.tags),
    kinds: strings(raw.kinds).filter(
      (kind): kind is CountdownNotifyRuleScope["kinds"][number] =>
        kinds.has(kind as never),
    ),
    priorities: strings(raw.priorities).filter(
      (item): item is CountdownNotifyRuleScope["priorities"][number] =>
        item === "high" || item === "normal" || item === "low",
    ),
    eventIds: strings(raw.eventIds),
  };
}
function ruleType(value: unknown): CountdownNotifyRuleType | null {
  return value === "today_events" ||
    value === "advance_events" ||
    value === "upcoming_digest"
    ? value
    : null;
}
function normalizeRule(raw: unknown): CountdownNotifyRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const type = ruleType(value.type);
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!type || !id) return null;
  return {
    id,
    enabled: value.enabled === true,
    type,
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : "纪念日提醒",
    time: time(value.time),
    advanceDays: Array.isArray(value.advanceDays)
      ? [
          ...new Set(
            value.advanceDays
              .map(Number)
              .filter((day) => Number.isInteger(day) && day >= 0 && day <= 365),
          ),
        ].sort((a, b) => a - b)
      : undefined,
    upcomingDays:
      value.upcomingDays == null
        ? undefined
        : clamp(value.upcomingDays, 7, 1, 365),
    deliveryTargets: targets(value.deliveryTargets, value.channelIds),
    scope: scope(value.scope),
  };
}
function normalizeOverride(raw: unknown): CountdownEventNotifyOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const eventId = typeof value.eventId === "string" ? value.eventId.trim() : "";
  if (!eventId) return null;
  const mode =
    value.mode === "mute" || value.mode === "custom" ? value.mode : "inherit";
  return {
    eventId,
    mode,
    remindOnDay: value.remindOnDay !== false,
    advanceDays: Array.isArray(value.advanceDays)
      ? [
          ...new Set(
            value.advanceDays
              .map(Number)
              .filter((day) => Number.isInteger(day) && day >= 0 && day <= 365),
          ),
        ].sort((a, b) => a - b)
      : [],
    time: time(value.time, "08:00")!,
    deliveryTargets: targets(value.deliveryTargets),
    includeInDigest: value.includeInDigest !== false,
  };
}

export function normalizeCountdownNotifySettings(
  raw: unknown,
): CountdownNotifySettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return structuredClone(DEFAULT_COUNTDOWN_NOTIFY_SETTINGS);
  const value = raw as Record<string, unknown>;
  const rules: CountdownNotifyRule[] = [];
  const singletons = new Set<string>();
  for (const item of Array.isArray(value.rules) ? value.rules : []) {
    const normalized = normalizeRule(item);
    if (!normalized) continue;
    if (normalized.type === "today_events" && singletons.has(normalized.type))
      continue;
    singletons.add(normalized.type);
    rules.push(normalized);
  }
  const overrides: CountdownEventNotifyOverride[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(value.eventOverrides)
    ? value.eventOverrides
    : []) {
    const normalized = normalizeOverride(item);
    if (normalized && !seen.has(normalized.eventId)) {
      seen.add(normalized.eventId);
      overrides.push(normalized);
    }
  }
  return {
    version: 4,
    enabled: value.enabled === true,
    scanIntervalMs: clamp(value.scanIntervalMs, 60000, 10000, 3600000),
    catchUpWindowMinutes: clamp(value.catchUpWindowMinutes, 30, 1, 1440),
    maxEventsPerMessage: clamp(value.maxEventsPerMessage, 20, 1, 100),
    rules,
    eventOverrides: overrides,
  };
}

const targetSchema: z.ZodSchema<NotificationDeliveryTarget> = z.union([
  z.object({ kind: z.literal("desktop") }),
  z.object({ kind: z.literal("mobile") }),
  z.object({ kind: z.literal("external-default") }),
  z.object({ kind: z.literal("external"), channelId: z.string() }),
]);
const scopeSchema = z.object({
  categoryIds: z.array(z.string()),
  tags: z.array(z.string()),
  kinds: z.array(
    z.enum(
      COUNTDOWN_EVENT_KINDS as [
        (typeof COUNTDOWN_EVENT_KINDS)[number],
        ...(typeof COUNTDOWN_EVENT_KINDS)[number][],
      ],
    ),
  ),
  priorities: z.array(z.enum(["high", "normal", "low"])),
  eventIds: z.array(z.string()),
});
const ruleSchema: z.ZodSchema<CountdownNotifyRule> = z.object({
  id: z.string(),
  enabled: z.boolean(),
  type: z.enum(["today_events", "advance_events", "upcoming_digest"]),
  title: z.string(),
  time: z.string().optional(),
  advanceDays: z.array(z.number()).optional(),
  upcomingDays: z.number().optional(),
  deliveryTargets: z.array(targetSchema),
  scope: scopeSchema,
});
const overrideSchema: z.ZodSchema<CountdownEventNotifyOverride> = z.object({
  eventId: z.string(),
  mode: z.enum(["inherit", "mute", "custom"]),
  remindOnDay: z.boolean(),
  advanceDays: z.array(z.number()),
  time: z.string(),
  deliveryTargets: z.array(targetSchema),
  includeInDigest: z.boolean(),
});
const settingsSchema: z.ZodSchema<CountdownNotifySettings> = z.object({
  version: z.literal(4),
  enabled: z.boolean(),
  scanIntervalMs: z.number(),
  catchUpWindowMinutes: z.number(),
  maxEventsPerMessage: z.number(),
  rules: z.array(ruleSchema),
  eventOverrides: z.array(overrideSchema),
});
const objectSchema = z.record(z.string(), z.unknown());
function assertRuleIntegrity(settings: CountdownNotifySettings): void {
  const ids = new Set<string>();
  let todayCount = 0;
  for (const rule of settings.rules) {
    if (ids.has(rule.id)) throw new Error(`通知规则 ID 重复：${rule.id}`);
    ids.add(rule.id);
    if (rule.type === "today_events") todayCount += 1;
  }
  if (todayCount > 1) throw new Error("今日事件规则只能存在一条");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function assertCompatibleNumber(
  value: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  required = false,
): void {
  const candidate = value[key];
  if (candidate === undefined) {
    if (required) throw new Error(`通知备份缺少字段 ${key}`);
    return;
  }
  const number = candidate;
  if (
    typeof number !== "number" ||
    !Number.isFinite(number) ||
    number < min ||
    number > max
  )
    throw new Error(`通知备份字段 ${key} 超出有效范围`);
}
function isCompatibleTime(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim())
  );
}
function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`${label} 必须是字符串数组`);
}
function assertAdvanceDays(value: unknown, label: string): void {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        typeof item !== "number" ||
        !Number.isInteger(item) ||
        item < 0 ||
        item > 365,
    )
  )
    throw new Error(`${label} 必须是 0 至 365 的整数数组`);
}
function assertDeliveryTargets(value: unknown, label: string): void {
  const parsed = z.array(targetSchema).safeParse(value);
  if (
    !parsed.success ||
    parsed.data.some(
      (target) => target.kind === "external" && !target.channelId.trim(),
    )
  )
    throw new Error(`${label} 内容无效`);
}
export function parseCountdownNotifySettingsBackup(
  raw: unknown,
): CountdownNotifySettings {
  if (!isRecord(raw)) throw new Error("通知备份根结构无效");
  if (raw.version !== 3 && raw.version !== 4)
    throw new Error("通知备份 version 不受支持");
  const sourceVersion = raw.version;
  if (typeof raw.enabled !== "boolean")
    throw new Error("通知备份字段 enabled 必须是布尔值");
  assertCompatibleNumber(raw, "scanIntervalMs", 10000, 3600000, true);
  assertCompatibleNumber(raw, "catchUpWindowMinutes", 1, 1440, true);
  assertCompatibleNumber(raw, "maxEventsPerMessage", 1, 100, true);
  if (!Array.isArray(raw.rules)) throw new Error("通知备份 rules 必须是数组");
  if (
    (sourceVersion === 4 || raw.eventOverrides !== undefined) &&
    !Array.isArray(raw.eventOverrides)
  )
    throw new Error("通知备份 eventOverrides 必须是数组");
  const ruleIds = new Set<string>();
  let todayRuleCount = 0;
  raw.rules.forEach((item, index) => {
    if (!isRecord(item)) throw new Error(`通知备份第 ${index + 1} 条规则不是对象`);
    if (typeof item.id !== "string" || !item.id.trim())
      throw new Error(`通知备份第 ${index + 1} 条规则缺少有效 id`);
    const ruleId = item.id.trim();
    if (ruleIds.has(ruleId)) throw new Error(`通知规则 ID 重复：${ruleId}`);
    ruleIds.add(ruleId);
    if (
      item.type !== "today_events" &&
      item.type !== "advance_events" &&
      item.type !== "upcoming_digest"
    )
      throw new Error(`通知备份第 ${index + 1} 条规则 type 无效`);
    if (item.type === "today_events") todayRuleCount += 1;
    if (typeof item.enabled !== "boolean")
      throw new Error(`通知备份第 ${index + 1} 条规则 enabled 无效`);
    if (typeof item.title !== "string")
      throw new Error(`通知备份第 ${index + 1} 条规则 title 无效`);
    assertDeliveryTargets(
      item.deliveryTargets,
      `通知备份第 ${index + 1} 条规则 deliveryTargets`,
    );
    if (item.channelIds !== undefined)
      assertStringArray(
        item.channelIds,
        `通知备份第 ${index + 1} 条规则 channelIds`,
      );
    if (
      (sourceVersion === 4 || item.scope !== undefined) &&
      !isRecord(item.scope)
    )
      throw new Error(`通知备份第 ${index + 1} 条规则 scope 无效`);
    if (isRecord(item.scope))
      for (const key of [
        "categoryIds",
        "tags",
        "kinds",
        "priorities",
        "eventIds",
      ])
        if (sourceVersion === 4 || item.scope[key] !== undefined)
          assertStringArray(
            item.scope[key],
            `通知备份第 ${index + 1} 条规则 scope.${key}`,
          );
    if (
      isRecord(item.scope) &&
      Array.isArray(item.scope.kinds) &&
      item.scope.kinds.some(
        (kind) => !COUNTDOWN_EVENT_KINDS.includes(kind as never),
      )
    )
      throw new Error(`通知备份第 ${index + 1} 条规则 scope.kinds 内容无效`);
    if (
      isRecord(item.scope) &&
      Array.isArray(item.scope.priorities) &&
      item.scope.priorities.some(
        (priority) =>
          priority !== "high" && priority !== "normal" && priority !== "low",
      )
    )
      throw new Error(`通知备份第 ${index + 1} 条规则 scope.priorities 内容无效`);
    if (item.advanceDays !== undefined)
      assertAdvanceDays(
        item.advanceDays,
        `通知备份第 ${index + 1} 条规则 advanceDays`,
      );
    if (item.time !== undefined && !isCompatibleTime(item.time))
      throw new Error(`通知备份第 ${index + 1} 条规则 time 无效`);
    if (
      item.upcomingDays !== undefined &&
      (typeof item.upcomingDays !== "number" ||
        !Number.isFinite(item.upcomingDays) ||
        item.upcomingDays < 1 ||
        item.upcomingDays > 365)
    )
      throw new Error(`通知备份第 ${index + 1} 条规则 upcomingDays 无效`);
  });
  if (todayRuleCount > 1) throw new Error("今日事件规则只能存在一条");
  const rawOverrides = Array.isArray(raw.eventOverrides)
    ? raw.eventOverrides
    : [];
  const overrideIds = new Set<string>();
  rawOverrides.forEach((item, index) => {
    if (!isRecord(item))
      throw new Error(`通知备份第 ${index + 1} 条事件覆盖不是对象`);
    if (typeof item.eventId !== "string" || !item.eventId.trim())
      throw new Error(`通知备份第 ${index + 1} 条事件覆盖缺少 eventId`);
    const eventId = item.eventId.trim();
    if (overrideIds.has(eventId))
      throw new Error(`通知备份事件覆盖 eventId 重复：${eventId}`);
    overrideIds.add(eventId);
    if (item.mode !== "inherit" && item.mode !== "mute" && item.mode !== "custom")
      throw new Error(`通知备份第 ${index + 1} 条事件覆盖 mode 无效`);
    if (typeof item.remindOnDay !== "boolean")
      throw new Error(`通知备份第 ${index + 1} 条事件覆盖 remindOnDay 无效`);
    if (typeof item.includeInDigest !== "boolean")
      throw new Error(`通知备份第 ${index + 1} 条事件覆盖 includeInDigest 无效`);
    assertAdvanceDays(
      item.advanceDays,
      `通知备份第 ${index + 1} 条事件覆盖 advanceDays`,
    );
    assertDeliveryTargets(
      item.deliveryTargets,
      `通知备份第 ${index + 1} 条事件覆盖 deliveryTargets`,
    );
    if (!isCompatibleTime(item.time))
      throw new Error(`通知备份第 ${index + 1} 条事件覆盖 time 无效`);
  });
  const migrationInput = {
    ...raw,
    version: 4,
    rules: raw.rules.map((item) => ({
      ...(item as Record<string, unknown>),
      scope:
        (item as Record<string, unknown>).scope ?? {
          categoryIds: [],
          tags: [],
          kinds: [],
          priorities: [],
          eventIds: [],
        },
    })),
    eventOverrides: rawOverrides,
  };
  const normalized = settingsSchema.parse(
    normalizeCountdownNotifySettings(migrationInput),
  );
  if (
    normalized.rules.length !== raw.rules.length ||
    normalized.eventOverrides.length !== rawOverrides.length
  )
    throw new Error("通知备份包含重复或无法兼容的规则记录");
  assertRuleIntegrity(normalized);
  return normalized;
}
async function safeRead(): Promise<CountdownNotifySettings | null> {
  getPlugin();
  let raw: Record<string, unknown> | null;
  try {
    raw = await readJSON(COUNTDOWN_NOTIFY_SETTINGS_KEY, objectSchema);
  } catch (error) {
    throw new Error(
      `纪念日通知设置读取失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (raw === null) return null;
  try {
    const normalized = settingsSchema.parse(normalizeCountdownNotifySettings(raw));
    assertRuleIntegrity(normalized);
    return normalized;
  } catch (error) {
    throw new Error(
      `纪念日通知设置格式校验失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export async function loadCountdownNotifySettings(): Promise<CountdownNotifySettings> {
  return (
    (await safeRead()) ?? structuredClone(DEFAULT_COUNTDOWN_NOTIFY_SETTINGS)
  );
}
async function saveCheckedUnlocked(
  settings: CountdownNotifySettings,
): Promise<CountdownNotifySettings> {
  assertRuleIntegrity(settings);
  const normalized = settingsSchema.parse(
    normalizeCountdownNotifySettings(settings),
  );
  assertRuleIntegrity(normalized);
  getPlugin();
  await writeJSON(COUNTDOWN_NOTIFY_SETTINGS_KEY, normalized, settingsSchema);
  const saved = await safeRead();
  if (!saved || JSON.stringify(saved) !== JSON.stringify(normalized))
    throw new Error("纪念日通知设置保存后业务校验失败。");
  window.dispatchEvent(
    new CustomEvent(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, {
      detail: {
        version: 4,
        enabled: saved.enabled,
        ruleCount: saved.rules.length,
      },
    }),
  );
  broadcastNotificationCenterEvent(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, {
    version: 4,
  });
  return saved;
}
export async function saveCountdownNotifySettings(
  settings: CountdownNotifySettings,
): Promise<CountdownNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  return withNotificationLock(COUNTDOWN_NOTIFY_SETTINGS_LOCK, () =>
    saveCheckedUnlocked(settings),
  );
}
export async function saveCountdownNotifySettingsForMigration(
  settings: CountdownNotifySettings,
): Promise<CountdownNotifySettings> {
  return withNotificationLock(COUNTDOWN_NOTIFY_SETTINGS_LOCK, () =>
    saveCheckedUnlocked(settings),
  );
}
export async function saveCountdownEventNotifyOverride(
  eventId: string,
  override: Omit<CountdownEventNotifyOverride, "eventId">,
): Promise<CountdownNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  return withNotificationLock(COUNTDOWN_NOTIFY_SETTINGS_LOCK, async () => {
    const settings =
      (await safeRead()) ?? structuredClone(DEFAULT_COUNTDOWN_NOTIFY_SETTINGS);
    settings.eventOverrides = settings.eventOverrides
      .filter((item) => item.eventId !== eventId)
      .concat({ eventId, ...override });
    return saveCheckedUnlocked(settings);
  });
}
export async function deleteCountdownNotifyOverride(
  eventId: string,
): Promise<CountdownNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  return withNotificationLock(COUNTDOWN_NOTIFY_SETTINGS_LOCK, async () => {
    const settings = await safeRead();
    if (!settings) return structuredClone(DEFAULT_COUNTDOWN_NOTIFY_SETTINGS);
    if (!settings.eventOverrides.some((item) => item.eventId === eventId))
      return settings;
    settings.eventOverrides = settings.eventOverrides.filter(
      (item) => item.eventId !== eventId,
    );
    return saveCheckedUnlocked(settings);
  });
}
export async function deleteCountdownNotifyOverrideForCleanup(
  eventId: string,
): Promise<CountdownNotifySettings> {
  return withNotificationLock(COUNTDOWN_NOTIFY_SETTINGS_LOCK, async () => {
    const settings = await safeRead();
    if (!settings) return structuredClone(DEFAULT_COUNTDOWN_NOTIFY_SETTINGS);
    if (!settings.eventOverrides.some((item) => item.eventId === eventId))
      return settings;
    settings.eventOverrides = settings.eventOverrides.filter(
      (item) => item.eventId !== eventId,
    );
    return saveCheckedUnlocked(settings);
  });
}
