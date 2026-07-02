import type { CountdownEventRecord } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { formatLocalDate } from "@/components/tools/date-utils";
import type { CountdownNotifyRule } from "./types";

export { formatLocalDate };

export function getNextAnniversary(eventDate: string, now: Date): Date {
  const [m, d] = eventDate.split("-").slice(1).map(Number);
  const thisYear = new Date(now.getFullYear(), m - 1, d);
  if (thisYear >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    return thisYear;
  }
  return new Date(now.getFullYear() + 1, m - 1, d);
}

export function getTargetDate(event: CountdownEventRecord, now: Date): Date | null {
  try {
    if (event.anniversary) {
      return getNextAnniversary(event.date, now);
    }
    const d = new Date(event.date + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  const startA = startOfLocalDay(a);
  const startB = startOfLocalDay(b);
  return Math.round((startB.getTime() - startA.getTime()) / 86400000);
}

export function isToday(date: Date, now: Date): boolean {
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function getTodayEvents(events: CountdownEventRecord[], now: Date): CountdownEventRecord[] {
  return events.filter((event) => {
    const target = getTargetDate(event, now);
    return target !== null && isToday(target, now);
  });
}

export interface AdvanceEventMatch {
  event: CountdownEventRecord;
  daysLeft: number;
}

export function getAdvanceEvents(events: CountdownEventRecord[], advanceDays: number[], now: Date): AdvanceEventMatch[] {
  const matches: AdvanceEventMatch[] = [];
  for (const event of events) {
    const target = getTargetDate(event, now);
    if (!target) continue;
    const days = daysBetween(now, target);
    if (days >= 0 && advanceDays.includes(days)) {
      matches.push({ event, daysLeft: days });
    }
  }
  matches.sort((a, b) => a.daysLeft - b.daysLeft);
  return matches;
}

export interface UpcomingEventMatch {
  event: CountdownEventRecord;
  daysLeft: number;
}

export function getUpcomingEvents(events: CountdownEventRecord[], upcomingDays: number, now: Date): UpcomingEventMatch[] {
  const matches: UpcomingEventMatch[] = [];
  for (const event of events) {
    const target = getTargetDate(event, now);
    if (!target) continue;
    const days = daysBetween(now, target);
    if (days >= 0 && days <= upcomingDays) {
      matches.push({ event, daysLeft: days });
    }
  }
  matches.sort((a, b) => a.daysLeft - b.daysLeft);
  return matches;
}

export function shouldRunDailyRuleAt(rule: CountdownNotifyRule, now: Date, catchUpWindowMinutes: number): boolean {
  if (!rule.time) return false;
  const [h, m] = rule.time.split(":").map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  const diffMs = now.getTime() - target.getTime();
  return diffMs >= 0 && diffMs <= catchUpWindowMinutes * 60 * 1000;
}


