import type { ChatActionBridgeSettings, ChatActionMenuItem, ChatActionType } from "./types";

const ACTION_LABELS: Record<ChatActionType, string> = {
  cancel: "不执行操作",
  quick_note: "记录快速笔记",
  create_today_task: "创建今日任务",
  view_today_tasks: "查看今日任务",
  view_overdue_tasks: "查看逾期任务",
};

export function buildChatActionContentMenu(settings: ChatActionBridgeSettings): ChatActionMenuItem[] {
  const actions: ChatActionMenuItem[] = [{
    index: 0,
    type: "cancel",
    label: ACTION_LABELS.cancel,
    requiresContent: false,
    readOnly: true,
  }];

  const candidates: Array<{ type: ChatActionType; enabled: boolean; requiresContent: boolean; readOnly: boolean }> = [
    { type: "quick_note", enabled: settings.actions.quickNote, requiresContent: true, readOnly: false },
    { type: "create_today_task", enabled: settings.actions.createTodayTask, requiresContent: true, readOnly: false },
  ];

  for (const item of candidates) {
    if (!item.enabled) continue;
    actions.push({
      index: actions.length,
      type: item.type,
      label: ACTION_LABELS[item.type],
      requiresContent: item.requiresContent,
      readOnly: item.readOnly,
    });
  }

  return actions;
}

export function isChatActionEnabled(settings: ChatActionBridgeSettings, action: ChatActionType): boolean {
  if (action === "cancel") return true;
  if (action === "quick_note") return settings.actions.quickNote;
  if (action === "create_today_task") return settings.actions.createTodayTask;
  if (action === "view_today_tasks") return settings.actions.viewTodayTasks;
  if (action === "view_overdue_tasks") return settings.actions.viewOverdueTasks;
  return false;
}

export function findChatActionMenuChoice(actions: ChatActionMenuItem[], text: string): ChatActionMenuItem | null {
  const value = Number(text.trim());
  if (!Number.isInteger(value)) return null;
  return actions.find((item) => item.index === value) ?? null;
}

