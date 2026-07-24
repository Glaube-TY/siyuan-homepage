import {
    assertSharedWidgetYearFilesComplete,
    hasValidatedSharedWidgetMigration,
    loadSharedJson,
    mutateSharedJson,
    readSharedWidgetDirectoryChecked,
    REVIEW_DOCS_STORE_TRANSACTION_LOCK,
    runSharedWidgetExclusive,
    type SharedRevisionedFile,
    type SharedWidgetMigrationMetadata,
} from "../sharedLocalStorage/sharedLocalStorage";
import {
    getReviewLogsFile,
    REVIEW_LOG_INDEX_FILE,
    REVIEW_LOG_INDEX_SCHEMA,
    REVIEW_LOGS_SCHEMA,
    SHARED_WIDGET_DATA_VERSION,
} from "../sharedLocalStorage/sharedWidgetStoragePaths";
import { assertSharedWidgetMigrationReady } from "../sharedLocalStorage/sharedWidgetMigration";
import { toLocalDateString } from "./reviewDocsSchedule";
import type { ReviewLogEntry, ReviewLogStats } from "./reviewDocsTypes";

export interface ReviewLogIndexFile extends SharedRevisionedFile {
    years: number[];
    totalLogs: number;
    yearCounts: Record<string, number>;
    migration?: SharedWidgetMigrationMetadata;
}

export interface ReviewLogsYearFile extends SharedRevisionedFile {
    year: number;
    logs: ReviewLogEntry[];
}

export interface ReviewLogStoreStatus {
    ok: boolean;
    missingFields: string[];
    message: string;
}

export interface ReviewLogWriteResult {
    ok: boolean;
    skipped: boolean;
    message: string;
}

function finiteCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

export function getReviewLogYear(entry: Partial<ReviewLogEntry>, fallback = new Date().getFullYear()): number {
    for (const value of [entry.actionAt, entry.createdAt]) {
        if (typeof value !== "string") continue;
        const parsed = new Date(value);
        const year = Number.isFinite(parsed.getTime()) ? parsed.getFullYear() : NaN;
        if (Number.isFinite(year) && year >= 1900 && year <= 9999) return year;
    }
    return fallback;
}

export function getReviewLogDedupeKey(entry: Partial<ReviewLogEntry>): string {
    if (typeof entry.logId === "string" && entry.logId.trim()) return `id:${entry.logId.trim()}`;
    return `natural:${entry.targetId || ""}|${entry.action || ""}|${entry.actionAt || ""}|${entry.previousDueDate || ""}|${entry.nextDueDate || ""}`;
}

export function normalizeReviewLogEntry(raw: unknown): ReviewLogEntry {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("复习日志记录无效");
    const value = raw as Record<string, unknown>;
    const text = (key: string) => typeof value[key] === "string" ? value[key] as string : "";
    const action = text("action");
    if (!text("targetId") || !action || !["create", "review", "postpone", "update", "finish", "remove"].includes(action)) {
        throw new Error("复习日志关键字段无效");
    }
    return {
        logId: text("logId"),
        reviewId: text("reviewId"),
        targetId: text("targetId"),
        targetRootId: text("targetRootId"),
        targetType: text("targetType") === "doc" ? "doc" : "block",
        targetTitle: text("targetTitle"),
        targetPath: text("targetPath"),
        action: action as ReviewLogEntry["action"],
        actionAt: text("actionAt"),
        previousDueDate: text("previousDueDate"),
        nextDueDate: text("nextDueDate"),
        reviewCountBefore: finiteCount(value.reviewCountBefore),
        reviewCountAfter: finiteCount(value.reviewCountAfter),
        intervalIndexBefore: finiteCount(value.intervalIndexBefore),
        intervalIndexAfter: finiteCount(value.intervalIndexAfter),
        plan: text("plan"),
        intervals: text("intervals"),
        category: text("category"),
        priority: text("priority"),
        note: text("note"),
        createdAt: text("createdAt"),
        archived: text("archived"),
    };
}

export function createEmptyReviewLogIndexFile(): ReviewLogIndexFile {
    return {
        schema: REVIEW_LOG_INDEX_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: 0,
        updatedAt: new Date().toISOString(),
        years: [],
        totalLogs: 0,
        yearCounts: {},
    };
}

export function createEmptyReviewLogsYearFile(year: number): ReviewLogsYearFile {
    return {
        schema: REVIEW_LOGS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: 0,
        year,
        updatedAt: new Date().toISOString(),
        logs: [],
    };
}

export function normalizeReviewLogIndexFile(raw: unknown): ReviewLogIndexFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("复习日志索引结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== REVIEW_LOG_INDEX_SCHEMA || value.version !== SHARED_WIDGET_DATA_VERSION) {
        throw new Error("复习日志索引 schema 或 version 不受支持");
    }
    if (!Array.isArray(value.years) || !value.yearCounts || typeof value.yearCounts !== "object") {
        throw new Error("复习日志索引内容无效");
    }
    const years = Array.from(new Set(value.years.map(Number).filter((year) => Number.isInteger(year) && year >= 1900))).sort();
    const yearCounts: Record<string, number> = {};
    for (const year of years) yearCounts[String(year)] = finiteCount((value.yearCounts as Record<string, unknown>)[String(year)]);
    return {
        schema: REVIEW_LOG_INDEX_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: finiteCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        years,
        totalLogs: finiteCount(value.totalLogs),
        yearCounts,
        migration: value.migration as SharedWidgetMigrationMetadata | undefined,
    };
}

export function normalizeReviewLogsYearFile(raw: unknown, expectedYear: number): ReviewLogsYearFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("复习日志年份文件结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== REVIEW_LOGS_SCHEMA || value.version !== SHARED_WIDGET_DATA_VERSION || value.year !== expectedYear) {
        throw new Error("复习日志年份文件 schema、version 或 year 不受支持");
    }
    if (!Array.isArray(value.logs)) throw new Error("复习日志年份列表无效");
    return {
        schema: REVIEW_LOGS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: finiteCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        year: expectedYear,
        logs: value.logs.map(normalizeReviewLogEntry),
    };
}

export function sameReviewLog(left: ReviewLogEntry, right: ReviewLogEntry): boolean {
    const normalizedLeft = normalizeReviewLogEntry(left);
    const normalizedRight = normalizeReviewLogEntry(right);
    return normalizedLeft.logId === normalizedRight.logId
        && normalizedLeft.reviewId === normalizedRight.reviewId
        && normalizedLeft.targetId === normalizedRight.targetId
        && normalizedLeft.targetRootId === normalizedRight.targetRootId
        && normalizedLeft.targetType === normalizedRight.targetType
        && normalizedLeft.targetTitle === normalizedRight.targetTitle
        && normalizedLeft.targetPath === normalizedRight.targetPath
        && normalizedLeft.action === normalizedRight.action
        && normalizedLeft.actionAt === normalizedRight.actionAt
        && normalizedLeft.previousDueDate === normalizedRight.previousDueDate
        && normalizedLeft.nextDueDate === normalizedRight.nextDueDate
        && normalizedLeft.reviewCountBefore === normalizedRight.reviewCountBefore
        && normalizedLeft.reviewCountAfter === normalizedRight.reviewCountAfter
        && normalizedLeft.intervalIndexBefore === normalizedRight.intervalIndexBefore
        && normalizedLeft.intervalIndexAfter === normalizedRight.intervalIndexAfter
        && normalizedLeft.plan === normalizedRight.plan
        && normalizedLeft.intervals === normalizedRight.intervals
        && normalizedLeft.category === normalizedRight.category
        && normalizedLeft.priority === normalizedRight.priority
        && normalizedLeft.note === normalizedRight.note
        && normalizedLeft.createdAt === normalizedRight.createdAt
        && normalizedLeft.archived === normalizedRight.archived;
}

export function validateReviewLogRecords(
    actual: ReviewLogEntry[],
    expected: ReviewLogEntry[],
    message = "复习日志年份文件写入后校验失败",
): void {
    const actualByKey = new Map(actual.map((log) => [getReviewLogDedupeKey(log), log]));
    const expectedKeys = new Set(expected.map(getReviewLogDedupeKey));
    if (actual.length !== expected.length
        || actualByKey.size !== actual.length
        || expectedKeys.size !== expected.length
        || expected.some((log) => {
            const saved = actualByKey.get(getReviewLogDedupeKey(log));
            return !saved || !sameReviewLog(saved, log);
        })) {
        throw new Error(message);
    }
}

function validateYearFile(actual: ReviewLogsYearFile, expected: ReviewLogsYearFile): void {
    validateReviewLogRecords(actual.logs, expected.logs);
}

function validateIndex(actual: ReviewLogIndexFile, expected: ReviewLogIndexFile): void {
    if (actual.totalLogs !== expected.totalLogs || actual.years.length !== expected.years.length
        || expected.years.some((year, index) => actual.years[index] !== year
            || actual.yearCounts[String(year)] !== expected.yearCounts[String(year)])) {
        throw new Error("复习日志索引写入后校验失败");
    }
}

function isReviewLogIndexConsistent(index: ReviewLogIndexFile): boolean {
    return index.years.reduce((sum, year) => sum + (index.yearCounts[String(year)] || 0), 0)
        === index.totalLogs;
}

export async function listReviewLogYears(): Promise<number[]> {
    const years: number[] = [];
    for (const entry of await readSharedWidgetDirectoryChecked("review-docs")) {
        const match = entry.name.match(/^review-logs-(\d{4})\.json$/);
        if (!match) continue;
        if (entry.isDir) throw new Error(`复习日志年度明细路径不是文件：${entry.name}`);
        years.push(Number(match[1]));
    }
    return Array.from(new Set(years)).sort((left, right) => left - right);
}

export async function rebuildReviewLogIndexFromFiles(): Promise<ReviewLogIndexFile> {
    const existing = await loadSharedJson(REVIEW_LOG_INDEX_FILE, normalizeReviewLogIndexFile);
    const years = await listReviewLogYears();
    assertSharedWidgetYearFilesComplete(existing?.years || [], years);
    const yearCounts: Record<string, number> = {};
    let totalLogs = 0;
    for (const year of years) {
        const file = await loadSharedJson(getReviewLogsFile(year), (raw) => normalizeReviewLogsYearFile(raw, year));
        if (!file) throw new Error(`年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`);
        const count = file.logs.length;
        yearCounts[String(year)] = count;
        totalLogs += count;
    }
    return mutateSharedJson({
        store: "review-docs",
        path: REVIEW_LOG_INDEX_FILE,
        createEmpty: createEmptyReviewLogIndexFile,
        normalize: normalizeReviewLogIndexFile,
        mutate: (index) => {
            index.years = years;
            index.yearCounts = yearCounts;
            index.totalLogs = totalLogs;
        },
        validate: validateIndex,
    });
}

async function loadOrRepairIndex(): Promise<ReviewLogIndexFile> {
    const index = await loadSharedJson(REVIEW_LOG_INDEX_FILE, normalizeReviewLogIndexFile);
    if (!index) return rebuildReviewLogIndexFromFiles();
    const years = await listReviewLogYears();
    assertSharedWidgetYearFilesComplete(index.years, years);
    if (!isReviewLogIndexConsistent(index) || years.some((year) => !index.years.includes(year))) {
        return rebuildReviewLogIndexFromFiles();
    }
    const currentYear = new Date().getFullYear();
    for (const year of [currentYear - 1, currentYear]) {
        const file = await loadSharedJson(
            getReviewLogsFile(year),
            (raw) => normalizeReviewLogsYearFile(raw, year),
        );
        if (years.includes(year) && !file) {
            throw new Error(`年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`);
        }
        if ((file?.logs.length || 0) !== (index.yearCounts[String(year)] || 0)
            || Boolean(file) !== index.years.includes(year)) {
            return rebuildReviewLogIndexFromFiles();
        }
    }
    return index;
}

async function loadReviewLogIndexForRead(): Promise<ReviewLogIndexFile> {
    const existing = await loadSharedJson(REVIEW_LOG_INDEX_FILE, normalizeReviewLogIndexFile);
    if (hasValidatedSharedWidgetMigration(existing)) return existing;

    await assertSharedWidgetMigrationReady("review-docs");
    const migrated = await runSharedWidgetExclusive(REVIEW_DOCS_STORE_TRANSACTION_LOCK, loadOrRepairIndex);
    if (!hasValidatedSharedWidgetMigration(migrated)) {
        throw new Error("复习日志历史迁移尚未完成");
    }
    return migrated;
}

export async function getReviewLogStoreStatus(): Promise<ReviewLogStoreStatus> {
    try {
        const index = await loadReviewLogIndexForRead();
        return {
            ok: true,
            missingFields: [],
            message: index.migration?.cleanupStatus === "pending" ? "旧数据库清理待重试" : "本地数据已就绪",
        };
    } catch (error) {
        return { ok: false, missingFields: [], message: error instanceof Error ? error.message : "本地存储不可用" };
    }
}

export async function appendReviewLog(entry: ReviewLogEntry): Promise<ReviewLogWriteResult> {
    await assertSharedWidgetMigrationReady("review-docs");
    const normalized = normalizeReviewLogEntry(entry);
    const year = getReviewLogYear(normalized);
    return runSharedWidgetExclusive(REVIEW_DOCS_STORE_TRANSACTION_LOCK, async () => {
        const index = await loadOrRepairIndex();
        let added = false;
        let previousCount = 0;
        await mutateSharedJson({
            store: "review-docs",
            path: getReviewLogsFile(year),
            createEmpty: () => createEmptyReviewLogsYearFile(year),
            normalize: (raw) => normalizeReviewLogsYearFile(raw, year),
            mutate: (file) => {
                previousCount = file.logs.length;
                const key = getReviewLogDedupeKey(normalized);
                if (!file.logs.some((log) => getReviewLogDedupeKey(log) === key)) {
                    file.logs.push(normalized);
                    added = true;
                }
            },
            validate: validateYearFile,
            dispatch: false,
        });
        if (!added) {
            if (previousCount !== (index.yearCounts[String(year)] || 0)) await rebuildReviewLogIndexFromFiles();
            return { ok: true, skipped: true, message: "日志已存在" };
        }
        try {
            if (previousCount !== (index.yearCounts[String(year)] || 0)) {
                await rebuildReviewLogIndexFromFiles();
            } else {
                await mutateSharedJson({
                    store: "review-docs",
                    path: REVIEW_LOG_INDEX_FILE,
                    createEmpty: createEmptyReviewLogIndexFile,
                    normalize: normalizeReviewLogIndexFile,
                    mutate: (draft) => {
                        draft.years = Array.from(new Set([...draft.years, year])).sort();
                        draft.yearCounts[String(year)] = (draft.yearCounts[String(year)] || 0) + 1;
                        draft.totalLogs += 1;
                    },
                    validate: validateIndex,
                });
            }
        } catch (incrementalError) {
            try {
                await rebuildReviewLogIndexFromFiles();
            } catch (rebuildError) {
                throw new Error(`复习日志已保存，但索引增量更新和完整重建均失败：${String(incrementalError)}；${String(rebuildError)}`);
            }
        }
        return { ok: true, skipped: false, message: "日志已记录" };
    });
}

export async function loadReviewLogStats(): Promise<ReviewLogStats> {
    const index = await loadReviewLogIndexForRead();
    return runSharedWidgetExclusive(REVIEW_DOCS_STORE_TRANSACTION_LOCK, async () => {
        const year = new Date().getFullYear();
        const current = await loadSharedJson(getReviewLogsFile(year), (raw) => normalizeReviewLogsYearFile(raw, year));
        const today = toLocalDateString();
        const todayReviewed = (current?.logs || []).filter((log) =>
            (log.action === "review" || log.action === "finish")
            && Number.isFinite(new Date(log.actionAt).getTime())
            && toLocalDateString(new Date(log.actionAt)) === today
            && !["true", "1", "已归档"].includes(log.archived.trim().toLowerCase())
        ).length;
        return { todayReviewed, totalLogs: index.totalLogs, statusMessage: "" };
    });
}
