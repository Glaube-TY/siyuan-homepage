import type { EnhancedDiaryConfig, EnhancedDiaryPeriod } from "../enhancedDiaryTypes";
import { getPreviousPeriodContext } from "../enhancedDiaryUtils";
import { getDiaryDocumentForDate } from "../enhancedDiaryDoc";
import { loadReviewContent } from "./enhancedDiaryWorkspaceReviewContent";
import { getCarryoverFieldAliases, headingTitleMatchesAliases } from "../enhancedDiaryTemplateFieldMapping";

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

const CARRYOVER_META: Record<EnhancedDiaryCarryoverPeriod, { sourceLabel: string; periodLabel: string }> = {
    day: { sourceLabel: "来自昨日", periodLabel: "昨日" },
    week: { sourceLabel: "来自上周", periodLabel: "上周" },
    month: { sourceLabel: "来自上月", periodLabel: "上月" },
    year: { sourceLabel: "来自去年", periodLabel: "去年" },
};

const DEFAULT_CARRYOVER_LABELS: Record<EnhancedDiaryCarryoverPeriod, string> = {
    day: "明日关注",
    week: "下周计划",
    month: "下月计划",
    year: "明年方向",
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

function findCarryoverField(
    fields: Array<{ key: string; label: string; content: string; missing: boolean }>,
    aliases: string[]
): { key: string; label: string; content: string } | null {
    for (const field of fields) {
        if (headingTitleMatchesAliases(field.key, aliases)) {
            return field;
        }
    }
    return null;
}

export async function buildWorkspaceCarryoverPlans(
    config: EnhancedDiaryConfig,
    baseDate: Date
): Promise<EnhancedDiaryCarryoverItem[]> {
    const periods: EnhancedDiaryCarryoverPeriod[] = ["day", "week", "month", "year"];
    const items: EnhancedDiaryCarryoverItem[] = [];

    for (const period of periods) {
        try {
            const ctx = getPreviousPeriodContext(period as EnhancedDiaryPeriod, baseDate, config);
            const doc = await getDiaryDocumentForDate(ctx.targetDate);
            if (!doc) continue;

            const contentResult = await loadReviewContent(doc.id, period as EnhancedDiaryPeriod, config.headingStructure, config.templateFieldMapping);
            const aliases = getCarryoverFieldAliases(config.templateFieldMapping, period as EnhancedDiaryPeriod);
            const field = findCarryoverField(contentResult.fields, aliases);
            if (!field || !field.content) continue;

            const lines = parseCarryoverLines(field.content);
            if (lines.length === 0) continue;

            const meta = CARRYOVER_META[period];
            items.push({
                period,
                periodLabel: meta.periodLabel,
                sourceLabel: meta.sourceLabel,
                sourceDateOrRange: ctx.targetDate.toISOString().slice(0, 10),
                fieldLabel: field.label || DEFAULT_CARRYOVER_LABELS[period],
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
