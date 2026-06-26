import { notifyBridge } from "@/features/notify-bridge";
import { hasEnhancedDiaryNotifySent, markEnhancedDiaryNotifySent } from "./enhanced-diary-notify-history-store";
import {
  formatLocalDate,
  getWeekId,
  getDiaryDocForNotify,
  getYesterdayReviewDoc,
  getUnmigratedTasks,
  shouldRunDailyRuleAt,
  shouldRunWeeklyRuleAt,
} from "./enhanced-diary-notify-rules";
import {
  renderTodayDiaryMissingContent,
  renderYesterdayReviewMissingContent,
  renderUnmigratedTasksDigestContent,
  renderWeeklyReviewReminderContent,
  buildSiyuanLink,
} from "./enhanced-diary-notify-render";
import type { EnhancedDiaryNotifySettings } from "./types";

export async function runEnhancedDiaryNotifyScan(settings: EnhancedDiaryNotifySettings, now = new Date()): Promise<void> {
  const enabledRules = settings.rules.filter((rule) => rule.enabled);
  if (!settings.enabled || enabledRules.length === 0) return;

  const today = now;
  const todayStr = formatLocalDate(today);
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = formatLocalDate(yesterday);

  for (const rule of enabledRules) {
    switch (rule.type) {
      case "today_diary_missing": {
        const scheduledAt = shouldRunDailyRuleAt(rule, now, settings.catchUpWindowMinutes);
        if (!scheduledAt) continue;
        const dedupeKey = `enhanced-diary:today-missing:${rule.id}:${todayStr}`;
        if (await hasEnhancedDiaryNotifySent(dedupeKey)) continue;
        const docInfo = await getDiaryDocForNotify(today);
        if (docInfo) continue;
        const result = await notifyBridge.send({
          title: rule.title || "今日日记提醒",
          content: renderTodayDiaryMissingContent(),
          level: "info",
          source: "diary",
          sourceId: rule.id,
          dedupeKey,
          extra: { type: "today_diary_missing" },
        }, {
          channelIds: rule.channelIds,
          force: true,
          reason: "enhanced-diary-notify",
        });
        if (result.ok) await markEnhancedDiaryNotifySent(dedupeKey);
        break;
      }

      case "yesterday_review_missing": {
        const scheduledAt = shouldRunDailyRuleAt(rule, now, settings.catchUpWindowMinutes);
        if (!scheduledAt) continue;
        const dedupeKey = `enhanced-diary:yesterday-review:${rule.id}:${yesterdayStr}`;
        if (await hasEnhancedDiaryNotifySent(dedupeKey)) continue;
        const docInfo = await getYesterdayReviewDoc(yesterday);
        if (!docInfo) continue;
        if (docInfo.reviewCompleted) continue;
        const result = await notifyBridge.send({
          title: rule.title || "昨日未复盘提醒",
          content: renderYesterdayReviewMissingContent(),
          level: "warning",
          source: "diary",
          sourceId: rule.id,
          url: buildSiyuanLink(docInfo.id, settings.includeSiyuanLink),
          dedupeKey,
          extra: { type: "yesterday_review_missing" },
        }, {
          channelIds: rule.channelIds,
          force: true,
          reason: "enhanced-diary-notify",
        });
        if (result.ok) await markEnhancedDiaryNotifySent(dedupeKey);
        break;
      }

      case "unmigrated_tasks_digest": {
        const scheduledAt = shouldRunDailyRuleAt(rule, now, settings.catchUpWindowMinutes);
        if (!scheduledAt) continue;
        const dedupeKey = `enhanced-diary:unmigrated-tasks:${rule.id}:${todayStr}`;
        if (await hasEnhancedDiaryNotifySent(dedupeKey)) continue;
        const tasks = await getUnmigratedTasks(today);
        if (tasks.length === 0) continue;
        const result = await notifyBridge.send({
          title: rule.title || "未迁移任务摘要",
          content: renderUnmigratedTasksDigestContent(tasks, settings),
          level: "info",
          source: "diary",
          sourceId: rule.id,
          dedupeKey,
          extra: { type: "unmigrated_tasks_digest", count: tasks.length },
        }, {
          channelIds: rule.channelIds,
          force: true,
          reason: "enhanced-diary-notify",
        });
        if (result.ok) await markEnhancedDiaryNotifySent(dedupeKey);
        break;
      }

      case "weekly_review_reminder": {
        const scheduledAt = shouldRunWeeklyRuleAt(rule, now, settings.catchUpWindowMinutes);
        if (!scheduledAt) continue;
        const weekId = getWeekId(today);
        const dedupeKey = `enhanced-diary:weekly-review:${rule.id}:${weekId}`;
        if (await hasEnhancedDiaryNotifySent(dedupeKey)) continue;
        const result = await notifyBridge.send({
          title: rule.title || "每周复盘提醒",
          content: renderWeeklyReviewReminderContent(),
          level: "info",
          source: "diary",
          sourceId: rule.id,
          dedupeKey,
          extra: { type: "weekly_review_reminder", weekId },
        }, {
          channelIds: rule.channelIds,
          force: true,
          reason: "enhanced-diary-notify",
        });
        if (result.ok) await markEnhancedDiaryNotifySent(dedupeKey);
        break;
      }
    }
  }
}
