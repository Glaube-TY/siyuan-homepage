import { getFile, listDocsByPathChecked, putFileChecked, sqlChecked } from "@/api";
import { prepareChangedRecentDocsForIndex } from "@/components/tools/siyuanComponentDataApi";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";

const INDEX_DIR = "/data/storage/petal/siyuan-homepage";
const INDEX_PATH = `${INDEX_DIR}/enhanced-diary-index.json`;
const INDEX_VERSION = 3;
const REBUILD_MAX_PATHS = 50000;
const REBUILD_MAX_DOCS = 50000;
const SQL_BATCH_SIZE = 64;
const REFRESH_TTL_MS = 2 * 60 * 1000;

export const ENHANCED_DIARY_INDEXES_UPDATED_EVENT = "siyuan-homepage:enhanced-diary-indexes-updated";

export interface DiaryIndexEntry {
    id: string;
    date: string;
    box: string;
    path?: string;
    hpath?: string;
    title?: string;
    content?: string;
    updated?: string;
    source: "official_attr" | "legacy_path";
}

export interface EnhancedDiaryIndexPayload {
    version: number;
    updatedAt: string;
    notebookId: string;
    complete: boolean;
    docs: Record<string, DiaryIndexEntry>;
}

type DiaryMetadataRow = {
    id: string;
    box?: string;
    path?: string;
    hpath?: string;
    content?: string;
    ial?: string;
    updated?: string;
};

let cache: EnhancedDiaryIndexPayload | null = null;
let cacheNotebookId = "";
const maintenanceTails = new Map<string, Promise<void>>();
const operationFlights = new Map<string, Promise<ComponentMigrationStatus>>();
const recentRefreshMemory = new Map<string, number>();

function emptyIndex(notebookId: string, complete = false): EnhancedDiaryIndexPayload {
    return { version: INDEX_VERSION, updatedAt: new Date().toISOString(), notebookId, complete, docs: {} };
}

function isDate(value: string | undefined): value is string {
    if (!value || !/^\d{8}$/.test(value)) return false;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

async function fileToObject(raw: any): Promise<any | undefined> {
    if (raw == null || raw === "") return undefined;
    if (typeof raw === "object" && typeof raw.code === "number") {
        if (raw.code !== 0) return undefined;
        return fileToObject(raw.data);
    }
    if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return undefined; }
    }
    if (raw instanceof Blob) return fileToObject(await raw.text());
    if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
        return fileToObject(new TextDecoder().decode(raw instanceof ArrayBuffer ? raw : raw.buffer));
    }
    return typeof raw === "object" ? raw : undefined;
}

function makeBlob(payload: unknown): Blob {
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
}

function isIndexPayload(value: any): value is EnhancedDiaryIndexPayload {
    return !!value && typeof value === "object" && value.version === INDEX_VERSION &&
        typeof value.updatedAt === "string" && typeof value.notebookId === "string" && typeof value.complete === "boolean" &&
        !!value.docs && typeof value.docs === "object" && !Array.isArray(value.docs);
}

function hasIndexFileResponse(raw: any): boolean {
    if (raw == null) return false;
    if (typeof raw === "object" && typeof raw.code === "number") {
        return raw.code === 0 && raw.data != null;
    }
    return true;
}

async function readIndex(notebookId: string): Promise<{ index: EnhancedDiaryIndexPayload; exists: boolean; valid: boolean; matched: boolean }> {
    if (cache && cacheNotebookId === notebookId) return { index: cache, exists: true, valid: true, matched: true };
    const parsed = await fileToObject(await getFile(INDEX_PATH));
    if (!parsed) return { index: emptyIndex(notebookId), exists: false, valid: false, matched: false };
    if (!isIndexPayload(parsed)) return { index: emptyIndex(notebookId), exists: true, valid: false, matched: false };
    if (parsed.notebookId !== notebookId) return { index: emptyIndex(notebookId), exists: true, valid: true, matched: false };
    cache = parsed;
    cacheNotebookId = notebookId;
    return { index: parsed, exists: true, valid: true, matched: true };
}

export async function getEnhancedDiaryIndexStatus(notebookId: string): Promise<ComponentMigrationStatus> {
    if (!notebookId) return { lastStatus: "idle", lastMessage: "尚未配置日记笔记本。" };
    try {
        const raw = await getFile(INDEX_PATH);
        if (!hasIndexFileResponse(raw)) return { lastStatus: "idle", lastMessage: "强化日记索引尚未建立。" };
        const parsed = await fileToObject(raw);
        if (!isIndexPayload(parsed)) return { lastStatus: "error", lastMessage: "强化日记索引文件损坏或版本无效，请重建。" };
        if (parsed.notebookId !== notebookId) {
            return { lastRunAt: parsed.updatedAt, lastStatus: "idle", lastMessage: "日记笔记本配置已变化，需要重建强化日记索引。" };
        }
        const migratedCount = Object.keys(parsed.docs).length;
        if (!parsed.complete) {
            return { lastRunAt: parsed.updatedAt, lastStatus: "idle", lastMessage: "强化日记索引尚未完整，请重建。", migratedCount };
        }
        return { lastRunAt: parsed.updatedAt, lastStatus: "success", lastMessage: `强化日记索引完整，共 ${migratedCount} 篇日记。`, migratedCount };
    } catch (error) {
        return { lastStatus: "error", lastMessage: error instanceof Error ? error.message : "强化日记索引状态读取失败。" };
    }
}

async function writeIndex(index: EnhancedDiaryIndexPayload): Promise<void> {
    const next = { ...index, version: INDEX_VERSION, updatedAt: new Date().toISOString() };
    try { await putFileChecked(INDEX_DIR, true, makeBlob({})); } catch { /* existing directory is acceptable */ }
    await putFileChecked(INDEX_PATH, false, makeBlob(next));
    cache = next;
    cacheNotebookId = next.notebookId;
}

function escapeSql(value: string): string { return value.replace(/'/g, "''"); }

/**
 * Pure function to resolve a diary date from document metadata.
 * Shared between index building and AI docId validation.
 * Returns null when the metadata does not represent a valid diary date.
 */
export function resolveEnhancedDiaryDateFromMetadata(metadata: {
    ial?: string;
    title?: string;
    hpath?: string;
    path?: string;
}): { date: string; source: "official_attr" | "legacy_path" } | null {
    const attrDate = officialDate(metadata.ial);
    const date = attrDate || legacyDate(String(metadata.title || ""), String(metadata.hpath || "")) || legacyDate("", String(metadata.path || ""));
    if (!isDate(date)) return null;
    return { date, source: attrDate ? "official_attr" : "legacy_path" };
}

function officialDate(ial: unknown): string | null {
    const match = /custom-dailynote-(\d{8})(?=[\s=\}"]|$)/i.exec(String(ial || ""));
    return match?.[1] || null;
}

function legacyDate(title: string, path: string): string | null {
    // 1) 文档自身标题的第一行
    const firstLine = title.split('\n')[0]?.trim() || '';
    if (firstLine) {
        const d = extractStrictDate(firstLine);
        if (d) return d;
    }

    // 2) path 的最后一个非空段
    const segments = path.split('/').filter(s => s.length > 0);
    const lastSeg = segments[segments.length - 1] || '';
    if (lastSeg) {
        const d = extractStrictDate(lastSeg);
        if (d) return d;
    }

    // 3) path 的最后三段为 YYYY / MM / DD
    if (segments.length >= 3) {
        const lastThree = segments.slice(-3);
        const y = Number(lastThree[0]), m = Number(lastThree[1]), d = Number(lastThree[2]);
        if (isValidYMD(y, m, d)) {
            return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
        }
    }

    return null;
}

/** 从文本开头提取严格 8 位日期候选（ISO、中文、纯数字） */
function extractStrictDate(text: string): string | null {
    const trimmed = text.trim();
    // YYYY-MM-DD 或 YYYY/MM/DD（要求字符串开头）
    const iso = /^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/.exec(trimmed);
    if (iso) {
        const y = Number(iso[1]), m = Number(iso[2]), d = Number(iso[3]);
        if (isValidYMD(y, m, d)) return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
    }
    // YYYY年MM月DD日
    const cn = /^(\d{4})\u5e74([01]?\d)\u6708([0-3]?\d)\u65e5?$/.exec(trimmed);
    if (cn) {
        const y = Number(cn[1]), m = Number(cn[2]), d = Number(cn[3]);
        if (isValidYMD(y, m, d)) return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
    }
    // 纯 YYYYMMDD
    const plain = /^(\d{8})$/.exec(trimmed);
    if (plain) {
        const y = Number(plain[1].slice(0, 4)), m = Number(plain[1].slice(4, 6)), d = Number(plain[1].slice(6, 8));
        if (isValidYMD(y, m, d)) return plain[1];
    }
    return null;
}

function isValidYMD(year: number, month: number, day: number): boolean {
    if (year < 1900 || year > 2100) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function rowToEntry(row: DiaryMetadataRow | undefined, notebookId: string): DiaryIndexEntry | null {
    if (!row?.id || row.box !== notebookId) return null;
    const title = String(row.content || "");
    const resolved = resolveEnhancedDiaryDateFromMetadata({
        ial: row.ial,
        title,
        hpath: String(row.hpath || ""),
        path: String(row.path || ""),
    });
    if (!resolved) return null;
    return { id: String(row.id), date: resolved.date, box: notebookId, path: row.path || "", hpath: row.hpath || "", title, content: title, updated: row.updated || "", source: resolved.source };
}

function prefers(candidate: DiaryIndexEntry, current: DiaryIndexEntry | undefined): boolean {
    if (!current) return true;
    if (candidate.source !== current.source) return candidate.source === "official_attr";
    return String(candidate.updated || "").localeCompare(String(current.updated || "")) > 0;
}

async function queryRowsByIds(ids: string[]): Promise<Map<string, DiaryMetadataRow>> {
    const rows = new Map<string, DiaryMetadataRow>();
    for (let i = 0; i < ids.length; i += SQL_BATCH_SIZE) {
        const batch = ids.slice(i, i + SQL_BATCH_SIZE);
        const escaped = batch.map((id) => `'${escapeSql(id)}'`).join(",");
        const result = await sqlChecked(`SELECT id, box, path, hpath, content, ial, updated FROM blocks WHERE id IN (${escaped})`);
        for (const row of result) if (row?.id) rows.set(String(row.id), row as DiaryMetadataRow);
    }
    return rows;
}

function removeEntriesById(docs: Record<string, DiaryIndexEntry>, id: string): DiaryIndexEntry | undefined {
    let removed: DiaryIndexEntry | undefined;
    for (const [date, entry] of Object.entries(docs)) {
        if (entry.id === id) {
            removed ||= entry;
            delete docs[date];
        }
    }
    return removed;
}

async function collectNotebookDocIds(notebookId: string): Promise<string[]> {
    const queue = ["/"];
    const visited = new Set<string>();
    const ids = new Set<string>();
    let failedPaths = 0;
    while (queue.length > 0) {
        const path = queue.shift()!;
        if (visited.has(path)) continue;
        visited.add(path);
        if (visited.size > REBUILD_MAX_PATHS || ids.size > REBUILD_MAX_DOCS) throw new Error("日记笔记本文件树达到安全上限，未写入不完整索引。");
        let result: any;
        try {
            result = await listDocsByPathChecked(notebookId, path);
        } catch {
            failedPaths++;
            break;
        }
        if (!Array.isArray(result?.files)) {
            throw new Error("日记笔记本文件树响应结构异常：files 不是数组。");
        }
        const files = result.files;
        for (const file of files) {
            if (!file?.id) continue;
            ids.add(String(file.id));
            if (Number(file.subFileCount || 0) > 0 && !file.path) {
                throw new Error("日记笔记本文件树结构不完整：声明存在子文档但缺少路径。");
            }
            if (Number(file.subFileCount || 0) > 0 && file.path) {
                const childPath = String(file.path).replace(/\.sy$/i, "");
                if (!visited.has(childPath)) queue.push(childPath);
            }
            if (ids.size > REBUILD_MAX_DOCS) throw new Error("日记笔记本文档数量达到安全上限，未写入不完整索引。");
        }
    }
    if (failedPaths > 0) throw new Error(`日记笔记本文件树有 ${failedPaths} 个声明的子文档路径读取失败，未写入不完整索引。`);
    return [...ids];
}

function queueMaintenance(notebookId: string, operation: string, work: () => Promise<ComponentMigrationStatus>): Promise<ComponentMigrationStatus> {
    const key = `${notebookId}:${operation}`;
    const running = operationFlights.get(key);
    if (running) return running;
    const previous = maintenanceTails.get(notebookId) || Promise.resolve();
    const promise = previous.catch(() => undefined).then(work);
    operationFlights.set(key, promise);
    maintenanceTails.set(notebookId, promise.then(() => undefined, () => undefined));
    promise.finally(() => {
        if (operationFlights.get(key) === promise) operationFlights.delete(key);
    });
    return promise;
}

function queueIndexWrite(notebookId: string, work: () => Promise<void>): Promise<void> {
    const previous = maintenanceTails.get(notebookId) || Promise.resolve();
    const promise = previous.catch(() => undefined).then(work);
    maintenanceTails.set(notebookId, promise.then(() => undefined, () => undefined));
    return promise;
}

async function rebuildInternal(notebookId: string): Promise<ComponentMigrationStatus> {
    if (!notebookId) return { lastRunAt: new Date().toISOString(), lastStatus: "error", lastMessage: "未配置日记笔记本，无法重建强化日记索引。" };
    try {
        // 先固定重建开始时的增量基线；之后发生的变动留给下一次刷新处理。
        const prepared = await prepareChangedRecentDocsForIndex("enhanced-diary");
        const ids = await collectNotebookDocIds(notebookId);
        const rows = await queryRowsByIds(ids);
        const docs: Record<string, DiaryIndexEntry> = {};
        let conflicts = 0;
        for (const id of ids) {
            const entry = rowToEntry(rows.get(id), notebookId);
            if (!entry) continue;
            if (docs[entry.date]) conflicts++;
            if (prefers(entry, docs[entry.date])) docs[entry.date] = entry;
        }
        await writeIndex({ ...emptyIndex(notebookId, true), docs });
        await prepared.commit();
        return { lastRunAt: new Date().toISOString(), lastStatus: "success", migratedCount: Object.keys(docs).length, skippedCount: conflicts, lastMessage: `已建立 ${Object.keys(docs).length} 条强化日记索引。` };
    } catch (error) {
        return { lastRunAt: new Date().toISOString(), lastStatus: "error", lastMessage: error instanceof Error ? error.message : "强化日记索引重建失败。" };
    }
}

export async function rebuildEnhancedDiaryIndex(notebookId: string): Promise<ComponentMigrationStatus> {
    return queueMaintenance(notebookId, "rebuild", () => rebuildInternal(notebookId));
}

async function refreshInternal(notebookId: string, force: boolean, allowRebuild: boolean): Promise<ComponentMigrationStatus> {
    if (!notebookId) return { lastRunAt: new Date().toISOString(), lastStatus: "error", lastMessage: "未配置日记笔记本，无法刷新强化日记索引。" };
    const now = Date.now();
    if (!force && now - (recentRefreshMemory.get(notebookId) || 0) < REFRESH_TTL_MS) {
        return { lastRunAt: new Date().toISOString(), lastStatus: "success", refreshedCount: 0, lastMessage: "强化日记索引最近已刷新，跳过重复增量。" };
    }
    try {
        const loaded = await readIndex(notebookId);
        if (!loaded.valid || !loaded.matched || !loaded.index.complete) {
            return allowRebuild
                ? rebuildInternal(notebookId)
                : { lastRunAt: new Date().toISOString(), lastStatus: "error", lastMessage: "强化日记索引尚未完整初始化，本次仅跳过通知增量刷新。" };
        }
        const { changedDocs, commit } = await prepareChangedRecentDocsForIndex("enhanced-diary");
        const ids = [...new Set(changedDocs.map((doc) => doc.id).filter(Boolean))];
        if (ids.length === 0) {
            recentRefreshMemory.set(notebookId, now);
            return { lastRunAt: new Date().toISOString(), lastStatus: "success", refreshedCount: 0, lastMessage: "最近文档没有强化日记相关变动。" };
        }
        const rows = await queryRowsByIds(ids);
        const index = { ...loaded.index, docs: { ...loaded.index.docs } };
        for (const id of ids) {
            const previous = removeEntriesById(index.docs, id);
            const entry = rowToEntry(rows.get(id), notebookId);
            if (entry && !(previous?.source === "official_attr" && entry.source !== "official_attr") && prefers(entry, index.docs[entry.date])) {
                index.docs[entry.date] = entry;
            }
        }
        await writeIndex(index);
        await commit();
        recentRefreshMemory.set(notebookId, now);
        return { lastRunAt: new Date().toISOString(), lastStatus: "success", refreshedCount: ids.length, lastMessage: `已处理 ${ids.length} 个最近变动文档。` };
    } catch (error) {
        return { lastRunAt: new Date().toISOString(), lastStatus: "error", lastMessage: error instanceof Error ? error.message : "强化日记增量索引刷新失败。" };
    }
}

export async function refreshEnhancedDiaryIndex(notebookId: string, options: { force?: boolean; allowRebuild?: boolean } = {}): Promise<ComponentMigrationStatus> {
    const force = options.force !== false;
    return queueMaintenance(notebookId, force ? "refresh:manual" : "refresh:auto", () => refreshInternal(notebookId, force, options.allowRebuild !== false));
}

export async function initializeEnhancedDiaryIndex(notebookId: string): Promise<ComponentMigrationStatus> {
    return queueMaintenance(notebookId, "initialize", async () => {
        const loaded = await readIndex(notebookId);
        return !loaded.valid || !loaded.matched || !loaded.index.complete
            ? rebuildInternal(notebookId)
            : refreshInternal(notebookId, false, true);
    });
}

export async function getEnhancedDiaryIndexEntries(notebookId: string, dates?: string[]): Promise<Record<string, DiaryIndexEntry>> {
    const loaded = await readIndex(notebookId);
    if (!loaded.matched) return {};
    if (!dates) return { ...loaded.index.docs };
    return Object.fromEntries(dates.filter((date) => loaded.index.docs[date]).map((date) => [date, loaded.index.docs[date]]));
}

export async function getEnhancedDiaryIndexEntry(notebookId: string, date: string): Promise<DiaryIndexEntry | null> {
    return (await getEnhancedDiaryIndexEntries(notebookId, [date]))[date] || null;
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function indexCreatedEnhancedDiaryDocument(notebookId: string, docId: string): Promise<boolean> {
    let succeeded = false;
    await queueIndexWrite(notebookId, async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const row = (await queryRowsByIds([docId])).get(docId);
                const entry = rowToEntry(row, notebookId);
                if (!entry) {
                    if (attempt < 2) await delay(150 * (attempt + 1));
                    continue;
                }
                const loaded = await readIndex(notebookId);
                const index = loaded.matched ? { ...loaded.index, docs: { ...loaded.index.docs } } : emptyIndex(notebookId, false);
                removeEntriesById(index.docs, docId);
                if (prefers(entry, index.docs[entry.date])) index.docs[entry.date] = entry;
                await writeIndex(index);
                succeeded = true;
                return;
            } catch {
                if (attempt < 2) await delay(150 * (attempt + 1));
            }
        }
    });
    return succeeded;
}

export async function removeStaleEnhancedDiaryEntry(notebookId: string, docId: string): Promise<void> {
    await queueIndexWrite(notebookId, async () => {
        const loaded = await readIndex(notebookId);
        if (!loaded.matched) return;
        const docs = { ...loaded.index.docs };
        if (removeEntriesById(docs, docId)) await writeIndex({ ...loaded.index, docs });
    });
}
