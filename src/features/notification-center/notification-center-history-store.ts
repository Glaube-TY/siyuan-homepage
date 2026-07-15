import { z } from "zod";
import {
  NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT,
  NOTIFICATION_CENTER_HISTORY_INDEX_KEY,
} from "./constants";
import { notificationLockName, withNotificationLock } from "./notification-center-locks";
import { readJSON, writeJSON } from "./notification-center-storage";
import { redactMessage } from "./notification-center-redact";
import type {
  NotificationDeliveryHistoryRecord,
  NotificationDeliveryResult,
  NotificationEvent,
  NotificationHistoryIndex,
  NotificationHistoryYearFile,
} from "./types";
import { broadcastNotificationCenterEvent } from "./notification-center-events";

const successfulSessionKeys = new Set<string>();
const transientHistoryRecords: NotificationDeliveryHistoryRecord[] = [];
const pendingWrites = new Set<Promise<unknown>>();

function emptyIndex(): NotificationHistoryIndex {
  return {
    schema: "siyuan-homepage-notification-history-index",
    version: 1,
    revision: 0,
    updatedAt: new Date().toISOString(),
    years: [],
    yearCounts: {},
    totalRecords: 0,
  };
}

function emptyYear(year: number): NotificationHistoryYearFile {
  return {
    schema: "siyuan-homepage-notification-history",
    version: 1,
    revision: 0,
    year,
    updatedAt: new Date().toISOString(),
    records: [],
  };
}

function historyYearKey(year: number): string {
  return `notification-center/history-${year}.json`;
}

const historyRecordSchema: z.ZodSchema<NotificationDeliveryHistoryRecord> = z.object({
  id: z.string(),
  eventId: z.string(),
  occurrenceKey: z.string(),
  source: z.string(),
  type: z.string(),
  sourceId: z.string().optional(),
  title: z.string(),
  scheduledAt: z.string().optional(),
  targetKey: z.string(),
  targetKind: z.enum(["desktop", "mobile", "external"]),
  targetTitle: z.string(),
  deviceId: z.string().optional(),
  channelId: z.string().optional(),
  status: z.enum(["delivered", "scheduled", "skipped", "failed", "cancelled"]),
  attemptCount: z.number(),
  firstAttemptAt: z.string(),
  lastAttemptAt: z.string(),
  deliveredAt: z.string().optional(),
  notificationId: z.number().optional(),
  statusCode: z.number().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  payloadHash: z.string().optional(),
  legacyExternalCompleted: z.boolean().optional(),
});

const historyIndexSchema: z.ZodSchema<NotificationHistoryIndex> = z.object({
  schema: z.literal("siyuan-homepage-notification-history-index"),
  version: z.literal(1),
  revision: z.number(),
  updatedAt: z.string(),
  years: z.array(z.number()),
  yearCounts: z.record(z.string(), z.number()),
  totalRecords: z.number(),
});

const historyYearFileSchema: z.ZodSchema<NotificationHistoryYearFile> = z.object({
  schema: z.literal("siyuan-homepage-notification-history"),
  version: z.literal(1),
  revision: z.number(),
  year: z.number(),
  updatedAt: z.string(),
  records: z.array(historyRecordSchema),
});

function normalizeIndex(raw: unknown): NotificationHistoryIndex {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyIndex();
  const value = raw as Partial<NotificationHistoryIndex>;
  if (value.schema !== "siyuan-homepage-notification-history-index") return emptyIndex();
  return {
    ...emptyIndex(),
    revision: Number.isFinite(value.revision) ? Number(value.revision) : 0,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    years: Array.isArray(value.years) ? [...new Set(value.years.filter(Number.isInteger))].sort((a, b) => b - a) : [],
    yearCounts: value.yearCounts && typeof value.yearCounts === "object" ? value.yearCounts : {},
    totalRecords: Number.isFinite(value.totalRecords) ? Number(value.totalRecords) : 0,
  };
}

function normalizeYear(raw: unknown, year: number): NotificationHistoryYearFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyYear(year);
  const value = raw as Partial<NotificationHistoryYearFile>;
  if (value.schema !== "siyuan-homepage-notification-history" || value.year !== year) {
    throw new Error(`通知历史年度文件与请求年份不一致：${year}`);
  }
  return {
    ...emptyYear(year),
    revision: Number.isFinite(value.revision) ? Number(value.revision) : 0,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    records: Array.isArray(value.records) ? value.records : [],
  };
}

function resolveHistoryYear(event: Pick<NotificationEvent, "scheduledAt" | "createdAt">): number {
  const candidate = new Date(event.scheduledAt ?? event.createdAt ?? Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date().getFullYear() : candidate.getFullYear();
}

function deliveryKey(occurrenceKey: string, targetKey: string): string {
  return `${occurrenceKey}\u0000${targetKey}`;
}

export function rememberSuccessfulDelivery(occurrenceKey: string, targetKey: string): void {
  successfulSessionKeys.add(deliveryKey(occurrenceKey, targetKey));
}

export function recordTransientHistoryFailure(
  event: NotificationEvent,
  eventId: string,
  result: NotificationDeliveryResult,
  error: unknown,
): void {
  const now = new Date().toISOString();
  transientHistoryRecords.unshift({
    id: `transient:${eventId}:${result.targetKey}:${Date.now()}`,
    eventId,
    occurrenceKey: event.occurrenceKey,
    source: event.source,
    type: event.type,
    sourceId: event.sourceId,
    title: event.title.slice(0, 300),
    scheduledAt: event.scheduledAt,
    targetKey: result.targetKey,
    targetKind: result.targetKind,
    targetTitle: result.status === "delivered" || result.status === "scheduled"
      ? `${result.targetTitle}（投递成功但历史写入失败）`
      : result.targetTitle,
    deviceId: result.deviceId,
    channelId: result.channelId,
    status: "failed",
    attemptCount: 1,
    firstAttemptAt: now,
    lastAttemptAt: now,
    notificationId: result.notificationId,
    statusCode: result.statusCode,
    errorCode: "history_write_failed",
    errorMessage: redactMessage(error),
  });
  transientHistoryRecords.splice(50);
  window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT, { detail: { transient: true } }));
}

export async function loadNotificationHistoryIndex(): Promise<NotificationHistoryIndex> {
  const raw = await readJSON(NOTIFICATION_CENTER_HISTORY_INDEX_KEY, historyIndexSchema);
  if (raw === null) return emptyIndex();
  return normalizeIndex(raw);
}

export async function loadNotificationHistoryYear(year: number): Promise<NotificationHistoryYearFile> {
  const raw = await readJSON(historyYearKey(year), historyYearFileSchema);
  if (raw === null) return emptyYear(year);
  return normalizeYear(raw, year);
}

export async function findNotificationDeliveryHistory(
  event: Pick<NotificationEvent, "occurrenceKey" | "scheduledAt" | "createdAt">,
  targetKey: string,
): Promise<NotificationDeliveryHistoryRecord | undefined> {
  if (successfulSessionKeys.has(deliveryKey(event.occurrenceKey, targetKey))) {
    return { status: "delivered" } as NotificationDeliveryHistoryRecord;
  }
  const year = resolveHistoryYear(event);
  let current: NotificationHistoryYearFile;
  try {
    current = await loadNotificationHistoryYear(year);
  } catch (error) {
    throw Object.assign(new Error("通知投递历史读取失败。"), { code: "history_read_failed", cause: error });
  }
  const find = (records: NotificationDeliveryHistoryRecord[]) => records.find((record) =>
    record.occurrenceKey === event.occurrenceKey
    && (record.targetKey === targetKey || (targetKey.startsWith("external:") && record.targetKey === "external:legacy" && record.legacyExternalCompleted)),
  );
  const found = find(current.records);
  if (found) return found;
  if (year !== new Date().getFullYear() - 1 && new Date().getMonth() === 0) {
    try {
      const previous = await loadNotificationHistoryYear(year - 1);
      return find(previous.records);
    } catch (error) {
      throw Object.assign(new Error("通知投递历史读取失败。"), { code: "history_read_failed", cause: error });
    }
  }
  return undefined;
}

function validateSavedRecord(saved: NotificationHistoryYearFile, record: NotificationDeliveryHistoryRecord): void {
  if (saved.schema !== "siyuan-homepage-notification-history") throw new Error("年度历史文件 schema 保存后校验失败。");
  if (saved.version !== 1) throw new Error("年度历史文件版本保存后校验失败。");
  if (!saved.records.some((item) => item.occurrenceKey === record.occurrenceKey && item.targetKey === record.targetKey && item.status === record.status && item.id === record.id && item.eventId === record.eventId)) {
    throw new Error("通知投递历史记录保存后校验失败。");
  }
}

function validateSavedIndex(index: NotificationHistoryIndex, year: number, expectedRecords: number): void {
  if (index.schema !== "siyuan-homepage-notification-history-index") throw new Error("历史索引 schema 保存后校验失败。");
  if (index.version !== 1) throw new Error("历史索引版本保存后校验失败。");
  if (!index.years.includes(year)) throw new Error("历史索引年份保存后校验失败。");
  if (index.yearCounts[String(year)] !== expectedRecords) throw new Error("历史索引年度记录数保存后校验失败。");
}

export async function recordNotificationDelivery(
  event: NotificationEvent,
  eventId: string,
  result: NotificationDeliveryResult,
  errorCode?: string,
  payloadHash?: string,
): Promise<NotificationDeliveryHistoryRecord> {
  const year = resolveHistoryYear(event);
  const lock = notificationLockName("history", String(year));
  const write = withNotificationLock(lock, async () => {
    const file = await loadNotificationHistoryYear(year);
    const now = new Date().toISOString();
    const index = file.records.findIndex((record) => record.occurrenceKey === event.occurrenceKey && record.targetKey === result.targetKey);
    const previous = index >= 0 ? file.records[index] : undefined;
    const record: NotificationDeliveryHistoryRecord = {
      id: previous?.id ?? `${eventId}:${result.targetKey}`,
      eventId,
      occurrenceKey: event.occurrenceKey,
      source: event.source,
      type: event.type,
      sourceId: event.sourceId,
      title: event.title.slice(0, 300),
      scheduledAt: event.scheduledAt,
      targetKey: result.targetKey,
      targetKind: result.targetKind,
      targetTitle: result.targetTitle,
      deviceId: result.deviceId,
      channelId: result.channelId,
      status: result.status,
      attemptCount: (previous?.attemptCount ?? 0) + 1,
      firstAttemptAt: previous?.firstAttemptAt ?? now,
      lastAttemptAt: now,
      deliveredAt: result.status === "delivered" || result.status === "scheduled" ? now : previous?.deliveredAt,
      notificationId: result.notificationId,
      statusCode: result.statusCode,
      errorCode,
      errorMessage: result.status === "failed" || result.status === "skipped" ? redactMessage(result.message ?? "") : undefined,
      payloadHash,
      legacyExternalCompleted: previous?.legacyExternalCompleted,
    };
    if (index >= 0) file.records[index] = record;
    else file.records.push(record);
    file.revision += 1;
    file.updatedAt = now;

    const savedYear = await writeJSON(historyYearKey(year), file, historyYearFileSchema);
    validateSavedRecord(savedYear, record);

    const historyIndex = await loadNotificationHistoryIndex();
    historyIndex.revision += 1;
    historyIndex.updatedAt = now;
    historyIndex.years = [...new Set([...historyIndex.years, year])].sort((a, b) => b - a);
    historyIndex.yearCounts[String(year)] = savedYear.records.length;
    historyIndex.totalRecords = Object.values(historyIndex.yearCounts).reduce((sum, count) => sum + Number(count || 0), 0);
    const savedIndex = await writeJSON(NOTIFICATION_CENTER_HISTORY_INDEX_KEY, historyIndex, historyIndexSchema);
    validateSavedIndex(savedIndex, year, savedYear.records.length);

    window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT, { detail: { year, targetKey: result.targetKey } }));
    broadcastNotificationCenterEvent(NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT, { year, targetKey: result.targetKey });
    if (result.status === "delivered" || result.status === "scheduled") rememberSuccessfulDelivery(event.occurrenceKey, result.targetKey);
    return record;
  });
  pendingWrites.add(write);
  void write.finally(() => pendingWrites.delete(write)).catch(() => undefined);
  return write;
}

export async function upsertLegacyNotificationHistory(record: NotificationDeliveryHistoryRecord): Promise<void> {
  const year = new Date(record.lastAttemptAt).getFullYear();
  const lock = notificationLockName("history", String(year));
  await withNotificationLock(lock, async () => {
    const file = await loadNotificationHistoryYear(year);
    if (file.records.some((item) => item.occurrenceKey === record.occurrenceKey && item.targetKey === record.targetKey)) return;
    file.records.push(record);
    file.revision += 1;
    file.updatedAt = new Date().toISOString();
    const savedYear = await writeJSON(historyYearKey(year), file, historyYearFileSchema);
    if (!savedYear.records.some((item) => item.occurrenceKey === record.occurrenceKey && item.targetKey === record.targetKey)) {
      throw new Error("旧通知历史迁移写入后校验失败。");
    }
    const index = await loadNotificationHistoryIndex();
    index.revision += 1;
    index.updatedAt = file.updatedAt;
    index.years = [...new Set([...index.years, year])].sort((a, b) => b - a);
    index.yearCounts[String(year)] = savedYear.records.length;
    index.totalRecords = Object.values(index.yearCounts).reduce((sum, count) => sum + Number(count || 0), 0);
    const savedIndex = await writeJSON(NOTIFICATION_CENTER_HISTORY_INDEX_KEY, index, historyIndexSchema);
    validateSavedIndex(savedIndex, year, savedYear.records.length);
  });
}

export async function loadRecentNotificationDeliveries(limit = 50): Promise<NotificationDeliveryHistoryRecord[]> {
  const index = await loadNotificationHistoryIndex();
  const years = index.years.length > 0 ? index.years : [new Date().getFullYear()];
  const records: NotificationDeliveryHistoryRecord[] = [];
  for (const year of years) {
    records.push(...(await loadNotificationHistoryYear(year)).records);
    if (records.length >= limit * 2) break;
  }
  return [...transientHistoryRecords, ...records].sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt)).slice(0, limit);
}

export async function settleNotificationHistoryWrites(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
}
