import {
  COUNTDOWN_STORE_TRANSACTION_LOCK,
  loadSharedJson,
  loadSharedRawJson,
  mutateSharedJson,
  runSharedWidgetExclusive,
  saveSharedJsonChecked,
} from "../sharedLocalStorage/sharedLocalStorage";
import {
  COUNTDOWN_EVENTS_FILE,
  COUNTDOWN_EVENTS_SCHEMA,
} from "../sharedLocalStorage/sharedWidgetStoragePaths";
import { assertSharedWidgetMigrationReady } from "../sharedLocalStorage/sharedWidgetMigration";
import { resolveCountdownOccurrence } from "./countdownDateEngine";
import {
  COUNTDOWN_EVENT_KINDS,
  COUNTDOWN_EVENTS_VERSION,
  COUNTDOWN_ICON_ALLOWLIST,
  defaultIconForKind,
  type CountdownCategoryInput,
  type CountdownCategoryRecord,
  type CountdownCountLabelMode,
  type CountdownEventInput,
  type CountdownEventKind,
  type CountdownEventRecord,
  type CountdownEventsFile,
  type CountdownIconName,
  type CountdownPriority,
} from "./countdownTypes";

export * from "./countdownTypes";

export interface CountdownStoreStatus {
  ok: boolean;
  missingFields: string[];
  message: string;
}
export interface CountdownLoadResult {
  events: CountdownEventRecord[];
  revision: number;
  status: CountdownStoreStatus;
}
export interface CountdownCenterLoadResult extends CountdownLoadResult {
  categories: CountdownCategoryRecord[];
  file: CountdownEventsFile;
}
export interface CountdownEditSnapshot {
  initialEvents: CountdownEventRecord[];
  initialEventIds: string[];
  baseRevision: number;
}
export interface CountdownEventEditSnapshot {
  baseRevision: number;
  original?: CountdownEventRecord;
}
export interface CountdownBulkPatch {
  categoryId?: string | null;
  priority?: CountdownPriority;
  addTags?: string[];
  archived?: boolean;
}

export class CountdownEventConflictError extends Error {
  constructor(public readonly latest: CountdownEventRecord) {
    super("该纪念日已在其他窗口被修改，请重新加载或明确覆盖。");
    this.name = "CountdownEventConflictError";
  }
}

const EVENT_KIND_SET = new Set<string>(COUNTDOWN_EVENT_KINDS);
const ICON_SET = new Set<string>(COUNTDOWN_ICON_ALLOWLIST);
const PRIORITIES = new Set<string>(["high", "normal", "low"]);
const COUNT_MODES = new Set<string>(["auto", "anniversary", "age", "none"]);
const BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function nowIso(): string {
  return new Date().toISOString();
}
function finiteCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}
function id(prefix: "countdown" | "countdown-category"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function enumValue<T extends string>(
  value: unknown,
  choices: Set<string>,
  fallback: T,
): T {
  return typeof value === "string" && choices.has(value)
    ? (value as T)
    : fallback;
}
function cleanOptional(
  value: unknown,
  validator?: (value: string) => boolean,
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const result = value.trim();
  if (validator && !validator(result)) throw new Error(`字段值无效：${result}`);
  return result;
}
function strictDate(value: unknown): string | undefined {
  const date = cleanOptional(value);
  if (!date) return undefined;
  if (!DATE_RE.test(date)) throw new Error("纪念日公历日期格式无效");
  const [year, month, day] = date.split("-").map(Number);
  const local = new Date(year, month - 1, day);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  )
    throw new Error("纪念日公历日期无效");
  return date;
}
function normalizeTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("纪念日标签结构无效");
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .map((item) => item.slice(0, 40)),
    ),
  ].slice(0, 50);
}
function normalizeLunarDate(value: unknown): CountdownEventRecord["lunarDate"] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const lunar = value as Record<string, unknown>;
  const year = Number(lunar.year);
  const month = Number(lunar.month);
  const day = Number(lunar.day);
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 30
  )
    throw new Error("纪念日农历日期无效");
  return { year, month, day, isLeapMonth: lunar.isLeapMonth === true };
}

export function normalizeCountdownEvent(
  input: CountdownEventInput,
  order = 0,
  legacy = false,
): CountdownEventRecord {
  if (!input || typeof input !== "object") throw new Error("纪念日记录无效");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("纪念日名称不能为空");
  const kind = enumValue<CountdownEventKind>(
    input.kind,
    EVENT_KIND_SET,
    input.anniversary ? "anniversary" : "custom",
  );
  const calendar = input.calendar === "lunar" ? "lunar" : "solar";
  const recurrence =
    input.recurrence === "yearly" || (legacy && input.anniversary)
      ? "yearly"
      : "none";
  const date = strictDate(input.date);
  const lunarDate = normalizeLunarDate(input.lunarDate);
  if (calendar === "solar" && !date) throw new Error("公历纪念日必须填写日期");
  if (calendar === "lunar" && !lunarDate)
    throw new Error("农历纪念日必须填写农历日期");
  const note = typeof input.note === "string" ? input.note.slice(0, 2000) : "";
  const icon = enumValue<CountdownIconName>(
    input.icon,
    ICON_SET,
    defaultIconForKind(kind),
  );
  return {
    id:
      typeof input.id === "string" && input.id.trim()
        ? input.id.trim()
        : id("countdown"),
    name,
    kind,
    calendar,
    recurrence,
    ...(date ? { date } : {}),
    ...(lunarDate ? { lunarDate } : {}),
    solarLeapDayPolicy:
      input.solarLeapDayPolicy === "mar1" || input.solarLeapDayPolicy === "skip"
        ? input.solarLeapDayPolicy
        : "feb28",
    lunarLeapMonthPolicy:
      input.lunarLeapMonthPolicy === "regular-fallback"
        ? "regular-fallback"
        : "exact",
    lunarMissingDayPolicy:
      input.lunarMissingDayPolicy === "skip" ? "skip" : "last-day",
    countLabelMode: enumValue<CountdownCountLabelMode>(
      input.countLabelMode,
      COUNT_MODES,
      "auto",
    ),
    categoryId: cleanOptional(input.categoryId),
    tags: normalizeTags(input.tags),
    priority: enumValue<CountdownPriority>(
      input.priority,
      PRIORITIES,
      "normal",
    ),
    icon,
    color: cleanOptional(input.color, (value) => COLOR_RE.test(value)),
    note,
    linkedBlockId: cleanOptional(input.linkedBlockId, (value) =>
      BLOCK_ID_RE.test(value),
    ),
    pastBehavior:
      input.pastBehavior === "auto-archive" ? "auto-archive" : "keep",
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : order,
    createdAt:
      typeof input.createdAt === "string" && input.createdAt
        ? input.createdAt
        : nowIso(),
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt
        ? input.updatedAt
        : nowIso(),
    archived: input.archived === true,
  };
}

function normalizeCategory(
  input: CountdownCategoryInput,
  order = 0,
): CountdownCategoryRecord {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("分类名称不能为空");
  return {
    id:
      typeof input.id === "string" && input.id.trim()
        ? input.id.trim()
        : id("countdown-category"),
    name: name.slice(0, 40),
    icon: enumValue<CountdownIconName>(input.icon, ICON_SET, "bookmark"),
    color: cleanOptional(input.color, (v) => COLOR_RE.test(v)),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : order,
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    archived: input.archived === true,
  };
}

export function createEmptyCountdownEventsFile(): CountdownEventsFile {
  return {
    schema: COUNTDOWN_EVENTS_SCHEMA,
    version: COUNTDOWN_EVENTS_VERSION,
    revision: 0,
    updatedAt: nowIso(),
    categories: [],
    events: [],
  };
}

export function normalizeCountdownEventsFile(
  raw: unknown,
): CountdownEventsFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("纪念日数据结构无效");
  const value = raw as Record<string, unknown>;
  if (value.schema !== COUNTDOWN_EVENTS_SCHEMA)
    throw new Error("纪念日数据 schema 不受支持");
  if (value.version !== 1 && value.version !== COUNTDOWN_EVENTS_VERSION)
    throw new Error("纪念日数据 version 不受支持");
  if (!Array.isArray(value.events)) throw new Error("纪念日列表无效");
  if (
    value.version === COUNTDOWN_EVENTS_VERSION &&
    !Array.isArray(value.categories)
  )
    throw new Error("纪念日分类列表无效");
  const legacy = value.version === 1;
  const events = value.events.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("纪念日记录无效");
    const event = item as Record<string, unknown>;
    if (
      typeof event.id !== "string" ||
      !event.id.trim() ||
      typeof event.name !== "string"
    )
      throw new Error("纪念日关键字段无效");
    return normalizeCountdownEvent(
      event as unknown as CountdownEventInput,
      index,
      legacy,
    );
  });
  const categories = legacy
    ? []
    : (value.categories as unknown[]).map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          throw new Error("纪念日分类记录无效");
        return normalizeCategory(item as CountdownCategoryInput, index);
      });
  return {
    schema: COUNTDOWN_EVENTS_SCHEMA,
    version: COUNTDOWN_EVENTS_VERSION,
    revision: finiteCount(value.revision),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    categories,
    events,
    migration: value.migration as CountdownEventsFile["migration"],
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [
        key,
        stableValue((value as Record<string, unknown>)[key]),
      ]),
  );
}
function comparable(value: unknown): string {
  return JSON.stringify(stableValue(value));
}
export function sameCountdownEvent(
  left: CountdownEventRecord,
  right: CountdownEventRecord,
): boolean {
  return (
    comparable(normalizeCountdownEvent(left, left.order)) ===
    comparable(normalizeCountdownEvent(right, right.order))
  );
}
export function validateCountdownEventRecords(
  actual: CountdownEventRecord[],
  expected: CountdownEventRecord[],
  message = "纪念日写入后业务数据校验失败",
): void {
  const map = new Map(actual.map((event) => [event.id, event]));
  if (
    actual.length !== expected.length ||
    map.size !== actual.length ||
    expected.some(
      (event) =>
        !map.has(event.id) || !sameCountdownEvent(map.get(event.id)!, event),
    )
  )
    throw new Error(message);
}
function validateFile(
  actual: CountdownEventsFile,
  expected: CountdownEventsFile,
): void {
  validateCountdownEventRecords(actual.events, expected.events);
  if (comparable(actual.categories) !== comparable(expected.categories))
    throw new Error("纪念日分类写入后校验失败");
}

export function mergeCountdownEvents(
  ...lists: Array<CountdownEventInput[] | undefined | null>
): CountdownEventRecord[] {
  const map = new Map<string, CountdownEventRecord>();
  let order = 0;
  for (const list of lists)
    for (const input of list || []) {
      try {
        const event = normalizeCountdownEvent(input, order++, !input.kind);
        const key =
          input.id?.trim() ||
          `${event.name}|${event.date || JSON.stringify(event.lunarDate)}|${event.recurrence}`;
        const old = map.get(key);
        if (!old || event.updatedAt > old.updatedAt) map.set(key, event);
      } catch {
        /* invalid legacy row is ignored before persistent migration */
      }
    }
  return [...map.values()]
    .sort((a, b) => a.order - b.order)
    .map((event, index) => ({ ...event, order: index }));
}

async function migrateV1IfNeeded(): Promise<void> {
  const raw = await loadSharedRawJson(COUNTDOWN_EVENTS_FILE);
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    (raw as Record<string, unknown>).version !== 1
  )
    return;
  const normalized = normalizeCountdownEventsFile(raw);
  normalized.revision += 1;
  normalized.updatedAt = nowIso();
  await saveSharedJsonChecked(
    "countdown",
    COUNTDOWN_EVENTS_FILE,
    normalized,
    normalizeCountdownEventsFile,
    validateFile,
  );
}

async function loadFileUnlocked(): Promise<CountdownEventsFile> {
  return (
    (await loadSharedJson(
      COUNTDOWN_EVENTS_FILE,
      normalizeCountdownEventsFile,
    )) || createEmptyCountdownEventsFile()
  );
}

export async function getCountdownStoreStatus(): Promise<CountdownStoreStatus> {
  try {
    await assertSharedWidgetMigrationReady("countdown");
    const file = await loadSharedJson(
      COUNTDOWN_EVENTS_FILE,
      normalizeCountdownEventsFile,
    );
    if (file?.migration?.status === "failed")
      return {
        ok: false,
        missingFields: [],
        message: "旧数据迁移尚未完成，请重新加载插件后重试。",
      };
    return {
      ok: true,
      missingFields: [],
      message:
        file?.migration?.cleanupStatus === "pending"
          ? "旧数据库清理待重试"
          : "本地数据已就绪",
    };
  } catch (error) {
    return {
      ok: false,
      missingFields: [],
      message: error instanceof Error ? error.message : "本地存储不可用",
    };
  }
}

export async function loadCountdownCenterData(
  options: { includeArchived?: boolean } = {},
): Promise<CountdownCenterLoadResult> {
  await assertSharedWidgetMigrationReady("countdown");
  await runSharedWidgetExclusive(
    COUNTDOWN_STORE_TRANSACTION_LOCK,
    migrateV1IfNeeded,
  );
  const file = await loadFileUnlocked();
  const includeArchived = options.includeArchived === true;
  return {
    file,
    events: file.events
      .filter((event) => includeArchived || !event.archived)
      .sort((a, b) => a.order - b.order),
    categories: file.categories
      .filter((category) => includeArchived || !category.archived)
      .sort((a, b) => a.order - b.order),
    revision: file.revision,
    status: { ok: true, missingFields: [], message: "本地数据已就绪" },
  };
}
export async function loadCountdownEvents(): Promise<CountdownLoadResult> {
  return loadCountdownCenterData();
}
export function createCountdownEditSnapshot(
  result: CountdownLoadResult,
): CountdownEditSnapshot {
  return {
    initialEvents: structuredClone(result.events),
    initialEventIds: result.events.map((event) => event.id),
    baseRevision: result.revision,
  };
}
export function createCountdownEventDraft(
  kind: CountdownEventKind = "custom",
): CountdownEventInput {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    name: "",
    kind,
    calendar: "solar",
    recurrence:
      kind === "birthday" || kind === "anniversary" ? "yearly" : "none",
    date,
    solarLeapDayPolicy: "feb28",
    lunarLeapMonthPolicy: "exact",
    lunarMissingDayPolicy: "last-day",
    countLabelMode: "auto",
    tags: [],
    priority: "normal",
    icon: defaultIconForKind(kind),
    note: "",
    pastBehavior: "keep",
  };
}

async function mutateFile(
  mutator: (file: CountdownEventsFile) => void | Promise<void>,
): Promise<CountdownEventsFile> {
  return runSharedWidgetExclusive(COUNTDOWN_STORE_TRANSACTION_LOCK, () =>
    mutateSharedJson({
      store: "countdown",
      path: COUNTDOWN_EVENTS_FILE,
      createEmpty: createEmptyCountdownEventsFile,
      normalize: normalizeCountdownEventsFile,
      mutate: mutator,
      validate: validateFile,
    }),
  );
}

export async function saveCountdownEvent(
  draft: CountdownEventInput,
  snapshot?: CountdownEventEditSnapshot,
  options: { force?: boolean } = {},
): Promise<CountdownEventRecord> {
  await assertSharedWidgetMigrationReady("countdown");
  let result!: CountdownEventRecord;
  await mutateFile((file) => {
    const index = draft.id
      ? file.events.findIndex((event) => event.id === draft.id)
      : -1;
    const latest = index >= 0 ? file.events[index] : undefined;
    if (
      latest &&
      snapshot?.original &&
      latest.updatedAt !== snapshot.original.updatedAt &&
      !options.force
    )
      throw new CountdownEventConflictError(latest);
    const now = nowIso();
    result = normalizeCountdownEvent(
      {
        ...latest,
        ...draft,
        createdAt: latest?.createdAt || now,
        updatedAt: now,
      },
      index >= 0 ? latest!.order : file.events.length,
    );
    if (index >= 0) file.events[index] = result;
    else file.events.push(result);
  });
  return result;
}
export const upsertCountdownEvent = saveCountdownEvent;

async function setArchive(eventId: string, archived: boolean): Promise<void> {
  await assertSharedWidgetMigrationReady("countdown");
  await mutateFile((file) => {
    const event = file.events.find((item) => item.id === eventId);
    if (!event) throw new Error("纪念日不存在或已被删除");
    event.archived = archived;
    event.updatedAt = nowIso();
  });
}
export function archiveCountdownEvent(eventId: string): Promise<void> {
  return setArchive(eventId, true);
}
export function restoreCountdownEvent(eventId: string): Promise<void> {
  return setArchive(eventId, false);
}
export async function deleteCountdownEventPermanently(
  eventId: string,
): Promise<void> {
  await assertSharedWidgetMigrationReady("countdown");
  await mutateFile((file) => {
    const before = file.events.length;
    file.events = file.events.filter((event) => event.id !== eventId);
    if (before === file.events.length)
      throw new Error("纪念日不存在或已被删除");
  });
}

export async function reorderCountdownEvents(
  eventIds: string[],
): Promise<void> {
  await assertSharedWidgetMigrationReady("countdown");
  await mutateFile((file) => {
    const targetIds = new Set(eventIds);
    if (targetIds.size !== eventIds.length)
      throw new Error("排序事件 ID 不能重复");
    const byId = new Map(file.events.map((event) => [event.id, event]));
    const missing = eventIds.filter((eventId) => !byId.has(eventId));
    if (missing.length)
      throw new Error(`排序事件不存在：${missing.join("、")}`);

    const globallyOrdered = file.events
      .map((event, index) => ({ event, index }))
      .sort((left, right) =>
        left.event.order !== right.event.order
          ? left.event.order - right.event.order
          : left.index - right.index,
      )
      .map((item) => item.event);
    const targetPositions = globallyOrdered
      .map((event, index) => (targetIds.has(event.id) ? index : -1))
      .filter((index) => index >= 0);
    eventIds.forEach((eventId, index) => {
      globallyOrdered[targetPositions[index]] = byId.get(eventId)!;
    });
    globallyOrdered.forEach((event, index) => {
      event.order = index;
    });
    file.events = globallyOrdered;
  });
}
export async function bulkUpdateCountdownEvents(
  eventIds: string[],
  patch: CountdownBulkPatch,
): Promise<void> {
  await assertSharedWidgetMigrationReady("countdown");
  const ids = new Set(eventIds);
  await mutateFile((file) => {
    for (const event of file.events)
      if (ids.has(event.id)) {
        if (patch.categoryId !== undefined)
          event.categoryId = patch.categoryId || undefined;
        if (patch.priority) event.priority = patch.priority;
        if (patch.addTags)
          event.tags = normalizeTags([...event.tags, ...patch.addTags]);
        if (patch.archived !== undefined) event.archived = patch.archived;
        event.updatedAt = nowIso();
      }
  });
}

export async function createCountdownCategory(
  input: CountdownCategoryInput,
): Promise<CountdownCategoryRecord> {
  await assertSharedWidgetMigrationReady("countdown");
  let result!: CountdownCategoryRecord;
  await mutateFile((file) => {
    result = normalizeCategory(input, file.categories.length);
    if (
      file.categories.some(
        (category) => !category.archived && category.name === result.name,
      )
    )
      throw new Error("分类名称已存在");
    file.categories.push(result);
  });
  return result;
}
export async function updateCountdownCategory(
  categoryId: string,
  input: Partial<CountdownCategoryInput>,
): Promise<CountdownCategoryRecord> {
  await assertSharedWidgetMigrationReady("countdown");
  let result!: CountdownCategoryRecord;
  await mutateFile((file) => {
    const index = file.categories.findIndex(
      (category) => category.id === categoryId,
    );
    if (index < 0) throw new Error("分类不存在");
    result = normalizeCategory(
      {
        ...file.categories[index],
        ...input,
        name: input.name ?? file.categories[index].name,
        updatedAt: nowIso(),
      },
      file.categories[index].order,
    );
    if (
      file.categories.some(
        (category) =>
          category.id !== categoryId &&
          !category.archived &&
          category.name === result.name,
      )
    )
      throw new Error("分类名称已存在");
    file.categories[index] = result;
  });
  return result;
}
async function setCategoryArchive(
  categoryId: string,
  archived: boolean,
): Promise<void> {
  await assertSharedWidgetMigrationReady("countdown");
  await mutateFile((file) => {
    const category = file.categories.find((item) => item.id === categoryId);
    if (!category) throw new Error("分类不存在");
    category.archived = archived;
    category.updatedAt = nowIso();
  });
}
export function archiveCountdownCategory(categoryId: string): Promise<void> {
  return setCategoryArchive(categoryId, true);
}
export function restoreCountdownCategory(categoryId: string): Promise<void> {
  return setCategoryArchive(categoryId, false);
}
export async function deleteCountdownCategory(
  categoryId: string,
  moveToCategoryId?: string,
): Promise<void> {
  await assertSharedWidgetMigrationReady("countdown");
  await mutateFile((file) => {
    if (
      moveToCategoryId &&
      !file.categories.some(
        (category) => category.id === moveToCategoryId && !category.archived,
      )
    )
      throw new Error("目标分类不存在");
    for (const event of file.events)
      if (event.categoryId === categoryId) {
        event.categoryId = moveToCategoryId;
        event.updatedAt = nowIso();
      }
    file.categories = file.categories.filter(
      (category) => category.id !== categoryId,
    );
  });
}
export async function reorderCountdownCategories(
  categoryIds: string[],
): Promise<void> {
  await assertSharedWidgetMigrationReady("countdown");
  await mutateFile((file) => {
    const order = new Map(
      categoryIds.map((categoryId, index) => [categoryId, index]),
    );
    file.categories
      .sort(
        (a, b) =>
          (order.get(a.id) ?? categoryIds.length + a.order) -
          (order.get(b.id) ?? categoryIds.length + b.order),
      )
      .forEach((category, index) => {
        category.order = index;
      });
  });
}

export async function runCountdownAutoArchiveMaintenance(
  anchor = new Date(),
): Promise<number> {
  await assertSharedWidgetMigrationReady("countdown");
  let count = 0;
  await mutateFile((file) => {
    for (const event of file.events) {
      if (
        event.archived ||
        event.recurrence !== "none" ||
        event.pastBehavior !== "auto-archive"
      )
        continue;
      const occurrence = resolveCountdownOccurrence(event, anchor);
      if (occurrence?.status === "expired") {
        event.archived = true;
        event.updatedAt = nowIso();
        count += 1;
      }
    }
  });
  return count;
}

export async function replaceCountdownEventsFile(
  next: CountdownEventsFile,
): Promise<CountdownEventsFile> {
  await assertSharedWidgetMigrationReady("countdown");
  const normalized = normalizeCountdownEventsFile(next);
  return runSharedWidgetExclusive(
    COUNTDOWN_STORE_TRANSACTION_LOCK,
    async () => {
      const current = await loadFileUnlocked();
      normalized.revision = current.revision + 1;
      normalized.updatedAt = nowIso();
      return saveSharedJsonChecked(
        "countdown",
        COUNTDOWN_EVENTS_FILE,
        normalized,
        normalizeCountdownEventsFile,
        validateFile,
      );
    },
  );
}

export async function saveCountdownEvents(
  events: CountdownEventInput[],
  snapshot?: CountdownEditSnapshot,
): Promise<CountdownEventRecord[]> {
  await assertSharedWidgetMigrationReady("countdown");
  const normalized = events
    .filter((event) => event?.name?.trim())
    .map((event, index) => normalizeCountdownEvent(event, index, !event.kind));
  const draftIds = new Set(normalized.map((event) => event.id));
  const file = await mutateFile((current) => {
    const latest = new Map(current.events.map((event) => [event.id, event]));
    const now = nowIso();
    for (const event of normalized)
      latest.set(event.id, {
        ...latest.get(event.id),
        ...event,
        updatedAt: now,
        archived: false,
      });
    for (const eventId of snapshot?.initialEventIds || [])
      if (!draftIds.has(eventId) && latest.has(eventId))
        latest.set(eventId, {
          ...latest.get(eventId)!,
          archived: true,
          updatedAt: now,
        });
    current.events = [...latest.values()].map((event, index) => ({
      ...event,
      order: index,
    }));
  });
  return file.events
    .filter((event) => !event.archived)
    .sort((a, b) => a.order - b.order);
}
