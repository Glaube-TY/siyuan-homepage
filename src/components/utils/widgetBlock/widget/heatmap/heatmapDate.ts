const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatHeatmapLocalDate(date: Date): string {
    if (!Number.isFinite(date.getTime())) return "";
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseHeatmapLocalDate(value: string): Date {
    const match = LOCAL_DATE_PATTERN.exec(value);
    if (!match) throw new Error(`Invalid heatmap date: ${value}`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        throw new Error(`Invalid heatmap date: ${value}`);
    }
    return date;
}

export function formatHeatmapCalendarValue(value: unknown): string {
    if (typeof value === "string" && LOCAL_DATE_PATTERN.test(value)) return value;
    return formatHeatmapLocalDate(new Date(value as string | number | Date));
}

export function getHeatmapRangeByMonthCount(
    monthCount: number,
    referenceDate = new Date(),
): [string, string] {
    const clampedCount = Math.max(1, Math.min(12, Math.floor(Number(monthCount) || 6)));
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    start.setMonth(start.getMonth() - clampedCount + 1);
    return [formatHeatmapLocalDate(start), formatHeatmapLocalDate(end)];
}

export function buildHeatmapCalendarData(
    counts: Record<string, number>,
    monthCount: number,
    referenceDate = new Date(),
): [string, number][] {
    const [startDate, endDate] = getHeatmapRangeByMonthCount(monthCount, referenceDate);
    const end = parseHeatmapLocalDate(endDate);
    const result: [string, number][] = [];
    for (let date = parseHeatmapLocalDate(startDate); date <= end; date.setDate(date.getDate() + 1)) {
        const localDate = formatHeatmapLocalDate(date);
        result.push([localDate, counts[localDate] || 0]);
    }
    return result;
}
