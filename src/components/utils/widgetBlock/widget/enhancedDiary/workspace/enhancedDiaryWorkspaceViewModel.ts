import {
    ENHANCED_DIARY_PERIODS,
    type EnhancedDiaryConfig,
    type EnhancedDiaryPeriod,
    type EnhancedDiaryPeriodContext,
    type EnhancedDiaryStatus,
    type EnhancedDiaryTemplateContext,
} from "../enhancedDiaryTypes";
import {
    getEnhancedDiaryStatus,
    getPeriodContext,
    getPreviousPeriodContext,
    formatDiaryDate,
    isReviewReminderWindowActive,
} from "../enhancedDiaryUtils";
import { getDiaryDocumentForDate } from "../enhancedDiaryDoc";
import { parseLocalDate } from "./enhancedDiaryWorkspaceDate";

export interface EnhancedDiaryWorkspaceReviewCard {
    period: EnhancedDiaryPeriod;
    title: string;
    status: EnhancedDiaryStatus;
    statusLabel: string;
    dateOrRange: string;
    docId?: string;
    targetDate: Date;
    templateContext: EnhancedDiaryTemplateContext;
}

export const WORKSPACE_REVIEW_PERIOD_LABELS: Record<EnhancedDiaryPeriod, string> = {
    day: "今日记录",
    week: "本周复盘",
    month: "本月总结",
    year: "年度总结",
};

export const WORKSPACE_REVIEW_STATUS_LABELS: Record<EnhancedDiaryStatus, string> = {
    not_due: "未到期",
    not_created: "未创建",
    missing_template: "缺少模板",
    pending: "待完成",
    completed: "已完成",
    overdue: "已逾期",
    skipped: "已跳过",
};

export function isTargetDateDue(baseDate: Date, targetDate: Date): boolean {
    return formatDiaryDate(baseDate) >= formatDiaryDate(targetDate);
}

export async function buildReviewCardForContext(
    config: EnhancedDiaryConfig,
    period: EnhancedDiaryPeriod,
    ctx: EnhancedDiaryPeriodContext,
    baseDate: Date
): Promise<EnhancedDiaryWorkspaceReviewCard> {
    const doc = await getDiaryDocumentForDate(ctx.targetDate);
    const status = getEnhancedDiaryStatus({
        docExists: !!doc,
        content: doc?.content || "",
        period,
        baseDate,
        targetDate: ctx.targetDate,
        config,
    });

    return {
        period,
        title: WORKSPACE_REVIEW_PERIOD_LABELS[period],
        status,
        statusLabel: WORKSPACE_REVIEW_STATUS_LABELS[status],
        dateOrRange:
            period === "day"
                ? formatDiaryDate(ctx.targetDate)
                : `${ctx.range.start} 至 ${ctx.range.end}`,
        docId: doc?.id,
        targetDate: ctx.targetDate,
        templateContext: ctx.templateContext,
    };
}

export async function resolveWorkspaceReviewCard(
    config: EnhancedDiaryConfig,
    period: EnhancedDiaryPeriod,
    baseDate: Date
): Promise<EnhancedDiaryWorkspaceReviewCard> {
    const currentCtx = getPeriodContext(period, baseDate, config);
    const currentCard = await buildReviewCardForContext(config, period, currentCtx, baseDate);

    if (period === "day" || isTargetDateDue(baseDate, currentCtx.targetDate)) {
        return currentCard;
    }

    const backtrackLimits: Record<EnhancedDiaryPeriod, number> = {
        day: 0,
        week: 12,
        month: 12,
        year: 5,
    };
    const unhandledStatuses: EnhancedDiaryStatus[] = [
        "overdue",
        "pending",
        "missing_template",
        "not_created",
    ];
    const terminalStatuses: EnhancedDiaryStatus[] = ["completed", "skipped"];

    let cursorBaseDate = new Date(baseDate.getTime());
    for (let i = 0; i < backtrackLimits[period]; i++) {
        const previousCtx = getPreviousPeriodContext(period, cursorBaseDate, config);

        if (!isReviewReminderWindowActive(period, baseDate, previousCtx.targetDate, config)) {
            break;
        }

        const previousCard = await buildReviewCardForContext(config, period, previousCtx, baseDate);

        if (unhandledStatuses.includes(previousCard.status)) {
            return previousCard;
        }

        if (terminalStatuses.includes(previousCard.status)) {
            break;
        }

        cursorBaseDate = parseLocalDate(previousCtx.range.start);
    }

    return currentCard;
}

export async function buildWorkspaceReviewCards(
    config: EnhancedDiaryConfig,
    baseDate: Date
): Promise<EnhancedDiaryWorkspaceReviewCard[]> {
    return Promise.all(
        ENHANCED_DIARY_PERIODS.map((period) =>
            resolveWorkspaceReviewCard(config, period, baseDate)
        )
    );
}
