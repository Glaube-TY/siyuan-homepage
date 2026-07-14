import type { EnhancedDiaryWorkspaceNotification } from "./enhancedDiaryWorkspaceNotifications";
import type { EnhancedDiaryWorkspaceProject } from "./enhancedDiaryWorkspaceData";
import type { EnhancedDiaryWorkspaceRecord } from "./enhancedDiaryWorkspaceRecordService";
import type { EnhancedDiaryWorkspaceTask } from "./enhancedDiaryWorkspaceTaskService";

const FAR_FUTURE = "9999-12-31";

export function isHighPriorityTask(task: EnhancedDiaryWorkspaceTask): boolean {
    return /^(?:\u2757){3,4}$/u.test(task.priority) || ["高优先级", "紧急", "high", "urgent"].includes(task.priority.toLowerCase());
}

export function taskPriorityLabel(priority: string): string {
    const labels = ["低优先级", "中优先级", "高优先级", "紧急"];
    const count = Array.from(priority).length;
    return /^(?:\u2757){1,4}$/u.test(priority) ? labels[count - 1] : priority;
}

export function taskDateLabel(task: EnhancedDiaryWorkspaceTask): string {
    if (task.startDate && task.deadline) return `${task.startDate} → ${task.deadline}`;
    if (task.deadline) return `截止 ${task.deadline}`;
    if (task.startDate) return `开始 ${task.startDate}`;
    return task.sourceDate || "无日期";
}

function taskSortDate(task: EnhancedDiaryWorkspaceTask): string {
    return task.deadline || task.startDate || task.sourceDate || FAR_FUTURE;
}

export function selectOverviewFocusTasks(tasks: EnhancedDiaryWorkspaceTask[]): EnhancedDiaryWorkspaceTask[] {
    return tasks
        .map((task, index) => ({ task, index }))
        .filter(({ task }) => !task.completed)
        .sort((a, b) => {
            if (a.task.isOverdue !== b.task.isOverdue) return a.task.isOverdue ? -1 : 1;
            const highA = isHighPriorityTask(a.task);
            const highB = isHighPriorityTask(b.task);
            if (highA !== highB) return highA ? -1 : 1;
            const todayA = a.task.isTodayTask;
            const todayB = b.task.isTodayTask;
            if (todayA !== todayB) return todayA ? -1 : 1;
            return taskSortDate(a.task).localeCompare(taskSortDate(b.task)) || a.index - b.index;
        })
        .slice(0, 5)
        .map(({ task }) => task);
}

export function sortOverviewProjects(projects: EnhancedDiaryWorkspaceProject[]): EnhancedDiaryWorkspaceProject[] {
    const toneRank = { danger: 0, warning: 1, success: 2, normal: 3 } as const;
    return projects
        .map((project, index) => ({ project, index }))
        .filter(({ project }) => project.status === "active" && project.level === 0)
        .sort((a, b) =>
            toneRank[a.project.healthTone] - toneRank[b.project.healthTone]
            || Number(b.project.hasTodayProgress) - Number(a.project.hasTodayProgress)
            || b.project.lastActivityDate.localeCompare(a.project.lastActivityDate)
            || a.index - b.index
        )
        .slice(0, 4)
        .map(({ project }) => project);
}

export function sortTodayRecords(records: EnhancedDiaryWorkspaceRecord[]): EnhancedDiaryWorkspaceRecord[] {
    return records
        .map((record, index) => ({ record, index }))
        .sort((a, b) => b.record.timeText.localeCompare(a.record.timeText) || b.index - a.index)
        .slice(0, 5)
        .map(({ record }) => record);
}

export function countNotifications(
    notifications: EnhancedDiaryWorkspaceNotification[],
    types: EnhancedDiaryWorkspaceNotification["type"][],
): number {
    const accepted = new Set(types);
    return notifications.filter((item) => accepted.has(item.type)).length;
}
