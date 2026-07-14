import { formatLocalDate } from "@/components/tools/date-utils";

export { formatLocalDate };

export function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function isValidLocalDateString(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year
        && parsed.getMonth() === month - 1
        && parsed.getDate() === day;
}

export function addDays(date: Date, amount: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
}

export function daysBetweenLocalDates(from: string, to: string): number {
    if (!isValidLocalDateString(from) || !isValidLocalDateString(to)) return Number.NaN;
    const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
    const [toYear, toMonth, toDay] = to.split("-").map(Number);
    return Math.round((
        Date.UTC(toYear, toMonth - 1, toDay)
        - Date.UTC(fromYear, fromMonth - 1, fromDay)
    ) / 86400000);
}

export function isSameLocalDate(a: Date, b: Date): boolean {
    return formatLocalDate(a) === formatLocalDate(b);
}

export function startOfLocalWeek(date: Date, weekStartDay: 0 | 1 = 1): Date {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = (result.getDay() - weekStartDay + 7) % 7;
    result.setDate(result.getDate() - offset);
    return result;
}

export function endOfLocalWeek(date: Date, weekStartDay: 0 | 1 = 1): Date {
    return addDays(startOfLocalWeek(date, weekStartDay), 6);
}

export function startOfLocalMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfLocalMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addLocalMonths(date: Date, amount: number): Date {
    const day = date.getDate();
    const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
    const lastDay = endOfLocalMonth(target).getDate();
    target.setDate(Math.min(day, lastDay));
    return target;
}

export function enumerateLocalDates(start: Date | string, end: Date | string): string[] {
    const startDate = typeof start === "string"
        ? (isValidLocalDateString(start) ? parseLocalDate(start) : null)
        : new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDate = typeof end === "string"
        ? (isValidLocalDateString(end) ? parseLocalDate(end) : null)
        : new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (!startDate || !endDate || startDate > endDate) return [];

    const result: string[] = [];
    for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
        result.push(formatLocalDate(cursor));
    }
    return result;
}
