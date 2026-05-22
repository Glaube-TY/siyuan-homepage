import type { EnhancedDiaryConfig, EnhancedDiaryPeriod } from "../enhancedDiaryTypes";
import {
    getPeriodContext,
    getPreviousPeriodContext,
    formatDiaryDate,
} from "../enhancedDiaryUtils";
import {
    buildReviewCardForContext,
    type EnhancedDiaryWorkspaceReviewCard,
} from "./enhancedDiaryWorkspaceViewModel";
import { parseLocalDate } from "./enhancedDiaryWorkspaceDate";

export interface EnhancedDiaryWorkspaceReviewHistoryItem extends EnhancedDiaryWorkspaceReviewCard {
    key: string;
    periodLabel: string;
    sortDate: string;
}

const PERIOD_LABEL_MAP: Record<EnhancedDiaryPeriod, string> = {
    day: "日记",
    week: "周记",
    month: "月记",
    year: "年记",
};

const PERIOD_SORT_ORDER: Record<EnhancedDiaryPeriod, number> = {
    day: 0,
    week: 1,
    month: 2,
    year: 3,
};

async function buildHistoryItemsForPeriod(
    config: EnhancedDiaryConfig,
    period: EnhancedDiaryPeriod,
    baseDate: Date,
    count: number
): Promise<EnhancedDiaryWorkspaceReviewHistoryItem[]> {
    const items: EnhancedDiaryWorkspaceReviewHistoryItem[] = [];
    let cursor = new Date(baseDate);

    for (let i = 0; i < count; i++) {
        try {
            const ctx = getPeriodContext(period, cursor, config);
            const card = await buildReviewCardForContext(config, period, ctx, baseDate);
            const sortDate = formatDiaryDate(card.targetDate);

            items.push({
                ...card,
                key: `${period}-${sortDate}`,
                periodLabel: PERIOD_LABEL_MAP[period],
                sortDate,
            });

            cursor = parseLocalDate(ctx.range.start);
            const previousCtx = getPreviousPeriodContext(period, cursor, config);
            cursor = parseLocalDate(previousCtx.range.start);
        } catch (err) {
            console.warn(`[enhancedDiaryWorkspaceReviewHistory] build history for ${period} iteration ${i} failed`, err);
            break;
        }
    }

    return items;
}

export async function buildWorkspaceReviewHistory(
    config: EnhancedDiaryConfig,
    baseDate: Date
): Promise<EnhancedDiaryWorkspaceReviewHistoryItem[]> {
    try {
        const allItems: EnhancedDiaryWorkspaceReviewHistoryItem[] = [];

        const dayItems = await buildHistoryItemsForPeriod(config, "day", baseDate, 30);
        allItems.push(...dayItems);

        const weekItems = await buildHistoryItemsForPeriod(config, "week", baseDate, 12);
        allItems.push(...weekItems);

        const monthItems = await buildHistoryItemsForPeriod(config, "month", baseDate, 12);
        allItems.push(...monthItems);

        const yearItems = await buildHistoryItemsForPeriod(config, "year", baseDate, 5);
        allItems.push(...yearItems);

        allItems.sort((a, b) => {
            const dateCmp = b.sortDate.localeCompare(a.sortDate);
            if (dateCmp !== 0) return dateCmp;
            return (PERIOD_SORT_ORDER[a.period] ?? 0) - (PERIOD_SORT_ORDER[b.period] ?? 0);
        });

        return allItems;
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceReviewHistory] buildWorkspaceReviewHistory failed", err);
        return [];
    }
}
