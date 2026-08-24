import {
    appendBlockChecked,
    batchGetBlockAttrs,
    checkBlockExist,
    deleteBlockChecked,
    getBlockInfo,
    getBlockKramdown,
    getBlockTreeInfos,
    moveBlockChecked,
    setBlockAttrsChecked,
    updateBlockChecked,
    type SiyuanBlockTreeInfo,
} from "@/api";
import {
    extractTaskTags,
    generateTaskLine,
    isTaskCompleted,
    parseTaskLine,
    type GenerateTasksPlusTaskInput,
} from "@/features/task-data/task-parser";
import type { EnhancedDiaryConfig, EnhancedDiaryProjectStorageConfig } from "../enhancedDiaryTypes";
import {
    appendMarkdownToDaySection,
    deleteTaskMovePlaceholder,
    isEnhancedDiaryDocumentType,
    isEnhancedDiaryListContainerType,
    isEnhancedDiaryTaskListItemType,
    resolveDayWorkspaceTaskMoveTarget,
    validateTaskListTreeShape,
    type EnhancedDiaryTaskMoveTarget,
} from "../enhancedDiaryBlockLocator";
import { getOrCreateTodayDiaryDocument } from "../enhancedDiaryActions";
import { readDiaryMarkdownResult } from "../enhancedDiaryDoc";
import { formatDiaryDate, isEnhancedDiarySystemTaskMarkdown } from "../enhancedDiaryUtils";
import { getDayWorkspaceSections } from "../enhancedDiaryWorkspaceSections";
import { addDays, formatLocalDate } from "./enhancedDiaryWorkspaceDate";
import { deriveWorkspaceTaskScheduleFlags } from "./enhancedDiaryWorkspaceTaskModel";
import { selectByIdsBatched } from "@/components/tools/siyuanSqlPaging";
import {
    ensureTaskBlockExists,
    removeTaskIndexItem,
    refreshTaskIndexByRootIds,
    updateTaskIndexItem,
} from "@/components/tools/siyuanComponentDataApi";
import { loadTaskData } from "@/features/task-data/task-data-service";
import { readEnhancedDiaryProjectIndex } from "../enhancedDiaryProjectIndex";
import { parseVisibleProjectTargetId, resolveProjectRelation } from "./enhancedDiaryWorkspaceProjectRelation";
import { ENHANCED_DIARY_PROJECT_TARGET_ATTR, parseEnhancedDiaryBatchBlockAttrs } from "../enhancedDiaryProjectTypes";
import type { EnhancedDiaryProjectIndexPayload } from "../enhancedDiaryProjectTypes";
import {
    extractProjectWriteTargetErrorCode,
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

interface UpdateTaskFirstLineOptions {
    /** 未传表示 preserve：保持原有隐藏项目关系；传入表示 replace：按此目标更新隐藏项目关系 */
    projectTargetId?: string;
    rootProjectId?: string;
    projectPath?: string[];
}

function deriveRelationStatus(
    hiddenTargetId: string | undefined,
    visibleTargetId: string | undefined,
    previous: EnhancedDiaryWorkspaceTask,
): EnhancedDiaryWorkspaceTask["projectRelationStatus"] {
    const prevHidden = previous.hiddenProjectTargetId || "";
    const prevVisible = previous.visibleProjectTargetId || "";
    const prevStatus = previous.projectRelationStatus;
    if ((hiddenTargetId || "") === prevHidden && (visibleTargetId || "") === prevVisible) {
        return prevStatus;
    }
    if (!hiddenTargetId && !visibleTargetId) return "none";
    if (hiddenTargetId && visibleTargetId) return hiddenTargetId === visibleTargetId ? "normal" : "target_mismatch";
    if (hiddenTargetId) return "missing_visible_reference";
    return "missing_hidden_relation";
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
    const forceIndexRefresh = options.forceIndexRefresh === true || options.requireFreshIndex === true;
    const taskResult = await loadTaskData(plugin, { forceRefresh: forceIndexRefresh });
    if (options.requireFreshIndex && (taskResult.status === "error" || taskResult.status === "limited")) {
        throw new Error(taskResult.message || "任务索引刷新失败。");
    }
    const rows = taskResult.items;
    const projectIndex = options.projectIndex ?? await readEnhancedDiaryProjectIndex(config.projectStorage);
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
        const { isTodayTask, isOverdue, shouldMigrate } = deriveWorkspaceTaskScheduleFlags({
            startDate: parsed.parsed.startDate,
            deadline: parsed.parsed.deadline,
            completed,
            sourceKind,
            sourceDate,
            today: todayStr,
            migrationReminderDays: config.taskMigrationReminderDays,
        });
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
    projectIndex?: EnhancedDiaryProjectIndexPayload;
}

async function readTaskBlockMarkdown(task: EnhancedDiaryWorkspaceTask): Promise<string | null> {
    try {
        const block = await getBlockKramdown(task.blockId);
        return stripKramdownAttrs(block?.kramdown || "");
    } catch {
        return null;
    }
}

async function readTaskHiddenProjectTargetId(blockId: string): Promise<string | undefined> {
    const attrs = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs([blockId]))[blockId] || {};
    return attrs[ENHANCED_DIARY_PROJECT_TARGET_ATTR] || undefined;
}

async function updateTaskFirstLine(
    task: EnhancedDiaryWorkspaceTask,
    newFirstLine: string,
    options?: UpdateTaskFirstLineOptions,
): Promise<WorkspaceTaskActionResult> {
    if (!(await ensureTaskBlockExists(task.blockId))) {
        return {
            ok: false,
            reason: "missing_task",
            message: "任务块已删除，已清理索引。",
        };
    }

    const isReplaceMode = options && Object.prototype.hasOwnProperty.call(options, "projectTargetId");

    let currentAttrs: Record<string, string> = {};
    try {
        const rawAttrs = await batchGetBlockAttrs([task.blockId]);
        currentAttrs = parseEnhancedDiaryBatchBlockAttrs(rawAttrs)[task.blockId] || {};
    } catch {
        currentAttrs = {};
    }

    const realHiddenTargetId = currentAttrs[ENHANCED_DIARY_PROJECT_TARGET_ATTR] || task.hiddenProjectTargetId || "";
    const existingVisibleTargetId = task.visibleProjectTargetId || parseVisibleProjectTargetId(task.markdown);
    const newVisibleTargetId = parseVisibleProjectTargetId(newFirstLine);

    const targetHiddenTargetId = isReplaceMode ? (options.projectTargetId ?? "") : realHiddenTargetId;
    const visibleTargetId = isReplaceMode ? (newVisibleTargetId || undefined) : (newVisibleTargetId ?? existingVisibleTargetId);

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
    } catch {
        return {
            ok: false,
            reason: "update_failed",
            message: "更新任务失败，请稍后重试。",
        };
    }

    let partial = false;
    let message = "";
    let verifiedHiddenTargetId: string | undefined;

    if (isReplaceMode || targetHiddenTargetId) {
        try {
            await setBlockAttrsChecked(task.blockId, {
                [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: targetHiddenTargetId,
            });
            const actual = await readTaskHiddenProjectTargetId(task.blockId);
            if (targetHiddenTargetId) {
                if (actual !== targetHiddenTargetId) {
                    partial = true;
                    message = "任务正文已更新，但隐藏项目属性校验未通过。";
                }
                verifiedHiddenTargetId = actual;
            } else if (actual) {
                partial = true;
                message = "任务正文已更新，但隐藏项目属性清空未生效。";
                verifiedHiddenTargetId = actual;
            } else {
                verifiedHiddenTargetId = undefined;
            }
        } catch {
            try {
                const retry = await readTaskHiddenProjectTargetId(task.blockId);
                if (targetHiddenTargetId) {
                    if (retry !== targetHiddenTargetId) {
                        partial = true;
                        message = "任务正文已更新，但隐藏项目属性写入失败。";
                    }
                    verifiedHiddenTargetId = retry;
                } else if (retry) {
                    partial = true;
                    message = "任务正文已更新，但隐藏项目属性清空失败。";
                    verifiedHiddenTargetId = retry;
                } else {
                    verifiedHiddenTargetId = undefined;
                }
            } catch {
                partial = true;
                message = targetHiddenTargetId
                    ? "任务正文已更新，但隐藏项目属性写入失败。"
                    : "任务正文已更新，但隐藏项目属性清空失败。";
            }
        }
    }

    const fallbackHiddenTargetId = task.hiddenProjectTargetId || currentAttrs[ENHANCED_DIARY_PROJECT_TARGET_ATTR] || undefined;
    const finalHiddenTargetId = partial
        ? (verifiedHiddenTargetId ?? fallbackHiddenTargetId)
        : verifiedHiddenTargetId;

    const relationStatus = deriveRelationStatus(finalHiddenTargetId, visibleTargetId, task);

    let finalRootProjectId = task.rootProjectId;
    let finalProjectPath = task.projectPath;
    if (isReplaceMode) {
        if (finalHiddenTargetId === options.projectTargetId && options.rootProjectId) {
            finalRootProjectId = options.rootProjectId;
            finalProjectPath = options.projectPath;
        } else if (finalHiddenTargetId === task.hiddenProjectTargetId) {
            // 与更新前一致，保留原路径
        } else {
            finalRootProjectId = undefined;
            finalProjectPath = undefined;
        }
    }
    if (relationStatus === "none") {
        finalRootProjectId = undefined;
        finalProjectPath = undefined;
    }

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
            projectTargetId: finalHiddenTargetId || visibleTargetId || undefined,
            hiddenProjectTargetId: finalHiddenTargetId,
            visibleProjectTargetId: visibleTargetId,
            rootProjectId: finalRootProjectId,
            projectPath: finalProjectPath,
            projectRelationStatus: relationStatus,
        });
    } catch {
        partial = true;
        if (!message) message = "任务正文已更新，但任务索引同步失败。";
    }

    if (partial) {
        return {
            ok: true,
            changed: true,
            partial: true,
            reason: "project_relation_sync_partial",
            message: message || "任务正文已更新，但项目关系同步不完整。",
        };
    }

    return { ok: true, changed: true };
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
    partialCount: number;
    failedTasks: EnhancedDiaryWorkspaceTask[];
}

export async function completeWorkspaceTasksSequentially(
    tasks: EnhancedDiaryWorkspaceTask[],
): Promise<WorkspaceTaskBatchCompleteResult> {
    const targets = tasks.filter((task) => !task.completed);
    const failedTasks: EnhancedDiaryWorkspaceTask[] = [];
    let successCount = 0;
    let partialCount = 0;
    for (const task of targets) {
        try {
            const result = await toggleWorkspaceTaskComplete(task, true);
            if (result.ok) {
                successCount += 1;
                if (result.partial) partialCount += 1;
            } else {
                failedTasks.push(task);
            }
        } catch {
            failedTasks.push(task);
        }
    }
    return {
        total: targets.length,
        successCount,
        failedCount: failedTasks.length,
        partialCount,
        failedTasks,
    };
}

export interface UpdateWorkspaceTaskOptions {
    relationMode?: "auto" | "preserve" | "replace";
}

export async function updateWorkspaceTask(
    task: EnhancedDiaryWorkspaceTask,
    input: GenerateTasksPlusTaskInput,
    projectStorage?: EnhancedDiaryProjectStorageConfig,
    options: UpdateWorkspaceTaskOptions = {},
): Promise<WorkspaceTaskActionResult> {
    const mode = options.relationMode ?? "auto";
    const requestedProjectId = input.projectTargetId !== undefined ? input.projectTargetId : task.projectTargetId;
    const isReplace =
        mode === "replace" ||
        (mode === "auto" && (requestedProjectId || "") !== (task.projectTargetId || ""));

    let validatedInput = input;
    let replaceTarget: {
        id: string;
        title: string;
        rootProjectId: string;
        pathTitles: string[];
    } | null = null;

    if (isReplace && requestedProjectId) {
        if (!projectStorage) {
            return { ok: false, reason: "project_storage_unavailable", message: "无法确认项目状态，任务未更新。" };
        }
        try {
            const target = await validateEnhancedDiaryProjectWriteTarget(
                projectStorage,
                requestedProjectId,
                task.projectTargetId,
            );
            replaceTarget = target;
            validatedInput = { ...input, projectTargetId: target.id, projectTitle: target.title };
        } catch (reason) {
            return {
                ok: false,
                reason: extractProjectWriteTargetErrorCode(reason) ?? "project_index_unavailable",
                message: reason instanceof Error ? reason.message : "无法确认项目状态，任务未更新。",
            };
        }
    } else if (isReplace && !requestedProjectId) {
        validatedInput = { ...input, projectTargetId: "", projectTitle: undefined };
    }

    const effectiveProjectTargetId = isReplace ? (validatedInput.projectTargetId ?? "") : task.projectTargetId;
    const effectiveProjectTitle = isReplace
        ? validatedInput.projectTitle
        : (validatedInput.projectTitle ?? task.projectPath?.[task.projectPath.length - 1]);

    let newLine = "";
    try {
        newLine = generateTaskLine({
            ...validatedInput,
            completed: validatedInput.completed ?? task.completed,
            projectTargetId: effectiveProjectTargetId,
            projectTitle: effectiveProjectTitle,
        });
    } catch {
        return {
            ok: false,
            reason: "invalid_task",
            message: "任务名称不能为空。",
        };
    }

    const updateOptions: UpdateTaskFirstLineOptions | undefined = isReplace
        ? {
              projectTargetId: validatedInput.projectTargetId ?? "",
              rootProjectId: replaceTarget?.rootProjectId,
              projectPath: replaceTarget?.pathTitles,
          }
        : undefined;

    return updateTaskFirstLine(task, newLine, updateOptions);
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

async function resolveTaskSourceRootId(task: EnhancedDiaryWorkspaceTask): Promise<string | undefined> {
    try {
        const info = await getBlockInfo(task.blockId);
        const rootId = info?.rootID;
        return typeof rootId === "string" && rootId ? rootId : undefined;
    } catch {
        return task.rootId || task.sourceDocId || undefined;
    }
}

interface TaskMovePlacementObservation {
    moved: boolean;
    observedRootId?: string;
    observedParentId?: string;
    observedType?: string;
    observedParentType?: string;
    targetListParentId?: string;
    targetListParentType?: string;
    previousParentId?: string;
    previousParentType?: string;
}

interface TaskMigrationDiagnostics {
    taskBlockId: string;
    sourceRootId?: string;
    sourceParentId?: string;
    sourceParentType?: string;
    todayDocId?: string;
    migratedTasksHeadingId?: string;
    targetListId?: string;
    targetListParentId?: string;
    targetListParentType?: string;
    previousTaskItemId?: string;
    previousParentId?: string;
    previousParentType?: string;
    placeholderTaskItemId?: string;
    placeholderParentId?: string;
    observedRootId?: string;
    observedParentId?: string;
    stage: string;
    error?: unknown;
}

function describeTaskMigrationError(error: unknown): string {
    return error instanceof Error ? error.message : String(error || "unknown error");
}

function logTaskMigrationFailure(diagnostics: TaskMigrationDiagnostics): void {
    console.warn("[enhancedDiary:migrateTask]", {
        ...diagnostics,
        error: diagnostics.error === undefined ? undefined : describeTaskMigrationError(diagnostics.error),
    });
}

function treeInfoParentId(info?: SiyuanBlockTreeInfo): string | undefined {
    const parentId = info?.parentID;
    return typeof parentId === "string" && parentId ? parentId : undefined;
}

function treeInfoParentType(info?: SiyuanBlockTreeInfo): string | undefined {
    const parentType = info?.parentType;
    return typeof parentType === "string" && parentType ? parentType : undefined;
}

export function validateTaskMoveTargetShape(params: {
    sourceType: unknown;
    sourceRootId?: string;
    expectedSourceRootId: string;
    todayDocId: string;
    targetListId: string;
    targetListType: unknown;
    targetListParentId?: string;
    targetListParentType: unknown;
    previousTaskItemId: string;
    previousType: unknown;
    previousParentId?: string;
    previousParentType: unknown;
}): { ok: true } | { ok: false; reason: string } {
    if (!params.expectedSourceRootId || params.expectedSourceRootId === params.todayDocId) {
        return { ok: false, reason: "already_today" };
    }
    if (!params.targetListId || !params.previousTaskItemId) return { ok: false, reason: "target_structure_invalid" };
    if (!isEnhancedDiaryTaskListItemType(params.sourceType) || params.sourceRootId !== params.expectedSourceRootId) {
        return { ok: false, reason: "source_structure_invalid" };
    }
    return validateTaskListTreeShape({
        docId: params.todayDocId,
        targetListId: params.targetListId,
        targetListType: params.targetListType,
        targetListParentId: params.targetListParentId,
        targetListParentType: params.targetListParentType,
        previousTaskItemId: params.previousTaskItemId,
        previousType: params.previousType,
        previousParentId: params.previousParentId,
        previousParentType: params.previousParentType,
    });
}

type TaskMigrationStructureDetails = Pick<
    TaskMigrationDiagnostics,
    | "sourceParentId"
    | "sourceParentType"
    | "targetListParentId"
    | "targetListParentType"
    | "previousParentId"
    | "previousParentType"
    | "placeholderParentId"
>;

type TaskMoveTargetValidationResult = TaskMigrationStructureDetails & (
    { ok: true } | { ok: false; reason: string; error?: unknown }
);

async function validateTaskMoveTarget(params: {
    taskBlockId: string;
    sourceRootId: string;
    todayDocId: string;
    target: EnhancedDiaryTaskMoveTarget;
}): Promise<TaskMoveTargetValidationResult> {
    const { taskBlockId, sourceRootId, todayDocId, target } = params;
    if (!target.targetListId || !target.previousTaskItemId) {
        return { ok: false, reason: "target_structure_invalid" };
    }
    if (sourceRootId === todayDocId) return { ok: false, reason: "already_today" };
    try {
        const treeInfos = await getBlockTreeInfos(Array.from(new Set([
            taskBlockId,
            target.targetListId,
            target.previousTaskItemId,
        ])));
        const sourceInfo = treeInfos?.[taskBlockId];
        const targetListInfo = treeInfos?.[target.targetListId];
        const previousInfo = treeInfos?.[target.previousTaskItemId];
        const details: TaskMigrationStructureDetails = {
            sourceParentId: treeInfoParentId(sourceInfo),
            sourceParentType: treeInfoParentType(sourceInfo),
            targetListParentId: treeInfoParentId(targetListInfo),
            targetListParentType: treeInfoParentType(targetListInfo),
            previousParentId: treeInfoParentId(previousInfo),
            previousParentType: treeInfoParentType(previousInfo),
            placeholderParentId: target.placeholderTaskItemId ? target.targetListId : undefined,
        };
        let sourceBlockInfo: any;
        try {
            sourceBlockInfo = await getBlockInfo(taskBlockId);
        } catch (error) {
            return { ...details, ok: false, reason: "target_structure_read_failed", error };
        }
        const validation = validateTaskMoveTargetShape({
            sourceType: sourceInfo?.type,
            sourceRootId: sourceBlockInfo?.rootID,
            expectedSourceRootId: sourceRootId,
            todayDocId,
            targetListId: target.targetListId,
            targetListType: targetListInfo?.type,
            targetListParentId: treeInfoParentId(targetListInfo),
            targetListParentType: treeInfoParentType(targetListInfo),
            previousTaskItemId: target.previousTaskItemId,
            previousType: previousInfo?.type,
            previousParentId: treeInfoParentId(previousInfo),
            previousParentType: treeInfoParentType(previousInfo),
        });
        return { ...details, ...validation };
    } catch (error) {
        return { ok: false, reason: "target_structure_read_failed", error };
    }
}

async function verifyTaskMovePlacement(params: {
    blockId: string;
    todayDocId: string;
    targetListId: string;
    previousTaskItemId: string;
}): Promise<TaskMovePlacementObservation> {
    let observation: TaskMovePlacementObservation = { moved: false };
    for (const waitMs of [0, 100, 300] as const) {
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        try {
            if (!await checkBlockExist(params.blockId)) continue;
            const treeInfos = await getBlockTreeInfos(Array.from(new Set([
                params.blockId,
                params.targetListId,
                params.previousTaskItemId,
            ])));
            const taskInfo = treeInfos?.[params.blockId];
            const targetListInfo = treeInfos?.[params.targetListId];
            const previousInfo = treeInfos?.[params.previousTaskItemId];
            const taskBlockInfo = await getBlockInfo(params.blockId);
            const observedRootId = typeof taskBlockInfo?.rootID === "string" ? taskBlockInfo.rootID : undefined;
            const observedParentId = treeInfoParentId(taskInfo);
            observation = {
                moved: false,
                observedRootId,
                observedParentId,
                observedType: taskInfo?.type,
                observedParentType: treeInfoParentType(taskInfo),
                targetListParentId: treeInfoParentId(targetListInfo),
                targetListParentType: treeInfoParentType(targetListInfo),
                previousParentId: treeInfoParentId(previousInfo),
                previousParentType: treeInfoParentType(previousInfo),
            };
            if (isEnhancedDiaryTaskListItemType(taskInfo?.type) &&
                observedRootId === params.todayDocId &&
                observedParentId === params.targetListId &&
                isEnhancedDiaryListContainerType(targetListInfo?.type) &&
                treeInfoParentId(targetListInfo) === params.todayDocId &&
                isEnhancedDiaryDocumentType(treeInfoParentType(targetListInfo)) &&
                isEnhancedDiaryTaskListItemType(previousInfo?.type) &&
                treeInfoParentId(previousInfo) === params.targetListId &&
                isEnhancedDiaryListContainerType(treeInfoParentType(previousInfo))) {
                return { ...observation, moved: true };
            }
        } catch {
            // 移动后块树可能短暂不可读，只在有限窗口内继续确认。
        }
    }
    return observation;
}

export function normalizeMigrationRootIds(sourceRootId: string, targetRootId: string): string[] {
    return Array.from(new Set([sourceRootId, targetRootId].map((id) => id.trim()).filter(Boolean)));
}

export async function migrateWorkspaceTaskToToday(
    plugin: any,
    config: EnhancedDiaryConfig,
    task: EnhancedDiaryWorkspaceTask
): Promise<WorkspaceTaskActionResult> {
    if (!(await ensureTaskBlockExists(task.blockId))) {
        logTaskMigrationFailure({
            taskBlockId: task.blockId,
            sourceRootId: task.rootId || task.sourceDocId,
            stage: "ensure_task",
            error: "missing_task",
        });
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

    const sourceRootId = await resolveTaskSourceRootId(task);

    if (!sourceRootId) {
        logTaskMigrationFailure({
            taskBlockId: task.blockId,
            stage: "resolve_source_root",
            error: "source root unavailable",
        });
        return {
            ok: false,
            changed: false,
            reason: "source_root_missing",
            message: "无法确认任务所在的原日记，迁移已取消。",
        };
    }

    const todayDoc = await getOrCreateTodayDiaryDocument(plugin, config);
    if (!todayDoc.ok || !todayDoc.docId) {
        logTaskMigrationFailure({
            taskBlockId: task.blockId,
            sourceRootId,
            stage: "resolve_today_doc",
            error: todayDoc.reason || "today document unavailable",
        });
        return {
            ok: false,
            changed: false,
            reason: todayDoc.reason || "today_doc_failed",
            message: "未能打开或创建今日日记，迁移已取消。",
        };
    }
    if (sourceRootId === todayDoc.docId) {
        return {
            ok: false,
            changed: false,
            reason: "already_today",
            message: "该任务已经在今日日记中，无需迁移。",
        };
    }

    let sourceParentId: string | undefined;
    let sourceParentType: string | undefined;
    try {
        const sourceTreeInfo = (await getBlockTreeInfos([task.blockId]))?.[task.blockId];
        sourceParentId = treeInfoParentId(sourceTreeInfo);
        sourceParentType = treeInfoParentType(sourceTreeInfo);
    } catch {
        // 仅用于失败诊断，不能让一次只读诊断失败阻止迁移保护继续工作。
    }

    let target: EnhancedDiaryTaskMoveTarget | undefined;
    let targetDetails: TaskMigrationStructureDetails = {};
    let coreMoveSucceeded = false;
    let placeholderCleanupFailed = false;
    let placement: TaskMovePlacementObservation = { moved: false };
    const logMigrationFailure = (stage: string, error: unknown): void => {
        logTaskMigrationFailure({
            taskBlockId: task.blockId,
            sourceRootId,
            sourceParentId: sourceParentId || targetDetails.sourceParentId,
            sourceParentType: sourceParentType || targetDetails.sourceParentType,
            todayDocId: todayDoc.docId,
            migratedTasksHeadingId: target?.headingId,
            targetListId: target?.targetListId,
            targetListParentId: targetDetails.targetListParentId,
            targetListParentType: targetDetails.targetListParentType,
            previousTaskItemId: target?.previousTaskItemId,
            previousParentId: targetDetails.previousParentId,
            previousParentType: targetDetails.previousParentType,
            placeholderTaskItemId: target?.placeholderTaskItemId,
            placeholderParentId: targetDetails.placeholderParentId ||
                (target?.placeholderTaskItemId ? target.targetListId : undefined),
            observedRootId: placement.observedRootId,
            observedParentId: placement.observedParentId,
            stage,
            error,
        });
    };

    try {
        target = await resolveDayWorkspaceTaskMoveTarget({
            docId: todayDoc.docId,
            headingStructure: config.headingStructure,
            mapping: config.templateFieldMapping,
        });
        if (!target.ok) {
            logMigrationFailure("resolve_target", target.error || target.reason);
            return {
                ok: false,
                changed: false,
                reason: target.reason || "target_structure_invalid",
                message: target.reason === "missing_heading"
                    ? "当前日记缺少「任务管理 > 迁移任务」区块，请补充模板或恢复标题。"
                    : "迁移任务区域结构异常，已取消迁移。",
            };
        }

        const preflight = await validateTaskMoveTarget({
            taskBlockId: task.blockId,
            sourceRootId,
            todayDocId: todayDoc.docId,
            target,
        });
        targetDetails = {
            sourceParentId: preflight.sourceParentId ?? targetDetails.sourceParentId,
            sourceParentType: preflight.sourceParentType ?? targetDetails.sourceParentType,
            targetListParentId: preflight.targetListParentId ?? targetDetails.targetListParentId,
            targetListParentType: preflight.targetListParentType ?? targetDetails.targetListParentType,
            previousParentId: preflight.previousParentId ?? targetDetails.previousParentId,
            previousParentType: preflight.previousParentType ?? targetDetails.previousParentType,
            placeholderParentId: preflight.placeholderParentId ?? targetDetails.placeholderParentId,
        };
        if (preflight.ok === false) {
            logMigrationFailure("preflight", preflight.error || preflight.reason);
            return {
                ok: false,
                changed: false,
                reason: preflight.reason,
                message: "迁移任务区域结构异常，已取消迁移。",
            };
        }

        try {
            await moveBlockChecked(task.blockId, target.previousTaskItemId, target.targetListId);
        } catch (error) {
            logMigrationFailure("move", error);
            return {
                ok: false,
                changed: false,
                reason: "move_failed",
                message: "移动任务失败，原任务已保留。",
            };
        }

        placement = await verifyTaskMovePlacement({
            blockId: task.blockId,
            todayDocId: todayDoc.docId,
            targetListId: target.targetListId,
            previousTaskItemId: target.previousTaskItemId,
        });
        if (!placement.moved) {
            targetDetails = {
                ...targetDetails,
                targetListParentId: placement.targetListParentId ?? targetDetails.targetListParentId,
                targetListParentType: placement.targetListParentType ?? targetDetails.targetListParentType,
                previousParentId: placement.previousParentId ?? targetDetails.previousParentId,
                previousParentType: placement.previousParentType ?? targetDetails.previousParentType,
            };
            logMigrationFailure("move_verify", "task placement verification failed");
            return {
                ok: false,
                changed: Boolean(placement.observedRootId && placement.observedRootId !== sourceRootId),
                reason: "move_verify_failed",
                message: "任务移动后未能确认其位于今日日记的任务列表中，未继续写入迁移记录。",
            };
        }
        coreMoveSucceeded = true;
    } catch (error) {
        logMigrationFailure("migration_core", error);
        return {
            ok: false,
            changed: false,
            reason: "migration_core_failed",
            message: "任务迁移核心步骤失败，原任务已保留。",
        };
    } finally {
        if (target?.placeholderTaskItemId) {
            placeholderCleanupFailed = !await deleteTaskMovePlaceholder(target.placeholderTaskItemId);
            if (placeholderCleanupFailed) {
                logMigrationFailure("placeholder_cleanup", "placeholder deletion failed");
            }
        }
    }

    if (!coreMoveSucceeded || !target?.targetListId || !target.previousTaskItemId) {
        return {
            ok: false,
            changed: false,
            reason: "migration_core_failed",
            message: "任务迁移核心步骤失败，原任务已保留。",
        };
    }

    const partialMessages: string[] = [];
    if (placeholderCleanupFailed) partialMessages.push("临时迁移锚点清理失败，请检查今日日记");
    try {
        await appendBlockChecked(
            "markdown",
            `- 迁移来源：${buildSourceLink(task)}\n- 迁移时间：${formatNowTime()}`,
            task.blockId
        );
    } catch (error) {
        partialMessages.push("迁移来源记录写入失败");
        logMigrationFailure("append_provenance", error);
    }

    try {
        const logResult = await appendMarkdownToDaySection({
            docId: todayDoc.docId,
            sectionKey: "taskLog",
            markdown: `- 迁移任务：${task.taskname}，从 ${task.sourceDate || task.sourceDocTitle || "旧日记"} 迁移到今天`,
            headingStructure: config.headingStructure,
            mapping: config.templateFieldMapping,
        });
        if (!logResult.ok) {
            partialMessages.push("任务日志写入失败");
            logMigrationFailure("append_task_log", logResult.reason || "task log insert failed");
        }
    } catch (error) {
        partialMessages.push("任务日志写入失败");
        logMigrationFailure("append_task_log", error);
    }

    try {
        const indexResult = await refreshTaskIndexByRootIds(
            normalizeMigrationRootIds(sourceRootId, todayDoc.docId),
            plugin,
        );
        if (indexResult.lastStatus !== "success") {
            partialMessages.push("任务索引同步失败，请刷新后检查");
            logMigrationFailure("refresh_task_index", indexResult.lastMessage || indexResult.lastStatus);
        }
    } catch (error) {
        partialMessages.push("任务索引同步失败，请刷新后检查");
        logMigrationFailure("refresh_task_index", error);
    }

    if (partialMessages.length > 0) {
        return {
            ok: true,
            changed: true,
            partial: true,
            reason: "post_move_partial",
            message: `任务已迁移，但${partialMessages.join("；")}。`,
        };
    }
    return { ok: true, changed: true };
}
