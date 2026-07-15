import { notificationCenter } from "@/features/notification-center";
import { loadCountdownEvents } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { formatLocalDate, getAdvanceEvents, getTodayEvents, getUpcomingEvents, shouldRunDailyRuleAt } from "./countdown-notify-rules";
import { renderAdvanceEventContent, renderTodayEventContent, renderUpcomingDigestContent } from "./countdown-notify-render";
import type { CountdownNotifySettings } from "./types";

export async function runCountdownNotifyScan(settings: CountdownNotifySettings, now = new Date()): Promise<void> {
  const enabledRules = settings.rules.filter((r) => r.enabled);
  if (!settings.enabled || enabledRules.length === 0) return;

  const { events } = await loadCountdownEvents();
  if (events.length === 0) return;

  const today = formatLocalDate(now);

  for (const rule of enabledRules) {
    const scheduled = shouldRunDailyRuleAt(rule, now, settings.catchUpWindowMinutes);
    if (!scheduled) continue;
    const [hour, minute] = (rule.time ?? "00:00").split(":").map(Number);
    const scheduledAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    const expiresAt = new Date(scheduledAt.getTime() + settings.catchUpWindowMinutes * 60000).toISOString();

    if (rule.type === "today_events") {
      const todayEvents = getTodayEvents(events, now);
      for (const event of todayEvents) {
        const dedupeKey = `countdown:today:${rule.id}:${event.id}:${today}`;
        await notificationCenter.notify({
          type: "today_events",
          title: rule.title || "纪念日提醒",
          content: renderTodayEventContent(event),
          level: "info",
          source: "countdown",
          sourceId: event.id,
          occurrenceKey: dedupeKey,
          scheduledAt: scheduledAt.toISOString(),
          expiresAt,
          extra: {
            type: "today_events",
            eventId: event.id,
            eventName: event.name,
            targetDate: event.date,
            anniversary: event.anniversary,
          },
        }, {
          targets: rule.deliveryTargets,
          reason: "countdown-notify",
        });
      }
      continue;
    }

    if (rule.type === "advance_events") {
      const advanceDays = rule.advanceDays ?? [];
      if (advanceDays.length === 0) continue;
      const matches = getAdvanceEvents(events, advanceDays, now);
      for (const match of matches) {
        const dedupeKey = `countdown:advance:${rule.id}:${match.event.id}:${today}:${match.daysLeft}`;
        await notificationCenter.notify({
          type: "advance_events",
          title: rule.title || "提前提醒",
          content: renderAdvanceEventContent(match),
          level: "info",
          source: "countdown",
          sourceId: match.event.id,
          occurrenceKey: dedupeKey,
          scheduledAt: scheduledAt.toISOString(),
          expiresAt,
          extra: {
            type: "advance_events",
            eventId: match.event.id,
            eventName: match.event.name,
            targetDate: match.event.date,
            anniversary: match.event.anniversary,
            daysLeft: match.daysLeft,
          },
        }, {
          targets: rule.deliveryTargets,
          reason: "countdown-notify",
        });
      }
      continue;
    }

    if (rule.type === "upcoming_digest") {
      const upcomingDays = rule.upcomingDays ?? 7;
      const matches = getUpcomingEvents(events, upcomingDays, now);
      if (matches.length === 0) continue;
      const dedupeKey = `countdown:digest:${rule.id}:${today}`;
      await notificationCenter.notify({
        type: "upcoming_digest",
        title: rule.title || `未来 ${upcomingDays} 天纪念日摘要`,
        content: renderUpcomingDigestContent(matches, settings.maxEventsPerMessage),
        level: "info",
        source: "countdown",
        sourceId: rule.id,
        occurrenceKey: dedupeKey,
        scheduledAt: scheduledAt.toISOString(),
        expiresAt,
        extra: {
          type: "upcoming_digest",
          count: matches.length,
          upcomingDays,
        },
      }, {
        targets: rule.deliveryTargets,
        reason: "countdown-notify",
      });
    }
  }
}
