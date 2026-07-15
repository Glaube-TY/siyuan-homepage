import { queryWorkspaceTasks } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import { findDiaryDocumentByDate, getDiaryDocumentForDate, setEnhancedDiaryIndexNotebook, inspectEnhancedDiaryDocumentTarget, formatDiaryAttrDate, readDiaryMarkdownResult } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { scanDiaryContentForPeriod } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import { loadEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { getEnhancedDiaryIndexEntriesStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import { formatLocalDate, formatLocalDateTime } from "@/components/tools/date-utils";
import type { EnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { EnhancedDiaryNotifyRule } from "./types";

export { formatLocalDate, formatLocalDateTime };

let pluginInstance: any = null;

export function setEnhancedDiaryNotifyRulesPlugin(plugin: any): void {
  pluginInstance = plugin;
}

export function getEnhancedDiaryNotifyRulesPlugin(): any {
  if (!pluginInstance) throw new Error("强化日记通知规则尚未初始化。");
  return pluginInstance;
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
  const targetWeekday = rule.weekday; // 0=周日，6=周六
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

export async function loadDiaryConfig(): Promise<EnhancedDiaryConfig> {
  if (!pluginInstance) {
    return getDefaultEnhancedDiaryConfig();
  }
  return loadEnhancedDiaryConfig(pluginInstance);
}

export interface DiaryNotifyIndexPreparation {
  config: EnhancedDiaryConfig;
  ready: boolean;
}

export async function prepareDiaryNotifyIndex(): Promise<DiaryNotifyIndexPreparation> {
  try {
    const config = await loadDiaryConfig();
    if (!config.dailyNotebookId) return { config, ready: false };
    setEnhancedDiaryIndexNotebook(config.dailyNotebookId);
    await getEnhancedDiaryIndexEntriesStrict(config.dailyNotebookId);
    return { config, ready: true };
  } catch (error) {
    throw new Error(`强化日记通知索引读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
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
    projectStorage: {
      mode: "notebook",
      notebookId: "",
      parentDocId: "",
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
      tasks: {
        defaultView: "list",
        defaultCompletionScope: "active",
        defaultSort: "smart",
        showCompletedInCalendar: false,
        weekStartDay: 1,
        matrixImportanceThreshold: 3,
        matrixUrgencyDays: 3,
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

export async function hasTodayDiaryDoc(today: Date, notebookId?: string): Promise<boolean> {
  const doc = await getDiaryDocumentForDate(today, notebookId);
  return doc != null;
}

export type DiaryNotifyDocLookup =
  | { state: "exists"; id: string }
  | { state: "missing" }
  | { state: "unknown" };

export async function getDiaryDocForNotify(date: Date, notebookId?: string): Promise<DiaryNotifyDocLookup> {
  if (!notebookId) return { state: "missing" };
  try {
    const entry = await findDiaryDocumentByDate(date, notebookId);
    if (!entry) return { state: "missing" };

    const inspection = await inspectEnhancedDiaryDocumentTarget(
      entry.id,
      notebookId,
      formatDiaryAttrDate(date)
    );

    if (inspection.status === "valid") {
      return { state: "exists", id: entry.id };
    }
    if (inspection.status === "missing") {
      return { state: "missing" };
    }
    if (inspection.status === "out_of_scope" || inspection.status === "date_mismatch") {
      return { state: "missing" };
    }
    // inspection.status === "unknown" — SQL failed, do not send misleading notification
    return { state: "unknown" };
  } catch {
    return { state: "unknown" };
  }
}

export type YesterdayReviewStatus = "completed" | "skipped" | "pending" | "missing_template";

export async function getYesterdayReviewDoc(
  yesterday: Date,
  config: EnhancedDiaryConfig,
): Promise<{ id: string; status: YesterdayReviewStatus } | null> {
  const notebookId = config.dailyNotebookId;
  if (!notebookId) return null;
  try {
    const entry = await findDiaryDocumentByDate(yesterday, notebookId);
    if (!entry) return null;

    const inspection = await inspectEnhancedDiaryDocumentTarget(
      entry.id,
      notebookId,
      formatDiaryAttrDate(yesterday)
    );

    if (inspection.status !== "valid") {
      return null;
    }

    const markdownResult = await readDiaryMarkdownResult(entry.id);
    if (!markdownResult.ok) return null;
    const scan = scanDiaryContentForPeriod(markdownResult.content, "day", config.templateFieldMapping);
    const status: YesterdayReviewStatus = scan.skipped
      ? "skipped"
      : scan.completed
        ? "completed"
        : scan.hasCompletionMarker
          ? "pending"
          : "missing_template";
    return { id: entry.id, status };
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
