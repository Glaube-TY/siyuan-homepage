import { renderTaskReminderContent } from "./task-notify-render";
import { formatLocalDateTime, loadOpenTasks, resolveReminderScheduledAt } from "./task-notify-rules";
import { loadTaskNotifySettings } from "./task-notify-settings-store";
import type { MobileNotificationPlanProvider, MobileNotificationPlanRequest } from "@/features/notification-center/types";

export async function buildTaskMobileNotificationPlans(context: Parameters<MobileNotificationPlanProvider["buildPlans"]>[0]): Promise<MobileNotificationPlanRequest[]> {
  const settings = await loadTaskNotifySettings();
  if (!settings.enabled) return [];
  const rules = settings.rules.filter((rule) => rule.enabled && rule.type === "task_reminder" && rule.deliveryTargets.some((target) => target.kind === "mobile"));
  if (rules.length === 0) return [];
  const tasks = await loadOpenTasks();
  const plans: MobileNotificationPlanRequest[] = [];
  for (const rule of rules) {
    for (const task of tasks) {
      const scheduledAt = resolveReminderScheduledAt(task, context.now);
      if (!scheduledAt || scheduledAt <= context.now || scheduledAt > context.horizonEnd) continue;
      const localScheduledAt = formatLocalDateTime(scheduledAt);
      const occurrenceKey = `task-reminder:${task.id}:${localScheduledAt}`;
      plans.push({
        planKey: `mobile:${occurrenceKey}`,
        source: "task",
        ruleId: rule.id,
        scheduledAt: scheduledAt.toISOString(),
        event: {
          type: "task_reminder",
          source: "task",
          sourceId: task.id,
          title: rule.title || "任务提醒",
          content: renderTaskReminderContent(task, localScheduledAt, settings),
          level: "warning",
          scheduledAt: scheduledAt.toISOString(),
          occurrenceKey,
          url: settings.includeSiyuanLink ? `siyuan://blocks/${task.id}` : undefined,
          extra: { type: "task_reminder", taskId: task.id, scheduledAt: localScheduledAt },
        },
      });
    }
  }
  return plans;
}

export const taskMobileNotificationPlanProvider: MobileNotificationPlanProvider = {
  id: "task-notify",
  source: "task",
  buildPlans: buildTaskMobileNotificationPlans,
};
