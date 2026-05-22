import {
    ENHANCED_DIARY_COMPLETION_MARKERS,
    ENHANCED_DIARY_SKIP_MARKERS,
    type EnhancedDiaryConfig,
    type EnhancedDiaryPeriod,
    type EnhancedDiaryPeriodContext,
    type EnhancedDiaryPeriodRange,
    type EnhancedDiaryScanResult,
    type EnhancedDiaryStatus,
    type EnhancedDiaryTemplateContext,
} from "./enhancedDiaryTypes";

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

export function getCompletionMarker(
    period: EnhancedDiaryPeriod,
    completed?: boolean
): string {
    const base = ENHANCED_DIARY_COMPLETION_MARKERS[period];
    if (completed) {
        return base.replace("- [ ]", "- [x]");
    }
    return base;
}

export function getSkipMarker(period: EnhancedDiaryPeriod): string {
    return ENHANCED_DIARY_SKIP_MARKERS[period];
}

export function renderEnhancedDiaryTemplate(
    period: EnhancedDiaryPeriod,
    template: string,
    context: EnhancedDiaryTemplateContext
): string {
    const fallbackMarker = getCompletionMarker(period, false);
    let result = template;
    result = result.replace(/\{\{date\}\}/g, context.date);
    result = result.replace(/\{\{week\}\}/g, context.week ?? "");
    result = result.replace(/\{\{month\}\}/g, context.month ?? "");
    result = result.replace(/\{\{year\}\}/g, context.year ?? "");
    result = result.replace(/\{\{周期范围\}\}/g, context.周期范围 ?? "");
    result = result.replace(/\{\{完成标记\}\}/g, context.完成标记 ?? fallbackMarker);
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

export function scanDiaryContentForPeriod(
    content: string,
    period: EnhancedDiaryPeriod
): EnhancedDiaryScanResult {
    if (!content) {
        return {
            hasCompletionMarker: false,
            completed: false,
            skipped: false,
            hasSkipMarker: false,
        };
    }

    const completionMarker = ENHANCED_DIARY_COMPLETION_MARKERS[period];
    const skipMarker = ENHANCED_DIARY_SKIP_MARKERS[period];

    const uncheckedCompletion = completionMarker;
    const checkedCompletionX = completionMarker.replace("- [ ]", "- [x]");
    const checkedCompletionXUpper = completionMarker.replace("- [ ]", "- [X]");
    const checkedSkipX = skipMarker;
    const checkedSkipXUpper = skipMarker.replace("- [x]", "- [X]");

    const hasUncheckedCompletion = content.includes(uncheckedCompletion);
    const isCompletedX = content.includes(checkedCompletionX);
    const isCompletedXUpper = content.includes(checkedCompletionXUpper);
    const isSkippedX = content.includes(checkedSkipX);
    const isSkippedXUpper = content.includes(checkedSkipXUpper);

    const completed = isCompletedX || isCompletedXUpper;
    const skipped = isSkippedX || isSkippedXUpper;
    const hasCompletionMarker = hasUncheckedCompletion || completed;
    const hasSkipMarker = skipped;

    let markerText: string | undefined;
    if (skipped) {
        markerText = isSkippedX ? checkedSkipX : checkedSkipXUpper;
    } else if (completed) {
        markerText = isCompletedX ? checkedCompletionX : checkedCompletionXUpper;
    } else if (hasUncheckedCompletion) {
        markerText = uncheckedCompletion;
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

    if (!docExists) {
        return "not_created";
    }

    const scanResult = scanDiaryContentForPeriod(content, period);

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
