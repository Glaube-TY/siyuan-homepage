import { loadEnhancedDiaryWorkspaceState } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceData";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type {
  GetDailyWorkspaceOverviewInput,
  GetDailyWorkspaceOverviewOutput,
} from "../contracts/get-daily-workspace-overview.contract";
import {
  formatAgendaDate,
  mapAgendaCarryover,
  mapAgendaNotification,
  mapAgendaProject,
  mapAgendaRecord,
  mapAgendaReview,
  mapAgendaTask,
  parseAgendaDate,
} from "./agenda-utils.impl";

const TASK_LIMIT = 20;
const RECORD_LIMIT = 10;
const PROJECT_LIMIT = 10;
const NOTIFICATION_LIMIT = 20;
const REVIEW_LIMIT = 10;
const CARRYOVER_LIMIT = 8;
const DEFAULT_INCLUDE: NonNullable<GetDailyWorkspaceOverviewInput["include"]> = [
  "summary",
  "tasks",
  "records",
  "projects",
  "notifications",
  "reviews",
  "carryover",
];

export async function executeGetDailyWorkspaceOverview(
  deps: KbRetrievalToolDeps,
  args: GetDailyWorkspaceOverviewInput,
): Promise<{ safeOutput: GetDailyWorkspaceOverviewOutput }> {
  const date = parseAgendaDate(args.date);
  const include = new Set(args.include ?? DEFAULT_INCLUDE);
  const state = await loadEnhancedDiaryWorkspaceState(
    {
      async loadData(file: string): Promise<unknown> {
        return deps.loadPluginData ? deps.loadPluginData(file) : null;
      },
    },
    { date },
  );

  const output: GetDailyWorkspaceOverviewOutput = {
    date: state.today || formatAgendaDate(date),
    todayDiaryExists: state.todayDiaryExists,
    todayDiary: state.todayDiary
      ? {
          docId: state.todayDiary.id,
          title: state.todayDiary.title,
          date: state.today,
        }
      : undefined,
    templateValid: state.templateValid,
    missingSections: state.missingSections,
    limits: {
      tasks: TASK_LIMIT,
      records: RECORD_LIMIT,
      projects: PROJECT_LIMIT,
      notifications: NOTIFICATION_LIMIT,
      reviews: REVIEW_LIMIT,
      carryoverPlans: CARRYOVER_LIMIT,
    },
    counts: {
      tasksTotal: state.tasks.length,
      tasksReturned: include.has("tasks") ? Math.min(state.tasks.length, TASK_LIMIT) : 0,
      tasksTruncated: include.has("tasks") ? state.tasks.length > TASK_LIMIT : false,
      recordsTotal: state.records.length,
      recordsReturned: include.has("records") ? Math.min(state.records.length, RECORD_LIMIT) : 0,
      recordsTruncated: include.has("records") ? state.records.length > RECORD_LIMIT : false,
      projectsTotal: state.projects.length,
      projectsReturned: include.has("projects") ? Math.min(state.projects.length, PROJECT_LIMIT) : 0,
      projectsTruncated: include.has("projects") ? state.projects.length > PROJECT_LIMIT : false,
      notificationsTotal: state.notifications.length,
      notificationsReturned: include.has("notifications") ? Math.min(state.notifications.length, NOTIFICATION_LIMIT) : 0,
      notificationsTruncated: include.has("notifications") ? state.notifications.length > NOTIFICATION_LIMIT : false,
      reviewsTotal: state.reviewCards.length,
      reviewsReturned: include.has("reviews") ? Math.min(state.reviewCards.length, REVIEW_LIMIT) : 0,
      reviewsTruncated: include.has("reviews") ? state.reviewCards.length > REVIEW_LIMIT : false,
      carryoverPlansTotal: state.carryoverPlans.length,
      carryoverPlansReturned: include.has("carryover") ? Math.min(state.carryoverPlans.length, CARRYOVER_LIMIT) : 0,
      carryoverPlansTruncated: include.has("carryover") ? state.carryoverPlans.length > CARRYOVER_LIMIT : false,
    },
    note: "只读概览；不会创建日记、补模板、写入任务、迁移任务或修改记录。本结果不包含完整明细；明细查询能力依赖真实参数。",
  };

  if (include.has("summary")) {
    output.summary = state.summary;
  }
  if (include.has("tasks")) {
    output.tasks = state.tasks.slice(0, TASK_LIMIT).map(mapAgendaTask);
  }
  if (include.has("records")) {
    output.records = state.records
      .slice(0, RECORD_LIMIT)
      .map((record, index) => mapAgendaRecord(record, state.today, index));
  }
  if (include.has("projects")) {
    output.projects = state.projects.slice(0, PROJECT_LIMIT).map(mapAgendaProject);
  }
  if (include.has("notifications")) {
    output.notifications = state.notifications
      .slice(0, NOTIFICATION_LIMIT)
      .map(mapAgendaNotification);
  }
  if (include.has("reviews")) {
    output.reviews = state.reviewCards.slice(0, REVIEW_LIMIT).map(mapAgendaReview);
  }
  if (include.has("carryover")) {
    output.carryoverPlans = state.carryoverPlans
      .slice(0, CARRYOVER_LIMIT)
      .map(mapAgendaCarryover);
  }

  return { safeOutput: output };
}
