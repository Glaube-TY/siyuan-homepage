import { loadEnhancedDiaryConfig } from "../enhancedDiaryConfig";
import { getDiaryDocumentForDate, type EnhancedDiaryDocumentInfo } from "../enhancedDiaryDoc";
import { formatDiaryDate } from "../enhancedDiaryUtils";
import { buildEnhancedDiaryWorkspaceSummary, type EnhancedDiaryWorkspaceSummary } from "../enhancedDiaryWorkspaceSummary";
import {
    getDayWorkspaceSections,
} from "../enhancedDiaryWorkspaceSections";
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
import type { EnhancedDiaryConfig } from "../enhancedDiaryTypes";

export interface EnhancedDiaryWorkspaceProject {
    name: string;
    taskCount: number;
    openTaskCount: number;
    todayTaskCount: number;
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
    if (!sections.projectProgress.found) return map;

    const lines = sections.projectProgress.markdown.split("\n");
    let currentName = "";
    let buffer: string[] = [];

    function flush() {
        if (!currentName) return;
        const content = buffer.join("\n").trim();
        map.set(currentName, content);
    }

    for (const line of lines) {
        const match = line.match(/^###\s+(.+)$/);
        if (match) {
            flush();
            currentName = match[1].trim();
            buffer = [];
        } else if (currentName) {
            buffer.push(line);
        }
    }
    flush();

    return map;
}

function buildProjectSummary(
    tasks: EnhancedDiaryWorkspaceTask[],
    todayMarkdown?: string
): EnhancedDiaryWorkspaceProject[] {
    const map = new Map<string, EnhancedDiaryWorkspaceProject>();
    const progressMap = parseTodayProjectProgress(todayMarkdown);

    tasks.forEach((task) => {
        task.tags.forEach((tag) => {
            if (!tag) return;
            const current = map.get(tag) || {
                name: tag,
                taskCount: 0,
                openTaskCount: 0,
                todayTaskCount: 0,
                progressMarkdown: progressMap.get(tag),
                hasTodayProgress: progressMap.has(tag),
            };
            current.taskCount += 1;
            if (!task.completed) current.openTaskCount += 1;
            if (task.isTodayTask) current.todayTaskCount += 1;
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
            progressMarkdown: content,
            hasTodayProgress: true,
        });
    });

    return Array.from(map.values())
        .sort(
            (a, b) =>
                Number(b.hasTodayProgress) - Number(a.hasTodayProgress) ||
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
        ? buildEnhancedDiaryWorkspaceSummary(todayDiary.content)
        : EMPTY_SUMMARY;
    const tasks = await queryWorkspaceTasks(config, date);
    const records = todayDiary
        ? await queryTodayQuickRecords(todayDiary.id, todayDiary.content, today)
        : [];
    for (const record of records) {
        record.date = today;
        record.docTitle = todayDiary?.title || today;
    }
    const projects = buildProjectSummary(tasks, todayDiary?.content);
    const reviewCards = await buildWorkspaceReviewCards(config, date);
    const notifications = buildWorkspaceNotifications({
        tasks,
        templateValid: summary.templateValid,
        missingSections: summary.missing,
        todayDocId: todayDiary?.id,
        reviewCards,
    });

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
