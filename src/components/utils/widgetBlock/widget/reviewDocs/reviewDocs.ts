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
import {
    getReviewIndexResult,
    getReviewIndexItem,
    mergeReviewIndexItems,
    removeReviewIndexItem,
    runHomepageManualIndexSqlQuery,
    updateReviewIndexItem,
    type ComponentDataResult,
} from "@/components/tools/siyuanComponentDataApi";
import type { ComponentMigrationStatus } from "../common/componentMigrationTypes";
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
const REVIEW_MIGRATION_PAGE_SIZE = 500;
const REVIEW_MIGRATION_MAX_ROWS = 50000;

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

function reviewItemFromGlobalSqlRow(row: any): ReviewItem | null {
    const attrs = parseReviewAttrsFromIAL(row?.ial);
    if (!attrs?.nextDate) return null;
    const type: ReviewTargetType = row?.type === "d" ? "doc" : "block";
    const target = normalizeBlockRow(row, type);
    if (!target.id) return null;
    return reviewItemFromTarget(target, attrs);
}

export async function migrateReviewIndexFromGlobalSql(
    plugin: any,
    notebookIds: string[] = [],
): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    if (!plugin) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: "缺少插件实例，无法执行旧复习迁移。",
            migratedCount: 0,
            skippedCount: 0,
        };
    }

    try {
        const selectedNotebookIds = notebookIds.filter(Boolean);
        const itemMap = new Map<string, ReviewItem>();
        let totalSkipped = 0;
        let totalCleanupFailed = 0;
        let reachedLimit = false;

        for (let offset = 0; offset < REVIEW_MIGRATION_MAX_ROWS; offset += REVIEW_MIGRATION_PAGE_SIZE) {
            const stmt = `
                SELECT id, content, created, updated, box, path, hpath, ial, type, parent_id, root_id
                FROM blocks
                WHERE ial LIKE '%custom-homepage-review-next-date%'
                ORDER BY updated DESC, id DESC
                LIMIT ${REVIEW_MIGRATION_PAGE_SIZE} OFFSET ${offset}
            `;
            const result = await runHomepageManualIndexSqlQuery(plugin, stmt);
            if (result.ok === false) {
                return {
                    lastRunAt: now,
                    lastStatus: "error",
                    lastMessage: result.reason,
                    migratedCount: 0,
                    skippedCount: 0,
                };
            }

            const rows = result.rows;
            if (rows.length === 0) break;

            const pageItems: ReviewItem[] = [];
            const migratedIds: string[] = [];
            let pageSkipped = 0;

            for (const row of rows) {
                let item: ReviewItem | null = null;
                try {
                    item = reviewItemFromGlobalSqlRow(row);
                } catch {
                    item = null;
                }
                if (!item?.id) {
                    pageSkipped += 1;
                    continue;
                }
                if (selectedNotebookIds.length > 0 && !(item.box && selectedNotebookIds.includes(item.box))) {
                    pageSkipped += 1;
                    continue;
                }
                itemMap.set(item.id, item);
                pageItems.push(item);
                migratedIds.push(item.id);
            }

            if (pageItems.length > 0) {
                await mergeReviewIndexItems(pageItems);
            }
            totalSkipped += pageSkipped;

            let pageCleanupFailed = 0;
            for (const id of migratedIds) {
                try {
                    await setBlockAttrsChecked(id, createClearReviewAttrsMap());
                } catch {
                    pageCleanupFailed += 1;
                }
            }
            totalCleanupFailed += pageCleanupFailed;

            if (rows.length < REVIEW_MIGRATION_PAGE_SIZE) break;
            if (offset + REVIEW_MIGRATION_PAGE_SIZE >= REVIEW_MIGRATION_MAX_ROWS) {
                reachedLimit = true;
                break;
            }
        }

        const migratedCount = itemMap.size;
        const lastMessage = reachedLimit
            ? `旧复习迁移达到 ${REVIEW_MIGRATION_MAX_ROWS} 条安全上限，可能仍有未迁移数据；已迁移 ${migratedCount} 条，跳过 ${totalSkipped} 条，${totalCleanupFailed} 条旧属性清理失败。`
            : migratedCount > 0
                ? totalCleanupFailed > 0
                    ? `迁移完成：写入/更新 ${migratedCount} 条，跳过 ${totalSkipped} 条，${totalCleanupFailed} 条旧属性清理失败。`
                    : `迁移完成：写入/更新 ${migratedCount} 条，跳过 ${totalSkipped} 条，并已清理旧属性。`
                : totalSkipped > 0
                    ? "未找到符合当前笔记本范围的可迁移复习数据。"
                    : "未找到需要迁移的旧复习数据。";

        return {
            lastRunAt: now,
            lastStatus: "success",
            lastMessage,
            migratedCount,
            skippedCount: totalSkipped,
            cleanedCount: Math.max(0, migratedCount - totalCleanupFailed),
            cleanupFailedCount: totalCleanupFailed,
        };
    } catch (error) {
        return {
            lastRunAt: now,
            lastStatus: "error",
            lastMessage: error instanceof Error ? error.message : "旧复习迁移失败",
            migratedCount: 0,
            skippedCount: 0,
        };
    }
}

export async function loadAllReviewItemsResult(
    plugin?: any,
    notebookIds: string[] = [],
): Promise<ComponentDataResult<ReviewItem>> {
    void plugin;
    const result = await getReviewIndexResult<any>();
    const items = filterReviewItemsByNotebooks(
        (result as ComponentDataResult<ReviewItem>).items,
        notebookIds,
    );
    return {
        ...(result as ComponentDataResult<ReviewItem>),
        items,
        status: items.length > 0 ? "ok" : (items.length === 0 && notebookIds.length > 0 ? "empty" : (result as ComponentDataResult<ReviewItem>).status),
    };
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

export async function queryReviewItems(
    options: ReviewQueryOptions = {},
    notebookIds: string[] = [],
): Promise<ReviewItem[]> {
    const items = await loadAllReviewItems(undefined, notebookIds);
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

export async function readCurrentReviewAttrs(targetId: string): Promise<ReviewAttrs | null> {
    const indexed = await getReviewIndexItem<ReviewItem>(targetId);
    if (indexed?.attrs?.nextDate) return indexed.attrs;
    const attrs = await getBlockAttrs(targetId);
    return parseReviewAttrsFromBlockAttrs(attrs);
}

async function clearLegacyReviewAttrsSafely(targetId: string): Promise<void> {
    try {
        await setBlockAttrsChecked(targetId, createClearReviewAttrsMap());
    } catch {
        // 清理旧复习属性失败不影响本地索引状态。
    }
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

function reviewItemFromTarget(target: ReviewTargetInfo, attrs: ReviewAttrs): ReviewItem {
    const today = toLocalDateString();
    const daysFromToday = diffDays(attrs.nextDate, today);
    const dueStatus = daysFromToday < 0 ? "overdue" : daysFromToday === 0 ? "today" : "future";
    return {
        ...target,
        attrs,
        dueStatus,
        overdueDays: daysFromToday < 0 ? Math.abs(daysFromToday) : 0,
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

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    await clearLegacyReviewAttrsSafely(params.targetId);
    const logWarning = await appendLogSafely(
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

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    await clearLegacyReviewAttrsSafely(params.targetId);
    const logWarning = await appendLogSafely(
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

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    await clearLegacyReviewAttrsSafely(params.targetId);
    const logWarning = await appendLogSafely(
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

    await updateReviewIndexItem(reviewItemFromTarget(target, after));
    await clearLegacyReviewAttrsSafely(params.targetId);
    const logWarning = await appendLogSafely(
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
    await removeReviewIndexItem(params.targetId);
    await clearLegacyReviewAttrsSafely(params.targetId);
    const logWarning = await appendLogSafely(
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

    await removeReviewIndexItem(params.targetId);
    await clearLegacyReviewAttrsSafely(params.targetId);
    const logWarning = await appendLogSafely(
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
