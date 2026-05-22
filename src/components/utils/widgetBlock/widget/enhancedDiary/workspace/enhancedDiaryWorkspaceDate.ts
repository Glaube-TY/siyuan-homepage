export function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
}

export function daysBetweenLocalDates(from: string, to: string): number {
    const fromDate = parseLocalDate(from);
    const toDate = parseLocalDate(to);
    return Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);
}

export function isSameLocalDate(a: Date, b: Date): boolean {
    return formatLocalDate(a) === formatLocalDate(b);
}
