import type { NotificationDeliveryTarget } from "@/features/notification-center/types";

export type ReviewNotifyRuleType =
  | "today_digest"
  | "overdue_digest"
  | "tomorrow_digest"
  | "item_due_reminder";

export interface ReviewNotifyRule {
  id: string;
  type: ReviewNotifyRuleType;
  enabled: boolean;
  title: string;
  time: string;
  deliveryTargets: NotificationDeliveryTarget[];
}

export interface ReviewNotifySettings {
  version: 1;
  enabled: boolean;
  scanIntervalMs: number;
  catchUpWindowMinutes: number;
  maxItemsPerMessage: number;
  includePath: boolean;
  includeNote: boolean;
  includeSiyuanLink: boolean;
  rules: ReviewNotifyRule[];
}

export function createReviewNotifyRule(type: ReviewNotifyRuleType): ReviewNotifyRule {
  const defaults: Record<ReviewNotifyRuleType, { id: string; title: string; time: string }> = {
    today_digest: { id: "review-today-digest", title: "今日复习摘要", time: "08:30" },
    overdue_digest: { id: "review-overdue-digest", title: "逾期复习摘要", time: "09:00" },
    tomorrow_digest: { id: "review-tomorrow-digest", title: "明日复习摘要", time: "20:00" },
    item_due_reminder: { id: `review-item-due-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: "复习到期提醒", time: "09:00" },
  };
  return {
    ...defaults[type],
    type,
    enabled: true,
    deliveryTargets: [],
  };
}
