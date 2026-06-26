import { notifyBridge } from "@/features/notify-bridge";
import { formatLocalDate, formatLocalDateTime, getDigestTasks, isDueWithinCatchUp, loadOpenTasks, resolveReminderScheduledAt, shouldRunDailyRuleAt } from "./task-notify-rules";
import { hasTaskNotifySent, markTaskNotifySent } from "./task-notify-history-store";
import { renderTaskDigestContent, renderTaskReminderContent } from "./task-notify-render";
import type { TaskNotifySettings } from "./types";

export async function runTaskNotifyScan(settings: TaskNotifySettings, now = new Date()): Promise<void> {
  const enabledRules = settings.rules.filter((rule) => rule.enabled);
  if (!settings.enabled || enabledRules.length === 0) return;

  const tasks = await loadOpenTasks();
  if (tasks.length === 0) return;

  for (const rule of enabledRules) {
    if (rule.type === "task_reminder") {
      for (const task of tasks) {
        const scheduledAt = resolveReminderScheduledAt(task, now);
        if (!scheduledAt || !isDueWithinCatchUp(scheduledAt, now, settings.catchUpWindowMinutes)) continue;
        const scheduledAtLocal = formatLocalDateTime(scheduledAt);
        const dedupeKey = `task-reminder:${task.id}:${scheduledAtLocal}`;
        if (await hasTaskNotifySent(dedupeKey)) continue;
        const result = await notifyBridge.send({
          title: "任务提醒",
          content: renderTaskReminderContent(task, scheduledAtLocal, settings),
          level: "warning",
          source: "task",
          sourceId: task.id,
          url: settings.includeSiyuanLink ? `siyuan://blocks/${task.id}` : undefined,
          dedupeKey,
          extra: {
            type: "task_reminder",
            taskId: task.id,
            scheduledAt: scheduledAtLocal,
          },
        }, {
          channelIds: rule.channelIds,
          force: true,
          reason: "task-reminder",
        });
        if (result.ok) await markTaskNotifySent(dedupeKey);
      }
      continue;
    }

    const scheduledAt = shouldRunDailyRuleAt(rule, now, settings.catchUpWindowMinutes);
    if (!scheduledAt) continue;
    const today = formatLocalDate(scheduledAt);
    const dedupeKey = `task-digest:${rule.id}:${today}`;
    if (await hasTaskNotifySent(dedupeKey)) continue;
    const digestTasks = getDigestTasks(rule, tasks, now);
    if (digestTasks.length === 0) continue;
    const result = await notifyBridge.send({
      title: rule.title,
      content: renderTaskDigestContent(digestTasks, settings),
      level: rule.type === "overdue_digest" ? "warning" : "info",
      source: "task",
      sourceId: rule.id,
      dedupeKey,
      extra: {
        type: rule.type,
        count: digestTasks.length,
      },
    }, {
      channelIds: rule.channelIds,
      force: true,
      reason: "task-digest",
    });
    if (result.ok) await markTaskNotifySent(dedupeKey);
  }
}
