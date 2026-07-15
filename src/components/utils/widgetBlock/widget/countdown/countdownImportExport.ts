import {
  loadCountdownCenterData,
  COUNTDOWN_EVENT_KINDS,
  COUNTDOWN_ICON_ALLOWLIST,
  normalizeCountdownEvent,
  normalizeCountdownEventsFile,
  replaceCountdownEventsFile,
  type CountdownEventRecord,
  type CountdownEventsFile,
} from "./countdownData";
import {
  loadCountdownCenterSettings,
  normalizeCountdownCenterSettings,
  saveCountdownCenterSettings,
  type CountdownCenterSettingsFile,
} from "./countdownCenterSettings";
import {
  loadCountdownNotifySettings,
  parseCountdownNotifySettingsBackup,
  saveCountdownNotifySettings,
} from "@/features/countdown-notify/countdown-notify-settings-store";
import type { CountdownNotifySettings } from "@/features/countdown-notify/types";

export interface CountdownCenterBackup {
  schema: "siyuan-homepage-countdown-center-backup";
  version: 1;
  exportedAt: string;
  eventsFile: CountdownEventsFile;
  centerSettings?: CountdownCenterSettingsFile;
  notificationSettings?: CountdownNotifySettings;
}
export interface CountdownImportPreview {
  added: number;
  updated: number;
  conflicts: number;
  categories: number;
  total: number;
}
export interface CountdownCsvParseResult {
  events: CountdownEventRecord[];
  errors: Array<{ line: number; message: string }>;
  protectedExistingIds: string[];
}
export interface CountdownCsvImportPreview {
  added: number;
  updated: number;
  conflicts: number;
  total: number;
}

export async function createCountdownCenterBackup(
  includeNotifications = false,
): Promise<CountdownCenterBackup> {
  const data = await loadCountdownCenterData({ includeArchived: true });
  const centerSettings = await loadCountdownCenterSettings();
  const backup: CountdownCenterBackup = {
    schema: "siyuan-homepage-countdown-center-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    eventsFile: structuredClone(data.file),
    centerSettings: structuredClone(centerSettings),
  };
  if (includeNotifications)
    backup.notificationSettings = await loadCountdownNotifySettings();
  return backup;
}
export function serializeCountdownBackup(
  backup: CountdownCenterBackup,
): string {
  return JSON.stringify(backup, null, 2);
}
export function parseCountdownBackup(
  text: string,
  options: { includeNotifications?: boolean } = {},
): CountdownCenterBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("JSON 文件无法解析");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("备份结构无效");
  const value = raw as Record<string, unknown>;
  if (
    value.schema !== "siyuan-homepage-countdown-center-backup" ||
    value.version !== 1
  )
    throw new Error("备份 schema 或 version 不受支持");
  const includeNotifications = options.includeNotifications === true;
  if (
    includeNotifications &&
    !Object.prototype.hasOwnProperty.call(value, "notificationSettings")
  )
    throw new Error("备份中不包含通知设置");
  return {
    schema: "siyuan-homepage-countdown-center-backup",
    version: 1,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    eventsFile: normalizeCountdownEventsFile(value.eventsFile),
    centerSettings: Object.prototype.hasOwnProperty.call(
      value,
      "centerSettings",
    )
      ? normalizeCountdownCenterSettings(value.centerSettings)
      : undefined,
    notificationSettings: includeNotifications
      ? parseCountdownNotifySettingsBackup(value.notificationSettings)
      : undefined,
  };
}
export function previewCountdownImport(
  current: CountdownEventsFile,
  incoming: CountdownEventsFile,
): CountdownImportPreview {
  const currentById = new Map(current.events.map((event) => [event.id, event]));
  let added = 0;
  let updated = 0;
  let conflicts = 0;
  for (const event of incoming.events) {
    const existing = currentById.get(event.id);
    if (!existing) added += 1;
    else if (JSON.stringify(existing) !== JSON.stringify(event)) {
      updated += 1;
      if (existing.updatedAt > event.updatedAt) conflicts += 1;
    }
  }
  return {
    added,
    updated,
    conflicts,
    categories: incoming.categories.length,
    total: incoming.events.length,
  };
}
export async function importCountdownBackup(
  backup: CountdownCenterBackup,
  mode: "merge" | "replace",
  includeNotifications = false,
): Promise<CountdownImportPreview> {
  const currentData = await loadCountdownCenterData({ includeArchived: true });
  const currentSettings = backup.centerSettings
    ? await loadCountdownCenterSettings()
    : undefined;
  if (includeNotifications && !backup.notificationSettings)
    throw new Error("备份中不包含通知设置");
  const currentNotifications =
    includeNotifications && backup.notificationSettings
      ? await loadCountdownNotifySettings()
      : undefined;
  const preview = previewCountdownImport(currentData.file, backup.eventsFile);
  let next = backup.eventsFile;
  if (mode === "merge") {
    const categories = new Map(
      currentData.file.categories.map((item) => [item.id, item]),
    );
    for (const category of backup.eventsFile.categories) {
      const old = categories.get(category.id);
      if (!old || category.updatedAt >= old.updatedAt)
        categories.set(category.id, category);
    }
    const events = new Map(
      currentData.file.events.map((item) => [item.id, item]),
    );
    for (const event of backup.eventsFile.events) {
      const old = events.get(event.id);
      if (!old || event.updatedAt >= old.updatedAt) events.set(event.id, event);
    }
    next = {
      ...backup.eventsFile,
      categories: [...categories.values()],
      events: [...events.values()],
    };
  }
  try {
    await replaceCountdownEventsFile(next);
    if (backup.centerSettings)
      await saveCountdownCenterSettings(backup.centerSettings);
    if (includeNotifications && backup.notificationSettings)
      await saveCountdownNotifySettings(backup.notificationSettings);
    return preview;
  } catch (error) {
    try {
      await replaceCountdownEventsFile(currentData.file);
      if (currentSettings) await saveCountdownCenterSettings(currentSettings);
      if (currentNotifications)
        await saveCountdownNotifySettings(currentNotifications);
    } catch (rollbackError) {
      throw new Error(
        `导入失败且回滚未完全成功：${error instanceof Error ? error.message : String(error)}；${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      );
    }
    throw error;
  }
}

const CSV_FIELDS = [
  "id",
  "name",
  "kind",
  "calendar",
  "recurrence",
  "solarDate",
  "lunarYear",
  "lunarMonth",
  "lunarDay",
  "isLeapMonth",
  "category",
  "tags",
  "priority",
  "icon",
  "color",
  "solarLeapDayPolicy",
  "lunarLeapMonthPolicy",
  "lunarMissingDayPolicy",
  "countLabelMode",
  "note",
  "linkedBlockId",
  "pastBehavior",
  "archived",
  "createdAt",
  "updatedAt",
] as const;
function quote(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function exportCountdownCsv(file: CountdownEventsFile): string {
  const categoryNames = new Map(
    file.categories.map((category) => [category.id, category.name]),
  );
  const rows = file.events.map((event) =>
    [
      event.id,
      event.name,
      event.kind,
      event.calendar,
      event.recurrence,
      event.date || "",
      event.lunarDate?.year || "",
      event.lunarDate?.month || "",
      event.lunarDate?.day || "",
      event.lunarDate?.isLeapMonth ? "true" : "false",
      event.categoryId ? categoryNames.get(event.categoryId) || "" : "",
      event.tags.join("|"),
      event.priority,
      event.icon,
      event.color || "",
      event.solarLeapDayPolicy,
      event.lunarLeapMonthPolicy,
      event.lunarMissingDayPolicy,
      event.countLabelMode,
      event.note,
      event.linkedBlockId || "",
      event.pastBehavior,
      event.archived ? "true" : "false",
      event.createdAt,
      event.updatedAt,
    ]
      .map(quote)
      .join(","),
  );
  return `\uFEFF${CSV_FIELDS.join(",")}\r\n${rows.join("\r\n")}`;
}

function parseRows(text: string): Array<{ line: number; fields: string[] }> {
  const rows: Array<{ line: number; fields: string[] }> = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else {
        field += char;
        if (char === "\n") line += 1;
      }
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      fields.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      fields.push(field);
      rows.push({ line: rowLine, fields });
      fields = [];
      field = "";
      line += 1;
      rowLine = line;
    } else field += char;
  }
  if (quoted) throw new Error(`CSV 第 ${rowLine} 行引号未闭合`);
  if (field || fields.length) {
    fields.push(field);
    rows.push({ line: rowLine, fields });
  }
  return rows;
}
export function parseCountdownCsv(
  text: string,
  categories: CountdownEventsFile["categories"] = [],
  existingEvents: CountdownEventRecord[] = [],
): CountdownCsvParseResult {
  const rows = parseRows(text);
  if (!rows.length) throw new Error("CSV 文件为空");
  const headers = rows[0].fields.map((field) => field.trim());
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV 表头包含重复字段");
  for (const required of ["name", "calendar", "recurrence"])
    if (!headers.includes(required))
      throw new Error(`CSV 缺少字段：${required}`);
  const categoryIds = new Map(
    categories.map((category) => [category.name, category.id]),
  );
  const existingById = new Map(existingEvents.map((event) => [event.id, event]));
  const has = (field: string): boolean => headers.includes(field);
  const enumValue = <T extends string>(
    row: Record<string, string>,
    field: string,
    allowed: readonly T[],
    fallback: T | undefined,
    requiredWhenPresent = true,
  ): T | undefined => {
    if (!has(field)) return fallback;
    const candidate = (row[field] ?? "").trim();
    if (!candidate) {
      if (requiredWhenPresent) throw new Error(`${field} 字段不能为空`);
      return fallback;
    }
    if (!allowed.includes(candidate as T))
      throw new Error(`${field} 字段值无效：${candidate}`);
    return candidate as T;
  };
  const booleanValue = (
    row: Record<string, string>,
    field: string,
    fallback: boolean,
  ): boolean => {
    if (!has(field)) return fallback;
    const candidate = (row[field] ?? "").trim().toLowerCase();
    if (candidate === "true") return true;
    if (candidate === "false") return false;
    throw new Error(`${field} 字段只允许 true 或 false`);
  };
  const isoValue = (
    row: Record<string, string>,
    field: "createdAt" | "updatedAt",
    fallback: string | undefined,
  ): { value: string | undefined; supplied: boolean } => {
    if (!has(field)) return { value: fallback, supplied: false };
    const candidate = (row[field] ?? "").trim();
    if (!candidate) return { value: fallback, supplied: false };
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        candidate,
      ) ||
      !Number.isFinite(Date.parse(candidate))
    )
      throw new Error(`${field} 字段不是有效 ISO 时间：${candidate}`);
    return { value: candidate, supplied: true };
  };
  const events: CountdownEventRecord[] = [];
  const parsedIds = new Set<string>();
  const protectedExistingIds: string[] = [];
  const errors: CountdownCsvParseResult["errors"] = [];
  for (const row of rows.slice(1)) {
    if (row.fields.every((field) => !field.trim())) continue;
    const value = Object.fromEntries(
      headers.map((header, index) => [header, row.fields[index] ?? ""]),
    );
    try {
      const id = (value.id ?? "").trim();
      const existing = id ? existingById.get(id) : undefined;
      const name = (value.name ?? "").trim();
      if (!name) throw new Error("name 字段不能为空");
      const calendar = enumValue(
        value,
        "calendar",
        ["solar", "lunar"] as const,
        existing?.calendar,
      )!;
      const recurrence = enumValue(
        value,
        "recurrence",
        ["none", "yearly"] as const,
        existing?.recurrence,
      )!;
      const categoryName = has("category")
        ? (value.category ?? "").trim()
        : undefined;
      if (categoryName && !categoryIds.has(categoryName))
        throw new Error(`category 字段分类不存在：${categoryName}`);
      const categoryId = has("category")
        ? categoryName
          ? categoryIds.get(categoryName)
          : undefined
        : existing?.categoryId;
      const color = has("color")
        ? value.color.trim() || undefined
        : existing?.color;
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color))
        throw new Error(`color 字段值无效：${color}`);
      const isLeapMonth = booleanValue(
        value,
        "isLeapMonth",
        existing?.lunarDate?.isLeapMonth ?? false,
      );
      const lunar =
        calendar === "lunar"
          ? {
              year: has("lunarYear")
                ? Number(value.lunarYear)
                : Number(existing?.lunarDate?.year),
              month: has("lunarMonth")
                ? Number(value.lunarMonth)
                : Number(existing?.lunarDate?.month),
              day: has("lunarDay")
                ? Number(value.lunarDay)
                : Number(existing?.lunarDate?.day),
              isLeapMonth,
            }
          : undefined;
      const createdAt = isoValue(
        value,
        "createdAt",
        existing?.createdAt,
      );
      const updatedAt = isoValue(
        value,
        "updatedAt",
        existing?.updatedAt,
      );
      const input = {
        id: id || undefined,
        name,
        kind: enumValue(
          value,
          "kind",
          COUNTDOWN_EVENT_KINDS,
          existing?.kind,
        ),
        calendar,
        recurrence,
        date: has("solarDate")
          ? value.solarDate.trim() || undefined
          : existing?.date,
        lunarDate: lunar,
        categoryId,
        tags: has("tags")
          ? value.tags
            ? value.tags.split("|")
            : []
          : (existing?.tags ?? []),
        priority: enumValue(
          value,
          "priority",
          ["high", "normal", "low"] as const,
          existing?.priority,
        ),
        icon: enumValue(
          value,
          "icon",
          COUNTDOWN_ICON_ALLOWLIST,
          existing?.icon,
        ),
        color,
        solarLeapDayPolicy: enumValue(
          value,
          "solarLeapDayPolicy",
          ["feb28", "mar1", "skip"] as const,
          existing?.solarLeapDayPolicy,
        ),
        lunarLeapMonthPolicy: enumValue(
          value,
          "lunarLeapMonthPolicy",
          ["exact", "regular-fallback"] as const,
          existing?.lunarLeapMonthPolicy,
        ),
        lunarMissingDayPolicy: enumValue(
          value,
          "lunarMissingDayPolicy",
          ["last-day", "skip"] as const,
          existing?.lunarMissingDayPolicy,
        ),
        countLabelMode: enumValue(
          value,
          "countLabelMode",
          ["auto", "anniversary", "age", "none"] as const,
          existing?.countLabelMode,
        ),
        note: has("note") ? value.note : existing?.note,
        linkedBlockId: has("linkedBlockId")
          ? value.linkedBlockId.trim() || undefined
          : existing?.linkedBlockId,
        pastBehavior: enumValue(
          value,
          "pastBehavior",
          ["keep", "auto-archive"] as const,
          existing?.pastBehavior,
        ),
        archived: booleanValue(
          value,
          "archived",
          existing?.archived === true,
        ),
        createdAt: createdAt.value,
        updatedAt: updatedAt.value,
      };
      const normalized = normalizeCountdownEvent(input, events.length);
      const result = existing && !updatedAt.supplied
        ? structuredClone(existing)
        : normalized;
      if (existing && !updatedAt.supplied)
        protectedExistingIds.push(existing.id);
      if (parsedIds.has(result.id))
        throw new Error(`id 字段重复：${result.id}`);
      parsedIds.add(result.id);
      events.push(result);
    } catch (error) {
      errors.push({
        line: row.line,
        message: error instanceof Error ? error.message : "无效记录",
      });
    }
  }
  return { events, errors, protectedExistingIds };
}

function isoTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
function prepareCountdownCsvImport(
  current: CountdownEventsFile,
  parsed: CountdownCsvParseResult,
  mode: "merge" | "replace",
): { next: CountdownEventsFile; preview: CountdownCsvImportPreview } {
  const incoming = parsed.events;
  const protectedIds = new Set(parsed.protectedExistingIds);
  const currentById = new Map(current.events.map((event) => [event.id, event]));
  let added = 0;
  let updated = 0;
  let conflicts = 0;
  if (mode === "replace") {
    for (const event of incoming) {
      if (currentById.has(event.id)) updated += 1;
      else added += 1;
    }
    return {
      next: { ...current, events: structuredClone(incoming) },
      preview: { added, updated, conflicts, total: incoming.length },
    };
  }
  const merged = new Map(current.events.map((event) => [event.id, event]));
  for (const event of incoming) {
    const existing = currentById.get(event.id);
    if (!existing) {
      added += 1;
      merged.set(event.id, event);
      continue;
    }
    if (protectedIds.has(event.id)) {
      conflicts += 1;
      continue;
    }
    const incomingTime = isoTimestamp(event.updatedAt);
    const existingTime = isoTimestamp(existing.updatedAt);
    if (
      incomingTime !== null &&
      existingTime !== null &&
      incomingTime > existingTime
    ) {
      updated += 1;
      merged.set(event.id, event);
    } else if (JSON.stringify(existing) !== JSON.stringify(event)) {
      conflicts += 1;
    }
  }
  return {
    next: { ...current, events: [...merged.values()] },
    preview: { added, updated, conflicts, total: incoming.length },
  };
}
export function previewCountdownCsvImport(
  current: CountdownEventsFile,
  parsed: CountdownCsvParseResult,
  mode: "merge" | "replace",
): CountdownCsvImportPreview {
  validateParsedCountdownCsv(parsed);
  return prepareCountdownCsvImport(current, parsed, mode).preview;
}
function validateParsedCountdownCsv(parsed: CountdownCsvParseResult): void {
  if (parsed.errors.length)
    throw new Error("CSV 存在解析错误，未写入任何数据");
  const ids = new Set<string>();
  for (const [index, event] of parsed.events.entries()) {
    normalizeCountdownEvent(event, index);
    if (ids.has(event.id)) throw new Error(`CSV 事件 ID 重复：${event.id}`);
    ids.add(event.id);
    if (isoTimestamp(event.createdAt) === null)
      throw new Error(`CSV 事件 ${event.name} 的 createdAt 无效`);
    if (isoTimestamp(event.updatedAt) === null)
      throw new Error(`CSV 事件 ${event.name} 的 updatedAt 无效`);
  }
}
export async function importCountdownCsv(
  current: CountdownEventsFile,
  parsed: CountdownCsvParseResult,
  mode: "merge" | "replace",
): Promise<CountdownCsvImportPreview> {
  validateParsedCountdownCsv(parsed);
  const { next, preview } = prepareCountdownCsvImport(current, parsed, mode);
  try {
    await replaceCountdownEventsFile(next);
  } catch (error) {
    try {
      await replaceCountdownEventsFile(current);
    } catch (rollbackError) {
      throw new Error(
        `CSV 导入失败且回滚未完全成功：${error instanceof Error ? error.message : String(error)}；${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      );
    }
    throw error;
  }
  return preview;
}

export function downloadCountdownText(
  filename: string,
  text: string,
  type: string,
): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
