import { notifyBridge } from "@/features/notify-bridge";
import { loadCountdownEvents } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { formatLocalDate, getAdvanceEvents, getTodayEvents, getUpcomingEvents, shouldRunDailyRuleAt } from "./countdown-notify-rules";
import { renderAdvanceEventContent, renderTodayEventContent, renderUpcomingDigestContent } from "./countdown-notify-render";
import { hasCountdownNotifySent, markCountdownNotifySent } from "./countdown-notify-history-store";
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

    if (rule.type === "today_events") {
      const todayEvents = getTodayEvents(events, now);
      for (const event of todayEvents) {
        const dedupeKey = `countdown:today:${rule.id}:${event.id}:${today}`;
        if (await hasCountdownNotifySent(dedupeKey)) continue;
        const result = await notifyBridge.send({
          title: rule.title || "纪念日提醒",
          content: renderTodayEventContent(event),
          level: "info",
          source: "countdown",
          sourceId: event.id,
          dedupeKey,
          extra: {
            type: "today_events",
            eventId: event.id,
            eventName: event.name,
            targetDate: event.date,
            anniversary: event.anniversary,
          },
        }, {
          channelIds: rule.channelIds,
          force: true,
          reason: "countdown-notify",
        });
        if (result.ok) await markCountdownNotifySent(dedupeKey);
      }
      continue;
    }

    if (rule.type === "advance_events") {
      const advanceDays = rule.advanceDays ?? [];
      if (advanceDays.length === 0) continue;
      const matches = getAdvanceEvents(events, advanceDays, now);
      for (const match of matches) {
        const dedupeKey = `countdown:advance:${rule.id}:${match.event.id}:${today}:${match.daysLeft}`;
        if (await hasCountdownNotifySent(dedupeKey)) continue;
        const result = await notifyBridge.send({
          title: rule.title || "提前提醒",
          content: renderAdvanceEventContent(match),
          level: "info",
          source: "countdown",
          sourceId: match.event.id,
          dedupeKey,
          extra: {
            type: "advance_events",
            eventId: match.event.id,
            eventName: match.event.name,
            targetDate: match.event.date,
            anniversary: match.event.anniversary,
            daysLeft: match.daysLeft,
          },
        }, {
          channelIds: rule.channelIds,
          force: true,
          reason: "countdown-notify",
        });
        if (result.ok) await markCountdownNotifySent(dedupeKey);
      }
      continue;
    }

    if (rule.type === "upcoming_digest") {
      const upcomingDays = rule.upcomingDays ?? 7;
      const matches = getUpcomingEvents(events, upcomingDays, now);
      if (matches.length === 0) continue;
      const dedupeKey = `countdown:digest:${rule.id}:${today}`;
      if (await hasCountdownNotifySent(dedupeKey)) continue;
      const result = await notifyBridge.send({
        title: `未来 ${upcomingDays} 天纪念日摘要`,
        content: renderUpcomingDigestContent(matches, settings.maxEventsPerMessage),
        level: "info",
        source: "countdown",
        sourceId: rule.id,
        dedupeKey,
        extra: {
          type: "upcoming_digest",
          count: matches.length,
          upcomingDays,
        },
      }, {
        channelIds: rule.channelIds,
        force: true,
        reason: "countdown-notify",
      });
      if (result.ok) await markCountdownNotifySent(dedupeKey);
    }
  }
}
