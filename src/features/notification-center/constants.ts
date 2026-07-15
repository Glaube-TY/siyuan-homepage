import type { NotificationCenterSettings } from "./types";

export const NOTIFICATION_CENTER_SETTINGS_KEY = "notification-center/settings.json";
export const NOTIFICATION_CENTER_HISTORY_INDEX_KEY = "notification-center/history-index.json";
export const NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT = "notification-center-settings-changed";
export const NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT = "notification-center-history-changed";
export const NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT = "notification-center-mobile-plans-changed";
export const NOTIFICATION_CENTER_DEFAULT_TIMEOUT_MS = 10000;

export const DEFAULT_NOTIFICATION_CENTER_SETTINGS: NotificationCenterSettings = {
  version: 1,
  desktop: {
    enabled: false,
    timeoutMs: 7000,
    maxContentChars: 500,
    errorStyleForErrorLevel: true,
  },
  mobile: {
    enabled: false,
    timeoutType: "default",
    planningHorizonDays: 30,
  },
  external: {
    enabled: false,
    defaultChannelIds: [],
    channels: [],
    rateLimit: { enabled: true, minIntervalMs: 1000 },
    dedupe: { enabled: true, windowMs: 60000 },
  },
};

