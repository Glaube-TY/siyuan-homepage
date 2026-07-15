import type { EnhancedDiaryNotifySettings } from "./types";
import type { EnhancedDiaryWorkspaceProject } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceData";
import type { EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";

export function renderTodayDiaryMissingContent(): string {
  return "今天还没有写强化日记，建议花 5 分钟记录今日重点。";
}

export function renderYesterdayReviewMissingContent(): string {
  return "昨天还没有完成复盘，建议回顾昨天的重点和待办。";
}

export function renderUnmigratedTasksDigestContent(
  tasks: Array<{ id: string; taskname: string }>,
  settings: EnhancedDiaryNotifySettings,
): string {
  const max = settings.maxItemsPerMessage;
  const visible = tasks.slice(0, max);
  const lines = [`检测到 ${tasks.length} 个可能需要迁移的任务：`, ""];
  visible.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.taskname}`);
  });
  const hidden = tasks.length - visible.length;
  if (hidden > 0) {
    lines.push("", `还有 ${hidden} 个未展示，请回到思源查看。`);
  }
  return lines.join("\n");
}

export function renderWeeklyReviewReminderContent(): string {
  return "本周复盘时间到了，建议花 10 分钟回顾本周重点和进展。";
}

export function renderReviewDueContent(label: string, dateOrRange: string): string {
  return `${label}尚未完成（${dateOrRange}），建议打开强化日记工作台继续复盘。`;
}

export function renderWorkspaceTasksContent(tasks: EnhancedDiaryWorkspaceTask[], settings: EnhancedDiaryNotifySettings): string {
  const visible = tasks.slice(0, settings.maxItemsPerMessage);
  const lines = [`检测到 ${tasks.length} 个需要整理的工作台任务：`, ""];
  visible.forEach((task, index) => lines.push(`${index + 1}. ${task.taskname}${task.sourceDate ? `（来源 ${task.sourceDate}）` : ""}`));
  if (tasks.length > visible.length) lines.push("", `还有 ${tasks.length - visible.length} 个未展示。`);
  return lines.join("\n");
}

function projectLine(project: EnhancedDiaryWorkspaceProject, settings: EnhancedDiaryNotifySettings): string {
  const pathText = project.documentPath || project.path.join(" / ");
  const path = settings.includeProjectPath && pathText ? `｜路径：${pathText}` : "";
  const activity = project.lastActivityDate || "暂无";
  const inactive = project.inactiveDays == null ? "暂无活动" : `${project.inactiveDays} 天`;
  const link = settings.includeSiyuanLink ? `｜siyuan://blocks/${project.rootProjectId}` : "";
  return `${project.name}｜待办 ${project.openTaskCount}｜逾期 ${project.overdueTaskCount}｜最近活动 ${activity}｜停滞 ${inactive}${path}${link}`;
}

export function renderProjectDigestContent(
  projects: EnhancedDiaryWorkspaceProject[],
  settings: EnhancedDiaryNotifySettings,
  completed = false,
): string {
  const visible = projects.slice(0, settings.maxItemsPerMessage);
  const lines = visible.map((project, index) => `${index + 1}. ${projectLine(project, settings)}${completed ? "｜任务已全部完成，可检查是否归档。" : ""}`);
  if (projects.length > visible.length) lines.push(`还有 ${projects.length - visible.length} 个项目未展示。`);
  return lines.join("\n");
}

export function renderProjectWeeklyContent(stats: {
  activeProjects: number; activeThisWeek: number; overdueProjects: number; staleProjects: number; openTasks: number;
}): string {
  return [`活动项目：${stats.activeProjects}`, `本周有活动：${stats.activeThisWeek}`, `存在逾期：${stats.overdueProjects}`, `停滞项目：${stats.staleProjects}`, `待完成任务：${stats.openTasks}`].join("\n");
}

export function buildSiyuanLink(docId: string | undefined, include: boolean): string | undefined {
  if (!include || !docId) return undefined;
  return `siyuan://blocks/${docId}`;
}
