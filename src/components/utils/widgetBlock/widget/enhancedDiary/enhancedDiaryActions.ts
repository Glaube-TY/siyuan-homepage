import { generateTaskLine, type GenerateTasksPlusTaskInput } from "../tasksPlus/tasksPlusParser";
import type { EnhancedDiaryConfig } from "./enhancedDiaryTypes";
import type { EnhancedDiaryRecordCategoryKey } from "./enhancedDiaryWorkspaceSections";
import {
    createTodayDailyNoteForWidget,
    getDiaryDocumentForDate,
    readDiaryMarkdown,
    type EnhancedDiaryDocumentInfo,
} from "./enhancedDiaryDoc";
import {
    appendMarkdownToDaySection,
    appendMarkdownToRecordCategory,
    type EnhancedDiaryInsertResult,
} from "./enhancedDiaryBlockLocator";

export interface EnhancedDiaryTodayDocumentResult {
    ok: boolean;
    docId?: string;
    created?: boolean;
    content?: string;
    doc?: EnhancedDiaryDocumentInfo;
    reason?: "missing_notebook" | "create_failed" | "read_failed";
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
    const today = new Date();
    const existing = await getDiaryDocumentForDate(today);
    if (existing) {
        return {
            ok: true,
            docId: existing.id,
            content: existing.content,
            doc: existing,
            created: false,
        };
    }

    if (!config.dailyNotebookId) {
        return { ok: false, reason: "missing_notebook" };
    }

    const docId = await createTodayDailyNoteForWidget(plugin, config.dailyNotebookId);
    if (!docId) {
        return { ok: false, reason: "create_failed" };
    }

    const content = await readDiaryMarkdown(docId);
    if (content == null) {
        return { ok: false, reason: "read_failed", docId, created: true };
    }

    return {
        ok: true,
        docId,
        content,
        created: true,
    };
}

export async function addNewTaskToDiary(params: {
    docId: string;
    task: GenerateTasksPlusTaskInput;
}): Promise<EnhancedDiaryActionResult> {
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
    });

    if (!result.ok) {
        return formatInsertFailure(result);
    }

    return { ok: true };
}

export async function addQuickRecordToDiary(params: {
    docId: string;
    categoryKey: EnhancedDiaryRecordCategoryKey;
    content: string;
    now?: Date;
}): Promise<EnhancedDiaryActionResult> {
    const content = params.content.trim();
    if (!content) {
        return {
            ok: false,
            reason: "empty_record",
            message: "记录内容不能为空。",
        };
    }

    const markdown = `#### ${formatNowTime(params.now)} 记录\n\n${content}`;
    const result = await appendMarkdownToRecordCategory({
        docId: params.docId,
        categoryKey: params.categoryKey,
        markdown,
    });

    if (!result.ok) {
        return formatInsertFailure(result);
    }

    return { ok: true };
}
