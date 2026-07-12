import { generateTaskLine, type GenerateTasksPlusTaskInput } from "../tasksPlus/tasksPlusParser";
import type { EnhancedDiaryConfig, EnhancedDiaryHeadingStructureConfig, EnhancedDiaryTemplateFieldMapping } from "./enhancedDiaryTypes";
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
    type EnhancedDiaryInsertResult,
} from "./enhancedDiaryBlockLocator";

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
    reason?: string;
    message?: string;
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
}): Promise<EnhancedDiaryActionResult> {
    // Final write-target validation before modifying the diary
    const writeCheck = await validateEnhancedDiaryWriteTarget(params.docId, params.dailyNotebookId, params.expectedDate);
    if (writeCheck.status !== "valid") {
        return { ok: false, reason: "write_target_invalid", message: "日记文档已变更，无法添加任务。" };
    }

    let taskMarkdown = "";
    try {
        taskMarkdown = generateTaskLine(params.task);
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

    return { ok: true };
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

    const { title: normalizedTitle } = resolveRecordCategoryTitle(params.categoryTitle);
    const result = await appendMarkdownToRecordCategoryByTitle({
        docId: params.docId,
        categoryTitle: normalizedTitle,
        content,
        recordTime: formatNowTime(params.now),
        headingStructure: params.headingStructure,
        mapping: params.mapping,
    });

    if (!result.ok) {
        return formatInsertFailure(result);
    }

    return { ok: true };
}
