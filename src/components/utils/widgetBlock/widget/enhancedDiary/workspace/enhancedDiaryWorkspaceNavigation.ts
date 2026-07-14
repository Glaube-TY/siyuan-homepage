import type { EnhancedDiaryRecordCategoryKey } from "../enhancedDiaryWorkspaceSections";

export type WorkspaceTaskStatusFilter =
    | "all"
    | "active"
    | "completed"
    | "today"
    | "overdue"
    | "migrate"
    | "high"
    | "unscheduled"
    | "relation"
    | "new"
    | "migrated";

export type WorkspaceTaskViewMode =
    | "list"
    | "kanban"
    | "agenda"
    | "calendar"
    | "timeline"
    | "gantt"
    | "matrix"
    | "analytics";

export type WorkspaceTaskCompletionScope = "active" | "completed" | "all";

export type WorkspaceTaskSortKey =
    | "smart"
    | "deadline"
    | "start"
    | "priority"
    | "risk"
    | "source"
    | "name";

export type WorkspaceTaskScheduleFilter =
    | "all"
    | "range"
    | "start_only"
    | "deadline_only"
    | "unscheduled"
    | "invalid";

export type WorkspaceRecordViewMode = "today" | "history";
export type WorkspaceRecordCategoryFilter = "all" | EnhancedDiaryRecordCategoryKey | (string & {});

export type WorkspaceProjectStatusFilter =
    | "all"
    | "open"
    | "todayProgress"
    | "todayTask"
    | "stale"
    | "overdue"
    | "risk"
    | "done";

export type WorkspaceTaskRiskFilter =
    | "all"
    | "risk"
    | "stale"
    | "deadline"
    | "project";

export interface GoRecordsOptions {
    mode?: WorkspaceRecordViewMode;
    date?: string;
    category?: WorkspaceRecordCategoryFilter;
    recordId?: string;
    tag?: string;
    projectTargetId?: string;
    keyOnly?: boolean;
}

export interface GoTasksOptions {
    status?: WorkspaceTaskStatusFilter;
    quickFilter?: WorkspaceTaskStatusFilter;
    view?: WorkspaceTaskViewMode;
    completionScope?: WorkspaceTaskCompletionScope;
    date?: string;
    tag?: string;
    tags?: string[];
    projectTargetId?: string;
    risk?: WorkspaceTaskRiskFilter;
    schedule?: WorkspaceTaskScheduleFilter;
    taskBlockId?: string;
}

export interface GoProjectsOptions {
    projectTargetId?: string;
    tag?: string;
    status?: WorkspaceProjectStatusFilter;
}

export interface TimelineItem {
    type: string;
    title: string;
    content: string;
    date: string;
}
