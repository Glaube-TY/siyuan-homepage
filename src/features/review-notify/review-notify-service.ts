import { loadReviewIndexItemsChecked } from "@/components/tools/siyuanComponentDataApi";
import { notificationCenter } from "@/features/notification-center";
import { getDueReviewRuleSchedule, getReviewItemsForRule, toLocalDateString } from "./review-notify-rules";
import { renderReviewDigestContent, renderReviewItemContent } from "./review-notify-render";
import type { ReviewNotifySettings } from "./types";

export async function runReviewNotifyScan(settings: ReviewNotifySettings, now = new Date()): Promise<void> {
  if (!settings.enabled) return;
  const dueRules = settings.rules
    .filter((rule) => rule.enabled && rule.deliveryTargets.length > 0)
    .map((rule) => ({ rule, scheduledAt: getDueReviewRuleSchedule(rule, now, settings.catchUpWindowMinutes) }))
    .filter((entry): entry is { rule: typeof entry.rule; scheduledAt: Date } => entry.scheduledAt !== null);
  if (dueRules.length === 0) return;

  const items = await loadReviewIndexItemsChecked();
  if (items.length === 0) return;

  for (const { rule, scheduledAt } of dueRules) {
    const scheduledDate = toLocalDateString(scheduledAt);
    const matches = getReviewItemsForRule(rule, items, scheduledDate);
    if (matches.length === 0) continue;
    const expiresAt = new Date(scheduledAt.getTime() + settings.catchUpWindowMinutes * 60000).toISOString();

    if (rule.type === "item_due_reminder") {
      for (const item of matches) {
        const occurrenceKey = `review:item:${rule.id}:${item.id}:${item.attrs.nextDate}`;
        await notificationCenter.notify({
          type: "item_due_reminder",
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
        }, { targets: rule.deliveryTargets, reason: "review-item-due" });
      }
      continue;
    }

    const occurrencePrefix = rule.type === "today_digest"
      ? "today"
      : rule.type === "overdue_digest"
        ? "overdue"
        : "tomorrow";
    const occurrenceKey = `review:${occurrencePrefix}:${rule.id}:${scheduledDate}`;
    await notificationCenter.notify({
      type: rule.type,
      source: "review",
      sourceId: rule.id,
      title: rule.title,
      content: renderReviewDigestContent(matches, settings, scheduledDate, rule.type === "overdue_digest"),
      level: rule.type === "overdue_digest" ? "warning" : "info",
      scheduledAt: scheduledAt.toISOString(),
      expiresAt,
      occurrenceKey,
      extra: { type: rule.type, count: matches.length, scheduledDate },
    }, { targets: rule.deliveryTargets, reason: "review-digest" });
  }
}
