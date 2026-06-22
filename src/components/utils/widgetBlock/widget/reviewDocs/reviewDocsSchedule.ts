import type { ReviewAttrs } from "./reviewDocsTypes";

export const DEFAULT_REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60];
export const DEFAULT_REVIEW_INTERVALS_TEXT = DEFAULT_REVIEW_INTERVALS.join(",");

export function toLocalDateString(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function addDays(dateText: string, days: number): string {
    const base = parseDateOnly(dateText) || new Date();
    base.setDate(base.getDate() + days);
    return toLocalDateString(base);
}

export function addDaysFromToday(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toLocalDateString(date);
}

export function isValidDateText(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const parsed = parseDateOnly(value);
    return Boolean(parsed && toLocalDateString(parsed) === value);
}

export function parseDateOnly(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }
    return date;
}

export function diffDays(left: string, right: string): number {
    const leftDate = parseDateOnly(left);
    const rightDate = parseDateOnly(right);
    if (!leftDate || !rightDate) return 0;

    const dayMs = 24 * 60 * 60 * 1000;
    return Math.round((leftDate.getTime() - rightDate.getTime()) / dayMs);
}

export function parseIntervalsText(value: string): number[] {
    const text = (value || "").trim();
    if (!text) {
        throw new Error("间隔天数不能为空");
    }

    const parts = text.split(",").map((part) => part.trim());
    if (parts.length > 20) {
        throw new Error("自定义间隔最多支持 20 个");
    }

    const intervals = parts.map((part) => {
        if (!/^\d+$/.test(part)) {
            throw new Error("间隔天数只能包含 0 和正整数，并使用英文逗号分隔");
        }
        return Number(part);
    });

    if (intervals.length === 0) {
        throw new Error("间隔天数不能为空");
    }

    return intervals;
}

export function intervalsToText(intervals: number[]): string {
    const normalized = normalizeIntervals(intervals);
    return normalized.length > 0 ? normalized.join(",") : DEFAULT_REVIEW_INTERVALS_TEXT;
}

export function normalizeIntervals(intervals: unknown): number[] {
    if (!Array.isArray(intervals)) return [];
    return intervals
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0)
        .slice(0, 20);
}

export function getNextIntervalReviewDate(attrs: ReviewAttrs): {
    hasNext: boolean;
    nextDate: string;
    nextIndex: number;
} {
    const intervals = normalizeIntervals(attrs.intervals);
    const currentIndex = Number.isInteger(attrs.intervalIndex) ? attrs.intervalIndex : 0;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= intervals.length) {
        return {
            hasNext: false,
            nextDate: "",
            nextIndex,
        };
    }

    return {
        hasNext: true,
        nextDate: addDaysFromToday(intervals[nextIndex]),
        nextIndex,
    };
}

export function shouldUseIntervalSchedule(attrs: ReviewAttrs): boolean {
    return (attrs.plan === "ebbinghaus" || attrs.plan === "custom") && attrs.intervals.length > 0;
}

export function normalizeReviewDate(value: string, fallback = toLocalDateString()): string {
    return isValidDateText(value) ? value : fallback;
}
