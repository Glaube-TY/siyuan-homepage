import type { ReviewNotifySettings } from "./types";

export const REVIEW_NOTIFY_SETTINGS_KEY = "reviewNotifySettings.json";
export const REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT = "review-notify-settings-changed";

export const DEFAULT_REVIEW_NOTIFY_SETTINGS: ReviewNotifySettings = {
  version: 1,
  enabled: false,
  scanIntervalMs: 60000,
  catchUpWindowMinutes: 30,
  maxItemsPerMessage: 20,
  includePath: true,
  includeNote: true,
  includeSiyuanLink: true,
  rules: [],
};
