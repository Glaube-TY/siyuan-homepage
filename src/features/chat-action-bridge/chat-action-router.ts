import { addExternalQuickNote } from "./quick-note-action-service";
import {
  createTodayTaskFromExternal,
  queryOverdueTasksForExternal,
  queryTodayTasksForExternal,
} from "./diary-task-action-service";
import { buildChatActionContentMenu, findChatActionMenuChoice, isChatActionEnabled } from "./chat-action-menu";
import { renderChatActionContentMenu, renderChatActionMainMenu, renderHelpText } from "./chat-action-render";
import {
  clearChatActionPendingSession,
  createChatActionPendingSession,
  getChatActionPendingSession,
  hasExpiredChatActionSession,
} from "./chat-action-session-store";
import type {
  ChatActionBridgeSettings,
  ChatActionMenuItem,
  ChatActionResult,
  ChatActionRouteResult,
  ChatActionType,
  FeishuNormalizedMessage,
} from "./types";

function parseCommand(text: string): { command: string; content: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  // Fixed internal commands
  if (lower === "菜单" || trimmed === "#menu") {
    return { command: "menu", content: "" };
  }
  // "操作" alone is an alias for menu
  if (lower === "操作") {
    return { command: "menu", content: "" };
  }
  if (lower === "帮助" || lower === "#help") {
    return { command: "help", content: "" };
  }
  if (["今日任务", "查看今日任务"].includes(trimmed)) {
    return { command: "today_tasks", content: "" };
  }
  if (["逾期任务", "查看逾期任务"].includes(trimmed)) {
    return { command: "overdue_tasks", content: "" };
  }
  return null;
}

async function executeAction(
  action: ChatActionType,
  content: string,
  message: FeishuNormalizedMessage,
): Promise<ChatActionResult> {
  if (action === "cancel") {
    return {
      ok: true,
      changed: false,
      action,
      message: "已取消，不执行操作。",
    };
  }
  if (action === "quick_note") {
    const result = await addExternalQuickNote({
      content,
      source: "feishu",
      senderId: message.senderId,
      senderName: message.senderName,
      chatId: message.chatId,
      messageId: message.messageId,
      receivedAt: new Date(message.receivedAt).toISOString(),
    });
    return {
      ok: result.ok,
      changed: result.changed,
      action,
      message: result.message,
      errorCode: result.errorCode,
    };
  }
  if (action === "create_today_task") {
    return createTodayTaskFromExternal({
      content,
      source: "feishu",
      senderId: message.senderId,
      messageId: message.messageId,
    });
  }
  if (action === "view_today_tasks") {
    return queryTodayTasksForExternal({ limit: 10 });
  }
  return queryOverdueTasksForExternal({ limit: 10 });
}

function actionDisabledResult(action: ChatActionType): ChatActionRouteResult {
  return {
    handled: true,
    shouldReply: true,
    replyText: "该操作已在机器助手设置中关闭。",
    action,
    status: "failed",
    errorCode: "action_disabled",
  };
}

function resultToRouteResult(result: ChatActionResult, action: ChatActionType, settings: ChatActionBridgeSettings): ChatActionRouteResult {
  return {
    handled: true,
    shouldReply: settings.replyAfterAction || !result.ok || action === "view_today_tasks" || action === "view_overdue_tasks",
    replyText: result.message,
    action,
    status: result.ok ? "executed" : "failed",
    errorCode: result.errorCode,
  };
}

function createMenuRouteResult(
  settings: ChatActionBridgeSettings,
  message: FeishuNormalizedMessage,
  content: string,
): ChatActionRouteResult {
  const actions = buildChatActionContentMenu(settings);
  createChatActionPendingSession({
    provider: "feishu",
    chatId: message.chatId,
    senderId: message.senderId,
    messageId: message.messageId,
    content,
    menuType: "content_actions",
    actions,
    ttlMs: settings.sessionTtlMs,
  });
  return {
    handled: true,
    shouldReply: true,
    replyText: renderChatActionContentMenu(actions),
    status: "executed",
  };
}

async function handleMenuChoice(
  settings: ChatActionBridgeSettings,
  message: FeishuNormalizedMessage,
  text: string,
): Promise<ChatActionRouteResult | null> {
  if (!/^\d+$/.test(text.trim())) return null;

  const expired = hasExpiredChatActionSession("feishu", message.chatId, message.senderId);
  if (expired) {
    return {
      handled: true,
      shouldReply: true,
      replyText: "这个操作菜单已过期，请重新发送内容。",
      status: "failed",
      errorCode: "menu_expired",
    };
  }

  const session = getChatActionPendingSession("feishu", message.chatId, message.senderId);
  if (!session) {
    return {
      handled: true,
      shouldReply: true,
      replyText: "没有待执行的操作菜单，请直接发送内容。",
      status: "failed",
      errorCode: "invalid_menu_choice",
    };
  }

  const choice: ChatActionMenuItem | null = findChatActionMenuChoice(session.actions, text);
  if (!choice) {
    return {
      handled: true,
      shouldReply: true,
      replyText: "无效选择，请直接回复菜单中的数字。",
      status: "failed",
      errorCode: "invalid_menu_choice",
    };
  }

  if (!isChatActionEnabled(settings, choice.type)) {
    clearChatActionPendingSession("feishu", message.chatId, message.senderId);
    return actionDisabledResult(choice.type);
  }

  const result = await executeAction(choice.type, choice.requiresContent ? session.content : "", message);
  clearChatActionPendingSession("feishu", message.chatId, message.senderId);
  return resultToRouteResult(result, choice.type, settings);
}

export async function routeChatActionMessage(
  settings: ChatActionBridgeSettings,
  message: FeishuNormalizedMessage,
): Promise<ChatActionRouteResult> {
  if (message.messageType !== "text") {
    return {
      handled: true,
      shouldReply: true,
      replyText: "当前只支持文本消息。",
      status: "ignored",
      errorCode: "unsupported_message_type",
    };
  }

  const text = message.text.trim();
  if (!text) {
    return {
      handled: false,
      shouldReply: false,
      status: "ignored",
      errorCode: "empty_content",
    };
  }

  const menuChoice = await handleMenuChoice(settings, message, text);
  if (menuChoice) return menuChoice;

  const command = parseCommand(text);
  if (command?.command === "menu") {
    return {
      handled: true,
      shouldReply: true,
      replyText: renderChatActionMainMenu(),
      status: "executed",
    };
  }

  if (command?.command === "help") {
    return {
      handled: true,
      shouldReply: true,
      replyText: renderHelpText(),
      status: "executed",
    };
  }

  if (command?.command === "today_tasks") {
    if (!settings.actions.viewTodayTasks) return actionDisabledResult("view_today_tasks");
    return resultToRouteResult(await queryTodayTasksForExternal({ limit: 10 }), "view_today_tasks", settings);
  }
  if (command?.command === "overdue_tasks") {
    if (!settings.actions.viewOverdueTasks) return actionDisabledResult("view_overdue_tasks");
    return resultToRouteResult(await queryOverdueTasksForExternal({ limit: 10 }), "view_overdue_tasks", settings);
  }

  // Default: create pending session with operation menu for normal text
  return createMenuRouteResult(settings, message, text);
}
