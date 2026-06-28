import {
    ENHANCED_DIARY_COMPLETION_MARKERS_LEGACY,
    ENHANCED_DIARY_PERIODS,
    ENHANCED_DIARY_SKIP_MARKERS,
    type EnhancedDiaryConfig,
    type EnhancedDiaryPeriod,
    type EnhancedDiaryPeriodContext,
    type EnhancedDiaryPeriodRange,
    type EnhancedDiaryScanResult,
    type EnhancedDiaryStatus,
    type EnhancedDiaryTemplateContext,
} from "./enhancedDiaryTypes";
import {
    ENHANCED_DIARY_COMPLETED_SUFFIX,
    findRootHeading,
} from "./enhancedDiaryMarkdownSections";
import type { EnhancedDiaryTemplateFieldMapping } from "./enhancedDiaryTypes";

interface EnhancedDiaryStatusArgs {
    docExists: boolean;
    content: string;
    period: EnhancedDiaryPeriod;
    baseDate: Date;
    targetDate?: Date;
    config: EnhancedDiaryConfig;
}

export function formatDiaryDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * 新版完成标记已取消，此函数保留签名但返回空字符串，
 * 用于兼容仍引用该函数的代码；旧模板中的 {{完成标记}} 会被渲染为空。
 */
export function getCompletionMarker(
    _period: EnhancedDiaryPeriod,
    _completed?: boolean
): string {
    return "";
}

/** 旧版任务列表式完成标记，仅用于兼容历史日记。 */
export function getLegacyCompletionMarker(
    period: EnhancedDiaryPeriod,
    completed?: boolean
): string {
    const base = ENHANCED_DIARY_COMPLETION_MARKERS_LEGACY[period];
    if (completed) {
        return base.replace("- [ ]", "- [x]");
    }
    return base;
}

export function getSkipMarker(period: EnhancedDiaryPeriod): string {
    return ENHANCED_DIARY_SKIP_MARKERS[period];
}

function firstTaskLine(markdown: string): string {
    return (markdown || "").split("\n\n")[0]?.split("\n")[0]?.trim() || "";
}

/** 判断一行 Markdown 是否为强化日记系统标记（旧完成标记/跳过标记），避免被任务中心当作普通任务。 */
export function isEnhancedDiarySystemTaskMarkdown(markdown: string): boolean {
    const text = firstTaskLine(markdown);
    if (!text) return false;
    for (const period of ENHANCED_DIARY_PERIODS) {
        const legacyUnchecked = getLegacyCompletionMarker(period, false);
        const legacyChecked = getLegacyCompletionMarker(period, true);
        const legacyCheckedUpper = legacyChecked.replace("[x]", "[X]");
        const skip = getSkipMarker(period);
        const skipUpper = skip.replace("[x]", "[X]");
        if (
            text === legacyUnchecked ||
            text === legacyChecked ||
            text === legacyCheckedUpper ||
            text === skip ||
            text === skipUpper
        ) {
            return true;
        }
    }
    return false;
}

export function renderEnhancedDiaryTemplate(
    _period: EnhancedDiaryPeriod,
    template: string,
    context: EnhancedDiaryTemplateContext
): string {
    let result = template;
    result = result.replace(/\{\{date\}\}/g, context.date);
    result = result.replace(/\{\{week\}\}/g, context.week ?? "");
    result = result.replace(/\{\{month\}\}/g, context.month ?? "");
    result = result.replace(/\{\{year\}\}/g, context.year ?? "");
    result = result.replace(/\{\{周期范围\}\}/g, context.周期范围 ?? "");
    // 新版完成标记已取消，旧模板中的变量渲染为空，避免继续产生标记行。
    result = result.replace(/\{\{完成标记\}\}/g, context.完成标记 ?? "");
    result = result.replace(/\{\{开始日期\}\}/g, context.开始日期 ?? "");
    result = result.replace(/\{\{结束日期\}\}/g, context.结束日期 ?? "");
    return result;
}

function cloneDate(date: Date): Date {
    return new Date(date.getTime());
}

function getMondayOfWeek(date: Date): Date {
    const d = cloneDate(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
}

function getLastDayOfMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

export function getPeriodTargetDate(
    period: EnhancedDiaryPeriod,
    baseDate: Date,
    config: EnhancedDiaryConfig
): Date {
    const d = cloneDate(baseDate);

    switch (period) {
        case "day":
            return d;

        case "week": {
            const monday = getMondayOfWeek(baseDate);
            const weekday = config.weekReviewDay;
            const targetOffset = weekday === 0 ? 6 : weekday - 1;
            const target = cloneDate(monday);
            target.setDate(target.getDate() + targetOffset);
            return target;
        }

        case "month": {
            if (config.monthReviewRule === "nextMonthFirst") {
                const safe = cloneDate(baseDate);
                safe.setDate(1);
                safe.setMonth(safe.getMonth() + 1);
                safe.setDate(1);
                return safe;
            }
            const lastDay = getLastDayOfMonth(d.getFullYear(), d.getMonth());
            d.setDate(lastDay);
            return d;
        }

        case "year": {
            if (config.yearReviewRule === "nextJan1") {
                d.setFullYear(d.getFullYear() + 1);
                d.setMonth(0);
                d.setDate(1);
                return d;
            }
            d.setMonth(11);
            d.setDate(31);
            return d;
        }

        default:
            return d;
    }
}

export function getPeriodRange(
    period: EnhancedDiaryPeriod,
    baseDate: Date,
    config: EnhancedDiaryConfig
): EnhancedDiaryPeriodRange {
    void (config satisfies EnhancedDiaryConfig);
    const yyyy = baseDate.getFullYear();
    const mm = baseDate.getMonth();

    switch (period) {
        case "day": {
            const dateStr = formatDiaryDate(baseDate);
            return { start: dateStr, end: dateStr };
        }

        case "week": {
            const monday = getMondayOfWeek(baseDate);
            const sunday = cloneDate(monday);
            sunday.setDate(sunday.getDate() + 6);
            return {
                start: formatDiaryDate(monday),
                end: formatDiaryDate(sunday),
            };
        }

        case "month": {
            const firstDay = new Date(yyyy, mm, 1);
            const lastDay = new Date(yyyy, mm, getLastDayOfMonth(yyyy, mm));
            return {
                start: formatDiaryDate(firstDay),
                end: formatDiaryDate(lastDay),
            };
        }

        case "year": {
            const firstDay = new Date(yyyy, 0, 1);
            const lastDay = new Date(yyyy, 11, 31);
            return {
                start: formatDiaryDate(firstDay),
                end: formatDiaryDate(lastDay),
            };
        }

        default:
            return { start: "", end: "" };
    }
}

export function getPeriodContext(
    period: EnhancedDiaryPeriod,
    baseDate: Date,
    config: EnhancedDiaryConfig
): EnhancedDiaryPeriodContext {
    const range = getPeriodRange(period, baseDate, config);
    const targetDate = getPeriodTargetDate(period, baseDate, config);

    const templateContext: EnhancedDiaryTemplateContext = {
        period,
        date: formatDiaryDate(targetDate),
        week: period === "week" ? `${range.start} 至 ${range.end}` : "",
        month: range.start.slice(0, 7),
        year: range.start.slice(0, 4),
        周期范围: `${range.start} 至 ${range.end}`,
        开始日期: range.start,
        结束日期: range.end,
        完成标记: getCompletionMarker(period, false),
    };

    return {
        period,
        range,
        targetDate,
        templateContext,
    };
}

export function getPreviousPeriodContext(
    period: EnhancedDiaryPeriod,
    baseDate: Date,
    config: EnhancedDiaryConfig
): EnhancedDiaryPeriodContext {
    const prevDate = cloneDate(baseDate);

    switch (period) {
        case "day":
            prevDate.setDate(prevDate.getDate() - 1);
            break;

        case "week":
            prevDate.setDate(prevDate.getDate() - 7);
            break;

        case "month":
            prevDate.setDate(1);
            prevDate.setMonth(prevDate.getMonth() - 1);
            break;

        case "year":
            prevDate.setFullYear(prevDate.getFullYear() - 1);
            break;
    }

    return getPeriodContext(period, prevDate, config);
}

export function isPeriodDue(
    period: EnhancedDiaryPeriod,
    baseDate: Date,
    config: EnhancedDiaryConfig
): boolean {
    if (period === "day") {
        return true;
    }

    const targetDate = getPeriodTargetDate(period, baseDate, config);
    const baseDateStr = formatDiaryDate(baseDate);
    const targetDateStr = formatDiaryDate(targetDate);
    return baseDateStr >= targetDateStr;
}

export function isReviewReminderWindowActive(
    period: EnhancedDiaryPeriod,
    baseDate: Date,
    targetDate: Date,
    config: EnhancedDiaryConfig
): boolean {
    if (period === "day") {
        return true;
    }

    const window = config.reviewReminderWindows?.[period as "week" | "month" | "year"];
    if (!window) {
        return true;
    }

    const baseStr = formatDiaryDate(baseDate);
    const beforeDate = new Date(targetDate.getTime());
    beforeDate.setDate(beforeDate.getDate() - window.beforeDays);
    const afterDate = new Date(targetDate.getTime());
    afterDate.setDate(afterDate.getDate() + window.afterDays);

    const beforeStr = formatDiaryDate(beforeDate);
    const afterStr = formatDiaryDate(afterDate);

    return baseStr >= beforeStr && baseStr <= afterStr;
}

const EMPTY_SCAN: EnhancedDiaryScanResult = {
    hasCompletionMarker: false,
    completed: false,
    skipped: false,
    hasSkipMarker: false,
};

function hasRootHeading(
    content: string,
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): boolean {
    return findRootHeading(content, period, undefined, mapping).found;
}

function isHeadingWithCompletedSuffix(
    content: string,
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): boolean {
    const result = findRootHeading(content, period, undefined, mapping);
    if (!result.found || !result.node) return false;
    return result.node.title.trim().endsWith(ENHANCED_DIARY_COMPLETED_SUFFIX);
}

export function scanDiaryContentForPeriod(
    content: string,
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryScanResult {
    if (!content) {
        return EMPTY_SCAN;
    }

    const rootFound = hasRootHeading(content, period, mapping);

    // 旧版任务列表式完成标记，保留兼容
    const legacyUnchecked = getLegacyCompletionMarker(period, false);
    const legacyCheckedX = getLegacyCompletionMarker(period, true);
    const legacyCheckedXUpper = legacyCheckedX.replace("[x]", "[X]");

    const skipMarker = ENHANCED_DIARY_SKIP_MARKERS[period];
    const checkedSkipX = skipMarker;
    const checkedSkipXUpper = skipMarker.replace("- [x]", "- [X]");

    const hasLegacyUnchecked = content.includes(legacyUnchecked);
    const isLegacyCompletedX = content.includes(legacyCheckedX);
    const isLegacyCompletedXUpper = content.includes(legacyCheckedXUpper);
    const isSkippedX = content.includes(checkedSkipX);
    const isSkippedXUpper = content.includes(checkedSkipXUpper);

    const skipped = isSkippedX || isSkippedXUpper;
    const headingCompleted = isHeadingWithCompletedSuffix(content, period, mapping);
    const legacyCompleted = isLegacyCompletedX || isLegacyCompletedXUpper;
    const completed = headingCompleted || legacyCompleted;

    // 只要存在可识别的顶级标题，就认为存在可判断状态的结构。
    // 旧版完成/未完成标记也视为可判断状态的结构，用于兼容旧数据。
    const hasCompletionMarker = rootFound || hasLegacyUnchecked || legacyCompleted;
    const hasSkipMarker = skipped;

    let markerText: string | undefined;
    if (skipped) {
        markerText = isSkippedX ? checkedSkipX : checkedSkipXUpper;
    } else if (isLegacyCompletedX) {
        markerText = legacyCheckedX;
    } else if (isLegacyCompletedXUpper) {
        markerText = legacyCheckedXUpper;
    } else if (hasLegacyUnchecked) {
        markerText = legacyUnchecked;
    }

    return {
        hasCompletionMarker,
        completed,
        skipped,
        hasSkipMarker,
        markerText,
    };
}

export function getEnhancedDiaryStatus(
    args: EnhancedDiaryStatusArgs
): EnhancedDiaryStatus {
    const { docExists, content, period, baseDate, targetDate, config } = args;

    if (period !== "day") {
        const effectiveTarget = targetDate || getPeriodTargetDate(period, baseDate, config);
        if (!isReviewReminderWindowActive(period, baseDate, effectiveTarget, config)) {
            return "not_due";
        }
    }

    if (!docExists) {
        return "not_created";
    }

    const scanResult = scanDiaryContentForPeriod(content, period, config.templateFieldMapping);

    if (scanResult.skipped) {
        return "skipped";
    }

    if (!scanResult.hasCompletionMarker) {
        return "missing_template";
    }

    if (scanResult.completed) {
        return "completed";
    }

    if (period === "day") {
        return "pending";
    }

    let due: boolean;
    if (targetDate) {
        due = formatDiaryDate(baseDate) >= formatDiaryDate(targetDate);
    } else {
        due = isPeriodDue(period, baseDate, config);
    }
    if (!due) {
        return "not_due";
    }

    return "overdue";
}
