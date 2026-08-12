import { notify } from "./notification-center-service";
import { listNotificationRules } from "./notification-rule-store";
import { listScheduledBetween } from "@/features/background-runtime/background-schedule";
import { registerBackgroundScanTask } from "@/features/background-runtime/background-scheduler";
import { NOTIFICATION_RULES_CHANGED_EVENT } from "./constants";
import { isNotificationCenterFeatureAvailable } from "./notification-center-plugin";

let unregister: (() => void) | undefined;
let lastScanAt = Date.now() - 60_000;
async function scan(): Promise<void> {
  const now = Date.now();
  for (const rule of await listNotificationRules()) {
    if (!rule.enabled) continue;
    const occurrences = listScheduledBetween(rule.trigger, lastScanAt, now);
    const scheduledAt = occurrences[occurrences.length - 1];
    if (scheduledAt === undefined) continue;
    await notify({
      source: "manual", sourceId: rule.ruleId, type: "scheduled_notification", title: rule.title, content: rule.content,
      scheduledAt: new Date(scheduledAt).toISOString(), occurrenceKey: `${rule.ruleId}:${scheduledAt}`,
    }, { targets: rule.targets, reason: "通知中心计划" });
  }
  lastScanAt = now;
}

export function startNotificationRuleRuntime(): void {
  if (!unregister) {
    lastScanAt = Date.now() - 60_000;
    unregister = registerBackgroundScanTask({
      id: "notification-rules",
      signals: [NOTIFICATION_RULES_CHANGED_EVENT, "homepage-advanced-ready", "homepage-advanced-unavailable"],
      async resolve() { return { enabled: isNotificationCenterFeatureAvailable(), intervalMs: 15_000, run: scan }; },
    });
  }
}
export function destroyNotificationRuleRuntime(): void { unregister?.(); unregister = undefined; }
