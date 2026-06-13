import type { EnhancedDiaryConfig } from "../enhancedDiaryTypes";
import { getPreviousPeriodContext } from "../enhancedDiaryUtils";
import { getDiaryDocumentForDate } from "../enhancedDiaryDoc";
import { loadReviewContent } from "./enhancedDiaryWorkspaceReviewContent";

export type EnhancedDiaryCarryoverPeriod = "day" | "week" | "month" | "year";

export interface EnhancedDiaryCarryoverItem {
    period: EnhancedDiaryCarryoverPeriod;
    periodLabel: string;
    sourceLabel: string;
    sourceDateOrRange: string;
    fieldLabel: string;
    content: string;
    lines: string[];
    docId?: string;
}

const CARRYOVER_FIELD_MAP: Record<EnhancedDiaryCarryoverPeriod, { fieldLabel: string; sourceLabel: string; periodLabel: string }> = {
    day: { fieldLabel: "明日关注", sourceLabel: "来自昨日", periodLabel: "昨日" },
    week: { fieldLabel: "下周计划", sourceLabel: "来自上周", periodLabel: "上周" },
    month: { fieldLabel: "下月计划", sourceLabel: "来自上月", periodLabel: "上月" },
    year: { fieldLabel: "明年方向", sourceLabel: "来自去年", periodLabel: "去年" },
};

function parseCarryoverLines(content: string): string[] {
    const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^- \[.\] /, "").replace(/^[-*] /, "").replace(/^\d+\.\s+/, ""))
        .filter(Boolean);
    return lines.slice(0, 8);
}

export async function buildWorkspaceCarryoverPlans(
    config: EnhancedDiaryConfig,
    baseDate: Date
): Promise<EnhancedDiaryCarryoverItem[]> {
    const periods: EnhancedDiaryCarryoverPeriod[] = ["day", "week", "month", "year"];
    const items: EnhancedDiaryCarryoverItem[] = [];

    for (const period of periods) {
        try {
            const ctx = getPreviousPeriodContext(period, baseDate, config);
            const doc = await getDiaryDocumentForDate(ctx.targetDate);
            if (!doc) continue;

            const contentResult = await loadReviewContent(doc.id, period, config.headingStructure);
            const field = contentResult.fields.find((f) => f.key === CARRYOVER_FIELD_MAP[period].fieldLabel);
            if (!field || !field.content) continue;

            const lines = parseCarryoverLines(field.content);
            if (lines.length === 0) continue;

            const meta = CARRYOVER_FIELD_MAP[period];
            items.push({
                period,
                periodLabel: meta.periodLabel,
                sourceLabel: meta.sourceLabel,
                sourceDateOrRange: ctx.targetDate.toISOString().slice(0, 10),
                fieldLabel: meta.fieldLabel,
                content: field.content,
                lines,
                docId: doc.id,
            });
        } catch (err) {
            console.warn(`[enhancedDiaryWorkspaceCarryover] build carryover for ${period} failed`, err);
        }
    }

    return items;
}
