import { getFileChecked, getTag, lsNotebooks, putFileChecked, sql } from "@/api";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
import {
    prepareChangedRecentDocsForIndex,
    readTaskIndexItems,
    runHomepageManualIndexSqlQuery,
    type ComponentDataMode,
    type ComponentRecentDocSnapshotDoc,
} from "@/components/tools/siyuanComponentDataApi";

export interface StatisticalDataResult {
    value: number | null;
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
    totals: StatTotals;
}

/**
 * 统计索引文件结构。所有数字按文档汇总，不保留块级明细。
 */
interface StatIndexPayload {
    version: number;
    updatedAt: string;
    totals: StatTotals;
    docs: Record<string, StatDocContribution>;
}

const COMPONENT_INDEX_DIR = "/data/storage/petal/siyuan-homepage";
export const STAT_INDEX_PATH = `${COMPONENT_INDEX_DIR}/statistical-index.json`;
const STAT_INDEX_VERSION = 1;
const STAT_REFRESH_TTL_MS = 2 * 60 * 1000;
const STAT_REBUILD_PAGE_SIZE = 2000;
const STAT_REBUILD_MAX_ROWS = 200000;
const STAT_INDEX_EMPTY_MESSAGE = "统计索引为空，请到主页设置 > 检索管理中刷新增量索引或手动重建统计索引。";
const statRefreshMemory = new Map<string, number>();

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

async function readStatIndexWithMeta(): Promise<{ fileExists: boolean; payload: StatIndexPayload }> {
    try {
        const raw = await getFileChecked(STAT_INDEX_PATH);
        const parsed = await fileContentToObject(raw);
        if (parsed === undefined || parsed === null) {
            return { fileExists: false, payload: emptyStatIndex() };
        }
        const isLike = isStatIndexPayloadLike(parsed);
        return {
            fileExists: isLike,
            payload: isLike ? normalizeStatIndex(parsed) : emptyStatIndex(),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("file does not exist") || msg.includes("404")) {
            return { fileExists: false, payload: emptyStatIndex() };
        }
        throw new Error(`读取统计索引失败：${msg}`);
    }
}

async function doesStatIndexFileExist(): Promise<boolean> {
    const { fileExists } = await readStatIndexWithMeta();
    return fileExists;
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
        version: Number(raw.version) || STAT_INDEX_VERSION,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        totals: normalizeTotals(raw.totals),
        docs,
    };
}

async function readStatIndex(): Promise<StatIndexPayload> {
    const { payload } = await readStatIndexWithMeta();
    return payload;
}

async function writeStatIndex(payload: StatIndexPayload): Promise<void> {
    try {
        await putFileChecked(COMPONENT_INDEX_DIR, true, makeJsonBlob({}));
    } catch {
        // 旧版内核可能不需要显式创建目录，写入失败时继续尝试写索引文件。
    }
    await putFileChecked(STAT_INDEX_PATH, false, makeJsonBlob(payload));

    const { fileExists } = await readStatIndexWithMeta();
    if (!fileExists) {
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

function okStat(value: number, mode?: ComponentDataMode): StatisticalDataResult {
    return {
        value,
        status: "ok",
        mode,
    };
}

async function queryTaskIndexStat(type: "tasksCount" | "doneTasksCount" | "undoneTasksCount"): Promise<StatisticalDataResult> {
    const rows = await readTaskIndexItems();
    if (rows.length === 0) {
        return emptyStat("任务索引为空，请到主页设置 > 检索管理中建立或刷新任务索引。");
    }
    if (type === "tasksCount") {
        return okStat(rows.length, "index");
    }
    const value = rows.filter((row) => {
        if (type === "doneTasksCount") {
            return row.checked === true;
        }
        return row.checked === false;
    }).length;
    return okStat(value, "index");
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
        totals: emptyTotals(),
    };
    for (const row of rows) {
        applyRowToTotals(contribution.totals, row);
        contribution.updated = getMaxUpdated(contribution.updated, row.updated);
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

    try {
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

        const payload = await readStatIndex();
        const { blocksByRoot, truncated } = await queryStatBlocksByRootIds(changedDocs.map((doc) => doc.id));
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
        payload.updatedAt = now;
        await writeStatIndex(payload);

        await commit();
        const summary = await getStatIndexSummary();
        statRefreshMemory.set("statistical", Date.now());
        const dataMessage = summary.fileExists && summary.hasData
            ? `当前 docs=${summary.docsCount}，blocks=${summary.totals.blocksCount}，words=${summary.totals.wordsCount}`
            : "当前没有可统计数据";
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: truncated
                ? `统计增量刷新完成：更新 ${refreshedCount} 个文档（部分文档块数超过安全上限，已截断）；${dataMessage}。`
                : `统计增量刷新完成：更新 ${refreshedCount} 个文档；${dataMessage}。`,
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
    applyRowToTotals(contribution.totals, row);
    applyRowToTotals(payload.totals, row);
    return true;
}

export async function rebuildStatIndexFromGlobalSql(plugin: any): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();

    const payload = emptyStatIndex();
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

    payload.updatedAt = now;

    try {
        await writeStatIndex(payload);
    } catch (error) {
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

    const reachedLimit = scannedCount >= STAT_REBUILD_MAX_ROWS;
    if (!summary.hasData) {
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: reachedLimit
                ? `统计索引重建达到 ${STAT_REBUILD_MAX_ROWS} 条上限，但没有可统计数据。`
                : "统计索引重建完成：没有可统计数据。",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
    return {
        lastRunAt: now,
        lastStatus: "success",
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
}

/**
 * 统计索引前台自动初始化：仅在 statistical-index.json 不存在时执行一次全量重建。
 * 后续组件加载/刷新应使用 refreshStatIndexFromRecentDocuments 做增量刷新。
 */
export async function ensureStatIndexInitialized(
    plugin: any,
): Promise<{ initialized: boolean; status: ComponentMigrationStatus }> {
    if (await doesStatIndexFileExist()) {
        return { initialized: false, status: { lastStatus: "idle" } };
    }
    const status = await rebuildStatIndexFromGlobalSql(plugin);
    return { initialized: status.lastStatus === "success", status };
}

export async function getStatIndexSummary(): Promise<StatIndexSummary> {
    const { fileExists, payload } = await readStatIndexWithMeta();
    return {
        fileExists,
        hasData: statIndexHasData(payload),
        updatedAt: payload.updatedAt || undefined,
        docsCount: Object.keys(payload.docs).length,
        totals: payload.totals,
    };
}

async function queryStatIndexStat(type: StatIndexKey): Promise<StatisticalDataResult> {
    const { fileExists, payload } = await readStatIndexWithMeta();
    if (!fileExists) {
        return errorStat("统计索引不存在，正在或需要初始化/重建。");
    }
    if (!statIndexHasData(payload)) {
        return emptyStat(STAT_INDEX_EMPTY_MESSAGE);
    }
    return okStat(payload.totals[type] || 0, "index");
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
        if (statisticalType === "tasksCount") {
            return queryTaskIndexStat("tasksCount");
        }
        if (statisticalType === "doneTasksCount") {
            return queryTaskIndexStat("doneTasksCount");
        }
        if (statisticalType === "undoneTasksCount") {
            return queryTaskIndexStat("undoneTasksCount");
        }
        if (STAT_KEYS.includes(statisticalType as StatIndexKey)) {
            return queryStatIndexStat(statisticalType as StatIndexKey);
        }
        return unsupportedStat(`未知统计项：${statisticalType}`);
    } catch (error) {
        return errorStat(error instanceof Error ? error.message : "统计 API 调用失败");
    }
}
