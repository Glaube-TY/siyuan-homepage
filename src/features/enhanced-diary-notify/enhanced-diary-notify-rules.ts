import { queryWorkspaceTasks } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import { getDiaryDocumentForDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { getCompletionMarker } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import { loadEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { EnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { EnhancedDiaryNotifyRule } from "./types";

let pluginInstance: any = null;

export function setEnhancedDiaryNotifyRulesPlugin(plugin: any): void {
  pluginInstance = plugin;
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatLocalDateTime(date: Date): string {
  return `${formatLocalDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function isWithinLocalDay(date: Date, target: Date): boolean {
  return date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate();
}

export function isDueWithinCatchUp(scheduledAt: Date, now: Date, catchUpWindowMinutes: number): boolean {
  const diffMs = now.getTime() - scheduledAt.getTime();
  return diffMs >= 0 && diffMs <= catchUpWindowMinutes * 60 * 1000;
}

export function shouldRunDailyRuleAt(rule: EnhancedDiaryNotifyRule, now: Date, catchUpWindowMinutes: number): Date | null {
  if (!rule.time) return null;
  const [hourText, minuteText] = rule.time.split(":");
  const scheduledAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hourText), Number(minuteText), 0, 0);
  return isDueWithinCatchUp(scheduledAt, now, catchUpWindowMinutes) ? scheduledAt : null;
}

export function shouldRunWeeklyRuleAt(rule: EnhancedDiaryNotifyRule, now: Date, catchUpWindowMinutes: number): Date | null {
  if (!rule.time || rule.weekday == null) return null;
  const [hourText, minuteText] = rule.time.split(":");
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const targetWeekday = rule.weekday % 7; // 1-7 -> 0-6
  if (dayOfWeek !== targetWeekday) return null;
  const scheduledAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hourText), Number(minuteText), 0, 0);
  return isDueWithinCatchUp(scheduledAt, now, catchUpWindowMinutes) ? scheduledAt : null;
}

export function getWeekId(date: Date): string {
  const d = new Date(date.getTime());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

async function loadDiaryConfig(): Promise<EnhancedDiaryConfig> {
  if (!pluginInstance) {
    return getDefaultEnhancedDiaryConfig();
  }
  return loadEnhancedDiaryConfig(pluginInstance);
}

function getDefaultEnhancedDiaryConfig(): EnhancedDiaryConfig {
  return {
    weekReviewDay: 0,
    monthReviewRule: "monthEnd",
    yearReviewRule: "dec31",
    templates: {
      day: "",
      week: "",
      month: "",
      year: "",
    },
    taskMigrationReminderDays: 30,
    workspaceSettings: {
      calendar: {
        showLunar: false,
        showSolarTerm: false,
        showFestival: false,
        showLegalHoliday: false,
        showBriefCounts: false,
      },
      modules: {
        taskManagementEnabled: true,
      },
    },
    recordCategorySuggestions: [],
    reviewReminderWindows: {
      week: { beforeDays: 1, afterDays: 1 },
      month: { beforeDays: 1, afterDays: 1 },
      year: { beforeDays: 1, afterDays: 1 },
    },
    headingStructure: {
      dayWorkspaceBaseHeadingLevel: 2,
    },
    templateFieldMapping: structuredClone(DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING),
  };
}

export async function hasTodayDiaryDoc(today: Date): Promise<boolean> {
  const doc = await getDiaryDocumentForDate(today);
  return doc != null;
}

export async function hasYesterdayReviewCompleted(yesterday: Date): Promise<boolean> {
  const doc = await getDiaryDocumentForDate(yesterday);
  if (!doc) return false;
  const completionMarker = getCompletionMarker("day", true);
  return doc.content.includes(completionMarker);
}

export async function getDiaryDocForNotify(date: Date): Promise<{ id: string } | null> {
  try {
    const doc = await getDiaryDocumentForDate(date);
    if (!doc) return null;
    return { id: doc.id };
  } catch {
    return null;
  }
}

export async function getYesterdayReviewDoc(yesterday: Date): Promise<{ id: string; reviewCompleted: boolean } | null> {
  try {
    const doc = await getDiaryDocumentForDate(yesterday);
    if (!doc) return null;
    const completionMarker = getCompletionMarker("day", true);
    return { id: doc.id, reviewCompleted: doc.content.includes(completionMarker) };
  } catch {
    return null;
  }
}

export async function getUnmigratedTasks(today: Date): Promise<Array<{ id: string; taskname: string }>> {
  const config = await loadDiaryConfig();
  const tasks = await queryWorkspaceTasks(config, today);
  return tasks
    .filter((t) => t.shouldMigrate && !t.completed)
    .map((t) => ({ id: t.id, taskname: t.taskname }));
}
