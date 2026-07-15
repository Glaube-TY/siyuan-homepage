export type EnhancedDiaryNotifyRuleType =
  | "today_diary_missing"
  | "yesterday_review_missing"
  | "unmigrated_tasks_digest"
  | "weekly_review_reminder"
  | "daily_review_due"
  | "monthly_review_due"
  | "yearly_review_due"
  | "workspace_overdue_tasks_digest"
  | "stale_workspace_tasks_digest"
  | "project_overdue_digest"
  | "project_stale_digest"
  | "project_completed_digest"
  | "project_weekly_digest";

export interface EnhancedDiaryNotifyRule {
  id: string;
  enabled: boolean;
  type: EnhancedDiaryNotifyRuleType;
  title: string;
  time?: string; // HH:mm
  weekday?: number; // 周规则使用，0-6（周日至周六）
  inactiveDaysThreshold?: number;
  deliveryTargets: NotificationDeliveryTarget[];
}

export interface EnhancedDiaryNotifySettings {
  version: 3;
  enabled: boolean;
  scanIntervalMs: number;
  catchUpWindowMinutes: number;
  maxItemsPerMessage: number;
  includeSiyuanLink: boolean;
  includeProjectPath: boolean;
  rules: EnhancedDiaryNotifyRule[];
}

export interface EnhancedDiaryNotifyHistory {
  version: 1;
  sentKeys: Record<string, string>;
}

export function createEnhancedDiaryNotifyRule(type: EnhancedDiaryNotifyRuleType): EnhancedDiaryNotifyRule {
  const singletonIds: Record<string, string> = {
    today_diary_missing: "enhanced-diary-today-missing",
    yesterday_review_missing: "enhanced-diary-yesterday-review",
  };
  const id = singletonIds[type] ?? `enhanced-diary-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const defaults: Record<EnhancedDiaryNotifyRuleType, { title: string; time?: string; weekday?: number; inactiveDaysThreshold?: number }> = {
    today_diary_missing: { title: "今日日记提醒", time: "21:00" },
    yesterday_review_missing: { title: "昨日未复盘提醒", time: "10:00" },
    unmigrated_tasks_digest: { title: "未迁移任务摘要", time: "21:30" },
    weekly_review_reminder: { title: "每周复盘提醒", time: "09:00", weekday: 5 },
    daily_review_due: { title: "日复盘待完成", time: "21:30" },
    monthly_review_due: { title: "月度复盘待完成", time: "20:00" },
    yearly_review_due: { title: "年度复盘待完成", time: "20:00" },
    workspace_overdue_tasks_digest: { title: "工作台逾期任务摘要", time: "09:00" },
    stale_workspace_tasks_digest: { title: "工作台长期未处理任务", time: "09:10", inactiveDaysThreshold: 7 },
    project_overdue_digest: { title: "项目逾期摘要", time: "09:20" },
    project_stale_digest: { title: "长期无进展项目", time: "09:30", inactiveDaysThreshold: 14 },
    project_completed_digest: { title: "项目任务已完成", time: "18:00" },
    project_weekly_digest: { title: "项目周报", time: "18:00", weekday: 5 },
  };
  const d = defaults[type];
  return {
    id,
    enabled: type === "today_diary_missing" || type === "yesterday_review_missing" || type === "unmigrated_tasks_digest" || type === "weekly_review_reminder",
    type,
    title: d.title,
    time: d.time,
    weekday: d.weekday,
    inactiveDaysThreshold: d.inactiveDaysThreshold,
    deliveryTargets: [],
  };
}
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
