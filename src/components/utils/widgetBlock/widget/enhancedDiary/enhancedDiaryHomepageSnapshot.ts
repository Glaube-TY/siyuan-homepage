import {
    readTaskIndexSnapshot,
    type ComponentTaskInfo,
} from "@/components/tools/siyuanComponentDataApi";
import {
    extractTaskTags,
    isTaskCompleted,
    parseTaskLine,
} from "@/features/task-data/task-parser";
import { isValidLocalDateString } from "./workspace/enhancedDiaryWorkspaceDate";
import {
    deriveWorkspaceTaskScheduleFlags,
} from "./workspace/enhancedDiaryWorkspaceTaskModel";
import {
    selectOverviewFocusTasks,
} from "./workspace/enhancedDiaryWorkspaceOverview";
import type { EnhancedDiaryWorkspaceTask } from "./workspace/enhancedDiaryWorkspaceTaskService";
import {
    formatDiaryDate,
    isEnhancedDiarySystemTaskMarkdown,
} from "./enhancedDiaryUtils";
import {
    lookupDiaryDocumentForDate,
    type DiaryDocumentLookupResult,
} from "./enhancedDiaryDoc";
import {
    buildEnhancedDiaryWorkspaceSummary,
} from "./enhancedDiaryWorkspaceSummary";
import {
    readEnhancedDiaryProjectIndex,
} from "./enhancedDiaryProjectIndex";
import type { EnhancedDiaryProjectIndexPayload } from "./enhancedDiaryProjectTypes";
import {
    isEnhancedDiaryProjectStorageReady,
    type EnhancedDiaryConfig,
} from "./enhancedDiaryTypes";
import type { EnhancedDiaryProjectRelationStatus } from "./enhancedDiaryProjectTypes";

export type EnhancedDiaryHomepageDiaryStatus = "exists" | "missing" | "unreadable";

export interface EnhancedDiaryHomepageSnapshot {
    today: string;
    todayDiaryStatus: EnhancedDiaryHomepageDiaryStatus;
    templateValid: boolean;
    missingSections: string[];
    todayTaskCount: number | null;
    completedTodayTaskCount: number | null;
    pendingTaskCount: number | null;
    overdueTaskCount: number | null;
    quickRecordCount: number | null;
    activeProjectCount: number | null;
    projectIndexComplete: boolean;
    projectStorageConfigured: boolean;
    taskIndexAvailable: boolean;
    focusTasks: EnhancedDiaryWorkspaceTask[];
    warnings: string[];
}

function firstTaskLine(markdown: string): string {
    return ((markdown || "").split("\n\n")[0]?.split("\n")[0] || "")
        .replace(/\s*\{:.*?\}\s*$/g, "")
        .trim();
}

function parseDateFromPath(value: string | undefined): string | undefined {
    const text = String(value || "");
    const compact = text.match(/custom-dailynote-(\d{8})/i);
    if (compact) {
        const date = `${compact[1].slice(0, 4)}-${compact[1].slice(4, 6)}-${compact[1].slice(6, 8)}`;
        return isValidLocalDateString(date) ? date : undefined;
    }

    const separated = text.match(/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/);
    if (!separated) return undefined;
    const date = `${separated[1]}-${separated[2]}-${separated[3]}`;
    return isValidLocalDateString(date) ? date : undefined;
}

function inferSourceDate(row: ComponentTaskInfo): string | undefined {
    return parseDateFromPath(row.hpath) || parseDateFromPath(row.path);
}

function normalizeRelationStatus(value: string | undefined): EnhancedDiaryProjectRelationStatus {
    const statuses: EnhancedDiaryProjectRelationStatus[] = [
        "none",
        "normal",
        "missing_visible_reference",
        "missing_hidden_relation",
        "target_mismatch",
        "invalid_target",
    ];
    return statuses.includes(value as EnhancedDiaryProjectRelationStatus)
        ? value as EnhancedDiaryProjectRelationStatus
        : "none";
}

function mapTaskIndexRow(
    row: ComponentTaskInfo,
    today: string,
    todayDocId: string | undefined,
    migrationReminderDays: number,
): EnhancedDiaryWorkspaceTask | null {
    const markdown = firstTaskLine(row.markdown || row.content || "");
    const parsed = parseTaskLine(markdown);
    if (!parsed.taskCheck || !parsed.taskname.trim() || isEnhancedDiarySystemTaskMarkdown(markdown)) {
        return null;
    }

    const rootId = row.root_id || row.rootID || undefined;
    const sourceKind = todayDocId && rootId === todayDocId ? "new" : "normal";
    const sourceDate = sourceKind === "new" ? today : inferSourceDate(row);
    const completed = isTaskCompleted(parsed.taskCheck);
    const { isTodayTask, isOverdue, shouldMigrate } = deriveWorkspaceTaskScheduleFlags({
        startDate: parsed.parsed.startDate,
        deadline: parsed.parsed.deadline,
        completed,
        sourceKind,
        sourceDate,
        today,
        migrationReminderDays,
    });

    return {
        id: row.id,
        blockId: row.id,
        rootId,
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
        sourceDocId: rootId,
        sourceDocTitle: "",
        isTodayTask,
        isOverdue,
        shouldMigrate,
        projectTargetId: row.projectTargetId,
        hiddenProjectTargetId: row.hiddenProjectTargetId,
        visibleProjectTargetId: row.visibleProjectTargetId,
        rootProjectId: row.rootProjectId,
        projectPath: row.projectPath,
        projectRelationStatus: normalizeRelationStatus(row.projectRelationStatus),
    };
}

function createEmptySnapshot(today: string): EnhancedDiaryHomepageSnapshot {
    return {
        today,
        todayDiaryStatus: "missing",
        templateValid: false,
        missingSections: [],
        todayTaskCount: null,
        completedTodayTaskCount: null,
        pendingTaskCount: null,
        overdueTaskCount: null,
        quickRecordCount: 0,
        activeProjectCount: null,
        projectIndexComplete: true,
        projectStorageConfigured: false,
        taskIndexAvailable: false,
        focusTasks: [],
        warnings: [],
    };
}

async function readTodayDiary(
    todayDate: Date,
    notebookId: string | undefined,
): Promise<DiaryDocumentLookupResult> {
    try {
        return await lookupDiaryDocumentForDate(todayDate, notebookId);
    } catch (error) {
        console.warn("[enhancedDiaryHomepageSnapshot] read today diary failed", error);
        return { status: "unreadable", docId: "" };
    }
}

export async function loadEnhancedDiaryHomepageSnapshot(
    config: EnhancedDiaryConfig,
    todayDate: Date = new Date(),
): Promise<EnhancedDiaryHomepageSnapshot> {
    const today = formatDiaryDate(todayDate);
    const snapshot = createEmptySnapshot(today);
    const projectStorageConfigured = isEnhancedDiaryProjectStorageReady(config.projectStorage);
    snapshot.projectStorageConfigured = projectStorageConfigured;

    const [diaryResult, taskResult, projectResult] = await Promise.allSettled([
        readTodayDiary(todayDate, config.dailyNotebookId),
        readTaskIndexSnapshot(),
        projectStorageConfigured
            ? readEnhancedDiaryProjectIndex(config.projectStorage)
            : Promise.resolve(null),
    ]);

    let todayDocId: string | undefined;
    if (diaryResult.status === "fulfilled") {
        const lookup = diaryResult.value;
        snapshot.todayDiaryStatus = lookup.status;
        if (lookup.status === "exists") {
            todayDocId = lookup.doc.id;
            try {
                const summary = buildEnhancedDiaryWorkspaceSummary(
                    lookup.doc.content,
                    config.headingStructure,
                    config.templateFieldMapping,
                    config.workspaceSettings.modules.taskManagementEnabled,
                );
                snapshot.templateValid = summary.templateValid;
                snapshot.missingSections = summary.missing;
                snapshot.quickRecordCount = summary.quickRecordCount;
            } catch (error) {
                console.warn("[enhancedDiaryHomepageSnapshot] build today summary failed", error);
                snapshot.quickRecordCount = null;
                snapshot.warnings.push("今日日记摘要读取失败");
            }
        } else if (lookup.status === "unreadable") {
            snapshot.quickRecordCount = null;
        }
    } else {
        snapshot.todayDiaryStatus = "unreadable";
        snapshot.quickRecordCount = null;
        snapshot.warnings.push("今日日记读取失败");
    }

    let tasks: EnhancedDiaryWorkspaceTask[] = [];
    if (taskResult.status === "fulfilled" && taskResult.value.fileExists) {
        try {
            tasks = taskResult.value.items
                .map((row) => mapTaskIndexRow(row, today, todayDocId, config.taskMigrationReminderDays))
                .filter((task): task is EnhancedDiaryWorkspaceTask => !!task);
            snapshot.taskIndexAvailable = true;
            const todayTasks = tasks.filter((task) => task.isTodayTask);
            snapshot.todayTaskCount = todayTasks.length;
            snapshot.completedTodayTaskCount = todayTasks.filter((task) => task.completed).length;
            snapshot.pendingTaskCount = todayTasks.filter((task) => !task.completed).length;
            snapshot.overdueTaskCount = tasks.filter((task) => task.isOverdue).length;
            snapshot.focusTasks = selectOverviewFocusTasks(tasks, 3);
        } catch (error) {
            console.warn("[enhancedDiaryHomepageSnapshot] map task index failed", error);
            snapshot.warnings.push("任务索引读取失败");
        }
    } else {
        snapshot.warnings.push(taskResult.status === "rejected" ? "任务索引读取失败" : "任务索引尚未建立");
    }

    const projectIndex = projectResult.status === "fulfilled"
        ? projectResult.value as EnhancedDiaryProjectIndexPayload | null
        : null;
    if (projectIndex) {
        try {
            snapshot.projectIndexComplete = projectIndex.complete;
            snapshot.activeProjectCount = projectIndex.complete
                ? Object.values(projectIndex.roots).filter((root) => root.status === "active").length
                : null;
            if (!projectIndex.complete) snapshot.warnings.push("项目索引需检查");
        } catch (error) {
            console.warn("[enhancedDiaryHomepageSnapshot] read project index failed", error);
            snapshot.projectIndexComplete = false;
            snapshot.activeProjectCount = null;
            snapshot.warnings.push("项目索引需检查");
        }
    } else if (projectStorageConfigured) {
        snapshot.projectIndexComplete = false;
        snapshot.warnings.push("项目索引需检查");
    }

    return snapshot;
}
