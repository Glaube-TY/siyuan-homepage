import { loadEnhancedDiaryConfig } from "../enhancedDiaryConfig";
import { initializeEnhancedDiaryIndex } from "../enhancedDiaryIndex";
import { getDiaryDocumentForDate, setEnhancedDiaryIndexNotebook, type EnhancedDiaryDocumentInfo } from "../enhancedDiaryDoc";
import { formatDiaryDate } from "../enhancedDiaryUtils";
import { buildEnhancedDiaryWorkspaceSummary, type EnhancedDiaryWorkspaceSummary } from "../enhancedDiaryWorkspaceSummary";
import {
    queryWorkspaceTasks,
    type EnhancedDiaryWorkspaceTask,
} from "./enhancedDiaryWorkspaceTaskService";
import {
    queryTodayQuickRecords,
    queryQuickRecordsInDateRange,
    type EnhancedDiaryWorkspaceRecord,
} from "./enhancedDiaryWorkspaceRecordService";
import {
    buildWorkspaceReviewCards,
    type EnhancedDiaryWorkspaceReviewCard,
} from "./enhancedDiaryWorkspaceViewModel";
import {
    buildWorkspaceReviewHistory,
    type EnhancedDiaryWorkspaceReviewHistoryItem,
} from "./enhancedDiaryWorkspaceReviewHistory";
import {
    buildWorkspaceNotifications,
    type EnhancedDiaryWorkspaceNotification,
} from "./enhancedDiaryWorkspaceNotifications";
import {
    buildWorkspaceCarryoverPlans,
    type EnhancedDiaryCarryoverItem,
} from "./enhancedDiaryWorkspaceCarryover";
import { daysBetweenLocalDates } from "./enhancedDiaryWorkspaceDate";
import type { EnhancedDiaryConfig } from "../enhancedDiaryTypes";
import { isEnhancedDiaryProjectActiveBranch, readEnhancedDiaryProjectIndex, refreshEnhancedDiaryProjectIndex } from "../enhancedDiaryProjectIndex";
import type { EnhancedDiaryProjectIndexPayload } from "../enhancedDiaryProjectTypes";
import type { EnhancedDiaryProjectLifecycleStatus } from "../enhancedDiaryProjectTypes";
import { readEnhancedDiaryProjectRecordIndex, refreshEnhancedDiaryProjectRecordIndex, type EnhancedDiaryProjectRecordIndexItem } from "../enhancedDiaryProjectRecordIndex";
import { isEnhancedDiaryTaskManagementEnabled } from "../enhancedDiaryTemplateFieldMapping";

export type EnhancedDiaryProjectHealthStatus =
    | "healthy"
    | "stale"
    | "pileup"
    | "overdue"
    | "idle"
    | "done";

export type EnhancedDiaryProjectHealthTone = "success" | "warning" | "danger" | "normal";

export interface EnhancedDiaryWorkspaceProject {
    targetId: string;
    rootProjectId: string;
    name: string;
    path: string[];
    level: number;
    parentTargetId?: string;
    childTargetIds: string[];
    directTaskCount: number;
    taskCount: number;
    openTaskCount: number;
    todayTaskCount: number;
    overdueTaskCount: number;
    lastActivityDate: string;
    inactiveDays: number | null;
    healthStatus: EnhancedDiaryProjectHealthStatus;
    healthLabel: string;
    healthTone: EnhancedDiaryProjectHealthTone;
    progressMarkdown?: string;
    hasTodayProgress: boolean;
    directRecordCount: number;
    recordCount: number;
    keyRecordCount: number;
    contentSummaryStatus: "not_loaded" | "available";
    status: EnhancedDiaryProjectLifecycleStatus;
    archivedAt: string;
}

export interface EnhancedDiaryWorkspaceState {
    today: string;
    date: Date;
    config: EnhancedDiaryConfig;
    todayDiary?: EnhancedDiaryDocumentInfo;
    todayDiaryExists: boolean;
    templateValid: boolean;
    missingSections: string[];
    summary: EnhancedDiaryWorkspaceSummary;
    tasks: EnhancedDiaryWorkspaceTask[];
    records: EnhancedDiaryWorkspaceRecord[];
    historyRecords: EnhancedDiaryWorkspaceRecord[];
    projects: EnhancedDiaryWorkspaceProject[];
    projectTargets: EnhancedDiaryWorkspaceProject[];
    projectIndex: EnhancedDiaryProjectIndexPayload;
    notifications: EnhancedDiaryWorkspaceNotification[];
    reviewCards: EnhancedDiaryWorkspaceReviewCard[];
    reviewHistory: EnhancedDiaryWorkspaceReviewHistoryItem[];
    carryoverPlans: EnhancedDiaryCarryoverItem[];
}

const EMPTY_SUMMARY: EnhancedDiaryWorkspaceSummary = {
    templateValid: false,
    missing: ["# 今日日记"],
    newTaskCount: 0,
    migratedTaskCount: 0,
    quickRecordCount: 0,
    projectCount: 0,
};

function buildProjectSummary(
    index: EnhancedDiaryProjectIndexPayload,
    tasks: EnhancedDiaryWorkspaceTask[],
    records: EnhancedDiaryProjectRecordIndexItem[],
    today: string,
): EnhancedDiaryWorkspaceProject[] {
    const targets = [
        ...Object.values(index.roots).map((root) => ({ id: root.id, rootId: root.id, title: root.title, path: [root.title], level: 0, parentId: undefined as string | undefined, order: root.order, status: root.status, archivedAt: root.archivedAt })),
        ...Object.values(index.nodes).map((node) => {
            const ancestorTitles = node.ancestorTargetIds.map((id) => index.roots[id]?.title || index.nodes[id]?.title).filter(Boolean);
            return { id: node.id, rootId: node.rootProjectId, title: node.title, path: [...ancestorTitles, node.title], level: node.level, parentId: node.parentTargetId, order: node.order, status: node.status, archivedAt: node.archivedAt };
        }),
    ];
    return targets.sort((a, b) => a.level - b.level || a.order - b.order).map((target) => {
        const targetTasksAll = tasks.filter((task) => task.projectTargetId === target.id || task.projectAncestorTargetIds?.includes(target.id));
        const targetTasks = target.status === "archived" ? targetTasksAll : targetTasksAll.filter((task) =>
            isEnhancedDiaryProjectActiveBranch(index, task.projectTargetId, target.id),
        );
        const directTasks = targetTasks.filter((task) => task.projectTargetId === target.id);
        const targetRecordsAll = records.filter((record) => record.projectTargetId === target.id || index.nodes[record.projectTargetId]?.ancestorTargetIds.includes(target.id));
        const targetRecords = target.status === "archived" ? targetRecordsAll : targetRecordsAll.filter((record) =>
            isEnhancedDiaryProjectActiveBranch(index, record.projectTargetId, target.id),
        );
        const directRecords = targetRecords.filter((record) => record.projectTargetId === target.id);
        const dates = [
            ...targetTasks.map((task) => task.sourceDate || task.startDate || task.deadline || ""),
            ...targetRecords.map((record) => record.date),
        ].filter(Boolean).sort();
        const lastActivityDate = dates[dates.length - 1] || "";
        const inactiveDays = target.status === "archived" ? null : lastActivityDate ? Math.max(0, daysBetweenLocalDates(lastActivityDate, today)) : null;
        const overdueTaskCount = target.status === "archived" ? 0 : targetTasks.filter((task) => task.isOverdue).length;
        const openTaskCount = targetTasks.filter((task) => !task.completed).length;
        const hasTodayProgress = target.status === "active" && (targetTasks.some((task) => task.isTodayTask) || targetRecords.some((record) => record.date === today));
        const health = target.status === "archived"
            ? { healthStatus: "done" as const, healthLabel: "已归档", healthTone: "normal" as const }
            : overdueTaskCount > 0
            ? { healthStatus: "overdue" as const, healthLabel: "存在逾期", healthTone: "danger" as const }
            : openTaskCount > 0 && (inactiveDays == null || inactiveDays >= 14)
                ? { healthStatus: "idle" as const, healthLabel: "长期无活动", healthTone: "warning" as const }
                : targetTasks.length > 0 && openTaskCount === 0
                    ? { healthStatus: "done" as const, healthLabel: "任务完成", healthTone: "success" as const }
                    : { healthStatus: "healthy" as const, healthLabel: "正常", healthTone: "success" as const };
        return {
            targetId: target.id, rootProjectId: target.rootId, name: target.title, path: target.path, level: target.level, parentTargetId: target.parentId,
            childTargetIds: Object.values(index.nodes).filter((node) => node.parentTargetId === target.id).map((node) => node.id),
            directTaskCount: directTasks.length, taskCount: targetTasks.length, openTaskCount,
            todayTaskCount: target.status === "archived" ? 0 : targetTasks.filter((task) => task.isTodayTask).length, overdueTaskCount,
            lastActivityDate, inactiveDays, ...health, hasTodayProgress,
            directRecordCount: directRecords.length, recordCount: targetRecords.length,
            keyRecordCount: targetRecords.filter((record) => record.isKeyRecord).length,
            contentSummaryStatus: "not_loaded" as const,
            status: target.status, archivedAt: target.archivedAt,
        };
    });
}

export async function loadEnhancedDiaryWorkspaceState(
    plugin: any,
    options: { date?: Date } = {}
): Promise<EnhancedDiaryWorkspaceState> {
    const date = options.date || new Date();
    const today = formatDiaryDate(date);
    const config = await loadEnhancedDiaryConfig(plugin);
    setEnhancedDiaryIndexNotebook(config.dailyNotebookId);
    if (config.dailyNotebookId) await initializeEnhancedDiaryIndex(config.dailyNotebookId);
    const taskManagementEnabled = isEnhancedDiaryTaskManagementEnabled(config);
    const todayDiary = await getDiaryDocumentForDate(date);
    const summary = todayDiary
        ? buildEnhancedDiaryWorkspaceSummary(
              todayDiary.content,
              config.headingStructure,
              config.templateFieldMapping,
              taskManagementEnabled,
          )
        : EMPTY_SUMMARY;
    const tasks = taskManagementEnabled ? await queryWorkspaceTasks(config, date, plugin) : [];
    const records = todayDiary
        ? await queryTodayQuickRecords(
            todayDiary.id,
            todayDiary.content,
            today,
            config.headingStructure,
            config.templateFieldMapping,
            config,
        )
        : [];
    for (const record of records) {
        record.date = today;
        record.docTitle = todayDiary?.title || today;
    }
    const projectStorageReady = config.projectStorage.mode === "notebook"
        ? Boolean(config.projectStorage.notebookId)
        : Boolean(config.projectStorage.parentDocId);
    if (projectStorageReady) await refreshEnhancedDiaryProjectIndex(config.projectStorage);
    if (config.dailyNotebookId) await refreshEnhancedDiaryProjectRecordIndex(config);
    const projectIndex = await readEnhancedDiaryProjectIndex(config.projectStorage);
    const projectRecordIndex = config.dailyNotebookId
        ? await readEnhancedDiaryProjectRecordIndex(config.dailyNotebookId)
        : { items: {} };
    const projectTargets = buildProjectSummary(projectIndex, tasks, Object.values(projectRecordIndex.items), today);
    const projects = projectTargets.filter((project) => project.level === 0 && project.status === "active");
    summary.projectCount = projects.length;
    const reviewCards = await buildWorkspaceReviewCards(config, date);
    const notifications = buildWorkspaceNotifications({
        tasks,
        templateValid: summary.templateValid,
        missingSections: summary.missing,
        todayDocId: todayDiary?.id,
        reviewCards,
        taskManagementEnabled,
        records,
        projectIndexComplete: projectIndex.complete,
        projectRecordIndexComplete: "complete" in projectRecordIndex ? projectRecordIndex.complete : false,
    });
    let carryoverPlans: EnhancedDiaryCarryoverItem[] = [];
    try {
        carryoverPlans = await buildWorkspaceCarryoverPlans(config, date);
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceData] build carryover plans failed", err);
    }

    return {
        today,
        date,
        config,
        todayDiary,
        todayDiaryExists: !!todayDiary,
        templateValid: summary.templateValid,
        missingSections: summary.missing,
        summary,
        tasks,
        records,
        historyRecords: [],
        projects,
        projectTargets,
        projectIndex,
        notifications,
        reviewCards,
        reviewHistory: [],
        carryoverPlans,
    };
}

export async function loadWorkspaceHistoryRecords(
    date: Date = new Date(),
    config?: EnhancedDiaryConfig
): Promise<EnhancedDiaryWorkspaceRecord[]> {
    if (!config) {
        return [];
    }

    const historyStart = new Date(date);
    historyStart.setDate(historyStart.getDate() - 89);
    try {
        return await queryQuickRecordsInDateRange({
            startDate: historyStart,
            endDate: date,
            includeToday: true,
            config,
        });
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceData] query history records failed", err);
        return [];
    }
}

export async function loadWorkspaceReviewHistory(
    config: EnhancedDiaryConfig,
    date: Date = new Date()
): Promise<EnhancedDiaryWorkspaceReviewHistoryItem[]> {
    try {
        return await buildWorkspaceReviewHistory(config, date);
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceData] build review history failed", err);
        return [];
    }
}
