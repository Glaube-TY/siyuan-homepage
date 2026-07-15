import { notificationCenter } from "@/features/notification-center";
import { loadCountdownEvents } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { loadCountdownCenterSettings } from "@/components/utils/widgetBlock/widget/countdown/countdownCenterSettings";
import { resolveCountdownOccurrence } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
import {
  filterEventsForRule,
  formatLocalDate,
  getAdvanceEvents,
  getTodayEvents,
  getUpcomingEvents,
  overrideMap,
  shouldRunDailyRuleAt,
} from "./countdown-notify-rules";
import {
  renderAdvanceEventContent,
  renderTodayEventContent,
  renderUpcomingDigestContent,
} from "./countdown-notify-render";
import type { CountdownNotifySettings } from "./types";

function scheduledAt(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
  );
}
function inWindow(time: string, now: Date, windowMinutes: number): boolean {
  return shouldRunDailyRuleAt({ time }, now, windowMinutes);
}

export async function runCountdownNotifyScan(
  settings: CountdownNotifySettings,
  now = new Date(),
): Promise<void> {
  if (!settings.enabled) return;
  const { events } = await loadCountdownEvents();
  if (!events.length) return;
  const { displayDefaults } = await loadCountdownCenterSettings();
  const today = formatLocalDate(now);
  const overrides = overrideMap(settings.eventOverrides);
  for (const rule of settings.rules.filter((item) => item.enabled)) {
    if (!shouldRunDailyRuleAt(rule, now, settings.catchUpWindowMinutes))
      continue;
    const schedule = scheduledAt(now, rule.time ?? "00:00");
    const expiresAt = new Date(
      schedule.getTime() + settings.catchUpWindowMinutes * 60_000,
    ).toISOString();
    const scoped = filterEventsForRule(events, rule, overrides);
    if (rule.type === "today_events")
      for (const event of getTodayEvents(scoped, now))
        await notificationCenter.notify(
          {
            type: "today_events",
            title: rule.title || "纪念日提醒",
            content: renderTodayEventContent(event, now, displayDefaults),
            level: "info",
            source: "countdown",
            sourceId: event.id,
            occurrenceKey: `countdown:today:${rule.id}:${event.id}:${today}`,
            scheduledAt: schedule.toISOString(),
            expiresAt,
            extra: {
              type: "today_events",
              eventId: event.id,
              eventName: event.name,
              recurrence: event.recurrence,
            },
          },
          { targets: rule.deliveryTargets, reason: "countdown-notify" },
        );
    if (rule.type === "advance_events")
      for (const match of getAdvanceEvents(scoped, rule.advanceDays ?? [], now))
        await notificationCenter.notify(
          {
            type: "advance_events",
            title: rule.title || "提前提醒",
            content: renderAdvanceEventContent(match, displayDefaults),
            level: "info",
            source: "countdown",
            sourceId: match.event.id,
            occurrenceKey: `countdown:advance:${rule.id}:${match.event.id}:${today}:${match.daysLeft}`,
            scheduledAt: schedule.toISOString(),
            expiresAt,
            extra: {
              type: "advance_events",
              eventId: match.event.id,
              eventName: match.event.name,
              targetDate: match.occurrence.localDate,
              recurrence: match.event.recurrence,
              daysLeft: match.daysLeft,
            },
          },
          { targets: rule.deliveryTargets, reason: "countdown-notify" },
        );
    if (rule.type === "upcoming_digest") {
      const upcomingDays = rule.upcomingDays ?? 7;
      const matches = getUpcomingEvents(scoped, upcomingDays, now);
      if (matches.length)
        await notificationCenter.notify(
          {
            type: "upcoming_digest",
            title: rule.title || `未来 ${upcomingDays} 天纪念日摘要`,
            content: renderUpcomingDigestContent(
              matches,
              settings.maxEventsPerMessage,
              displayDefaults,
            ),
            level: "info",
            source: "countdown",
            sourceId: rule.id,
            occurrenceKey: `countdown:digest:${rule.id}:${today}`,
            scheduledAt: schedule.toISOString(),
            expiresAt,
            extra: {
              type: "upcoming_digest",
              count: matches.length,
              upcomingDays,
            },
          },
          { targets: rule.deliveryTargets, reason: "countdown-notify" },
        );
    }
  }
  for (const override of settings.eventOverrides.filter(
    (item) =>
      item.mode === "custom" &&
      inWindow(item.time, now, settings.catchUpWindowMinutes),
  )) {
    const event = events.find(
      (item) => item.id === override.eventId && !item.archived,
    );
    if (!event) continue;
    const occurrence = resolveCountdownOccurrence(event, now);
    if (!occurrence) continue;
    const schedule = scheduledAt(now, override.time);
    const expiresAt = new Date(
      schedule.getTime() + settings.catchUpWindowMinutes * 60_000,
    ).toISOString();
    if (occurrence.daysDelta === 0 && override.remindOnDay)
      await notificationCenter.notify(
        {
          type: "today_events",
          title: "纪念日提醒",
          content: renderTodayEventContent(event, now, displayDefaults),
          level: "info",
          source: "countdown",
          sourceId: event.id,
          occurrenceKey: `countdown:custom-today:${event.id}:${occurrence.localDate}`,
          scheduledAt: schedule.toISOString(),
          expiresAt,
        },
        {
          targets: override.deliveryTargets,
          reason: "countdown-custom-notify",
        },
      );
    if (
      occurrence.daysDelta > 0 &&
      override.advanceDays.includes(occurrence.daysDelta)
    ) {
      const match = { event, occurrence, daysLeft: occurrence.daysDelta };
      await notificationCenter.notify(
        {
          type: "advance_events",
          title: "纪念日提前提醒",
          content: renderAdvanceEventContent(match, displayDefaults),
          level: "info",
          source: "countdown",
          sourceId: event.id,
          occurrenceKey: `countdown:custom-advance:${event.id}:${occurrence.localDate}:${occurrence.daysDelta}`,
          scheduledAt: schedule.toISOString(),
          expiresAt,
        },
        {
          targets: override.deliveryTargets,
          reason: "countdown-custom-notify",
        },
      );
    }
  }
}
