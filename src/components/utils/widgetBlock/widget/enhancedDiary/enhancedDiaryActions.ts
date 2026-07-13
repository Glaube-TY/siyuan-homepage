import { generateTaskLine, type GenerateTasksPlusTaskInput } from "../tasksPlus/tasksPlusParser";
import type { EnhancedDiaryConfig, EnhancedDiaryHeadingStructureConfig, EnhancedDiaryProjectStorageConfig, EnhancedDiaryTemplateFieldMapping } from "./enhancedDiaryTypes";
import { resolveRecordCategoryTitle } from "./enhancedDiaryWorkspaceSections";
import {
    createTodayDailyNoteForWidget,
    lookupDiaryDocumentForDate,
    readDiaryMarkdownResult,
    setEnhancedDiaryIndexNotebook,
    validateEnhancedDiaryWriteTarget,
    type EnhancedDiaryDocumentInfo,
} from "./enhancedDiaryDoc";
import {
    initializeEnhancedDiaryIndex,
} from "./enhancedDiaryIndex";
import {
    appendMarkdownToDaySection,
    appendMarkdownToRecordCategoryByTitle,
    locateInsertedBlock,
    type EnhancedDiaryInsertResult,
} from "./enhancedDiaryBlockLocator";
import { getBlockAttrsChecked, getChildBlocksChecked, setBlockAttrsChecked } from "@/api";
import { ENHANCED_DIARY_KEY_RECORD_ATTR, ENHANCED_DIARY_PROJECT_TARGET_ATTR } from "./enhancedDiaryProjectTypes";
import { appendRecordProjectReference } from "./workspace/enhancedDiaryWorkspaceProjectRelation";
import { synchronizeTaskIndexAfterWrite } from "@/components/tools/siyuanComponentDataApi";
import {
    EnhancedDiaryProjectWriteTargetError,
    validateEnhancedDiaryProjectWriteTarget,
} from "./workspace/enhancedDiaryWorkspaceProjectLifecycle";

export interface EnhancedDiaryTodayDocumentResult {
    ok: boolean;
    docId?: string;
    created?: boolean;
    content?: string;
    doc?: EnhancedDiaryDocumentInfo;
    reason?: "missing_notebook" | "create_failed" | "read_failed" | "existing_doc_unreadable" | "index_not_ready";
}

export interface EnhancedDiaryActionResult {
    ok: boolean;
    partial?: boolean;
    blockId?: string;
    headingBlockId?: string;
    contentBlockIds?: string[];
    reason?: string;
    message?: string;
}

function projectWriteValidationFailure(reason: unknown): EnhancedDiaryActionResult {
    if (reason instanceof EnhancedDiaryProjectWriteTargetError) {
        return { ok: false, reason: reason.code, message: reason.message };
    }
    return {
        ok: false,
        reason: "project_index_unavailable",
        message: reason instanceof Error ? reason.message : "无法确认项目状态，内容未写入。",
    };
}

async function readInsertedContentBlockIds(headingId: string): Promise<string[] | undefined> {
    const delays = [0, 100, 300, 800] as const;
    for (const waitMs of delays) {
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        try {
            const ids = (await getChildBlocksChecked(headingId)).map((block) => block.id).filter(Boolean);
            if (ids.length > 0) return ids;
        } catch {
            // 新标题的内容块可能仍在进入块树，只在有限窗口内重试。
        }
    }
    return undefined;
}

interface RecordWriteSynchronizationResult {
    headingId?: string;
    contentBlockIds: string[];
    complete: boolean;
}

const recordWriteSynchronizationFlights = new Map<string, Promise<RecordWriteSynchronizationResult>>();

async function runRecordWriteSynchronization(params: {
    docId: string;
    operationIds: string[];
    expectedHeading: string;
    projectTargetId?: string;
    isKeyRecord?: boolean;
    synchronizeIndex?: () => Promise<boolean>;
}): Promise<RecordWriteSynchronizationResult> {
    let headingId: string | undefined;
    for (const waitMs of [0, 250, 650] as const) {
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        headingId = await locateInsertedBlock({
            operationIds: params.operationIds,
            rootId: params.docId,
            nodeType: "NodeHeading",
            expectedMarkdown: params.expectedHeading,
        });
        if (headingId) break;
    }
    if (!headingId) {
        if (params.synchronizeIndex) {
            for (const waitMs of [0, 250, 650] as const) {
                if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
                try { if (await params.synchronizeIndex()) break; } catch { /* 有限重试后保持部分成功。 */ }
            }
        }
        return { contentBlockIds: [], complete: false };
    }

    const contentBlockIds = await readInsertedContentBlockIds(headingId);
    let attributesComplete = !params.projectTargetId;
    if (params.projectTargetId) {
        try {
            await setBlockAttrsChecked(headingId, {
                [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: params.projectTargetId,
                [ENHANCED_DIARY_KEY_RECORD_ATTR]: params.isKeyRecord ? "true" : "",
            });
            const attrs = await getBlockAttrsChecked(headingId);
            attributesComplete = attrs[ENHANCED_DIARY_PROJECT_TARGET_ATTR] === params.projectTargetId &&
                (!params.isKeyRecord || attrs[ENHANCED_DIARY_KEY_RECORD_ATTR] === "true");
        } catch {
            attributesComplete = false;
        }
    }
    let indexComplete = !params.synchronizeIndex;
    if (params.synchronizeIndex) {
        for (const waitMs of [0, 250, 650] as const) {
            if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
            try {
                if (await params.synchronizeIndex()) {
                    indexComplete = true;
                    break;
                }
            } catch {
                // 当天记录索引读取尚未就绪时继续有限重试。
            }
        }
    }
    return {
        headingId,
        contentBlockIds: contentBlockIds || [],
        complete: !!contentBlockIds && attributesComplete && indexComplete,
    };
}

function synchronizeRecordAfterWrite(params: {
    docId: string;
    operationIds: string[];
    expectedHeading: string;
    projectTargetId?: string;
    isKeyRecord?: boolean;
    synchronizeIndex?: () => Promise<boolean>;
}): Promise<RecordWriteSynchronizationResult> {
    const operationKey = Array.from(new Set(params.operationIds.filter(Boolean))).sort().join(",");
    if (!operationKey) return runRecordWriteSynchronization(params);
    const key = `${params.docId}:${operationKey}`;
    const running = recordWriteSynchronizationFlights.get(key);
    if (running) return running;
    const promise = runRecordWriteSynchronization(params);
    recordWriteSynchronizationFlights.set(key, promise);
    const cleanup = () => {
        if (recordWriteSynchronizationFlights.get(key) === promise) recordWriteSynchronizationFlights.delete(key);
    };
    void promise.then(cleanup, cleanup);
    return promise;
}

function formatNowTime(date = new Date()): string {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function formatInsertFailure(result: EnhancedDiaryInsertResult): EnhancedDiaryActionResult {
    if (result.reason === "missing_heading") {
        const path = result.path?.join(" > ") || result.missingTitle || "目标";
        return {
            ok: false,
            reason: result.reason,
            message: `当前日记缺少「${path}」区块，请补充模板或恢复标题。`,
        };
    }

    if (result.reason === "empty_markdown") {
        return {
            ok: false,
            reason: result.reason,
            message: "写入内容为空，请补充后重试。",
        };
    }

    return {
        ok: false,
        reason: result.reason || "insert_failed",
        message: "写入日记失败，请稍后重试。",
    };
}

export async function getOrCreateTodayDiaryDocument(
    plugin: any,
    config: EnhancedDiaryConfig
): Promise<EnhancedDiaryTodayDocumentResult> {
    // 1. Notebook must be configured
    if (!config.dailyNotebookId) {
        return { ok: false, reason: "missing_notebook" };
    }

    setEnhancedDiaryIndexNotebook(config.dailyNotebookId);

    // 2. Initialize index first — prevents creation when index is not ready
    const initStatus = await initializeEnhancedDiaryIndex(config.dailyNotebookId);
    if (initStatus.lastStatus !== "success") {
        return { ok: false, reason: "index_not_ready" };
    }

    // 3. Three-state query
    const today = new Date();
    const lookup = await lookupDiaryDocumentForDate(today, config.dailyNotebookId);

    if (lookup.status === "exists") {
        return {
            ok: true,
            docId: lookup.doc.id,
            content: lookup.doc.content,
            doc: lookup.doc,
            created: false,
        };
    }

    if (lookup.status === "unreadable") {
        // Doc exists but content temporarily unreadable — do NOT create new doc
        return {
            ok: false,
            reason: "existing_doc_unreadable",
            docId: lookup.docId,
        };
    }

    // 4. status === "missing" — only then create
    const docId = await createTodayDailyNoteForWidget(plugin, config.dailyNotebookId);
    if (!docId) {
        return { ok: false, reason: "create_failed" };
    }

    // 5. Verify the created doc is readable — use readDiaryMarkdownResult, not readDiaryMarkdown
    const readResult = await readDiaryMarkdownResult(docId);
    if (!readResult.ok) {
        return { ok: false, reason: "read_failed", docId, created: true };
    }

    return {
        ok: true,
        docId,
        content: readResult.content,
        created: true,
    };
}

export async function addNewTaskToDiary(params: {
    docId: string;
    task: GenerateTasksPlusTaskInput;
    dailyNotebookId: string;
    expectedDate: string;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
    projectStorage?: EnhancedDiaryProjectStorageConfig;
}): Promise<EnhancedDiaryActionResult> {
    // Final write-target validation before modifying the diary
    const writeCheck = await validateEnhancedDiaryWriteTarget(params.docId, params.dailyNotebookId, params.expectedDate);
    if (writeCheck.status !== "valid") {
        return { ok: false, reason: "write_target_invalid", message: "日记文档已变更，无法添加任务。" };
    }

    let task = params.task;
    if (task.projectTargetId) {
        if (!params.projectStorage) {
            return { ok: false, reason: "project_storage_unavailable", message: "无法确认项目状态，任务未写入。" };
        }
        try {
            const target = await validateEnhancedDiaryProjectWriteTarget(params.projectStorage, task.projectTargetId);
            task = { ...task, projectTargetId: target.id, projectTitle: target.title };
        } catch (reason) {
            return projectWriteValidationFailure(reason);
        }
    }

    let taskMarkdown = "";
    try {
        taskMarkdown = generateTaskLine(task);
    } catch {
        return {
            ok: false,
            reason: "invalid_task",
            message: "任务名称不能为空。",
        };
    }

    const result = await appendMarkdownToDaySection({
        docId: params.docId,
        sectionKey: "newTasks",
        markdown: taskMarkdown,
        headingStructure: params.headingStructure,
        mapping: params.mapping,
    });

    if (!result.ok) {
        return formatInsertFailure(result);
    }

    const insertedIds = result.blockIds || (result.blockId ? [result.blockId] : []);
    const synchronization = await synchronizeTaskIndexAfterWrite({
        docId: params.docId,
        taskMarkdown,
        projectTargetId: task.projectTargetId,
        operationIds: insertedIds,
    });
    if (synchronization.complete) return { ok: true, blockId: synchronization.blockId };
    return {
        ok: true,
        partial: true,
        blockId: synchronization.blockId,
        reason: synchronization.blockId ? "task_post_write_pending" : "task_id_unresolved",
        message: "任务已经写入日记，项目双链已经保留，后台已完成有限补齐尝试，索引或隐藏属性稍后会继续由增量刷新恢复。",
    };
}

export async function addQuickRecordToDiary(params: {
    docId: string;
    categoryTitle: string;
    content: string;
    dailyNotebookId: string;
    expectedDate: string;
    now?: Date;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
    tags?: string[];
    projectTargetId?: string;
    projectTitle?: string;
    rootProjectId?: string;
    projectPath?: string[];
    projectAncestorTargetIds?: string[];
    isKeyRecord?: boolean;
    synchronizeIndex?: () => Promise<boolean>;
    projectStorage?: EnhancedDiaryProjectStorageConfig;
}): Promise<EnhancedDiaryActionResult> {
    const content = params.content.trim();
    if (!content) {
        return {
            ok: false,
            reason: "empty_record",
            message: "记录内容不能为空。",
        };
    }

    // Final write-target validation before modifying the diary
    const writeCheck = await validateEnhancedDiaryWriteTarget(params.docId, params.dailyNotebookId, params.expectedDate);
    if (writeCheck.status !== "valid") {
        return { ok: false, reason: "write_target_invalid", message: "日记文档已变更，无法添加记录。" };
    }

    let projectTargetId = params.projectTargetId;
    let projectTitle = params.projectTitle;
    if (projectTargetId) {
        if (!params.projectStorage) {
            return { ok: false, reason: "project_storage_unavailable", message: "无法确认项目状态，记录未写入。" };
        }
        try {
            const target = await validateEnhancedDiaryProjectWriteTarget(params.projectStorage, projectTargetId);
            projectTargetId = target.id;
            projectTitle = target.title;
        } catch (reason) {
            return projectWriteValidationFailure(reason);
        }
    }

    const { title: normalizedTitle } = resolveRecordCategoryTitle(params.categoryTitle);
    if (params.isKeyRecord && !projectTargetId) {
        return { ok: false, reason: "key_record_requires_project", message: "关联项目后，才能设为关键记录。" };
    }
    const tags = Array.from(new Set((params.tags || []).map((tag) => tag.replace(/^#+|#+$/g, "").trim()).filter(Boolean)));
    const headingSuffix = tags.map((tag) => `#${tag}#`).join(" ");
    const visibleContent = projectTargetId && projectTitle
        ? appendRecordProjectReference(content, projectTargetId, projectTitle)
        : content;
    const recordTime = formatNowTime(params.now);
    const result = await appendMarkdownToRecordCategoryByTitle({
        docId: params.docId,
        categoryTitle: normalizedTitle,
        content: visibleContent,
        recordTime: `${recordTime} 记录${headingSuffix ? ` ${headingSuffix}` : ""}`,
        headingStructure: params.headingStructure,
        mapping: params.mapping,
    });

    if (!result.ok) {
        return formatInsertFailure(result);
    }

    const inserted = new Set(result.blockIds || []);
    const synchronization = await synchronizeRecordAfterWrite({
        docId: params.docId,
        operationIds: [...inserted],
        expectedHeading: `${recordTime} 记录`,
        projectTargetId,
        isKeyRecord: params.isKeyRecord,
        synchronizeIndex: params.synchronizeIndex,
    });
    const headingId = synchronization.headingId;
    const contentBlockIds = synchronization.contentBlockIds;
    const partial = !synchronization.complete;
    return {
        ok: true,
        partial: partial || undefined,
        blockId: headingId,
        headingBlockId: headingId,
        contentBlockIds,
        reason: partial ? (headingId ? "record_post_write_pending" : "record_id_unresolved") : undefined,
        message: partial
            ? "记录已经写入日记，项目双链已经保留，后台已完成有限补齐尝试，属性或索引稍后会继续由当天记录刷新恢复。"
            : undefined,
    };
}
