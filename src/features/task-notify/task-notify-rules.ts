import { customFilterTasks, formatTasksList, gettasksList } from "@/components/utils/widgetBlock/widget/tasksPlus/tasksPlus";
import { isTaskCompleted } from "@/components/utils/widgetBlock/widget/tasksPlus/tasksPlusParser";
import { formatLocalDate, formatLocalDateTime } from "@/components/tools/date-utils";
import type { TaskNotifyRule, TaskNotifyTask } from "./types";

export { formatLocalDate, formatLocalDateTime };

function parseLocalDate(dateText: string | undefined): Date | null {
  if (!dateText) return null;
  const match = dateText.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isWithinLocalDay(date: Date, target: Date): boolean {
  return date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate();
}

export function getPriorityLevel(task: TaskNotifyTask): number {
  return (task.parsed.priority?.match(/❗/g) || []).length;
}

export async function loadOpenTasks(): Promise<TaskNotifyTask[]> {
  const raw = await gettasksList();
  const formatted = await formatTasksList(Array.isArray(raw) ? raw : [], "all");
  return (Array.isArray(formatted) ? formatted : [])
    .filter((task): task is TaskNotifyTask => task && typeof task.id === "string")
    .filter((task) => !isTaskCompleted(task.taskCheck));
}

export function resolveReminderScheduledAt(task: TaskNotifyTask, now = new Date()): Date | null {
  const reminder = task.parsed.reminder?.trim();
  if (!reminder) return null;

  const fullDateTime = reminder.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+([01]?\d|2[0-3]):([0-5]\d)$/);
  if (fullDateTime) {
    return new Date(
      Number(fullDateTime[1]),
      Number(fullDateTime[2]) - 1,
      Number(fullDateTime[3]),
      Number(fullDateTime[4]),
      Number(fullDateTime[5]),
      0,
      0,
    );
  }

  const timeOnly = reminder.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!timeOnly) return null;
  const hour = Number(timeOnly[1]);
  const minute = Number(timeOnly[2]);

  const deadline = parseLocalDate(task.parsed.deadline);
  if (deadline) {
    return new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate(), hour, minute, 0, 0);
  }

  const startDate = parseLocalDate(task.parsed.startDate);
  if (startDate) {
    const today = startOfLocalDay(now);
    const scheduleDate = startDate > today ? startDate : today;
    return new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate(), hour, minute, 0, 0);
  }

  return null;
}

export function isDueWithinCatchUp(scheduledAt: Date, now: Date, catchUpWindowMinutes: number): boolean {
  const diffMs = now.getTime() - scheduledAt.getTime();
  return diffMs >= 0 && diffMs <= catchUpWindowMinutes * 60 * 1000;
}

export function getDigestTasks(rule: TaskNotifyRule, tasks: TaskNotifyTask[], now = new Date()): TaskNotifyTask[] {
  const today = startOfLocalDay(now);
  const tomorrow = new Date(today.getTime() + 86400000);

  switch (rule.type) {
    case "today_digest":
      return tasks.filter((task) => {
        const start = parseLocalDate(task.parsed.startDate);
        const deadline = parseLocalDate(task.parsed.deadline);
        if (start && !deadline) return start <= today;
        if (deadline && !start) return deadline >= today;
        if (start && deadline) return start <= today && today <= deadline;
        return Boolean(deadline && isWithinLocalDay(deadline, today));
      });
    case "tomorrow_digest":
      return tasks.filter((task) => {
        const start = parseLocalDate(task.parsed.startDate);
        const deadline = parseLocalDate(task.parsed.deadline);
        if (start && !deadline) return start <= tomorrow;
        if (deadline && !start) return deadline >= tomorrow;
        if (start && deadline) return start <= tomorrow && tomorrow <= deadline;
        return Boolean(deadline && isWithinLocalDay(deadline, tomorrow));
      });
    case "overdue_digest":
      return tasks.filter((task) => {
        const deadline = parseLocalDate(task.parsed.deadline);
        return Boolean(deadline && deadline < today);
      });
    case "priority_digest":
      return tasks.filter((task) => getPriorityLevel(task) >= (rule.priorityMin ?? 4));
    case "custom_filter_digest":
      return customFilterTasks(tasks, rule.customFilter || "not done");
    default:
      return [];
  }
}

export function shouldRunDailyRuleAt(rule: TaskNotifyRule, now: Date, catchUpWindowMinutes: number): Date | null {
  if (!rule.time) return null;
  const [hourText, minuteText] = rule.time.split(":");
  const scheduledAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hourText), Number(minuteText), 0, 0);
  return isDueWithinCatchUp(scheduledAt, now, catchUpWindowMinutes) ? scheduledAt : null;
}
