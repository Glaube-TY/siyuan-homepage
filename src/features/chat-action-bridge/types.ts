export type ChatActionProvider = "feishu";

export type ChatActionDefaultMode = "quick_note" | "menu";

export type ChatActionType =
  | "cancel"
  | "quick_note"
  | "create_today_task"
  | "view_today_tasks"
  | "view_overdue_tasks";

export type ChatActionHistoryStatus =
  | "received"
  | "ignored"
  | "rejected"
  | "executed"
  | "failed";

export type ChatActionRuntimeStatusCode =
  | "disabled"
  | "missing_app_id"
  | "missing_app_secret"
  | "missing_whitelist"
  | "premium_unavailable"
  | "connecting"
  | "connected"
  | "gateway_unavailable"
  | "connection_failed"
  | "stopped";

export type ChatActionErrorCode =
  | "chat_action_disabled"
  | "premium_unavailable"
  | "missing_app_id"
  | "missing_app_secret"
  | "missing_whitelist"
  | "secret_decrypt_failed"
  | "feishu_connect_failed"
  | "feishu_send_failed"
  | "unauthorized_sender"
  | "unsupported_message_type"
  | "message_too_long"
  | "duplicate_message"
  | "quick_note_target_missing"
  | "quick_note_write_failed"
  | "task_create_failed"
  | "task_query_failed"
  | "menu_expired"
  | "invalid_menu_choice"
  | "action_disabled"
  | "empty_content"
  | "unknown_error";

export interface FeishuChatActionSettings {
  enabled: boolean;
  appId: string;
  encryptedAppSecret: string;
  allowedOpenIds: string[];
  allowedUserIds: string[];
  allowedChatIds: string[];
  allowPrivateChat: boolean;
  allowGroupChat: boolean;
  requireMentionInGroup: boolean;
}

export interface FeishuLocalGatewaySettings {
  port: number;
  localAuthToken: string;
}

export interface ChatActionEnabledActions {
  quickNote: boolean;
  createTodayTask: boolean;
  viewTodayTasks: boolean;
  viewOverdueTasks: boolean;
}

export interface ChatActionBridgeSettings {
  version: 1;
  enabled: boolean;
  provider: ChatActionProvider;
  defaultMode: ChatActionDefaultMode;
  requireCommandPrefix: boolean;
  commandPrefixes: string[];
  maxMessageLength: number;
  sessionTtlMs: number;
  replyAfterAction: boolean;
  keepHistoryLimit: number;
  feishu: FeishuChatActionSettings;
  localGateway: FeishuLocalGatewaySettings;
  actions: ChatActionEnabledActions;
}

export interface ChatActionRuntimeSettings extends ChatActionBridgeSettings {
  feishu: FeishuChatActionSettings & {
    appSecret: string;
  };
}

export interface ChatActionMenuItem {
  index: number;
  type: ChatActionType;
  label: string;
  requiresContent: boolean;
  readOnly: boolean;
}

export interface ChatActionPendingSession {
  id: string;
  provider: ChatActionProvider;
  chatId: string;
  senderId: string;
  messageId: string;
  content: string;
  menuType: "content_actions" | "main_menu";
  actions: ChatActionMenuItem[];
  createdAt: number;
  expiresAt: number;
}

export interface ChatActionHistoryItem {
  id: string;
  provider: ChatActionProvider;
  direction: "in" | "out";
  action?: ChatActionType;
  status: ChatActionHistoryStatus;
  senderIdMasked: string;
  chatIdMasked: string;
  messageId?: string;
  contentPreview?: string;
  resultSummary?: string;
  createdAt: number;
}

export interface ChatActionResult {
  ok: boolean;
  changed?: boolean;
  action?: ChatActionType;
  message: string;
  errorCode?: ChatActionErrorCode;
}

export interface FeishuNormalizedMessage {
  provider: "feishu";
  eventId?: string;
  messageId: string;
  messageType: string;
  chatId: string;
  chatType: "private" | "group" | "unknown";
  openId?: string;
  userId?: string;
  senderId: string;
  senderName?: string;
  text: string;
  isFromBot: boolean;
  isMentioned: boolean;
  receivedAt: number;
  raw?: unknown;
}

export interface ChatActionRouteResult {
  handled: boolean;
  shouldReply: boolean;
  replyText?: string;
  action?: ChatActionType;
  status: ChatActionHistoryStatus;
  errorCode?: ChatActionErrorCode;
}

export interface ChatActionRuntimeStatus {
  code: ChatActionRuntimeStatusCode;
  message: string;
  updatedAt: number;
  detail?: string;
}

export interface ChatActionPairingCaptureState {
  enabled: boolean;
  expiresAt: number;
  capturedAt?: number;
  openId?: string;
  userId?: string;
  chatId?: string;
  senderName?: string;
}
