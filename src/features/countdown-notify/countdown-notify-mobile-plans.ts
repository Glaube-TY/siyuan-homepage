import { loadCountdownEvents } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { loadCountdownCenterSettings } from "@/components/utils/widgetBlock/widget/countdown/countdownCenterSettings";
import { getCountdownOccurrencesInRange } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
import {
  filterEventsForRule,
  formatLocalDate,
  overrideMap,
  type AdvanceEventMatch,
} from "./countdown-notify-rules";
import {
  renderAdvanceEventContent,
  renderTodayEventContent,
  renderUpcomingDigestContent,
} from "./countdown-notify-render";
import { loadCountdownNotifySettings } from "./countdown-notify-settings-store";
import type {
  MobileNotificationPlanProvider,
  MobileNotificationPlanRequest,
  NotificationEvent,
} from "@/features/notification-center/types";

function scheduledOn(date: Date, time = "08:00"): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
  );
}
export async function buildCountdownMobileNotificationPlans(
  context: Parameters<MobileNotificationPlanProvider["buildPlans"]>[0],
): Promise<MobileNotificationPlanRequest[]> {
  const settings = await loadCountdownNotifySettings();
  if (!settings.enabled) return [];
  const { events } = await loadCountdownEvents();
  const { displayDefaults } = await loadCountdownCenterSettings();
  const plans: MobileNotificationPlanRequest[] = [];
  const overrides = overrideMap(settings.eventOverrides);
  const first = new Date(
    context.now.getFullYear(),
    context.now.getMonth(),
    context.now.getDate(),
  );
  const enabledRules = settings.rules.filter(
    (item) =>
      item.enabled &&
      item.deliveryTargets.some((target) => target.kind === "mobile"),
  );
  const customOverrides = settings.eventOverrides.filter(
    (item) =>
      item.mode === "custom" &&
      item.deliveryTargets.some((target) => target.kind === "mobile"),
  );
  const maxLookahead = Math.max(
    0,
    ...enabledRules.flatMap((rule) => [
      rule.upcomingDays ?? 0,
      ...(rule.advanceDays ?? []),
    ]),
    ...customOverrides.flatMap((override) => override.advanceDays),
  );
  const rangeEnd = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate() + context.planningHorizonDays + maxLookahead,
  );
  const occurrenceIndex = new Map<
    string,
    Map<string, ReturnType<typeof getCountdownOccurrencesInRange>[number]>
  >();
  for (const event of events.filter((item) => !item.archived))
    for (const occurrence of getCountdownOccurrencesInRange(
      event,
      first,
      rangeEnd,
    )) {
      const day = occurrenceIndex.get(occurrence.localDate) ?? new Map();
      day.set(event.id, occurrence);
      occurrenceIndex.set(occurrence.localDate, day);
    }
  const eventById = new Map(events.map((event) => [event.id, event]));
  function matchesOn(
    scopedIds: Set<string>,
    date: Date,
    daysLeft: number,
  ): AdvanceEventMatch[] {
    const day = occurrenceIndex.get(formatLocalDate(date));
    if (!day) return [];
    const matches: AdvanceEventMatch[] = [];
    for (const [eventId, occurrence] of day) {
      if (!scopedIds.has(eventId)) continue;
      const event = eventById.get(eventId);
      if (!event) continue;
      matches.push({
        event,
        daysLeft,
        occurrence: {
          ...occurrence,
          daysDelta: daysLeft,
          status: daysLeft === 0 ? "today" : "future",
        },
      });
    }
    return matches;
  }
  const add = (ruleId: string, scheduledAt: Date, event: NotificationEvent) =>
    plans.push({
      planKey: `mobile:${event.occurrenceKey}`,
      source: "countdown",
      ruleId,
      scheduledAt: scheduledAt.toISOString(),
      event,
    });
  for (let offset = 0; offset <= context.planningHorizonDays; offset += 1) {
    const date = new Date(
      first.getFullYear(),
      first.getMonth(),
      first.getDate() + offset,
    );
    const localDate = formatLocalDate(date);
    for (const rule of enabledRules) {
      const scheduledAt = scheduledOn(date, rule.time);
      if (scheduledAt <= context.now || scheduledAt > context.horizonEnd)
        continue;
      const scoped = filterEventsForRule(events, rule, overrides);
      const scopedIds = new Set(scoped.map((event) => event.id));
      if (rule.type === "today_events")
        for (const { event } of matchesOn(scopedIds, date, 0)) {
          const occurrenceKey = `countdown:today:${rule.id}:${event.id}:${localDate}`;
          add(rule.id, scheduledAt, {
            type: "today_events",
            source: "countdown",
            sourceId: event.id,
            title: rule.title || "纪念日提醒",
            content: renderTodayEventContent(event, date, displayDefaults),
            level: "info",
            scheduledAt: scheduledAt.toISOString(),
            occurrenceKey,
          });
        }
      if (rule.type === "advance_events")
        for (const match of (rule.advanceDays ?? [])
          .flatMap((daysLeft) => {
            const target = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate() + daysLeft,
            );
            return matchesOn(scopedIds, target, daysLeft);
          })
          .sort((a, b) => a.daysLeft - b.daysLeft)) {
          const occurrenceKey = `countdown:advance:${rule.id}:${match.event.id}:${localDate}:${match.daysLeft}`;
          add(rule.id, scheduledAt, {
            type: "advance_events",
            source: "countdown",
            sourceId: match.event.id,
            title: rule.title || "提前提醒",
            content: renderAdvanceEventContent(match, displayDefaults),
            level: "info",
            scheduledAt: scheduledAt.toISOString(),
            occurrenceKey,
          });
        }
      if (rule.type === "upcoming_digest") {
        const days = rule.upcomingDays ?? 7;
        const matches = Array.from({ length: days + 1 }, (_, daysLeft) => {
          const target = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate() + daysLeft,
          );
          return matchesOn(scopedIds, target, daysLeft);
        }).flat();
        if (matches.length) {
          const occurrenceKey = `countdown:digest:${rule.id}:${localDate}`;
          add(rule.id, scheduledAt, {
            type: "upcoming_digest",
            source: "countdown",
            sourceId: rule.id,
            title: rule.title || `未来 ${days} 天纪念日摘要`,
            content: renderUpcomingDigestContent(
              matches,
              settings.maxEventsPerMessage,
              displayDefaults,
            ),
            level: "info",
            scheduledAt: scheduledAt.toISOString(),
            occurrenceKey,
          });
        }
      }
    }
    for (const override of customOverrides) {
      const scheduledAt = scheduledOn(date, override.time);
      if (scheduledAt <= context.now || scheduledAt > context.horizonEnd)
        continue;
      const event = eventById.get(override.eventId);
      if (!event) continue;
      const todayOccurrence = occurrenceIndex
        .get(localDate)
        ?.get(override.eventId);
      if (todayOccurrence && override.remindOnDay)
        add(`custom:${event.id}`, scheduledAt, {
          type: "today_events",
          source: "countdown",
          sourceId: event.id,
          title: "纪念日提醒",
          content: renderTodayEventContent(event, date, displayDefaults),
          level: "info",
          scheduledAt: scheduledAt.toISOString(),
          occurrenceKey: `countdown:custom-today:${event.id}:${todayOccurrence.localDate}`,
        });
      for (const daysLeft of override.advanceDays) {
        if (daysLeft <= 0) continue;
        const target = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() + daysLeft,
        );
        const occurrence = occurrenceIndex
          .get(formatLocalDate(target))
          ?.get(override.eventId);
        if (!occurrence) continue;
        const match = {
          event,
          occurrence: {
            ...occurrence,
            daysDelta: daysLeft,
          } as typeof occurrence,
          daysLeft,
        };
        add(`custom:${event.id}`, scheduledAt, {
          type: "advance_events",
          source: "countdown",
          sourceId: event.id,
          title: "纪念日提前提醒",
          content: renderAdvanceEventContent(match, displayDefaults),
          level: "info",
          scheduledAt: scheduledAt.toISOString(),
          occurrenceKey: `countdown:custom-advance:${event.id}:${occurrence.localDate}:${daysLeft}`,
        });
      }
    }
  }
  return plans;
}
export const countdownMobileNotificationPlanProvider: MobileNotificationPlanProvider =
  {
    id: "countdown-notify",
    source: "countdown",
    buildPlans: buildCountdownMobileNotificationPlans,
  };
