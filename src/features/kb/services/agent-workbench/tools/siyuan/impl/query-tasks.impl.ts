import { queryWorkspaceTasks } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import type { EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type {
  QueryTasksInput,
  QueryTasksOutput,
} from "../contracts/query-tasks.contract";
import {
  countTaskPriority,
  formatAgendaDate,
  loadAgendaEnhancedDiaryConfig,
  mapAgendaTask,
  parseAgendaDate,
} from "./agenda-utils.impl";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isFutureTask(task: EnhancedDiaryWorkspaceTask, date: string): boolean {
  const dates = [task.startDate, task.deadline].filter(Boolean);
  return !task.completed && dates.some((item) => item > date);
}

function taskRelevantDate(task: EnhancedDiaryWorkspaceTask): string {
  return task.deadline || task.startDate || task.sourceDate || "";
}

function taskMatchesScope(
  task: EnhancedDiaryWorkspaceTask,
  scope: QueryTasksInput["scope"],
  date: string,
): boolean {
  switch (scope) {
    case "today":
      return task.isTodayTask;
    case "overdue":
      return task.isOverdue;
    case "upcoming":
      return isFutureTask(task, date);
    case "completed":
      return task.completed;
    case "open":
      return !task.completed;
    case "all":
    default:
      return true;
  }
}

function taskMatchesStatus(
  task: EnhancedDiaryWorkspaceTask,
  status: QueryTasksInput["status"],
): boolean {
  if (status === "done") return task.completed;
  if (status === "not_done") return !task.completed;
  return true;
}

function taskMatchesKeyword(task: EnhancedDiaryWorkspaceTask, keyword: string | undefined): boolean {
  if (!keyword) return true;
  const query = normalize(keyword);
  return [
    task.taskname,
    task.markdown,
    task.location,
    task.hpath,
    task.sourceDocTitle,
  ].some((value) => normalize(value || "").includes(query));
}

function taskMatchesTags(task: EnhancedDiaryWorkspaceTask, tags: string[] | undefined): boolean {
  if (!tags?.length) return true;
  const taskTags = new Set(task.tags.map(normalize));
  return tags.every((tag) => taskTags.has(normalize(tag)));
}

function taskMatchesPriority(
  task: EnhancedDiaryWorkspaceTask,
  priority: number[] | undefined,
): boolean {
  if (!priority?.length) return true;
  return priority.includes(countTaskPriority(task.priority));
}

function taskMatchesDateRange(
  task: EnhancedDiaryWorkspaceTask,
  startDate: string | undefined,
  endDate: string | undefined,
): boolean {
  if (!startDate && !endDate) return true;
  const start = startDate || "0000-01-01";
  const end = endDate || "9999-12-31";
  if (task.startDate && task.deadline) {
    return task.startDate <= end && task.deadline >= start;
  }
  return [task.startDate, task.deadline, task.sourceDate]
    .filter(Boolean)
    .some((date) => date >= start && date <= end);
}

function sortTasks(a: EnhancedDiaryWorkspaceTask, b: EnhancedDiaryWorkspaceTask): number {
  const openDelta = Number(a.completed) - Number(b.completed);
  if (openDelta !== 0) return openDelta;
  const overdueDelta = Number(b.isOverdue) - Number(a.isOverdue);
  if (overdueDelta !== 0) return overdueDelta;
  const priorityDelta = countTaskPriority(b.priority) - countTaskPriority(a.priority);
  if (priorityDelta !== 0) return priorityDelta;
  const aDate = taskRelevantDate(a) || "9999-12-31";
  const bDate = taskRelevantDate(b) || "9999-12-31";
  return aDate.localeCompare(bDate);
}

function resolveQueryTasksArgs(args: QueryTasksInput): Required<Pick<QueryTasksInput, "scope" | "status" | "limit">> & QueryTasksInput {
  return {
    ...args,
    scope: args.scope ?? "all",
    status: args.status ?? "any",
    limit: args.limit ?? 30,
  };
}

export async function executeQueryTasks(
  deps: KbRetrievalToolDeps,
  args: QueryTasksInput,
): Promise<{ safeOutput: QueryTasksOutput }> {
  const input = resolveQueryTasksArgs(args);
  const date = parseAgendaDate(input.date);
  const dateText = formatAgendaDate(date);
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const tasks = await queryWorkspaceTasks(config, date);

  const matched = tasks
    .filter((task) => taskMatchesScope(task, input.scope, dateText))
    .filter((task) => taskMatchesStatus(task, input.status))
    .filter((task) => taskMatchesDateRange(task, input.startDate, input.endDate))
    .filter((task) => taskMatchesKeyword(task, input.keyword))
    .filter((task) => taskMatchesTags(task, input.tags))
    .filter((task) => taskMatchesPriority(task, input.priority))
    .sort(sortTasks);

  return {
    safeOutput: {
      date: dateText,
      tasks: matched.slice(0, input.limit).map(mapAgendaTask),
      totalMatched: matched.length,
      returned: Math.min(matched.length, input.limit),
      note: "只读任务查询；不会修改完成状态、创建任务、迁移任务、刷新循环任务或写入任何内容。",
    },
  };
}
