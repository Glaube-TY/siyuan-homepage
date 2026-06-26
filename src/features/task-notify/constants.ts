import type { TaskNotifySettings } from "./types";

export const TASK_NOTIFY_SETTINGS_KEY = "taskNotifySettings.json";
export const TASK_NOTIFY_HISTORY_KEY = "taskNotifyHistory.json";
export const TASK_NOTIFY_SETTINGS_CHANGED_EVENT = "task-notify-settings-changed";

export const DEFAULT_TASK_NOTIFY_SETTINGS: TaskNotifySettings = {
  version: 1,
  enabled: false,
  scanIntervalMs: 60000,
  catchUpWindowMinutes: 30,
  maxTasksPerMessage: 20,
  includeSourcePath: true,
  includeSiyuanLink: true,
  rules: [],
};
