import { getDiaryDocumentForDate } from "../enhancedDiaryDoc";
import { formatDiaryDate, scanDiaryContentForPeriod } from "../enhancedDiaryUtils";
import { buildEnhancedDiaryWorkspaceSummary } from "../enhancedDiaryWorkspaceSummary";

export interface EnhancedDiaryCalendarDay {
    date: string;
    inCurrentMonth: boolean;
    hasDiary: boolean;
    docId?: string;
    newTaskCount: number;
    migratedTaskCount: number;
    quickRecordCount: number;
    completedReviewCount: number;
    pendingReviewCount: number;
}

function startOfCalendarGrid(year: number, month: number): Date {
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return start;
}

export async function buildWorkspaceCalendarMonth(
    _plugin: any,
    year: number,
    month: number
): Promise<EnhancedDiaryCalendarDay[]> {
    const start = startOfCalendarGrid(year, month);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
    }

    return Promise.all(
        days.map(async (date) => {
            const doc = await getDiaryDocumentForDate(date);
            let newTaskCount = 0;
            let migratedTaskCount = 0;
            let quickRecordCount = 0;
            let completedReviewCount = 0;
            let pendingReviewCount = 0;

            if (doc) {
                const summary = buildEnhancedDiaryWorkspaceSummary(doc.content);
                newTaskCount = summary.newTaskCount;
                migratedTaskCount = summary.migratedTaskCount;
                quickRecordCount = summary.quickRecordCount;

                const periods = ["day", "week", "month", "year"] as const;
                periods.forEach((period) => {
                    const scan = scanDiaryContentForPeriod(doc.content, period);
                    if (scan.completed) completedReviewCount += 1;
                    else if (scan.hasCompletionMarker) pendingReviewCount += 1;
                });
            }

            return {
                date: formatDiaryDate(date),
                inCurrentMonth: date.getMonth() === month,
                hasDiary: !!doc,
                docId: doc?.id,
                newTaskCount,
                migratedTaskCount,
                quickRecordCount,
                completedReviewCount,
                pendingReviewCount,
            };
        })
    );
}
