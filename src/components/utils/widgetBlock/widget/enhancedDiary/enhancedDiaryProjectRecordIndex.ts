import { getFile, putFileChecked } from "@/api";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
import type { EnhancedDiaryConfig } from "./enhancedDiaryTypes";
import { ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH } from "./enhancedDiaryProjectTypes";
import { getEnhancedDiaryIndexEntries } from "./enhancedDiaryIndex";
import { queryTodayQuickRecordsDetailed, type EnhancedDiaryWorkspaceRecord } from "./workspace/enhancedDiaryWorkspaceRecordService";
import { readDiaryMarkdown } from "./enhancedDiaryDoc";
import { prepareChangedRecentDocsForIndex } from "@/components/tools/siyuanComponentDataApi";

const INDEX_DIR = "/data/storage/petal/siyuan-homepage";
const INDEX_VERSION = 1;

export interface EnhancedDiaryProjectRecordIndexItem {
    id: string;
    headingBlockId: string;
    diaryDocId: string;
    date: string;
    category: string;
    tags: string[];
    projectTargetId: string;
    hiddenProjectTargetId?: string;
    rootProjectId?: string;
    projectPath?: string[];
    isKeyRecord: boolean;
    preview: string;
    updatedAt: string;
    visibleProjectTargetId?: string;
    relationStatus: string;
}

export interface EnhancedDiaryProjectRecordIndexPayload {
    version: number;
    updatedAt: string;
    notebookId: string;
    complete: boolean;
    items: Record<string, EnhancedDiaryProjectRecordIndexItem>;
}

const caches = new Map<string, EnhancedDiaryProjectRecordIndexPayload>();
const maintenanceTails = new Map<string, Promise<void>>();
const operationFlights = new Map<string, Promise<ComponentMigrationStatus>>();

function empty(notebookId: string): EnhancedDiaryProjectRecordIndexPayload {
    return { version: INDEX_VERSION, updatedAt: new Date().toISOString(), notebookId, complete: false, items: {} };
}

async function decode(raw: any): Promise<any> {
    if (!raw) return undefined;
    if (typeof raw === "object" && typeof raw.code === "number") return raw.code === 0 ? decode(raw.data) : undefined;
    if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return undefined; } }
    if (raw instanceof Blob) return decode(await raw.text());
    if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) return decode(new TextDecoder().decode(raw instanceof ArrayBuffer ? raw : raw.buffer));
    return raw;
}

function valid(value: any): value is EnhancedDiaryProjectRecordIndexPayload {
    return !!value && value.version === INDEX_VERSION && typeof value.updatedAt === "string" && typeof value.notebookId === "string" &&
        typeof value.complete === "boolean" && value.items && typeof value.items === "object" && !Array.isArray(value.items);
}

function hasIndexFileResponse(raw: any): boolean {
    if (raw == null) return false;
    if (typeof raw === "object" && typeof raw.code === "number") {
        return raw.code === 0 && raw.data != null;
    }
    return true;
}

export async function readEnhancedDiaryProjectRecordIndex(notebookId: string): Promise<EnhancedDiaryProjectRecordIndexPayload> {
    const cached = caches.get(notebookId);
    if (cached) return cached;
    const parsed = await decode(await getFile(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH));
    const index = valid(parsed) && parsed.notebookId === notebookId ? parsed : empty(notebookId);
    caches.set(notebookId, index);
    return index;
}

export async function getEnhancedDiaryProjectRecordIndexStatus(notebookId: string): Promise<ComponentMigrationStatus> {
    if (!notebookId) return { lastStatus: "idle", lastMessage: "尚未配置日记笔记本。" };
    try {
        const raw = await getFile(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH);
        if (!hasIndexFileResponse(raw)) return { lastStatus: "idle", lastMessage: "项目记录索引尚未建立。" };
        const parsed = await decode(raw);
        if (!valid(parsed)) return { lastStatus: "error", lastMessage: "项目记录索引文件损坏或版本无效，请重建。" };
        if (parsed.notebookId !== notebookId) {
            return { lastRunAt: parsed.updatedAt, lastStatus: "idle", lastMessage: "日记笔记本配置已变化，需要重建项目记录索引。" };
        }
        const migratedCount = Object.keys(parsed.items).length;
        if (!parsed.complete) {
            return { lastRunAt: parsed.updatedAt, lastStatus: "idle", lastMessage: "项目记录索引尚未完整，请重建。", migratedCount };
        }
        return { lastRunAt: parsed.updatedAt, lastStatus: "success", lastMessage: `项目记录索引完整，共 ${migratedCount} 条记录。`, migratedCount };
    } catch (error) {
        return { lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目记录索引状态读取失败。" };
    }
}

async function writeDirect(payload: EnhancedDiaryProjectRecordIndexPayload): Promise<void> {
    const next = { ...payload, version: INDEX_VERSION, updatedAt: new Date().toISOString() };
    try { await putFileChecked(INDEX_DIR, true, new Blob(["{}"])); } catch { /* 已存在 */ }
    await putFileChecked(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH, false,
        new Blob([JSON.stringify(next, null, 2)], { type: "application/json;charset=utf-8" }));
    caches.set(payload.notebookId, next);
}

function enqueue<T>(notebookId: string, work: () => Promise<T>): Promise<T> {
    const previous = maintenanceTails.get(notebookId) || Promise.resolve();
    const promise = previous.catch(() => undefined).then(work);
    maintenanceTails.set(notebookId, promise.then(() => undefined, () => undefined));
    return promise;
}

async function update(
    notebookId: string,
    mutate: (current: EnhancedDiaryProjectRecordIndexPayload) => EnhancedDiaryProjectRecordIndexPayload,
): Promise<void> {
    await enqueue(notebookId, async () => {
        const current = await readEnhancedDiaryProjectRecordIndex(notebookId);
        await writeDirect(mutate(current));
    });
}

function queueMaintenance(
    notebookId: string,
    operation: string,
    work: () => Promise<ComponentMigrationStatus>,
): Promise<ComponentMigrationStatus> {
    const key = `${notebookId}:${operation}`;
    const running = operationFlights.get(key);
    if (running) return running;
    const promise = enqueue(notebookId, work);
    operationFlights.set(key, promise);
    const cleanup = () => {
        if (operationFlights.get(key) === promise) operationFlights.delete(key);
    };
    void promise.then(cleanup, cleanup);
    return promise;
}

function isLegacyDiaryWithoutQuickRecords(detailed: {
    structureComplete: boolean;
    records: EnhancedDiaryWorkspaceRecord[];
    reason?: string;
}): boolean {
    return !detailed.structureComplete && detailed.reason === "quick_record_heading_unavailable" && detailed.records.length === 0;
}

export function projectRecordToIndexItem(record: EnhancedDiaryWorkspaceRecord): EnhancedDiaryProjectRecordIndexItem | null {
    if (!record.headingBlockId || !record.projectTargetId) return null;
    return {
        id: record.headingBlockId, headingBlockId: record.headingBlockId, diaryDocId: record.docId,
        date: record.date || "", category: record.categoryTitle, tags: [...record.tags],
        projectTargetId: record.projectTargetId, rootProjectId: record.rootProjectId,
        hiddenProjectTargetId: record.hiddenProjectTargetId,
        projectPath: record.projectPath ? [...record.projectPath] : undefined,
        isKeyRecord: record.isKeyRecord, preview: record.content.replace(/\s+/g, " ").trim().slice(0, 240),
        updatedAt: new Date().toISOString(), visibleProjectTargetId: record.visibleProjectTargetId,
        relationStatus: record.projectRelationStatus,
    };
}

export async function replaceProjectRecordIndexForDiary(
    notebookId: string, diaryDocId: string, records: EnhancedDiaryWorkspaceRecord[], complete?: boolean,
): Promise<void> {
    await update(notebookId, (current) => {
        const items = Object.fromEntries(Object.entries(current.items).filter(([, item]) => item.diaryDocId !== diaryDocId));
        records.forEach((record) => { const item = projectRecordToIndexItem(record); if (item) items[item.id] = item; });
        return { ...current, complete: complete ?? current.complete, items };
    });
}

export async function removeProjectRecordIndexItem(notebookId: string, headingBlockId: string): Promise<void> {
    await update(notebookId, (current) => {
        const items = { ...current.items }; delete items[headingBlockId];
        return { ...current, items };
    });
}

export async function upsertProjectRecordIndexItem(notebookId: string, record: EnhancedDiaryWorkspaceRecord): Promise<void> {
    const item = projectRecordToIndexItem(record);
    if (!item) return removeProjectRecordIndexItem(notebookId, record.headingBlockId || "");
    await update(notebookId, (current) => ({ ...current, items: { ...current.items, [item.id]: item } }));
}

async function rebuild(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    if (!config.dailyNotebookId) return { lastRunAt: now, lastStatus: "error", lastMessage: "尚未配置日记笔记本。" };
    try {
        const diaryEntries = await getEnhancedDiaryIndexEntries(config.dailyNotebookId);
        const current = await readEnhancedDiaryProjectRecordIndex(config.dailyNotebookId);
        const activeDiaryDocIds = new Set(Object.values(diaryEntries).map((entry) => entry.id));
        let items: Record<string, EnhancedDiaryProjectRecordIndexItem> = Object.fromEntries(
            Object.entries(current.items).filter(([, item]) => activeDiaryDocIds.has(item.diaryDocId)),
        );
        let skippedCount = 0;
        let legacyEmptyCount = 0;
        for (const [compactDate, entry] of Object.entries(diaryEntries)) {
            try {
                const markdown = await readDiaryMarkdown(entry.id);
                const date = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
                const detailed = await queryTodayQuickRecordsDetailed(entry.id, markdown, date, config.headingStructure, config.templateFieldMapping, config);
                if (isLegacyDiaryWithoutQuickRecords(detailed)) {
                    items = Object.fromEntries(Object.entries(items).filter(([, item]) => item.diaryDocId !== entry.id));
                    legacyEmptyCount += 1;
                    continue;
                }
                if (!detailed.structureComplete) { skippedCount += 1; continue; }
                items = Object.fromEntries(Object.entries(items).filter(([, item]) => item.diaryDocId !== entry.id));
                detailed.records.forEach((record) => { const item = projectRecordToIndexItem(record); if (item) items[item.id] = item; });
            } catch { skippedCount += 1; }
        }
        await writeDirect({ version: INDEX_VERSION, updatedAt: now, notebookId: config.dailyNotebookId, complete: skippedCount === 0, items });
        const legacyMessage = legacyEmptyCount > 0 ? `兼容处理 ${legacyEmptyCount} 篇无快速记录内容的旧日记。` : "";
        return { lastRunAt: now, lastStatus: "success", lastMessage: `项目记录索引重建完成：${Object.keys(items).length} 条关系，${skippedCount} 篇日记暂未完成结构解析。${legacyMessage}`, migratedCount: Object.keys(items).length, skippedCount };
    } catch (error) {
        return { lastRunAt: now, lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目记录索引重建失败" };
    }
}

export async function rebuildEnhancedDiaryProjectRecordIndex(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    if (!config.dailyNotebookId) return rebuild(config);
    return queueMaintenance(config.dailyNotebookId, "rebuild", () => rebuild(config));
}

async function refresh(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    if (!config.dailyNotebookId) return { lastRunAt: now, lastStatus: "idle", lastMessage: "未配置日记笔记本。" };
    try {
        const current = await readEnhancedDiaryProjectRecordIndex(config.dailyNotebookId);
        const diaryEntries = await getEnhancedDiaryIndexEntries(config.dailyNotebookId);
        const byDocId = new Map(Object.entries(diaryEntries).map(([date, entry]) => [entry.id, { date, entry }]));
        const prepared = await prepareChangedRecentDocsForIndex("enhanced-diary-project-record");
        const changed = prepared.changedDocs.filter((doc) => byDocId.has(doc.id));
        let items = { ...current.items };
        let skippedCount = 0;
        let legacyEmptyCount = 0;
        for (const doc of changed) {
            const metadata = byDocId.get(doc.id)!;
            const compactDate = metadata.date;
            const date = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
            const markdown = await readDiaryMarkdown(doc.id);
            const detailed = await queryTodayQuickRecordsDetailed(doc.id, markdown, date, config.headingStructure, config.templateFieldMapping, config);
            if (isLegacyDiaryWithoutQuickRecords(detailed)) {
                items = Object.fromEntries(Object.entries(items).filter(([, item]) => item.diaryDocId !== doc.id));
                legacyEmptyCount += 1;
                continue;
            }
            if (!detailed.structureComplete) { skippedCount += 1; continue; }
            items = Object.fromEntries(Object.entries(items).filter(([, item]) => item.diaryDocId !== doc.id));
            detailed.records.forEach((record) => { const item = projectRecordToIndexItem(record); if (item) items[item.id] = item; });
        }
        await writeDirect({ ...current, complete: current.complete && skippedCount === 0, items });
        await prepared.commit();
        const legacyMessage = legacyEmptyCount > 0 ? `兼容处理 ${legacyEmptyCount} 篇无快速记录内容的旧日记。` : "";
        return { lastRunAt: now, lastStatus: "success", lastMessage: `项目记录索引增量刷新完成：${changed.length - skippedCount} 篇完成，${skippedCount} 篇暂未完成结构解析。${legacyMessage}`, refreshedCount: changed.length - skippedCount, skippedCount };
    } catch (error) {
        return { lastRunAt: now, lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目记录索引增量刷新失败" };
    }
}

export async function refreshEnhancedDiaryProjectRecordIndex(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    if (!config.dailyNotebookId) return refresh(config);
    return queueMaintenance(config.dailyNotebookId, "refresh", () => refresh(config));
}
