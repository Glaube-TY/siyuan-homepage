import type {
  GlobalCalendarEvent,
  GlobalCalendarTaskColorMode,
} from "./global-calendar-types";
import { formatCalendarDate } from "./global-calendar-types";

export interface GlobalCalendarRangeSegment {
  event: GlobalCalendarEvent;
  startColumn: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export function eventDateRange(event: GlobalCalendarEvent): [string, string] {
  const start = event.startAt?.slice(0, 10) || event.date;
  const end = event.endAt?.slice(0, 10) || start;
  return start <= end ? [start, end] : [end, start];
}

export function eventOccursOn(event: GlobalCalendarEvent, date: string): boolean {
  const [start, end] = eventDateRange(event);
  return start <= date && date <= end;
}

export function isCalendarRangeEvent(event: GlobalCalendarEvent): boolean {
  return event.source !== "diary" && event.source !== "countdown";
}

export function isCalendarDateMarker(event: GlobalCalendarEvent): boolean {
  return event.source === "diary" || event.source === "countdown";
}

export function buildCalendarRangeSegments(
  events: GlobalCalendarEvent[],
  dates: string[],
): GlobalCalendarRangeSegment[] {
  if (!dates.length) return [];
  const first = dates[0];
  const last = dates[dates.length - 1];
  const lanes: string[] = [];
  return events
    .map((event) => ({ event, range: eventDateRange(event) }))
    .filter(({ range }) => range[0] <= last && range[1] >= first)
    .sort((left, right) =>
      left.range[0].localeCompare(right.range[0])
      || right.range[1].localeCompare(left.range[1])
      || left.event.title.localeCompare(right.event.title))
    .map(({ event, range }) => {
      const visibleStart = range[0] < first ? first : range[0];
      const visibleEnd = range[1] > last ? last : range[1];
      const startColumn = dates.indexOf(visibleStart) + 1;
      const endColumn = dates.indexOf(visibleEnd) + 1;
      let lane = lanes.findIndex((occupiedUntil) => occupiedUntil < visibleStart);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = visibleEnd;
      return {
        event,
        startColumn,
        span: endColumn - startColumn + 1,
        lane,
        continuesBefore: range[0] < first,
        continuesAfter: range[1] > last,
      };
    });
}

const TASK_GRADIENT = ["#4f7cff", "#7c5ce5", "#d8589a", "#e9773f", "#24a38a", "#3f8fc5"];

export function calendarEventColor(
  event: GlobalCalendarEvent,
  mode: GlobalCalendarTaskColorMode,
  today = formatCalendarDate(new Date()),
): string {
  if (event.source !== "tasks") {
    return event.color || {
      diary: "var(--b3-theme-success, #2e9d62)",
      countdown: "var(--b3-theme-warning, #c98518)",
      schedule: "#9b6be3",
    }[event.source] || "var(--b3-theme-primary)";
  }
  if (mode === "theme") return "var(--b3-theme-primary)";
  if (mode === "priority") {
    return ["#4f7cff", "#3f9f8f", "#d2a33a", "#e1783f", "#d94b64"][Math.max(0, Math.min(4, event.priorityLevel || 0))];
  }
  if (mode === "urgency") {
    const deadline = event.endAt?.slice(0, 10) || event.date;
    const days = Math.round((new Date(`${deadline}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
    return days < 0 ? "#d94b64" : days <= 3 ? "#e9773f" : days <= 7 ? "#d2a33a" : "#4f7cff";
  }
  let hash = 0;
  for (const char of event.entityId || event.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TASK_GRADIENT[hash % TASK_GRADIENT.length];
}
