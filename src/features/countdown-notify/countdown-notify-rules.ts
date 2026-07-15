import type {
  CountdownEventRecord,
  CountdownOccurrence,
} from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
import {
  formatLocalDate,
  resolveCountdownOccurrence,
} from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
import type {
  CountdownEventNotifyOverride,
  CountdownNotifyRule,
  CountdownNotifyRuleScope,
} from "./types";

export { formatLocalDate };
export interface AdvanceEventMatch {
  event: CountdownEventRecord;
  occurrence: CountdownOccurrence;
  daysLeft: number;
}
export type UpcomingEventMatch = AdvanceEventMatch;

export function matchesCountdownNotifyScope(
  event: CountdownEventRecord,
  scope: CountdownNotifyRuleScope,
): boolean {
  return (
    (!scope.categoryIds.length ||
      Boolean(
        event.categoryId && scope.categoryIds.includes(event.categoryId),
      )) &&
    (!scope.tags.length ||
      event.tags.some((tag) => scope.tags.includes(tag))) &&
    (!scope.kinds.length || scope.kinds.includes(event.kind)) &&
    (!scope.priorities.length || scope.priorities.includes(event.priority)) &&
    (!scope.eventIds.length || scope.eventIds.includes(event.id))
  );
}
export function overrideMap(
  overrides: CountdownEventNotifyOverride[],
): Map<string, CountdownEventNotifyOverride> {
  return new Map(overrides.map((item) => [item.eventId, item]));
}
export function filterEventsForRule(
  events: CountdownEventRecord[],
  rule: CountdownNotifyRule,
  overrides: Map<string, CountdownEventNotifyOverride>,
): CountdownEventRecord[] {
  return events.filter((event) => {
    const override = overrides.get(event.id);
    if (event.archived || override?.mode === "mute") return false;
    if (override?.mode === "custom" && rule.type !== "upcoming_digest")
      return false;
    if (
      override?.mode === "custom" &&
      rule.type === "upcoming_digest" &&
      !override.includeInDigest
    )
      return false;
    return matchesCountdownNotifyScope(event, rule.scope);
  });
}
export function getTodayEvents(
  events: CountdownEventRecord[],
  now: Date,
): CountdownEventRecord[] {
  return events.filter(
    (event) => resolveCountdownOccurrence(event, now)?.daysDelta === 0,
  );
}
export function getAdvanceEvents(
  events: CountdownEventRecord[],
  advanceDays: number[],
  now: Date,
): AdvanceEventMatch[] {
  const matches: AdvanceEventMatch[] = [];
  for (const event of events) {
    const occurrence = resolveCountdownOccurrence(event, now);
    if (
      occurrence &&
      occurrence.daysDelta >= 0 &&
      advanceDays.includes(occurrence.daysDelta)
    )
      matches.push({ event, occurrence, daysLeft: occurrence.daysDelta });
  }
  return matches.sort((a, b) => a.daysLeft - b.daysLeft);
}
export function getUpcomingEvents(
  events: CountdownEventRecord[],
  upcomingDays: number,
  now: Date,
): UpcomingEventMatch[] {
  const matches: UpcomingEventMatch[] = [];
  for (const event of events) {
    const occurrence = resolveCountdownOccurrence(event, now);
    if (
      occurrence &&
      occurrence.daysDelta >= 0 &&
      occurrence.daysDelta <= upcomingDays
    )
      matches.push({ event, occurrence, daysLeft: occurrence.daysDelta });
  }
  return matches.sort((a, b) => a.daysLeft - b.daysLeft);
}
export function shouldRunDailyRuleAt(
  rule: Pick<CountdownNotifyRule, "time">,
  now: Date,
  catchUpWindowMinutes: number,
): boolean {
  if (!rule.time) return false;
  const [hour, minute] = rule.time.split(":").map(Number);
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
  );
  const diff = now.getTime() - target.getTime();
  return diff >= 0 && diff <= catchUpWindowMinutes * 60_000;
}
