import { listScheduledBetween } from "@/features/background-runtime/background-schedule";
import { listNotificationRules } from "./notification-rule-store";
import type { MobileNotificationPlanProvider, MobileNotificationPlanRequest } from "./types";

export const notificationRuleMobilePlanProvider: MobileNotificationPlanProvider = {
  id: "notification-rules", source: "manual",
  async buildPlans(context): Promise<MobileNotificationPlanRequest[]> {
    const rules = (await listNotificationRules()).filter((rule) => rule.enabled && rule.targets.some((target) => target.kind === "mobile"));
    return rules.flatMap((rule) => listScheduledBetween(rule.trigger, context.now.getTime(), context.horizonEnd.getTime()).map((scheduledAt) => ({
      planKey: `mobile:${rule.ruleId}:${scheduledAt}`, source: "manual", ruleId: rule.ruleId, scheduledAt: new Date(scheduledAt).toISOString(),
      event: { source: "manual", sourceId: rule.ruleId, type: "scheduled_notification", title: rule.title, content: rule.content, scheduledAt: new Date(scheduledAt).toISOString(), occurrenceKey: `${rule.ruleId}:${scheduledAt}` },
    })));
  },
};
