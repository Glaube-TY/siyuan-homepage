import type { EnhancedDiaryProjectIndexPayload } from "../enhancedDiaryProjectTypes";
import type { EnhancedDiaryProjectRecordIndexItem } from "../enhancedDiaryProjectRecordIndex";
import type { EnhancedDiaryWorkspaceTask } from "./enhancedDiaryWorkspaceTaskService";

export type ProjectTaskViewFilter = "all" | "pending" | "completed" | "overdue";
export type ProjectRecordViewFilter = "all" | "key";
export type ProjectTimelineTypeFilter = "all" | "task" | "record" | "key";
export type ProjectTimelineRange = "30" | "90" | "all";

export interface ProjectActivityDay {
    date: string;
    taskCount: number;
    recordCount: number;
    keyRecordCount: number;
}

export interface ProjectTimelineEvent {
    id: string;
    date: string;
    kind: "task" | "record" | "key";
    typeLabel: string;
    title: string;
    blockId: string;
    projectPath: string[];
    statusLabel: string;
    statusTone: "primary" | "danger" | "muted";
}

export interface ProjectChildProgress {
    id: string;
    title: string;
    completedTasks: number;
    totalTasks: number;
    completionRate: number;
    recordCount: number;
    lastActivityDate: string;
}

export interface ProjectAnalytics {
    taskTotal: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    completionRate: number;
    recordTotal: number;
    keyRecordTotal: number;
    activeDays30: number;
    lastActivityDate: string;
    activityDays: ProjectActivityDay[];
    nextTasks: EnhancedDiaryWorkspaceTask[];
    recentRecords: EnhancedDiaryProjectRecordIndexItem[];
    timeline: ProjectTimelineEvent[];
    childProgress: ProjectChildProgress[];
}

function formatDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validDate(value: string | undefined): value is string {
    return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function blockTime(blockId: string): string {
    const match = blockId.match(/^\d{8}(\d{4})/);
    return match?.[1] || "0000";
}

function taskSortDate(task: EnhancedDiaryWorkspaceTask): string {
    return task.deadline || task.startDate || task.sourceDate || "9999-12-31";
}

function belongsToTarget(
    targetId: string,
    task: EnhancedDiaryWorkspaceTask,
): boolean {
    return task.projectTargetId === targetId || task.projectAncestorTargetIds?.includes(targetId) === true;
}

function recordBelongsToTarget(
    targetId: string,
    record: EnhancedDiaryProjectRecordIndexItem,
    index: EnhancedDiaryProjectIndexPayload,
): boolean {
    return record.projectTargetId === targetId || index.nodes[record.projectTargetId]?.ancestorTargetIds.includes(targetId) === true;
}

function latestActivityDate(
    tasks: EnhancedDiaryWorkspaceTask[],
    records: EnhancedDiaryProjectRecordIndexItem[],
): string {
    return [...tasks.map((task) => task.sourceDate || ""), ...records.map((record) => record.date || "")]
        .filter(validDate)
        .sort((a, b) => b.localeCompare(a))[0] || "";
}

export function filterProjectTasks(
    tasks: EnhancedDiaryWorkspaceTask[],
    filter: ProjectTaskViewFilter,
): EnhancedDiaryWorkspaceTask[] {
    if (filter === "completed") return tasks.filter((task) => task.completed);
    if (filter === "overdue") return tasks.filter((task) => !task.completed && task.isOverdue);
    if (filter === "pending") return tasks.filter((task) => !task.completed && !task.isOverdue);
    return tasks;
}

export function filterProjectRecords(
    records: EnhancedDiaryProjectRecordIndexItem[],
    filter: ProjectRecordViewFilter,
): EnhancedDiaryProjectRecordIndexItem[] {
    return filter === "key" ? records.filter((record) => record.isKeyRecord) : records;
}

export function relativeProjectSourcePath(
    projectPath: string[] | undefined,
    currentTargetPath: string[],
): string[] {
    const path = projectPath?.filter(Boolean) || [];
    const hasCurrentPrefix = currentTargetPath.length > 0 &&
        currentTargetPath.every((title, index) => path[index] === title);
    return hasCurrentPrefix && path.length > currentTargetPath.length
        ? path.slice(currentTargetPath.length)
        : path;
}

export function analyzeEnhancedDiaryProject(params: {
    tasks: EnhancedDiaryWorkspaceTask[];
    records: EnhancedDiaryProjectRecordIndexItem[];
    index: EnhancedDiaryProjectIndexPayload;
    selectedTargetId: string;
    now?: Date;
}): ProjectAnalytics {
    const { tasks, records, index, selectedTargetId } = params;
    const now = params.now || new Date();
    const today = formatDate(now);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 29);
    const startDate = formatDate(start);
    const activityDays: ProjectActivityDay[] = [];
    const byDate = new Map<string, ProjectActivityDay>();
    for (let offset = 0; offset < 30; offset += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
        const item = { date: formatDate(date), taskCount: 0, recordCount: 0, keyRecordCount: 0 };
        activityDays.push(item);
        byDate.set(item.date, item);
    }
    tasks.forEach((task) => {
        if (!validDate(task.sourceDate) || task.sourceDate < startDate || task.sourceDate > today) return;
        const item = byDate.get(task.sourceDate);
        if (item) item.taskCount += 1;
    });
    records.forEach((record) => {
        if (!validDate(record.date) || record.date < startDate || record.date > today) return;
        const item = byDate.get(record.date);
        if (!item) return;
        if (record.isKeyRecord) item.keyRecordCount += 1;
        else item.recordCount += 1;
    });

    const completedTasks = tasks.filter((task) => task.completed).length;
    const overdueTasks = tasks.filter((task) => !task.completed && task.isOverdue).length;
    const pendingTasks = tasks.length - completedTasks;
    const nextTasks = tasks.filter((task) => !task.completed).sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        const dateCompare = taskSortDate(a).localeCompare(taskSortDate(b));
        return dateCompare || a.taskname.localeCompare(b.taskname);
    }).slice(0, 5);
    const recentRecords = [...records].sort((a, b) =>
        b.date.localeCompare(a.date) || blockTime(b.headingBlockId).localeCompare(blockTime(a.headingBlockId))
    ).slice(0, 5);
    const timeline: ProjectTimelineEvent[] = [
        ...tasks.filter((task) => validDate(task.sourceDate)).map((task) => ({
            id: `task:${task.blockId}`,
            date: task.sourceDate!,
            kind: "task" as const,
            typeLabel: task.sourceKind === "migrated" ? "任务记录" : "任务创建",
            title: task.taskname,
            blockId: task.blockId,
            projectPath: task.projectPath || [],
            statusLabel: task.completed ? "当前已完成" : task.isOverdue ? "当前已逾期" : "当前待完成",
            statusTone: task.completed ? "primary" as const : task.isOverdue ? "danger" as const : "muted" as const,
        })),
        ...records.filter((record) => validDate(record.date)).map((record) => ({
            id: `record:${record.id}`,
            date: record.date,
            kind: record.isKeyRecord ? "key" as const : "record" as const,
            typeLabel: record.isKeyRecord ? "关键记录" : "记录",
            title: record.preview || "空记录",
            blockId: record.headingBlockId,
            projectPath: record.projectPath || [],
            statusLabel: record.category || "未分类",
            statusTone: record.isKeyRecord ? "primary" as const : "muted" as const,
        })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    const directChildren = Object.values(index.nodes)
        .filter((node) => {
            if (node.parentTargetId !== selectedTargetId) return false;
            const selected = index.roots[selectedTargetId] || index.nodes[selectedTargetId];
            return selected?.status === "archived" || node.status === "active";
        })
        .sort((a, b) => a.order - b.order);
    const childProgress = directChildren.map((child) => {
        const childTasks = tasks.filter((task) => belongsToTarget(child.id, task));
        const childRecords = records.filter((record) => recordBelongsToTarget(child.id, record, index));
        const childCompleted = childTasks.filter((task) => task.completed).length;
        return {
            id: child.id,
            title: child.title,
            completedTasks: childCompleted,
            totalTasks: childTasks.length,
            completionRate: childTasks.length ? Math.round(childCompleted / childTasks.length * 100) : 0,
            recordCount: childRecords.length,
            lastActivityDate: latestActivityDate(childTasks, childRecords),
        };
    });

    return {
        taskTotal: tasks.length,
        completedTasks,
        pendingTasks,
        overdueTasks,
        completionRate: tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0,
        recordTotal: records.length,
        keyRecordTotal: records.filter((record) => record.isKeyRecord).length,
        activeDays30: activityDays.filter((item) => item.taskCount + item.recordCount + item.keyRecordCount > 0).length,
        lastActivityDate: latestActivityDate(tasks, records),
        activityDays,
        nextTasks,
        recentRecords,
        timeline,
        childProgress,
    };
}
