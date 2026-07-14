export type ReviewTargetType = "doc" | "block";
export type ReviewPriority = "high" | "medium" | "low" | "";
export type ReviewPlanType = "manual" | "ebbinghaus" | "custom" | "";
export type ReviewDueStatus = "overdue" | "today" | "future";
export type ReviewView = "due" | "today" | "overdue" | "future" | "all";
export type ReviewSortBy =
    | "dueAsc"
    | "priorityDesc"
    | "updatedDesc"
    | "createdDesc"
    | "reviewCountAsc";

export type ReviewLogAction =
    | "create"
    | "review"
    | "postpone"
    | "update"
    | "finish"
    | "remove";

export interface ReviewAttrs {
    reviewId: string;
    nextDate: string;
    note: string;
    category: string;
    priority: ReviewPriority;
    plan: ReviewPlanType;
    intervals: number[];
    intervalIndex: number;
    reviewCount: number;
    lastReviewedAt: string;
    targetType: ReviewTargetType | "";
    createdAt: string;
    updatedAt: string;
}

export interface ReviewItem {
    id: string;
    rootId: string;
    parentId?: string;
    box: string;
    path: string;
    hpath: string;
    type: ReviewTargetType;
    blockType: string;
    title: string;
    content: string;
    created: string;
    updated: string;
    attrs: ReviewAttrs;
    dueStatus: ReviewDueStatus;
    overdueDays: number;
}

export interface ReviewDocsConfig {
    reviewDocsTitle: string;
    reviewDocsLimit: number;
    reviewDocsDefaultView: ReviewView;
    reviewDocsShowFuture: boolean;
    reviewDocsFutureDays: number;
    reviewDocsShowDocs: boolean;
    reviewDocsShowBlocks: boolean;
    reviewDocsShowNote: boolean;
    reviewDocsShowPath: boolean;
    reviewDocsShowStats: boolean;
    reviewDocsSortBy: ReviewSortBy;
    reviewDocsShowFloatDoc: boolean;
    reviewDocsFloatDocShowTime: number;
    reviewDocsDefaultIntervals: string;
}

export interface ReviewQueryOptions {
    view?: ReviewView;
    sortBy?: ReviewSortBy;
    showDocs?: boolean;
    showBlocks?: boolean;
    showFuture?: boolean;
    futureDays?: number;
    category?: string;
    priority?: ReviewPriority | "all";
    search?: string;
    limit?: number;
}

export interface ReviewSummary {
    today: number;
    overdue: number;
    future: number;
    due: number;
    total: number;
    categories: Record<string, number>;
    priorities: Record<Exclude<ReviewPriority, "">, number>;
}

export interface ReviewTargetInfo {
    id: string;
    rootId: string;
    parentId?: string;
    box: string;
    path: string;
    hpath: string;
    type: ReviewTargetType;
    blockType: string;
    title: string;
    content: string;
    created: string;
    updated: string;
}

export interface ReviewPlanInput {
    nextDate: string;
    note: string;
    category: string;
    priority: Exclude<ReviewPriority, "">;
    plan: Exclude<ReviewPlanType, "">;
    intervals: number[];
}

export interface ReviewOperationParams {
    targetId: string;
    targetType: ReviewTargetType;
}

export interface ReviewPlanOperationParams extends ReviewOperationParams {
    input: ReviewPlanInput;
}

export interface CompleteReviewParams extends ReviewOperationParams {
    manualNextDate?: string;
    switchToManual?: boolean;
}

export interface PostponeReviewParams extends ReviewOperationParams {
    nextDate: string;
}

export interface ReviewLogEntry {
    logId: string;
    reviewId: string;
    targetId: string;
    targetRootId: string;
    targetType: ReviewTargetType;
    targetTitle: string;
    targetPath: string;
    action: ReviewLogAction;
    actionAt: string;
    previousDueDate: string;
    nextDueDate: string;
    reviewCountBefore: number;
    reviewCountAfter: number;
    intervalIndexBefore: number;
    intervalIndexAfter: number;
    plan: string;
    intervals: string;
    category: string;
    priority: string;
    note: string;
    createdAt: string;
    archived: string;
}

export interface ReviewLogStats {
    todayReviewed: number | null;
    totalLogs: number;
    statusMessage: string;
}

export interface ReviewMenuTarget {
    id: string;
    type: ReviewTargetType;
}

export const DEFAULT_REVIEW_DOCS_CONFIG: ReviewDocsConfig = {
    reviewDocsTitle: "📚复习文档",
    reviewDocsLimit: 20,
    reviewDocsDefaultView: "due",
    reviewDocsShowFuture: true,
    reviewDocsFutureDays: 7,
    reviewDocsShowDocs: true,
    reviewDocsShowBlocks: true,
    reviewDocsShowNote: true,
    reviewDocsShowPath: true,
    reviewDocsShowStats: true,
    reviewDocsSortBy: "dueAsc",
    reviewDocsShowFloatDoc: true,
    reviewDocsFloatDocShowTime: 0.1,
    reviewDocsDefaultIntervals: "0,1,2,4,7,15,30,60",
};
