import type { AutomationJobDefinition, AutomationJobState, AutomationTrigger } from "./automation-job-contract";

const MINUTE = 60_000;
const DAY = 86_400_000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function localParts(timestamp: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(timestamp).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1,
  };
}

function localKey(parts: Pick<LocalParts, "year" | "month" | "day" | "hour" | "minute">): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function zonedTimestamp(parts: Pick<LocalParts, "year" | "month" | "day" | "hour" | "minute">, timeZone: string): number {
  const wanted = localKey(parts);
  let guess = wanted;
  for (let index = 0; index < 4; index += 1) {
    const delta = wanted - localKey(localParts(guess, timeZone));
    if (delta === 0) return guess;
    guess += delta;
  }
  // DST 跳时中的不存在时间取跳时后的第一个有效分钟，保证一次且不倒退。
  for (let timestamp = guess - 180 * MINUTE; timestamp <= guess + 180 * MINUTE; timestamp += MINUTE) {
    if (localKey(localParts(timestamp, timeZone)) >= wanted) return timestamp;
  }
  return guess;
}

function timeParts(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function addLocalDays(parts: LocalParts, days: number): Pick<LocalParts, "year" | "month" | "day"> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function nextScheduledAt(trigger: AutomationTrigger, afterExclusive: number): number | undefined {
  if (trigger.kind === "once") return trigger.at > afterExclusive ? trigger.at : undefined;
  if (trigger.kind === "interval") {
    if (afterExclusive < trigger.anchorAt) return trigger.anchorAt;
    return trigger.anchorAt + (Math.floor((afterExclusive - trigger.anchorAt) / (trigger.intervalMinutes * MINUTE)) + 1) * trigger.intervalMinutes * MINUTE;
  }
  if (trigger.kind === "sensor") return afterExclusive + trigger.intervalMinutes * MINUTE;

  const origin = localParts(afterExclusive, trigger.timeZone);
  const time = timeParts(trigger.time);
  for (let offset = 0; offset <= 370; offset += 1) {
    const date = addLocalDays(origin, offset);
    const noon = zonedTimestamp({ ...date, hour: 12, minute: 0 }, trigger.timeZone);
    const candidateLocal = localParts(noon, trigger.timeZone);
    if (trigger.kind === "weekly" && !trigger.weekdays.includes(candidateLocal.weekday)) continue;
    if (trigger.kind === "monthly" && !trigger.daysOfMonth.includes(date.day)) continue;
    const candidate = zonedTimestamp({ ...date, ...time }, trigger.timeZone);
    if (candidate > afterExclusive) return candidate;
  }
  return undefined;
}

function latestDueAt(trigger: AutomationTrigger, firstDue: number, now: number): number {
  if (trigger.kind === "once") return firstDue;
  if (trigger.kind === "interval" || trigger.kind === "sensor") {
    const interval = trigger.intervalMinutes * MINUTE;
    return firstDue + Math.floor((now - firstDue) / interval) * interval;
  }
  let latest = firstDue;
  for (let next = nextScheduledAt(trigger, latest); next !== undefined && next <= now; next = nextScheduledAt(trigger, latest)) latest = next;
  return latest;
}

export interface DueOccurrence {
  scheduledAt?: number;
  nextRunAt?: number;
  occurrenceKey?: string;
  skipped: boolean;
}

export function resolveDueOccurrence(
  job: AutomationJobDefinition,
  state: AutomationJobState | undefined,
  now = Date.now(),
): DueOccurrence {
  if (!job.enabled) return { skipped: true };
  const next = state?.nextRunAt ?? nextScheduledAt(job.trigger, job.createdAt - 1);
  if (next === undefined || next > now) return { nextRunAt: next, skipped: false };
  const expired = job.policy.expiresAfterMs !== undefined && now - next > job.policy.expiresAfterMs;
  if ((job.policy.catchUp === "skip" && now - next > MINUTE) || expired) {
    return { skipped: true, nextRunAt: nextScheduledAt(job.trigger, now) };
  }
  const scheduledAt = job.policy.catchUp === "latest" ? latestDueAt(job.trigger, next, now) : next;
  return {
    scheduledAt,
    occurrenceKey: `${job.jobId}:${scheduledAt}`,
    nextRunAt: nextScheduledAt(job.trigger, scheduledAt),
    skipped: false,
  };
}

export function listScheduledBetween(trigger: AutomationTrigger, startExclusive: number, endInclusive: number, limit = 500): number[] {
  const result: number[] = [];
  let cursor = startExclusive;
  while (result.length < limit) {
    const next = nextScheduledAt(trigger, cursor);
    if (next === undefined || next > endInclusive) break;
    result.push(next);
    cursor = next;
  }
  return result;
}

export const AUTOMATION_SCHEDULE_CONSTANTS = Object.freeze({ MINUTE, DAY });
