import { createRuntimeId } from "@/libs/runtime-id";
import {
  loadSharedJson,
  mutateSharedJson,
  type SharedRevisionedFile,
} from "@/components/utils/widgetBlock/widget/sharedLocalStorage/sharedLocalStorage";
import {
  HABIT_TRACKER_FILE,
  HABIT_TRACKER_SCHEMA,
  SHARED_WIDGET_DATA_VERSION,
} from "@/components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetStoragePaths";

export type HabitGoalType = "check" | "count" | "amount" | "duration";
export type HabitSchedule =
  | { kind: "daily" }
  | { kind: "weekdays"; weekdays: number[] }
  | { kind: "weekly"; targetDays: number };

export interface HabitDefinition {
  id: string;
  name: string;
  goalType: HabitGoalType;
  target: number;
  step: number;
  unit: string;
  schedule: HabitSchedule;
  reminder: { enabled: boolean; time: string };
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLog {
  habitId: string;
  date: string;
  value: number;
  updatedAt: string;
}

interface HabitTrackerFile extends SharedRevisionedFile {
  habits: HabitDefinition[];
  logs: HabitLog[];
}

export const HABIT_COLORS = [
  "blue",
  "green",
  "amber",
  "violet",
  "rose",
  "cyan",
] as const;

export {
  currentHabitStreak,
  formatHabitDate,
  getHabitValue,
  habitGoalLabel,
  habitProgress,
  isHabitDue,
} from "./habit-tracker-math";

function emptyFile(): HabitTrackerFile {
  return {
    schema: HABIT_TRACKER_SCHEMA,
    version: SHARED_WIDGET_DATA_VERSION,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    habits: [],
    logs: [],
  };
}

function normalizeSchedule(value: unknown): HabitSchedule {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (input.kind === "weekdays") {
    const weekdays = Array.isArray(input.weekdays)
      ? [
          ...new Set(
            input.weekdays
              .map(Number)
              .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
          ),
        ]
      : [];
    return weekdays.length ? { kind: "weekdays", weekdays } : { kind: "daily" };
  }
  if (input.kind === "weekly") {
    return {
      kind: "weekly",
      targetDays: Math.max(
        1,
        Math.min(7, Math.round(Number(input.targetDays) || 1)),
      ),
    };
  }
  return { kind: "daily" };
}

function normalizeHabit(value: unknown): HabitDefinition | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!id || !name) return null;
  const goalType = ["check", "count", "amount", "duration"].includes(
    String(input.goalType),
  )
    ? (input.goalType as HabitGoalType)
    : "check";
  const target =
    goalType === "check" ? 1 : Math.max(0.01, Number(input.target) || 1);
  const reminder =
    input.reminder && typeof input.reminder === "object"
      ? (input.reminder as Record<string, unknown>)
      : {};
  const now = new Date().toISOString();
  return {
    id,
    name,
    goalType,
    target,
    step: Math.max(
      0.01,
      Number(input.step) || (goalType === "duration" ? 5 : 1),
    ),
    unit:
      typeof input.unit === "string" && input.unit.trim()
        ? input.unit.trim().slice(0, 12)
        : goalType === "duration"
          ? "分钟"
          : goalType === "check"
            ? "次"
            : "次",
    schedule: normalizeSchedule(input.schedule),
    reminder: {
      enabled: reminder.enabled === true,
      time: /^\d{2}:\d{2}$/.test(String(reminder.time))
        ? String(reminder.time)
        : "20:00",
    },
    color: HABIT_COLORS.includes(input.color as (typeof HABIT_COLORS)[number])
      ? String(input.color)
      : "blue",
    archived: input.archived === true,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
  };
}

function normalizeFile(value: unknown): HabitTrackerFile {
  if (!value || typeof value !== "object") throw new Error("习惯数据结构无效");
  const input = value as Record<string, unknown>;
  if (
    input.schema !== HABIT_TRACKER_SCHEMA ||
    input.version !== SHARED_WIDGET_DATA_VERSION
  ) {
    throw new Error("习惯数据版本无效");
  }
  const habits = Array.isArray(input.habits)
    ? (input.habits.map(normalizeHabit).filter(Boolean) as HabitDefinition[])
    : [];
  const habitIds = new Set(habits.map((habit) => habit.id));
  const logs = Array.isArray(input.logs)
    ? input.logs.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const log = value as Record<string, unknown>;
        const habitId = String(log.habitId || "");
        const date = String(log.date || "");
        if (!habitIds.has(habitId) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
          return [];
        return [
          {
            habitId,
            date,
            value: Math.max(0, Number(log.value) || 0),
            updatedAt: String(log.updatedAt || ""),
          },
        ];
      })
    : [];
  return {
    schema: HABIT_TRACKER_SCHEMA,
    version: SHARED_WIDGET_DATA_VERSION,
    revision: Math.max(0, Number(input.revision) || 0),
    updatedAt:
      typeof input.updatedAt === "string"
        ? input.updatedAt
        : new Date(0).toISOString(),
    habits,
    logs,
  };
}

export async function loadHabitTracker(): Promise<{
  habits: HabitDefinition[];
  logs: HabitLog[];
}> {
  const file = await loadSharedJson(HABIT_TRACKER_FILE, normalizeFile);
  const value = file || emptyFile();
  return { habits: value.habits, logs: value.logs };
}

export async function saveHabitDefinition(
  input: Omit<HabitDefinition, "createdAt" | "updatedAt"> &
    Partial<Pick<HabitDefinition, "createdAt">>,
): Promise<HabitDefinition> {
  const now = new Date().toISOString();
  const habit = normalizeHabit({
    ...input,
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  if (!habit) throw new Error("习惯名称不能为空");
  await mutateSharedJson({
    store: "habit-tracker",
    path: HABIT_TRACKER_FILE,
    createEmpty: emptyFile,
    normalize: normalizeFile,
    mutate: (file) => {
      file.habits = [
        ...file.habits.filter((item) => item.id !== habit.id),
        habit,
      ];
    },
  });
  return habit;
}

export function createHabitId(): string {
  return createRuntimeId("habit");
}

export async function deleteHabitDefinition(id: string): Promise<void> {
  await mutateSharedJson({
    store: "habit-tracker",
    path: HABIT_TRACKER_FILE,
    createEmpty: emptyFile,
    normalize: normalizeFile,
    mutate: (file) => {
      file.habits = file.habits.filter((habit) => habit.id !== id);
      file.logs = file.logs.filter((log) => log.habitId !== id);
    },
  });
}

export async function setHabitValue(
  habitId: string,
  date: string,
  value: number,
): Promise<void> {
  await mutateSharedJson({
    store: "habit-tracker",
    path: HABIT_TRACKER_FILE,
    createEmpty: emptyFile,
    normalize: normalizeFile,
    mutate: (file) => {
      if (!file.habits.some((habit) => habit.id === habitId))
        throw new Error("习惯不存在");
      const next = Math.max(0, value);
      file.logs = file.logs.filter(
        (log) => !(log.habitId === habitId && log.date === date),
      );
      if (next > 0)
        file.logs.push({
          habitId,
          date,
          value: next,
          updatedAt: new Date().toISOString(),
        });
    },
  });
}
