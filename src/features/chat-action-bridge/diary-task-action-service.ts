import { addNewTaskToDiary, getOrCreateTodayDiaryDocument } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryActions";
import { loadEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { formatLocalDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceDate";
import { queryWorkspaceTasks } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import type { EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import { parseTaskLine } from "@/components/utils/widgetBlock/widget/tasksPlus/tasksPlusParser";
import { sanitizeChatActionErrorMessage } from "./chat-action-redact";
import type { ChatActionResult } from "./types";

let pluginInstance: any = null;

export function setDiaryTaskActionPlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Diary task action service is not initialized.");
  }
  return pluginInstance;
}

function buildTaskInput(content: string) {
  const parsed = parseTaskLine(content);
  return {
    taskname: parsed.taskname || content.trim(),
    priority: parsed.parsed.priority,
    startDate: parsed.parsed.startDate,
    deadline: parsed.parsed.deadline,
    recurrence: parsed.parsed.recurrence,
    reminder: parsed.parsed.reminder,
    location: parsed.parsed.location,
    tags: parsed.parsed.tags,
    completed: parsed.taskCheck ? /\[(x|X)\]/.test(parsed.taskCheck) : false,
  };
}

export async function createTodayTaskFromExternal(input: {
  content: string;
  source: "feishu";
  senderId?: string;
  messageId?: string;
}): Promise<ChatActionResult> {
  const content = input.content.trim();
  if (!content) {
    return {
      ok: false,
      changed: false,
      action: "create_today_task",
      message: "创建失败：任务内容为空。",
      errorCode: "empty_content",
    };
  }

  try {
    const plugin = getPlugin();
    const config = await loadEnhancedDiaryConfig(plugin);
    const todayDoc = await getOrCreateTodayDiaryDocument(plugin, config);
    if (!todayDoc.ok || !todayDoc.docId) {
      return {
        ok: false,
        changed: false,
        action: "create_today_task",
        message: "创建失败：未能打开或创建今日日记，请检查强化日记配置。",
        errorCode: "task_create_failed",
      };
    }

    const result = await addNewTaskToDiary({
      docId: todayDoc.docId,
      task: buildTaskInput(content),
      headingStructure: config.headingStructure,
    });

    if (!result.ok) {
      return {
        ok: false,
        changed: false,
        action: "create_today_task",
        message: result.message || "创建失败：今日任务写入失败。",
        errorCode: "task_create_failed",
      };
    }

    return {
      ok: true,
      changed: true,
      action: "create_today_task",
      message: `已创建今日任务：${buildTaskInput(content).taskname}`,
    };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      action: "create_today_task",
      message: `创建失败：${sanitizeChatActionErrorMessage(error, "今日任务写入失败。")}`,
      errorCode: "task_create_failed",
    };
  }
}

function countPriority(priority: string): number {
  return (priority.match(/❗/g) ?? []).length;
}

function taskDateText(task: EnhancedDiaryWorkspaceTask): string {
  return task.deadline ? `📅${task.deadline}` : task.startDate ? `⌛${task.startDate}` : "";
}

function formatTaskLine(task: EnhancedDiaryWorkspaceTask, index: number): string {
  return [
    `${index + 1}. ${task.completed ? "[x]" : "[ ]"} ${task.taskname}`,
    countPriority(task.priority) > 0 ? task.priority : "",
    taskDateText(task),
  ].filter(Boolean).join(" ");
}

async function queryTasks(scope: "today" | "overdue", limit = 10): Promise<ChatActionResult> {
  try {
    const config = await loadEnhancedDiaryConfig(getPlugin());
    const today = new Date();
    const matched = (await queryWorkspaceTasks(config, today))
      .filter((task) => scope === "today" ? task.isTodayTask : task.isOverdue)
      .sort((a, b) => {
        const openDelta = Number(a.completed) - Number(b.completed);
        if (openDelta !== 0) return openDelta;
        const priorityDelta = countPriority(b.priority) - countPriority(a.priority);
        if (priorityDelta !== 0) return priorityDelta;
        const aDate = a.deadline || a.startDate || "9999-12-31";
        const bDate = b.deadline || b.startDate || "9999-12-31";
        return aDate.localeCompare(bDate);
      });
    const list = matched.slice(0, Math.max(1, Math.floor(limit || 10)));
    const title = scope === "today" ? "今日任务" : "逾期任务";
    if (list.length === 0) {
      return {
        ok: true,
        changed: false,
        action: scope === "today" ? "view_today_tasks" : "view_overdue_tasks",
        message: scope === "today" ? "暂无今日任务。" : "暂无逾期任务。",
      };
    }
    const date = formatLocalDate(today);
    return {
      ok: true,
      changed: false,
      action: scope === "today" ? "view_today_tasks" : "view_overdue_tasks",
      message: `${title}（${list.length} 条，${date}）：\n${list.map(formatTaskLine).join("\n")}`,
    };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      action: scope === "today" ? "view_today_tasks" : "view_overdue_tasks",
      message: `查询失败：${sanitizeChatActionErrorMessage(error, "任务查询失败。")}`,
      errorCode: "task_query_failed",
    };
  }
}

export async function queryTodayTasksForExternal(input: { limit?: number } = {}): Promise<ChatActionResult> {
  return queryTasks("today", input.limit);
}

export async function queryOverdueTasksForExternal(input: { limit?: number } = {}): Promise<ChatActionResult> {
  return queryTasks("overdue", input.limit);
}

