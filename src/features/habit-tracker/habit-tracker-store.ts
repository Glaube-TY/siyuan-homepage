import { createRuntimeId } from "@/libs/runtime-id";
import { formatHabitDate } from "./habit-tracker-math";
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

export const HABIT_COLOR_OPTIONS = [
  { value: "blue", label: "湖蓝", hex: "#4f86e8" },
  { value: "green", label: "青绿", hex: "#34a66f" },
  { value: "amber", label: "琥珀", hex: "#d69a31" },
  { value: "violet", label: "罗兰紫", hex: "#8b6de0" },
  { value: "rose", label: "玫瑰", hex: "#d9667d" },
  { value: "cyan", label: "湖青", hex: "#2ba3ad" },
] as const;

export const HABIT_COLORS = HABIT_COLOR_OPTIONS.map((option) => option.value);

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

function isDataObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function invalidHabitData(detail: string): never {
  throw new Error(`习惯数据异常（${detail}），未覆盖原文件，请备份后检查。`);
}

function isHabitDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && formatHabitDate(new Date(`${value}T00:00:00`)) === value;
}

function normalizeFile(value: unknown): HabitTrackerFile {
  if (!isDataObject(value)) invalidHabitData("文件结构无效");
  const input = value;
  if (
    input.schema !== HABIT_TRACKER_SCHEMA ||
    input.version !== SHARED_WIDGET_DATA_VERSION
  ) {
    invalidHabitData("文件版本无效");
  }
  if (typeof input.revision !== "number" || !Number.isInteger(input.revision) || input.revision < 0
    || typeof input.updatedAt !== "string" || !Array.isArray(input.habits) || !Array.isArray(input.logs)) {
    invalidHabitData("文件字段不完整");
  }
  const habitIds = new Set<string>();
  for (const [index, habit] of input.habits.entries()) {
    if (!isDataObject(habit)
      || typeof habit.id !== "string" || !habit.id || habit.id.trim() !== habit.id
      || typeof habit.name !== "string" || !habit.name.trim()
      || typeof habit.goalType !== "string" || !["check", "count", "amount", "duration"].includes(habit.goalType)
      || typeof habit.target !== "number" || !Number.isFinite(habit.target) || habit.target <= 0
      || typeof habit.step !== "number" || !Number.isFinite(habit.step) || habit.step <= 0
      || typeof habit.unit !== "string" || !HABIT_COLORS.includes(habit.color as typeof HABIT_COLORS[number])
      || typeof habit.archived !== "boolean" || typeof habit.createdAt !== "string" || typeof habit.updatedAt !== "string") {
      invalidHabitData(`第 ${index + 1} 个习惯字段无效`);
    }
    if (habitIds.has(habit.id)) invalidHabitData(`第 ${index + 1} 个习惯标识重复`);
    habitIds.add(habit.id);
    const schedule = habit.schedule;
    if (!isDataObject(schedule) || typeof schedule.kind !== "string" || !["daily", "weekdays", "weekly"].includes(schedule.kind)) {
      invalidHabitData(`第 ${index + 1} 个习惯周期无效`);
    }
    if (schedule.kind === "weekdays" && (!Array.isArray(schedule.weekdays) || !schedule.weekdays.length
      || schedule.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6))) {
      invalidHabitData(`第 ${index + 1} 个习惯执行日无效`);
    }
    if (schedule.kind === "weekly" && (typeof schedule.targetDays !== "number"
      || !Number.isInteger(schedule.targetDays) || schedule.targetDays < 1 || schedule.targetDays > 7)) {
      invalidHabitData(`第 ${index + 1} 个习惯周目标无效`);
    }
    const reminder = habit.reminder;
    if (!isDataObject(reminder) || typeof reminder.enabled !== "boolean"
      || typeof reminder.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time)) {
      invalidHabitData(`第 ${index + 1} 个习惯提醒无效`);
    }
  }
  const logKeys = new Set<string>();
  for (const [index, log] of input.logs.entries()) {
    if (!isDataObject(log) || typeof log.habitId !== "string" || !habitIds.has(log.habitId)
      || !isHabitDate(log.date) || typeof log.value !== "number" || !Number.isFinite(log.value) || log.value < 0
      || typeof log.updatedAt !== "string") {
      invalidHabitData(`第 ${index + 1} 条打卡记录无效或关联习惯缺失`);
    }
    const key = JSON.stringify([log.habitId, log.date]);
    if (logKeys.has(key)) invalidHabitData(`第 ${index + 1} 条打卡记录重复`);
    logKeys.add(key);
  }
  // Validate persisted data without normalizing away rows or unknown metadata.
  return {
    ...input,
    schema: HABIT_TRACKER_SCHEMA,
    version: SHARED_WIDGET_DATA_VERSION,
    revision: input.revision,
    updatedAt: input.updatedAt,
    habits: input.habits as HabitDefinition[],
    logs: input.logs as HabitLog[],
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
      const index = file.habits.findIndex(item => item.id === habit.id);
      if (index < 0) file.habits.push(habit);
      else file.habits[index] = { ...file.habits[index], ...habit };
      return normalizeFile(file);
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
      return normalizeFile(file);
    },
  });
}

export async function setHabitValue(
  habitId: string,
  date: string,
  value: number,
): Promise<void> {
  if (!isHabitDate(date) || !Number.isFinite(value)) throw new Error("打卡日期或数值无效");
  await mutateSharedJson({
    store: "habit-tracker",
    path: HABIT_TRACKER_FILE,
    createEmpty: emptyFile,
    normalize: normalizeFile,
    mutate: (file) => {
      if (!file.habits.some((habit) => habit.id === habitId))
        throw new Error("习惯不存在");
      const next = Math.max(0, value);
      const previous = file.logs.find(log => log.habitId === habitId && log.date === date);
      file.logs = file.logs.filter(
        (log) => !(log.habitId === habitId && log.date === date),
      );
      if (next > 0)
        file.logs.push({
          ...previous,
          habitId,
          date,
          value: next,
          updatedAt: new Date().toISOString(),
        });
      return normalizeFile(file);
    },
  });
}
