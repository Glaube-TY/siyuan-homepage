import { loadEnhancedDiaryConfig } from "../enhancedDiaryConfig";
import { getDiaryDocumentForDate, type EnhancedDiaryDocumentInfo } from "../enhancedDiaryDoc";
import { formatDiaryDate } from "../enhancedDiaryUtils";
import { buildEnhancedDiaryWorkspaceSummary, type EnhancedDiaryWorkspaceSummary } from "../enhancedDiaryWorkspaceSummary";
import {
    getDayWorkspaceSections,
} from "../enhancedDiaryWorkspaceSections";
import {
    parseMarkdownHeadingTree,
    getSectionMarkdown,
    type EnhancedDiaryHeadingNode,
} from "../enhancedDiaryMarkdownSections";
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

export type EnhancedDiaryProjectHealthStatus =
    | "healthy"
    | "stale"
    | "pileup"
    | "overdue"
    | "idle"
    | "done";

export type EnhancedDiaryProjectHealthTone = "success" | "warning" | "danger" | "normal";

export interface EnhancedDiaryWorkspaceProject {
    name: string;
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

function parseTodayProjectProgress(markdown?: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!markdown) return map;

    const sections = getDayWorkspaceSections(markdown);
    if (!sections.projectProgress.found || !sections.projectProgress.node) return map;

    const ppNode = sections.projectProgress.node;
    const sectionMd = sections.projectProgress.markdown;
    if (!sectionMd.trim()) return map;

    const roots = parseMarkdownHeadingTree(sectionMd);
    // Find project headings: preferred ppNode.level + 1, fallback deeper
    const preferredLevel = ppNode.level + 1;
    const projectNodes: EnhancedDiaryHeadingNode[] = [];

    // Pass 1: exact preferred level
    for (const node of roots) {
        if (node.level === preferredLevel) {
            projectNodes.push(node);
        }
    }

    // Pass 2: fallback deeper (skip if we already found preferred-level nodes)
    if (projectNodes.length === 0) {
        for (const node of roots) {
            if (node.level > preferredLevel) {
                projectNodes.push(node);
            }
        }
    }

    for (const node of projectNodes) {
        const content = getSectionMarkdown(sectionMd, node).trim();
        map.set(node.title, content);
    }

    return map;
}

function buildProjectSummary(
    tasks: EnhancedDiaryWorkspaceTask[],
    todayMarkdown: string | undefined,
    today: string
): EnhancedDiaryWorkspaceProject[] {
    const map = new Map<string, EnhancedDiaryWorkspaceProject>();
    const progressMap = parseTodayProjectProgress(todayMarkdown);

    function getLatestTaskDate(projectTasks: EnhancedDiaryWorkspaceTask[]): string {
        return projectTasks
            .map((task) => task.sourceDate || task.startDate || task.deadline || "")
            .filter(Boolean)
            .sort()
            .slice(-1)[0] || "";
    }

    function resolveHealth(project: EnhancedDiaryWorkspaceProject): Pick<
        EnhancedDiaryWorkspaceProject,
        "healthStatus" | "healthLabel" | "healthTone"
    > {
        if (project.overdueTaskCount > 0) {
            return { healthStatus: "overdue", healthLabel: "存在逾期", healthTone: "danger" };
        }
        if (project.openTaskCount >= 5) {
            return { healthStatus: "pileup", healthLabel: "任务堆积", healthTone: "warning" };
        }
        if (project.openTaskCount > 0 && (project.inactiveDays == null || project.inactiveDays >= 14)) {
            return { healthStatus: "idle", healthLabel: "长期无进展", healthTone: "danger" };
        }
        if (project.openTaskCount > 0 && project.inactiveDays >= 7) {
            return { healthStatus: "stale", healthLabel: "轻微停滞", healthTone: "warning" };
        }
        if (project.taskCount > 0 && project.openTaskCount === 0) {
            return { healthStatus: "done", healthLabel: "全部完成", healthTone: "success" };
        }
        return { healthStatus: "healthy", healthLabel: "健康推进", healthTone: "success" };
    }

    tasks.forEach((task) => {
        task.tags.forEach((tag) => {
            if (!tag) return;
            const current = map.get(tag) || {
                name: tag,
                taskCount: 0,
                openTaskCount: 0,
                todayTaskCount: 0,
                overdueTaskCount: 0,
                lastActivityDate: "",
                inactiveDays: null,
                healthStatus: "healthy",
                healthLabel: "健康推进",
                healthTone: "success",
                progressMarkdown: progressMap.get(tag),
                hasTodayProgress: progressMap.has(tag),
            } satisfies EnhancedDiaryWorkspaceProject;
            current.taskCount += 1;
            if (!task.completed) current.openTaskCount += 1;
            if (task.isTodayTask) current.todayTaskCount += 1;
            if (task.isOverdue) current.overdueTaskCount += 1;
            if (progressMap.has(tag)) {
                current.progressMarkdown = progressMap.get(tag);
                current.hasTodayProgress = true;
            }
            map.set(tag, current);
        });
    });

    progressMap.forEach((content, name) => {
        if (map.has(name)) return;
        map.set(name, {
            name,
            taskCount: 0,
            openTaskCount: 0,
            todayTaskCount: 0,
            overdueTaskCount: 0,
            lastActivityDate: today,
            inactiveDays: 0,
            healthStatus: "healthy",
            healthLabel: "健康推进",
            healthTone: "success",
            progressMarkdown: content,
            hasTodayProgress: true,
        });
    });

    return Array.from(map.values())
        .map((project) => {
            const projectTasks = tasks.filter((task) => task.tags.includes(project.name));
            const lastActivityDate = project.hasTodayProgress ? today : getLatestTaskDate(projectTasks);
            const inactiveDays = lastActivityDate ? Math.max(0, daysBetweenLocalDates(lastActivityDate, today)) : null;
            const enriched = {
                ...project,
                lastActivityDate,
                inactiveDays,
            };
            return {
                ...enriched,
                ...resolveHealth(enriched),
            };
        })
        .sort(
            (a, b) =>
                Number(b.hasTodayProgress) - Number(a.hasTodayProgress) ||
                b.overdueTaskCount - a.overdueTaskCount ||
                b.openTaskCount - a.openTaskCount ||
                b.todayTaskCount - a.todayTaskCount
        );
}

export async function loadEnhancedDiaryWorkspaceState(
    plugin: any,
    options: { date?: Date } = {}
): Promise<EnhancedDiaryWorkspaceState> {
    const date = options.date || new Date();
    const today = formatDiaryDate(date);
    const config = await loadEnhancedDiaryConfig(plugin);
    const todayDiary = await getDiaryDocumentForDate(date);
    const summary = todayDiary
        ? buildEnhancedDiaryWorkspaceSummary(todayDiary.content, config.headingStructure)
        : EMPTY_SUMMARY;
    const tasks = await queryWorkspaceTasks(config, date);
    const records = todayDiary
        ? await queryTodayQuickRecords(todayDiary.id, todayDiary.content, today, config.headingStructure)
        : [];
    for (const record of records) {
        record.date = today;
        record.docTitle = todayDiary?.title || today;
    }
    const projects = buildProjectSummary(tasks, todayDiary?.content, today);
    const reviewCards = await buildWorkspaceReviewCards(config, date);
    const notifications = buildWorkspaceNotifications({
        tasks,
        templateValid: summary.templateValid,
        missingSections: summary.missing,
        todayDocId: todayDiary?.id,
        reviewCards,
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
        notifications,
        reviewCards,
        reviewHistory: [],
        carryoverPlans,
    };
}

export async function loadWorkspaceHistoryRecords(
    date: Date = new Date()
): Promise<EnhancedDiaryWorkspaceRecord[]> {
    const historyStart = new Date(date);
    historyStart.setDate(historyStart.getDate() - 89);
    try {
        return await queryQuickRecordsInDateRange({
            startDate: historyStart,
            endDate: date,
            includeToday: true,
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
