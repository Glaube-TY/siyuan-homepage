import { createLegacyNotificationScheduler } from "@/features/agent-platform/automation/legacy-notification-scheduler";
import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadCountdownNotifySettings } from "./countdown-notify-settings-store";
import { runCountdownNotifyScan } from "./countdown-notify-service";

const scheduler = createLegacyNotificationScheduler({
  id: "legacy-countdown-notify",
  signals: ["homepage-advanced-ready", "homepage-advanced-unavailable", NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT],
  load: loadCountdownNotifySettings,
  async resolve(settings) {
    const ruleTargets = settings.rules.filter((rule) => rule.enabled).flatMap((rule) => rule.deliveryTargets);
    const overrideTargets = settings.eventOverrides
      .filter((item) => item.mode === "custom" && (item.remindOnDay || item.advanceDays.some((day) => day > 0)))
      .flatMap((item) => item.deliveryTargets);
    const targets = [...ruleTargets, ...overrideTargets];
    return { enabled: isNotificationCenterFeatureAvailable() && settings.enabled && targets.length > 0 && await hasResolvableTargetsForCurrentRuntime(targets), intervalMs: settings.scanIntervalMs };
  },
  scan: runCountdownNotifyScan,
});

export const startCountdownNotifyScheduler = scheduler.start;
export const stopCountdownNotifyScheduler = scheduler.stop;
export const destroyCountdownNotifyScheduler = scheduler.destroy;
