import { getFileOrNullChecked, readDirChecked } from "@/api";
import {
    destroySharedWidgetDataEvents,
    dispatchSharedWidgetDataUpdated,
} from "./sharedWidgetDataEvents";
import type { SharedWidgetStore } from "./sharedWidgetStoragePaths";

// 锁顺序固定为：迁移总锁 → store 事务锁 → 单文件路径锁；正常写入从 store 事务锁开始。
export const SHARED_WIDGET_MIGRATION_LOCK = "siyuan-homepage/transaction/shared-widget-migration";
export const FOCUS_STORE_TRANSACTION_LOCK = "siyuan-homepage/transaction/focus";
export const CYBMOK_STORE_TRANSACTION_LOCK = "siyuan-homepage/transaction/cybmok";
export const COUNTDOWN_STORE_TRANSACTION_LOCK = "siyuan-homepage/transaction/countdown";
export const FIXED_ASSETS_STORE_TRANSACTION_LOCK = "siyuan-homepage/transaction/fixed-assets";
export const REVIEW_DOCS_STORE_TRANSACTION_LOCK = "siyuan-homepage/transaction/review-docs";

export interface SharedRevisionedFile {
    schema: string;
    version: number;
    revision: number;
    updatedAt: string;
}

export interface SharedWidgetMigrationMetadata {
    version: 1;
    dataValidated: true;
    importedAt: string;
    status: "complete" | "cleanup-pending" | "failed";
    sourceRecordCount: number;
    importedRecordCount: number;
    legacyDatabaseIds: string[];
    legacyRootFiles: string[];
    cleanupStatus: "complete" | "pending";
    cleanupError?: string;
    pendingDatabaseRows?: Array<{
        databaseId: string;
        rowIds: string[];
        srcIds?: string[];
    }>;
}

export type SharedJsonNormalizer<T extends SharedRevisionedFile> = (raw: unknown) => T;
export type SharedJsonValidator<T extends SharedRevisionedFile> = (actual: T, expected: T) => void;

interface MutationOptions<T extends SharedRevisionedFile> {
    store: SharedWidgetStore;
    path: string;
    createEmpty: () => T;
    normalize: SharedJsonNormalizer<T>;
    mutate: (current: T) => T | void | Promise<T | void>;
    validate?: SharedJsonValidator<T>;
    dispatch?: boolean;
}

let pluginInstance: any = null;
const writeQueues = new Map<string, Promise<unknown>>();
const pendingWrites = new Set<Promise<unknown>>();
const externalFlushers = new Set<() => Promise<void>>();
const externalCleanups = new Set<() => void>();

export function setSharedWidgetStoragePlugin(plugin: any): void {
    pluginInstance = plugin;
}

export function getSharedWidgetStoragePlugin(): any {
    if (!pluginInstance) throw new Error("组件本地存储尚未初始化");
    return pluginInstance;
}

function parseStoredJson(raw: unknown, path: string): unknown {
    if (typeof raw !== "string") return raw;
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`[sharedLocalStorage] 无法解析 ${path}`, error);
        throw new Error(`本地数据文件异常，请备份插件数据后处理：${path}`);
    }
}

function splitStoragePath(path: string): string[] {
    const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
        throw new Error(`无效的本地数据路径：${path}`);
    }
    return segments;
}

export async function readSharedWidgetDirectoryChecked(relativeDirectory: string): Promise<IResReadDir[]> {
    const plugin = getSharedWidgetStoragePlugin();
    const pluginName = typeof plugin?.name === "string" && plugin.name.trim()
        ? plugin.name.trim()
        : "siyuan-homepage";
    const segments = [pluginName, ...splitStoragePath(relativeDirectory)];
    let parentPath = "/data/storage/petal";

    for (const segment of segments) {
        const entries = await readDirChecked(parentPath);
        if (!Array.isArray(entries)) {
            throw new Error(`本地数据目录读取结果异常，请检查插件数据后重试：${parentPath}`);
        }
        const entry = entries.find((item) => item.name === segment);
        if (!entry) return [];
        if (entry.isDir !== true) {
            throw new Error(`本地数据目录结构异常，请备份插件数据后处理：${relativeDirectory}`);
        }
        parentPath = `${parentPath}/${segment}`;
    }

    const entries = await readDirChecked(parentPath);
    if (!Array.isArray(entries)) {
        throw new Error(`本地数据目录读取结果异常，请检查插件数据后重试：${relativeDirectory}`);
    }
    return entries;
}

export function assertSharedWidgetYearFilesComplete(indexedYears: number[], actualYears: number[]): void {
    const actual = new Set(actualYears);
    const missingYears = indexedYears.filter((year) => !actual.has(year));
    if (missingYears.length > 0) {
        throw new Error(`年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${missingYears.join("、")}`);
    }
}

function sharedDataFilePath(path: string): string {
    const plugin = getSharedWidgetStoragePlugin();
    const pluginName = typeof plugin?.name === "string" && plugin.name.trim()
        ? plugin.name.trim()
        : "siyuan-homepage";
    return `/data/storage/petal/${[pluginName, ...splitStoragePath(path)].join("/")}`;
}

async function loadRaw(path: string): Promise<unknown> {
    let raw = await getSharedWidgetStoragePlugin().loadData(path);
    if (typeof raw === "string" && raw.trim() === "") {
        const direct = await getFileOrNullChecked(sharedDataFilePath(path));
        if (direct === null) return null;
        raw = direct;
    }
    return parseStoredJson(raw, path);
}

export async function loadSharedRawJson(path: string): Promise<unknown> {
    return loadRaw(path);
}

export async function loadSharedJson<T extends SharedRevisionedFile>(
    path: string,
    normalize: SharedJsonNormalizer<T>,
): Promise<T | null> {
    const raw = await loadRaw(path);
    if (raw == null) return null;
    try {
        return normalize(raw);
    } catch (error) {
        console.warn(`[sharedLocalStorage] 无法规范化 ${path}`, error);
        throw new Error(`本地数据文件异常，请备份插件数据后处理：${path}`);
    }
}

export async function saveSharedJsonChecked<T extends SharedRevisionedFile>(
    store: SharedWidgetStore,
    path: string,
    value: T,
    normalize: SharedJsonNormalizer<T>,
    validate?: SharedJsonValidator<T>,
    dispatch = true,
): Promise<T> {
    await getSharedWidgetStoragePlugin().saveData(path, value);
    const saved = await loadSharedJson(path, normalize);
    if (!saved) throw new Error(`写入后无法重新读取本地数据：${path}`);
    if (saved.schema !== value.schema || saved.version !== value.version || saved.revision !== value.revision) {
        throw new Error(`本地数据写入校验失败：${path}`);
    }
    validate?.(saved, value);
    if (dispatch) {
        dispatchSharedWidgetDataUpdated({
            store,
            path,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
        });
    }
    return saved;
}

async function withNavigatorLock<T>(path: string, task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? (navigator as any).locks : null;
    if (!locks?.request) return task();
    return locks.request(`siyuan-homepage:shared-store:${path}`, { mode: "exclusive" }, task);
}

function enqueuePathWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
    const previous = writeQueues.get(path) || Promise.resolve();
    const current = previous.catch(() => undefined).then(() => withNavigatorLock(path, task));
    writeQueues.set(path, current);
    pendingWrites.add(current);
    const cleanup = () => {
        pendingWrites.delete(current);
        if (writeQueues.get(path) === current) writeQueues.delete(path);
    };
    void current.then(cleanup, cleanup);
    return current;
}

export function runSharedWidgetExclusive<T>(lockPath: string, task: () => Promise<T>): Promise<T> {
    return enqueuePathWrite(lockPath, task);
}

export function mutateSharedJson<T extends SharedRevisionedFile>(options: MutationOptions<T>): Promise<T> {
    return enqueuePathWrite(options.path, async () => {
        const loaded = await loadSharedJson(options.path, options.normalize);
        const current = loaded || options.createEmpty();
        const draft = structuredClone(current);
        const result = await options.mutate(draft);
        const next = result || draft;
        next.revision = Math.max(0, Number(current.revision) || 0) + 1;
        next.updatedAt = new Date().toISOString();
        return saveSharedJsonChecked(
            options.store,
            options.path,
            next,
            options.normalize,
            options.validate,
            options.dispatch !== false,
        );
    });
}

export async function removeSharedLegacyDataChecked(path: string): Promise<void> {
    const plugin = getSharedWidgetStoragePlugin();
    await plugin.removeData(path);
    const remaining = await loadRaw(path);
    if (remaining != null) throw new Error(`旧本地文件删除校验失败：${path}`);
}

export function registerSharedWidgetFlusher(flusher: () => Promise<void>): () => void {
    externalFlushers.add(flusher);
    return () => externalFlushers.delete(flusher);
}

export function registerSharedWidgetCleanup(cleanup: () => void): () => void {
    externalCleanups.add(cleanup);
    return () => externalCleanups.delete(cleanup);
}

export async function flushPendingSharedWidgetWrites(): Promise<void> {
    const errors: unknown[] = [];
    const flusherResults = await Promise.allSettled(
        Array.from(externalFlushers, (flush) => Promise.resolve().then(flush)),
    );
    for (const result of flusherResults) {
        if (result.status === "rejected") errors.push(result.reason);
    }
    while (pendingWrites.size > 0) {
        const writeResults = await Promise.allSettled(Array.from(pendingWrites));
        for (const result of writeResults) {
            if (result.status === "rejected") errors.push(result.reason);
        }
    }
    if (errors.length > 0) {
        const messages = errors.map((error) => error instanceof Error ? error.message : String(error));
        throw new Error(`组件本地数据 flush 失败（${errors.length} 项）：${messages.join("；")}`);
    }
}

export function destroySharedWidgetStorage(): void {
    for (const cleanup of externalCleanups) cleanup();
    destroySharedWidgetDataEvents();
    writeQueues.clear();
    pendingWrites.clear();
    externalFlushers.clear();
    externalCleanups.clear();
    pluginInstance = null;
}
