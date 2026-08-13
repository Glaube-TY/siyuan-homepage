import {
    assertSharedWidgetYearFilesComplete,
    FOCUS_STORE_TRANSACTION_LOCK,
    loadSharedJson,
    mutateSharedJson,
    readSharedWidgetDirectoryChecked,
    registerSharedWidgetCleanup,
    registerSharedWidgetFlusher,
    runSharedWidgetExclusive,
    type SharedRevisionedFile,
} from "../sharedLocalStorage/sharedLocalStorage";
import {
    FOCUS_INDEX_FILE,
    FOCUS_INDEX_SCHEMA,
    FOCUS_INDEX_VERSION,
    FOCUS_SESSION_VERSION,
    FOCUS_SESSIONS_SCHEMA,
    getFocusSessionsFile,
} from "../sharedLocalStorage/sharedWidgetStoragePaths";
import { normalizeFocusBinding, type FocusBindingSnapshot } from "./focusBinding";
export { summarizeFocusSessions } from "./focusSessionAnalytics";
export type { FocusBindingKind, FocusBindingSnapshot } from "./focusBinding";

export interface FocusStatistics {
    totalFocusTime: number;
    totalFocusTimes: number;
}

export interface FocusDetailedStatistics extends FocusStatistics {
    completedSessions: number;
    cancelledSessions: number;
}

export type FocusSessionStatus = "completed" | "cancelled";
export type FocusSegmentType = "focus" | "short_break" | "long_break";

export interface FocusSessionRecord {
    id: string;
    startedAt: string;
    endedAt: string;
    localDate: string;
    segmentType: FocusSegmentType;
    plannedSeconds: number;
    actualSeconds: number;
    status: FocusSessionStatus;
    binding?: FocusBindingSnapshot;
}

export interface FocusIndexFile extends SharedRevisionedFile {
    years: number[];
    yearCounts: Record<string, number>;
    totalFocusTime: number;
    totalFocusTimes: number;
    completedSessions: number;
    cancelledSessions: number;
    completedBreaks: number;
    cancelledBreaks: number;
}

export interface FocusSessionsYearFile extends SharedRevisionedFile {
    year: number;
    sessions: FocusSessionRecord[];
}

export interface FocusStoreStatus {
    ok: boolean;
    missingFields: string[];
    message: string;
}

const pendingFocusSessions = new Map<string, FocusSessionRecord>();
let focusSessionFlushPromise: Promise<FocusStatistics | null> | null = null;

function finiteCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function integerCount(value: unknown): number {
    return Math.round(finiteCount(value));
}

export function toFocusSecondTimestamp(value: Date | number = new Date()): string {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("番茄钟会话时间无效");
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function getLocalFocusDate(value: Date | number = new Date()): string {
    const date = value instanceof Date ? value : new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createEmptyFocusIndexFile(): FocusIndexFile {
    return {
        schema: FOCUS_INDEX_SCHEMA,
        version: FOCUS_INDEX_VERSION,
        revision: 0,
        updatedAt: new Date().toISOString(),
        years: [],
        yearCounts: {},
        totalFocusTime: 0,
        totalFocusTimes: 0,
        completedSessions: 0,
        cancelledSessions: 0,
        completedBreaks: 0,
        cancelledBreaks: 0,
    };
}

export function createEmptyFocusSessionsYearFile(year: number): FocusSessionsYearFile {
    return {
        schema: FOCUS_SESSIONS_SCHEMA,
        version: FOCUS_SESSION_VERSION,
        revision: 0,
        updatedAt: new Date().toISOString(),
        year,
        sessions: [],
    };
}

export function normalizeFocusIndexFile(raw: unknown): FocusIndexFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("番茄钟索引结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== FOCUS_INDEX_SCHEMA || value.version !== FOCUS_INDEX_VERSION) {
        throw new Error("番茄钟索引 schema 或 version 不受支持");
    }
    if (!Array.isArray(value.years) || !value.yearCounts || typeof value.yearCounts !== "object") {
        throw new Error("番茄钟索引内容无效");
    }
    const years = Array.from(new Set(value.years.map(Number)
        .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 9999))).sort();
    const yearCounts: Record<string, number> = {};
    for (const year of years) {
        yearCounts[String(year)] = integerCount((value.yearCounts as Record<string, unknown>)[String(year)]);
    }
    return {
        schema: FOCUS_INDEX_SCHEMA,
        version: FOCUS_INDEX_VERSION,
        revision: integerCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        years,
        yearCounts,
        totalFocusTime: finiteCount(value.totalFocusTime),
        totalFocusTimes: integerCount(value.totalFocusTimes),
        completedSessions: integerCount(value.completedSessions),
        cancelledSessions: integerCount(value.cancelledSessions),
        completedBreaks: integerCount(value.completedBreaks),
        cancelledBreaks: integerCount(value.cancelledBreaks),
    };
}

function normalizeFocusSession(raw: unknown, expectedYear: number): FocusSessionRecord {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("番茄钟会话记录无效");
    const value = raw as Record<string, unknown>;
    const text = (key: string) => typeof value[key] === "string" ? String(value[key]).trim() : "";
    const localDate = text("localDate");
    const status = text("status");
    const segmentType = text("segmentType");
    const startedAt = Date.parse(text("startedAt"));
    const endedAt = Date.parse(text("endedAt"));
    const plannedSeconds = integerCount(value.plannedSeconds);
    const actualSeconds = integerCount(value.actualSeconds);
    if (!text("id") || !text("startedAt") || !text("endedAt")
        || !/^\d{4}-\d{2}-\d{2}$/.test(localDate) || Number(localDate.slice(0, 4)) !== expectedYear
        || !["completed", "cancelled"].includes(status)
        || !["focus", "short_break", "long_break"].includes(segmentType)
        || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt
        || plannedSeconds > 86400 || actualSeconds > 86400 || actualSeconds > Math.ceil((endedAt - startedAt) / 1000) + 60) {
        throw new Error("番茄钟会话关键字段无效");
    }
    return {
        id: text("id"),
        startedAt: text("startedAt"),
        endedAt: text("endedAt"),
        localDate,
        segmentType: segmentType as FocusSegmentType,
        plannedSeconds,
        actualSeconds,
        status: status as FocusSessionStatus,
        binding: normalizeFocusBinding(value.binding),
    };
}

export function normalizeFocusSessionsYearFile(raw: unknown, expectedYear: number): FocusSessionsYearFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("番茄钟年度会话结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== FOCUS_SESSIONS_SCHEMA || value.version !== FOCUS_SESSION_VERSION
        || value.year !== expectedYear || !Array.isArray(value.sessions)) {
        throw new Error("番茄钟年度会话 schema、version 或 year 无效");
    }
    const sessions = value.sessions.map((item) => normalizeFocusSession(item, expectedYear));
    if (new Set(sessions.map((session) => session.id)).size !== sessions.length) {
        throw new Error("番茄钟年度会话存在重复 ID");
    }
    return {
        schema: FOCUS_SESSIONS_SCHEMA,
        version: FOCUS_SESSION_VERSION,
        revision: integerCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        year: expectedYear,
        sessions,
    };
}

function sessionEquals(left: FocusSessionRecord, right: FocusSessionRecord): boolean {
    return left.id === right.id && left.startedAt === right.startedAt && left.endedAt === right.endedAt
        && left.localDate === right.localDate && left.plannedSeconds === right.plannedSeconds
        && left.segmentType === right.segmentType && left.actualSeconds === right.actualSeconds
        && left.status === right.status && JSON.stringify(left.binding) === JSON.stringify(right.binding);
}

function validateFocusYearFile(actual: FocusSessionsYearFile, expected: FocusSessionsYearFile): void {
    const actualById = new Map(actual.sessions.map((session) => [session.id, session]));
    if (actual.sessions.length !== expected.sessions.length
        || expected.sessions.some((session) => !sessionEquals(actualById.get(session.id)!, session))) {
        throw new Error(`番茄钟 ${expected.year} 年会话写入后校验失败`);
    }
}

export function validateFocusIndex(actual: FocusIndexFile, expected: FocusIndexFile): void {
    if (actual.years.length !== expected.years.length
        || expected.years.some((year, index) => actual.years[index] !== year
            || actual.yearCounts[String(year)] !== expected.yearCounts[String(year)])
        || actual.totalFocusTime !== expected.totalFocusTime
        || actual.totalFocusTimes !== expected.totalFocusTimes
        || actual.completedSessions !== expected.completedSessions
        || actual.cancelledSessions !== expected.cancelledSessions
        || actual.completedBreaks !== expected.completedBreaks
        || actual.cancelledBreaks !== expected.cancelledBreaks) {
        throw new Error("番茄钟索引写入后业务数据校验失败");
    }
}

function isFocusIndexConsistent(index: FocusIndexFile): boolean {
    const sessionCount = index.years.reduce((sum, year) => sum + (index.yearCounts[String(year)] || 0), 0);
    return sessionCount === index.completedSessions + index.cancelledSessions + index.completedBreaks + index.cancelledBreaks
        && index.totalFocusTimes === index.completedSessions
        && index.totalFocusTime >= 0;
}

export async function listFocusSessionYears(): Promise<number[]> {
    const years: number[] = [];
    for (const entry of await readSharedWidgetDirectoryChecked("focus")) {
        const match = entry.name.match(/^focus-sessions-v2-(\d{4})\.json$/);
        if (!match) continue;
        if (entry.isDir) throw new Error(`番茄钟年度明细路径不是文件：${entry.name}`);
        years.push(Number(match[1]));
    }
    return Array.from(new Set(years)).sort((left, right) => left - right);
}

export async function rebuildFocusIndexFromFiles(options: { dispatch?: boolean } = {}): Promise<FocusIndexFile> {
    const existing = await loadSharedJson(FOCUS_INDEX_FILE, normalizeFocusIndexFile);
    const years = await listFocusSessionYears();
    assertSharedWidgetYearFilesComplete(existing?.years || [], years);
    const yearCounts: Record<string, number> = {};
    let completedSessions = 0;
    let cancelledSessions = 0;
    let completedBreaks = 0;
    let cancelledBreaks = 0;
    let completedSeconds = 0;
    for (const year of years) {
        const file = await loadSharedJson(getFocusSessionsFile(year), (raw) => normalizeFocusSessionsYearFile(raw, year));
        if (!file) throw new Error(`年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`);
        const sessions = file.sessions;
        yearCounts[String(year)] = sessions.length;
        for (const session of sessions) {
            if (session.segmentType !== "focus") {
                if (session.status === "completed") completedBreaks += 1;
                else cancelledBreaks += 1;
            } else if (session.status === "completed") {
                completedSessions += 1;
                completedSeconds += session.actualSeconds;
            } else {
                cancelledSessions += 1;
            }
        }
    }
    return mutateSharedJson({
        store: "focus",
        path: FOCUS_INDEX_FILE,
        createEmpty: createEmptyFocusIndexFile,
        normalize: normalizeFocusIndexFile,
        mutate: (index) => {
            index.years = years;
            index.yearCounts = yearCounts;
            index.completedSessions = completedSessions;
            index.cancelledSessions = cancelledSessions;
            index.completedBreaks = completedBreaks;
            index.cancelledBreaks = cancelledBreaks;
            index.totalFocusTime = completedSeconds;
            index.totalFocusTimes = completedSessions;
        },
        validate: validateFocusIndex,
        dispatch: options.dispatch !== false,
    });
}

async function loadOrRepairFocusIndex(): Promise<FocusIndexFile> {
    const index = await loadSharedJson(FOCUS_INDEX_FILE, normalizeFocusIndexFile);
    if (!index) return rebuildFocusIndexFromFiles();
    const years = await listFocusSessionYears();
    assertSharedWidgetYearFilesComplete(index.years, years);
    if (!isFocusIndexConsistent(index) || years.some((year) => !index.years.includes(year))) {
        return rebuildFocusIndexFromFiles();
    }
    const currentYear = new Date().getFullYear();
    for (const year of [currentYear - 1, currentYear]) {
        const file = await loadSharedJson(getFocusSessionsFile(year), (raw) => normalizeFocusSessionsYearFile(raw, year));
        if (years.includes(year) && !file) {
            throw new Error(`年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`);
        }
        const indexedCount = index.yearCounts[String(year)] || 0;
        if ((file?.sessions.length || 0) !== indexedCount || Boolean(file) !== index.years.includes(year)) {
            return rebuildFocusIndexFromFiles();
        }
    }
    return index;
}

async function loadFocusIndexForRead(): Promise<FocusIndexFile> {
    return runSharedWidgetExclusive(FOCUS_STORE_TRANSACTION_LOCK, loadOrRepairFocusIndex);
}

export async function getFocusStoreStatus(): Promise<FocusStoreStatus> {
    try {
        await loadFocusIndexForRead();
        return {
            ok: true,
            missingFields: [],
            message: "本地数据已就绪",
        };
    } catch (error) {
        return { ok: false, missingFields: [], message: error instanceof Error ? error.message : "本地存储不可用" };
    }
}

export async function loadFocusStatistics(): Promise<FocusStatistics> {
    const index = await loadFocusIndexForRead();
    return { totalFocusTime: index.totalFocusTime, totalFocusTimes: index.totalFocusTimes };
}

export async function loadFocusDetailedStatistics(): Promise<FocusDetailedStatistics> {
    const index = await loadFocusIndexForRead();
    return {
        totalFocusTime: index.totalFocusTime,
        totalFocusTimes: index.totalFocusTimes,
        completedSessions: index.completedSessions,
        cancelledSessions: index.cancelledSessions,
    };
}

export async function loadFocusSessionsForYear(year: number): Promise<FocusSessionRecord[]> {
    if (!Number.isInteger(year) || year < 1970 || year > 9999) throw new Error("专注会话年份无效");
    const index = await loadFocusIndexForRead();
    if (!index.years.includes(year)) return [];
    const file = await loadSharedJson(getFocusSessionsFile(year), (raw) => normalizeFocusSessionsYearFile(raw, year));
    if (!file) throw new Error(`专注年度明细文件缺失：${year}`);
    return file.sessions.map((session) => ({ ...session }));
}

export async function loadFocusSessionsForRange(startDate: string, endDate: string): Promise<FocusSessionRecord[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
        throw new Error("专注统计日期范围无效");
    }
    const startYear = Number(startDate.slice(0, 4));
    const endYear = Number(endDate.slice(0, 4));
    const sessions: FocusSessionRecord[] = [];
    for (let year = startYear; year <= endYear; year += 1) sessions.push(...await loadFocusSessionsForYear(year));
    return sessions.filter((session) => session.localDate >= startDate && session.localDate <= endDate);
}

export async function appendFocusSession(session: FocusSessionRecord): Promise<FocusStatistics> {
    const year = Number(session.localDate.slice(0, 4));
    const normalized = normalizeFocusSession(session, year);
    return runSharedWidgetExclusive(FOCUS_STORE_TRANSACTION_LOCK, async () => {
        const currentIndex = await loadOrRepairFocusIndex();
        let added = false;
        let previousCount = 0;
        await mutateSharedJson({
            store: "focus",
            path: getFocusSessionsFile(year),
            createEmpty: () => createEmptyFocusSessionsYearFile(year),
            normalize: (raw) => normalizeFocusSessionsYearFile(raw, year),
            mutate: (file) => {
                previousCount = file.sessions.length;
                if (!file.sessions.some((item) => item.id === normalized.id)) {
                    file.sessions.push(normalized);
                    added = true;
                }
            },
            validate: validateFocusYearFile,
            dispatch: false,
        });
        if (previousCount !== (currentIndex.yearCounts[String(year)] || 0)) {
            const repaired = await rebuildFocusIndexFromFiles();
            return { totalFocusTime: repaired.totalFocusTime, totalFocusTimes: repaired.totalFocusTimes };
        }
        if (!added) {
            return { totalFocusTime: currentIndex.totalFocusTime, totalFocusTimes: currentIndex.totalFocusTimes };
        }
        let index: FocusIndexFile;
        try {
            index = await mutateSharedJson({
                store: "focus",
                path: FOCUS_INDEX_FILE,
                createEmpty: createEmptyFocusIndexFile,
                normalize: normalizeFocusIndexFile,
                mutate: (draft) => {
                    draft.years = Array.from(new Set([...draft.years, year])).sort();
                    draft.yearCounts[String(year)] = (draft.yearCounts[String(year)] || 0) + 1;
                    if (normalized.segmentType !== "focus") {
                        if (normalized.status === "completed") draft.completedBreaks += 1;
                        else draft.cancelledBreaks += 1;
                    } else if (normalized.status === "completed") {
                        draft.completedSessions += 1;
                        draft.totalFocusTimes += 1;
                        draft.totalFocusTime += normalized.actualSeconds;
                    } else {
                        draft.cancelledSessions += 1;
                    }
                },
                validate: validateFocusIndex,
            });
        } catch (incrementalError) {
            try {
                index = await rebuildFocusIndexFromFiles();
            } catch (rebuildError) {
                throw new Error(`番茄钟会话已保存，但索引增量更新和完整重建均失败：${String(incrementalError)}；${String(rebuildError)}`);
            }
        }
        return { totalFocusTime: index.totalFocusTime, totalFocusTimes: index.totalFocusTimes };
    });
}

export function queueFocusSession(session: FocusSessionRecord): void {
    const year = Number(session.localDate.slice(0, 4));
    const normalized = normalizeFocusSession(session, year);
    if (!pendingFocusSessions.has(normalized.id)) pendingFocusSessions.set(normalized.id, normalized);
}

export async function flushPendingFocusSessions(): Promise<FocusStatistics | null> {
    let latest: FocusStatistics | null = null;
    while (pendingFocusSessions.size > 0 || focusSessionFlushPromise) {
        if (!focusSessionFlushPromise) {
            const snapshot = Array.from(pendingFocusSessions.values());
            focusSessionFlushPromise = (async () => {
                let snapshotLatest: FocusStatistics | null = null;
                for (const session of snapshot) {
                    snapshotLatest = await appendFocusSession(session);
                    pendingFocusSessions.delete(session.id);
                }
                return snapshotLatest;
            })().finally(() => {
                focusSessionFlushPromise = null;
            });
        }
        const result = await focusSessionFlushPromise;
        if (result) latest = result;
    }
    return latest;
}

function reportFocusFlushFailure(error: unknown): void {
    console.warn("[focusData] 番茄钟待写会话保存失败，已保留待重试", error);
}

registerSharedWidgetFlusher(async () => {
    await flushPendingFocusSessions();
});

const handleFocusVisibilityChange = () => {
    if (document.visibilityState === "hidden") void flushPendingFocusSessions().catch(reportFocusFlushFailure);
};
const handleFocusPageHide = () => {
    void flushPendingFocusSessions().catch(reportFocusFlushFailure);
};
if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleFocusVisibilityChange);
if (typeof window !== "undefined") window.addEventListener("pagehide", handleFocusPageHide);
registerSharedWidgetCleanup(() => {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleFocusVisibilityChange);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", handleFocusPageHide);
});
