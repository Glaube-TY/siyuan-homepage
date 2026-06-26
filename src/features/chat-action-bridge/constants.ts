import type { ChatActionBridgeSettings } from "./types";

export const CHAT_ACTION_BRIDGE_SETTINGS_KEY = "chatActionBridgeSettings.json";
export const CHAT_ACTION_BRIDGE_HISTORY_KEY = "chatActionBridgeHistory.json";

export const CHAT_ACTION_BRIDGE_MAX_MESSAGE_LENGTH_MIN = 1;
export const CHAT_ACTION_BRIDGE_MAX_MESSAGE_LENGTH_MAX = 10000;
export const CHAT_ACTION_BRIDGE_SESSION_TTL_MIN_MS = 60 * 1000;
export const CHAT_ACTION_BRIDGE_SESSION_TTL_MAX_MS = 24 * 60 * 60 * 1000;
export const CHAT_ACTION_BRIDGE_HISTORY_LIMIT_MIN = 20;
export const CHAT_ACTION_BRIDGE_HISTORY_LIMIT_MAX = 1000;
export const CHAT_ACTION_BRIDGE_PROCESSED_TTL_MS = 24 * 60 * 60 * 1000;
export const CHAT_ACTION_BRIDGE_LOCAL_GATEWAY_DEFAULT_PORT = 17626;

export const DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS: ChatActionBridgeSettings = {
  version: 1,
  enabled: false,
  provider: "feishu",
  defaultMode: "menu",
  requireCommandPrefix: false,
  commandPrefixes: [],
  maxMessageLength: 2000,
  sessionTtlMs: 10 * 60 * 1000,
  replyAfterAction: true,
  keepHistoryLimit: 200,
  feishu: {
    enabled: false,
    appId: "",
    encryptedAppSecret: "",
    allowedOpenIds: [],
    allowedUserIds: [],
    allowedChatIds: [],
    allowPrivateChat: true,
    allowGroupChat: false,
    requireMentionInGroup: true,
  },
  localGateway: {
    port: CHAT_ACTION_BRIDGE_LOCAL_GATEWAY_DEFAULT_PORT,
    localAuthToken: "",
  },
  actions: {
    quickNote: true,
    createTodayTask: true,
    viewTodayTasks: true,
    viewOverdueTasks: true,
  },
};
