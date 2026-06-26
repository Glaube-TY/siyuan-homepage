import {
  CHAT_ACTION_BRIDGE_HISTORY_LIMIT_MAX,
  CHAT_ACTION_BRIDGE_HISTORY_LIMIT_MIN,
  CHAT_ACTION_BRIDGE_LOCAL_GATEWAY_DEFAULT_PORT,
  CHAT_ACTION_BRIDGE_MAX_MESSAGE_LENGTH_MAX,
  CHAT_ACTION_BRIDGE_MAX_MESSAGE_LENGTH_MIN,
  CHAT_ACTION_BRIDGE_SESSION_TTL_MAX_MS,
  CHAT_ACTION_BRIDGE_SESSION_TTL_MIN_MS,
  CHAT_ACTION_BRIDGE_SETTINGS_KEY,
  DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS,
} from "./constants";
import { decryptChatActionSecret, encryptChatActionSecret, setChatActionSecretPlugin } from "./chat-action-secret-store";
import { normalizeChatActionList } from "./chat-action-redact";
import type {
  ChatActionBridgeSettings,
  ChatActionDefaultMode,
  ChatActionEnabledActions,
  ChatActionRuntimeSettings,
  FeishuChatActionSettings,
  FeishuLocalGatewaySettings,
} from "./types";

let pluginInstance: any = null;

export function setChatActionSettingsPlugin(plugin: any): void {
  pluginInstance = plugin;
  setChatActionSecretPlugin(plugin);
}

export function isChatActionPremiumAvailable(): boolean {
  return Boolean(pluginInstance?.ADVANCED);
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Chat Action Bridge settings store is not initialized.");
  }
  return pluginInstance;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function createLocalGatewayToken(): string {
  const bytes = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeDefaultMode(_value: unknown): ChatActionDefaultMode {
  // Migrate old "quick_note" default to "menu" — never auto-write without user choice
  return "menu";
}

function normalizeFeishuSettings(raw: unknown): FeishuChatActionSettings {
  const defaults = DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS.feishu;
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
    appId: typeof value.appId === "string" ? value.appId.trim() : "",
    encryptedAppSecret: typeof value.encryptedAppSecret === "string"
      ? value.encryptedAppSecret.trim()
      : typeof value.appSecret === "string"
        ? value.appSecret.trim()
        : "",
    allowedOpenIds: normalizeChatActionList(value.allowedOpenIds),
    allowedUserIds: normalizeChatActionList(value.allowedUserIds),
    allowedChatIds: normalizeChatActionList(value.allowedChatIds),
    allowPrivateChat: typeof value.allowPrivateChat === "boolean" ? value.allowPrivateChat : defaults.allowPrivateChat,
    allowGroupChat: typeof value.allowGroupChat === "boolean" ? value.allowGroupChat : defaults.allowGroupChat,
    requireMentionInGroup: typeof value.requireMentionInGroup === "boolean"
      ? value.requireMentionInGroup
      : defaults.requireMentionInGroup,
  };
}

function normalizeActions(raw: unknown): ChatActionEnabledActions {
  const defaults = DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS.actions;
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    quickNote: typeof value.quickNote === "boolean" ? value.quickNote : defaults.quickNote,
    createTodayTask: typeof value.createTodayTask === "boolean" ? value.createTodayTask : defaults.createTodayTask,
    viewTodayTasks: typeof value.viewTodayTasks === "boolean" ? value.viewTodayTasks : defaults.viewTodayTasks,
    viewOverdueTasks: typeof value.viewOverdueTasks === "boolean" ? value.viewOverdueTasks : defaults.viewOverdueTasks,
  };
}

function normalizeLocalGatewaySettings(raw: unknown): FeishuLocalGatewaySettings {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const token = typeof value.localAuthToken === "string" ? value.localAuthToken.trim() : "";
  return {
    port: clampInt(value.port, 1024, 65535, CHAT_ACTION_BRIDGE_LOCAL_GATEWAY_DEFAULT_PORT),
    localAuthToken: token || createLocalGatewayToken(),
  };
}

export function normalizeChatActionBridgeSettings(raw: unknown): ChatActionBridgeSettings {
  const defaults = DEFAULT_CHAT_ACTION_BRIDGE_SETTINGS;
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  return {
    version: 1,
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
    provider: "feishu",
    defaultMode: normalizeDefaultMode(value.defaultMode),
    requireCommandPrefix: false,
    // commandPrefixes are no longer user-configurable; use internal fixed set
    commandPrefixes: [],
    maxMessageLength: clampInt(
      value.maxMessageLength,
      CHAT_ACTION_BRIDGE_MAX_MESSAGE_LENGTH_MIN,
      CHAT_ACTION_BRIDGE_MAX_MESSAGE_LENGTH_MAX,
      defaults.maxMessageLength,
    ),
    sessionTtlMs: clampInt(
      value.sessionTtlMs,
      CHAT_ACTION_BRIDGE_SESSION_TTL_MIN_MS,
      CHAT_ACTION_BRIDGE_SESSION_TTL_MAX_MS,
      defaults.sessionTtlMs,
    ),
    replyAfterAction: typeof value.replyAfterAction === "boolean" ? value.replyAfterAction : defaults.replyAfterAction,
    keepHistoryLimit: clampInt(
      value.keepHistoryLimit,
      CHAT_ACTION_BRIDGE_HISTORY_LIMIT_MIN,
      CHAT_ACTION_BRIDGE_HISTORY_LIMIT_MAX,
      defaults.keepHistoryLimit,
    ),
    feishu: normalizeFeishuSettings(value.feishu),
    localGateway: normalizeLocalGatewaySettings(value.localGateway),
    actions: normalizeActions(value.actions),
  };
}

export async function loadChatActionBridgeSettings(): Promise<ChatActionBridgeSettings> {
  try {
    return normalizeChatActionBridgeSettings(await getPlugin().loadData(CHAT_ACTION_BRIDGE_SETTINGS_KEY));
  } catch {
    return normalizeChatActionBridgeSettings(null);
  }
}

export async function saveChatActionBridgeSettings(settings: ChatActionBridgeSettings): Promise<ChatActionBridgeSettings> {
  const normalized = normalizeChatActionBridgeSettings(settings);
  const encryptedSecret = await encryptChatActionSecret(normalized.feishu.encryptedAppSecret);
  const safeSettings: ChatActionBridgeSettings = {
    ...normalized,
    feishu: {
      ...normalized.feishu,
      encryptedAppSecret: encryptedSecret,
    },
  };
  await getPlugin().saveData(CHAT_ACTION_BRIDGE_SETTINGS_KEY, safeSettings);
  window.dispatchEvent(new CustomEvent("chat-action-bridge-settings-changed", {
    detail: {
      enabled: safeSettings.enabled,
      feishuEnabled: safeSettings.feishu.enabled,
      hasAppId: Boolean(safeSettings.feishu.appId),
      hasSecret: Boolean(safeSettings.feishu.encryptedAppSecret),
    },
  }));
  return safeSettings;
}

export async function loadChatActionBridgeRuntimeSettings(): Promise<ChatActionRuntimeSettings> {
  const settings = await loadChatActionBridgeSettings();
  let appSecret = "";
  try {
    appSecret = await decryptChatActionSecret(settings.feishu.encryptedAppSecret);
  } catch {
    throw Object.assign(new Error("App Secret 无法解密，请重新填写。"), {
      code: "secret_decrypt_failed",
    });
  }
  return {
    ...settings,
    feishu: {
      ...settings.feishu,
      appSecret,
    },
  };
}

export function hasChatActionWhitelist(settings: ChatActionBridgeSettings): boolean {
  return settings.feishu.allowedOpenIds.length > 0
    || settings.feishu.allowedUserIds.length > 0
    || settings.feishu.allowedChatIds.length > 0;
}

// Internal fixed commands — not user-configurable
const INTERNAL_COMMANDS = {
  menu: new Set(["菜单", "操作", "#menu"]),
  help: new Set(["帮助", "#help"]),
  todayTasks: new Set(["今日任务", "查看今日任务"]),
  overdueTasks: new Set(["逾期任务", "查看逾期任务"]),
};

function normalizeInternalText(text: string): string {
  return text.trim().toLowerCase();
}

export function isChatActionInternalCommand(text: string): boolean {
  const normalized = normalizeInternalText(text);
  for (const cmdSet of Object.values(INTERNAL_COMMANDS)) {
    if (cmdSet.has(normalized)) return true;
  }
  return false;
}

export function isChatActionGroupAllowedText(text: string): boolean {
  const normalized = normalizeInternalText(text);
  return INTERNAL_COMMANDS.menu.has(normalized)
    || INTERNAL_COMMANDS.help.has(normalized)
    || INTERNAL_COMMANDS.todayTasks.has(normalized)
    || INTERNAL_COMMANDS.overdueTasks.has(normalized);
}
