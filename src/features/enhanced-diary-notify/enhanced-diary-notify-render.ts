import type { EnhancedDiaryNotifySettings } from "./types";

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

export function buildSiyuanLink(docId: string | undefined, include: boolean): string | undefined {
  if (!include || !docId) return undefined;
  return `siyuan://blocks/${docId}`;
}
