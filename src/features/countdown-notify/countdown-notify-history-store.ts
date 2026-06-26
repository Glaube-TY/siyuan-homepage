import { COUNTDOWN_NOTIFY_HISTORY_KEY } from "./constants";
import type { CountdownNotifyHistory } from "./types";

let pluginInstance: any = null;

export function setCountdownNotifyHistoryPlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Countdown Notify History 尚未初始化。");
  }
  return pluginInstance;
}

function normalizeHistory(raw: unknown): CountdownNotifyHistory {
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

export async function loadCountdownNotifyHistory(): Promise<CountdownNotifyHistory> {
  try {
    return normalizeHistory(await getPlugin().loadData(COUNTDOWN_NOTIFY_HISTORY_KEY));
  } catch {
    return normalizeHistory(null);
  }
}

export async function hasCountdownNotifySent(key: string): Promise<boolean> {
  const history = await loadCountdownNotifyHistory();
  return Boolean(history.sentKeys[key]);
}

export async function markCountdownNotifySent(key: string, sentAt = new Date().toISOString()): Promise<void> {
  const history = await loadCountdownNotifyHistory();
  history.sentKeys[key] = sentAt;
  const keys = Object.entries(history.sentKeys).slice(-5000);
  await getPlugin().saveData(COUNTDOWN_NOTIFY_HISTORY_KEY, {
    version: 1,
    sentKeys: Object.fromEntries(keys),
  } satisfies CountdownNotifyHistory);
}
