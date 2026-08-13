import {
  loadSharedJson,
  mutateSharedJson,
  type SharedRevisionedFile,
} from "@/components/utils/widgetBlock/widget/sharedLocalStorage/sharedLocalStorage";
import {
  GLOBAL_CALENDAR_EVENTS_FILE,
  GLOBAL_CALENDAR_EVENTS_SCHEMA,
} from "@/components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetStoragePaths";
import {
  parseCalendarDate,
  type GlobalCalendarEvent,
  type GlobalCalendarSchedule,
  type GlobalCalendarRecurrence,
} from "./global-calendar-types";
import { getScheduleOccurrenceDates } from "./global-calendar-schedule-engine";

interface ScheduleFile extends SharedRevisionedFile {
  schedules: GlobalCalendarSchedule[];
}

const VERSION = 1;
const COLORS = ["#4f7cff", "#28a56b", "#d68a18", "#9b6be3", "#e15d72"];

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, 240) : fallback;
}

function normalizeRecurrence(value: unknown): GlobalCalendarRecurrence {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { kind: "none" };
  const raw = value as Record<string, unknown>;
  const until = parseCalendarDate(String(raw.until || ""))
    ? String(raw.until)
    : undefined;
  if (raw.kind === "daily") return { kind: "daily", until };
  if (raw.kind === "weekly") {
    const weekdays = Array.isArray(raw.weekdays)
      ? [
          ...new Set(
            raw.weekdays
              .map(Number)
              .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
          ),
        ]
      : [];
    return { kind: "weekly", weekdays, until };
  }
  return { kind: "none" };
}

export function normalizeSchedule(value: unknown): GlobalCalendarSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("日程结构无效");
  const raw = value as Record<string, unknown>;
  const date = cleanText(raw.date);
  const title = cleanText(raw.title);
  if (!title || !parseCalendarDate(date)) throw new Error("日程标题或日期无效");
  const now = new Date().toISOString();
  const time = (key: string): string | undefined => {
    const text = cleanText(raw[key]);
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : undefined;
  };
  const endDate = cleanText(raw.endDate);
  return {
    id:
      cleanText(raw.id) ||
      `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    kind: raw.kind === "course" ? "course" : "schedule",
    date,
    endDate:
      parseCalendarDate(endDate) && endDate >= date ? endDate : undefined,
    startTime: time("startTime"),
    endTime: time("endTime"),
    allDay: raw.allDay === true,
    note: cleanText(raw.note) || undefined,
    location: cleanText(raw.location) || undefined,
    color: /^#[0-9a-f]{6}$/i.test(cleanText(raw.color))
      ? cleanText(raw.color)
      : COLORS[0],
    projectTitle: cleanText(raw.projectTitle) || undefined,
    recurrence: normalizeRecurrence(raw.recurrence),
    createdAt: cleanText(raw.createdAt) || now,
    updatedAt: cleanText(raw.updatedAt) || now,
  };
}

function emptyFile(): ScheduleFile {
  return {
    schema: GLOBAL_CALENDAR_EVENTS_SCHEMA,
    version: VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    schedules: [],
  };
}

function normalizeFile(value: unknown): ScheduleFile {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("日历数据结构无效");
  const raw = value as Record<string, unknown>;
  if (
    raw.schema !== GLOBAL_CALENDAR_EVENTS_SCHEMA ||
    Number(raw.version) !== VERSION
  )
    throw new Error("日历数据版本无效");
  return {
    schema: GLOBAL_CALENDAR_EVENTS_SCHEMA,
    version: VERSION,
    revision: Math.max(0, Number(raw.revision) || 0),
    updatedAt: cleanText(raw.updatedAt) || new Date().toISOString(),
    schedules: Array.isArray(raw.schedules)
      ? raw.schedules.map(normalizeSchedule)
      : [],
  };
}

export async function loadGlobalCalendarSchedules(): Promise<
  GlobalCalendarSchedule[]
> {
  return (
    (await loadSharedJson(GLOBAL_CALENDAR_EVENTS_FILE, normalizeFile))
      ?.schedules || []
  );
}

export async function saveGlobalCalendarSchedule(
  input: Partial<GlobalCalendarSchedule> &
    Pick<GlobalCalendarSchedule, "title" | "date">,
): Promise<GlobalCalendarSchedule> {
  const schedule = normalizeSchedule({
    ...input,
    updatedAt: new Date().toISOString(),
  });
  await mutateSharedJson({
    store: "global-calendar",
    path: GLOBAL_CALENDAR_EVENTS_FILE,
    createEmpty: emptyFile,
    normalize: normalizeFile,
    mutate(file) {
      const index = file.schedules.findIndex((item) => item.id === schedule.id);
      if (index >= 0)
        file.schedules[index] = {
          ...schedule,
          createdAt: file.schedules[index].createdAt,
        };
      else file.schedules.push(schedule);
    },
  });
  return schedule;
}

export async function deleteGlobalCalendarSchedule(id: string): Promise<void> {
  await mutateSharedJson({
    store: "global-calendar",
    path: GLOBAL_CALENDAR_EVENTS_FILE,
    createEmpty: emptyFile,
    normalize: normalizeFile,
    mutate(file) {
      file.schedules = file.schedules.filter((item) => item.id !== id);
    },
  });
}

export function expandGlobalCalendarSchedules(
  schedules: GlobalCalendarSchedule[],
  start: Date,
  end: Date,
): GlobalCalendarEvent[] {
  const events: GlobalCalendarEvent[] = [];
  for (const schedule of schedules) {
    for (const date of getScheduleOccurrenceDates(schedule, start, end)) {
      events.push({
        id: `schedule:${schedule.id}:${date}`,
        source: "schedule",
        date,
        title: schedule.title,
        subtitle:
          schedule.kind === "course"
            ? [schedule.startTime, schedule.location, "课程"]
                .filter(Boolean)
                .join(" · ")
            : [schedule.startTime, schedule.note].filter(Boolean).join(" · ") ||
              "日程",
        startAt: schedule.startTime
          ? `${date}T${schedule.startTime}:00`
          : schedule.endDate ? `${schedule.date}T00:00:00` : undefined,
        endAt: schedule.endTime ? `${date}T${schedule.endTime}:00` : schedule.endDate ? `${schedule.endDate}T23:59:00` : undefined,
        allDay: schedule.allDay || !schedule.startTime,
        entityId: schedule.id,
        projectTitle: schedule.projectTitle,
        color: schedule.color,
        editable: true,
        target: { kind: "schedule", eventId: schedule.id },
      });
    }
  }
  return events;
}

export const GLOBAL_CALENDAR_COLORS = COLORS;
