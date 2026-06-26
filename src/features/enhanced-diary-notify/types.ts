export type EnhancedDiaryNotifyRuleType =
  | "today_diary_missing"
  | "yesterday_review_missing"
  | "unmigrated_tasks_digest"
  | "weekly_review_reminder";

export interface EnhancedDiaryNotifyRule {
  id: string;
  enabled: boolean;
  type: EnhancedDiaryNotifyRuleType;
  title: string;
  time?: string; // HH:mm
  weekday?: number; // weekly_review_reminder 使用，1-7
  channelIds?: string[];
}

export interface EnhancedDiaryNotifySettings {
  version: 1;
  enabled: boolean;
  scanIntervalMs: number;
  catchUpWindowMinutes: number;
  maxItemsPerMessage: number;
  includeSiyuanLink: boolean;
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
  const defaults: Record<EnhancedDiaryNotifyRuleType, { title: string; time?: string; weekday?: number }> = {
    today_diary_missing: { title: "今日日记提醒", time: "21:00" },
    yesterday_review_missing: { title: "昨日未复盘提醒", time: "10:00" },
    unmigrated_tasks_digest: { title: "未迁移任务摘要", time: "21:30" },
    weekly_review_reminder: { title: "每周复盘提醒", time: "09:00", weekday: 5 },
  };
  const d = defaults[type];
  return {
    id,
    enabled: true,
    type,
    title: d.title,
    time: d.time,
    weekday: d.weekday,
    channelIds: undefined,
  };
}
