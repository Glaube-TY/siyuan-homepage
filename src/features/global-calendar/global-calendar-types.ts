export const GLOBAL_CALENDAR_SOURCES = ["tasks", "diary", "countdown"] as const;

export type GlobalCalendarBuiltInSource = (typeof GLOBAL_CALENDAR_SOURCES)[number];
export type GlobalCalendarSource = string;
export type GlobalCalendarDetailView = "month" | "agenda";

export interface GlobalCalendarConfig {
  title: string;
  sources: Record<string, boolean>;
  weekStartsOn: 0 | 1;
  showAdjacentDays: boolean;
  showEventCount: boolean;
  maxPreviewEvents: number;
  defaultDetailView: GlobalCalendarDetailView;
}

export interface GlobalCalendarEvent {
  id: string;
  source: GlobalCalendarSource;
  date: string;
  title: string;
  subtitle?: string;
  target?:
    { kind: "block"; id: string } | { kind: "countdown"; eventId: string };
}

export interface GlobalCalendarLoadResult {
  events: GlobalCalendarEvent[];
  failedSources: GlobalCalendarSource[];
}

export const DEFAULT_GLOBAL_CALENDAR_CONFIG: GlobalCalendarConfig = {
  title: "全局日历",
  sources: { tasks: true, diary: true, countdown: true },
  weekStartsOn: 1,
  showAdjacentDays: true,
  showEventCount: true,
  maxPreviewEvents: 3,
  defaultDetailView: "month",
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
    },
    weekStartsOn: input.weekStartsOn === 0 ? 0 : 1,
    showAdjacentDays: input.showAdjacentDays !== false,
    showEventCount: input.showEventCount !== false,
    maxPreviewEvents: Number.isFinite(maxPreviewEvents)
      ? Math.max(1, Math.min(8, Math.round(maxPreviewEvents)))
      : DEFAULT_GLOBAL_CALENDAR_CONFIG.maxPreviewEvents,
    defaultDetailView:
      input.defaultDetailView === "agenda" ? "agenda" : "month",
  };
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
