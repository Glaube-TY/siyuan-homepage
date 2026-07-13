import {
    appendBlockChecked,
    batchGetBlockAttrs,
    deleteBlockChecked,
    getBlockKramdown,
    moveBlockChecked,
    setBlockAttrsChecked,
    updateBlockChecked,
} from "@/api";
import {
    extractTaskTags,
    generateTaskLine,
    isTaskCompleted,
    parseTaskLine,
    type GenerateTasksPlusTaskInput,
} from "../../tasksPlus/tasksPlusParser";
import type { EnhancedDiaryConfig, EnhancedDiaryProjectStorageConfig } from "../enhancedDiaryTypes";
import {
    appendMarkdownToDaySection,
    getDayWorkspaceSectionEndAnchor,
} from "../enhancedDiaryBlockLocator";
import { getOrCreateTodayDiaryDocument } from "../enhancedDiaryActions";
import { readDiaryMarkdownResult } from "../enhancedDiaryDoc";
import { formatDiaryDate, isEnhancedDiarySystemTaskMarkdown } from "../enhancedDiaryUtils";
import { getDayWorkspaceSections } from "../enhancedDiaryWorkspaceSections";
import { addDays, daysBetweenLocalDates, formatLocalDate } from "./enhancedDiaryWorkspaceDate";
import { selectByIdsBatched } from "@/components/tools/siyuanSqlPaging";
import {
    getTaskIndexResult,
    ensureTaskBlockExists,
    ensureTaskIndexInitialized,
    refreshTaskIndexFromRecentDocuments,
    removeTaskIndexItem,
    updateTaskIndexItem,
} from "@/components/tools/siyuanComponentDataApi";
import { readEnhancedDiaryProjectIndex } from "../enhancedDiaryProjectIndex";
import { resolveProjectRelation } from "./enhancedDiaryWorkspaceProjectRelation";
import { ENHANCED_DIARY_PROJECT_TARGET_ATTR, parseEnhancedDiaryBatchBlockAttrs } from "../enhancedDiaryProjectTypes";
import {
    EnhancedDiaryProjectWriteTargetError,
    validateEnhancedDiaryProjectWriteTarget,
} from "./enhancedDiaryWorkspaceProjectLifecycle";

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
    projectTargetId?: string;
    hiddenProjectTargetId?: string;
    visibleProjectTargetId?: string;
    rootProjectId?: string;
    projectPath?: string[];
    projectAncestorTargetIds?: string[];
    projectRelationStatus: ReturnType<typeof resolveProjectRelation>["relationStatus"];
}

export interface WorkspaceTaskActionResult {
    ok: boolean;
    partial?: boolean;
    changed?: boolean;
    reason?: string;
    message?: string;
}

interface SourceDocInfo {
    id: string;
    title: string;
    attrDate?: string;
    hpath?: string;
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
    const match = hpath.match(/(\d{4})(?:[-/.]|\u5e74)(\d{1,2})(?:[-/.]|\u6708)(\d{1,2})/);
    if (!match) return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (month < 1 || month > 12 || day < 1 || day > 31 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
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

    const rows = await selectByIdsBatched(
        uniqueIds,
        (escapedIds) => `
            SELECT id, content, ial, hpath
            FROM blocks
            WHERE type = 'd'
            AND id IN (${escapedIds})
        `,
        64,
    );
    const result = new Map<string, SourceDocInfo>();

    (rows || []).forEach((row) => {
        result.set(row.id, {
            id: row.id,
            title: row.content || "",
            attrDate: parseAttrDate(row.ial),
            hpath: row.hpath || "",
        });
    });

    return result;
}

async function getTodaySectionTaskSets(
    config: EnhancedDiaryConfig,
    todayDocId?: string,
): Promise<{
    todayDocId?: string;
    newTaskLines: Set<string>;
    migratedTaskLines: Set<string>;
}> {
    if (!todayDocId) {
        return {
            newTaskLines: new Set(),
            migratedTaskLines: new Set(),
        };
    }

    const markdown = await readDiaryMarkdownResult(todayDocId);
    if (!markdown.ok) {
        return { newTaskLines: new Set(), migratedTaskLines: new Set() };
    }
    const sections = getDayWorkspaceSections(
        markdown.content,
        config?.headingStructure,
        config?.templateFieldMapping,
    );
    return {
        todayDocId,
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
    today: Date,
    plugin?: any,
    options: QueryWorkspaceTasksOptions = {},
): Promise<EnhancedDiaryWorkspaceTask[]> {
    const todayStr = formatDiaryDate(today);
    const initialization = await ensureTaskIndexInitialized(plugin);
    if (options.requireFreshIndex && initialization.status.lastStatus === "error") {
        throw new Error(`任务索引初始化失败：${initialization.status.lastMessage || "未知错误"}`);
    }
    const refreshStatus = await refreshTaskIndexFromRecentDocuments(
        plugin,
        options.forceIndexRefresh ? { force: true, ttlMs: 0 } : {},
    );
    if (options.requireFreshIndex && refreshStatus.lastStatus === "error") {
        throw new Error(`任务索引刷新失败：${refreshStatus.lastMessage || "未知错误"}`);
    }
    const taskResult = await getTaskIndexResult([], plugin);
    const rows = taskResult.items;
    const projectIndex = await readEnhancedDiaryProjectIndex(config.projectStorage);
    const taskAttrs = rows?.length
        ? parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(rows.map((row) => row.id)))
        : {};

    const sourceDocs = await querySourceDocs((rows || []).map((row) => row.root_id));
    const todayDocId = (rows || []).find((row) => {
        const sourceDoc = sourceDocs.get(row.root_id);
        return sourceDoc?.attrDate === todayStr || parseDateFromHpath(sourceDoc?.hpath || row.hpath) === todayStr;
    })?.root_id;
    const todaySets = await getTodaySectionTaskSets(config, todayDocId);

    return (rows || []).map((row) => {
        const markdown = firstTaskLine(row.markdown || row.content || "");
        const parsed = parseTaskLine(markdown);
        const sourceDoc = sourceDocs.get(row.root_id);
        const sourceDate = sourceDoc?.attrDate || parseDateFromHpath(sourceDoc?.hpath || row.hpath);

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
        const relation = resolveProjectRelation(projectIndex, taskAttrs?.[row.id] || {}, markdown);

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
            projectTargetId: relation.projectTargetId,
            hiddenProjectTargetId: relation.hiddenProjectTargetId,
            visibleProjectTargetId: relation.visibleProjectTargetId,
            rootProjectId: relation.rootProjectId,
            projectPath: relation.projectPath,
            projectAncestorTargetIds: relation.projectAncestorTargetIds,
            projectRelationStatus: relation.relationStatus,
        };
    }).filter((task) => task.taskname.trim().length > 0 && !isEnhancedDiarySystemTaskMarkdown(task.markdown));
}

export interface QueryWorkspaceTasksOptions {
    forceIndexRefresh?: boolean;
    requireFreshIndex?: boolean;
}

async function readTaskBlockMarkdown(task: EnhancedDiaryWorkspaceTask): Promise<string | null> {
    try {
        const block = await getBlockKramdown(task.blockId);
        return stripKramdownAttrs(block?.kramdown || "");
    } catch {
        return null;
    }
}

async function updateTaskFirstLine(
    task: EnhancedDiaryWorkspaceTask,
    newFirstLine: string
): Promise<WorkspaceTaskActionResult> {
    if (!(await ensureTaskBlockExists(task.blockId))) {
        return {
            ok: false,
            reason: "missing_task",
            message: "任务块已删除，已清理索引。",
        };
    }
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
        await updateBlockChecked("markdown", lines.join("\n"), task.blockId);
        try {
            await updateTaskIndexItem({
                id: task.blockId,
                rootID: task.rootId || task.blockId,
                root_id: task.rootId || task.blockId,
                box: task.box,
                hpath: task.hpath,
                markdown: newFirstLine,
                content: parseTaskLine(newFirstLine).taskname || newFirstLine,
                checked: isTaskCompleted(newFirstLine),
                updated: new Date().toISOString(),
                source: "plugin",
            });
        } catch {
            // 索引同步失败不影响已完成的块更新。
        }
        return { ok: true };
    } catch {
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

export interface WorkspaceTaskBatchCompleteResult {
    total: number;
    successCount: number;
    failedCount: number;
    failedTasks: EnhancedDiaryWorkspaceTask[];
}

export async function completeWorkspaceTasksSequentially(
    tasks: EnhancedDiaryWorkspaceTask[],
): Promise<WorkspaceTaskBatchCompleteResult> {
    const targets = tasks.filter((task) => !task.completed);
    const failedTasks: EnhancedDiaryWorkspaceTask[] = [];
    let successCount = 0;
    for (const task of targets) {
        const result = await toggleWorkspaceTaskComplete(task, true);
        if (result.ok) successCount += 1;
        else failedTasks.push(task);
    }
    return {
        total: targets.length,
        successCount,
        failedCount: failedTasks.length,
        failedTasks,
    };
}

export async function updateWorkspaceTask(
    task: EnhancedDiaryWorkspaceTask,
    input: GenerateTasksPlusTaskInput,
    projectStorage?: EnhancedDiaryProjectStorageConfig,
): Promise<WorkspaceTaskActionResult> {
    let validatedInput = input;
    if (input.projectTargetId !== undefined) {
        if (input.projectTargetId) {
            if (!projectStorage) {
                return { ok: false, reason: "project_storage_unavailable", message: "无法确认项目状态，任务未更新。" };
            }
            try {
                const target = await validateEnhancedDiaryProjectWriteTarget(
                    projectStorage,
                    input.projectTargetId,
                    task.projectTargetId,
                );
                validatedInput = { ...input, projectTargetId: target.id, projectTitle: target.title };
            } catch (reason) {
                return {
                    ok: false,
                    reason: reason instanceof EnhancedDiaryProjectWriteTargetError ? reason.code : "project_index_unavailable",
                    message: reason instanceof Error ? reason.message : "无法确认项目状态，任务未更新。",
                };
            }
        } else {
            validatedInput = { ...input, projectTargetId: "", projectTitle: undefined };
        }
    }
    let newLine = "";
    try {
        newLine = generateTaskLine({
            ...validatedInput,
            completed: validatedInput.completed ?? task.completed,
            projectTargetId: validatedInput.projectTargetId ?? task.projectTargetId,
            projectTitle: validatedInput.projectTitle ?? task.projectPath?.[task.projectPath.length - 1],
        });
    } catch {
        return {
            ok: false,
            reason: "invalid_task",
            message: "任务名称不能为空。",
        };
    }

    const result = await updateTaskFirstLine(task, newLine);
    if (!result.ok || validatedInput.projectTargetId === undefined) return result;
    try {
        await setBlockAttrsChecked(task.blockId, {
            [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: validatedInput.projectTargetId || "",
        });
        await updateTaskIndexItem({
            id: task.blockId,
            root_id: task.rootId || task.blockId,
            rootID: task.rootId || task.blockId,
            ial: validatedInput.projectTargetId
                ? `{: ${ENHANCED_DIARY_PROJECT_TARGET_ATTR}="${validatedInput.projectTargetId}"}`
                : "",
            projectTargetId: validatedInput.projectTargetId || undefined,
            hiddenProjectTargetId: validatedInput.projectTargetId || undefined,
            visibleProjectTargetId: validatedInput.projectTargetId || undefined,
            projectRelationStatus: validatedInput.projectTargetId ? "normal" : "none",
        });
        return result;
    } catch {
        try {
            await updateTaskIndexItem({
                id: task.blockId,
                root_id: task.rootId || task.blockId,
                rootID: task.rootId || task.blockId,
                projectTargetId: validatedInput.projectTargetId || undefined,
                hiddenProjectTargetId: undefined,
                visibleProjectTargetId: validatedInput.projectTargetId || undefined,
                projectRelationStatus: validatedInput.projectTargetId ? "missing_hidden_relation" : "none",
            });
        } catch {
            // 正文已经更新，后续增量刷新会从显性项目引用补齐索引。
        }
        return { ok: true, partial: true, changed: true, reason: "project_attr_failed", message: "任务正文已更新并保留项目引用，但隐藏项目属性或索引待修复。" };
    }
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
    if (!(await ensureTaskBlockExists(task.blockId))) {
        return {
            ok: false,
            reason: "missing_task",
            message: "任务块已删除，已清理索引。",
        };
    }
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
            mapping: config.templateFieldMapping,
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
        await deleteBlockChecked(task.blockId);
        try {
            await removeTaskIndexItem(task.blockId);
        } catch {
            // 索引同步失败不影响已完成的块删除。
        }
        return { ok: true };
    } catch {
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
    if (!(await ensureTaskBlockExists(task.blockId))) {
        return {
            ok: false,
            changed: false,
            reason: "missing_task",
            message: "任务块已删除，已清理索引。",
        };
    }
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
        mapping: config.templateFieldMapping,
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
        await moveBlockChecked(task.blockId, anchor.previousID, anchor.parentID);
    } catch {
        return {
            ok: false,
            changed: false,
            reason: "move_failed",
            message: "移动任务失败，原任务已保留。",
        };
    }
    try {
        await updateTaskIndexItem({
            id: task.blockId,
            rootID: todayDoc.docId,
            root_id: todayDoc.docId,
            box: task.box,
            hpath: task.hpath,
            markdown: task.markdown,
            content: task.taskname,
            checked: task.completed,
            updated: new Date().toISOString(),
            source: "plugin",
        });
    } catch {
        // 索引同步失败不影响已完成的块移动。
    }

    try {
        await appendBlockChecked(
            "markdown",
            `- 迁移来源：${buildSourceLink(task)}\n- 迁移时间：${formatNowTime()}`,
            task.blockId
        );
    } catch {
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
            mapping: config.templateFieldMapping,
        });
    } catch {
        return {
            ok: true,
            changed: true,
            message: "任务已迁移，但迁移日志追加失败。",
        };
    }

    return { ok: true, changed: true };
}
