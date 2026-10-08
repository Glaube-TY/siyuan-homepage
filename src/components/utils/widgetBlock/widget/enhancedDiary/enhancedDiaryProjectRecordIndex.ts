import { getFileChecked, getFileOrNullChecked, putFileChecked } from "@/api";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
import type { EnhancedDiaryConfig } from "./enhancedDiaryTypes";
import { ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH } from "./enhancedDiaryProjectTypes";
import { getEnhancedDiaryIndexEntriesStrict } from "./enhancedDiaryIndex";
import { queryTodayQuickRecordsDetailed, type EnhancedDiaryWorkspaceRecord } from "./workspace/enhancedDiaryWorkspaceRecordService";
import { readDiaryMarkdownResult } from "./enhancedDiaryDoc";
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
    failures?: EnhancedDiaryProjectRecordIndexFailure[];
}

export interface EnhancedDiaryProjectRecordIndexFailure {
    docId: string;
    date: string;
    stage: string;
    reason: string;
    missingPath?: string[];
}

const INCOMPLETE_SOURCE = "enhanced-diary-project-record-incomplete";
const READ_ERROR_SOURCE = "enhanced-diary-project-record-read-error";
const WRITE_ERROR_SOURCE = "enhanced-diary-project-record-write-error";
const FAILURE_LABELS: Record<string, string> = {
    markdown_read_failed: "Markdown 读取失败",
    block_structure_read_failed: "日记块结构读取失败",
    quick_record_structure_unsupported: "快速记录存在无法可靠定位的内容",
    diary_root_missing: "日记根标题缺失",
    quick_record_heading_missing: "快速记录标题缺失",
    heading_mapping_mismatch: "标题结构与配置映射不一致",
    block_attributes_read_failed: "批量块属性读取失败",
    project_relation_read_failed: "项目索引或关系解析失败",
    index_item_build_failed: "记录索引条目解析失败",
    unexpected_error: "其他异常",
};

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
        typeof value.complete === "boolean" && value.items && typeof value.items === "object" && !Array.isArray(value.items) &&
        Object.entries(value.items).every(([id, item]: [string, any]) => item && item.id === id && item.headingBlockId === id &&
            typeof item.diaryDocId === "string" && typeof item.projectTargetId === "string" && Array.isArray(item.tags)) &&
        (value.failures === undefined || (Array.isArray(value.failures) && value.failures.every((failure: any) => failure &&
            typeof failure.docId === "string" && /^[0-9]{14}-[a-z0-9]{7}$/.test(failure.docId) && typeof failure.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(failure.date) && typeof failure.stage === "string" && typeof failure.reason === "string" &&
            (failure.missingPath === undefined || (Array.isArray(failure.missingPath) && failure.missingPath.every((part: any) => typeof part === "string"))))));
}

export async function readEnhancedDiaryProjectRecordIndex(notebookId: string, options: { fresh?: boolean } = {}): Promise<EnhancedDiaryProjectRecordIndexPayload> {
    const cached = caches.get(notebookId);
    if (cached && !options.fresh) return cached;
    const raw = await getFileOrNullChecked(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH);
    const parsed = raw === null ? undefined : await decode(raw);
    if (raw !== null && !valid(parsed)) throw new Error("项目记录索引文件损坏或版本无效，已停止写入并保留原文件。");
    if (parsed && parsed.notebookId !== notebookId) throw new Error("项目记录索引与当前日记笔记本不一致，已停止写入并保留原文件。");
    const index = parsed || empty(notebookId);
    caches.set(notebookId, index);
    return index;
}

export async function readEnhancedDiaryProjectRecordIndexStrict(notebookId: string): Promise<EnhancedDiaryProjectRecordIndexPayload> {
    const raw = await getFileChecked(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH);
    const parsed = await decode(raw);
    if (!valid(parsed)) throw new Error("项目记录索引文件损坏或版本无效，通知扫描已停止。");
    if (parsed.notebookId !== notebookId) throw new Error("项目记录索引与当前日记笔记本不一致，通知扫描已停止。");
    if (!parsed.complete) throw new Error("项目记录索引尚未完整，通知扫描已停止。");
    caches.set(notebookId, parsed);
    return parsed;
}

export async function getEnhancedDiaryProjectRecordIndexStatus(notebookId: string): Promise<ComponentMigrationStatus> {
    if (!notebookId) return { lastStatus: "idle", lastMessage: "尚未配置日记笔记本。" };
    try {
        const raw = await getFileOrNullChecked(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH);
        if (raw === null) return { lastStatus: "idle", lastMessage: "项目记录索引尚未建立。" };
        const parsed = await decode(raw);
        if (!valid(parsed)) return { source: READ_ERROR_SOURCE, lastStatus: "error", lastMessage: "项目记录索引读取失败：文件损坏或版本无效。" };
        if (parsed.notebookId !== notebookId) {
            return { source: READ_ERROR_SOURCE, lastRunAt: parsed.updatedAt, lastStatus: "error", lastMessage: "日记笔记本配置与已有项目记录索引不一致，已保留原索引。" };
        }
        return statusFromIndex(parsed);
    } catch (error) {
        return { source: READ_ERROR_SOURCE, lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目记录索引状态读取失败。" };
    }
}

function statusFromIndex(index: EnhancedDiaryProjectRecordIndexPayload): ComponentMigrationStatus {
    const migratedCount = Object.keys(index.items).length;
    const failures = index.failures || [];
    const counts = new Map<string, number>();
    failures.forEach(({ reason }) => { const label = FAILURE_LABELS[reason] || FAILURE_LABELS.unexpected_error; counts.set(label, (counts.get(label) || 0) + 1); });
    const summary = Array.from(counts, ([label, count]) => `${label} ${count} 篇`).join("；");
    return {
        source: index.complete ? undefined : INCOMPLETE_SOURCE,
        lastRunAt: index.updatedAt,
        lastStatus: index.complete ? "success" : "error",
        migratedCount,
        skippedCount: failures.length,
        lastMessage: index.complete ? `项目记录索引完整，共 ${migratedCount} 条关系。`
            : `项目记录索引重建未完整：已保留 ${migratedCount} 条关系（含未解析日记的历史关系）。${failures.length ? `${failures.length} 篇待解析：${summary}。可复制诊断摘要反馈，摘要不含日记正文或项目内容。` : "请重建以获取逐篇失败诊断。"}`,
    };
}

export function formatEnhancedDiaryProjectRecordDiagnostics(index: EnhancedDiaryProjectRecordIndexPayload): string {
    return JSON.stringify({ complete: index.complete, failures: (index.failures || []).map(({ docId, date, stage, reason, missingPath }) => ({
        docId, date,
        stage: ["markdown", "headings", "structure", "attributes", "project_relations", "index_items"].includes(stage) ? stage : "unknown",
        reason: Object.prototype.hasOwnProperty.call(FAILURE_LABELS, reason) ? reason : "unexpected_error",
        ...(missingPath ? { missingPath: missingPath.filter((part) => ["rootHeadings.day", "dayWorkspaceSections.quickRecords"].includes(part)) } : {}),
    })) }, null, 2);
}

async function writeDirect(payload: EnhancedDiaryProjectRecordIndexPayload): Promise<void> {
    const next = { ...payload, version: INDEX_VERSION, updatedAt: new Date().toISOString() };
    try { await putFileChecked(INDEX_DIR, true, new Blob(["{}"])); } catch { /* 已存在 */ }
    await putFileChecked(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH, false,
        new Blob([JSON.stringify(next, null, 2)], { type: "application/json;charset=utf-8" }));
    const verified = await decode(await getFileChecked(ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH));
    if (!valid(verified) || JSON.stringify(verified) !== JSON.stringify(next)) throw new Error("项目记录索引写后回读校验失败，请检查存储状态。");
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
        const current = await readEnhancedDiaryProjectRecordIndex(notebookId, { fresh: true });
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
        return { ...current, complete: complete ?? current.complete, items, failures: current.failures?.filter((failure) => failure.docId !== diaryDocId) };
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

async function readDiaryItemsForIndex(docId: string, date: string, config: EnhancedDiaryConfig): Promise<{
    items: EnhancedDiaryProjectRecordIndexItem[]; failure?: undefined;
} | { items?: undefined; failure: EnhancedDiaryProjectRecordIndexFailure }> {
    let stage = "markdown";
    const fail = (reason: string, missingPath?: string[]) => {
        const failure = { docId, date, stage, reason, ...(missingPath ? { missingPath } : {}) };
        console.warn("[enhancedDiaryProjectRecordIndex] diary skipped", failure);
        return { failure };
    };
    try {
        const markdown = await readDiaryMarkdownResult(docId);
        if (!markdown.ok) return fail("markdown_read_failed");
        stage = "structure";
        const detailed = await queryTodayQuickRecordsDetailed(docId, markdown.content, date, config.headingStructure, config.templateFieldMapping, config);
        if (!detailed.structureComplete || !detailed.relationComplete) {
            stage = detailed.stage || "structure";
            return fail(detailed.reason || "unexpected_error", detailed.missingPath);
        }
        stage = "index_items";
        return { items: detailed.records.map(projectRecordToIndexItem).filter((item): item is EnhancedDiaryProjectRecordIndexItem => !!item) };
    } catch {
        return fail(stage === "markdown" ? "markdown_read_failed" : stage === "index_items" ? "index_item_build_failed" : "unexpected_error");
    }
}

async function rebuild(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    if (!config.dailyNotebookId) return { lastRunAt: now, lastStatus: "error", lastMessage: "尚未配置日记笔记本。" };
    let writing = false;
    try {
        const diaryEntries = await getEnhancedDiaryIndexEntriesStrict(config.dailyNotebookId);
        const current = await readEnhancedDiaryProjectRecordIndex(config.dailyNotebookId, { fresh: true });
        const activeDiaryDocIds = new Set(Object.values(diaryEntries).map((entry) => entry.id));
        let items: Record<string, EnhancedDiaryProjectRecordIndexItem> = Object.fromEntries(
            Object.entries(current.items).filter(([, item]) => activeDiaryDocIds.has(item.diaryDocId)),
        );
        const failures: EnhancedDiaryProjectRecordIndexFailure[] = [];
        for (const [compactDate, entry] of Object.entries(diaryEntries)) {
            const date = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
            const parsed = await readDiaryItemsForIndex(entry.id, date, config);
            if (parsed.failure) { failures.push(parsed.failure); continue; }
            items = Object.fromEntries(Object.entries(items).filter(([, item]) => item.diaryDocId !== entry.id));
            parsed.items.forEach((item) => { items[item.id] = item; });
        }
        const next = { version: INDEX_VERSION, updatedAt: now, notebookId: config.dailyNotebookId, complete: failures.length === 0, items, failures };
        writing = true;
        await writeDirect(next);
        return { ...statusFromIndex(next), changed: true };
    } catch (error) {
        return { source: writing ? WRITE_ERROR_SOURCE : READ_ERROR_SOURCE, lastRunAt: now, lastStatus: "error",
            lastMessage: `项目记录索引${writing ? "写入" : "读取"}失败：${error instanceof Error ? error.message : "未知错误"}` };
    }
}

export async function rebuildEnhancedDiaryProjectRecordIndex(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    if (!config.dailyNotebookId) return rebuild(config);
    return queueMaintenance(config.dailyNotebookId, "rebuild", () => rebuild(config));
}

async function refresh(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    if (!config.dailyNotebookId) return { lastRunAt: now, lastStatus: "idle", lastMessage: "未配置日记笔记本。" };
    let writing = false;
    try {
        const diaryEntries = await getEnhancedDiaryIndexEntriesStrict(config.dailyNotebookId);
        const current = await readEnhancedDiaryProjectRecordIndex(config.dailyNotebookId, { fresh: true });
        const byDocId = new Map(Object.entries(diaryEntries).map(([date, entry]) => [entry.id, { date, entry }]));
        const prepared = await prepareChangedRecentDocsForIndex("enhanced-diary-project-record");
        const changed = prepared.changedDocs.filter((doc) => byDocId.has(doc.id));
        let items = { ...current.items };
        const failures = new Map((current.failures || []).map((failure) => [failure.docId, failure]));
        let skippedCount = 0;
        for (const doc of changed) {
            const metadata = byDocId.get(doc.id)!;
            const compactDate = metadata.date;
            const date = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
            const parsed = await readDiaryItemsForIndex(doc.id, date, config);
            if (parsed.failure) { failures.set(doc.id, parsed.failure); skippedCount += 1; continue; }
            failures.delete(doc.id);
            items = Object.fromEntries(Object.entries(items).filter(([, item]) => item.diaryDocId !== doc.id));
            parsed.items.forEach((item) => { items[item.id] = item; });
        }
        const next = { ...current, complete: current.complete && failures.size === 0, items, failures: [...failures.values()] };
        writing = true;
        await writeDirect(next);
        if (skippedCount === 0) await prepared.commit();
        return { ...statusFromIndex(next), changed: true, refreshedCount: changed.length - skippedCount };
    } catch (error) {
        return { source: writing ? WRITE_ERROR_SOURCE : READ_ERROR_SOURCE, lastRunAt: now, lastStatus: "error",
            lastMessage: `项目记录索引${writing ? "写入" : "读取"}失败：${error instanceof Error ? error.message : "未知错误"}` };
    }
}

export async function refreshEnhancedDiaryProjectRecordIndex(config: EnhancedDiaryConfig): Promise<ComponentMigrationStatus> {
    if (!config.dailyNotebookId) return refresh(config);
    return queueMaintenance(config.dailyNotebookId, "refresh", () => refresh(config));
}
