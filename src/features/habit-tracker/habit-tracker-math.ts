import type { HabitDefinition, HabitLog } from "./habit-tracker-store";

export function formatHabitDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isHabitDue(habit: HabitDefinition, date: Date): boolean {
  return (
    !habit.archived &&
    (habit.schedule.kind !== "weekdays" ||
      habit.schedule.weekdays.includes(date.getDay()))
  );
}

export function habitProgress(habit: HabitDefinition, value: number): number {
  return Math.max(0, Math.min(1, value / habit.target));
}

export function habitGoalLabel(habit: HabitDefinition): string {
  return habit.goalType === "check"
    ? "完成 1 次"
    : `${habit.target} ${habit.unit}`;
}

export function getHabitValue(
  logs: HabitLog[],
  habitId: string,
  date: string,
): number {
  return (
    logs.find((log) => log.habitId === habitId && log.date === date)?.value || 0
  );
}

export function currentHabitStreak(
  habit: HabitDefinition,
  logs: HabitLog[],
  today = new Date(),
): number {
  let streak = 0;
  const cursor = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  for (let checked = 0; checked < 3660; checked += 1) {
    if (isHabitDue(habit, cursor)) {
      if (
        habitProgress(
          habit,
          getHabitValue(logs, habit.id, formatHabitDate(cursor)),
        ) < 1
      )
        break;
      streak += 1;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface HabitAnalytics {
  dates: string[];
  dailyRates: number[];
  due: number;
  completed: number;
  totalValue: number;
  rate: number;
  longestStreak: number;
  habits: Array<{
    id: string;
    name: string;
    color: string;
    due: number;
    completed: number;
    totalValue: number;
    rate: number;
    streak: number;
  }>;
}

export function buildHabitAnalytics(
  habits: HabitDefinition[],
  logs: HabitLog[],
  today = new Date(),
  days = 30,
): HabitAnalytics {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dates = Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (Math.max(1, days) - 1 - index));
    return formatHabitDate(date);
  });
  const rows = habits.map((habit) => {
    let due = 0;
    let completed = 0;
    let progress = 0;
    let totalValue = 0;
    for (const date of dates) {
      if (!isHabitDue(habit, new Date(`${date}T00:00:00`))) continue;
      const value = getHabitValue(logs, habit.id, date);
      due += 1;
      totalValue += value;
      progress += habitProgress(habit, value);
      if (habitProgress(habit, value) >= 1) completed += 1;
    }
    return {
      id: habit.id,
      name: habit.name,
      color: habit.color,
      due,
      completed,
      totalValue,
      rate: due ? Math.round((progress / due) * 100) : 0,
      streak: currentHabitStreak(habit, logs, end),
    };
  });
  const dailyRates = dates.map((date) => {
    const dateValue = new Date(`${date}T00:00:00`);
    const dueHabits = habits.filter((habit) => isHabitDue(habit, dateValue));
    if (!dueHabits.length) return 0;
    const progress = dueHabits.reduce(
      (sum, habit) =>
        sum + habitProgress(habit, getHabitValue(logs, habit.id, date)),
      0,
    );
    return Math.round((progress / dueHabits.length) * 100);
  });
  const due = rows.reduce((sum, row) => sum + row.due, 0);
  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  return {
    dates,
    dailyRates,
    due,
    completed,
    totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0),
    rate: due
      ? Math.round(
          rows.reduce((sum, row) => sum + row.rate * row.due, 0) / due,
        )
      : 0,
    longestStreak: rows.reduce((max, row) => Math.max(max, row.streak), 0),
    habits: rows,
  };
}
