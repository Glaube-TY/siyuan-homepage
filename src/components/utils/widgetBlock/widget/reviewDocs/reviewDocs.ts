import {
    getBlockAttrs,
    setBlockAttrsChecked,
    sql,
} from "@/api";
import {
    addDaysFromToday,
    diffDays,
    getNextIntervalReviewDate,
    intervalsToText,
    isValidDateText,
    normalizeIntervals,
    normalizeReviewDate,
    shouldUseIntervalSchedule,
    toLocalDateString,
} from "./reviewDocsSchedule";
import { appendReviewLog } from "./reviewDocsData";
import type {
    CompleteReviewParams,
    PostponeReviewParams,
    ReviewAttrs,
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

export const REVIEW_ATTR_KEYS = {
    reviewId: "custom-homepage-review-id",
    nextDate: "custom-homepage-review-next-date",
    note: "custom-homepage-review-note",
    category: "custom-homepage-review-category",
    priority: "custom-homepage-review-priority",
    plan: "custom-homepage-review-plan",
    intervals: "custom-homepage-review-intervals",
    intervalIndex: "custom-homepage-review-interval-index",
    reviewCount: "custom-homepage-review-count",
    lastReviewedAt: "custom-homepage-review-last-reviewed-at",
    targetType: "custom-homepage-review-target-type",
    createdAt: "custom-homepage-review-created-at",
    updatedAt: "custom-homepage-review-updated-at",
} as const;

const REVIEW_ATTR_KEY_SET = new Set<string>(Object.values(REVIEW_ATTR_KEYS));

export interface ReviewOperationResult {
    ok: boolean;
    message: string;
    logWarning?: string;
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

function safeNumber(value: unknown, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizePriority(value: string): ReviewPriority {
    if (value === "high" || value === "medium" || value === "low") return value;
    return "";
}

function normalizeTargetType(value: string): ReviewTargetType | "" {
    if (value === "doc" || value === "block") return value;
    return "";
}

function normalizePlan(value: string): ReviewAttrs["plan"] {
    if (value === "manual" || value === "ebbinghaus" || value === "custom") return value;
    return "";
}

function generateReviewId(): string {
    return `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateLogId(): string {
    return `review-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function simpleHash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

function isTemporaryReviewId(value: string): boolean {
    return value.startsWith("review-temp-");
}

function unescapeIALValue(value: string): string {
    return value
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\");
}

function attrsFromRawMap(raw: Record<string, string>, fallbackReviewIdSeed = ""): ReviewAttrs | null {
    const nextDate = normalizeReviewDate(raw[REVIEW_ATTR_KEYS.nextDate] || "", "");
    if (!nextDate) return null;

    const intervals = normalizeIntervals(
        (raw[REVIEW_ATTR_KEYS.intervals] || "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .map(Number)
    );
    const reviewId =
        raw[REVIEW_ATTR_KEYS.reviewId] ||
        `review-temp-${simpleHash(`${fallbackReviewIdSeed}:${nextDate}`)}`;

    return {
        reviewId,
        nextDate,
        note: raw[REVIEW_ATTR_KEYS.note] || "",
        category: raw[REVIEW_ATTR_KEYS.category] || "",
        priority: normalizePriority(raw[REVIEW_ATTR_KEYS.priority] || ""),
        plan: normalizePlan(raw[REVIEW_ATTR_KEYS.plan] || ""),
        intervals,
        intervalIndex: Math.max(0, safeNumber(raw[REVIEW_ATTR_KEYS.intervalIndex], 0)),
        reviewCount: Math.max(0, safeNumber(raw[REVIEW_ATTR_KEYS.reviewCount], 0)),
        lastReviewedAt: raw[REVIEW_ATTR_KEYS.lastReviewedAt] || "",
        targetType: normalizeTargetType(raw[REVIEW_ATTR_KEYS.targetType] || ""),
        createdAt: raw[REVIEW_ATTR_KEYS.createdAt] || "",
        updatedAt: raw[REVIEW_ATTR_KEYS.updatedAt] || "",
    };
}

export function parseReviewAttrsFromIAL(ial: string): ReviewAttrs | null {
    if (!ial || !ial.includes(REVIEW_ATTR_KEYS.nextDate)) return null;

    const raw: Record<string, string> = {};
    const regex = /([\w-]+)\s*=\s*"((?:\\.|[^"\\])*)"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(ial)) !== null) {
        if (REVIEW_ATTR_KEY_SET.has(match[1])) {
            raw[match[1]] = unescapeIALValue(match[2]);
        }
    }

    return attrsFromRawMap(raw, ial);
}

export function parseReviewAttrsFromBlockAttrs(attrs: Record<string, string> | null | undefined): ReviewAttrs | null {
    if (!attrs) return null;
    return attrsFromRawMap(attrs);
}

export function createClearReviewAttrsMap(): Record<string, string> {
    return Object.values(REVIEW_ATTR_KEYS).reduce<Record<string, string>>((result, key) => {
        result[key] = "";
        return result;
    }, {});
}

function createReviewAttrsMap(attrs: ReviewAttrs): Record<string, string> {
    return {
        [REVIEW_ATTR_KEYS.reviewId]: attrs.reviewId,
        [REVIEW_ATTR_KEYS.nextDate]: attrs.nextDate,
        [REVIEW_ATTR_KEYS.note]: attrs.note,
        [REVIEW_ATTR_KEYS.category]: attrs.category,
        [REVIEW_ATTR_KEYS.priority]: attrs.priority,
        [REVIEW_ATTR_KEYS.plan]: attrs.plan,
        [REVIEW_ATTR_KEYS.intervals]: intervalsToText(attrs.intervals),
        [REVIEW_ATTR_KEYS.intervalIndex]: String(attrs.intervalIndex),
        [REVIEW_ATTR_KEYS.reviewCount]: String(attrs.reviewCount),
        [REVIEW_ATTR_KEYS.lastReviewedAt]: attrs.lastReviewedAt,
        [REVIEW_ATTR_KEYS.targetType]: attrs.targetType,
        [REVIEW_ATTR_KEYS.createdAt]: attrs.createdAt,
        [REVIEW_ATTR_KEYS.updatedAt]: attrs.updatedAt,
    };
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

export async function getReviewTargetInfo(
    targetId: string,
    targetType: ReviewTargetType
): Promise<ReviewTargetInfo> {
    const rows = await sql(`
        SELECT
          id,
          parent_id,
          root_id,
          box,
          path,
          hpath,
          name,
          alias,
          content,
          fcontent,
          markdown,
          type,
          created,
          updated
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

function rowToReviewItem(row: any): ReviewItem | null {
    const attrs = parseReviewAttrsFromIAL(row?.ial || "");
    if (!attrs) return null;

    const targetType = attrs.targetType || (row?.type === "d" ? "doc" : "block");
    const info = normalizeBlockRow(row, targetType);
    const today = toLocalDateString();
    const daysFromToday = diffDays(attrs.nextDate, today);
    const dueStatus = daysFromToday < 0 ? "overdue" : daysFromToday === 0 ? "today" : "future";

    return {
        ...info,
        attrs: {
            ...attrs,
            targetType,
        },
        dueStatus,
        overdueDays: daysFromToday < 0 ? Math.abs(daysFromToday) : 0,
    };
}

export async function loadAllReviewItems(): Promise<ReviewItem[]> {
    const rows = await sql(`
        SELECT
          id,
          parent_id,
          root_id,
          hash,
          box,
          path,
          hpath,
          name,
          alias,
          memo,
          tag,
          content,
          fcontent,
          markdown,
          length,
          type,
          subtype,
          ial,
          sort,
          created,
          updated
        FROM blocks
        WHERE ial REGEXP 'custom-homepage-review-next-date\\\\s*=\\\\s*"[0-9]{4}-[0-9]{2}-[0-9]{2}"'
        ORDER BY updated DESC
    `);

    return (rows || [])
        .map(rowToReviewItem)
        .filter((item): item is ReviewItem => item !== null);
}

function matchesView(item: ReviewItem, view: ReviewView, futureDays: number): boolean {
    const today = toLocalDateString();
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
    options: ReviewQueryOptions = {}
): ReviewItem[] {
    const view = options.view || "due";
    const sortBy = options.sortBy || "dueAsc";
    const futureDays = Math.max(1, Number(options.futureDays) || 7);
    const search = (options.search || "").trim().toLowerCase();
    const category = (options.category || "").trim();
    const priority = options.priority || "all";

    let filtered = items.filter((item) => {
        if (options.showDocs === false && item.type === "doc") return false;
        if (options.showBlocks === false && item.type === "block") return false;
        if (options.showFuture === false && item.dueStatus === "future") return false;
        if (!matchesView(item, view, futureDays)) return false;
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

export async function queryReviewItems(options: ReviewQueryOptions = {}): Promise<ReviewItem[]> {
    const items = await loadAllReviewItems();
    return filterAndSortReviewItems(items, options);
}

export function getReviewSummary(items: ReviewItem[], futureDays = 7): ReviewSummary {
    const today = toLocalDateString();
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

    for (const item of items) {
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

async function readCurrentReviewAttrs(targetId: string): Promise<ReviewAttrs | null> {
    const attrs = await getBlockAttrs(targetId);
    return parseReviewAttrsFromBlockAttrs(attrs);
}

function ensurePersistentReviewId(attrs: ReviewAttrs): ReviewAttrs {
    if (!attrs.reviewId || isTemporaryReviewId(attrs.reviewId)) {
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

async function appendLogSafely(
    databaseId: string | undefined,
    entry: ReviewLogEntry
): Promise<string | undefined> {
    try {
        const result = await appendReviewLog(databaseId, entry);
        if (!result.ok) return result.message;
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : "复习日志记录失败";
    }
}

function attrsAfterClear(): ReviewAttrs {
    return emptyReviewAttrs();
}

export async function markReviewTarget(params: ReviewPlanOperationParams): Promise<ReviewOperationResult> {
    if (!isValidDateText(params.input.nextDate)) {
        throw new Error("复习日期格式错误");
    }

    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const now = new Date().toISOString();
    const before = await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs();
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

    await setBlockAttrsChecked(params.targetId, createReviewAttrsMap(after));
    const logWarning = await appendLogSafely(
        params.databaseId,
        buildLogEntry(before.reviewId ? "update" : "create", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已保存",
        logWarning,
    };
}

export async function updateReviewTarget(params: ReviewPlanOperationParams): Promise<ReviewOperationResult> {
    if (!isValidDateText(params.input.nextDate)) {
        throw new Error("复习日期格式错误");
    }

    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const now = new Date().toISOString();
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
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

    await setBlockAttrsChecked(params.targetId, createReviewAttrsMap(after));
    const logWarning = await appendLogSafely(
        params.databaseId,
        buildLogEntry("update", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已更新",
        logWarning,
    };
}

export async function completeReviewOnce(params: CompleteReviewParams): Promise<ReviewOperationResult> {
    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const now = new Date().toISOString();
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
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

    await setBlockAttrsChecked(params.targetId, createReviewAttrsMap(after));
    const logWarning = await appendLogSafely(
        params.databaseId,
        buildLogEntry("review", target, before, after)
    );

    return {
        ok: true,
        message: "本次复习已完成",
        logWarning,
    };
}

export async function postponeReviewTarget(params: PostponeReviewParams): Promise<ReviewOperationResult> {
    if (!isValidDateText(params.nextDate)) {
        throw new Error("推迟日期格式错误");
    }

    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    if (!before.nextDate) {
        throw new Error("当前内容没有有效复习计划");
    }

    const after: ReviewAttrs = {
        ...before,
        nextDate: params.nextDate,
        updatedAt: new Date().toISOString(),
    };

    await setBlockAttrsChecked(params.targetId, createReviewAttrsMap(after));
    const logWarning = await appendLogSafely(
        params.databaseId,
        buildLogEntry("postpone", target, before, after)
    );

    return {
        ok: true,
        message: "复习日期已推迟",
        logWarning,
    };
}

export async function finishReviewTarget(params: ReviewOperationParams): Promise<ReviewOperationResult> {
    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    if (!before.nextDate) {
        throw new Error("当前内容没有有效复习计划");
    }

    const after = attrsAfterClear();
    await setBlockAttrsChecked(params.targetId, createClearReviewAttrsMap());
    const logWarning = await appendLogSafely(
        params.databaseId,
        buildLogEntry("finish", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已结束",
        logWarning,
    };
}

export async function clearReviewTarget(params: ReviewOperationParams): Promise<ReviewOperationResult> {
    const target = await getReviewTargetInfo(params.targetId, params.targetType);
    const before = ensurePersistentReviewId(await readCurrentReviewAttrs(params.targetId) || emptyReviewAttrs());
    const after = attrsAfterClear();

    await setBlockAttrsChecked(params.targetId, createClearReviewAttrsMap());
    const logWarning = await appendLogSafely(
        params.databaseId,
        buildLogEntry("remove", target, before, after)
    );

    return {
        ok: true,
        message: "复习计划已取消",
        logWarning,
    };
}

export function getDefaultManualNextDate(): string {
    return addDaysFromToday(1);
}
