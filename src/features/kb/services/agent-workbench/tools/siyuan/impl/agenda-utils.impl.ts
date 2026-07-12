import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { EnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import { loadEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { initializeEnhancedDiaryIndex } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { setEnhancedDiaryIndexNotebook } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { formatLocalDate, parseLocalDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceDate";
import type { EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import type { EnhancedDiaryWorkspaceRecord } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceRecordService";
import type { EnhancedDiaryWorkspaceProject } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceData";
import type { EnhancedDiaryWorkspaceNotification } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceNotifications";
import type { EnhancedDiaryWorkspaceReviewCard } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceViewModel";
import type { EnhancedDiaryCarryoverItem } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceCarryover";
import type {
  AgendaDiaryRecord,
  AgendaTask,
} from "../contracts/agenda-common.contract";

const TASK_MARKDOWN_MAX_CHARS = 500;
const RECORD_CONTENT_MAX_CHARS = 700;
const PROJECT_PROGRESS_MAX_CHARS = 600;
const CARRYOVER_CONTENT_MAX_CHARS = 700;

export function parseAgendaDate(value: string | undefined): Date {
  return value ? parseLocalDate(value) : new Date();
}

export function formatAgendaDate(date: Date): string {
  return formatLocalDate(date);
}

export function truncateAgendaText(value: string | undefined, maxChars: number): string {
  const text = (value ?? "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function cleanOptionalString(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

export function countTaskPriority(priority: string): number {
  return (priority.match(/❗/g) ?? []).length;
}

export async function loadAgendaEnhancedDiaryConfig(
  deps: KbRetrievalToolDeps,
): Promise<EnhancedDiaryConfig> {
  return loadEnhancedDiaryConfig({
    async loadData(file: string): Promise<unknown> {
      return deps.loadPluginData ? deps.loadPluginData(file) : null;
    },
  });
}

export async function prepareAgendaEnhancedDiaryIndex(
  deps: KbRetrievalToolDeps,
  config?: EnhancedDiaryConfig,
): Promise<EnhancedDiaryConfig> {
  const resolvedConfig = config || await loadAgendaEnhancedDiaryConfig(deps);
  if (!resolvedConfig.dailyNotebookId) {
    throw new Error("未配置强化日记笔记本，无法使用日记工具。");
  }
  setEnhancedDiaryIndexNotebook(resolvedConfig.dailyNotebookId);
  const status = await initializeEnhancedDiaryIndex(resolvedConfig.dailyNotebookId);
  if (status.lastStatus !== "success") {
    throw new Error(status.lastMessage || "强化日记索引初始化失败。");
  }
  return resolvedConfig;
}

/**
 * Create a minimal plugin-like adapter from Agent tool deps.
 * Provides loadData/saveData for functions that need plugin.loadData(...)
 * (e.g. loadHomepageSettingConfig, loadEnhancedDiaryConfig).
 * Does NOT use AgentScope — AgentScope is not a plugin instance.
 */
export function createDiaryToolPluginAdapter(deps: KbRetrievalToolDeps) {
  return {
    async loadData(file: string): Promise<unknown> {
      return deps.loadPluginData ? deps.loadPluginData(file) : null;
    },
    async saveData(file: string, data: unknown): Promise<void> {
      if (deps.savePluginData) {
        await deps.savePluginData(file, data);
      }
    },
  };
}

export function mapAgendaTask(task: EnhancedDiaryWorkspaceTask): AgendaTask {
  return {
    taskId: task.id,
    blockId: task.blockId,
    rootId: cleanOptionalString(task.rootId),
    box: cleanOptionalString(task.box),
    hpath: cleanOptionalString(task.hpath),
    markdown: truncateAgendaText(task.markdown, TASK_MARKDOWN_MAX_CHARS),
    taskname: task.taskname,
    completed: task.completed,
    priority: task.priority,
    startDate: task.startDate,
    deadline: task.deadline,
    recurrence: task.recurrence,
    reminder: task.reminder,
    location: task.location,
    tags: task.tags,
    sourceKind: task.sourceKind,
    sourceDate: cleanOptionalString(task.sourceDate),
    sourceDocId: cleanOptionalString(task.sourceDocId),
    sourceDocTitle: cleanOptionalString(task.sourceDocTitle),
    isTodayTask: task.isTodayTask,
    isOverdue: task.isOverdue,
    shouldMigrate: task.shouldMigrate,
  };
}

export function mapAgendaRecord(
  record: EnhancedDiaryWorkspaceRecord,
  fallbackDate: string,
  index: number,
): AgendaDiaryRecord {
  return {
    recordId: record.id || record.headingBlockId || `${record.docId}-${index + 1}`,
    date: record.date || fallbackDate,
    docId: record.docId,
    docTitle: cleanOptionalString(record.docTitle),
    categoryTitle: record.categoryTitle,
    categoryKey: cleanOptionalString(record.categoryKey),
    headingTitle: record.headingTitle,
    timeText: record.timeText,
    content: truncateAgendaText(record.content, RECORD_CONTENT_MAX_CHARS),
    headingBlockId: cleanOptionalString(record.headingBlockId),
  };
}

export function mapAgendaProject(project: EnhancedDiaryWorkspaceProject) {
  return {
    name: project.name,
    taskCount: project.taskCount,
    openTaskCount: project.openTaskCount,
    todayTaskCount: project.todayTaskCount,
    overdueTaskCount: project.overdueTaskCount,
    lastActivityDate: project.lastActivityDate,
    inactiveDays: project.inactiveDays,
    healthStatus: project.healthStatus,
    healthLabel: project.healthLabel,
    healthTone: project.healthTone,
    hasTodayProgress: project.hasTodayProgress,
    progressPreview: cleanOptionalString(
      truncateAgendaText(project.progressMarkdown, PROJECT_PROGRESS_MAX_CHARS),
    ),
  };
}

export function mapAgendaNotification(notification: EnhancedDiaryWorkspaceNotification) {
  return {
    id: notification.id,
    type: notification.type,
    level: notification.level,
    title: notification.title,
    description: notification.description,
    relatedTaskId: cleanOptionalString(notification.relatedTaskId),
    relatedDocId: cleanOptionalString(notification.relatedDocId),
    reviewPeriod: notification.reviewPeriod,
    action: notification.action,
  };
}

export function mapAgendaReview(card: EnhancedDiaryWorkspaceReviewCard) {
  return {
    period: card.period,
    title: card.title,
    status: card.status,
    statusLabel: card.statusLabel,
    dateOrRange: card.dateOrRange,
    docId: cleanOptionalString(card.docId),
    targetDate: formatAgendaDate(card.targetDate),
  };
}

export function mapAgendaCarryover(item: EnhancedDiaryCarryoverItem) {
  return {
    period: item.period,
    periodLabel: item.periodLabel,
    sourceLabel: item.sourceLabel,
    sourceDateOrRange: item.sourceDateOrRange,
    fieldLabel: item.fieldLabel,
    content: truncateAgendaText(item.content, CARRYOVER_CONTENT_MAX_CHARS),
    lines: item.lines.slice(0, 8),
    docId: cleanOptionalString(item.docId),
  };
}
