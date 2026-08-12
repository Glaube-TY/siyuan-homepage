import { createNotificationScanScheduler } from "@/features/notification-center/notification-scan-scheduler";
import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { TASK_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadTaskNotifySettings } from "./task-notify-settings-store";
import { runTaskNotifyScan } from "./task-notify-service";

const scheduler = createNotificationScanScheduler({
  id: "legacy-task-notify",
  signals: ["homepage-advanced-ready", "homepage-advanced-unavailable", NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, TASK_NOTIFY_SETTINGS_CHANGED_EVENT],
  load: loadTaskNotifySettings,
  async resolve(settings) {
    const targets = settings.rules.filter((rule) => rule.enabled).flatMap((rule) => rule.deliveryTargets);
    return { enabled: isNotificationCenterFeatureAvailable() && settings.enabled && targets.length > 0 && await hasResolvableTargetsForCurrentRuntime(targets), intervalMs: settings.scanIntervalMs };
  },
  scan: runTaskNotifyScan,
});

export const startTaskNotifyScheduler = scheduler.start;
export const stopTaskNotifyScheduler = scheduler.stop;
export const destroyTaskNotifyScheduler = scheduler.destroy;
