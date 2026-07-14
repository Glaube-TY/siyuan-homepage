import {
    assertSharedWidgetYearFilesComplete,
    CYBMOK_STORE_TRANSACTION_LOCK,
    loadSharedJson,
    mutateSharedJson,
    readSharedWidgetDirectoryChecked,
    registerSharedWidgetCleanup,
    registerSharedWidgetFlusher,
    runSharedWidgetExclusive,
    type SharedRevisionedFile,
    type SharedWidgetMigrationMetadata,
} from "../sharedLocalStorage/sharedLocalStorage";
import {
    CYBMOK_BATCH_VERSION,
    CYBMOK_BATCHES_SCHEMA,
    CYBMOK_INDEX_FILE,
    CYBMOK_INDEX_SCHEMA,
    CYBMOK_INDEX_VERSION,
    CYBMOK_RECORDS_SCHEMA,
    getCYBMOKBatchesFile,
    SHARED_WIDGET_DATA_VERSION,
} from "../sharedLocalStorage/sharedWidgetStoragePaths";
import { assertSharedWidgetMigrationReady } from "../sharedLocalStorage/sharedWidgetMigration";

export interface CYBMOKRecord {
    date: string;
    count: number;
    createdAt: string;
    updatedAt: string;
}

export interface CYBMOKRecordsFile extends SharedRevisionedFile {
    records: CYBMOKRecord[];
    migration?: SharedWidgetMigrationMetadata;
}

export interface CYBMOKRuntimeBatch {
    id: string;
    kind: "batch";
    localDate: string;
    startedAt: string;
    endedAt: string;
    count: number;
    source: "runtime";
}

export interface CYBMOKLegacyDailyBatch {
    id: string;
    kind: "legacy-daily";
    localDate: string;
    startedAt: "";
    endedAt: "";
    count: number;
    source: "legacy-daily";
}

export type CYBMOKBatchRecord = CYBMOKRuntimeBatch | CYBMOKLegacyDailyBatch;

export interface CYBMOKBatchesYearFile extends SharedRevisionedFile {
    year: number;
    batches: CYBMOKBatchRecord[];
}

export interface CYBMOKMaxDay {
    localDate: string;
    count: number;
}

export interface CYBMOKIndexFile extends SharedRevisionedFile {
    years: number[];
    yearBatchCounts: Record<string, number>;
    yearKnockCounts: Record<string, number>;
    dailyTotals: Record<string, number>;
    totalKnocks: number;
    totalBatches: number;
    maxDay: CYBMOKMaxDay;
    migration?: SharedWidgetMigrationMetadata;
}

export interface CYBMOKStats {
    totalMerit: number;
    maxMeritDate: { date: string; count: number };
}

export interface CYBMOKStoreStatus {
    ok: boolean;
    missingFields: string[];
    message: string;
}

interface ActiveCYBMOKBatch {
    id: string;
    localDate: string;
    startedAt: string;
    lastKnockAt: string;
    count: number;
}

let activeBatch: ActiveCYBMOKBatch | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;
let batchSequence = 0;
const pendingBatches: CYBMOKRuntimeBatch[] = [];

function reportScheduledFlushFailure(error: unknown): void {
    console.warn("[cybmokData] 木鱼批次写入失败，已保留待写批次", error);
}

function finiteCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

export function toLocalCYBMOKDate(value: unknown): string {
    const text = typeof value === "string" ? value.trim() : "";
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const dashed = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dashed) return text;
    return "";
}

export function getLocalCYBMOKToday(now = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function toCYBMOKSecondTimestamp(value: Date | number = new Date()): string {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("木鱼批次时间无效");
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function createEmptyCYBMOKRecordsFile(): CYBMOKRecordsFile {
    return {
        schema: CYBMOK_RECORDS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: 0,
        updatedAt: new Date().toISOString(),
        records: [],
    };
}

export function normalizeCYBMOKRecordsFile(raw: unknown): CYBMOKRecordsFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("木鱼旧记录结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== CYBMOK_RECORDS_SCHEMA || value.version !== SHARED_WIDGET_DATA_VERSION) {
        throw new Error("木鱼旧记录 schema 或 version 不受支持");
    }
    if (!Array.isArray(value.records)) throw new Error("木鱼旧记录列表无效");
    const records = value.records.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("木鱼旧记录项无效");
        const row = item as Record<string, unknown>;
        const date = toLocalCYBMOKDate(row.date);
        if (!date) throw new Error("木鱼旧记录日期无效");
        return {
            date,
            count: finiteCount(row.count),
            createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
            updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
        };
    });
    return {
        schema: CYBMOK_RECORDS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: finiteCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        records,
        migration: value.migration as SharedWidgetMigrationMetadata | undefined,
    };
}

export function createEmptyCYBMOKIndexFile(): CYBMOKIndexFile {
    return {
        schema: CYBMOK_INDEX_SCHEMA,
        version: CYBMOK_INDEX_VERSION,
        revision: 0,
        updatedAt: new Date().toISOString(),
        years: [],
        yearBatchCounts: {},
        yearKnockCounts: {},
        dailyTotals: {},
        totalKnocks: 0,
        totalBatches: 0,
        maxDay: { localDate: "", count: 0 },
    };
}

export function createEmptyCYBMOKBatchesYearFile(year: number): CYBMOKBatchesYearFile {
    return {
        schema: CYBMOK_BATCHES_SCHEMA,
        version: CYBMOK_BATCH_VERSION,
        revision: 0,
        updatedAt: new Date().toISOString(),
        year,
        batches: [],
    };
}

export function normalizeCYBMOKIndexFile(raw: unknown): CYBMOKIndexFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("木鱼索引结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== CYBMOK_INDEX_SCHEMA || value.version !== CYBMOK_INDEX_VERSION
        || !Array.isArray(value.years) || !value.yearBatchCounts || typeof value.yearBatchCounts !== "object"
        || !value.yearKnockCounts || typeof value.yearKnockCounts !== "object"
        || !value.dailyTotals || typeof value.dailyTotals !== "object") {
        throw new Error("木鱼索引 schema、version 或内容无效");
    }
    const years = Array.from(new Set(value.years.map(Number)
        .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 9999))).sort();
    const yearBatchCounts: Record<string, number> = {};
    const yearKnockCounts: Record<string, number> = {};
    for (const year of years) {
        yearBatchCounts[String(year)] = finiteCount((value.yearBatchCounts as Record<string, unknown>)[String(year)]);
        yearKnockCounts[String(year)] = finiteCount((value.yearKnockCounts as Record<string, unknown>)[String(year)]);
    }
    const dailyTotals: Record<string, number> = {};
    for (const [date, count] of Object.entries(value.dailyTotals as Record<string, unknown>)) {
        const localDate = toLocalCYBMOKDate(date);
        if (localDate) dailyTotals[localDate] = finiteCount(count);
    }
    const rawMax = value.maxDay && typeof value.maxDay === "object" ? value.maxDay as Record<string, unknown> : {};
    return {
        schema: CYBMOK_INDEX_SCHEMA,
        version: CYBMOK_INDEX_VERSION,
        revision: finiteCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        years,
        yearBatchCounts,
        yearKnockCounts,
        dailyTotals,
        totalKnocks: finiteCount(value.totalKnocks),
        totalBatches: finiteCount(value.totalBatches),
        maxDay: { localDate: toLocalCYBMOKDate(rawMax.localDate), count: finiteCount(rawMax.count) },
        migration: value.migration as SharedWidgetMigrationMetadata | undefined,
    };
}

function normalizeCYBMOKBatch(raw: unknown, expectedYear: number): CYBMOKBatchRecord {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("木鱼批次记录无效");
    const value = raw as Record<string, unknown>;
    const text = (key: string) => typeof value[key] === "string" ? String(value[key]).trim() : "";
    const id = text("id");
    const localDate = toLocalCYBMOKDate(value.localDate);
    const count = finiteCount(value.count);
    if (!id || !localDate || Number(localDate.slice(0, 4)) !== expectedYear || count <= 0) {
        throw new Error("木鱼批次关键字段无效");
    }
    if (value.kind === "legacy-daily" && value.source === "legacy-daily") {
        if (text("startedAt") || text("endedAt")) throw new Error("木鱼旧每日记录不得伪造时间");
        return { id, kind: "legacy-daily", localDate, startedAt: "", endedAt: "", count, source: "legacy-daily" };
    }
    const startedAt = text("startedAt");
    const endedAt = text("endedAt");
    if (value.kind !== "batch" || value.source !== "runtime" || !Number.isFinite(Date.parse(startedAt))
        || !Number.isFinite(Date.parse(endedAt))) {
        throw new Error("木鱼运行批次结构无效");
    }
    return { id, kind: "batch", localDate, startedAt, endedAt, count, source: "runtime" };
}

export function normalizeCYBMOKBatchesYearFile(raw: unknown, expectedYear: number): CYBMOKBatchesYearFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("木鱼年度批次结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== CYBMOK_BATCHES_SCHEMA || value.version !== CYBMOK_BATCH_VERSION
        || value.year !== expectedYear || !Array.isArray(value.batches)) {
        throw new Error("木鱼年度批次 schema、version 或 year 无效");
    }
    const batches = value.batches.map((item) => normalizeCYBMOKBatch(item, expectedYear));
    if (new Set(batches.map((batch) => batch.id)).size !== batches.length) throw new Error("木鱼年度批次存在重复 ID");
    return {
        schema: CYBMOK_BATCHES_SCHEMA,
        version: CYBMOK_BATCH_VERSION,
        revision: finiteCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        year: expectedYear,
        batches,
    };
}

function batchEquals(left: CYBMOKBatchRecord | undefined, right: CYBMOKBatchRecord): boolean {
    return Boolean(left && left.id === right.id && left.kind === right.kind && left.localDate === right.localDate
        && left.startedAt === right.startedAt && left.endedAt === right.endedAt
        && left.count === right.count && left.source === right.source);
}

export function validateCYBMOKYearFile(actual: CYBMOKBatchesYearFile, expected: CYBMOKBatchesYearFile): void {
    const actualById = new Map(actual.batches.map((batch) => [batch.id, batch]));
    if (actual.batches.length !== expected.batches.length
        || expected.batches.some((batch) => !batchEquals(actualById.get(batch.id), batch))) {
        throw new Error(`木鱼 ${expected.year} 年批次写入后校验失败`);
    }
}

export function validateCYBMOKIndex(actual: CYBMOKIndexFile, expected: CYBMOKIndexFile): void {
    const dates = Object.keys(expected.dailyTotals);
    if (actual.years.length !== expected.years.length
        || expected.years.some((year, index) => actual.years[index] !== year
            || actual.yearBatchCounts[String(year)] !== expected.yearBatchCounts[String(year)]
            || actual.yearKnockCounts[String(year)] !== expected.yearKnockCounts[String(year)])
        || Object.keys(actual.dailyTotals).length !== dates.length
        || dates.some((date) => actual.dailyTotals[date] !== expected.dailyTotals[date])
        || actual.totalKnocks !== expected.totalKnocks || actual.totalBatches !== expected.totalBatches
        || actual.maxDay.localDate !== expected.maxDay.localDate || actual.maxDay.count !== expected.maxDay.count) {
        throw new Error("木鱼索引写入后业务数据校验失败");
    }
}

export function createLegacyCYBMOKBatch(localDate: string, count: number): CYBMOKLegacyDailyBatch {
    const date = toLocalCYBMOKDate(localDate);
    if (!date || finiteCount(count) <= 0) throw new Error("木鱼旧每日数据无效");
    return {
        id: `cybmok-legacy-daily-${date}`,
        kind: "legacy-daily",
        localDate: date,
        startedAt: "",
        endedAt: "",
        count: finiteCount(count),
        source: "legacy-daily",
    };
}

export async function listCYBMOKBatchYears(): Promise<number[]> {
    const years: number[] = [];
    for (const entry of await readSharedWidgetDirectoryChecked("cybmok")) {
        const match = entry.name.match(/^cybmok-batches-(\d{4})\.json$/);
        if (!match) continue;
        if (entry.isDir) throw new Error(`木鱼年度明细路径不是文件：${entry.name}`);
        years.push(Number(match[1]));
    }
    return Array.from(new Set(years)).sort((left, right) => left - right);
}

function calculateCYBMOKMaxDay(dailyTotals: Record<string, number>): CYBMOKMaxDay {
    return Object.entries(dailyTotals).reduce<CYBMOKMaxDay>((max, [localDate, count]) => (
        count > max.count || (count === max.count && localDate < max.localDate) ? { localDate, count } : max
    ), { localDate: "", count: 0 });
}

function isCYBMOKIndexConsistent(index: CYBMOKIndexFile): boolean {
    const totalBatches = index.years.reduce(
        (sum, year) => sum + (index.yearBatchCounts[String(year)] || 0),
        0,
    );
    const yearKnocks = index.years.reduce(
        (sum, year) => sum + (index.yearKnockCounts[String(year)] || 0),
        0,
    );
    const dailyKnocks = Object.values(index.dailyTotals).reduce((sum, count) => sum + count, 0);
    const maxDay = calculateCYBMOKMaxDay(index.dailyTotals);
    return totalBatches === index.totalBatches
        && yearKnocks === index.totalKnocks
        && dailyKnocks === index.totalKnocks
        && maxDay.localDate === index.maxDay.localDate
        && maxDay.count === index.maxDay.count;
}

export async function rebuildCYBMOKIndexFromFiles(options: {
    migration?: SharedWidgetMigrationMetadata;
    dispatch?: boolean;
} = {}): Promise<CYBMOKIndexFile> {
    const existing = await loadSharedJson(CYBMOK_INDEX_FILE, normalizeCYBMOKIndexFile);
    const years = await listCYBMOKBatchYears();
    assertSharedWidgetYearFilesComplete(existing?.years || [], years);
    const yearBatchCounts: Record<string, number> = {};
    const yearKnockCounts: Record<string, number> = {};
    const dailyTotals: Record<string, number> = {};
    let totalKnocks = 0;
    let totalBatches = 0;
    for (const year of years) {
        const file = await loadSharedJson(getCYBMOKBatchesFile(year), (raw) => normalizeCYBMOKBatchesYearFile(raw, year));
        if (!file) throw new Error(`年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`);
        const batches = file.batches;
        yearBatchCounts[String(year)] = batches.length;
        yearKnockCounts[String(year)] = batches.reduce((sum, batch) => sum + batch.count, 0);
        totalBatches += batches.length;
        totalKnocks += yearKnockCounts[String(year)];
        for (const batch of batches) dailyTotals[batch.localDate] = (dailyTotals[batch.localDate] || 0) + batch.count;
    }
    const maxDay = calculateCYBMOKMaxDay(dailyTotals);
    return mutateSharedJson({
        store: "cybmok",
        path: CYBMOK_INDEX_FILE,
        createEmpty: createEmptyCYBMOKIndexFile,
        normalize: normalizeCYBMOKIndexFile,
        mutate: (index) => {
            index.years = years;
            index.yearBatchCounts = yearBatchCounts;
            index.yearKnockCounts = yearKnockCounts;
            index.dailyTotals = dailyTotals;
            index.totalKnocks = totalKnocks;
            index.totalBatches = totalBatches;
            index.maxDay = maxDay;
            index.migration = options.migration || existing?.migration;
        },
        validate: validateCYBMOKIndex,
        dispatch: options.dispatch !== false,
    });
}

export async function getCYBMOKStoreStatus(): Promise<CYBMOKStoreStatus> {
    try {
        await assertSharedWidgetMigrationReady("cybmok");
        const index = await runSharedWidgetExclusive(CYBMOK_STORE_TRANSACTION_LOCK, loadOrRepairCYBMOKIndex);
        if (index.migration?.status === "failed") {
            return { ok: false, missingFields: [], message: "旧数据迁移尚未完成，请重新加载插件后重试。" };
        }
        return {
            ok: true,
            missingFields: [],
            message: index.migration?.cleanupStatus === "pending" ? "旧数据清理待重试" : "本地数据已就绪",
        };
    } catch (error) {
        return { ok: false, missingFields: [], message: error instanceof Error ? error.message : "本地存储不可用" };
    }
}

export async function loadCYBMOKStats(): Promise<CYBMOKStats> {
    await assertSharedWidgetMigrationReady("cybmok");
    const index = await runSharedWidgetExclusive(CYBMOK_STORE_TRANSACTION_LOCK, loadOrRepairCYBMOKIndex);
    const max = index.maxDay;
    const formatted = max.localDate
        ? `${max.localDate.slice(0, 4)}年${max.localDate.slice(5, 7)}月${max.localDate.slice(8, 10)}日`
        : "暂无";
    return { totalMerit: index.totalKnocks, maxMeritDate: { date: formatted, count: max.count } };
}

async function loadOrRepairCYBMOKIndex(options: { dispatch?: boolean } = {}): Promise<CYBMOKIndexFile> {
    const index = await loadSharedJson(CYBMOK_INDEX_FILE, normalizeCYBMOKIndexFile);
    if (!index) return rebuildCYBMOKIndexFromFiles({ dispatch: options.dispatch });
    const years = await listCYBMOKBatchYears();
    assertSharedWidgetYearFilesComplete(index.years, years);
    if (!isCYBMOKIndexConsistent(index) || years.some((year) => !index.years.includes(year))) {
        return rebuildCYBMOKIndexFromFiles({ migration: index.migration, dispatch: options.dispatch });
    }
    const currentYear = new Date().getFullYear();
    for (const year of [currentYear - 1, currentYear]) {
        const file = await loadSharedJson(
            getCYBMOKBatchesFile(year),
            (raw) => normalizeCYBMOKBatchesYearFile(raw, year),
        );
        if (years.includes(year) && !file) {
            throw new Error(`年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`);
        }
        const batches = file?.batches || [];
        const knockCount = batches.reduce((sum, batch) => sum + batch.count, 0);
        if (batches.length !== (index.yearBatchCounts[String(year)] || 0)
            || knockCount !== (index.yearKnockCounts[String(year)] || 0)
            || Boolean(file) !== index.years.includes(year)) {
            return rebuildCYBMOKIndexFromFiles({ migration: index.migration, dispatch: options.dispatch });
        }
    }
    return index;
}

async function appendCYBMOKBatches(batches: CYBMOKRuntimeBatch[]): Promise<void> {
    if (batches.length === 0) return;
    await runSharedWidgetExclusive(CYBMOK_STORE_TRANSACTION_LOCK, async () => {
        const index = await loadOrRepairCYBMOKIndex({ dispatch: false });
        const byYear = new Map<number, CYBMOKRuntimeBatch[]>();
        const addedBatches: CYBMOKRuntimeBatch[] = [];
        let indexWasInconsistent = false;
        for (const batch of batches) {
            const year = Number(batch.localDate.slice(0, 4));
            if (!byYear.has(year)) byYear.set(year, []);
            byYear.get(year)!.push(batch);
        }
        for (const [year, yearBatches] of byYear) {
            let previousBatchCount = 0;
            let previousKnockCount = 0;
            await mutateSharedJson({
                store: "cybmok",
                path: getCYBMOKBatchesFile(year),
                createEmpty: () => createEmptyCYBMOKBatchesYearFile(year),
                normalize: (raw) => normalizeCYBMOKBatchesYearFile(raw, year),
                mutate: (file) => {
                    previousBatchCount = file.batches.length;
                    previousKnockCount = file.batches.reduce((sum, batch) => sum + batch.count, 0);
                    const ids = new Set(file.batches.map((batch) => batch.id));
                    for (const batch of yearBatches) {
                        if (ids.has(batch.id)) continue;
                        file.batches.push(batch);
                        ids.add(batch.id);
                        addedBatches.push(batch);
                    }
                },
                validate: validateCYBMOKYearFile,
                dispatch: false,
            });
            if (previousBatchCount !== (index.yearBatchCounts[String(year)] || 0)
                || previousKnockCount !== (index.yearKnockCounts[String(year)] || 0)) {
                indexWasInconsistent = true;
            }
        }
        if (indexWasInconsistent) {
            await rebuildCYBMOKIndexFromFiles({ migration: index.migration });
            return;
        }
        if (addedBatches.length === 0) return;
        try {
            await mutateSharedJson({
                store: "cybmok",
                path: CYBMOK_INDEX_FILE,
                createEmpty: createEmptyCYBMOKIndexFile,
                normalize: normalizeCYBMOKIndexFile,
                mutate: (draft) => {
                    const years = new Set(draft.years);
                    for (const batch of addedBatches) {
                        const year = Number(batch.localDate.slice(0, 4));
                        const yearKey = String(year);
                        years.add(year);
                        draft.yearBatchCounts[yearKey] = (draft.yearBatchCounts[yearKey] || 0) + 1;
                        draft.yearKnockCounts[yearKey] = (draft.yearKnockCounts[yearKey] || 0) + batch.count;
                        draft.dailyTotals[batch.localDate] = (draft.dailyTotals[batch.localDate] || 0) + batch.count;
                        draft.totalKnocks += batch.count;
                        draft.totalBatches += 1;
                    }
                    draft.years = Array.from(years).sort();
                    draft.maxDay = calculateCYBMOKMaxDay(draft.dailyTotals);
                },
                validate: validateCYBMOKIndex,
            });
        } catch (incrementalError) {
            try {
                await rebuildCYBMOKIndexFromFiles({ migration: index.migration });
            } catch (rebuildError) {
                throw new Error(`木鱼批次已保存，但索引增量更新和完整重建均失败：${String(incrementalError)}；${String(rebuildError)}`);
            }
        }
    });
}

function clearIdleTimer(): void {
    if (!idleTimer) return;
    clearTimeout(idleTimer);
    idleTimer = null;
}

function finalizeActiveBatch(): void {
    clearIdleTimer();
    if (!activeBatch) return;
    pendingBatches.push({
        id: activeBatch.id,
        kind: "batch",
        localDate: activeBatch.localDate,
        startedAt: activeBatch.startedAt,
        endedAt: activeBatch.lastKnockAt,
        count: activeBatch.count,
        source: "runtime",
    });
    activeBatch = null;
}

async function persistPendingBatches(): Promise<void> {
    if (flushPromise) return flushPromise;
    const snapshot = pendingBatches.slice();
    if (snapshot.length === 0) return;
    const snapshotIds = new Set(snapshot.map((batch) => batch.id));
    flushPromise = (async () => {
        await assertSharedWidgetMigrationReady("cybmok");
        await appendCYBMOKBatches(snapshot);
        for (let index = pendingBatches.length - 1; index >= 0; index -= 1) {
            if (snapshotIds.has(pendingBatches[index].id)) pendingBatches.splice(index, 1);
        }
    })().finally(() => {
        flushPromise = null;
    });
    return flushPromise;
}

function scheduleCYBMOKFlush(): void {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
        idleTimer = null;
        finalizeActiveBatch();
        void persistPendingBatches().then(() => {
            if (pendingBatches.length > 0) return persistPendingBatches();
        }).catch(reportScheduledFlushFailure);
    }, 1000);
}

export function recordCYBMOKKnock(now = new Date()): void {
    const localDate = getLocalCYBMOKToday(now);
    const timestamp = toCYBMOKSecondTimestamp(now);
    if (activeBatch && activeBatch.localDate !== localDate) {
        finalizeActiveBatch();
        void persistPendingBatches().catch(reportScheduledFlushFailure);
    }
    if (!activeBatch) {
        batchSequence += 1;
        activeBatch = {
            id: `cybmok-batch-${now.getTime()}-${batchSequence}`,
            localDate,
            startedAt: timestamp,
            lastKnockAt: timestamp,
            count: 0,
        };
    }
    activeBatch.count += 1;
    activeBatch.lastKnockAt = timestamp;
    scheduleCYBMOKFlush();
}

export async function flushPendingCYBMOKKnocks(): Promise<void> {
    finalizeActiveBatch();
    while (pendingBatches.length > 0 || flushPromise) {
        if (flushPromise) await flushPromise;
        else await persistPendingBatches();
    }
}

registerSharedWidgetFlusher(flushPendingCYBMOKKnocks);

const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") void flushPendingCYBMOKKnocks().catch(reportScheduledFlushFailure);
};
const handlePageHide = () => {
    void flushPendingCYBMOKKnocks().catch(reportScheduledFlushFailure);
};
if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibilityChange);
if (typeof window !== "undefined") window.addEventListener("pagehide", handlePageHide);
registerSharedWidgetCleanup(() => {
    clearIdleTimer();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", handlePageHide);
});
