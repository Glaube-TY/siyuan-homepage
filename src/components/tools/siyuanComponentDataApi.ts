import {
    fullTextSearchBlock,
    getBlockInfo,
    getFile,
    getPathByID,
    getRecentUpdatedBlocks,
    checkBlockExist,
    listDocsByPath,
    lsNotebooks,
    putFile,
    sql,
} from "@/api";
import { validateSafeSelectSql } from "@/features/kb/services/siyuan/safe-sql";
import {
    loadHomepageSettingConfig,
    normalizeAllowHomepageGlobalSqlQuery,
} from "@/homepage/homepageSetting/config";

export type ComponentDataStatus = "ok" | "empty" | "limited" | "disabled" | "unsupported" | "error";
export type ComponentDataMode =
    | "official_api"
    | "recent_api"
    | "index"
    | "scoped_filetree"
    | "user_sql"
    | "global_sql_compat"
    | "disabled";

export interface ComponentGlobalSqlPolicy {
    allowGlobalSql: boolean;
}

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
    markdown: string;
    content: string;
    created: string;
    updated: string;
    hpath: string;
    box?: string;
    checked?: boolean;
    source?: string;
}

const SEARCH_PAGE_SIZE = 32;
const SEARCH_MAX_PAGES = 5;
const SEARCH_MAX_ROWS = 200;
const DOC_INFO_LIMIT = 20;
const COMPONENT_INDEX_DIR = "/data/storage/petal/siyuan-homepage";
const TASK_INDEX_PATH = `${COMPONENT_INDEX_DIR}/task-index.json`;
const FAVORITES_INDEX_PATH = `${COMPONENT_INDEX_DIR}/favorites-index.json`;
const REVIEW_INDEX_PATH = `${COMPONENT_INDEX_DIR}/review-index.json`;
const INDEX_VERSION = 1;
const GLOBAL_COMPAT_MAX_LIMIT = 2000;
const GLOBAL_COMPAT_TABLES = ["blocks"];

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

export async function getHomepageGlobalSqlPolicy(plugin: any): Promise<ComponentGlobalSqlPolicy> {
    try {
        const config = await loadHomepageSettingConfig(plugin);
        return { allowGlobalSql: normalizeAllowHomepageGlobalSqlQuery(config?.allowHomepageGlobalSqlQuery) };
    } catch {
        return { allowGlobalSql: false };
    }
}

export interface HomepageGlobalSqlCompatOptions {
    maxLimit?: number;
    allowedTables?: string[];
}

export async function runHomepageGlobalSqlCompatQuery<T = Record<string, unknown>>(
    plugin: any,
    stmt: string,
    options?: HomepageGlobalSqlCompatOptions,
): Promise<{ ok: true; rows: T[] } | { ok: false; rows: T[]; reason: string }> {
    const policy = await getHomepageGlobalSqlPolicy(plugin);
    if (!policy.allowGlobalSql) {
        return { ok: false, rows: [], reason: "全库 SQL 兼容模式未开启" };
    }
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

async function readJsonIndex<T>(path: string): Promise<T[]> {
    try {
        const raw = await getFile(path);
        const text = typeof raw === "string"
            ? raw
            : typeof raw?.text === "function"
                ? await raw.text()
                : "";
        const parsed = text ? JSON.parse(text) : raw;
        const items = Array.isArray(parsed) ? parsed : parsed?.items;
        return Array.isArray(items) ? items.filter(Boolean) as T[] : [];
    } catch {
        return [];
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

async function isExistingBlock(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        return Boolean(await checkBlockExist(id));
    } catch {
        return true;
    }
}

async function filterExistingItems<T extends { id?: string }>(
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
        created: block?.created || "",
        updated: block?.updated || "",
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

function blockToTaskInfo(block: any): ComponentTaskInfo | null {
    const markdown = String(block?.markdown || block?.content || "");
    if (!block?.id || !isTaskMarkdown(markdown)) return null;
    return {
        id: block.id,
        root_id: block.rootID || block.root_id,
        rootID: block.rootID || block.root_id,
        markdown,
        content: stripSearchMarks(block?.content || markdown),
        created: block?.created || "",
        updated: block?.updated || "",
        hpath: block?.hPath || block?.hpath || "",
        box: block?.box,
    };
}

export async function getLatestTasksBySearchApi(
    notebookIds: string[] = [],
    maxRows = 2000,
): Promise<ComponentTaskInfo[]> {
    const variants = ["- [ ]", "* [ ]", "- [x]", "* [x]", "- [X]", "* [X]"];
    const seen = new Set<string>();
    const tasks: ComponentTaskInfo[] = [];
    for (const query of variants) {
        const blocks = await searchBlocks(query, Math.min(maxRows, SEARCH_MAX_ROWS));
        for (const block of blocks) {
            if (notebookIds.length > 0 && !notebookIds.includes(block?.box)) continue;
            const task = blockToTaskInfo(block);
            if (!task || seen.has(task.id)) continue;
            seen.add(task.id);
            tasks.push(task);
            if (tasks.length >= maxRows) break;
        }
        if (tasks.length >= maxRows) break;
    }
    return tasks.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export async function getTaskIndexResult(
    notebookIds: string[] = [],
    policy?: ComponentGlobalSqlPolicy,
    plugin?: any,
): Promise<ComponentDataResult<ComponentTaskInfo>> {
    const effectivePolicy = policy ?? (plugin ? await getHomepageGlobalSqlPolicy(plugin) : undefined);
    const rows = await readJsonIndex<ComponentTaskInfo>(TASK_INDEX_PATH);
    const existing = await filterExistingItems(rows, TASK_INDEX_PATH);
    const filtered = notebookIds.length > 0
        ? existing.filter((item) => item.box && notebookIds.includes(item.box))
        : existing;
    if (filtered.length > 0) {
        return okResult(
            filtered.sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
            "index",
        );
    }
    if (notebookIds.length > 0) {
        const scoped = await getLatestTasksBySearchApi(notebookIds, GLOBAL_COMPAT_MAX_LIMIT);
        if (scoped.length > 0) {
            return okResult(scoped, "official_api", "范围模式：按配置的任务笔记本通过官方搜索 API 获取。");
        }
    }
    if (effectivePolicy?.allowGlobalSql && plugin) {
        const stmt = `
            SELECT id, root_id, box, path, hpath, content, markdown, created, updated
            FROM blocks
            WHERE subtype = 't'
            ORDER BY updated DESC
            LIMIT ${GLOBAL_COMPAT_MAX_LIMIT}
        `;
        const result = await runHomepageGlobalSqlCompatQuery<ComponentTaskInfo>(plugin, stmt);
        if (result.ok === false) {
            return disabledResult(result.reason, "disabled");
        }
        const tasks = result.rows
            .map(blockToTaskInfo)
            .filter((task): task is ComponentTaskInfo => task !== null);
        if (tasks.length > 0) {
            return okResult(tasks, "global_sql_compat", "兼容模式：使用全库 SQL 恢复任务列表；大库可能有性能压力。");
        }
        return disabledResult("兼容模式未返回任务。", "global_sql_compat");
    }
    return disabledResult("任务全库扫描已停用。请配置任务范围，或点击“建立任务索引”。", "index");
}

export async function updateTaskIndexItem(task: Partial<ComponentTaskInfo> & { id: string }): Promise<void> {
    const rows = await readJsonIndex<ComponentTaskInfo>(TASK_INDEX_PATH);
    const now = new Date().toISOString();
    const markdown = String(task.markdown || task.content || "");
    const firstLine = markdown.split("\n")[0] || markdown;
    const checked = typeof task.checked === "boolean"
        ? task.checked
        : /^[-*]\s\[[xX]\]/.test(firstLine.trim());
    const next: ComponentTaskInfo = {
        id: task.id,
        rootID: task.rootID || task.root_id || task.id,
        root_id: task.root_id || task.rootID || task.id,
        box: task.box || "",
        hpath: task.hpath || "",
        markdown,
        content: task.content || stripSearchMarks(firstLine),
        created: task.created || "",
        updated: task.updated || now,
        checked,
        source: task.source || "plugin",
    };
    const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
    map.set(next.id, { ...map.get(next.id), ...next });
    await writeJsonIndex(TASK_INDEX_PATH, Array.from(map.values()));
}

export async function removeTaskIndexItem(id: string): Promise<void> {
    if (!id) return;
    const rows = await readJsonIndex<ComponentTaskInfo>(TASK_INDEX_PATH);
    await writeJsonIndex(TASK_INDEX_PATH, rows.filter((row) => row?.id !== id));
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
        const raw = await getFile("/data/storage/recent-doc.json");
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const ids = Array.from(new Set(
            (Array.isArray(parsed) ? parsed : [])
                .map((item: any) => item?.rootID || item?.id)
                .filter(Boolean),
        )).slice(0, maxRows);
        const docs = ids.map((id) => ({ id, content: String(id) }));
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
            const updated = String(block?.updated || "");
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

export async function getRecentHeatmapCountsResult(
    startDate: string,
    endDate: string,
    countType: "block" | "word",
    policy?: ComponentGlobalSqlPolicy,
    plugin?: any,
): Promise<ComponentCountsResult> {
    const effectivePolicy = policy ?? (plugin ? await getHomepageGlobalSqlPolicy(plugin) : undefined);
    if (effectivePolicy?.allowGlobalSql && plugin) {
        const start = String(startDate || "").replace(/-/g, "");
        const end = String(endDate || "").replace(/-/g, "");
        if (start.length === 8 && end.length === 8) {
            const aggregate = countType === "word" ? "SUM(LENGTH(content))" : "COUNT(*)";
            const stmt = `
                SELECT substr(updated, 1, 8) AS day, ${aggregate} AS count
                FROM blocks
                WHERE updated >= '${start}000000' AND updated <= '${end}235959'
                GROUP BY day
                ORDER BY day
                LIMIT ${GLOBAL_COMPAT_MAX_LIMIT}
            `;
            const result = await runHomepageGlobalSqlCompatQuery<{ day: string; count: number }>(plugin, stmt);
            if (result.ok === false) {
                return {
                    counts: {},
                    status: "disabled",
                    mode: "disabled",
                    message: result.reason,
                };
            }
            const counts: Record<string, number> = {};
            for (const row of result.rows) {
                const day = String(row?.day || "");
                const formatted = day.length === 8
                    ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`
                    : "";
                if (formatted) {
                    counts[formatted] = Number(row?.count) || 0;
                }
            }
            const hasData = Object.values(counts).some((value) => Number(value) > 0);
            return {
                counts,
                status: hasData ? "ok" : "empty",
                mode: "global_sql_compat",
                message: hasData
                    ? "兼容模式：使用全库 SQL 聚合热力图数据；大库可能有性能压力。"
                    : "兼容模式未返回指定日期范围内的热力图数据。",
            };
        }
    }

    const counts = await getRecentHeatmapCounts(startDate, endDate, countType);
    const hasData = Object.values(counts).some((value) => Number(value) > 0);
    return {
        counts,
        status: hasData ? "limited" : "empty",
        mode: "recent_api",
        message: hasData
            ? "当前热力图为无全库 SQL 近似模式。"
            : "当前热力图为无全库 SQL 近似模式，最近更新 API 未返回可统计数据。",
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
    policy?: ComponentGlobalSqlPolicy,
    plugin?: any,
): Promise<ComponentDataResult<ComponentDocInfo>> {
    const rows = await readJsonIndex<ComponentDocInfo>(FAVORITES_INDEX_PATH);
    const existing = await filterExistingItems(rows, FAVORITES_INDEX_PATH);
    const filtered = notebookIds.length > 0
        ? existing.filter((item) => item.box && notebookIds.includes(item.box))
        : existing;
    if (filtered.length > 0) {
        return okResult(filtered.sort((a, b) => String(b.updated).localeCompare(String(a.updated))), "index");
    }
    if (policy?.allowGlobalSql && plugin) {
        const stmt = `
            SELECT id, content, created, updated, box, path, hpath, ial
            FROM blocks
            WHERE type = 'd' AND ial LIKE '%custom-homepage-favorites%'
            ORDER BY updated DESC
            LIMIT ${GLOBAL_COMPAT_MAX_LIMIT}
        `;
        const result = await runHomepageGlobalSqlCompatQuery<ComponentDocInfo>(plugin, stmt);
        if (result.ok === false) {
            return disabledResult(result.reason, "disabled");
        }
        const docs = result.rows
            .map((block) => blockToDocInfo(block))
            .filter((doc): doc is ComponentDocInfo => doc !== null);
        if (docs.length > 0) {
            return okResult(docs, "global_sql_compat", "兼容模式：使用全库 SQL 恢复收藏列表；大库可能有性能压力。");
        }
        return disabledResult("兼容模式未返回收藏。", "global_sql_compat");
    }
    return disabledResult("旧版收藏依赖全库属性扫描，已停用。请从文档树右键重新收藏，或执行一次手动迁移。", "index");
}

export async function updateFavoriteIndex(docId: string, active: boolean): Promise<void> {
    const rows = await readJsonIndex<ComponentDocInfo>(FAVORITES_INDEX_PATH);
    const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
    if (!active) {
        map.delete(docId);
        await writeJsonIndex(FAVORITES_INDEX_PATH, Array.from(map.values()));
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
    policy?: ComponentGlobalSqlPolicy,
    plugin?: any,
): Promise<ComponentDataResult<T>> {
    const rows = await readJsonIndex<T & { id?: string }>(REVIEW_INDEX_PATH);
    const existing = await filterExistingItems(rows, REVIEW_INDEX_PATH);
    if (existing.length > 0) {
        return okResult(existing as T[], "index");
    }
    if (policy?.allowGlobalSql && plugin) {
        const stmt = `
            SELECT id, content, created, updated, box, path, hpath, ial, type, parent_id, root_id
            FROM blocks
            WHERE ial LIKE '%custom-homepage-review-next-date%'
            ORDER BY updated DESC
            LIMIT ${GLOBAL_COMPAT_MAX_LIMIT}
        `;
        const result = await runHomepageGlobalSqlCompatQuery<T & { id?: string; ial?: string }>(plugin, stmt);
        if (result.ok === false) {
            return disabledResult(result.reason, "disabled");
        }
        const items = result.rows;
        if (items.length > 0) {
            return okResult(items as T[], "global_sql_compat", "兼容模式：使用全库 SQL 恢复复习列表；大库可能有性能压力。");
        }
        return disabledResult("兼容模式未返回复习计划。", "global_sql_compat");
    }
    return disabledResult("复习文档全库扫描已停用；新加入复习的文档会进入索引。", "index");
}

export async function updateReviewIndexItem<T extends { id: string }>(item: T): Promise<void> {
    const rows = await readJsonIndex<T>(REVIEW_INDEX_PATH);
    const map = new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]));
    map.set(item.id, item);
    await writeJsonIndex(REVIEW_INDEX_PATH, Array.from(map.values()));
}

export async function removeReviewIndexItem(id: string): Promise<void> {
    const rows = await readJsonIndex<{ id: string }>(REVIEW_INDEX_PATH);
    await writeJsonIndex(REVIEW_INDEX_PATH, rows.filter((row) => row?.id !== id));
}
