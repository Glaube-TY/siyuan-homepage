import type { EnhancedDiaryRecordCategoryKey } from "../enhancedDiaryWorkspaceSections";

export type WorkspaceTaskStatusFilter =
    | "all"
    | "active"
    | "completed"
    | "today"
    | "overdue"
    | "migrate"
    | "new"
    | "migrated";

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
}

export interface TimelineItem {
    type: string;
    title: string;
    content: string;
    date: string;
}
