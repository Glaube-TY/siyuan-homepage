import { addDays, diffDays, toLocalDateString } from "@/components/utils/widgetBlock/widget/reviewDocs/reviewDocsSchedule";
import type { ReviewItem, ReviewPriority } from "@/components/utils/widgetBlock/widget/reviewDocs/reviewDocsTypes";
import type { ReviewNotifyRule } from "./types";

const priorityOrder: Record<ReviewPriority, number> = { high: 3, medium: 2, low: 1, "": 0 };

export { addDays, diffDays, toLocalDateString };

export function sortReviewNotifyItems(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((left, right) => {
    const dateCompare = left.attrs.nextDate.localeCompare(right.attrs.nextDate);
    if (dateCompare !== 0) return dateCompare;
    return priorityOrder[right.attrs.priority] - priorityOrder[left.attrs.priority];
  });
}

export function getReviewItemsForRule(rule: ReviewNotifyRule, items: ReviewItem[], scheduledDate: string): ReviewItem[] {
  const targetDate = rule.type === "tomorrow_digest" ? addDays(scheduledDate, 1) : scheduledDate;
  const matches = items.filter((item) => {
    const nextDate = item.attrs.nextDate;
    if (rule.type === "overdue_digest") return nextDate < scheduledDate;
    return nextDate === targetDate;
  });
  return sortReviewNotifyItems(matches);
}

export function scheduledAtForReviewRule(rule: ReviewNotifyRule, date: Date): Date {
  const [hour, minute] = rule.time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

export function getDueReviewRuleSchedule(rule: ReviewNotifyRule, now: Date, catchUpWindowMinutes: number): Date | null {
  const scheduledAt = scheduledAtForReviewRule(rule, now);
  const elapsed = now.getTime() - scheduledAt.getTime();
  return elapsed >= 0 && elapsed <= catchUpWindowMinutes * 60000 ? scheduledAt : null;
}

export function reviewOverdueDays(item: ReviewItem, scheduledDate: string): number {
  return Math.max(0, diffDays(scheduledDate, item.attrs.nextDate));
}
