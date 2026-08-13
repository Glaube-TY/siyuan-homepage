import assert from "node:assert/strict";
import {
  buildHabitAnalytics,
  currentHabitStreak,
  habitProgress,
  isHabitDue,
} from "../src/features/habit-tracker/habit-tracker-math";
import type { HabitDefinition } from "../src/features/habit-tracker/habit-tracker-store";

const habit: HabitDefinition = {
  id: "habit-test",
  name: "阅读",
  goalType: "duration",
  target: 30,
  step: 5,
  unit: "分钟",
  schedule: { kind: "weekdays", weekdays: [1, 3, 5] },
  reminder: { enabled: false, time: "20:00" },
  color: "blue",
  archived: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

assert.equal(isHabitDue(habit, new Date("2026-08-14T00:00:00")), true);
assert.equal(isHabitDue(habit, new Date("2026-08-15T00:00:00")), false);
assert.equal(habitProgress(habit, 15), 0.5);
assert.equal(habitProgress(habit, 60), 1);
assert.equal(
  currentHabitStreak(
    habit,
    [
      { habitId: habit.id, date: "2026-08-14", value: 30, updatedAt: "" },
      { habitId: habit.id, date: "2026-08-12", value: 30, updatedAt: "" },
    ],
    new Date("2026-08-14T00:00:00"),
  ),
  2,
);

const analytics = buildHabitAnalytics(
  [habit],
  [
    { habitId: habit.id, date: "2026-08-14", value: 30, updatedAt: "" },
    { habitId: habit.id, date: "2026-08-12", value: 15, updatedAt: "" },
  ],
  new Date("2026-08-14T00:00:00"),
  3,
);
assert.deepEqual(analytics.dailyRates, [50, 0, 100]);
assert.equal(analytics.completed, 1);
assert.equal(analytics.rate, 75);

console.log("Habit tracker verification passed.");
