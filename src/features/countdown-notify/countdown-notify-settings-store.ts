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

function normalizeChannelIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : undefined;
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
    channelIds: normalizeChannelIds(value.channelIds),
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
    version: 1,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    databaseId: typeof value.databaseId === "string" ? value.databaseId.trim() : "",
    scanIntervalMs: clampNumber(value.scanIntervalMs, 60000, 10000, 3600000),
    catchUpWindowMinutes: clampNumber(value.catchUpWindowMinutes, 30, 1, 1440),
    maxEventsPerMessage: clampNumber(value.maxEventsPerMessage, 20, 1, 100),
    rules: normalizedRules,
  };
}

export async function loadCountdownNotifySettings(): Promise<CountdownNotifySettings> {
  try {
    return normalizeCountdownNotifySettings(await getPlugin().loadData(COUNTDOWN_NOTIFY_SETTINGS_KEY));
  } catch {
    return normalizeCountdownNotifySettings(null);
  }
}

export async function saveCountdownNotifySettings(settings: CountdownNotifySettings): Promise<CountdownNotifySettings> {
  const normalized = normalizeCountdownNotifySettings(settings);
  await getPlugin().saveData(COUNTDOWN_NOTIFY_SETTINGS_KEY, normalized);
  window.dispatchEvent(new CustomEvent(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, {
    detail: {
      version: normalized.version,
      enabled: normalized.enabled,
      ruleCount: normalized.rules.length,
    },
  }));
  return normalized;
}

export async function resolveEffectiveCountdownDatabaseId(
  settings?: CountdownNotifySettings,
): Promise<{
  databaseId: string;
  source: "manual" | "existing-widget" | "none";
  sourceWidgetId?: string;
  message: string;
}> {
  if (settings?.databaseId) {
    return {
      databaseId: settings.databaseId,
      source: "manual",
      message: "当前使用手动指定数据库 ID。",
    };
  }
  if (!pluginInstance) {
    return { databaseId: "", source: "none", message: "Countdown Notify 尚未初始化。" };
  }
  try {
    const { resolveDatabaseIdFromExistingWidgets } = await import(
      "@/components/utils/widgetBlock/widget/sharedDatabaseId"
    );
    const result = await resolveDatabaseIdFromExistingWidgets(pluginInstance, "countdown");
    if (result.databaseId) {
      return {
        databaseId: result.databaseId,
        source: "existing-widget",
        sourceWidgetId: result.sourceWidgetId,
        message: "已从已有倒数日组件检测到数据库。",
      };
    }
    return {
      databaseId: "",
      source: "none",
      message: "未检测到已有倒数日组件，请先添加倒数日组件或手动指定数据库 ID。",
    };
  } catch {
    return {
      databaseId: "",
      source: "none",
      message: "自动检测倒数日数据库失败，请手动指定数据库 ID。",
    };
  }
}
