import { sql } from "@/api";
import {
    addDaysFromToday,
    diffDays,
    getNextIntervalReviewDate,
    intervalsToText,
    isValidDateText,
    normalizeIntervals,
    shouldUseIntervalSchedule,
    toLocalDateString,
} from "./reviewDocsSchedule";
import { appendReviewLog } from "./reviewDocsData";
import {
    getReviewIndexResult,
    getReviewIndexItem,
    removeReviewIndexItem,
    updateReviewIndexItem,
    type ComponentDataResult,
} from "@/components/tools/siyuanComponentDataApi";
import type {
    CompleteReviewParams,
    PostponeReviewParams,
    ReviewAttrs,
    ReviewDueStatus,
    ReviewItem,
    ReviewLogAction,
    ReviewLogEntry,
    ReviewOperationParams,
    ReviewPlanOperationParams,
    ReviewPriority,
    ReviewQueryOptions,
    ReviewSortBy,
    ReviewSummary,
    ReviewTargetInfo,
    ReviewTargetType,
    ReviewView,
} from "./reviewDocsTypes";

export interface ReviewOperationResult {
    ok: boolean;
    message: string;
    logWarning?: string;
}

let reviewMutationTail: Promise<void> = Promise.resolve();
function runReviewMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const next = reviewMutationTail.then(mutation, mutation);
    reviewMutationTail = next.then(() => undefined, () => undefined);
    return next;
}

export class ReviewConflictError extends Error {
    readonly code = "review_conflict";
    readonly details?: { expectedUpdatedAt?: string; currentUpdatedAt?: string };
    constructor(message: string, details?: { expectedUpdatedAt?: string; currentUpdatedAt?: string }) {
        super(message);
        this.name = "ReviewConflictError";
        this.details = details;
    }
}

function assertExpectedReviewUpdatedAt(expected: string | undefined, current: ReviewAttrs): void {
    if (expected !== undefined && current.updatedAt !== expected) {
        throw new ReviewConflictError("复习计划已在其他窗口修改，请重新读取。", {
            expectedUpdatedAt: expected,
            currentUpdatedAt: current.updatedAt,
        });
    }
}

function emptyReviewAttrs(): ReviewAttrs {
    return {
        reviewId: "",
        nextDate: "",
        note: "",
        category: "",
        priority: "",
        plan: "",
        intervals: [],
        intervalIndex: 0,
        reviewCount: 0,
        lastReviewedAt: "",
        targetType: "",
        createdAt: "",
        updatedAt: "",
    };
}

function generateReviewId(): string {
    return `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateLogId(): string {
    return `review-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function normalizeBlockRow(row: any, fallbackType: ReviewTargetType): ReviewTargetInfo {
    const type: ReviewTargetType = fallbackType || (row?.type === "d" ? "doc" : "block");
    const rootId = row?.root_id || (type === "doc" ? row?.id : "") || row?.id || "";
    const title =
        String(row?.content || row?.name || row?.alias || "")
            .trim() ||
        String(row?.hpath || row?.path || "")
            .split("/")
            .filter(Boolean)
            .pop() ||
        row?.id ||
        "未命名内容";

    return {
        id: row?.id || "",
        rootId,
        parentId: row?.parent_id || "",
        box: row?.box || "",
        path: row?.path || "",
        hpath: row?.hpath || "",
        type,
        blockType: row?.type || "",
        title,
        content: row?.content || row?.fcontent || row?.markdown || title,
        created: row?.created || "",
        updated: row?.updated || "",
    };
}

// 仅包含编辑/操作对话框展示与日志记录所需字段
const REVIEW_TARGET_INFO_FIELDS = [
    "id",
    "parent_id",
    "root_id",
    "box",
    "path",
    "hpath",
    "name",
    "alias",
    "content",
    "type",
    "created",
    "updated",
].join(", ");

export async function getReviewTargetInfo(
    targetId: string,
    targetType: ReviewTargetType
): Promise<ReviewTargetInfo> {
    const rows = await sql(`
        SELECT ${REVIEW_TARGET_INFO_FIELDS}
        FROM blocks
        WHERE id = '${escapeSqlString(targetId)}'
        LIMIT 1
    `);

    const row = rows?.[0];
    if (!row?.id) {
        throw new Error("目标文档或块不存在，无法写入复习计划");
    }

    return normalizeBlockRow(row, targetType);
}

export function computeReviewDueStatus(
    nextDate: string,
    today: string = toLocalDateString(),
): { dueStatus: ReviewDueStatus; overdueDays: number } {
    const daysFromToday = diffDays(nextDate, today);
    const dueStatus: ReviewDueStatus = daysFromToday < 0 ? "overdue" : daysFromToday === 0 ? "today" : "future";
    const overdueDays = daysFromToday < 0 ? Math.abs(daysFromToday) : 0;
    return { dueStatus, overdueDays };
}

export function refreshReviewItemDueStatus(
    item: ReviewItem,
    today: string = toLocalDateString(),
): ReviewItem {
    const nextDate = item?.attrs?.nextDate;
    if (!nextDate) {
        return item;
    }
    const { dueStatus, overdueDays } = computeReviewDueStatus(nextDate, today);
    if (item.dueStatus === dueStatus && item.overdueDays === overdueDays) {
        return item;
    }
    return {
        ...item,
        dueStatus,
        overdueDays,
    };
}

export async function loadAllReviewItems(
    plugin?: any,
    notebookIds: string[] = [],
): Promise<ReviewItem[]> {
    const result = await loadAllReviewItemsResult(plugin, notebookIds);
    return result.items;
}

function filterReviewItemsByNotebooks<T extends { box?: string }>(
    items: T[],
    notebookIds: string[],
): T[] {
    if (notebookIds.length === 0) return items;
    return items.filter((item) => item.box && notebookIds.includes(item.box));
}

export async function loadAllReviewItemsResult(
    plugin?: any,
    notebookIds: string[] = [],
): Promise<ComponentDataResult<ReviewItem>> {
    void plugin;
    const result = await getReviewIndexResult<any>();
    const rawItems = (result as ComponentDataResult<ReviewItem>).items || [];
    const items = filterReviewItemsByNotebooks(
        rawItems.map((item) => refreshReviewItemDueStatus(item)),
        notebookIds,
    );
    return {
        ...(result as ComponentDataResult<ReviewItem>),
        items,
        status: items.length > 0 ? "ok" : (items.length === 0 && notebookIds.length > 0 ? "empty" : (result as ComponentDataResult<ReviewItem>).status),
    };
}

function matchesView(item: ReviewItem, view: ReviewView, futureDays: number, today: string = toLocalDateString()): boolean {
    const delta = diffDays(item.attrs.nextDate, today);
    if (view === "today") return delta === 0;
    if (view === "overdue") return delta < 0;
    if (view === "future") return delta > 0 && delta <= futureDays;
    if (view === "all") return true;
    return delta <= 0;
}

function priorityRank(priority: ReviewPriority): number {
    if (priority === "high") return 3;
    if (priority === "medium") return 2;
    if (priority === "low") return 1;
    return 0;
}

function compareReviewItems(sortBy: ReviewSortBy): (a: ReviewItem, b: ReviewItem) => number {
    return (a, b) => {
        if (sortBy === "priorityDesc") {
            return priorityRank(b.attrs.priority) - priorityRank(a.attrs.priority) ||
                a.attrs.nextDate.localeCompare(b.attrs.nextDate);
        }
        if (sortBy === "updatedDesc") {
            return String(b.updated || b.attrs.updatedAt).localeCompare(String(a.updated || a.attrs.updatedAt));
        }
        if (sortBy === "createdDesc") {
            return String(b.attrs.createdAt || b.created).localeCompare(String(a.attrs.createdAt || a.created));
        }
        if (sortBy === "reviewCountAsc") {
            return a.attrs.reviewCount - b.attrs.reviewCount ||
                a.attrs.nextDate.localeCompare(b.attrs.nextDate);
        }
        return a.attrs.nextDate.localeCompare(b.attrs.nextDate) ||
            priorityRank(b.attrs.priority) - priorityRank(a.attrs.priority);
    };
}

export function filterAndSortReviewItems(
    items: ReviewItem[],
    options: ReviewQueryOptions = {},
    today: string = toLocalDateString(),
): ReviewItem[] {
    const view = options.view || "due";
    const sortBy = options.sortBy || "dueAsc";
    const futureDays = Math.max(1, Number(options.futureDays) || 7);
    const search = (options.search || "").trim().toLowerCase();
    const category = (options.category || "").trim();
    const priority = options.priority || "all";

    const refreshedItems = items.map((item) => refreshReviewItemDueStatus(item, today));

    let filtered = refreshedItems.filter((item) => {
        if (options.showDocs === false && item.type === "doc") return false;
        if (options.showBlocks === false && item.type === "block") return false;
        if (options.showFuture === false && item.dueStatus === "future") return false;
        if (!matchesView(item, view, futureDays, today)) return false;
        if (category && item.attrs.category !== category) return false;
        if (priority !== "all" && item.attrs.priority !== priority) return false;
        if (search) {
            const haystack = [
                item.title,
                item.content,
                item.hpath,
                item.path,
                item.attrs.note,
                item.attrs.category,
            ].join(" ").toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    filtered = filtered.sort(compareReviewItems(sortBy));
    if (options.limit && options.limit > 0) {
        return filtered.slice(0, options.limit);
    }
    return filtered;
}

export async function queryReviewItems(
    options: ReviewQueryOptions = {},
    notebookIds: string[] = [],
): Promise<ReviewItem[]> {
    const items = await loadAllReviewItems(undefined, notebookIds);
    return filterAndSortReviewItems(items, options);
}

export function getReviewSummary(items: ReviewItem[], futureDays = 7, today: string = toLocalDateString()): ReviewSummary {
    const summary: ReviewSummary = {
        today: 0,
        overdue: 0,
        future: 0,
        due: 0,
        total: items.length,
        categories: {},
        priorities: {
            high: 0,
            medium: 0,
            low: 0,
        },
    };

    for (const rawItem of items) {
        const item = refreshReviewItemDueStatus(rawItem, today);
        const delta = diffDays(item.attrs.nextDate, today);
        if (delta === 0) summary.today += 1;
        if (delta < 0) summary.overdue += 1;
        if (delta <= 0) summary.due += 1;
        if (delta > 0 && delta <= futureDays) summary.future += 1;
        if (item.attrs.category) {
            summary.categories[item.attrs.category] = (summary.categories[item.attrs.category] || 0) + 1;
        }
        if (item.attrs.priority) {
            summary.priorities[item.attrs.priority] += 1;
        }
    }

    return summary;
}

export async function readCurrentReviewAttrs(targetId: string): Promise<ReviewAttrs | null> {
    const indexed = await getReviewIndexItem<ReviewItem>(targetId);
    return indexed?.attrs?.nextDate ? indexed.attrs : null;
}

function ensurePersistentReviewId(attrs: ReviewAttrs): ReviewAttrs {
    if (!attrs.reviewId) {
        return { ...attrs, reviewId: generateReviewId() };
    }
    return attrs;
}

function buildLogEntry(
    action: ReviewLogAction,
    target: ReviewTargetInfo,
    before: ReviewAttrs,
    after: ReviewAttrs
): ReviewLogEntry {
    const actionAt = new Date().toISOString();
    const snapshot = after.reviewId ? after : before;

    return {
        logId: generateLogId(),
        reviewId: snapshot.reviewId || before.reviewId || generateReviewId(),
        targetId: target.id,
        targetRootId: target.rootId,
        targetType: target.type,
        targetTitle: target.title,
        targetPath: target.hpath || target.path,
        action,
        actionAt,
        previousDueDate: before.nextDate,
        nextDueDate: after.nextDate,
        reviewCountBefore: before.reviewCount,
        reviewCountAfter: after.reviewCount,
        intervalIndexBefore: before.intervalIndex,
        intervalIndexAfter: after.intervalIndex,
        plan: after.plan || before.plan,
        intervals: intervalsToText(after.intervals.length > 0 ? after.intervals : before.intervals),
        category: after.category || before.category,
        priority: after.priority || before.priority,
        note: after.note || before.note,
        createdAt: actionAt,
        archived: "false",
    };
}

function reviewItemFromTarget(target: ReviewTargetInfo, attrs: ReviewAttrs): ReviewItem {
    const { dueStatus, overdueDays } = computeReviewDueStatus(attrs.nextDate);
    return {
        ...target,
        attrs,
        dueStatus,
        overdueDays,
    };
}

async function appendLogSafely(
    entry: ReviewLogEntry
): Promise<string | undefined> {
    try {
        const result = await appendReviewLog(entry);
        if (!result.ok) return result.message;
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : "复习日志记录失败";
    }
}

function attrsAfterClear(): ReviewAttrs {
    return emptyReviewAttrs();
}

async function markReviewTargetUnlocked(params: ReviewPlanOperationParams): Promise<ReviewOperationResult> {
    if (!isValidDateText(params.input.nextDate)) {
        throw new Error("复习日期格式错误");
    }

    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const now = new Date().toISOString();
    const before = await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs();
    assertExpectedReviewUpdatedAt(params.expectedUpdatedAt, before);
    const after = ensurePersistentReviewId({
        ...before,
        nextDate: params.input.nextDate,
        note: params.input.note.trim(),
        category: params.input.category.trim(),
        priority: params.input.priority,
        plan: params.input.plan,
        intervals: params.input.plan === "manual" ? [] : normalizeIntervals(params.input.intervals),
        intervalIndex: 0,
        reviewCount: before.reviewCount || 0,
        lastReviewedAt: before.lastReviewedAt || "",
        targetType: params.targetType,
        createdAt: before.createdAt || now,
        updatedAt: now,
    });

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    const logWarning = await appendLogSafely(
        buildLogEntry(before.reviewId ? "update" : "create", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已保存",
        logWarning,
    };
}

async function updateReviewTargetUnlocked(params: ReviewPlanOperationParams): Promise<ReviewOperationResult> {
    if (!isValidDateText(params.input.nextDate)) {
        throw new Error("复习日期格式错误");
    }

    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const now = new Date().toISOString();
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    assertExpectedReviewUpdatedAt(params.expectedUpdatedAt, before);
    const intervals = params.input.plan === "manual" ? [] : normalizeIntervals(params.input.intervals);
    const nextIntervalIndex = intervals.length > 0
        ? Math.min(before.intervalIndex, Math.max(0, intervals.length - 1))
        : 0;
    const after: ReviewAttrs = {
        ...before,
        nextDate: params.input.nextDate,
        note: params.input.note.trim(),
        category: params.input.category.trim(),
        priority: params.input.priority,
        plan: params.input.plan,
        intervals,
        intervalIndex: nextIntervalIndex,
        targetType: params.targetType,
        createdAt: before.createdAt || now,
        updatedAt: now,
    };

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    const logWarning = await appendLogSafely(
        buildLogEntry("update", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已更新",
        logWarning,
    };
}

async function completeReviewOnceUnlocked(params: CompleteReviewParams): Promise<ReviewOperationResult> {
    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const now = new Date().toISOString();
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    assertExpectedReviewUpdatedAt(params.expectedUpdatedAt, before);
    if (!before.nextDate) {
        throw new Error("当前内容没有有效复习计划");
    }

    let nextDate = "";
    let nextIndex = before.intervalIndex;
    let nextPlan = before.plan || "manual";
    let nextIntervals = before.intervals;

    if (params.manualNextDate) {
        if (!isValidDateText(params.manualNextDate)) {
            throw new Error("下一次复习日期格式错误");
        }
        nextDate = params.manualNextDate;
        if (params.switchToManual) {
            nextPlan = "manual";
            nextIntervals = [];
            nextIndex = 0;
        }
    } else if (shouldUseIntervalSchedule(before)) {
        const next = getNextIntervalReviewDate(before);
        if (!next.hasNext) {
            throw new Error("已完成全部复习间隔，请选择下次日期或结束复习");
        }
        nextDate = next.nextDate;
        nextIndex = next.nextIndex;
    } else {
        throw new Error("手动计划需要先选择下一次复习日期");
    }

    const after: ReviewAttrs = {
        ...before,
        nextDate,
        plan: nextPlan,
        intervals: nextIntervals,
        intervalIndex: nextIndex,
        reviewCount: before.reviewCount + 1,
        lastReviewedAt: now,
        updatedAt: now,
    };

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    const logWarning = await appendLogSafely(
        buildLogEntry("review", target, before, after)
    );

    return {
        ok: true,
        message: "本次复习已完成",
        logWarning,
    };
}

async function postponeReviewTargetUnlocked(params: PostponeReviewParams): Promise<ReviewOperationResult> {
    if (!isValidDateText(params.nextDate)) {
        throw new Error("推迟日期格式错误");
    }

    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    assertExpectedReviewUpdatedAt(params.expectedUpdatedAt, before);
    if (!before.nextDate) {
        throw new Error("当前内容没有有效复习计划");
    }

    const after: ReviewAttrs = {
        ...before,
        nextDate: params.nextDate,
        updatedAt: new Date().toISOString(),
    };

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    const logWarning = await appendLogSafely(
        buildLogEntry("postpone", target, before, after)
    );

    return {
        ok: true,
        message: "复习日期已推迟",
        logWarning,
    };
}

async function finishReviewTargetUnlocked(params: ReviewOperationParams): Promise<ReviewOperationResult> {
    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    assertExpectedReviewUpdatedAt(params.expectedUpdatedAt, before);
    if (!before.nextDate) {
        throw new Error("当前内容没有有效复习计划");
    }

    const after = attrsAfterClear();
    await removeReviewIndexItem(params.targetId);
    const logWarning = await appendLogSafely(
        buildLogEntry("finish", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已结束",
        logWarning,
    };
}

async function clearReviewTargetUnlocked(params: ReviewOperationParams): Promise<ReviewOperationResult> {
    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    assertExpectedReviewUpdatedAt(params.expectedUpdatedAt, before);
    const after = attrsAfterClear();

    await removeReviewIndexItem(params.targetId);
    const logWarning = await appendLogSafely(
        buildLogEntry("remove", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已取消",
        logWarning,
    };
}

export function markReviewTarget(params: ReviewPlanOperationParams): Promise<ReviewOperationResult> {
    return runReviewMutation(() => markReviewTargetUnlocked(params));
}
export function updateReviewTarget(params: ReviewPlanOperationParams): Promise<ReviewOperationResult> {
    return runReviewMutation(() => updateReviewTargetUnlocked(params));
}
export function completeReviewOnce(params: CompleteReviewParams): Promise<ReviewOperationResult> {
    return runReviewMutation(() => completeReviewOnceUnlocked(params));
}
export function postponeReviewTarget(params: PostponeReviewParams): Promise<ReviewOperationResult> {
    return runReviewMutation(() => postponeReviewTargetUnlocked(params));
}
export function finishReviewTarget(params: ReviewOperationParams): Promise<ReviewOperationResult> {
    return runReviewMutation(() => finishReviewTargetUnlocked(params));
}
export function clearReviewTarget(params: ReviewOperationParams): Promise<ReviewOperationResult> {
    return runReviewMutation(() => clearReviewTargetUnlocked(params));
}

export function getDefaultManualNextDate(): string {
    return addDaysFromToday(1);
}
