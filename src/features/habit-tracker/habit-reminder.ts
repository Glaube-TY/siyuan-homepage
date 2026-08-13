import {
  deleteNotificationRule,
  getNotificationRule,
  loadNotificationCenterSettings,
  saveNotificationRule,
  type NotificationDeliveryTarget,
  type NotificationRule,
} from "@/features/notification-center";
import { habitGoalLabel, type HabitDefinition } from "./habit-tracker-store";

function ruleId(habitId: string): string {
  return `notification-rule-habit-${habitId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

async function configuredTargets(): Promise<NotificationDeliveryTarget[]> {
  const settings = await loadNotificationCenterSettings();
  const targets: NotificationDeliveryTarget[] = [];
  if (settings.desktop.enabled) targets.push({ kind: "desktop" });
  if (settings.mobile.enabled) targets.push({ kind: "mobile" });
  if (settings.external.enabled && settings.external.defaultChannelIds.length)
    targets.push({ kind: "external-default" });
  return targets;
}

export async function syncHabitReminder(habit: HabitDefinition): Promise<void> {
  const id = ruleId(habit.id);
  const current = await getNotificationRule(id);
  if (!habit.reminder.enabled || habit.archived) {
    if (current) await deleteNotificationRule(id, current.revision);
    return;
  }
  const targets = await configuredTargets();
  if (!targets.length) throw new Error("请先在通知中心启用至少一个通知渠道");
  const now = Date.now();
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const trigger =
    habit.schedule.kind === "weekdays"
      ? {
          kind: "weekly" as const,
          time: habit.reminder.time,
          weekdays: habit.schedule.weekdays.map((day) => day || 7),
          timeZone,
        }
      : { kind: "daily" as const, time: habit.reminder.time, timeZone };
  const next: NotificationRule = {
    schemaVersion: 1,
    ruleId: id,
    revision: current ? current.revision + 1 : 1,
    name: `习惯提醒 · ${habit.name}`,
    enabled: true,
    title: habit.name,
    content: `今日目标：${habitGoalLabel(habit)}`,
    trigger,
    targets,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  await saveNotificationRule(next, current?.revision);
}

export async function deleteHabitReminder(habitId: string): Promise<void> {
  const current = await getNotificationRule(ruleId(habitId));
  if (current) await deleteNotificationRule(current.ruleId, current.revision);
}
