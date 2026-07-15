import type { CountdownNotifySettings } from "./types";

export const COUNTDOWN_NOTIFY_SETTINGS_KEY = "countdownNotifySettings.json";
export const COUNTDOWN_NOTIFY_HISTORY_KEY = "countdownNotifyHistory.json";
export const COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT = "countdown-notify-settings-changed";

export const DEFAULT_COUNTDOWN_NOTIFY_SETTINGS: CountdownNotifySettings = {
  version: 3,
  enabled: false,
  scanIntervalMs: 60000,
  catchUpWindowMinutes: 30,
  maxEventsPerMessage: 20,
  rules: [],
};
