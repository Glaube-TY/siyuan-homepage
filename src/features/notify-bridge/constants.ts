import type { NotifyBridgeSettings } from "./types";

export const NOTIFY_BRIDGE_SETTINGS_KEY = "notifyBridgeSettings.json";
export const NOTIFY_BRIDGE_DEFAULT_TIMEOUT_MS = 10000;
export const NOTIFY_BRIDGE_MIN_TIMEOUT_MS = 1000;
export const NOTIFY_BRIDGE_MAX_TIMEOUT_MS = 60000;

export const DEFAULT_NOTIFY_BRIDGE_SETTINGS: NotifyBridgeSettings = {
  version: 1,
  enabled: false,
  defaultChannelIds: [],
  channels: [],
  rateLimit: {
    enabled: true,
    minIntervalMs: 1000,
  },
  dedupe: {
    enabled: true,
    windowMs: 60000,
  },
};

export const NOTIFY_BRIDGE_TEST_EVENT = {
  title: "思源外联通知测试",
  content: "如果你看到这条消息，说明该通知渠道配置成功。",
  level: "info" as const,
  source: "manual" as const,
  dedupeKey: "notify-bridge:test-send",
};
