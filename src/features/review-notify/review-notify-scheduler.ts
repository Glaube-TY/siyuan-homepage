import { createNotificationScanScheduler } from "@/features/notification-center/notification-scan-scheduler";
import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { runReviewNotifyScan } from "./review-notify-service";
import { loadReviewNotifySettings } from "./review-notify-settings-store";

const scheduler = createNotificationScanScheduler({
  id: "legacy-review-notify",
  signals: ["homepage-advanced-ready", "homepage-advanced-unavailable", NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT],
  load: loadReviewNotifySettings,
  async resolve(settings) {
    const targets = settings.rules.filter((rule) => rule.enabled).flatMap((rule) => rule.deliveryTargets);
    return { enabled: isNotificationCenterFeatureAvailable() && settings.enabled && targets.length > 0 && await hasResolvableTargetsForCurrentRuntime(targets), intervalMs: settings.scanIntervalMs };
  },
  scan: runReviewNotifyScan,
});

export const startReviewNotifyScheduler = scheduler.start;
export const stopReviewNotifyScheduler = scheduler.stop;
export const destroyReviewNotifyScheduler = scheduler.destroy;
