import {
    fullTextSearchBlock,
    getBlockInfo,
    getFile,
    getPathByID,
    getRecentDocs,
    getRecentUpdatedBlocks,
    checkBlockExist,
    listDocsByPath,
    lsNotebooks,
    putFile,
    setBlockAttrsChecked,
    sql,
} from "@/api";
import { validateSafeSelectSql } from "@/features/kb/services/siyuan/safe-sql";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";

export type ComponentDataStatus = "ok" | "empty" | "limited" | "disabled" | "unsupported" | "error";
export type ComponentDataMode =
    | "official_api"
    | "recent_api"
    | "index"
    | "scoped_filetree"
    | "user_sql"
    | "disabled";

export interface ComponentDataResult<T> {
    items: T[];
    status: ComponentDataStatus;
    message?: string;
    mode?: ComponentDataMode;
}

export interface ComponentCountsResult {
    counts: Record<string, number>;
    status: ComponentDataStatus;
    message?: string;
    mode?: ComponentDataMode;
}

export interface ComponentDocInfo {
    id: string;
    content: string;
    created?: string;
    updated?: string;
    sort?: number;
    ial?: string;
    icon?: string;
    box?: string;
    path?: string;
    hpath?: string;
}

export interface ComponentTaskInfo {
    id: string;
    root_id?: string;
    rootID?: string;
    parent_id?: string;
    parentID?: string;
    markdown: string;
    content: string;
    created: string;
    updated: string;
    hpath: string;
    box?: string;
    path?: string;
    type?: string;
    subtype?: string;
    checked?: boolean;
    source?: string;
    indexedAt?: string;
    lastVerifiedAt?: string;
}

const SEARCH_PAGE_SIZE = 32;
const SEARCH_MAX_PAGES = 5;
const SEARCH_MAX_ROWS = 200;
const DOC_INFO_LIMIT = 20;
const COMPONENT_INDEX_DIR = "/data/storage/petal/siyuan-homepage";
const TASK_INDEX_PATH = `${COMPONENT_INDEX_DIR}/task-index.json`;
const FAVORITES_INDEX_PATH = `${COMPONENT_INDEX_DIR}/favorites-index.json`;
const REVIEW_INDEX_PATH = `${COMPONENT_INDEX_DIR}/review-index.json`;
const RECENT_DOC_SNAPSHOT_PATH = `${COMPONENT_INDEX_DIR}/recent-doc-snapshot.json`;
const HEATMAP_DAILY_INDEX_PATH = `${COMPONENT_INDEX_DIR}/heatmap-daily-index.json`;
const INDEX_VERSION = 1;
const GLOBAL_COMPAT_MAX_LIMIT = 2000;
const GLOBAL_COMPAT_TABLES = ["blocks"];
const TASK_REBUILD_PAGE_SIZE = 1000;
const TASK_REBUILD_MAX_ROWS = 50000;
const HEATMAP_REBUILD_PAGE_SIZE = 2000;
const HEATMAP_REBUILD_MAX_ROWS = 200000;
const RECENT_DOC_REFRESH_LIMIT = 200;
const RECENT_REFRESH_TTL_MS = 2 * 60 * 1000;

export interface ComponentRecentDocSnapshotDoc {
    id: string;
    rootID?: string;
    box?: string;
    path?: string;
    hpath?: string;
    updated?: string;
    content?: string;
}

interface RecentDocSnapshotPayload {
    version: number;
    updatedAt: string;
    docs: Record<string, ComponentRecentDocSnapshotDoc>;
    consumers?: Record<string, Record<string, string>>;
}

interface HeatmapDocContribution {
    id: string;
    box?: string;
    path?: string;
    hpath?: string;
    updated?: string;
    counts: {
        block: Record<string, number>;
        word: Record<string, number>;
    };
}

interface HeatmapDailyIndexPayload {
    version: number;
    updatedAt: string;
    totals: {
        block: Record<string, number>;
        word: Record<string, number>;
    };
    docs: Record<string, HeatmapDocContribution>;
}

const recentRefreshMemory = new Map<string, number>();

function okResult<T>(items: T[], mode: ComponentDataMode, message?: string): ComponentDataResult<T> {
    return {
        items,
        status: items.length > 0 ? "ok" : "empty",
        mode,
        message,
    };
}

function disabledResult<T>(message: string, mode: ComponentDataMode = "disabled"): ComponentDataResult<T> {
    return {
        items: [],
        status: "disabled",
        mode,
        message,
    };
}

export interface ManualIndexSqlOptions {
    maxLimit?: number;
    allowedTables?: string[];
}

/**
 * 只用于用户可感知的索引建设：本地索引文件不存在时的前台初次初始化、设置面板手动重建索引、旧数据迁移。
 * 禁止用于组件展示查询或后台自动刷新。
 */
export async function runHomepageManualIndexSqlQuery<T = Record<string, unknown>>(
    plugin: any,
    stmt: string,
    options?: ManualIndexSqlOptions,
): Promise<{ ok: true; rows: T[] } | { ok: false; rows: T[]; reason: string }> {
    void plugin;
    const validation = validateSafeSelectSql(stmt, {
        maxLimit: options?.maxLimit ?? GLOBAL_COMPAT_MAX_LIMIT,
        allowedTables: options?.allowedTables ?? GLOBAL_COMPAT_TABLES,
    });
    if (validation.ok === false) {
        return { ok: false, rows: [], reason: validation.reason };
    }
    try {
        const rows = await sql(validation.stmt);
        return { ok: true, rows: Array.isArray(rows) ? (rows as T[]) : [] };
    } catch (e) {
        return { ok: false, rows: [], reason: e instanceof Error ? e.message : String(e) };
    }
}

export function splitNotebookIds(value?: string): string[] {
    return String(value || "")
        .split(/[，,]/)
        .map((id) => id.trim())
        .filter(Boolean);
}

function normalizeIal(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (typeof value !== "object") return undefined;
    return Object.entries(value as Record<string, unknown>)
        .map(([key, attrValue]) => `${key}="${String(attrValue ?? "")}"`)
        .join(" ");
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

async function readJsonIndex<T>(path: string): Promise<T[]> {
    try {
        const raw = await getFile(path);
        const parsed = await fileContentToObject(raw);
        if (parsed === undefined || parsed === null) return [];
        const items = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)?.items;
        return Array.isArray(items) ? items.filter(Boolean) as T[] : [];
    } catch {
        return [];
    }
}

async function readJsonIndexPayload<T>(path: string, fallback: T): Promise<T> {
    try {
        const raw = await getFile(path);
        const parsed = await fileContentToObject(raw);
        return parsed !== undefined && parsed !== null ? parsed as T : fallback;
    } catch {
        return fallback;
    }
}

async function writeJsonIndex<T>(path: string, items: T[]): Promise<void> {
    try {
        await putFile(COMPONENT_INDEX_DIR, true, makeJsonBlob({}));
    } catch {
        // 旧版内核可能不需要显式创建目录，写入失败时继续尝试写索引文件。
    }
    await putFile(path, false, makeJsonBlob({
        version: INDEX_VERSION,
        updatedAt: new Date().toISOString(),
        items,
    }));
}

async function writeJsonIndexPayload(path: string, payload: unknown): Promise<void> {
    try {
        await putFile(COMPONENT_INDEX_DIR, true, makeJsonBlob({}));
    } catch {
        // 旧版内核可能不需要显式创建目录，写入失败时继续尝试写索引文件。
    }
    await putFile(path, false, makeJsonBlob(payload));
}

async function doesIndexFileExist(path: string): Promise<boolean> {
    try {
        const raw = await getFile(path);
        const parsed = await fileContentToObject(raw);
        return parsed !== undefined && parsed !== null;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const lower = msg.toLowerCase();
        if (lower.includes("file does not exist") || lower.includes("not found") || lower.includes("404")) {
            return false;
        }
        return false;
    }
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

async function isExistingBlock(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        return Boolean(await checkBlockExist(id));
    } catch {
        return true;
    }
}

export async function filterExistingItems<T extends { id?: string }>(
    items: T[],
    path: string,
    maxChecks = 100,
): Promise<T[]> {
    const result: T[] = [];
    let changed = false;
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (!item?.id) {
            changed = true;
            continue;
        }
        if (i < maxChecks) {
            const exists = await isExistingBlock(item.id);
            if (!exists) {
                changed = true;
                continue;
            }
        }
        result.push(item);
    }
    if (changed) {
        try {
            await writeJsonIndex(path, result);
        } catch {
            // 索引清理失败不阻塞组件渲染。
        }
    }
    return result;
}

function emptyRecentDocSnapshot(): RecentDocSnapshotPayload {
    return {
        version: INDEX_VERSION,
        updatedAt: "",
        docs: {},
        consumers: {},
    };
}

function emptyHeatmapDailyIndex(): HeatmapDailyIndexPayload {
    return {
        version: INDEX_VERSION,
        updatedAt: "",
        totals: {
            block: {},
            word: {},
        },
        docs: {},
    };
}

function dayFromSiyuanTime(value: unknown): string {
    const text = String(value || "");
    if (text.length < 8) return "";
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function addCount(target: Record<string, number>, day: string, delta: number): void {
    if (!day || !Number.isFinite(delta) || delta === 0) return;
    const next = (Number(target[day]) || 0) + delta;
    if (next <= 0) {
        delete target[day];
    } else {
        target[day] = next;
    }
}

function applyHeatmapContribution(
    totals: HeatmapDailyIndexPayload["totals"],
    contribution: HeatmapDocContribution | undefined,
    sign: 1 | -1,
): void {
    if (!contribution) return;
    for (const [day, count] of Object.entries(contribution.counts.block || {})) {
        addCount(totals.block, day, sign * Number(count));
    }
    for (const [day, count] of Object.entries(contribution.counts.word || {})) {
        addCount(totals.word, day, sign * Number(count));
    }
}

function stripSearchMarks(value: unknown): string {
    return String(value || "")
        .replace(/<\/?mark>/g, "")
        .trim();
}

function titleFromPath(path?: string): string {
    if (!path) return "";
    const normalized = path.replace(/\.sy$/i, "");
    const parts = normalized.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
}

function titleFromHPath(hpath?: string): string {
    if (!hpath || hpath === "/") return "";
    const parts = hpath.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
}

function isDocumentType(type: unknown): boolean {
    return type === "d" || type === "NodeDocument";
}

function normalizeSiyuanTimeFromUnix(seconds: unknown): string {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return "";
    const date = new Date(n * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeSiyuanTime(value: unknown): string {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    if (/^\d{14}$/.test(text)) return text;
    if (/^\d{13}$/.test(text)) return normalizeSiyuanTimeFromUnix(Math.floor(Number(text) / 1000));
    if (/^\d{10}$/.test(text)) return normalizeSiyuanTimeFromUnix(Number(text));
    return "";
}

function readIalAttr(block: any, key: string): string {
    const ial = block?.ial;
    if (!ial) return "";
    if (typeof ial === "object") {
        const value = (ial as Record<string, unknown>)[key];
        return value === null || value === undefined ? "" : String(value);
    }
    if (typeof ial !== "string") return "";
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = ial.match(new RegExp(`${escapedKey}="((?:\\\\.|[^"\\\\])*)"`));
    return match?.[1]?.replace(/\\"/g, "\"").replace(/\\\\/g, "\\") || "";
}

function getBlockUpdatedTime(block: any): string {
    return normalizeSiyuanTime(block?.updated) ||
        normalizeSiyuanTime(readIalAttr(block, "updated")) ||
        normalizeSiyuanTime(block?.viewedAt) ||
        normalizeSiyuanTime(block?.openAt) ||
        normalizeSiyuanTime(block?.closedAt);
}

function getBlockCreatedTime(block: any): string {
    return normalizeSiyuanTime(block?.created) ||
        normalizeSiyuanTime(readIalAttr(block, "created"));
}

function normalizeRecentDocRecords(raw: any): any[] {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.value)) return parsed.value;
    if (Array.isArray(parsed?.data)) return parsed.data;
    return [];
}

async function loadRecentDocRecords(): Promise<any[]> {
    try {
        return normalizeRecentDocRecords(await getRecentDocs());
    } catch {
        return normalizeRecentDocRecords(await getFile("/data/storage/recent-doc.json"));
    }
}

function blockToDocInfo(block: any, idOverride?: string): ComponentDocInfo | null {
    const id = idOverride || block?.rootID || block?.root_id || block?.id;
    if (!id) return null;
    const content =
        stripSearchMarks(isDocumentType(block?.type) ? block?.content : "") ||
        titleFromHPath(block?.hPath || block?.hpath) ||
        titleFromPath(block?.path) ||
        id;
    return {
        id,
        content,
        created: getBlockCreatedTime(block),
        updated: getBlockUpdatedTime(block),
        sort: Number(block?.sort) || 0,
        ial: normalizeIal(block?.ial),
        icon: block?.icon,
        box: block?.box,
        path: block?.path,
        hpath: block?.hPath || block?.hpath,
    };
}

async function hydrateDocInfos(
    docs: ComponentDocInfo[],
    includeBuiltinDocIcon: boolean,
    limit = DOC_INFO_LIMIT,
): Promise<ComponentDocInfo[]> {
    const result = [...docs];
    const max = Math.min(limit, result.length);
    for (let i = 0; i < max; i += 1) {
        const doc = result[i];
        if (!doc.id) continue;
        try {
            const info = await getBlockInfo(doc.id);
            result[i] = {
                ...doc,
                content: info?.rootTitle || doc.content || doc.id,
                box: info?.box || doc.box,
                path: info?.path || doc.path,
                icon: includeBuiltinDocIcon ? (info?.rootIcon || doc.icon) : doc.icon,
            };
        } catch {
            result[i] = doc;
        }
    }
    return result;
}

async function searchBlocks(query: string, maxRows = SEARCH_MAX_ROWS): Promise<any[]> {
    const rows: any[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= SEARCH_MAX_PAGES && rows.length < maxRows; page += 1) {
        const res = await fullTextSearchBlock(query, {
            page,
            pageSize: SEARCH_PAGE_SIZE,
            method: 0,
        });
        const blocks = Array.isArray(res?.blocks) ? res.blocks : [];
        for (const block of blocks) {
            const id = block?.id;
            if (id && !seen.has(id)) {
                seen.add(id);
                rows.push(block);
                if (rows.length >= maxRows) break;
            }
        }
        const pageCount = Number(res?.pageCount) || page;
        if (blocks.length === 0 || page >= pageCount) break;
    }
    return rows;
}

function matchesPosition(block: any, position: string): boolean {
    const type = block?.type;
    switch (position) {
        case "DocTitle":
            return isDocumentType(type);
        case "body":
            return !isDocumentType(type);
        case "bodyTitle":
            return type === "h" || type === "NodeHeading";
        case "paragraph":
            return type === "p" || type === "NodeParagraph";
        case "list":
            return type === "l" || type === "i" || type === "NodeList" || type === "NodeListItem";
        case "table":
            return type === "t" || type === "NodeTable";
        case "code":
            return type === "c" || type === "NodeCodeBlock";
        case "quote":
            return type === "b" || type === "NodeBlockquote";
        case "formula":
            return type === "m" || type === "NodeMathBlock";
        case "anywhere":
        default:
            return true;
    }
}

function dedupeDocs(docs: ComponentDocInfo[], sortOrder = "updated"): ComponentDocInfo[] {
    const map = new Map<string, ComponentDocInfo>();
    for (const doc of docs) {
        if (!doc?.id || map.has(doc.id)) continue;
        map.set(doc.id, doc);
    }
    return Array.from(map.values()).sort((a: any, b: any) => {
        const av = a?.[sortOrder] ?? "";
        const bv = b?.[sortOrder] ?? "";
        if (typeof av === "number" && typeof bv === "number") return bv - av;
        return String(bv).localeCompare(String(av));
    });
}

export async function searchDocsByKeywordApi(
    position: string,
    keyword: string,
    sortOrder = "updated",
    includeBuiltinDocIcon = false,
): Promise<ComponentDocInfo[]> {
    const trimmed = keyword.trim();
    if (!trimmed) return [];
    const blocks = await searchBlocks(trimmed);
    const docs = blocks
        .filter((block) => matchesPosition(block, position))
        .map((block) => blockToDocInfo(block))
        .filter((doc): doc is ComponentDocInfo => doc !== null);
    return hydrateDocInfos(dedupeDocs(docs, sortOrder), includeBuiltinDocIcon, includeBuiltinDocIcon ? 10 : 0);
}

export async function searchDocsByTagApi(
    tag: string,
    sortOrder = "updated",
    includeBuiltinDocIcon = false,
): Promise<ComponentDocInfo[]> {
    const trimmed = tag.trim().replace(/^#|#$/g, "");
    if (!trimmed) return [];
    const blocks = await searchBlocks(`#${trimmed}#`);
    const docs = blocks
        .filter((block) => {
            const tagText = String(block?.tag || "");
            const markdown = String(block?.markdown || "");
            return tagText.includes(trimmed) || markdown.includes(`#${trimmed}#`);
        })
        .map((block) => blockToDocInfo(block))
        .filter((doc): doc is ComponentDocInfo => doc !== null);
    return hydrateDocInfos(dedupeDocs(docs, sortOrder), includeBuiltinDocIcon, includeBuiltinDocIcon ? 10 : 0);
}

function isTaskMarkdown(markdown: string): boolean {
    const firstLine = markdown.split("\n\n")[0]?.split("\n")[0]?.trim() || "";
    return /^[-*]\s\[( |x|X)\]/.test(firstLine);
}

function isTaskItemBlock(block: any): boolean {
    const type = block?.type;
    return !type || type === "i" || type === "NodeListItem";
}

function blockToTaskInfo(block: any): ComponentTaskInfo | null {
    const markdown = String(block?.markdown || block?.content || "");
    if (!block?.id || !isTaskItemBlock(block) || !isTaskMarkdown(markdown)) return null;
    const rootId = block?.rootID || block?.root_id || block?.rootId || block?.id;
    const firstLine = markdown.split("\n")[0] || markdown;
    return {
        id: block.id,
        root_id: rootId,
        rootID: rootId,
        parent_id: block?.parent_id || block?.parentID || "",
        parentID: block?.parentID || block?.parent_id || "",
        markdown,
        content: stripSearchMarks(block?.content || markdown),
        created: getBlockCreatedTime(block),
        updated: getBlockUpdatedTime(block),
        hpath: block?.hPath || block?.hpath || "",
        path: block?.path || "",
        box: block?.box,
        type: block?.type || "",
        subtype: block?.subtype || block?.subType || "",
        checked: /^[-*]\s\[[xX]\]/.test(firstLine.trim()),
        source: block?.source || "rebuild",
        indexedAt: block?.indexedAt || new Date().toISOString(),
    };
}

function normalizeTaskIndexItem(
    task: Partial<ComponentTaskInfo> & { id: string },
    source = "plugin",
): ComponentTaskInfo {
    const now = new Date().toISOString();
    const markdown = String(task.markdown || task.content || "");
    const firstLine = markdown.split("\n")[0] || markdown;
    const checked = typeof task.checked === "boolean"
        ? task.checked
        : /^[-*]\s\[[xX]\]/.test(firstLine.trim());
    const rootId = task.root_id || task.rootID || task.id;
    return {
        id: task.id,
        rootID: rootId,
        root_id: rootId,
        parentID: task.parentID || task.parent_id || "",
        parent_id: task.parent_id || task.parentID || "",
        box: task.box || "",
        path: task.path || "",
        hpath: task.hpath || "",
        markdown,
        content: task.content || stripSearchMarks(firstLine),
        created: task.created || "",
        updated: task.updated || now,
        type: task.type || "",
        subtype: task.subtype || "",
        checked,
        source: task.source || source,
        indexedAt: task.indexedAt || now,
        lastVerifiedAt: task.lastVerifiedAt,
    };
}

function getTaskDedupeKey(task: ComponentTaskInfo): string {
    if (task.id) {
        return `id:${task.id}`;
    }
    const rootId = task.root_id || task.rootID || "";
    const firstLine = String(task.markdown || task.content || "").split("\n")[0]?.trim() || "";
    return `fallback:${[
        rootId,
        task.created || "",
        task.updated || "",
        firstLine,
    ].join("\u0001")}`;
}

function preferTaskIndexItem(current: ComponentTaskInfo | undefined, next: ComponentTaskInfo): ComponentTaskInfo {
    if (!current) return next;
    const currentIsTaskItem = isTaskItemBlock(current);
    const nextIsTaskItem = isTaskItemBlock(next);
    if (nextIsTaskItem && !currentIsTaskItem) return next;
    if (!current.parent_id && next.parent_id) return next;
    if (!current.type && next.type) return next;
    return current;
}

function dedupeTaskIndexItems(items: ComponentTaskInfo[]): ComponentTaskInfo[] {
    const map = new Map<string, ComponentTaskInfo>();
    for (const item of items) {
        if (!item?.id) continue;
        const key = getTaskDedupeKey(item);
        map.set(key, preferTaskIndexItem(map.get(key), item));
    }
    return Array.from(map.values());
}

function isPendingTask(item: ComponentTaskInfo): boolean {
    if (typeof item.checked === "boolean") return !item.checked;
    const firstLine = String(item.markdown || "").split("\n")[0] || "";
    return /^[-*]\s\[\s*\]/.test(firstLine.trim());
}

export async function readTaskIndexItems(): Promise<ComponentTaskInfo[]> {
    return dedupeTaskIndexItems(await readJsonIndex<ComponentTaskInfo>(TASK_INDEX_PATH));
}

export async function mergeTaskIndexItems(
    items: Array<Partial<ComponentTaskInfo> & { id: string }>,
    options: { removeRootIds?: string[]; source?: string } = {},
): Promise<number> {
    const rows = await readJsonIndex<ComponentTaskInfo>(TASK_INDEX_PATH);
    const removeRoots = new Set((options.removeRootIds || []).filter(Boolean));
    const map = new Map<string, ComponentTaskInfo>();
    for (const row of rows) {
        if (!row?.id) continue;
        const rootId = row.root_id || row.rootID;
        if (rootId && removeRoots.has(rootId)) continue;
        map.set(row.id, row);
    }
    const changedIds = new Set<string>();
    for (const item of items) {
        if (!item?.id) continue;
        const next = normalizeTaskIndexItem(item, options.source || "plugin");
        map.set(next.id, { ...map.get(next.id), ...next });
        changedIds.add(next.id);
    }
    await writeJsonIndex(TASK_INDEX_PATH, dedupeTaskIndexItems(Array.from(map.values())));
    return changedIds.size;
}

export async function replaceTaskIndexItems(
    items: Array<Partial<ComponentTaskInfo> & { id: string }>,
    source = "rebuild",
): Promise<number> {
    const map = new Map<string, ComponentTaskInfo>();
    for (const item of items) {
        if (!item?.id) continue;
        const next = normalizeTaskIndexItem(item, source);
        map.set(next.id, next);
    }
    const deduped = dedupeTaskIndexItems(Array.from(map.values()));
    await writeJsonIndex(TASK_INDEX_PATH, deduped);
    return deduped.length;
}

export async function pruneMissingTaskIndexItems(options: {
    includeCompleted?: boolean;
} = {}): Promise<number> {
    const rows = dedupeTaskIndexItems(await readJsonIndex<ComponentTaskInfo>(TASK_INDEX_PATH));
    const now = new Date().toISOString();
    const targets = rows.filter((row) => row?.id && (options.includeCompleted || isPendingTask(row)));
    if (targets.length === 0) return 0;

    const missing = new Set<string>();
    for (let i = 0; i < targets.length; i += 32) {
        const batch = targets.slice(i, i + 32);
        const results = await Promise.all(batch.map(async (task) => ({
            id: task.id,
            exists: await isExistingBlock(task.id),
        })));
        for (const result of results) {
            if (!result.exists) missing.add(result.id);
        }
    }
    if (missing.size === 0) {
        const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
        for (const task of targets) {
            map.set(task.id, { ...map.get(task.id), lastVerifiedAt: now });
        }
        await writeJsonIndex(TASK_INDEX_PATH, dedupeTaskIndexItems(Array.from(map.values())));
        return 0;
    }
    await writeJsonIndex(TASK_INDEX_PATH, rows.filter((row) => row?.id && !missing.has(row.id)));
    return missing.size;
}

export async function getTaskIndexResult(
    notebookIds: string[] = [],
    plugin?: any,
): Promise<ComponentDataResult<ComponentTaskInfo>> {
    void plugin;
    await pruneMissingTaskIndexItems();
    const rows = await readTaskIndexItems();
    const filtered = notebookIds.length > 0
        ? rows.filter((item) => item.box && notebookIds.includes(item.box))
        : rows;
    if (filtered.length > 0) {
        return okResult(
            filtered.sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
            "index",
        );
    }
    return disabledResult("任务索引为空，请到主页设置 > 检索管理中建立任务索引或刷新最近文档增量索引。", "index");
}

export async function updateTaskIndexItem(task: Partial<ComponentTaskInfo> & { id: string }): Promise<void> {
    await mergeTaskIndexItems([task], { source: task.source || "plugin" });
}

export async function removeTaskIndexItem(id: string): Promise<void> {
    if (!id) return;
    const rows = await readJsonIndex<ComponentTaskInfo>(TASK_INDEX_PATH);
    await writeJsonIndex(TASK_INDEX_PATH, rows.filter((row) => row?.id !== id));
}

export async function ensureTaskBlockExists(id: string): Promise<boolean> {
    const exists = await isExistingBlock(id);
    if (!exists) {
        await removeTaskIndexItem(id);
    }
    return exists;
}

function normalizeRecentDoc(block: any): ComponentRecentDocSnapshotDoc | null {
    const id = block?.rootID || block?.root_id || block?.id;
    if (!id) return null;
    return {
        id,
        rootID: id,
        box: block?.box || "",
        path: block?.path || "",
        hpath: block?.hPath || block?.hpath || "",
        updated: getBlockUpdatedTime(block),
        content: block?.content || "",
    };
}

export interface PreparedRecentDocs {
    changedDocs: ComponentRecentDocSnapshotDoc[];
    commit: () => Promise<void>;
}

export async function prepareChangedRecentDocsForIndex(consumer: string): Promise<PreparedRecentDocs> {
    const rows = await getRecentUpdatedBlocks({});
    const currentDocs = new Map<string, ComponentRecentDocSnapshotDoc>();
    for (const row of Array.isArray(rows) ? rows : []) {
        const doc = normalizeRecentDoc(row);
        if (!doc?.id) continue;
        const existing = currentDocs.get(doc.id);
        if (!existing || String(doc.updated || "").localeCompare(String(existing.updated || "")) > 0) {
            currentDocs.set(doc.id, doc);
        }
        if (currentDocs.size >= RECENT_DOC_REFRESH_LIMIT) break;
    }

    const snapshot = await readJsonIndexPayload<RecentDocSnapshotPayload>(
        RECENT_DOC_SNAPSHOT_PATH,
        emptyRecentDocSnapshot(),
    );
    const consumerSnapshot = snapshot.consumers?.[consumer] || {};
    const changed = Array.from(currentDocs.values()).filter((doc) => consumerSnapshot[doc.id] !== (doc.updated || ""));

    async function commit(): Promise<void> {
        const nextConsumers = {
            ...(snapshot.consumers || {}),
            [consumer]: {
                ...consumerSnapshot,
            },
        };
        for (const doc of currentDocs.values()) {
            nextConsumers[consumer][doc.id] = doc.updated || "";
        }
        await writeJsonIndexPayload(RECENT_DOC_SNAPSHOT_PATH, {
            version: INDEX_VERSION,
            updatedAt: new Date().toISOString(),
            docs: {
                ...(snapshot.docs || {}),
                ...Object.fromEntries(currentDocs.entries()),
            },
            consumers: nextConsumers,
        } satisfies RecentDocSnapshotPayload);
    }

    return { changedDocs: changed, commit };
}

async function queryTaskBlocksByRootIds(rootIds: string[]): Promise<{ tasks: ComponentTaskInfo[]; truncated: boolean }> {
    const PAGE_SIZE = 2000;
    const MAX_ROWS_PER_CHUNK = 50000;
    const tasks: ComponentTaskInfo[] = [];
    let truncated = false;
    const uniqueIds = Array.from(new Set(rootIds.filter(Boolean)));
    for (let i = 0; i < uniqueIds.length; i += 32) {
        const chunk = uniqueIds.slice(i, i + 32);
        const escaped = chunk.map((id) => `'${escapeSqlString(id)}'`).join(",");
        let offset = 0;
        let pageRows: unknown[];
        do {
            pageRows = await sql(`
                SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, created, updated
                FROM blocks
                WHERE subtype = 't' AND type = 'i' AND root_id IN (${escaped})
                ORDER BY updated DESC, id DESC
                LIMIT ${PAGE_SIZE} OFFSET ${offset}
            `);
            const rows = Array.isArray(pageRows) ? pageRows : [];
            for (const row of rows) {
                const task = blockToTaskInfo({ ...(row as Record<string, unknown>), source: "recent-doc-refresh" });
                if (task) tasks.push(task);
            }
            offset += PAGE_SIZE;
            if (offset >= MAX_ROWS_PER_CHUNK) {
                truncated = true;
                break;
            }
        } while (pageRows.length === PAGE_SIZE);
    }
    return { tasks, truncated };
}

export async function refreshTaskIndexFromRecentDocuments(
    plugin?: any,
    options: { force?: boolean; ttlMs?: number } = {},
): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();
    const ttlMs = options.ttlMs ?? RECENT_REFRESH_TTL_MS;
    const lastRunAt = recentRefreshMemory.get("task") || 0;
    if (!options.force && Date.now() - lastRunAt < ttlMs) {
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: "任务索引最近已刷新，本次跳过重复刷新。",
            migratedCount: 0,
            skippedCount: 0,
        };
    }

    try {
        const { changedDocs, commit } = await prepareChangedRecentDocsForIndex("task");
        if (changedDocs.length === 0) {
            await commit();
            recentRefreshMemory.set("task", Date.now());
            return {
                lastRunAt: now,
                lastStatus: "success",
                lastMessage: "最近文档没有任务相关变动。",
                migratedCount: 0,
                skippedCount: 0,
            };
        }
        const rootIds = changedDocs.map((doc) => doc.id);
        const { tasks, truncated } = await queryTaskBlocksByRootIds(rootIds);
        const migratedCount = await mergeTaskIndexItems(tasks, {
            removeRootIds: rootIds,
            source: "recent-doc-refresh",
        });
        await commit();
        recentRefreshMemory.set("task", Date.now());
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: truncated
                ? `任务增量刷新完成：更新 ${changedDocs.length} 个文档，写入 ${migratedCount} 条任务（部分文档块数超过安全上限，已截断）。`
                : `任务增量刷新完成：更新 ${changedDocs.length} 个文档，写入 ${migratedCount} 条任务。`,
            migratedCount,
            skippedCount: Math.max(0, changedDocs.length - rootIds.length),
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "任务增量刷新失败",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
}

export async function rebuildTaskIndexFromGlobalSql(plugin: any): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();

    try {
        const tasks: ComponentTaskInfo[] = [];
        let skippedCount = 0;
        for (let offset = 0; offset < TASK_REBUILD_MAX_ROWS; offset += TASK_REBUILD_PAGE_SIZE) {
            const stmt = `
                SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, created, updated
                FROM blocks
                WHERE subtype = 't' AND type = 'i'
                ORDER BY updated DESC, id DESC
                LIMIT ${TASK_REBUILD_PAGE_SIZE} OFFSET ${offset}
            `;
            const result = await runHomepageManualIndexSqlQuery(plugin, stmt, { maxLimit: TASK_REBUILD_PAGE_SIZE });
            if (result.ok === false) {
                return {
                    lastRunAt: now,
                    lastStatus: "error",
                    lastMessage: result.reason,
                    migratedCount: 0,
                    skippedCount,
                };
            }
            for (const row of result.rows) {
                const task = blockToTaskInfo({ ...row, source: "rebuild" });
                if (task) {
                    tasks.push(task);
                } else {
                    skippedCount += 1;
                }
            }
            if (result.rows.length < TASK_REBUILD_PAGE_SIZE) break;
        }
        const migratedCount = await replaceTaskIndexItems(tasks, "rebuild");
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: `任务索引重建完成：写入 ${migratedCount} 条，跳过 ${skippedCount} 条。`,
            migratedCount,
            skippedCount,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "任务索引重建失败",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
}

export interface IndexInitializationResult {
    initialized: boolean;
    status: ComponentMigrationStatus;
}

/**
 * 任务索引前台自动初始化：仅在 task-index.json 不存在时执行一次全量重建。
 * 后续组件加载/刷新应使用 refreshTaskIndexFromRecentDocuments 做增量刷新。
 */
export async function ensureTaskIndexInitialized(
    plugin: any,
): Promise<IndexInitializationResult> {
    if (await doesIndexFileExist(TASK_INDEX_PATH)) {
        return { initialized: false, status: { lastStatus: "idle" } };
    }
    const status = await rebuildTaskIndexFromGlobalSql(plugin);
    return { initialized: status.lastStatus === "success", status };
}

export async function getRecentDocumentsApi(
    notebookIds: string[] = [],
    includeBuiltinDocIcon = false,
    maxRows = 100,
): Promise<ComponentDocInfo[]> {
    try {
        const rows = await getRecentUpdatedBlocks({});
        const docs = (Array.isArray(rows) ? rows : [])
            .filter((block) => notebookIds.length === 0 || notebookIds.includes(block?.box))
            .map((block) => blockToDocInfo(block))
            .filter((doc): doc is ComponentDocInfo => doc !== null);
        return hydrateDocInfos(dedupeDocs(docs).slice(0, maxRows), includeBuiltinDocIcon, Math.min(20, maxRows));
    } catch {
        return [];
    }
}

export async function getRecentDocumentsFromStorageApi(
    notebookIds: string[] = [],
    includeBuiltinDocIcon = false,
    maxRows = 100,
): Promise<ComponentDocInfo[]> {
    try {
        const records = await loadRecentDocRecords();
        const sortedRecords = [...records].sort((a: any, b: any) => {
            const av = Number(a?.viewedAt || a?.openAt || a?.closedAt || 0);
            const bv = Number(b?.viewedAt || b?.openAt || b?.closedAt || 0);
            return bv - av;
        });
        const ids = Array.from(new Set(
            sortedRecords
                .map((item: any) => item?.rootID || item?.id)
                .filter(Boolean),
        )).slice(0, maxRows);
        const latestById = new Map<string, any>();
        for (const item of sortedRecords) {
            const id = item?.rootID || item?.id;
            if (!id || latestById.has(id)) continue;
            latestById.set(id, item);
        }
        const docs = ids.map((id) => {
            const item = latestById.get(String(id));
            return {
                id: String(id),
                content: item?.title || String(id),
                updated: normalizeSiyuanTime(item?.viewedAt) || normalizeSiyuanTime(item?.openAt),
                icon: includeBuiltinDocIcon ? item?.icon : undefined,
            };
        });
        const hydrated = await hydrateDocInfos(docs, includeBuiltinDocIcon, Math.min(50, ids.length));
        return notebookIds.length > 0
            ? hydrated.filter((doc) => doc.box && notebookIds.includes(doc.box))
            : hydrated;
    } catch {
        return [];
    }
}

export async function getChildDocumentsByFileTree(
    parentId: string,
    sortOrder = "updated",
    includeBuiltinDocIcon = false,
): Promise<ComponentDocInfo[]> {
    try {
        const pathInfo = await getPathByID(parentId);
        const notebook = pathInfo?.notebook;
        const path = pathInfo?.path;
        if (!notebook || !path) return [];
        const childPath = String(path).replace(/\.sy$/i, "");
        const res = await listDocsByPath(notebook, childPath);
        const files = Array.isArray((res as any)?.files) ? (res as any).files : [];
        const docs = files.map((file: any) => ({
            id: file.id,
            content: file.name || file.id,
            created: normalizeSiyuanTimeFromUnix(file.ctime),
            updated: normalizeSiyuanTimeFromUnix(file.mtime),
            sort: Number(file.sort) || 0,
            icon: includeBuiltinDocIcon ? file.icon : undefined,
            box: notebook,
            path: file.path,
        }));
        return dedupeDocs(docs, sortOrder);
    } catch {
        return [];
    }
}

export async function getRootDocumentCandidates(maxRows = 200): Promise<ComponentDocInfo[]> {
    try {
        const notebooks = await lsNotebooks();
        const result: ComponentDocInfo[] = [];
        for (const notebook of notebooks?.notebooks || []) {
            if (notebook?.closed) continue;
            const res = await listDocsByPath(notebook.id, "/");
            const files = Array.isArray((res as any)?.files) ? (res as any).files : [];
            for (const file of files) {
                if (!file?.id) continue;
                result.push({
                    id: file.id,
                    content: file.name || file.id,
                    created: normalizeSiyuanTimeFromUnix(file.ctime),
                    updated: normalizeSiyuanTimeFromUnix(file.mtime),
                    sort: Number(file.sort) || 0,
                    icon: file.icon,
                    box: notebook.id,
                    path: file.path,
                });
                if (result.length >= maxRows) return result;
            }
        }
        return result;
    } catch {
        return [];
    }
}

export async function getRecentHeatmapCounts(
    startDate: string,
    endDate: string,
    countType: "block" | "word",
): Promise<Record<string, number>> {
    try {
        const rows = await getRecentUpdatedBlocks({});
        const counts: Record<string, number> = {};
        for (const block of Array.isArray(rows) ? rows : []) {
            const updated = getBlockUpdatedTime(block);
            if (updated.length < 8) continue;
            const day = `${updated.slice(0, 4)}-${updated.slice(4, 6)}-${updated.slice(6, 8)}`;
            if (day < startDate || day > endDate) continue;
            const increment = countType === "word"
                ? String(block?.content || block?.markdown || "").length
                : 1;
            if (increment > 0) {
                counts[day] = (counts[day] || 0) + increment;
            }
        }
        return counts;
    } catch {
        return {};
    }
}

function pickCountsByRange(source: Record<string, number>, startDate: string, endDate: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [day, count] of Object.entries(source || {})) {
        if (day >= startDate && day <= endDate && Number(count) > 0) {
            result[day] = Number(count);
        }
    }
    return result;
}

function buildHeatmapContributionFromRows(
    doc: ComponentRecentDocSnapshotDoc,
    rows: any[],
): HeatmapDocContribution {
    const contribution: HeatmapDocContribution = {
        id: doc.id,
        box: doc.box,
        path: doc.path,
        hpath: doc.hpath,
        updated: doc.updated,
        counts: {
            block: {},
            word: {},
        },
    };
    for (const row of rows) {
        const day = dayFromSiyuanTime(getBlockUpdatedTime(row));
        if (!day) continue;
        addCount(contribution.counts.block, day, 1);
        addCount(contribution.counts.word, day, String(row?.content || "").length);
    }
    return contribution;
}

async function queryHeatmapBlocksByRootIds(rootIds: string[]): Promise<{ blocksByRoot: Map<string, any[]>; truncated: boolean }> {
    const PAGE_SIZE = 2000;
    const MAX_ROWS_PER_CHUNK = 50000;
    const blocksByRoot = new Map<string, any[]>();
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
                SELECT id, root_id, box, path, hpath, content, created, updated, type
                FROM blocks
                WHERE root_id IN (${escaped}) OR id IN (${escaped})
                ORDER BY updated DESC, id DESC
                LIMIT ${PAGE_SIZE} OFFSET ${offset}
            `);
            const rows = Array.isArray(pageRows) ? pageRows : [];
            for (const row of rows) {
                const record = row as Record<string, unknown>;
                const rootId = String(record?.root_id || record?.id || "");
                if (!rootId) continue;
                if (!blocksByRoot.has(rootId)) blocksByRoot.set(rootId, []);
                blocksByRoot.get(rootId)!.push(record);
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

export async function refreshHeatmapIndexFromRecentDocuments(
    plugin?: any,
    options: { force?: boolean; ttlMs?: number } = {},
): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();
    const ttlMs = options.ttlMs ?? RECENT_REFRESH_TTL_MS;
    const lastRunAt = recentRefreshMemory.get("heatmap") || 0;
    if (!options.force && Date.now() - lastRunAt < ttlMs) {
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: "热力图索引最近已刷新，本次跳过重复刷新。",
            migratedCount: 0,
            skippedCount: 0,
        };
    }

    try {
        const { changedDocs, commit } = await prepareChangedRecentDocsForIndex("heatmap");
        if (changedDocs.length === 0) {
            await commit();
            recentRefreshMemory.set("heatmap", Date.now());
            return {
                lastRunAt: now,
                lastStatus: "success",
                lastMessage: "最近文档没有热力图相关变动。",
                migratedCount: 0,
                skippedCount: 0,
            };
        }
        const payload = await readJsonIndexPayload<HeatmapDailyIndexPayload>(
            HEATMAP_DAILY_INDEX_PATH,
            emptyHeatmapDailyIndex(),
        );
        const { blocksByRoot, truncated } = await queryHeatmapBlocksByRootIds(changedDocs.map((doc) => doc.id));
        for (const doc of changedDocs) {
            applyHeatmapContribution(payload.totals, payload.docs?.[doc.id], -1);
            const next = buildHeatmapContributionFromRows(doc, blocksByRoot.get(doc.id) || []);
            payload.docs[doc.id] = next;
            applyHeatmapContribution(payload.totals, next, 1);
        }
        payload.version = INDEX_VERSION;
        payload.updatedAt = now;
        await writeJsonIndexPayload(HEATMAP_DAILY_INDEX_PATH, payload);
        await commit();
        recentRefreshMemory.set("heatmap", Date.now());
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: truncated
                ? `热力图增量刷新完成：更新 ${changedDocs.length} 个文档（部分文档块数超过安全上限，已截断）。`
                : `热力图增量刷新完成：更新 ${changedDocs.length} 个文档。`,
            migratedCount: changedDocs.length,
            skippedCount: 0,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "热力图增量刷新失败",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
}

export async function rebuildHeatmapDailyIndexFromGlobalSql(
    plugin: any,
    startDate: string,
    endDate: string,
): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();

    const start = String(startDate || "").replace(/-/g, "");
    const end = String(endDate || "").replace(/-/g, "");
    if (start.length !== 8 || end.length !== 8) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: "热力图重建日期范围无效。",
            migratedCount: 0,
            skippedCount: 0,
        };
    }

    try {
        const payload = emptyHeatmapDailyIndex();
        let migratedCount = 0;
        let skippedCount = 0;
        for (let offset = 0; offset < HEATMAP_REBUILD_MAX_ROWS; offset += HEATMAP_REBUILD_PAGE_SIZE) {
            const stmt = `
                SELECT id, root_id, box, path, hpath, content, created, updated, type
                FROM blocks
                WHERE updated >= '${start}000000' AND updated <= '${end}235959'
                ORDER BY updated DESC, id DESC
                LIMIT ${HEATMAP_REBUILD_PAGE_SIZE} OFFSET ${offset}
            `;
            const result = await runHomepageManualIndexSqlQuery(plugin, stmt, { maxLimit: HEATMAP_REBUILD_PAGE_SIZE });
            if (result.ok === false) {
                return {
                    lastRunAt: now,
                    lastStatus: "error",
                    lastMessage: result.reason,
                    migratedCount,
                    skippedCount,
                };
            }
            for (const row of result.rows) {
                const rootId = String(row?.root_id || row?.id || "");
                const rowUpdated = getBlockUpdatedTime(row);
                const day = dayFromSiyuanTime(rowUpdated);
                if (!rootId || !day) {
                    skippedCount += 1;
                    continue;
                }
                if (!payload.docs[rootId]) {
                    payload.docs[rootId] = {
                        id: rootId,
                        box: String(row?.box || ""),
                        path: String(row?.path || ""),
                        hpath: String(row?.hpath || ""),
                        updated: rowUpdated,
                        counts: {
                            block: {},
                            word: {},
                        },
                    };
                }
                addCount(payload.docs[rootId].counts.block, day, 1);
                addCount(payload.docs[rootId].counts.word, day, String(row?.content || "").length);
                addCount(payload.totals.block, day, 1);
                addCount(payload.totals.word, day, String(row?.content || "").length);
                migratedCount += 1;
            }
            if (result.rows.length < HEATMAP_REBUILD_PAGE_SIZE) break;
        }
        payload.version = INDEX_VERSION;
        payload.updatedAt = now;
        await writeJsonIndexPayload(HEATMAP_DAILY_INDEX_PATH, payload);
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: `热力图索引重建完成：统计 ${migratedCount} 个块，跳过 ${skippedCount} 条。`,
            migratedCount,
            skippedCount,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "热力图索引重建失败",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
}

/**
 * 热力图索引前台自动初始化：仅在 heatmap-daily-index.json 不存在时按当前范围执行一次全量重建。
 * 后续组件加载/刷新应使用 refreshHeatmapDailyIndexFromRecentDocuments 做增量刷新。
 */
export async function ensureHeatmapIndexInitialized(
    plugin: any,
    startDate: string,
    endDate: string,
): Promise<IndexInitializationResult> {
    if (await doesIndexFileExist(HEATMAP_DAILY_INDEX_PATH)) {
        return { initialized: false, status: { lastStatus: "idle" } };
    }
    const status = await rebuildHeatmapDailyIndexFromGlobalSql(plugin, startDate, endDate);
    return { initialized: status.lastStatus === "success", status };
}

export async function getRecentHeatmapCountsResult(
    startDate: string,
    endDate: string,
    countType: "block" | "word",
    plugin?: any,
): Promise<ComponentCountsResult> {
    void plugin;
    const index = await readJsonIndexPayload<HeatmapDailyIndexPayload>(
        HEATMAP_DAILY_INDEX_PATH,
        emptyHeatmapDailyIndex(),
    );
    const counts = pickCountsByRange(index.totals?.[countType] || {}, startDate, endDate);
    const hasIndexData = Object.values(counts).some((value) => Number(value) > 0);
    if (hasIndexData) {
        return {
            counts,
            status: "ok",
            mode: "index",
            message: "热力图数据来自本地索引。",
        };
    }

    const recentCounts = await getRecentHeatmapCounts(startDate, endDate, countType);
    const hasRecentData = Object.values(recentCounts).some((value) => Number(value) > 0);
    return {
        counts: recentCounts,
        status: hasRecentData ? "limited" : "empty",
        mode: "recent_api",
        message: hasRecentData
            ? "热力图索引为空，当前显示最近文档近似数据；请到主页设置 > 检索管理中手动重建索引。"
            : "热力图索引为空，请到主页设置 > 检索管理中手动重建索引。",
    };
}

export async function getRecentDailyNotesApi(includeBuiltinDocIcon = false): Promise<ComponentDocInfo[]> {
    try {
        const rows = await getRecentUpdatedBlocks({});
        const docs = (Array.isArray(rows) ? rows : [])
            .filter((block) => isDocumentType(block?.type) && normalizeIal(block?.ial)?.includes("custom-dailynote-"))
            .map((block) => blockToDocInfo(block))
            .filter((doc): doc is ComponentDocInfo => doc !== null);
        return hydrateDocInfos(dedupeDocs(docs, "created").slice(0, 100), includeBuiltinDocIcon, includeBuiltinDocIcon ? 10 : 0);
    } catch {
        return [];
    }
}

async function collectDocsFromFileTree(
    notebook: string,
    basePath: string,
    maxDocs = 100,
    maxDepth = 3,
): Promise<ComponentDocInfo[]> {
    const result: ComponentDocInfo[] = [];
    const queue: Array<{ path: string; depth: number }> = [{ path: basePath, depth: 0 }];
    while (queue.length > 0 && result.length < maxDocs) {
        const current = queue.shift()!;
        let res: any;
        try {
            res = await listDocsByPath(notebook, current.path);
        } catch {
            continue;
        }
        const files = Array.isArray(res?.files) ? res.files : [];
        for (const file of files) {
            if (!file?.id) continue;
            result.push({
                id: file.id,
                content: file.name || file.id,
                created: normalizeSiyuanTimeFromUnix(file.ctime),
                updated: normalizeSiyuanTimeFromUnix(file.mtime),
                sort: Number(file.sort) || 0,
                icon: file.icon,
                box: notebook,
                path: file.path,
            });
            if (result.length >= maxDocs) break;
            if (file.subFileCount > 0 && current.depth < maxDepth) {
                queue.push({ path: String(file.path || "").replace(/\.sy$/i, ""), depth: current.depth + 1 });
            }
        }
    }
    return result;
}

function looksLikeDailyDoc(doc: ComponentDocInfo): boolean {
    const text = [doc.content, doc.path, doc.hpath].join("/");
    return /(\d{4}[-/.年]?\d{1,2}[-/.月]?\d{1,2})|(\d{4}\/\d{1,2}\/\d{1,2})|daily note|日记/.test(text);
}

export async function getLatestDailyNotesResult(
    includeBuiltinDocIcon = false,
    dailyNotebookId?: string,
): Promise<ComponentDataResult<ComponentDocInfo>> {
    if (dailyNotebookId) {
        const docs = await collectDocsFromFileTree(dailyNotebookId, "/", 100, 3);
        const filtered = docs
            .filter(looksLikeDailyDoc)
            .sort((a, b) => String(b.created || b.updated).localeCompare(String(a.created || a.updated)))
            .slice(0, 100);
        if (filtered.length > 0) {
            return okResult(filtered, "scoped_filetree", "按配置的日记笔记本有限列出最近日记。");
        }
    }
    const recent = await getRecentDailyNotesApi(includeBuiltinDocIcon);
    return {
        items: recent,
        status: recent.length > 0 ? "limited" : "empty",
        mode: "recent_api",
        message: recent.length > 0
            ? "从最近更新 API 中识别日记。"
            : "未配置日记目录，最近更新 API 也未返回可识别日记。",
    };
}

export async function getFavoritesIndexResult(
    notebookIds: string[] = [],
    plugin?: any,
): Promise<ComponentDataResult<ComponentDocInfo>> {
    void plugin;
    const rows = await readJsonIndex<ComponentDocInfo>(FAVORITES_INDEX_PATH);
    const existing = await filterExistingItems(rows, FAVORITES_INDEX_PATH);
    const filtered = notebookIds.length > 0
        ? existing.filter((item) => item.box && notebookIds.includes(item.box))
        : existing;
    if (filtered.length > 0) {
        return okResult(filtered.sort((a, b) => String(b.updated).localeCompare(String(a.updated))), "index");
    }
    return disabledResult("收藏索引为空，可重新收藏文档，或到主页设置 > 检索管理中迁移旧收藏属性。", "index");
}

export async function mergeFavoriteIndexItems(items: ComponentDocInfo[]): Promise<number> {
    const rows = await readJsonIndex<ComponentDocInfo>(FAVORITES_INDEX_PATH);
    const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
    const mergedIds = new Set<string>();
    for (const item of items) {
        if (!item?.id) continue;
        map.set(item.id, { ...map.get(item.id), ...item });
        mergedIds.add(item.id);
    }
    await writeJsonIndex(FAVORITES_INDEX_PATH, Array.from(map.values()));
    return mergedIds.size;
}

export async function migrateFavoritesIndexFromGlobalSql(
    plugin: any,
    notebookIds: string[] = [],
): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();
    const PAGE_SIZE = 500;
    const MAX_ROWS = 50000;

    try {
        let totalMigrated = 0;
        let totalSkipped = 0;
        let totalCleanupFailed = 0;
        let reachedLimit = false;

        for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
            const stmt = `
                SELECT id, content, created, updated, box, path, hpath, ial
                FROM blocks
                WHERE type = 'd' AND ial LIKE '%custom-homepage-favorites%'
                ORDER BY updated DESC, id DESC
                LIMIT ${PAGE_SIZE} OFFSET ${offset}
            `;
            const result = await runHomepageManualIndexSqlQuery<ComponentDocInfo>(plugin, stmt);
            if (result.ok === false) {
                return {
                    lastRunAt: now,
                    lastStatus: "error",
                    lastMessage: result.reason,
                    migratedCount: totalMigrated,
                    skippedCount: totalSkipped,
                };
            }

            const rows = result.rows;
            if (rows.length === 0) break;

            const docs: ComponentDocInfo[] = [];
            const migratedIds: string[] = [];
            let pageSkipped = 0;

            for (const row of rows) {
                const doc = blockToDocInfo(row);
                if (!doc?.id) {
                    pageSkipped += 1;
                    continue;
                }
                if (notebookIds.length > 0 && !(doc.box && notebookIds.includes(doc.box))) {
                    pageSkipped += 1;
                    continue;
                }
                const exists = await isExistingBlock(doc.id);
                if (!exists) {
                    pageSkipped += 1;
                    continue;
                }
                docs.push(doc);
                migratedIds.push(doc.id);
            }

            const pageMigrated = await mergeFavoriteIndexItems(docs);
            totalMigrated += pageMigrated;
            totalSkipped += pageSkipped;

            let pageCleanupFailed = 0;
            for (const id of migratedIds) {
                try {
                    await setBlockAttrsChecked(id, { "custom-homepage-favorites": "" });
                } catch {
                    pageCleanupFailed += 1;
                }
            }
            totalCleanupFailed += pageCleanupFailed;

            if (rows.length < PAGE_SIZE) break;
            if (offset + PAGE_SIZE >= MAX_ROWS) {
                reachedLimit = true;
                break;
            }
        }

        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: reachedLimit
                ? `旧收藏迁移达到 ${MAX_ROWS} 条安全上限，可能仍有未迁移数据；已迁移 ${totalMigrated} 条，跳过 ${totalSkipped} 条，${totalCleanupFailed} 条旧属性清理失败。`
                : totalCleanupFailed > 0
                    ? `已将 ${totalMigrated} 条旧收藏迁移到索引，跳过 ${totalSkipped} 条，${totalCleanupFailed} 条旧属性清理失败。`
                    : `已将 ${totalMigrated} 条旧收藏迁移到索引，跳过 ${totalSkipped} 条，并已清理旧属性。`,
            migratedCount: totalMigrated,
            skippedCount: totalSkipped,
            cleanedCount: Math.max(0, totalMigrated - totalCleanupFailed),
            cleanupFailedCount: totalCleanupFailed,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "旧收藏迁移失败",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
}

/**
 * 收藏索引前台自动初始化：仅在 favorites-index.json 不存在时创建一个空索引文件。
 * 旧属性迁移不会自动执行，必须用户手动点击“手动迁移旧数据”。
 */
export async function ensureFavoritesIndexInitialized(
    plugin: any,
): Promise<IndexInitializationResult> {
    void plugin;
    if (await doesIndexFileExist(FAVORITES_INDEX_PATH)) {
        return { initialized: false, status: { lastStatus: "idle" } };
    }
    const now = new Date().toISOString();
    await writeJsonIndex(FAVORITES_INDEX_PATH, []);
    return {
        initialized: true,
        status: {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: "已创建空收藏索引；新增收藏后会自动写入。",
        },
    };
}

export async function updateFavoriteIndex(docId: string, active: boolean): Promise<void> {
    const rows = await readJsonIndex<ComponentDocInfo>(FAVORITES_INDEX_PATH);
    const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
    if (!active) {
        map.delete(docId);
        await writeJsonIndex(FAVORITES_INDEX_PATH, Array.from(map.values()));
        try {
            await setBlockAttrsChecked(docId, { "custom-homepage-favorites": "" });
        } catch {
            // 清理旧收藏属性失败不影响本地索引状态。
        }
        return;
    }
    let info: any = {};
    try {
        info = await getBlockInfo(docId);
    } catch {
        info = {};
    }
    map.set(docId, {
        id: docId,
        content: info?.rootTitle || docId,
        box: info?.box || "",
        path: info?.path || "",
        icon: info?.rootIcon || "",
        updated: new Date().toISOString(),
    });
    await writeJsonIndex(FAVORITES_INDEX_PATH, Array.from(map.values()));
}

export async function getReviewIndexResult<T = any>(
    plugin?: any,
): Promise<ComponentDataResult<T>> {
    void plugin;
    const rows = await readJsonIndex<T & { id?: string }>(REVIEW_INDEX_PATH);
    const existing = await filterExistingItems(rows, REVIEW_INDEX_PATH);
    if (existing.length > 0) {
        return okResult(existing as T[], "index");
    }
    return disabledResult("复习索引为空；可新增复习计划，或到主页设置 > 检索管理中迁移旧属性。", "index");
}

export async function updateReviewIndexItem<T extends { id: string }>(item: T): Promise<void> {
    const rows = await readJsonIndex<T>(REVIEW_INDEX_PATH);
    const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
    map.set(item.id, item);
    await writeJsonIndex(REVIEW_INDEX_PATH, Array.from(map.values()));
}

export async function getReviewIndexItem<T extends { id: string } = any>(id: string): Promise<T | null> {
    if (!id) return null;
    const rows = await readJsonIndex<T>(REVIEW_INDEX_PATH);
    return rows.find((row) => row?.id === id) || null;
}

export async function mergeReviewIndexItems<T extends { id: string }>(items: T[]): Promise<number> {
    const rows = await readJsonIndex<T>(REVIEW_INDEX_PATH);
    const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
    const mergedIds = new Set<string>();
    for (const item of items) {
        if (!item?.id) continue;
        map.set(item.id, { ...map.get(item.id), ...item });
        mergedIds.add(item.id);
    }
    await writeJsonIndex(REVIEW_INDEX_PATH, Array.from(map.values()));
    return mergedIds.size;
}

export async function removeReviewIndexItem(id: string): Promise<void> {
    const rows = await readJsonIndex<{ id: string }>(REVIEW_INDEX_PATH);
    await writeJsonIndex(REVIEW_INDEX_PATH, rows.filter((row) => row?.id !== id));
}

/**
 * 复习索引前台自动初始化：仅在 review-index.json 不存在时创建一个空索引文件。
 * 旧属性迁移不会自动执行，必须用户手动点击“手动迁移旧数据”。
 */
export async function ensureReviewIndexInitialized(
    plugin: any,
): Promise<IndexInitializationResult> {
    void plugin;
    if (await doesIndexFileExist(REVIEW_INDEX_PATH)) {
        return { initialized: false, status: { lastStatus: "idle" } };
    }
    const now = new Date().toISOString();
    await writeJsonIndex(REVIEW_INDEX_PATH, []);
    return {
        initialized: true,
        status: {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: "已创建空复习索引；新增复习计划后会自动写入。",
        },
    };
}

export async function refreshFavoritesIndex(plugin?: any): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();
    try {
        const rows = await readJsonIndex<ComponentDocInfo>(FAVORITES_INDEX_PATH);
        const existing = await filterExistingItems(rows, FAVORITES_INDEX_PATH);
        const removedCount = rows.length - existing.length;
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: removedCount > 0
                ? `收藏索引刷新完成：保留 ${existing.length} 条，移除 ${removedCount} 条无效记录。`
                : `收藏索引刷新完成：${existing.length} 条记录均有效，无变更。`,
            migratedCount: existing.length,
            removedCount,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "收藏索引刷新失败",
        };
    }
}

export async function refreshReviewIndex(plugin?: any): Promise<ComponentMigrationStatus> {
    void plugin;
    const now = new Date().toISOString();
    try {
        const rows = await readJsonIndex<{ id?: string }>(REVIEW_INDEX_PATH);
        const existing = await filterExistingItems(rows, REVIEW_INDEX_PATH);
        const removedCount = rows.length - existing.length;
        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage: removedCount > 0
                ? `复习索引刷新完成：保留 ${existing.length} 条，移除 ${removedCount} 条无效记录。`
                : `复习索引刷新完成：${existing.length} 条记录均有效，无变更。`,
            migratedCount: existing.length,
            removedCount,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "复习索引刷新失败",
        };
    }
}
