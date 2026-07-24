import {
  COUNTDOWN_STORE_TRANSACTION_LOCK,
  loadSharedJson,
  mutateSharedJson,
  runSharedWidgetExclusive,
  type SharedRevisionedFile,
} from "../sharedLocalStorage/sharedLocalStorage";
import {
  COUNTDOWN_CENTER_SETTINGS_FILE,
  COUNTDOWN_CENTER_SETTINGS_SCHEMA,
} from "../sharedLocalStorage/sharedWidgetStoragePaths";
import { assertSharedWidgetMigrationReady } from "../sharedLocalStorage/sharedWidgetMigration";
import {
  DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
  DEFAULT_COUNTDOWN_WIDGET_VIEW,
  type CountdownDisplayPreferences,
  type CountdownWidgetViewConfig,
} from "./countdownTypes";
import { ensureCountdownStoreReadable } from "./countdownData";

export const COUNTDOWN_CENTER_SETTINGS_VERSION = 1;
export const COUNTDOWN_CENTER_SETTINGS_CHANGED_EVENT =
  "countdown-center-settings-changed";

export interface CountdownCenterSettingsFile extends SharedRevisionedFile {
  schema: "siyuan-homepage-countdown-center-settings";
  version: 1;
  displayDefaults: CountdownDisplayPreferences;
  defaultView: Pick<
    CountdownWidgetViewConfig,
    "sortBy" | "maxItems" | "includePast" | "pastDays"
  >;
}

export interface CountdownCenterSettingsSaveQueue {
  enqueue: (settings: CountdownCenterSettingsFile) => void;
  syncLastSaved: (settings: CountdownCenterSettingsFile) => void;
}

function cloneSettingsSnapshot(
  value: CountdownCenterSettingsFile,
): CountdownCenterSettingsFile {
  return {
    ...value,
    displayDefaults: { ...value.displayDefaults },
    defaultView: { ...value.defaultView },
  };
}

export function createCountdownCenterSettingsSaveQueue(options: {
  initial: CountdownCenterSettingsFile;
  persist: (
    settings: CountdownCenterSettingsFile,
  ) => Promise<CountdownCenterSettingsFile>;
  onBusyChange: (busy: boolean) => void;
  onSaved: (
    settings: CountdownCenterSettingsFile,
    hasPending: boolean,
  ) => void;
  onFailed: (lastSaved: CountdownCenterSettingsFile, error: unknown) => void;
}): CountdownCenterSettingsSaveQueue {
  let running = false;
  let pending: CountdownCenterSettingsFile | null = null;
  let lastSaved = cloneSettingsSnapshot(options.initial);
  const drain = async (): Promise<void> => {
    if (running) return;
    running = true;
    options.onBusyChange(true);
    while (pending) {
      const next = pending;
      pending = null;
      try {
        const saved = await options.persist(next);
        lastSaved = cloneSettingsSnapshot(saved);
        options.onSaved(cloneSettingsSnapshot(saved), pending !== null);
      } catch (error) {
        pending = null;
        options.onFailed(cloneSettingsSnapshot(lastSaved), error);
        break;
      }
    }
    running = false;
    options.onBusyChange(false);
  };
  return {
    enqueue(settings) {
      pending = cloneSettingsSnapshot(settings);
      void drain();
    },
    syncLastSaved(settings) {
      if (!running && !pending)
        lastSaved = cloneSettingsSnapshot(settings);
    },
  };
}

export function createDefaultCountdownCenterSettings(): CountdownCenterSettingsFile {
  return {
    schema: COUNTDOWN_CENTER_SETTINGS_SCHEMA,
    version: COUNTDOWN_CENTER_SETTINGS_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    displayDefaults: { ...DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES },
    defaultView: {
      sortBy: DEFAULT_COUNTDOWN_WIDGET_VIEW.sortBy,
      maxItems: DEFAULT_COUNTDOWN_WIDGET_VIEW.maxItems,
      includePast: DEFAULT_COUNTDOWN_WIDGET_VIEW.includePast,
      pastDays: DEFAULT_COUNTDOWN_WIDGET_VIEW.pastDays,
    },
  };
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function integer(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.round(number)))
    : fallback;
}

export function normalizeCountdownCenterSettings(
  raw: unknown,
): CountdownCenterSettingsFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("纪念日中心设置结构无效");
  const value = raw as Record<string, unknown>;
  if (
    value.schema !== COUNTDOWN_CENTER_SETTINGS_SCHEMA ||
    value.version !== COUNTDOWN_CENTER_SETTINGS_VERSION
  )
    throw new Error("纪念日中心设置 schema 或 version 不受支持");
  if (
    !value.displayDefaults ||
    typeof value.displayDefaults !== "object" ||
    Array.isArray(value.displayDefaults)
  )
    throw new Error("纪念日显示设置结构无效");
  if (
    !value.defaultView ||
    typeof value.defaultView !== "object" ||
    Array.isArray(value.defaultView)
  )
    throw new Error("纪念日默认视图结构无效");
  const display = value.displayDefaults as Record<string, unknown>;
  const view = value.defaultView as Record<string, unknown>;
  const defaults = DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES;
  const dateFormat =
    display.dateFormat === "ymd" || display.dateFormat === "md"
      ? display.dateFormat
      : "localized";
  const sortBy =
    view.sortBy === "priority" ||
    view.sortBy === "manual" ||
    view.sortBy === "name"
      ? view.sortBy
      : "nearest";
  return {
    schema: COUNTDOWN_CENTER_SETTINGS_SCHEMA,
    version: COUNTDOWN_CENTER_SETTINGS_VERSION,
    revision: integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    displayDefaults: {
      dateFormat,
      showWeekday: boolean(display.showWeekday, defaults.showWeekday),
      showOriginalDate: boolean(
        display.showOriginalDate,
        defaults.showOriginalDate,
      ),
      showOccurrenceDate: boolean(
        display.showOccurrenceDate,
        defaults.showOccurrenceDate,
      ),
      showLunarDate: boolean(display.showLunarDate, defaults.showLunarDate),
      showCategory: boolean(display.showCategory, defaults.showCategory),
      showTags: boolean(display.showTags, defaults.showTags),
      showPriority: boolean(display.showPriority, defaults.showPriority),
      showCountLabel: boolean(display.showCountLabel, defaults.showCountLabel),
      showNotePreview: boolean(
        display.showNotePreview,
        defaults.showNotePreview,
      ),
      showLinkedNoteAction: boolean(
        display.showLinkedNoteAction,
        defaults.showLinkedNoteAction,
      ),
    },
    defaultView: {
      sortBy,
      maxItems: integer(view.maxItems, 20, 1, 100),
      includePast: boolean(view.includePast, false),
      pastDays: integer(view.pastDays, 30, 0, 3650),
    },
  };
}

function validate(
  actual: CountdownCenterSettingsFile,
  expected: CountdownCenterSettingsFile,
): void {
  if (
    JSON.stringify(actual.displayDefaults) !==
      JSON.stringify(expected.displayDefaults) ||
    JSON.stringify(actual.defaultView) !== JSON.stringify(expected.defaultView)
  )
    throw new Error("纪念日中心设置写入后校验失败");
}

export async function loadCountdownCenterSettings(): Promise<CountdownCenterSettingsFile> {
  await ensureCountdownStoreReadable();
  return (
    (await loadSharedJson(
      COUNTDOWN_CENTER_SETTINGS_FILE,
      normalizeCountdownCenterSettings,
    )) || createDefaultCountdownCenterSettings()
  );
}

export async function saveCountdownCenterSettings(
  input: CountdownCenterSettingsFile,
): Promise<CountdownCenterSettingsFile> {
  await assertSharedWidgetMigrationReady("countdown");
  const normalized = normalizeCountdownCenterSettings(input);
  const saved = await runSharedWidgetExclusive(
    COUNTDOWN_STORE_TRANSACTION_LOCK,
    () =>
      mutateSharedJson({
        store: "countdown",
        path: COUNTDOWN_CENTER_SETTINGS_FILE,
        createEmpty: createDefaultCountdownCenterSettings,
        normalize: normalizeCountdownCenterSettings,
        mutate: (file) => {
          file.displayDefaults = structuredClone(normalized.displayDefaults);
          file.defaultView = structuredClone(normalized.defaultView);
        },
        validate,
      }),
  );
  window.dispatchEvent(
    new CustomEvent(COUNTDOWN_CENTER_SETTINGS_CHANGED_EVENT, {
      detail: { revision: saved.revision },
    }),
  );
  return saved;
}

export function subscribeCountdownCenterSettingsChanged(
  callback: () => void,
): () => void {
  const listener = () => callback();
  window.addEventListener(COUNTDOWN_CENTER_SETTINGS_CHANGED_EVENT, listener);
  return () =>
    window.removeEventListener(
      COUNTDOWN_CENTER_SETTINGS_CHANGED_EVENT,
      listener,
    );
}

export function normalizeCountdownWidgetView(
  raw: unknown,
  legacyStyle?: string,
): CountdownWidgetViewConfig {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Partial<CountdownWidgetViewConfig>)
      : {};
  const legacyView =
    legacyStyle === "list2"
      ? "compact"
      : legacyStyle === "card1" || legacyStyle === "card2"
        ? "cards"
        : "list";
  const array = <T>(candidate: unknown): T[] =>
    Array.isArray(candidate) ? ([...new Set(candidate)] as T[]) : [];
  const dateRange = [
    "all",
    "today",
    "next7",
    "next30",
    "next90",
    "thisMonth",
    "thisYear",
  ].includes(String(value.dateRange))
    ? value.dateRange!
    : "all";
  return {
    ...DEFAULT_COUNTDOWN_WIDGET_VIEW,
    version: 1,
    scopeMode:
      value.scopeMode === "filter" || value.scopeMode === "selected"
        ? value.scopeMode
        : "all",
    categoryIds: array(value.categoryIds),
    tags: array(value.tags),
    kinds: array(value.kinds),
    priorities: array(value.priorities),
    eventIds: array(value.eventIds),
    dateRange,
    includePast:
      typeof value.includePast === "boolean" ? value.includePast : false,
    pastDays: integer(value.pastDays, 30, 0, 3650),
    sortBy:
      value.sortBy === "priority" ||
      value.sortBy === "manual" ||
      value.sortBy === "name"
        ? value.sortBy
        : "nearest",
    maxItems: integer(value.maxItems, 20, 1, 100),
    viewMode:
      value.viewMode === "list" ||
      value.viewMode === "compact" ||
      value.viewMode === "cards" ||
      value.viewMode === "timeline"
        ? value.viewMode
        : legacyView,
    displayMode: value.displayMode === "custom" ? "custom" : "inherit",
    displayOverrides:
      value.displayOverrides && typeof value.displayOverrides === "object"
        ? value.displayOverrides
        : undefined,
    cardAutoPlay:
      typeof value.cardAutoPlay === "boolean" ? value.cardAutoPlay : false,
    cardIntervalSeconds: integer(value.cardIntervalSeconds, 5, 2, 60),
  };
}
