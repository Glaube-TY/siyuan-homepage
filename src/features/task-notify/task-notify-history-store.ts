import { TASK_NOTIFY_HISTORY_KEY } from "./constants";
import type { TaskNotifyHistory } from "./types";

let pluginInstance: any = null;

export function setTaskNotifyHistoryPlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Task Notify History 尚未初始化。");
  }
  return pluginInstance;
}

function normalizeHistory(raw: unknown): TaskNotifyHistory {
  const sentKeys: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    const rawKeys = value.sentKeys;
    if (rawKeys && typeof rawKeys === "object" && !Array.isArray(rawKeys)) {
      for (const [key, time] of Object.entries(rawKeys as Record<string, unknown>)) {
        if (typeof key === "string" && typeof time === "string") sentKeys[key] = time;
      }
    }
  }
  return { version: 1, sentKeys };
}

export async function loadTaskNotifyHistory(): Promise<TaskNotifyHistory> {
  try {
    return normalizeHistory(await getPlugin().loadData(TASK_NOTIFY_HISTORY_KEY));
  } catch {
    return normalizeHistory(null);
  }
}

export async function hasTaskNotifySent(key: string): Promise<boolean> {
  const history = await loadTaskNotifyHistory();
  return Boolean(history.sentKeys[key]);
}

export async function markTaskNotifySent(key: string, sentAt = new Date().toISOString()): Promise<void> {
  const history = await loadTaskNotifyHistory();
  history.sentKeys[key] = sentAt;
  const keys = Object.entries(history.sentKeys).slice(-5000);
  await getPlugin().saveData(TASK_NOTIFY_HISTORY_KEY, {
    version: 1,
    sentKeys: Object.fromEntries(keys),
  } satisfies TaskNotifyHistory);
}
