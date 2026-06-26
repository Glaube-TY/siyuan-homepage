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

function normalizeChannelIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : undefined;
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
    channelIds: normalizeChannelIds(value.channelIds),
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
    // Singleton dedup: only keep the first valid singleton per type
    if (rule.type !== "custom_filter_digest") {
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
    maxTasksPerMessage: clampNumber(value.maxTasksPerMessage, 20, 1, 100),
    includeSourcePath: typeof value.includeSourcePath === "boolean" ? value.includeSourcePath : true,
    includeSiyuanLink: typeof value.includeSiyuanLink === "boolean" ? value.includeSiyuanLink : true,
    rules: normalizedRules,
  };
}

export async function loadTaskNotifySettings(): Promise<TaskNotifySettings> {
  try {
    return normalizeTaskNotifySettings(await getPlugin().loadData(TASK_NOTIFY_SETTINGS_KEY));
  } catch {
    return normalizeTaskNotifySettings(null);
  }
}

export async function saveTaskNotifySettings(settings: TaskNotifySettings): Promise<TaskNotifySettings> {
  const normalized = normalizeTaskNotifySettings(settings);
  await getPlugin().saveData(TASK_NOTIFY_SETTINGS_KEY, normalized);
  window.dispatchEvent(new CustomEvent(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, {
    detail: {
      version: normalized.version,
      enabled: normalized.enabled,
      ruleCount: normalized.rules.length,
    },
  }));
  return normalized;
}
