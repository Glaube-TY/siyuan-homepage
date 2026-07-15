export type TaskNotifyRuleType =
  | "task_reminder"
  | "today_digest"
  | "tomorrow_digest"
  | "overdue_digest"
  | "priority_digest"
  | "custom_filter_digest";

export interface TaskNotifyRule {
  id: string;
  enabled: boolean;
  type: TaskNotifyRuleType;
  title: string;
  time?: string;
  deliveryTargets: NotificationDeliveryTarget[];
  priorityMin?: number;
  customFilter?: string;
}

export interface TaskNotifySettings {
  version: 2;
  enabled: boolean;
  scanIntervalMs: number;
  catchUpWindowMinutes: number;
  maxTasksPerMessage: number;
  includeSourcePath: boolean;
  includeSiyuanLink: boolean;
  rules: TaskNotifyRule[];
}

export interface TaskNotifyHistory {
  version: 1;
  sentKeys: Record<string, string>;
}

export interface TaskNotifyTask {
  id: string;
  taskname: string;
  taskCheck: string;
  markdown: string;
  hpath?: string;
  box?: string;
  parsed: {
    deadline: string;
    startDate: string;
    priority: string;
    recurrence: string;
    reminder: string;
    location: string;
    tags: string[];
  };
}

export function createTaskNotifyRule(type: TaskNotifyRuleType): TaskNotifyRule {
  const singletonIds: Record<string, string> = {
    task_reminder: "task-reminder",
    today_digest: "today-digest",
    tomorrow_digest: "tomorrow-digest",
    overdue_digest: "overdue-digest",
    priority_digest: "priority-digest",
  };
  const id = singletonIds[type] ?? `custom-filter-digest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const defaults: Record<TaskNotifyRuleType, { title: string; time?: string; priorityMin?: number; customFilter?: string }> = {
    task_reminder: { title: "任务提醒" },
    today_digest: { title: "今日任务摘要", time: "08:30" },
    tomorrow_digest: { title: "明日任务摘要", time: "21:00" },
    overdue_digest: { title: "逾期任务提醒", time: "09:00" },
    priority_digest: { title: "高优先级任务摘要", time: "09:00", priorityMin: 4 },
    custom_filter_digest: { title: "自定义任务摘要", time: "09:00", customFilter: "not done" },
  };
  const d = defaults[type];
  return {
    id,
    enabled: true,
    type,
    title: d.title,
    time: d.time,
    deliveryTargets: [],
    priorityMin: d.priorityMin,
    customFilter: d.customFilter,
  };
}
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
