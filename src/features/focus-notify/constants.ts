import type { FocusNotifySettings } from "./types";

export const FOCUS_NOTIFY_SETTINGS_KEY = "focusNotifySettings.json";
export const FOCUS_NOTIFY_SETTINGS_CHANGED_EVENT = "focus-notify-settings-changed";

export const DEFAULT_FOCUS_NOTIFY_SETTINGS: FocusNotifySettings = {
  version: 1,
  enabled: true,
  rules: [
    {
      id: "focus-completed",
      type: "focus_completed",
      enabled: true,
      title: "专注时间结束",
      deliveryTargets: [{ kind: "desktop" }],
    },
    {
      id: "break-completed",
      type: "break_completed",
      enabled: true,
      title: "休息时间结束",
      deliveryTargets: [{ kind: "desktop" }],
    },
  ],
};
