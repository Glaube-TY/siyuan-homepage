import type { HabitDefinition, HabitLog } from "./habit-tracker-store";

export function formatHabitDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isHabitDue(habit: HabitDefinition, date: Date): boolean {
  return !habit.archived && (habit.schedule.kind !== "weekdays" || habit.schedule.weekdays.includes(date.getDay()));
}

export function habitProgress(habit: HabitDefinition, value: number): number {
  return Math.max(0, Math.min(1, value / habit.target));
}

export function habitGoalLabel(habit: HabitDefinition): string {
  return habit.goalType === "check" ? "完成 1 次" : `${habit.target} ${habit.unit}`;
}

export function getHabitValue(logs: HabitLog[], habitId: string, date: string): number {
  return logs.find((log) => log.habitId === habitId && log.date === date)?.value || 0;
}

export function currentHabitStreak(habit: HabitDefinition, logs: HabitLog[], today = new Date()): number {
  let streak = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let checked = 0; checked < 3660; checked += 1) {
    if (isHabitDue(habit, cursor)) {
      if (habitProgress(habit, getHabitValue(logs, habit.id, formatHabitDate(cursor))) < 1) break;
      streak += 1;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
