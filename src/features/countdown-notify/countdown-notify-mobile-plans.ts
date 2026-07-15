import { loadCountdownEvents } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { formatLocalDate, getAdvanceEvents, getTodayEvents, getUpcomingEvents } from "./countdown-notify-rules";
import { renderAdvanceEventContent, renderTodayEventContent, renderUpcomingDigestContent } from "./countdown-notify-render";
import { loadCountdownNotifySettings } from "./countdown-notify-settings-store";
import type { MobileNotificationPlanProvider, MobileNotificationPlanRequest, NotificationEvent } from "@/features/notification-center/types";

function scheduledOn(date: Date, time: string | undefined): Date {
  const [hour, minute] = (time ?? "08:00").split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

export async function buildCountdownMobileNotificationPlans(context: Parameters<MobileNotificationPlanProvider["buildPlans"]>[0]): Promise<MobileNotificationPlanRequest[]> {
  const settings = await loadCountdownNotifySettings();
  if (!settings.enabled) return [];
  const rules = settings.rules.filter((rule) => rule.enabled && rule.deliveryTargets.some((target) => target.kind === "mobile"));
  if (rules.length === 0) return [];
  const { events } = await loadCountdownEvents();
  const plans: MobileNotificationPlanRequest[] = [];
  const firstDate = new Date(context.now.getFullYear(), context.now.getMonth(), context.now.getDate());
  for (let offset = 0; offset <= context.planningHorizonDays; offset += 1) {
    const date = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() + offset);
    const localDate = formatLocalDate(date);
    for (const rule of rules) {
      const scheduledAt = scheduledOn(date, rule.time);
      if (scheduledAt <= context.now || scheduledAt > context.horizonEnd) continue;
      const add = (event: NotificationEvent): void => {
        plans.push({ planKey: `mobile:${event.occurrenceKey}`, source: "countdown", ruleId: rule.id, scheduledAt: scheduledAt.toISOString(), event });
      };
      if (rule.type === "today_events") {
        for (const event of getTodayEvents(events, date)) {
          const occurrenceKey = `countdown:today:${rule.id}:${event.id}:${localDate}`;
          add({
            type: "today_events", source: "countdown", sourceId: event.id, title: rule.title || "纪念日提醒",
            content: renderTodayEventContent(event), level: "info", scheduledAt: scheduledAt.toISOString(), occurrenceKey,
            extra: { type: "today_events", eventId: event.id, eventName: event.name, targetDate: event.date, anniversary: event.anniversary },
          });
        }
      } else if (rule.type === "advance_events") {
        for (const match of getAdvanceEvents(events, rule.advanceDays ?? [], date)) {
          const occurrenceKey = `countdown:advance:${rule.id}:${match.event.id}:${localDate}:${match.daysLeft}`;
          add({
            type: "advance_events", source: "countdown", sourceId: match.event.id, title: rule.title || "提前提醒",
            content: renderAdvanceEventContent(match), level: "info", scheduledAt: scheduledAt.toISOString(), occurrenceKey,
            extra: { type: "advance_events", eventId: match.event.id, eventName: match.event.name, targetDate: match.event.date, anniversary: match.event.anniversary, daysLeft: match.daysLeft },
          });
        }
      } else {
        const upcomingDays = rule.upcomingDays ?? 7;
        const matches = getUpcomingEvents(events, upcomingDays, date);
        if (matches.length === 0) continue;
        const occurrenceKey = `countdown:digest:${rule.id}:${localDate}`;
        add({
          type: "upcoming_digest", source: "countdown", sourceId: rule.id, title: rule.title || `未来 ${upcomingDays} 天纪念日摘要`,
          content: renderUpcomingDigestContent(matches, settings.maxEventsPerMessage), level: "info", scheduledAt: scheduledAt.toISOString(), occurrenceKey,
          extra: { type: "upcoming_digest", count: matches.length, upcomingDays },
        });
      }
    }
  }
  return plans;
}

export const countdownMobileNotificationPlanProvider: MobileNotificationPlanProvider = {
  id: "countdown-notify",
  source: "countdown",
  buildPlans: buildCountdownMobileNotificationPlans,
};
