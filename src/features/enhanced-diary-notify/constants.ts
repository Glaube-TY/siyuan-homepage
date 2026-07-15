import type { EnhancedDiaryNotifySettings } from "./types";

export const ENHANCED_DIARY_NOTIFY_SETTINGS_KEY = "enhancedDiaryNotifySettings.json";
export const ENHANCED_DIARY_NOTIFY_HISTORY_KEY = "enhancedDiaryNotifyHistory.json";
export const ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT = "enhanced-diary-notify-settings-changed";

export const DEFAULT_ENHANCED_DIARY_NOTIFY_SETTINGS: EnhancedDiaryNotifySettings = {
  version: 3,
  enabled: false,
  scanIntervalMs: 60000,
  catchUpWindowMinutes: 30,
  maxItemsPerMessage: 20,
  includeSiyuanLink: true,
  includeProjectPath: true,
  rules: [],
};
