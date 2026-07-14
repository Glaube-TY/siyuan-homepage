import { getFileChecked, getTag, lsNotebooks, putFileChecked, sql } from "@/api";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
import {
    prepareChangedRecentDocsForIndex,
    readTaskIndexSnapshot,
    runHomepageManualIndexSqlQuery,
    type ComponentDataMode,
    type ComponentRecentDocSnapshotDoc,
} from "@/components/tools/siyuanComponentDataApi";
import { parseTaskLine } from "@/components/utils/widgetBlock/widget/tasksPlus/tasksPlusParser";

export interface StatisticalDataResult {
    value: number | string | null;
    status: "ok" | "empty" | "unsupported" | "error";
    message?: string;
    mode?: ComponentDataMode;
}

type StatIndexKey =
    | "blocksCount"
    | "docsCount"
    | "wordsCount"
    | "dailynotesCount"
    | "citationCount"
    | "codeBlocksCount"
    | "mathBlocksCount"
    | "headingBlocksCount"
    | "paragraphBlocksCount";

type StatTotals = Record<StatIndexKey, number>;

interface StatBlockRow {
    id?: string;
    root_id?: string;
    rootID?: string;
    box?: string;
    path?: string;
    hpath?: string;
    hPath?: string;
    ial?: unknown;
    type?: string;
    subtype?: string;
    content?: string;
    markdown?: string;
    created?: string;
    updated?: string;
}

/**
 * 单个文档的统计贡献。不保存任何块内容或块列表，只保存聚合数字。
 */
interface StatDocContribution {
    id: string;
    box?: string;
    path?: string;
    hpath?: string;
    updated?: string;
    created?: string;
    totals: StatTotals;
}

/**
 * 统计索引文件结构。所有数字按文档汇总，不保留块级明细。
 */
interface StatIndexPayload {
    [key: string]: unknown;
    version: number;
    complete: boolean;
    updatedAt: string;
    totals: StatTotals;
    docs: Record<string, StatDocContribution>;
    firstBlockCreated?: string;
}

const COMPONENT_INDEX_DIR = "/data/storage/petal/siyuan-homepage";
export const STAT_INDEX_PATH = `${COMPONENT_INDEX_DIR}/statistical-index.json`;
export const STAT_INDEX_UPDATED_EVENT = "siyuan-homepage:stat-index-updated";
export const STAT_INDEX_VERSION = 2;
const STAT_REFRESH_TTL_MS = 2 * 60 * 1000;
const STAT_REBUILD_PAGE_SIZE = 2000;
const STAT_REBUILD_MAX_ROWS = 200000;
const STAT_INDEX_EMPTY_MESSAGE = "统计索引尚未完整建立，请到主页设置 → 检索管理 → 重建统计索引。";
const statRefreshMemory = new Map<string, number>();
let taskStatsPromise: Promise<Record<TaskStatKey, number> | null> | null = null;
let ensureFirstBlockCreatedPromise: Promise<string> | null = null;
let firstBlockCreatedPersisted = false;
let firstBlockCreatedQueryPending = false;

const STAT_KEYS: StatIndexKey[] = [
    "blocksCount",
    "docsCount",
    "wordsCount",
    "dailynotesCount",
    "citationCount",
    "codeBlocksCount",
    "mathBlocksCount",
    "headingBlocksCount",
    "paragraphBlocksCount",
];

function emptyTotals(): StatTotals {
    return {
        blocksCount: 0,
        docsCount: 0,
        wordsCount: 0,
        dailynotesCount: 0,
        citationCount: 0,
        codeBlocksCount: 0,
        mathBlocksCount: 0,
        headingBlocksCount: 0,
        paragraphBlocksCount: 0,
    };
}

function normalizeTotals(value: unknown): StatTotals {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const totals = emptyTotals();
    for (const key of STAT_KEYS) {
        const count = Number(raw[key]);
        totals[key] = Number.isFinite(count) && count > 0 ? count : 0;
    }
    return totals;
}

function emptyStatIndex(): StatIndexPayload {
    return {
        version: STAT_INDEX_VERSION,
        complete: false,
        updatedAt: "",
        totals: emptyTotals(),
        docs: {},
    };
}

function makeJsonBlob(value: unknown): Blob {
    return new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
}

async function fileContentToObject(raw: unknown): Promise<unknown> {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        return trimmed ? JSON.parse(trimmed) : undefined;
    }
    if (raw instanceof Blob) {
        const text = await raw.text();
        return text.trim() ? JSON.parse(text) : undefined;
    }
    if (typeof raw === "object" && "text" in raw && typeof (raw as { text: unknown }).text === "function") {
        const text = await (raw as { text: () => Promise<string> }).text();
        return text.trim() ? JSON.parse(text) : undefined;
    }
    if (raw instanceof ArrayBuffer || (raw && typeof (raw as ArrayBufferView).byteLength === "number")) {
        const text = new TextDecoder().decode(raw as ArrayBufferView);
        return text.trim() ? JSON.parse(text) : undefined;
    }
    if (typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.code === "number" && obj.code !== 0) {
            return undefined;
        }
        if (typeof obj.code === "number" && obj.code === 0 && "data" in obj) {
            return fileContentToObject(obj.data);
        }
        return obj;
    }
    return undefined;
}

async function readStatIndexWithMeta(): Promise<{ fileExists: boolean; invalid: boolean; payload: StatIndexPayload }> {
    try {
        const raw = await getFileChecked(STAT_INDEX_PATH);
        const parsed = await fileContentToObject(raw);
        if (parsed === undefined || parsed === null) {
            return { fileExists: false, invalid: false, payload: emptyStatIndex() };
        }
        const isLike = isStatIndexPayloadLike(parsed);
        return {
            fileExists: true,
            invalid: !isLike,
            payload: isLike ? normalizeStatIndex(parsed) : emptyStatIndex(),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("file does not exist") || msg.includes("404")) {
            return { fileExists: false, invalid: false, payload: emptyStatIndex() };
        }
        throw new Error(`读取统计索引失败：${msg}`);
    }
}

function normalizeContribution(value: unknown, fallbackId: string): StatDocContribution | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const id = typeof raw.id === "string" && raw.id ? raw.id : fallbackId;
    if (!id) return null;
    return {
        id,
        box: typeof raw.box === "string" ? raw.box : "",
        path: typeof raw.path === "string" ? raw.path : "",
        hpath: typeof raw.hpath === "string" ? raw.hpath : "",
        updated: typeof raw.updated === "string" ? raw.updated : "",
        created: normalizeCreated(raw.created),
        totals: normalizeTotals(raw.totals),
    };
}

function isStatIndexPayloadLike(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const raw = value as Record<string, unknown>;
    if (typeof raw.version !== "number" && Number.isNaN(Number(raw.version))) return false;
    if (typeof raw.updatedAt !== "string") return false;
    if (!raw.totals || typeof raw.totals !== "object") return false;
    if (!raw.docs || typeof raw.docs !== "object") return false;
    return true;
}

function normalizeStatIndex(value: unknown): StatIndexPayload {
    if (!value || typeof value !== "object") return emptyStatIndex();
    const raw = value as Record<string, unknown>;
    const docs: Record<string, StatDocContribution> = {};
    const rawDocs = raw.docs && typeof raw.docs === "object"
        ? raw.docs as Record<string, unknown>
        : {};
    for (const [id, contribution] of Object.entries(rawDocs)) {
        const normalized = normalizeContribution(contribution, id);
        if (normalized?.id) {
            docs[normalized.id] = normalized;
        }
    }
    return {
        ...raw,
        version: Number(raw.version) || STAT_INDEX_VERSION,
        complete: Number(raw.version) === STAT_INDEX_VERSION && raw.complete === true,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        totals: normalizeTotals(raw.totals),
        docs,
        firstBlockCreated: normalizeCreated(raw.firstBlockCreated),
    };
}

async function writeStatIndex(payload: StatIndexPayload): Promise<void> {
    try {
        await putFileChecked(COMPONENT_INDEX_DIR, true, makeJsonBlob({}));
    } catch {
        // 旧版内核可能不需要显式创建目录，写入失败时继续尝试写索引文件。
    }
    await putFileChecked(STAT_INDEX_PATH, false, makeJsonBlob(payload));

    const { fileExists, invalid, payload: saved } = await readStatIndexWithMeta();
    if (!fileExists || invalid || saved.version !== payload.version || saved.complete !== payload.complete
        || saved.updatedAt !== payload.updatedAt || Object.keys(saved.docs).length !== Object.keys(payload.docs).length
        || normalizeCreated(saved.firstBlockCreated) !== normalizeCreated(payload.firstBlockCreated)) {
        throw new Error("统计索引写入后读回为空，请检查思源存储权限或 getFile/putFile 返回结构。");
    }
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function emptyStat(message?: string): StatisticalDataResult {
    return {
        value: null,
        status: "empty",
        message: message || STAT_INDEX_EMPTY_MESSAGE,
    };
}

function unsupportedStat(message?: string): StatisticalDataResult {
    return {
        value: null,
        status: "unsupported",
        message: message || "当前统计项暂不支持。",
    };
}

function errorStat(message: string): StatisticalDataResult {
    return {
        value: null,
        status: "error",
        message,
    };
}

function okStat(value: number | string, mode?: ComponentDataMode): StatisticalDataResult {
    return {
        value,
        status: "ok",
        mode,
    };
}

type TaskStatKey = "tasksCount" | "doneTasksCount" | "undoneTasksCount" | "dueTodayTasksCount"
    | "overdueTasksCount" | "highPriorityTasksCount" | "unscheduledTasksCount";

function localDateString(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validLocalDate(value: string): string {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1])
        && date.getMonth() === Number(match[2]) - 1
        && date.getDate() === Number(match[3]) ? value : "";
}

async function readAllTaskStats(): Promise<Record<TaskStatKey, number> | null> {
    if (taskStatsPromise) return taskStatsPromise;
    const promise = (async () => {
        const snapshot = await readTaskIndexSnapshot();
        if (!snapshot.fileExists) return null;
        const rows = snapshot.items;
        const today = localDateString();
        const result: Record<TaskStatKey, number> = {
            tasksCount: rows.length,
            doneTasksCount: 0,
            undoneTasksCount: 0,
            dueTodayTasksCount: 0,
            overdueTasksCount: 0,
            highPriorityTasksCount: 0,
            unscheduledTasksCount: 0,
        };
        for (const row of rows) {
            if (row.checked === true) {
                result.doneTasksCount += 1;
                continue;
            }
            if (row.checked !== false) continue;
            result.undoneTasksCount += 1;
            const parsed = parseTaskLine(row.markdown || row.content || "").parsed;
            const deadline = validLocalDate(parsed.deadline);
            if (deadline === today) result.dueTodayTasksCount += 1;
            if (deadline && deadline < today) result.overdueTasksCount += 1;
            if ((parsed.priority.match(/❗/g) || []).length >= 3) result.highPriorityTasksCount += 1;
            if (!parsed.startDate && !parsed.deadline) result.unscheduledTasksCount += 1;
        }
        return result;
    })();
    taskStatsPromise = promise;
    const clearPromise = () => setTimeout(() => {
        if (taskStatsPromise === promise) taskStatsPromise = null;
    }, 1000);
    void promise.then(clearPromise, clearPromise);
    return promise;
}

async function queryTaskIndexStat(type: TaskStatKey): Promise<StatisticalDataResult> {
    const stats = await readAllTaskStats();
    if (!stats) {
        return emptyStat("任务索引尚未建立，请到主页设置 → 检索管理建立任务索引。");
    }
    return okStat(stats[type], "index");
}

function normalizeCreated(value: unknown): string {
    const created = typeof value === "string" ? value.trim() : "";
    return /^\d{8,14}$/.test(created) ? created : "";
}

async function queryEarliestBlockCreated(): Promise<string> {
    const rows = await sql(`
        SELECT created
        FROM blocks
        WHERE created IS NOT NULL
          AND created <> ''
          AND length(created) >= 8
        ORDER BY created ASC, id ASC
        LIMIT 1
    `);
    const firstRow = Array.isArray(rows) ? rows[0] as { created?: unknown } | undefined : undefined;
    return normalizeCreated(firstRow?.created);
}

async function readStatIndexForFirstBlockCreated(): Promise<{ fileExists: boolean; invalid: boolean; payload: StatIndexPayload }> {
    try {
        return await readStatIndexWithMeta();
    } catch {
        throw new Error("统计索引损坏，无法读取或保存开始时间。请到主页设置 → 检索管理 → 重建统计索引。");
    }
}

export async function ensureFirstBlockCreated(): Promise<string> {
    const current = await readStatIndexForFirstBlockCreated();
    if (current.invalid) {
        throw new Error("统计索引损坏，无法保存开始时间。请到主页设置 → 检索管理 → 重建统计索引。");
    }
    const existing = normalizeCreated(current.payload.firstBlockCreated);
    if (existing) {
        firstBlockCreatedPersisted = true;
        return existing;
    }

    if (!current.fileExists && firstBlockCreatedPersisted && !firstBlockCreatedQueryPending) {
        ensureFirstBlockCreatedPromise = null;
        firstBlockCreatedPersisted = false;
    }
    if (ensureFirstBlockCreatedPromise) return ensureFirstBlockCreatedPromise;

    firstBlockCreatedQueryPending = true;
    ensureFirstBlockCreatedPromise = (async () => {
        const created = await queryEarliestBlockCreated();
        if (!created) return "";

        const latest = await readStatIndexForFirstBlockCreated();
        if (latest.invalid) {
            throw new Error("统计索引损坏，无法保存开始时间。请到主页设置 → 检索管理 → 重建统计索引。");
        }
        const latestCreated = normalizeCreated(latest.payload.firstBlockCreated);
        if (latestCreated) {
            firstBlockCreatedPersisted = true;
            return latestCreated;
        }

        latest.payload.firstBlockCreated = created;
        await writeStatIndex(latest.payload);
        const verified = await readStatIndexForFirstBlockCreated();
        if (verified.invalid || normalizeCreated(verified.payload.firstBlockCreated) !== created) {
            throw new Error("开始时间写入统计索引后校验失败。");
        }
        firstBlockCreatedPersisted = true;
        return created;
    })().finally(() => {
        firstBlockCreatedQueryPending = false;
    });
    return ensureFirstBlockCreatedPromise;
}

function getMinCreated(current: string | undefined, next: unknown): string {
    const candidate = normalizeCreated(next);
    if (!candidate) return current || "";
    return !current || candidate < current ? candidate : current;
}

function formatCreatedDate(created: string): string {
    return `${created.slice(0, 4)}年${created.slice(4, 6)}月${created.slice(6, 8)}日`;
}

function dispatchStatIndexUpdated(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STAT_INDEX_UPDATED_EVENT));
}

function getRootId(row: StatBlockRow): string {
    return String(row.root_id || row.rootID || row.id || "");
}

function getRowHpath(row: StatBlockRow): string {
    return String(row.hpath || row.hPath || "");
}

function getMaxUpdated(current: string | undefined, next: string | undefined): string {
    const left = String(current || "");
    const right = String(next || "");
    return right.localeCompare(left) > 0 ? right : left;
}

function normalizeIal(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return "";
    return Object.entries(value as Record<string, unknown>)
        .map(([key, attrValue]) => `${key}="${String(attrValue ?? "")}"`)
        .join(" ");
}

function isDailyNoteRow(row: StatBlockRow): boolean {
    if (row.type !== "d") return false;
    const ial = normalizeIal(row.ial);
    if (ial.includes("custom-dailynote-")) return true;
    const title = String(row.content || "").trim();
    const pathText = `${row.path || ""}\n${getRowHpath(row)}`;
    return /^\d{4}[-./年]\d{1,2}[-./月]\d{1,2}日?$/.test(title)
        && /(^|[\/\\])(daily|journal|日记|日志|每日笔记)([\/\\]|$)/i.test(pathText);
}

function hasCitation(row: StatBlockRow): boolean {
    return String(row.markdown || row.content || "").includes("((");
}

function applyRowToTotals(totals: StatTotals, row: StatBlockRow, sign = 1): void {
    totals.blocksCount += sign;
    totals.wordsCount += sign * String(row.content || row.markdown || "").length;
    if (row.type === "d") {
        totals.docsCount += sign;
        if (isDailyNoteRow(row)) {
            totals.dailynotesCount += sign;
        }
    }
    if (hasCitation(row)) {
        totals.citationCount += sign;
    }
    if (row.type === "c") {
        totals.codeBlocksCount += sign;
    }
    if (row.type === "m") {
        totals.mathBlocksCount += sign;
    }
    if (row.type === "h") {
        totals.headingBlocksCount += sign;
    }
    if (row.type === "p") {
        totals.paragraphBlocksCount += sign;
    }
}

function applyContribution(totals: StatTotals, contribution: StatDocContribution | undefined, sign: 1 | -1): void {
    if (!contribution) return;
    for (const key of STAT_KEYS) {
        totals[key] = Math.max(0, totals[key] + sign * (Number(contribution.totals[key]) || 0));
    }
}

function buildContributionFromRows(
    doc: ComponentRecentDocSnapshotDoc,
    rows: StatBlockRow[],
): StatDocContribution {
    const firstRow = rows[0] || {};
    const contribution: StatDocContribution = {
        id: doc.id,
        box: doc.box || firstRow.box || "",
        path: doc.path || firstRow.path || "",
        hpath: doc.hpath || getRowHpath(firstRow) || "",
        updated: doc.updated || firstRow.updated || "",
        created: "",
        totals: emptyTotals(),
    };
    for (const row of rows) {
        applyRowToTotals(contribution.totals, row);
        contribution.updated = getMaxUpdated(contribution.updated, row.updated);
        contribution.created = getMinCreated(contribution.created, row.created);
        if (!contribution.box && row.box) contribution.box = row.box;
        if (!contribution.path && row.path) contribution.path = row.path;
        if (!contribution.hpath) contribution.hpath = getRowHpath(row);
    }
    return contribution;
}

async function queryStatBlocksByRootIds(rootIds: string[]): Promise<{ blocksByRoot: Map<string, StatBlockRow[]>; truncated: boolean }> {
    const PAGE_SIZE = 2000;
    const MAX_ROWS_PER_CHUNK = 50000;
    const blocksByRoot = new Map<string, StatBlockRow[]>();
    const uniqueIds = Array.from(new Set(rootIds.filter(Boolean)));
    let truncated = false;
    for (const id of uniqueIds) {
        blocksByRoot.set(id, []);
    }
    for (let i = 0; i < uniqueIds.length; i += 16) {
        const chunk = uniqueIds.slice(i, i + 16);
        const escaped = chunk.map((id) => `'${escapeSqlString(id)}'`).join(",");
        let offset = 0;
        let pageRows: unknown[];
        do {
            pageRows = await sql(`
                SELECT id, root_id, box, path, hpath, ial, type, subtype, content, markdown, created, updated
                FROM blocks
                WHERE root_id IN (${escaped}) OR id IN (${escaped})
                ORDER BY updated DESC, id DESC
                LIMIT ${PAGE_SIZE} OFFSET ${offset}
            `);
            const rows = Array.isArray(pageRows) ? pageRows as StatBlockRow[] : [];
            for (const row of rows) {
                const rootId = getRootId(row);
                if (!blocksByRoot.has(rootId)) blocksByRoot.set(rootId, []);
                blocksByRoot.get(rootId)!.push(row);
            }
            offset += PAGE_SIZE;
            if (offset >= MAX_ROWS_PER_CHUNK) {
                truncated = true;
                break;
            }
        } while (pageRows.length === PAGE_SIZE);
    }
    return { blocksByRoot, truncated };
}

export async function refreshStatIndexFromRecentDocuments(
    plugin?: any,
    options: { force?: boolean; ttlMs?: number } = {},
): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();
    const ttlMs = options.ttlMs ?? STAT_REFRESH_TTL_MS;

    try {
        const existing = await readStatIndexWithMeta();
        if (!existing.fileExists || existing.payload.version !== STAT_INDEX_VERSION || existing.payload.complete !== true) {
            return {
                lastRunAt: now,
                lastStatus: "idle",
                lastMessage: STAT_INDEX_EMPTY_MESSAGE,
                migratedCount: 0,
                skippedCount: 0,
            };
        }
        const lastRunAt = statRefreshMemory.get("statistical") || 0;
        if (!options.force && Date.now() - lastRunAt < ttlMs) {
            return {
                lastRunAt: now,
                lastStatus: "success",
                lastMessage: "统计索引最近已刷新，本次跳过重复刷新。",
                migratedCount: 0,
                skippedCount: 0,
            };
        }
        const { changedDocs, commit } = await prepareChangedRecentDocsForIndex("statistical");
        if (changedDocs.length === 0) {
            const summary = await getStatIndexSummary();
            await commit();
            statRefreshMemory.set("statistical", Date.now());
            return {
                lastRunAt: now,
                lastStatus: "success",
                lastMessage: summary.fileExists && summary.hasData
                    ? `最近文档没有统计相关变动；当前 docs=${summary.docsCount}，blocks=${summary.totals.blocksCount}，words=${summary.totals.wordsCount}。`
                    : STAT_INDEX_EMPTY_MESSAGE,
                migratedCount: 0,
                skippedCount: 0,
            };
        }

        const payload = existing.payload;
        const { blocksByRoot, truncated } = await queryStatBlocksByRootIds(changedDocs.map((doc) => doc.id));
        if (truncated) {
            return {
                lastRunAt: now,
                lastStatus: "error",
                lastMessage: "统计增量刷新达到单批安全上限，未写入不完整结果。",
                migratedCount: 0,
                skippedCount: changedDocs.length,
            };
        }
        let refreshedCount = 0;
        let removedCount = 0;

        for (const doc of changedDocs) {
            const oldContribution = payload.docs[doc.id];
            applyContribution(payload.totals, oldContribution, -1);
            delete payload.docs[doc.id];

            const rows = blocksByRoot.get(doc.id) || [];
            if (rows.length === 0) {
                removedCount += oldContribution ? 1 : 0;
                continue;
            }

            const nextContribution = buildContributionFromRows(doc, rows);
            payload.docs[doc.id] = nextContribution;
            applyContribution(payload.totals, nextContribution, 1);
            refreshedCount += 1;
        }

        payload.version = STAT_INDEX_VERSION;
        payload.complete = true;
        payload.updatedAt = now;
        await writeStatIndex(payload);

        await commit();
        const summary = await getStatIndexSummary();
        statRefreshMemory.set("statistical", Date.now());
        dispatchStatIndexUpdated();
        const dataMessage = summary.fileExists && summary.hasData
            ? `当前 docs=${summary.docsCount}，blocks=${summary.totals.blocksCount}，words=${summary.totals.wordsCount}`
            : "当前没有可统计数据";
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: `统计增量刷新完成：更新 ${refreshedCount} 个文档；${dataMessage}。`,
            migratedCount: refreshedCount,
            skippedCount: 0,
            removedCount,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "统计增量刷新失败",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
}

function addRowToRebuildIndex(payload: StatIndexPayload, row: StatBlockRow): boolean {
    const rootId = getRootId(row);
    if (!rootId) return false;

    let contribution = payload.docs[rootId];
    if (!contribution) {
        contribution = {
            id: rootId,
            box: row.box || "",
            path: row.path || "",
            hpath: getRowHpath(row),
            updated: row.updated || "",
            created: "",
            totals: emptyTotals(),
        };
        payload.docs[rootId] = contribution;
    }

    if (row.type === "d") {
        contribution.box = row.box || contribution.box || "";
        contribution.path = row.path || contribution.path || "";
        contribution.hpath = getRowHpath(row) || contribution.hpath || "";
    }
    contribution.updated = getMaxUpdated(contribution.updated, row.updated);
    contribution.created = getMinCreated(contribution.created, row.created);
    applyRowToTotals(contribution.totals, row);
    applyRowToTotals(payload.totals, row);
    return true;
}

export async function rebuildStatIndexFromGlobalSql(plugin: any): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();

    const payload = emptyStatIndex();
    try {
        const existing = await readStatIndexWithMeta();
        if (!existing.invalid) {
            const preservedCreated = normalizeCreated(existing.payload.firstBlockCreated)
                || await ensureFirstBlockCreated();
            if (preservedCreated) payload.firstBlockCreated = preservedCreated;
        }
    } catch {
        // 开始时间元数据失败不阻止用户主动重建统计索引。
    }
    let offset = 0;
    let scannedCount = 0;
    let writtenCount = 0;

    while (scannedCount < STAT_REBUILD_MAX_ROWS) {
        const result = await runHomepageManualIndexSqlQuery<StatBlockRow>(
            plugin,
            `
                SELECT id, root_id, box, path, hpath, ial, type, subtype, content, markdown, created, updated
                FROM blocks
                ORDER BY updated DESC, id DESC
                LIMIT ${STAT_REBUILD_PAGE_SIZE}
                OFFSET ${offset}
            `,
            { maxLimit: STAT_REBUILD_PAGE_SIZE },
        );
        if (result.ok === false) {
            return {
                lastRunAt: now,
                lastStatus: "error",
                lastMessage: result.reason,
                migratedCount: writtenCount,
                skippedCount: scannedCount,
            };
        }
        const rows = result.rows;
        if (rows.length === 0) break;

        for (const row of rows) {
            scannedCount += 1;
            if (addRowToRebuildIndex(payload, row)) {
                writtenCount += 1;
            }
        }

        if (rows.length < STAT_REBUILD_PAGE_SIZE) break;
        offset += STAT_REBUILD_PAGE_SIZE;
    }

    const reachedLimit = scannedCount >= STAT_REBUILD_MAX_ROWS;
    payload.updatedAt = now;
    payload.complete = false;

    try {
        await writeStatIndex(payload);
        if (!reachedLimit) {
            payload.complete = true;
            await writeStatIndex(payload);
        }
    } catch (error) {
        if (payload.complete) {
            try {
                payload.complete = false;
                await writeStatIndex(payload);
            } catch {
                // 保留原始写入错误；已尽力将未校验索引降级为不完整。
            }
        }
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: `统计索引写入失败：${error instanceof Error ? error.message : String(error)}`,
            migratedCount: 0,
            skippedCount: scannedCount,
        };
    }

    let summary: StatIndexSummary;
    try {
        summary = await getStatIndexSummary();
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: `统计索引写入后读回校验失败：${error instanceof Error ? error.message : String(error)}`,
            migratedCount: 0,
            skippedCount: scannedCount,
        };
    }

    if (!summary.fileExists) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: "统计索引写入后读回为空，请检查思源存储权限或 getFile/putFile 返回结构。",
            migratedCount: 0,
            skippedCount: scannedCount,
        };
    }

    if (!summary.hasData) {
        if (!reachedLimit && summary.complete) dispatchStatIndexUpdated();
        return {
            lastRunAt: now,
            lastStatus: reachedLimit ? "error" : "success",
            lastMessage: reachedLimit
                ? `统计索引重建达到 ${STAT_REBUILD_MAX_ROWS} 条上限，但没有可统计数据。`
                : "统计索引重建完成：没有可统计数据。",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
    if (!reachedLimit && summary.complete) dispatchStatIndexUpdated();
    return {
        lastRunAt: now,
        lastStatus: reachedLimit ? "error" : "success",
        lastMessage: reachedLimit
            ? `统计索引重建达到 ${STAT_REBUILD_MAX_ROWS} 条上限；当前 docs=${summary.docsCount}，blocks=${summary.totals.blocksCount}，words=${summary.totals.wordsCount}。`
            : `统计索引重建完成：docs=${summary.docsCount}，blocks=${summary.totals.blocksCount}，words=${summary.totals.wordsCount}。`,
        migratedCount: writtenCount,
        skippedCount: reachedLimit ? 1 : 0,
    };
}

function statIndexHasData(payload: StatIndexPayload): boolean {
    return Object.keys(payload.docs).length > 0 || STAT_KEYS.some((key) => payload.totals[key] > 0);
}

export interface StatIndexSummary {
    fileExists: boolean;
    hasData: boolean;
    updatedAt?: string;
    docsCount: number;
    totals: StatTotals;
    version: number;
    complete: boolean;
    invalid: boolean;
}

export async function getStatIndexSummary(): Promise<StatIndexSummary> {
    const { fileExists, invalid, payload } = await readStatIndexWithMeta();
    return {
        fileExists,
        hasData: statIndexHasData(payload),
        updatedAt: payload.updatedAt || undefined,
        docsCount: Object.keys(payload.docs).length,
        totals: payload.totals,
        version: payload.version,
        complete: payload.complete,
        invalid,
    };
}

export interface StatIndexStatus extends StatIndexSummary {
    status: "success" | "idle" | "error";
    message: string;
}

export async function getStatIndexStatus(): Promise<StatIndexStatus> {
    try {
        const summary = await getStatIndexSummary();
        if (summary.invalid) return { ...summary, status: "error", message: "统计索引损坏，请重建统计索引。" };
        if (!summary.fileExists) return { ...summary, status: "idle", message: "统计索引尚未建立。" };
        if (summary.version !== STAT_INDEX_VERSION) return { ...summary, status: "idle", message: "统计索引版本较旧，请重建统计索引。" };
        if (!summary.complete) return { ...summary, status: "idle", message: "统计索引不完整，请执行全量重建。" };
        return { ...summary, status: "success", message: "统计索引完整可用。" };
    } catch (error) {
        const totals = emptyTotals();
        return {
            fileExists: true, hasData: false, docsCount: 0, totals,
            version: 0, complete: false, invalid: true, status: "error",
            message: error instanceof Error ? error.message : "统计索引损坏。",
        };
    }
}

async function queryStatIndexStat(type: StatIndexKey): Promise<StatisticalDataResult> {
    const { fileExists, invalid, payload } = await readStatIndexWithMeta();
    if (!fileExists) {
        return emptyStat("统计索引尚未建立。请到主页设置 → 检索管理 → 重建统计索引。");
    }
    if (invalid) return errorStat("统计索引损坏。");
    if (payload.version !== STAT_INDEX_VERSION || payload.complete !== true) {
        return emptyStat("统计索引需要重建。请到主页设置 → 检索管理 → 重建统计索引。");
    }
    return okStat(payload.totals[type] ?? 0, "index");
}

async function queryStartDate(): Promise<StatisticalDataResult> {
    try {
        const created = await ensureFirstBlockCreated();
        return created
            ? okStat(formatCreatedDate(created), "index")
            : emptyStat("未检测到可用的开始时间。");
    } catch (error) {
        return errorStat(error instanceof Error ? error.message : "开始时间读取失败。");
    }
}

export async function getStatisticalData(statisticalType: string, plugin: any): Promise<StatisticalDataResult> {
    void plugin;
    try {
        if (statisticalType === "notebooksCount") {
            const res = await lsNotebooks();
            return okStat(res.notebooks.length, "official_api");
        }
        if (statisticalType === "tagsCount") {
            const tags = await getTag(1, true, "statisticalCard");
            return okStat(tags.length, "official_api");
        }
        if (statisticalType === "startDate") return queryStartDate();
        const taskStatKeys: TaskStatKey[] = [
            "tasksCount", "doneTasksCount", "undoneTasksCount", "dueTodayTasksCount",
            "overdueTasksCount", "highPriorityTasksCount", "unscheduledTasksCount",
        ];
        if (taskStatKeys.includes(statisticalType as TaskStatKey)) {
            return queryTaskIndexStat(statisticalType as TaskStatKey);
        }
        if (STAT_KEYS.includes(statisticalType as StatIndexKey)) {
            return queryStatIndexStat(statisticalType as StatIndexKey);
        }
        return unsupportedStat(`未知统计项：${statisticalType}`);
    } catch (error) {
        return errorStat(error instanceof Error ? error.message : "统计 API 调用失败");
    }
}
