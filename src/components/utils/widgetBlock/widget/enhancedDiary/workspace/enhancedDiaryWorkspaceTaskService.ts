import {
    appendBlock,
    deleteBlock,
    getBlockKramdown,
    moveBlock,
    sql,
    updateBlock,
} from "@/api";
import {
    extractTaskTags,
    generateTaskLine,
    isTaskCompleted,
    parseTaskLine,
    type GenerateTasksPlusTaskInput,
} from "../../tasksPlus/tasksPlusParser";
import type { EnhancedDiaryConfig } from "../enhancedDiaryTypes";
import {
    appendMarkdownToDaySection,
    getDayWorkspaceSectionEndAnchor,
} from "../enhancedDiaryBlockLocator";
import { getOrCreateTodayDiaryDocument } from "../enhancedDiaryActions";
import { getDiaryDocumentForDate } from "../enhancedDiaryDoc";
import { formatDiaryDate } from "../enhancedDiaryUtils";
import { getDayWorkspaceSections } from "../enhancedDiaryWorkspaceSections";
import { addDays, daysBetweenLocalDates, formatLocalDate } from "./enhancedDiaryWorkspaceDate";

export type EnhancedDiaryWorkspaceTaskSourceKind = "new" | "migrated" | "normal";

export interface EnhancedDiaryWorkspaceTask {
    id: string;
    blockId: string;
    rootId?: string;
    box?: string;
    hpath?: string;
    markdown: string;
    taskname: string;
    completed: boolean;
    priority: string;
    startDate: string;
    deadline: string;
    recurrence: string;
    reminder: string;
    location: string;
    tags: string[];
    sourceKind: EnhancedDiaryWorkspaceTaskSourceKind;
    sourceDate?: string;
    sourceDocId?: string;
    sourceDocTitle?: string;
    isTodayTask: boolean;
    isOverdue: boolean;
    shouldMigrate: boolean;
}

export interface WorkspaceTaskActionResult {
    ok: boolean;
    changed?: boolean;
    reason?: string;
    message?: string;
}

interface SourceDocInfo {
    id: string;
    title: string;
    attrDate?: string;
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function firstTaskLine(markdown: string): string {
    return (markdown || "").split("\n\n")[0]?.split("\n")[0]?.trim() || "";
}

function stripKramdownAttrs(markdown: string): string {
    return (markdown || "").replace(/\s*\{:.*?\}\s*$/gm, "").trimEnd();
}

function parseAttrDate(ial?: string): string | undefined {
    const match = ial?.match(/custom-dailynote-(\d{8})/);
    if (!match) return undefined;
    return `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
}

function parseDateFromHpath(hpath?: string): string | undefined {
    if (!hpath) return undefined;
    const match = hpath.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!match) return undefined;
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function makeTaskLineSet(markdown: string): Set<string> {
    const result = new Set<string>();
    markdown.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (/^[-*]\s\[( |x|X)\]/.test(trimmed)) {
            result.add(trimmed);
        }
    });
    return result;
}

async function querySourceDocs(rootIds: string[]): Promise<Map<string, SourceDocInfo>> {
    const uniqueIds = Array.from(new Set(rootIds.filter(Boolean)));
    if (uniqueIds.length === 0) return new Map();

    const quotedIds = uniqueIds.map((id) => `'${escapeSqlString(id)}'`).join(",");
    const rows = await sql(
        `SELECT id, content, ial FROM blocks WHERE type = 'd' AND id IN (${quotedIds})`
    );
    const result = new Map<string, SourceDocInfo>();

    (rows || []).forEach((row) => {
        result.set(row.id, {
            id: row.id,
            title: row.content || "",
            attrDate: parseAttrDate(row.ial),
        });
    });

    return result;
}

async function getTodaySectionTaskSets(today: Date): Promise<{
    todayDocId?: string;
    newTaskLines: Set<string>;
    migratedTaskLines: Set<string>;
}> {
    const todayDoc = await getDiaryDocumentForDate(today);
    if (!todayDoc) {
        return {
            newTaskLines: new Set(),
            migratedTaskLines: new Set(),
        };
    }

    const sections = getDayWorkspaceSections(todayDoc.content);
    return {
        todayDocId: todayDoc.id,
        newTaskLines: sections.newTasks.found
            ? makeTaskLineSet(sections.newTasks.markdown)
            : new Set(),
        migratedTaskLines: sections.migratedTasks.found
            ? makeTaskLineSet(sections.migratedTasks.markdown)
            : new Set(),
    };
}

export async function queryWorkspaceTasks(
    config: EnhancedDiaryConfig,
    today: Date
): Promise<EnhancedDiaryWorkspaceTask[]> {
    const todayStr = formatDiaryDate(today);
    const rows = await sql(`
        SELECT id, root_id, box, hpath, markdown, content, created, updated
        FROM blocks
        WHERE subtype = 't' AND type != 'l'
        ORDER BY updated DESC
        LIMIT 2000
    `);

    const sourceDocs = await querySourceDocs((rows || []).map((row) => row.root_id));
    const todaySets = await getTodaySectionTaskSets(today);

    return (rows || []).map((row) => {
        const markdown = firstTaskLine(row.markdown || row.content || "");
        const parsed = parseTaskLine(markdown);
        const sourceDoc = sourceDocs.get(row.root_id);
        const sourceDate = sourceDoc?.attrDate || parseDateFromHpath(row.hpath);

        let sourceKind: EnhancedDiaryWorkspaceTaskSourceKind = "normal";
        if (row.root_id === todaySets.todayDocId) {
            if (todaySets.newTaskLines.has(markdown)) {
                sourceKind = "new";
            } else if (todaySets.migratedTaskLines.has(markdown)) {
                sourceKind = "migrated";
            }
        }

        const completed = isTaskCompleted(parsed.taskCheck);
        const isTodayTask =
            parsed.parsed.startDate === todayStr ||
            parsed.parsed.deadline === todayStr ||
            sourceKind === "new" ||
            sourceKind === "migrated";
        const isOverdue =
            !completed &&
            !!parsed.parsed.deadline &&
            parsed.parsed.deadline < todayStr;
        const shouldMigrate =
            !completed &&
            sourceKind === "normal" &&
            !!sourceDate &&
            daysBetweenLocalDates(sourceDate, todayStr) > config.taskMigrationReminderDays;

        return {
            id: row.id,
            blockId: row.id,
            rootId: row.root_id,
            box: row.box,
            hpath: row.hpath,
            markdown,
            taskname: parsed.taskname,
            completed,
            priority: parsed.parsed.priority,
            startDate: parsed.parsed.startDate,
            deadline: parsed.parsed.deadline,
            recurrence: parsed.parsed.recurrence,
            reminder: parsed.parsed.reminder,
            location: parsed.parsed.location,
            tags: extractTaskTags(markdown),
            sourceKind,
            sourceDate,
            sourceDocId: row.root_id,
            sourceDocTitle: sourceDoc?.title || "",
            isTodayTask,
            isOverdue,
            shouldMigrate,
        };
    }).filter((task) => task.taskname.trim().length > 0);
}

async function readTaskBlockMarkdown(task: EnhancedDiaryWorkspaceTask): Promise<string | null> {
    try {
        const block = await getBlockKramdown(task.blockId);
        return stripKramdownAttrs(block?.kramdown || "");
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceTaskService] read task block failed", err);
        return null;
    }
}

async function updateTaskFirstLine(
    task: EnhancedDiaryWorkspaceTask,
    newFirstLine: string
): Promise<WorkspaceTaskActionResult> {
    const current = await readTaskBlockMarkdown(task);
    if (!current) {
        return {
            ok: false,
            reason: "read_failed",
            message: "读取任务块失败，未更新任务。",
        };
    }

    const lines = current.split("\n");
    lines[0] = newFirstLine;

    try {
        await updateBlock("markdown", lines.join("\n"), task.blockId);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceTaskService] update task failed", err);
        return {
            ok: false,
            reason: "update_failed",
            message: "更新任务失败，请稍后重试。",
        };
    }
}

export async function toggleWorkspaceTaskComplete(
    task: EnhancedDiaryWorkspaceTask,
    completed: boolean
): Promise<WorkspaceTaskActionResult> {
    const current = parseTaskLine(task.markdown);
    const newLine = task.markdown.replace(
        /^[-*]\s\[( |x|X)\]/,
        completed ? "- [x]" : "- [ ]"
    );

    if (!current.taskCheck || newLine === task.markdown) {
        return {
            ok: false,
            reason: "invalid_task",
            message: "无法识别任务状态，未更新。",
        };
    }

    return updateTaskFirstLine(task, newLine);
}

export async function updateWorkspaceTask(
    task: EnhancedDiaryWorkspaceTask,
    input: GenerateTasksPlusTaskInput
): Promise<WorkspaceTaskActionResult> {
    let newLine = "";
    try {
        newLine = generateTaskLine({
            ...input,
            completed: input.completed ?? task.completed,
        });
    } catch {
        return {
            ok: false,
            reason: "invalid_task",
            message: "任务名称不能为空。",
        };
    }

    return updateTaskFirstLine(task, newLine);
}

export async function postponeWorkspaceTask(
    task: EnhancedDiaryWorkspaceTask,
    target: "tomorrow" | "nextWeek"
): Promise<WorkspaceTaskActionResult> {
    const targetDate = formatLocalDate(addDays(new Date(), target === "tomorrow" ? 1 : 7));
    const nextInput: GenerateTasksPlusTaskInput = {
        taskname: task.taskname,
        completed: task.completed,
        priority: task.priority,
        startDate: task.startDate,
        deadline: task.deadline,
        recurrence: task.recurrence,
        reminder: task.reminder,
        location: task.location,
        tags: task.tags,
    };

    if (task.deadline) {
        nextInput.deadline = targetDate;
    } else if (task.startDate) {
        nextInput.startDate = targetDate;
    } else {
        nextInput.deadline = targetDate;
    }

    return updateWorkspaceTask(task, nextInput);
}

function buildSourceLink(task: EnhancedDiaryWorkspaceTask): string {
    if (task.sourceDocId) {
        const title = task.sourceDocTitle || task.sourceDate || "来源日记";
        return `((` + `${task.sourceDocId} "${title}"` + `))`;
    }
    return task.sourceDate || task.hpath || "未知来源";
}

export async function deleteWorkspaceTask(
    plugin: any,
    config: EnhancedDiaryConfig,
    task: EnhancedDiaryWorkspaceTask,
    mode: "log" | "delete"
): Promise<WorkspaceTaskActionResult> {
    if (mode === "log") {
        const todayDoc = await getOrCreateTodayDiaryDocument(plugin, config);
        if (!todayDoc.ok || !todayDoc.docId) {
            return {
                ok: false,
                reason: todayDoc.reason || "today_doc_failed",
                message: "未能打开或创建今日日记，已取消删除。",
            };
        }

        const logResult = await appendMarkdownToDaySection({
            docId: todayDoc.docId,
            sectionKey: "taskLog",
            markdown: `- 删除任务：${task.taskname}（来源：${buildSourceLink(task)}）`,
            headingStructure: config.headingStructure,
        });

        if (!logResult.ok) {
            return {
                ok: false,
                reason: logResult.reason,
                message: "删除记录写入失败，已保留原任务。",
            };
        }
    }

    try {
        await deleteBlock(task.blockId);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceTaskService] delete task failed", err);
        return {
            ok: false,
            reason: "delete_failed",
            message: "删除任务失败，请稍后重试。",
        };
    }
}

function formatNowTime(date = new Date()): string {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export async function migrateWorkspaceTaskToToday(
    plugin: any,
    config: EnhancedDiaryConfig,
    task: EnhancedDiaryWorkspaceTask
): Promise<WorkspaceTaskActionResult> {
    if (task.isTodayTask || task.sourceKind === "migrated") {
        return { 
            ok: false, 
            changed: false, 
            reason: "already_today", 
            message: "该任务已经在今日日记中，无需迁移。" 
        };
    }

    const todayDoc = await getOrCreateTodayDiaryDocument(plugin, config);
    if (!todayDoc.ok || !todayDoc.docId) {
        return {
            ok: false,
            changed: false,
            reason: todayDoc.reason || "today_doc_failed",
            message: "未能打开或创建今日日记，迁移已取消。",
        };
    }

    const anchor = await getDayWorkspaceSectionEndAnchor({
        docId: todayDoc.docId,
        sectionKey: "migratedTasks",
        headingStructure: config.headingStructure,
    });
    if (!anchor.ok || !anchor.previousID) {
        return {
            ok: false,
            changed: false,
            reason: anchor.reason || "missing_anchor",
            message: "当前日记缺少「任务管理 > 迁移任务」区块，请补充模板或恢复标题。",
        };
    }

    try {
        await moveBlock(task.blockId, anchor.previousID, anchor.parentID);
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceTaskService] move task failed", err);
        return {
            ok: false,
            changed: false,
            reason: "move_failed",
            message: "移动任务失败，原任务已保留。",
        };
    }

    try {
        await appendBlock(
            "markdown",
            `- 迁移来源：${buildSourceLink(task)}\n- 迁移时间：${formatNowTime()}`,
            task.blockId
        );
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceTaskService] append migrate source failed", err);
        return {
            ok: false,
            changed: true,
            reason: "append_source_failed",
            message: "任务已移动，但迁移来源追加失败，请在日记中检查。",
        };
    }

    try {
        await appendMarkdownToDaySection({
            docId: todayDoc.docId,
            sectionKey: "taskLog",
            markdown: `- 迁移任务：${task.taskname}，从 ${task.sourceDate || task.sourceDocTitle || "旧日记"} 迁移到今天`,
            headingStructure: config.headingStructure,
        });
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceTaskService] append migrate log failed", err);
    }

    return { ok: true, changed: true };
}
