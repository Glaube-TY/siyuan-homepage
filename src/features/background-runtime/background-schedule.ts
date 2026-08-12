import type { BackgroundTrigger } from "./schedule-contract";

const MINUTE = 60_000;
const DAY = 86_400_000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();
interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function localParts(timestamp: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(timestamp).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1 };
}

function localKey(parts: Pick<LocalParts, "year" | "month" | "day" | "hour" | "minute">): number { return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute); }

function zonedTimestamp(parts: Pick<LocalParts, "year" | "month" | "day" | "hour" | "minute">, timeZone: string): number {
  const wanted = localKey(parts);
  let guess = wanted;
  for (let index = 0; index < 4; index += 1) {
    const delta = wanted - localKey(localParts(guess, timeZone));
    if (delta === 0) return guess;
    guess += delta;
  }
  for (let timestamp = guess - 180 * MINUTE; timestamp <= guess + 180 * MINUTE; timestamp += MINUTE) {
    if (localKey(localParts(timestamp, timeZone)) >= wanted) return timestamp;
  }
  return guess;
}

function addLocalDays(parts: LocalParts, days: number): Pick<LocalParts, "year" | "month" | "day"> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function nextScheduledAt(trigger: BackgroundTrigger, afterExclusive: number): number | undefined {
  if (trigger.kind === "once") return trigger.at > afterExclusive ? trigger.at : undefined;
  if (trigger.kind === "interval") return afterExclusive < trigger.anchorAt
    ? trigger.anchorAt
    : trigger.anchorAt + (Math.floor((afterExclusive - trigger.anchorAt) / (trigger.intervalMinutes * MINUTE)) + 1) * trigger.intervalMinutes * MINUTE;
  if (trigger.kind === "sensor") return afterExclusive + trigger.intervalMinutes * MINUTE;
  const origin = localParts(afterExclusive, trigger.timeZone);
  const [hour, minute] = trigger.time.split(":").map(Number);
  for (let offset = 0; offset <= 370; offset += 1) {
    const date = addLocalDays(origin, offset);
    const candidateLocal = localParts(zonedTimestamp({ ...date, hour: 12, minute: 0 }, trigger.timeZone), trigger.timeZone);
    if (trigger.kind === "weekly" && !trigger.weekdays.includes(candidateLocal.weekday)) continue;
    if (trigger.kind === "monthly" && !trigger.daysOfMonth.includes(date.day)) continue;
    const candidate = zonedTimestamp({ ...date, hour, minute }, trigger.timeZone);
    if (candidate > afterExclusive) return candidate;
  }
}

export function listScheduledBetween(trigger: BackgroundTrigger, startExclusive: number, endInclusive: number, limit = 500): number[] {
  const result: number[] = [];
  for (let cursor = startExclusive; result.length < limit;) {
    const next = nextScheduledAt(trigger, cursor);
    if (next === undefined || next > endInclusive) break;
    result.push(next);
    cursor = next;
  }
  return result;
}

export const BACKGROUND_SCHEDULE_CONSTANTS = Object.freeze({ MINUTE, DAY });
