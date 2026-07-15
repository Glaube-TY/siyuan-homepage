import { loadReviewIndexItemsChecked } from "@/components/tools/siyuanComponentDataApi";
import type { MobileNotificationPlanProvider, MobileNotificationPlanRequest, NotificationEvent } from "@/features/notification-center/types";
import { getReviewItemsForRule, scheduledAtForReviewRule, toLocalDateString } from "./review-notify-rules";
import { renderReviewDigestContent, renderReviewItemContent } from "./review-notify-render";
import { loadReviewNotifySettings } from "./review-notify-settings-store";

export async function buildReviewMobileNotificationPlans(context: Parameters<MobileNotificationPlanProvider["buildPlans"]>[0]): Promise<MobileNotificationPlanRequest[]> {
  const settings = await loadReviewNotifySettings();
  if (!settings.enabled) return [];
  const rules = settings.rules.filter((rule) =>
    rule.enabled
    && rule.type !== "overdue_digest"
    && rule.deliveryTargets.some((target) => target.kind === "mobile")
  );
  if (rules.length === 0) return [];
  const items = await loadReviewIndexItemsChecked();
  const plans: MobileNotificationPlanRequest[] = [];
  const firstDate = new Date(context.now.getFullYear(), context.now.getMonth(), context.now.getDate());

  for (let offset = 0; offset <= context.planningHorizonDays; offset += 1) {
    const date = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() + offset);
    const scheduledDate = toLocalDateString(date);
    for (const rule of rules) {
      const scheduledAt = scheduledAtForReviewRule(rule, date);
      if (scheduledAt <= context.now || scheduledAt > context.horizonEnd) continue;
      const matches = getReviewItemsForRule(rule, items, scheduledDate);
      if (matches.length === 0) continue;
      const expiresAt = new Date(scheduledAt.getTime() + settings.catchUpWindowMinutes * 60000).toISOString();
      const add = (event: NotificationEvent): void => {
        plans.push({ planKey: `mobile:${event.occurrenceKey}`, source: "review", ruleId: rule.id, scheduledAt: scheduledAt.toISOString(), event });
      };

      if (rule.type === "item_due_reminder") {
        for (const item of matches) {
          const occurrenceKey = `review:item:${rule.id}:${item.id}:${item.attrs.nextDate}`;
          add({
            type: rule.type,
            source: "review",
            sourceId: item.id,
            title: rule.title || "复习到期提醒",
            content: renderReviewItemContent(item, settings),
            level: "warning",
            scheduledAt: scheduledAt.toISOString(),
            expiresAt,
            occurrenceKey,
            url: settings.includeSiyuanLink ? `siyuan://blocks/${item.id}` : undefined,
            extra: { type: rule.type, itemId: item.id, nextDate: item.attrs.nextDate },
          });
        }
        continue;
      }

      const prefix = rule.type === "today_digest" ? "today" : "tomorrow";
      const occurrenceKey = `review:${prefix}:${rule.id}:${scheduledDate}`;
      add({
        type: rule.type,
        source: "review",
        sourceId: rule.id,
        title: rule.title,
        content: renderReviewDigestContent(matches, settings, scheduledDate),
        level: "info",
        scheduledAt: scheduledAt.toISOString(),
        expiresAt,
        occurrenceKey,
        extra: { type: rule.type, count: matches.length, scheduledDate },
      });
    }
  }
  return plans;
}

export const reviewMobileNotificationPlanProvider: MobileNotificationPlanProvider = {
  id: "review-notify",
  source: "review",
  buildPlans: buildReviewMobileNotificationPlans,
};
