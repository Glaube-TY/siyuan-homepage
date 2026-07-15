import { formatLocalDate } from "@/components/tools/date-utils";
import { getEnhancedDiaryIndexEntriesStrict, type DiaryIndexEntry } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { readEnhancedDiaryProjectIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectIndex";
import { readEnhancedDiaryProjectRecordIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectRecordIndex";
import type { EnhancedDiaryProjectIndexPayload } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectTypes";
import { isEnhancedDiaryProjectStorageReady, type EnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import { buildEnhancedDiaryWorkspaceProjectSummary, type EnhancedDiaryWorkspaceProject } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceData";
import { queryWorkspaceTasks, type EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import { buildWorkspaceReviewCards, type EnhancedDiaryWorkspaceReviewCard } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceViewModel";
import { getEnhancedDiaryNotifyRulesPlugin, loadDiaryConfig } from "./enhanced-diary-notify-rules";
import type { EnhancedDiaryNotifyRuleType } from "./types";

export type EnhancedDiaryNotifyCategory = "review" | "tasks" | "projects";

export interface EnhancedDiaryNotifyReviewData {
  diaryIndex: Record<string, DiaryIndexEntry>;
  reviewState: EnhancedDiaryWorkspaceReviewCard[];
}

export interface EnhancedDiaryNotifyTaskData {
  tasks: EnhancedDiaryWorkspaceTask[];
}

export interface EnhancedDiaryNotifyProjectData {
  projectIndex: EnhancedDiaryProjectIndexPayload;
  projects: EnhancedDiaryWorkspaceProject[];
}

export interface EnhancedDiaryNotifySnapshot {
  config: EnhancedDiaryConfig | null;
  review: EnhancedDiaryNotifyReviewData | null;
  tasks: EnhancedDiaryNotifyTaskData | null;
  projects: EnhancedDiaryNotifyProjectData | null;
  errors: Partial<Record<EnhancedDiaryNotifyCategory, Error>>;
}

const REVIEW_TYPES = new Set<EnhancedDiaryNotifyRuleType>([
  "today_diary_missing", "yesterday_review_missing", "daily_review_due", "weekly_review_reminder",
  "monthly_review_due", "yearly_review_due",
]);
const TASK_TYPES = new Set<EnhancedDiaryNotifyRuleType>([
  "unmigrated_tasks_digest", "workspace_overdue_tasks_digest", "stale_workspace_tasks_digest",
]);
const PROJECT_TYPES = new Set<EnhancedDiaryNotifyRuleType>([
  "project_overdue_digest", "project_stale_digest", "project_completed_digest", "project_weekly_digest",
]);

export function getEnhancedDiaryNotifyCategory(type: EnhancedDiaryNotifyRuleType): EnhancedDiaryNotifyCategory {
  if (REVIEW_TYPES.has(type)) return "review";
  if (TASK_TYPES.has(type)) return "tasks";
  return "projects";
}

function toError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(error == null ? fallback : String(error));
}

export async function loadEnhancedDiaryNotifySnapshot(
  dueTypes: EnhancedDiaryNotifyRuleType[],
  now: Date,
): Promise<EnhancedDiaryNotifySnapshot> {
  const needsReview = dueTypes.some((type) => REVIEW_TYPES.has(type));
  const needsTasks = dueTypes.some((type) => TASK_TYPES.has(type));
  const needsProjects = dueTypes.some((type) => PROJECT_TYPES.has(type));
  const errors: EnhancedDiaryNotifySnapshot["errors"] = {};
  let config: EnhancedDiaryConfig;
  try {
    config = await loadDiaryConfig();
  } catch (error) {
    const configError = toError(error, "强化日记配置读取失败。");
    if (needsReview) errors.review = configError;
    if (needsTasks) errors.tasks = configError;
    if (needsProjects) errors.projects = configError;
    return { config: null, review: null, tasks: null, projects: null, errors };
  }

  let review: EnhancedDiaryNotifyReviewData | null = null;
  if (needsReview) {
    try {
      if (!config.dailyNotebookId) throw new Error("尚未配置强化日记笔记本。");
      const diaryIndex = await getEnhancedDiaryIndexEntriesStrict(config.dailyNotebookId);
      const reviewState = await buildWorkspaceReviewCards(config, now);
      review = { diaryIndex, reviewState };
    } catch (error) {
      errors.review = toError(error, "日记与复盘数据读取失败。");
    }
  }

  let strictProjectIndex: EnhancedDiaryProjectIndexPayload | null = null;
  if (needsProjects) {
    try {
      if (!config.dailyNotebookId) throw new Error("尚未配置强化日记笔记本。");
      if (!isEnhancedDiaryProjectStorageReady(config.projectStorage)) throw new Error("尚未配置强化日记项目容器。");
      strictProjectIndex = await readEnhancedDiaryProjectIndexStrict(config.projectStorage);
    } catch (error) {
      errors.projects = toError(error, "项目索引读取失败。");
    }
  }

  let loadedTasks: EnhancedDiaryWorkspaceTask[] | null = null;
  if (needsTasks || (needsProjects && strictProjectIndex !== null)) {
    try {
      loadedTasks = await queryWorkspaceTasks(config, now, getEnhancedDiaryNotifyRulesPlugin(), {
        requireFreshIndex: true,
        projectIndex: strictProjectIndex ?? undefined,
      });
    } catch (error) {
      const taskError = toError(error, "任务索引初始化或刷新失败。");
      if (needsTasks) errors.tasks = taskError;
      if (needsProjects && !errors.projects) errors.projects = new Error(`项目通知依赖任务数据失败：${taskError.message}`);
    }
  }

  let tasks: EnhancedDiaryNotifyTaskData | null = null;
  if (needsTasks && loadedTasks !== null) tasks = { tasks: loadedTasks };

  let projects: EnhancedDiaryNotifyProjectData | null = null;
  if (needsProjects && !errors.projects && strictProjectIndex && loadedTasks) {
    try {
      const recordIndex = await readEnhancedDiaryProjectRecordIndexStrict(config.dailyNotebookId!);
      const projectRows = buildEnhancedDiaryWorkspaceProjectSummary(
        strictProjectIndex, loadedTasks, Object.values(recordIndex.items), formatLocalDate(now),
      ).filter((project) => project.level === 0 && project.status === "active");
      projects = { projectIndex: strictProjectIndex, projects: projectRows };
    } catch (error) {
      errors.projects = toError(error, "项目记录或项目汇总数据读取失败。");
    }
  }

  return { config, review, tasks, projects, errors };
}
