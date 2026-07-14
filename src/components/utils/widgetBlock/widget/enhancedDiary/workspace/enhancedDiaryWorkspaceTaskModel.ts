import type { EnhancedDiaryProjectTarget } from "../enhancedDiaryProjectTypes";
import type { EnhancedDiaryWorkspaceTask } from "./enhancedDiaryWorkspaceTaskService";
import type {
    WorkspaceTaskCompletionScope,
    WorkspaceTaskScheduleFilter,
    WorkspaceTaskSortKey,
} from "./enhancedDiaryWorkspaceNavigation";
import {
    addDays,
    daysBetweenLocalDates,
    endOfLocalWeek,
    formatLocalDate,
    isValidLocalDateString,
    parseLocalDate,
    startOfLocalWeek,
} from "./enhancedDiaryWorkspaceDate";

export type WorkspaceTaskPriorityLevel = 0 | 1 | 2 | 3 | 4;
export type WorkspaceTaskPriorityLabel = "无" | "低" | "中" | "高" | "紧急";
export type WorkspaceTaskScheduleKind = "none" | "start_only" | "deadline_only" | "range" | "same_day";
export type WorkspaceTaskRiskLevel = "normal" | "attention" | "warning" | "danger";
export type WorkspaceTaskActionBucket =
    | "overdue"
    | "today"
    | "tomorrow"
    | "this_week"
    | "next_week"
    | "future"
    | "started"
    | "unscheduled"
    | "completed";
export type WorkspaceTaskKanbanBucket = "overdue" | "today" | "recent" | "future" | "unscheduled" | "completed";

export interface WorkspaceTaskViewModel {
    task: EnhancedDiaryWorkspaceTask;
    priorityLevel: WorkspaceTaskPriorityLevel;
    priorityLabel: WorkspaceTaskPriorityLabel;
    validStartDate?: string;
    validDeadline?: string;
    hasInvalidStartDate: boolean;
    hasInvalidDeadline: boolean;
    hasInvalidRange: boolean;
    scheduleKind: WorkspaceTaskScheduleKind;
    isActive: boolean;
    isOverdue: boolean;
    isDueToday: boolean;
    isDueTomorrow: boolean;
    isStartingToday: boolean;
    isStartingTomorrow: boolean;
    isSpanningToday: boolean;
    isStarted: boolean;
    isFutureScheduled: boolean;
    isUnscheduled: boolean;
    deadlineDistanceDays: number | null;
    startDistanceDays: number | null;
    stagnantDays: number;
    riskScore: number;
    riskLevel: WorkspaceTaskRiskLevel;
    riskLabel: string;
    actionBucket: WorkspaceTaskActionBucket;
    kanbanBucket: WorkspaceTaskKanbanBucket;
    projectLabel: string;
    projectPathLabel: string;
    projectArchived: boolean;
    relationNeedsAttention: boolean;
    stableOrder: number;
}

export interface BuildWorkspaceTaskViewModelOptions {
    today?: Date | string;
    weekStartDay?: 0 | 1;
    projectTargets?: EnhancedDiaryProjectTarget[];
    projectStatuses?: ReadonlyMap<string, "active" | "archived">;
}

export interface WorkspaceTaskModelFilter {
    completionScope?: WorkspaceTaskCompletionScope;
    search?: string;
    projectTargetId?: string;
    tags?: string[];
    priorityLevels?: WorkspaceTaskPriorityLevel[];
    schedule?: WorkspaceTaskScheduleFilter;
    sources?: EnhancedDiaryWorkspaceTask["sourceKind"][];
    risk?: "all" | "risk" | "stale" | "deadline" | "relation";
}

export interface WorkspaceTaskScheduleFlagsInput {
    startDate?: string;
    deadline?: string;
    completed: boolean;
    sourceKind: "new" | "migrated" | "normal";
    sourceDate?: string;
    today: string;
    migrationReminderDays: number;
}

export interface WorkspaceTaskScheduleFlags {
    isTodayTask: boolean;
    isOverdue: boolean;
    shouldMigrate: boolean;
}

export function deriveWorkspaceTaskScheduleFlags(input: WorkspaceTaskScheduleFlagsInput): WorkspaceTaskScheduleFlags {
    const rawStartDate = input.startDate || "";
    const rawDeadline = input.deadline || "";
    const validStartDate = isValidLocalDateString(rawStartDate) ? rawStartDate : undefined;
    const validDeadline = isValidLocalDateString(rawDeadline) ? rawDeadline : undefined;
    const hasExplicitSchedule = !!rawStartDate || !!rawDeadline;
    const hasInvalidSchedule = (!!rawStartDate && !validStartDate) || (!!rawDeadline && !validDeadline);
    const hasInvalidRange = !!validStartDate && !!validDeadline && validStartDate > validDeadline;
    const isSpanningToday = !hasInvalidRange && !!validStartDate && !!validDeadline
        && validStartDate <= input.today && input.today <= validDeadline;
    const isTodayTask = validStartDate === input.today
        || validDeadline === input.today
        || isSpanningToday
        || (!hasExplicitSchedule && (input.sourceKind === "new" || input.sourceKind === "migrated"));
    const isOverdue = !input.completed && !!validDeadline && validDeadline < input.today;
    const hasFutureSchedule = (!!validStartDate && validStartDate > input.today)
        || (!!validDeadline && validDeadline > input.today);
    const sourceAge = isValidLocalDateString(input.sourceDate)
        ? daysBetweenLocalDates(input.sourceDate, input.today)
        : Number.NaN;
    const shouldMigrate = !input.completed
        && input.sourceKind === "normal"
        && Number.isFinite(sourceAge)
        && sourceAge > input.migrationReminderDays
        && !hasFutureSchedule
        && !isOverdue
        && !isTodayTask
        && !hasInvalidSchedule
        && !hasInvalidRange;
    return { isTodayTask, isOverdue, shouldMigrate };
}

const PRIORITY_LABELS: WorkspaceTaskPriorityLabel[] = ["无", "低", "中", "高", "紧急"];

function resolveToday(value: Date | string | undefined): string {
    if (typeof value === "string" && isValidLocalDateString(value)) return value;
    if (value instanceof Date) return formatLocalDate(value);
    return formatLocalDate(new Date());
}

function dateDistance(today: string, value: string | undefined): number | null {
    return value ? daysBetweenLocalDates(today, value) : null;
}

export function getWorkspaceTaskPriorityLevel(priority: string | undefined): WorkspaceTaskPriorityLevel {
    const count = (String(priority || "").match(/❗/g) || []).length;
    return Math.min(4, Math.max(0, count)) as WorkspaceTaskPriorityLevel;
}

export function normalizeWorkspaceTaskTag(tag: unknown): string {
    return String(tag || "").replace(/^#+|#+$/g, "").trim();
}

function getRiskLevel(score: number): WorkspaceTaskRiskLevel {
    if (score >= 100) return "danger";
    if (score >= 50) return "warning";
    if (score >= 20) return "attention";
    return "normal";
}

function getRiskLabel(input: {
    completed: boolean;
    hasInvalidRange: boolean;
    isOverdue: boolean;
    deadlineDistanceDays: number | null;
    stagnantDays: number;
    shouldMigrate: boolean;
    riskScore: number;
}): string {
    if (input.completed) return "已完成";
    if (input.hasInvalidRange) return "日期顺序异常";
    if (input.isOverdue) return `逾期 ${Math.abs(input.deadlineDistanceDays || 0)} 天`;
    if (input.deadlineDistanceDays === 0) return "今日截止";
    if (input.deadlineDistanceDays === 1) return "明日截止";
    if (input.stagnantDays >= 7) return `停滞 ${input.stagnantDays} 天`;
    if (input.shouldMigrate) return "建议迁移";
    if (input.riskScore >= 20) return "需要关注";
    return "正常推进";
}

function selectWorkspaceTaskPlanDate(input: {
    validStartDate?: string;
    validDeadline?: string;
    today: string;
}): string | undefined {
    if (input.validStartDate && input.validStartDate > input.today) return input.validStartDate;
    if (input.validDeadline && (!input.validStartDate || input.validStartDate <= input.today)) return input.validDeadline;
    return input.validStartDate || input.validDeadline;
}

function classifyActionBucket(input: {
    completed: boolean;
    isOverdue: boolean;
    isTodayTask: boolean;
    isDueTomorrow: boolean;
    isStartingTomorrow: boolean;
    validStartDate?: string;
    validDeadline?: string;
    planDate?: string;
    today: string;
    weekStartDay: 0 | 1;
}): WorkspaceTaskActionBucket {
    if (input.completed) return "completed";
    if (input.isOverdue) return "overdue";
    if (input.isTodayTask) return "today";
    if (input.isDueTomorrow || input.isStartingTomorrow) return "tomorrow";

    const todayDate = parseLocalDate(input.today);
    const currentWeekEnd = formatLocalDate(endOfLocalWeek(todayDate, input.weekStartDay));
    const nextWeekStartDate = addDays(startOfLocalWeek(todayDate, input.weekStartDay), 7);
    const nextWeekStart = formatLocalDate(nextWeekStartDate);
    const nextWeekEnd = formatLocalDate(endOfLocalWeek(nextWeekStartDate, input.weekStartDay));
    if (input.planDate && input.planDate > input.today && input.planDate <= currentWeekEnd) return "this_week";
    if (input.planDate && input.planDate >= nextWeekStart && input.planDate <= nextWeekEnd) return "next_week";
    if (input.planDate && input.planDate > nextWeekEnd) return "future";
    if (input.validStartDate && input.validStartDate < input.today && !input.validDeadline) return "started";
    return "unscheduled";
}

function classifyKanbanBucket(input: {
    completed: boolean;
    isOverdue: boolean;
    isTodayTask: boolean;
    today: string;
    planDate?: string;
}): WorkspaceTaskKanbanBucket {
    if (input.completed) return "completed";
    if (input.isOverdue) return "overdue";
    if (input.isTodayTask) return "today";
    if (!input.planDate) return "unscheduled";
    const distance = daysBetweenLocalDates(input.today, input.planDate);
    if (distance >= 1 && distance <= 7) return "recent";
    return distance > 7 ? "future" : "unscheduled";
}

export function buildWorkspaceTaskViewModel(
    task: EnhancedDiaryWorkspaceTask,
    stableOrder: number,
    options: BuildWorkspaceTaskViewModelOptions = {},
): WorkspaceTaskViewModel {
    const today = resolveToday(options.today);
    const validStartDate = isValidLocalDateString(task.startDate) ? task.startDate : undefined;
    const validDeadline = isValidLocalDateString(task.deadline) ? task.deadline : undefined;
    const hasInvalidStartDate = !!task.startDate && !validStartDate;
    const hasInvalidDeadline = !!task.deadline && !validDeadline;
    const hasInvalidRange = !!validStartDate && !!validDeadline && validStartDate > validDeadline;
    const startDistanceDays = dateDistance(today, validStartDate);
    const deadlineDistanceDays = dateDistance(today, validDeadline);
    const isActive = !task.completed;
    const isOverdue = isActive && !!validDeadline && validDeadline < today;
    const isDueToday = isActive && validDeadline === today;
    const isDueTomorrow = isActive && deadlineDistanceDays === 1;
    const isStartingToday = isActive && validStartDate === today;
    const isStartingTomorrow = isActive && startDistanceDays === 1;
    const isSpanningToday = isActive
        && !hasInvalidRange
        && !!validStartDate
        && !!validDeadline
        && validStartDate <= today
        && today <= validDeadline;
    const isStarted = isActive && !!validStartDate && validStartDate <= today;
    const isFutureScheduled = isActive
        && ((!!validStartDate && validStartDate > today) || (!!validDeadline && validDeadline > today));
    const isUnscheduled = !task.startDate && !task.deadline;
    const priorityLevel = getWorkspaceTaskPriorityLevel(task.priority);
    const sourceDate = isValidLocalDateString(task.sourceDate) ? task.sourceDate : undefined;
    const stagnantDistance = sourceDate ? daysBetweenLocalDates(sourceDate, today) : 0;
    const stagnantDays = Number.isFinite(stagnantDistance) ? Math.max(0, stagnantDistance) : 0;
    const relationNeedsAttention = task.projectRelationStatus !== "none" && task.projectRelationStatus !== "normal";

    let riskScore = 0;
    if (isActive) {
        if (isOverdue) riskScore += 100;
        else if (isDueToday) riskScore += 45;
        else if (isDueTomorrow) riskScore += 32;
        else if (deadlineDistanceDays != null && deadlineDistanceDays >= 2 && deadlineDistanceDays <= 3) riskScore += 20;
        riskScore += [0, 5, 12, 24, 32][priorityLevel];
        if (stagnantDays >= 30) riskScore += 35;
        else if (stagnantDays >= 14) riskScore += 22;
        else if (stagnantDays >= 7) riskScore += 10;
        if (task.shouldMigrate) riskScore += 20;
        if (hasInvalidStartDate || hasInvalidDeadline || hasInvalidRange) riskScore += 50;
    }

    const scheduleKind: WorkspaceTaskScheduleKind = validStartDate && validDeadline
        ? (validStartDate === validDeadline ? "same_day" : "range")
        : validStartDate ? "start_only"
            : validDeadline ? "deadline_only" : "none";
    const targetById = new Map((options.projectTargets || []).map((target) => [target.id, target]));
    const projectIds = [...(task.projectAncestorTargetIds || []), ...(task.projectTargetId ? [task.projectTargetId] : [])];
    const projectArchived = projectIds.some((id) =>
        targetById.get(id)?.status === "archived" || options.projectStatuses?.get(id) === "archived"
    );
    const projectPathLabel = task.projectPath?.filter(Boolean).join(" / ") || "未关联项目";
    const isTodayBucket = isActive && (
        isDueToday
        || isStartingToday
        || (isUnscheduled && task.isTodayTask)
    );
    const planDate = selectWorkspaceTaskPlanDate({ validStartDate, validDeadline, today });

    return {
        task,
        priorityLevel,
        priorityLabel: PRIORITY_LABELS[priorityLevel],
        validStartDate,
        validDeadline,
        hasInvalidStartDate,
        hasInvalidDeadline,
        hasInvalidRange,
        scheduleKind,
        isActive,
        isOverdue,
        isDueToday,
        isDueTomorrow,
        isStartingToday,
        isStartingTomorrow,
        isSpanningToday,
        isStarted,
        isFutureScheduled,
        isUnscheduled,
        deadlineDistanceDays,
        startDistanceDays,
        stagnantDays,
        riskScore,
        riskLevel: getRiskLevel(riskScore),
        riskLabel: getRiskLabel({
            completed: task.completed,
            hasInvalidRange: hasInvalidStartDate || hasInvalidDeadline || hasInvalidRange,
            isOverdue,
            deadlineDistanceDays,
            stagnantDays,
            shouldMigrate: task.shouldMigrate,
            riskScore,
        }),
        actionBucket: classifyActionBucket({
            completed: task.completed,
            isOverdue,
            isTodayTask: isTodayBucket,
            isDueTomorrow,
            isStartingTomorrow,
            validStartDate,
            validDeadline,
            planDate,
            today,
            weekStartDay: options.weekStartDay ?? 1,
        }),
        kanbanBucket: classifyKanbanBucket({
            completed: task.completed,
            isOverdue,
            isTodayTask: isTodayBucket,
            today,
            planDate,
        }),
        projectLabel: task.projectPath?.[Math.max(0, (task.projectPath?.length || 1) - 1)] || "未关联项目",
        projectPathLabel,
        projectArchived,
        relationNeedsAttention,
        stableOrder,
    };
}

export function buildWorkspaceTaskViewModels(
    tasks: EnhancedDiaryWorkspaceTask[],
    options: BuildWorkspaceTaskViewModelOptions = {},
): WorkspaceTaskViewModel[] {
    return tasks.map((task, index) => buildWorkspaceTaskViewModel(task, index, options));
}

function smartRank(model: WorkspaceTaskViewModel): number {
    if (model.hasInvalidStartDate || model.hasInvalidDeadline || model.hasInvalidRange || model.relationNeedsAttention) return 0;
    if (model.isOverdue) return 1;
    if (model.isDueToday) return 2;
    if (model.isStartingToday) return 3;
    if (model.isSpanningToday) return 4;
    if (model.priorityLevel >= 3) return 5;
    if (model.validDeadline) return 6;
    if (model.validStartDate && (model.startDistanceDays ?? 0) >= 0) return 7;
    if (model.isStarted) return 8;
    if (model.task.shouldMigrate) return 9;
    if (model.isUnscheduled) return 10;
    return 11;
}

function compareOptionalDate(a: string | undefined, b: string | undefined, descending = false): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return descending ? b.localeCompare(a) : a.localeCompare(b);
}

export function sortWorkspaceTaskModels(
    models: WorkspaceTaskViewModel[],
    sortKey: WorkspaceTaskSortKey = "smart",
): WorkspaceTaskViewModel[] {
    return [...models].sort((a, b) => {
        let result = 0;
        if (sortKey === "smart") {
            if (a.task.completed !== b.task.completed) result = a.task.completed ? 1 : -1;
            else if (a.task.completed) result = compareOptionalDate(a.task.sourceDate, b.task.sourceDate, true);
            else {
                result = smartRank(a) - smartRank(b);
                if (!result && smartRank(a) === 6) result = compareOptionalDate(a.validDeadline, b.validDeadline);
                if (!result && smartRank(a) === 7) result = compareOptionalDate(a.validStartDate, b.validStartDate);
                if (!result) result = b.riskScore - a.riskScore;
            }
        } else if (sortKey === "deadline") result = compareOptionalDate(a.validDeadline, b.validDeadline);
        else if (sortKey === "start") result = compareOptionalDate(a.validStartDate, b.validStartDate);
        else if (sortKey === "priority") result = b.priorityLevel - a.priorityLevel;
        else if (sortKey === "risk") result = b.riskScore - a.riskScore;
        else if (sortKey === "source") result = compareOptionalDate(a.task.sourceDate, b.task.sourceDate, true);
        else if (sortKey === "name") result = a.task.taskname.localeCompare(b.task.taskname, "zh-CN");
        return result || a.stableOrder - b.stableOrder;
    });
}

function matchesSearch(model: WorkspaceTaskViewModel, search: string): boolean {
    const keyword = search.trim().toLocaleLowerCase();
    if (!keyword) return true;
    const task = model.task;
    return [
        task.taskname,
        task.sourceDate,
        task.sourceDocTitle,
        task.hpath,
        model.projectPathLabel,
        model.priorityLabel,
        model.validStartDate,
        model.validDeadline,
        ...task.tags,
    ].some((value) => String(value || "").toLocaleLowerCase().includes(keyword));
}

export function filterWorkspaceTaskModels(
    models: WorkspaceTaskViewModel[],
    filter: WorkspaceTaskModelFilter,
): WorkspaceTaskViewModel[] {
    const tags = new Set((filter.tags || []).map(normalizeWorkspaceTaskTag).filter(Boolean).map((tag) => tag.toLocaleLowerCase()));
    return models.filter((model) => {
        const task = model.task;
        if (filter.completionScope === "active" && task.completed) return false;
        if (filter.completionScope === "completed" && !task.completed) return false;
        if (filter.search && !matchesSearch(model, filter.search)) return false;
        if (filter.projectTargetId === "__none__" && task.projectTargetId) return false;
        if (filter.projectTargetId && filter.projectTargetId !== "__none__"
            && task.projectTargetId !== filter.projectTargetId
            && !task.projectAncestorTargetIds?.includes(filter.projectTargetId)) return false;
        if (tags.size > 0 && !task.tags.some((tag) => tags.has(normalizeWorkspaceTaskTag(tag).toLocaleLowerCase()))) return false;
        if (filter.priorityLevels?.length && !filter.priorityLevels.includes(model.priorityLevel)) return false;
        if (filter.schedule && filter.schedule !== "all") {
            if (filter.schedule === "invalid" && !model.hasInvalidStartDate && !model.hasInvalidDeadline && !model.hasInvalidRange) return false;
            if (filter.schedule === "unscheduled" && !model.isUnscheduled) return false;
            if (filter.schedule === "range" && model.scheduleKind !== "range" && model.scheduleKind !== "same_day") return false;
            if (filter.schedule === "start_only" && model.scheduleKind !== "start_only") return false;
            if (filter.schedule === "deadline_only" && model.scheduleKind !== "deadline_only") return false;
        }
        if (filter.sources?.length && !filter.sources.includes(task.sourceKind)) return false;
        if (filter.risk === "risk" && model.riskScore < 50) return false;
        if (filter.risk === "stale" && model.stagnantDays < 7) return false;
        if (filter.risk === "deadline" && !model.isOverdue && (model.deadlineDistanceDays == null || model.deadlineDistanceDays > 3)) return false;
        if (filter.risk === "relation" && !model.relationNeedsAttention) return false;
        return true;
    });
}

export function formatWorkspaceTaskDate(date: string, today: Date | string = new Date()): string {
    if (!isValidLocalDateString(date)) return "日期无效";
    const current = resolveToday(today);
    const [year, month, day] = date.split("-").map(Number);
    return year === Number(current.slice(0, 4)) ? `${month} 月 ${day} 日` : `${year} 年 ${month} 月 ${day} 日`;
}

export function formatWorkspaceTaskSchedule(model: WorkspaceTaskViewModel, today: Date | string = new Date()): string {
    if (model.hasInvalidStartDate || model.hasInvalidDeadline) return "日期格式异常";
    if (model.hasInvalidRange) return "日期顺序异常";
    if (model.isOverdue) return `逾期 ${Math.abs(model.deadlineDistanceDays || 0)} 天`;
    if (model.isDueToday) return "今日截止";
    if (model.isDueTomorrow) return "明日截止";
    if (model.scheduleKind === "same_day" && model.validStartDate) return formatWorkspaceTaskDate(model.validStartDate, today);
    if (model.scheduleKind === "range" && model.validStartDate && model.validDeadline) {
        return `${formatWorkspaceTaskDate(model.validStartDate, today)} → ${formatWorkspaceTaskDate(model.validDeadline, today)}`;
    }
    if (model.validStartDate) {
        if (model.startDistanceDays === 0) return "今天开始";
        if ((model.startDistanceDays ?? 0) > 0) return `${model.startDistanceDays} 天后开始`;
        return `已开始 ${Math.abs(model.startDistanceDays || 0)} 天`;
    }
    if (model.validDeadline) return `截止 ${formatWorkspaceTaskDate(model.validDeadline, today)}`;
    return "未排期";
}
