import type { TaskNotifySettings, TaskNotifyTask } from "./types";

function taskSiyuanUrl(task: TaskNotifyTask): string {
  return `siyuan://blocks/${task.id}`;
}

export function renderTaskReminderContent(task: TaskNotifyTask, scheduledAt: string, settings: TaskNotifySettings): string {
  const lines = [
    `任务「${task.taskname}」已到提醒时间。`,
    `提醒时间：${scheduledAt}`,
    task.parsed.deadline ? `截止：${task.parsed.deadline}` : "",
    task.parsed.priority ? `优先级：${task.parsed.priority}` : "",
    settings.includeSourcePath && task.hpath ? `来源：${task.hpath}` : "",
    settings.includeSiyuanLink ? `链接：${taskSiyuanUrl(task)}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderTaskDigestContent(tasks: TaskNotifyTask[], settings: TaskNotifySettings): string {
  const max = settings.maxTasksPerMessage;
  const visible = tasks.slice(0, max);
  const lines = [`共 ${tasks.length} 个任务，显示前 ${visible.length} 个：`, ""];
  visible.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.taskname}`);
    const meta = [
      task.parsed.deadline ? `截止：${task.parsed.deadline}` : "",
      task.parsed.priority ? `优先级：${task.parsed.priority}` : "",
      settings.includeSourcePath && task.hpath ? `来源：${task.hpath}` : "",
      settings.includeSiyuanLink ? `链接：${taskSiyuanUrl(task)}` : "",
    ].filter(Boolean);
    if (meta.length > 0) lines.push(`   ${meta.join("；")}`);
  });
  const hidden = tasks.length - visible.length;
  if (hidden > 0) {
    lines.push("", `还有 ${hidden} 个任务未展示，请回到思源查看。`);
  }
  return lines.join("\n");
}
