import type {
  SharedRevisionedFile,
  SharedWidgetMigrationMetadata,
} from "../sharedLocalStorage/sharedLocalStorage";

export const COUNTDOWN_EVENTS_VERSION = 2;

export type CountdownEventKind =
  | "birthday"
  | "anniversary"
  | "deadline"
  | "expiration"
  | "milestone"
  | "subscription"
  | "custom";
export type CountdownCalendarType = "solar" | "lunar";
export type CountdownRecurrence = "none" | "yearly";
export type CountdownSolarLeapDayPolicy = "feb28" | "mar1" | "skip";
export type CountdownLunarLeapMonthPolicy = "exact" | "regular-fallback";
export type CountdownLunarMissingDayPolicy = "last-day" | "skip";
export type CountdownCountLabelMode = "auto" | "anniversary" | "age" | "none";
export type CountdownPriority = "high" | "normal" | "low";
export type CountdownPastBehavior = "keep" | "auto-archive";
export type CountdownIconName =
  | "calendar"
  | "cake"
  | "heart"
  | "flag"
  | "clock"
  | "briefcase"
  | "graduation"
  | "file"
  | "credit-card"
  | "home"
  | "star"
  | "bell"
  | "gift"
  | "bookmark"
  | "target";

export interface CountdownLunarDate {
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
}

export interface CountdownEventRecord {
  id: string;
  name: string;
  kind: CountdownEventKind;
  calendar: CountdownCalendarType;
  recurrence: CountdownRecurrence;
  date?: string;
  lunarDate?: CountdownLunarDate;
  solarLeapDayPolicy: CountdownSolarLeapDayPolicy;
  lunarLeapMonthPolicy: CountdownLunarLeapMonthPolicy;
  lunarMissingDayPolicy: CountdownLunarMissingDayPolicy;
  countLabelMode: CountdownCountLabelMode;
  categoryId?: string;
  tags: string[];
  priority: CountdownPriority;
  icon: CountdownIconName;
  color?: string;
  note: string;
  linkedBlockId?: string;
  pastBehavior: CountdownPastBehavior;
  order: number;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

export type CountdownEventInput = Partial<CountdownEventRecord> & {
  name: string;
  /** v1 compatibility */
  anniversary?: boolean;
};

export interface CountdownCategoryRecord {
  id: string;
  name: string;
  icon: CountdownIconName;
  color?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

export type CountdownCategoryInput = Partial<CountdownCategoryRecord> & {
  name: string;
};

export interface CountdownEventsFile extends SharedRevisionedFile {
  schema: "siyuan-homepage-countdown-events";
  version: 2;
  categories: CountdownCategoryRecord[];
  events: CountdownEventRecord[];
  migration?: SharedWidgetMigrationMetadata;
}

export interface CountdownOccurrence {
  eventId: string;
  occurrenceDate: Date;
  localDate: string;
  daysDelta: number;
  status: "today" | "future" | "expired";
  originalDateLabel: string;
  occurrenceDateLabel: string;
  lunarDateLabel?: string;
  anniversaryCount?: number;
}

export interface CountdownDisplayPreferences {
  dateFormat: "ymd" | "md" | "localized";
  showWeekday: boolean;
  showOriginalDate: boolean;
  showOccurrenceDate: boolean;
  showLunarDate: boolean;
  showCategory: boolean;
  showTags: boolean;
  showPriority: boolean;
  showCountLabel: boolean;
  showNotePreview: boolean;
  showLinkedNoteAction: boolean;
}

export type CountdownWidgetDisplaySystem = "classic" | "center";

export interface CountdownWidgetViewConfig {
  version: 1;
  scopeMode: "all" | "filter" | "selected";
  categoryIds: string[];
  tags: string[];
  kinds: CountdownEventKind[];
  priorities: CountdownPriority[];
  eventIds: string[];
  dateRange:
    | "all"
    | "today"
    | "next7"
    | "next30"
    | "next90"
    | "thisMonth"
    | "thisYear";
  includePast: boolean;
  pastDays: number;
  sortBy: "nearest" | "priority" | "manual" | "name";
  maxItems: number;
  viewMode: "list" | "compact" | "cards" | "timeline";
  displayMode: "inherit" | "custom";
  displayOverrides?: Partial<CountdownDisplayPreferences>;
  cardAutoPlay: boolean;
  cardIntervalSeconds: number;
}

export interface CountdownEventViewModel {
  event: CountdownEventRecord;
  category?: CountdownCategoryRecord;
  occurrence: CountdownOccurrence;
  displayName: string;
  displayDate: string;
  relativeLabel: string;
  countLabel?: string;
  categoryLabel?: string;
  icon: CountdownIconName;
  color?: string;
}

export const COUNTDOWN_ICON_ALLOWLIST: readonly CountdownIconName[] = [
  "calendar",
  "cake",
  "heart",
  "flag",
  "clock",
  "briefcase",
  "graduation",
  "file",
  "credit-card",
  "home",
  "star",
  "bell",
  "gift",
  "bookmark",
  "target",
];
export const COUNTDOWN_EVENT_KINDS: readonly CountdownEventKind[] = [
  "birthday",
  "anniversary",
  "deadline",
  "expiration",
  "milestone",
  "subscription",
  "custom",
];
export const COUNTDOWN_KIND_LABELS: Record<CountdownEventKind, string> = {
  birthday: "生日",
  anniversary: "周年",
  deadline: "截止日期",
  expiration: "到期日期",
  milestone: "里程碑",
  subscription: "订阅续费",
  custom: "自定义",
};
export const COUNTDOWN_PRIORITY_LABELS: Record<CountdownPriority, string> = {
  high: "高",
  normal: "普通",
  low: "低",
};

export const DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES: CountdownDisplayPreferences =
  {
    dateFormat: "localized",
    showWeekday: true,
    showOriginalDate: true,
    showOccurrenceDate: true,
    showLunarDate: true,
    showCategory: true,
    showTags: true,
    showPriority: true,
    showCountLabel: true,
    showNotePreview: false,
    showLinkedNoteAction: true,
  };

export const DEFAULT_COUNTDOWN_WIDGET_VIEW: CountdownWidgetViewConfig = {
  version: 1,
  scopeMode: "all",
  categoryIds: [],
  tags: [],
  kinds: [],
  priorities: [],
  eventIds: [],
  dateRange: "all",
  includePast: false,
  pastDays: 30,
  sortBy: "nearest",
  maxItems: 20,
  viewMode: "list",
  displayMode: "inherit",
  cardAutoPlay: false,
  cardIntervalSeconds: 5,
};

export function defaultIconForKind(
  kind: CountdownEventKind,
): CountdownIconName {
  const icons: Record<CountdownEventKind, CountdownIconName> = {
    birthday: "cake",
    anniversary: "heart",
    deadline: "flag",
    expiration: "clock",
    milestone: "target",
    subscription: "credit-card",
    custom: "calendar",
  };
  return icons[kind];
}
