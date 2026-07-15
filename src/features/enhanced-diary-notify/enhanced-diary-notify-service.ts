import { notificationCenter } from "@/features/notification-center";
import { daysBetweenLocalDates } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceDate";
import {
  formatLocalDate, getWeekId, getDiaryDocForNotify, getYesterdayReviewDoc,
  shouldRunDailyRuleAt, shouldRunWeeklyRuleAt,
} from "./enhanced-diary-notify-rules";
import {
  buildSiyuanLink, renderProjectDigestContent, renderProjectWeeklyContent, renderReviewDueContent,
  renderTodayDiaryMissingContent, renderUnmigratedTasksDigestContent, renderWeeklyReviewReminderContent,
  renderWorkspaceTasksContent, renderYesterdayReviewMissingContent,
} from "./enhanced-diary-notify-render";
import { getEnhancedDiaryNotifyCategory, loadEnhancedDiaryNotifySnapshot } from "./enhanced-diary-notify-snapshot";
import type { EnhancedDiaryNotifyRule, EnhancedDiaryNotifySettings } from "./types";

function scheduledFor(rule: EnhancedDiaryNotifyRule, now: Date, catchUp: number): Date | null {
  return rule.type === "weekly_review_reminder" || rule.type === "project_weekly_digest"
    ? shouldRunWeeklyRuleAt(rule, now, catchUp)
    : shouldRunDailyRuleAt(rule, now, catchUp);
}

function reviewPending(status: string): boolean {
  return status === "pending" || status === "overdue" || status === "missing_template" || status === "not_created";
}

async function send(
  rule: EnhancedDiaryNotifyRule, settings: EnhancedDiaryNotifySettings, scheduledAt: Date,
  occurrenceKey: string, content: string, level: "info" | "success" | "warning" = "info",
  extra: Record<string, unknown> = {}, url?: string,
): Promise<void> {
  await notificationCenter.notify({
    type: rule.type, title: rule.title || "强化日记通知", content, level, source: "diary", sourceId: rule.id,
    occurrenceKey, scheduledAt: scheduledAt.toISOString(),
    expiresAt: new Date(scheduledAt.getTime() + settings.catchUpWindowMinutes * 60000).toISOString(),
    extra: { type: rule.type, ...extra }, url,
  }, { targets: rule.deliveryTargets, reason: "enhanced-diary-notify" });
}

export async function runEnhancedDiaryNotifyScan(settings: EnhancedDiaryNotifySettings, now = new Date()): Promise<void> {
  if (!settings.enabled) return;
  const due = settings.rules
    .filter((rule) => rule.enabled)
    .map((rule) => ({ rule, scheduledAt: scheduledFor(rule, now, settings.catchUpWindowMinutes) }))
    .filter((item): item is { rule: EnhancedDiaryNotifyRule; scheduledAt: Date } => item.scheduledAt !== null);
  if (due.length === 0) return;

  const snapshot = await loadEnhancedDiaryNotifySnapshot(due.map(({ rule }) => rule.type), now);
  for (const [category, error] of Object.entries(snapshot.errors)) {
    if (error) console.warn(`[enhanced-diary-notify] ${category} category skipped: ${error.message}`);
  }
  const todayStr = formatLocalDate(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterday);
  const reviewByPeriod = new Map((snapshot.review?.reviewState ?? []).map((card) => [card.period, card]));

  for (const { rule, scheduledAt } of due) {
    const category = getEnhancedDiaryNotifyCategory(rule.type);
    if (snapshot.errors[category]) continue;
    try {
      switch (rule.type) {
      case "today_diary_missing": {
        const doc = await getDiaryDocForNotify(now, snapshot.config!.dailyNotebookId);
        if (doc.state === "missing") await send(rule, settings, scheduledAt, `enhanced-diary:today-missing:${rule.id}:${todayStr}`, renderTodayDiaryMissingContent());
        break;
      }
      case "yesterday_review_missing": {
        const doc = await getYesterdayReviewDoc(yesterday, snapshot.config!);
        if (doc && (doc.status === "pending" || doc.status === "missing_template")) await send(rule, settings, scheduledAt, `enhanced-diary:yesterday-review:${rule.id}:${yesterdayStr}`, renderYesterdayReviewMissingContent(), "warning", {}, buildSiyuanLink(doc.id, settings.includeSiyuanLink));
        break;
      }
      case "weekly_review_reminder":
        await send(rule, settings, scheduledAt, `enhanced-diary:weekly-review:${rule.id}:${getWeekId(now)}`, renderWeeklyReviewReminderContent());
        break;
      case "daily_review_due":
      case "monthly_review_due":
      case "yearly_review_due": {
        const period = rule.type === "daily_review_due" ? "day" : rule.type === "monthly_review_due" ? "month" : "year";
        const card = reviewByPeriod.get(period);
        if (card && reviewPending(card.status)) await send(rule, settings, scheduledAt, `enhanced-diary:${period}-review-due:${rule.id}:${card.dateOrRange}`, renderReviewDueContent(card.title, card.dateOrRange), "warning", { period, status: card.status }, buildSiyuanLink(card.docId, settings.includeSiyuanLink));
        break;
      }
      case "unmigrated_tasks_digest": {
        const tasks = snapshot.tasks!.tasks.filter((task) => task.shouldMigrate && !task.completed);
        if (tasks.length) await send(rule, settings, scheduledAt, `enhanced-diary:unmigrated-tasks:${rule.id}:${todayStr}`, renderUnmigratedTasksDigestContent(tasks, settings), "info", { count: tasks.length });
        break;
      }
      case "workspace_overdue_tasks_digest": {
        const tasks = snapshot.tasks!.tasks.filter((task) => !task.completed && task.isOverdue && (task.shouldMigrate || task.sourceKind !== "normal"));
        if (tasks.length) await send(rule, settings, scheduledAt, `enhanced-diary:workspace-overdue:${rule.id}:${todayStr}`, renderWorkspaceTasksContent(tasks, settings), "warning", { count: tasks.length });
        break;
      }
      case "stale_workspace_tasks_digest": {
        const threshold = rule.inactiveDaysThreshold ?? 7;
        const tasks = snapshot.tasks!.tasks.filter((task) => !task.completed && task.sourceDate && daysBetweenLocalDates(task.sourceDate, todayStr) >= threshold && (task.shouldMigrate || task.sourceKind !== "normal"));
        if (tasks.length) await send(rule, settings, scheduledAt, `enhanced-diary:workspace-stale:${rule.id}:${todayStr}`, renderWorkspaceTasksContent(tasks, settings), "warning", { count: tasks.length, threshold });
        break;
      }
      case "project_overdue_digest": {
        const projects = snapshot.projects!.projects.filter((project) => project.overdueTaskCount > 0);
        if (projects.length) await send(rule, settings, scheduledAt, `enhanced-diary:project-overdue:${rule.id}:${todayStr}`, renderProjectDigestContent(projects, settings), "warning", { count: projects.length });
        break;
      }
      case "project_stale_digest": {
        const threshold = rule.inactiveDaysThreshold ?? 14;
        const projects = snapshot.projects!.projects.filter((project) => project.openTaskCount > 0 && project.inactiveDays != null && project.inactiveDays >= threshold);
        if (projects.length) await send(rule, settings, scheduledAt, `enhanced-diary:project-stale:${rule.id}:${todayStr}`, renderProjectDigestContent(projects, settings), "warning", { count: projects.length, threshold });
        break;
      }
      case "project_completed_digest": {
        const projects = snapshot.projects!.projects.filter((project) => project.taskCount > 0 && project.openTaskCount === 0);
        if (projects.length) await send(rule, settings, scheduledAt, `enhanced-diary:project-completed:${rule.id}:${todayStr}`, renderProjectDigestContent(projects, settings, true), "success", { count: projects.length });
        break;
      }
      case "project_weekly_digest": {
        const weekStart = getWeekId(now);
        const staleThreshold = rule.inactiveDaysThreshold ?? 14;
        const stats = {
          activeProjects: snapshot.projects!.projects.length,
          activeThisWeek: snapshot.projects!.projects.filter((project) => project.lastActivityDate >= weekStart).length,
          overdueProjects: snapshot.projects!.projects.filter((project) => project.overdueTaskCount > 0).length,
          staleProjects: snapshot.projects!.projects.filter((project) => project.openTaskCount > 0 && project.inactiveDays != null && project.inactiveDays >= staleThreshold).length,
          openTasks: snapshot.projects!.projects.reduce((sum, project) => sum + project.openTaskCount, 0),
        };
        await send(rule, settings, scheduledAt, `enhanced-diary:project-weekly:${rule.id}:${weekStart}`, renderProjectWeeklyContent(stats), "info", stats);
        break;
      }
      }
    } catch (error) {
      console.warn(
        `[enhanced-diary-notify] rule failed: id=${rule.id}, type=${rule.type}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
