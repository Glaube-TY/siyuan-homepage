import {
  formatCountdownOccurrenceDate,
  resolveCountdownOccurrence,
} from "./countdownDateEngine";
import {
  COUNTDOWN_KIND_LABELS,
  DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
  DEFAULT_COUNTDOWN_WIDGET_VIEW,
  type CountdownCategoryRecord,
  type CountdownDisplayPreferences,
  type CountdownEventRecord,
  type CountdownEventViewModel,
  type CountdownPriority,
  type CountdownWidgetViewConfig,
} from "./countdownTypes";

const PRIORITY_ORDER: Record<CountdownPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

function relative(days: number): string {
  return days === 0
    ? "今天"
    : days > 0
      ? `${days} 天后`
      : `已过去 ${Math.abs(days)} 天`;
}
function dateInRange(
  date: Date,
  days: number,
  range: CountdownWidgetViewConfig["dateRange"],
  anchor: Date,
): boolean {
  if (range === "all") return true;
  if (range === "today") return days === 0;
  if (range === "next7") return days >= 0 && days <= 7;
  if (range === "next30") return days >= 0 && days <= 30;
  if (range === "next90") return days >= 0 && days <= 90;
  if (range === "thisMonth")
    return (
      date.getFullYear() === anchor.getFullYear() &&
      date.getMonth() === anchor.getMonth()
    );
  return date.getFullYear() === anchor.getFullYear();
}

export function resolveCountdownDisplayPreferences(
  config: CountdownWidgetViewConfig,
  defaults: CountdownDisplayPreferences = DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
): CountdownDisplayPreferences {
  return config.displayMode === "custom"
    ? { ...defaults, ...config.displayOverrides }
    : { ...defaults };
}

export function queryCountdownWidgetEvents(
  events: CountdownEventRecord[],
  categories: CountdownCategoryRecord[],
  rawConfig: Partial<CountdownWidgetViewConfig> = DEFAULT_COUNTDOWN_WIDGET_VIEW,
  anchor = new Date(),
  displayPreferences: CountdownDisplayPreferences =
    DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
): CountdownEventViewModel[] {
  const config = {
    ...DEFAULT_COUNTDOWN_WIDGET_VIEW,
    ...rawConfig,
  } as CountdownWidgetViewConfig;
  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  );
  const ids = new Set(config.eventIds);
  const categoryIds = new Set(config.categoryIds);
  const tags = new Set(config.tags);
  const kinds = new Set(config.kinds);
  const priorities = new Set(config.priorities);
  const values: CountdownEventViewModel[] = [];
  for (const event of events) {
    if (event.archived) continue;
    if (config.scopeMode === "selected" && !ids.has(event.id)) continue;
    if (
      config.scopeMode === "filter" &&
      ((categoryIds.size &&
        (!event.categoryId || !categoryIds.has(event.categoryId))) ||
        (tags.size && !event.tags.some((tag) => tags.has(tag))) ||
        (kinds.size && !kinds.has(event.kind)) ||
        (priorities.size && !priorities.has(event.priority)))
    )
      continue;
    const occurrence = resolveCountdownOccurrence(event, anchor);
    if (!occurrence) continue;
    if (
      occurrence.daysDelta < 0 &&
      (!config.includePast || Math.abs(occurrence.daysDelta) > config.pastDays)
    )
      continue;
    if (
      !dateInRange(
        occurrence.occurrenceDate,
        occurrence.daysDelta,
        config.dateRange,
        anchor,
      )
    )
      continue;
    const category = event.categoryId
      ? categoryMap.get(event.categoryId)
      : undefined;
    const count = occurrence.anniversaryCount;
    const countLabel =
      count == null || event.countLabelMode === "none"
        ? undefined
        : event.countLabelMode === "age" ||
            (event.countLabelMode === "auto" && event.kind === "birthday")
          ? `${count} 岁`
          : event.countLabelMode === "anniversary" ||
              (event.countLabelMode === "auto" && event.kind === "anniversary")
            ? `第 ${count} 周年`
            : undefined;
    values.push({
      event,
      category,
      occurrence,
      displayName: event.name,
      displayDate: formatCountdownOccurrenceDate(
        occurrence,
        displayPreferences,
      ),
      relativeLabel: relative(occurrence.daysDelta),
      countLabel,
      categoryLabel: category?.name,
      icon: event.icon,
      color: event.color || category?.color,
    });
  }
  values.sort((a, b) =>
    config.sortBy === "priority"
      ? PRIORITY_ORDER[a.event.priority] - PRIORITY_ORDER[b.event.priority] ||
        a.occurrence.daysDelta - b.occurrence.daysDelta
      : config.sortBy === "manual"
        ? a.event.order - b.event.order
        : config.sortBy === "name"
          ? a.event.name.localeCompare(b.event.name, "zh-CN")
          : (a.occurrence.status === "expired" ? 1 : 0) -
              (b.occurrence.status === "expired" ? 1 : 0) ||
            a.occurrence.daysDelta - b.occurrence.daysDelta ||
            PRIORITY_ORDER[a.event.priority] - PRIORITY_ORDER[b.event.priority],
  );
  return values.slice(0, config.maxItems);
}

export function searchCountdownEvents(
  events: CountdownEventRecord[],
  categories: CountdownCategoryRecord[],
  query: string,
): CountdownEventRecord[] {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) return events;
  const categoryMap = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  return events.filter((event) =>
    [
      event.name,
      event.note,
      ...event.tags,
      event.categoryId ? categoryMap.get(event.categoryId) || "" : "",
      COUNTDOWN_KIND_LABELS[event.kind],
    ].some((value) => value.toLocaleLowerCase().includes(keyword)),
  );
}

export function collectCountdownTags(events: CountdownEventRecord[]): string[] {
  return [...new Set(events.flatMap((event) => event.tags))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}
