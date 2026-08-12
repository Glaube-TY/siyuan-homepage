import { createLegacyNotificationScheduler } from "@/features/agent-platform/automation/legacy-notification-scheduler";
import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadEnhancedDiaryNotifySettings } from "./enhanced-diary-notify-settings-store";
import { runEnhancedDiaryNotifyScan } from "./enhanced-diary-notify-service";

const scheduler = createLegacyNotificationScheduler({
  id: "legacy-enhanced-diary-notify",
  signals: ["homepage-advanced-ready", "homepage-advanced-unavailable", NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT],
  load: loadEnhancedDiaryNotifySettings,
  async resolve(settings) {
    const targets = settings.rules.filter((rule) => rule.enabled).flatMap((rule) => rule.deliveryTargets);
    return { enabled: isNotificationCenterFeatureAvailable() && settings.enabled && targets.length > 0 && await hasResolvableTargetsForCurrentRuntime(targets), intervalMs: settings.scanIntervalMs };
  },
  scan: runEnhancedDiaryNotifyScan,
});

export const startEnhancedDiaryNotifyScheduler = scheduler.start;
export const stopEnhancedDiaryNotifyScheduler = scheduler.stop;
export const destroyEnhancedDiaryNotifyScheduler = scheduler.destroy;
