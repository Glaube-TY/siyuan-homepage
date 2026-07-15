import { getWeekId, loadDiaryConfig } from "./enhanced-diary-notify-rules";
import { renderReviewDueContent, renderWeeklyReviewReminderContent } from "./enhanced-diary-notify-render";
import { loadEnhancedDiaryNotifySettings } from "./enhanced-diary-notify-settings-store";
import type { MobileNotificationPlanProvider, MobileNotificationPlanRequest } from "@/features/notification-center/types";
import type { EnhancedDiaryConfig, EnhancedDiaryPeriodContext } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import { formatDiaryDate, getPeriodContext, getPreviousPeriodContext } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";

export function resolveMobileReviewPeriodContext(
  period: "month" | "year",
  candidateDate: Date,
  config: EnhancedDiaryConfig,
): EnhancedDiaryPeriodContext | null {
  const candidateDateText = formatDiaryDate(candidateDate);
  const currentContext = getPeriodContext(period, candidateDate, config);
  if (formatDiaryDate(currentContext.targetDate) === candidateDateText) return currentContext;
  const previousContext = getPreviousPeriodContext(period, candidateDate, config);
  return formatDiaryDate(previousContext.targetDate) === candidateDateText ? previousContext : null;
}

export async function buildEnhancedDiaryMobileNotificationPlans(context: Parameters<MobileNotificationPlanProvider["buildPlans"]>[0]): Promise<MobileNotificationPlanRequest[]> {
  const settings = await loadEnhancedDiaryNotifySettings();
  if (!settings.enabled) return [];
  const rules = settings.rules.filter((rule) => rule.enabled && (rule.type === "weekly_review_reminder" || rule.type === "monthly_review_due" || rule.type === "yearly_review_due") && rule.deliveryTargets.some((target) => target.kind === "mobile"));
  const config = await loadDiaryConfig();
  const plans: MobileNotificationPlanRequest[] = [];
  const planKeys = new Set<string>();
  let duplicateWarningEmitted = false;
  const firstDate = new Date(context.now.getFullYear(), context.now.getMonth(), context.now.getDate());
  for (let offset = 0; offset <= context.planningHorizonDays; offset += 1) {
    const date = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() + offset);
    for (const rule of rules) {
      if (rule.type === "weekly_review_reminder" && date.getDay() !== (rule.weekday ?? 5)) continue;
      const period = rule.type === "monthly_review_due" ? "month" : rule.type === "yearly_review_due" ? "year" : null;
      const periodContext = period ? resolveMobileReviewPeriodContext(period, date, config) : null;
      if (period && !periodContext) continue;
      const [hour, minute] = (rule.time ?? "09:00").split(":").map(Number);
      const targetDate = periodContext?.targetDate ?? date;
      const scheduledAt = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hour, minute, 0, 0);
      if (scheduledAt <= context.now || scheduledAt > context.horizonEnd) continue;
      const weekId = getWeekId(date);
      const occurrenceKey = period
        ? `enhanced-diary:${period}-review-due:${rule.id}:${periodContext!.range.start} 至 ${periodContext!.range.end}`
        : `enhanced-diary:weekly-review:${rule.id}:${weekId}`;
      const planKey = `mobile:${occurrenceKey}`;
      if (planKeys.has(planKey)) {
        if (!duplicateWarningEmitted) {
          duplicateWarningEmitted = true;
          console.warn(`[enhanced-diary-notify] duplicate mobile planKey ignored: ${planKey}`);
        }
        continue;
      }
      planKeys.add(planKey);
      plans.push({
        planKey,
        source: "diary",
        ruleId: rule.id,
        scheduledAt: scheduledAt.toISOString(),
        event: {
          type: rule.type, source: "diary", sourceId: rule.id,
          title: rule.title || (period ? `${period === "month" ? "月度" : "年度"}复盘提醒` : "每周复盘提醒"),
          content: period ? renderReviewDueContent(period === "month" ? "本月总结" : "年度总结", `${periodContext!.range.start} 至 ${periodContext!.range.end}`) : renderWeeklyReviewReminderContent(), level: "info",
          scheduledAt: scheduledAt.toISOString(), occurrenceKey,
          extra: period
            ? { type: rule.type, period, rangeStart: periodContext!.range.start, rangeEnd: periodContext!.range.end, targetDate: formatDiaryDate(periodContext!.targetDate) }
            : { type: rule.type, weekId, period },
        },
      });
    }
  }
  return plans;
}

export const enhancedDiaryMobileNotificationPlanProvider: MobileNotificationPlanProvider = {
  id: "enhanced-diary-notify",
  source: "diary",
  buildPlans: buildEnhancedDiaryMobileNotificationPlans,
};
