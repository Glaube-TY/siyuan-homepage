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

function normalizeChannelIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : undefined;
}

function normalizeRuleType(value: unknown): EnhancedDiaryNotifyRuleType | null {
  if (
    value === "today_diary_missing" ||
    value === "yesterday_review_missing" ||
    value === "unmigrated_tasks_digest" ||
    value === "weekly_review_reminder"
  ) return value;
  return null;
}

function normalizeRule(raw: unknown): EnhancedDiaryNotifyRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const type = normalizeRuleType(value.type);
  if (!type) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  if (!id) return null;
  const weekday = typeof value.weekday === "number" ? Math.max(1, Math.min(7, Math.round(value.weekday))) : undefined;
  return {
    id,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    type,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "强化日记通知",
    time: normalizeTime(value.time) ?? undefined,
    weekday,
    channelIds: normalizeChannelIds(value.channelIds),
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
    // Singleton dedup: only keep the first valid singleton per type
    if (rule.type === "today_diary_missing" || rule.type === "yesterday_review_missing") {
      if (seenSingletonTypes.has(rule.type)) continue;
      seenSingletonTypes.add(rule.type);
    }
    normalizedRules.push(rule);
  }

  return {
    version: 1,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    scanIntervalMs: clampNumber(value.scanIntervalMs, 60000, 10000, 3600000),
    catchUpWindowMinutes: clampNumber(value.catchUpWindowMinutes, 30, 1, 1440),
    maxItemsPerMessage: clampNumber(value.maxItemsPerMessage, 20, 1, 100),
    includeSiyuanLink: typeof value.includeSiyuanLink === "boolean" ? value.includeSiyuanLink : true,
    rules: normalizedRules,
  };
}

export async function loadEnhancedDiaryNotifySettings(): Promise<EnhancedDiaryNotifySettings> {
  try {
    return normalizeEnhancedDiaryNotifySettings(await getPlugin().loadData(ENHANCED_DIARY_NOTIFY_SETTINGS_KEY));
  } catch {
    return normalizeEnhancedDiaryNotifySettings(null);
  }
}

export async function saveEnhancedDiaryNotifySettings(settings: EnhancedDiaryNotifySettings): Promise<EnhancedDiaryNotifySettings> {
  const normalized = normalizeEnhancedDiaryNotifySettings(settings);
  await getPlugin().saveData(ENHANCED_DIARY_NOTIFY_SETTINGS_KEY, normalized);
  window.dispatchEvent(new CustomEvent(ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, {
    detail: {
      version: normalized.version,
      enabled: normalized.enabled,
      ruleCount: normalized.rules.length,
    },
  }));
  return normalized;
}
