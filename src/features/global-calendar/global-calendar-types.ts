export const GLOBAL_CALENDAR_SOURCES = [
  "tasks",
  "diary",
  "countdown",
  "schedule",
] as const;

export type GlobalCalendarBuiltInSource =
  (typeof GLOBAL_CALENDAR_SOURCES)[number];
export type GlobalCalendarSource = string;
export type GlobalCalendarDetailView =
  "month" | "week" | "day" | "year" | "agenda" | "gantt";

export interface GlobalCalendarConfig {
  title: string;
  sources: Record<string, boolean>;
  weekStartsOn: 0 | 1;
  showAdjacentDays: boolean;
  showEventCount: boolean;
  maxPreviewEvents: number;
  defaultDetailView: GlobalCalendarDetailView;
  workdayStart: number;
  workdayEnd: number;
}

export type GlobalCalendarRecurrence =
  | { kind: "none" }
  | { kind: "daily"; until?: string }
  | { kind: "weekly"; weekdays: number[]; until?: string };

export interface GlobalCalendarEvent {
  id: string;
  source: GlobalCalendarSource;
  date: string;
  title: string;
  subtitle?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  entityId?: string;
  projectId?: string;
  projectTitle?: string;
  color?: string;
  editable?: boolean;
  target?:
    | { kind: "block"; id: string }
    | { kind: "countdown"; eventId: string }
    | { kind: "schedule"; eventId: string };
}

export interface GlobalCalendarSchedule {
  id: string;
  title: string;
  kind: "schedule" | "course";
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  note?: string;
  location?: string;
  color: string;
  projectTitle?: string;
  recurrence: GlobalCalendarRecurrence;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalCalendarLoadResult {
  events: GlobalCalendarEvent[];
  failedSources: GlobalCalendarSource[];
}

export const DEFAULT_GLOBAL_CALENDAR_CONFIG: GlobalCalendarConfig = {
  title: "全局日历",
  sources: { tasks: true, diary: true, countdown: true, schedule: true },
  weekStartsOn: 1,
  showAdjacentDays: true,
  showEventCount: true,
  maxPreviewEvents: 3,
  defaultDetailView: "month",
  workdayStart: 7,
  workdayEnd: 22,
};

export function normalizeGlobalCalendarConfig(
  value: unknown,
): GlobalCalendarConfig {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<GlobalCalendarConfig>)
      : {};
  const sources =
    input.sources && typeof input.sources === "object"
      ? input.sources
      : ({} as Record<string, unknown>);
  const maxPreviewEvents = Number(input.maxPreviewEvents);
  return {
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : DEFAULT_GLOBAL_CALENDAR_CONFIG.title,
    sources: {
      ...Object.fromEntries(
        Object.entries(sources).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
        ),
      ),
      tasks: sources.tasks !== false,
      diary: sources.diary !== false,
      countdown: sources.countdown !== false,
      schedule: sources.schedule !== false,
    },
    weekStartsOn: input.weekStartsOn === 0 ? 0 : 1,
    showAdjacentDays: input.showAdjacentDays !== false,
    showEventCount: input.showEventCount !== false,
    maxPreviewEvents: Number.isFinite(maxPreviewEvents)
      ? Math.max(1, Math.min(8, Math.round(maxPreviewEvents)))
      : DEFAULT_GLOBAL_CALENDAR_CONFIG.maxPreviewEvents,
    defaultDetailView: [
      "month",
      "week",
      "day",
      "year",
      "agenda",
      "gantt",
    ].includes(String(input.defaultDetailView))
      ? (input.defaultDetailView as GlobalCalendarDetailView)
      : "month",
    workdayStart: clampHour(
      input.workdayStart,
      DEFAULT_GLOBAL_CALENDAR_CONFIG.workdayStart,
    ),
    workdayEnd: clampHour(
      input.workdayEnd,
      DEFAULT_GLOBAL_CALENDAR_CONFIG.workdayEnd,
    ),
  };
}

function clampHour(value: unknown, fallback: number): number {
  const hour = Number(value);
  return Number.isFinite(hour)
    ? Math.max(0, Math.min(23, Math.round(hour)))
    : fallback;
}

export function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addCalendarDays(value: string, amount: number): string {
  const date = parseCalendarDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + amount);
  return formatCalendarDate(date);
}

export function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCalendarMonthRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}
