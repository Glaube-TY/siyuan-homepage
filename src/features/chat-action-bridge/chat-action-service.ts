import { hasChatActionWhitelist, isChatActionGroupAllowedText, isChatActionPremiumAvailable, loadChatActionBridgeRuntimeSettings } from "./chat-action-settings-store";
import { appendChatActionHistory, isChatActionMessageProcessed, markChatActionMessageProcessed } from "./chat-action-history-store";
import { clearAllChatActionSessions } from "./chat-action-session-store";
import { sanitizeChatActionErrorMessage } from "./chat-action-redact";
import { routeChatActionMessage } from "./chat-action-router";
import { FeishuEventClient } from "./feishu/feishu-event-client";
import { sendFeishuTextMessage } from "./feishu/feishu-client";
import { startFeishuLocalGatewayProcess, stopFeishuLocalGatewayProcess } from "./feishu/feishu-local-gateway-process";
import {
  loadPairingCaptureState,
  startPairingCapture,
  completePairingCapture,
  clearCaptureResult,
  refreshPairingCaptureTtl,
} from "./chat-action-pairing-capture-store";
import type {
  ChatActionErrorCode,
  ChatActionRuntimeSettings,
  ChatActionRuntimeStatus,
  FeishuNormalizedMessage,
} from "./types";

let client: FeishuEventClient | null = null;
let runtimeSettings: ChatActionRuntimeSettings | null = null;
let status: ChatActionRuntimeStatus = {
  code: "stopped",
  message: "已停止",
  updatedAt: Date.now(),
};
let pluginInstance: any = null;
let listenersAttached = false;

// Reply dedup: prevent same reply text to same chatId within 60 seconds
const recentReplies = new Map<string, { text: string; timestamp: number }>();
const REPLY_DEDUP_MS = 60 * 1000;

function setStatus(next: Omit<ChatActionRuntimeStatus, "updatedAt">): void {
  status = {
    ...next,
    updatedAt: Date.now(),
  };
  window.dispatchEvent(new CustomEvent("chat-action-bridge-status-changed", { detail: status }));
}

export function getChatActionBridgeRuntimeStatus(): ChatActionRuntimeStatus {
  return status;
}

function listHasValue(list: string[], value: string | undefined): boolean {
  return Boolean(value && list.includes(value));
}

function hasChatActionCommandOrInternal(text: string): boolean {
  return isChatActionGroupAllowedText(text);
}

function validateIncomingMessage(
  settings: ChatActionRuntimeSettings,
  message: FeishuNormalizedMessage,
): { ok: true } | { ok: false; silent: boolean; status: "ignored" | "rejected"; code: ChatActionErrorCode; reason: string } {
  if (!settings.enabled || !settings.feishu.enabled) {
    return { ok: false, silent: true, status: "ignored", code: "chat_action_disabled", reason: "机器助手未启用。" };
  }
  if (!isChatActionPremiumAvailable()) {
    return { ok: false, silent: true, status: "rejected", code: "premium_unavailable", reason: "高级功能不可用。" };
  }
  if (message.isFromBot) {
    return { ok: false, silent: true, status: "ignored", code: "unsupported_message_type", reason: "忽略机器人自身消息。" };
  }
  if (message.messageType !== "text") {
    return { ok: false, silent: false, status: "ignored", code: "unsupported_message_type", reason: "当前只支持文本消息。" };
  }
  if (message.text.length > settings.maxMessageLength) {
    return { ok: false, silent: false, status: "rejected", code: "message_too_long", reason: "消息过长，已拒绝处理。" };
  }
  const allowed = listHasValue(settings.feishu.allowedOpenIds, message.openId)
    || listHasValue(settings.feishu.allowedUserIds, message.userId)
    || listHasValue(settings.feishu.allowedChatIds, message.chatId);
  if (!allowed) {
    return { ok: false, silent: true, status: "rejected", code: "unauthorized_sender", reason: "已拒绝未授权消息。" };
  }
  if (message.chatType === "private" && !settings.feishu.allowPrivateChat) {
    return { ok: false, silent: true, status: "rejected", code: "unauthorized_sender", reason: "已拒绝未允许的私聊消息。" };
  }
  if (message.chatType === "group" && !settings.feishu.allowGroupChat) {
    return { ok: false, silent: true, status: "rejected", code: "unauthorized_sender", reason: "已拒绝未允许的群聊消息。" };
  }
  if (
    message.chatType === "group"
    && settings.feishu.requireMentionInGroup
    && !hasChatActionCommandOrInternal(message.text)
  ) {
    return { ok: false, silent: true, status: "ignored", code: "unauthorized_sender", reason: "群聊消息未使用内置命令。" };
  }
  return { ok: true };
}

async function recordIncoming(
  message: FeishuNormalizedMessage,
  itemStatus: "received" | "ignored" | "rejected",
  resultSummary?: string,
  includeContent = true,
): Promise<void> {
  await appendChatActionHistory({
    direction: "in",
    status: itemStatus,
    senderId: message.senderId,
    chatId: message.chatId,
    messageId: message.messageId,
    content: includeContent ? message.text : "",
    resultSummary,
  }, runtimeSettings?.keepHistoryLimit ?? 200);
}

async function recordOutgoing(
  message: FeishuNormalizedMessage,
  itemStatus: "executed" | "failed",
  resultSummary: string,
  action?: any,
): Promise<void> {
  await appendChatActionHistory({
    direction: "out",
    status: itemStatus,
    action,
    senderId: message.senderId,
    chatId: message.chatId,
    messageId: message.messageId,
    content: "",
    resultSummary,
  }, runtimeSettings?.keepHistoryLimit ?? 200);
}

async function replyToFeishu(message: FeishuNormalizedMessage, text: string): Promise<boolean> {
  if (!runtimeSettings) return false;
  try {
    await sendFeishuTextMessage(runtimeSettings, message.chatId, text);
    return true;
  } catch (error) {
    await recordOutgoing(message, "failed", sanitizeChatActionErrorMessage(error, "飞书回复发送失败。"));
    return false;
  }
}

function isDuplicateReply(chatId: string, text: string): boolean {
  const now = Date.now();
  const key = `reply:${chatId}`;
  const last = recentReplies.get(key);
  if (last && last.text === text && (now - last.timestamp) < REPLY_DEDUP_MS) {
    return true;
  }
  recentReplies.set(key, { text, timestamp: now });
  // Prune stale entries
  for (const [k, v] of recentReplies.entries()) {
    if (now - v.timestamp > REPLY_DEDUP_MS) recentReplies.delete(k);
  }
  return false;
}

async function replyToFeishuOnce(message: FeishuNormalizedMessage, text: string): Promise<boolean> {
  if (!text || isDuplicateReply(message.chatId, text)) return false;
  return replyToFeishu(message, text);
}

export async function handleChatActionFeishuMessage(message: FeishuNormalizedMessage): Promise<void> {
  if (!runtimeSettings) return;

  // Reject messages without a stable messageId — can't deduplicate
  if (!message.messageId) {
    await recordIncoming(message, "rejected", "缺少消息 ID，已忽略。");
    return;
  }

  // Pairing capture mode: intercept first eligible private message
  const captureState = await loadPairingCaptureState();
  if (captureState.enabled && Date.now() <= captureState.expiresAt) {
    if (message.isFromBot) return;
    if (message.chatType !== "private") return;
    if (message.messageType !== "text") {
      await replyToFeishuOnce(message, "请发送一条文本消息用于绑定。");
      return;
    }
    if (!message.text.trim()) return;

    await completePairingCapture({
      openId: message.openId,
      userId: message.userId,
      chatId: message.chatId,
      senderName: message.senderName,
    });
    await replyToFeishuOnce(message, "已收到绑定请求，请回到思源设置页确认加入白名单。");
    window.dispatchEvent(new CustomEvent("chat-action-bridge-pairing-captured"));
    return;
  }
  if (captureState.enabled && Date.now() > captureState.expiresAt) {
    // Expired capture state — clear it so normal mode can proceed
    await clearCaptureResult();
  }

  const validation = validateIncomingMessage(runtimeSettings, message);
  if (validation.ok === false) {
    await recordIncoming(message, validation.status, validation.reason, validation.code !== "unauthorized_sender");
    if (!validation.silent) {
      await replyToFeishuOnce(message, validation.reason);
    }
    return;
  }

  if (isChatActionMessageProcessed("feishu", message.messageId)) {
    await recordIncoming(message, "ignored", "重复投递的消息已忽略。");
    return;
  }

  markChatActionMessageProcessed("feishu", message.messageId);
  await recordIncoming(message, "received");

  const result = await routeChatActionMessage(runtimeSettings, message);
  if (result.shouldReply && result.replyText) {
    await replyToFeishuOnce(message, result.replyText);
  }
  await recordOutgoing(message, result.status === "failed" ? "failed" : "executed", result.replyText || "", result.action);
}

async function stopClient(statusMessage = "已停止"): Promise<void> {
  const existing = client;
  client = null;
  runtimeSettings = null;
  clearAllChatActionSessions();
  if (existing) {
    await existing.stop();
  }
  setStatus({ code: "stopped", message: statusMessage });
}

export async function startLocalFeishuGateway(): Promise<ChatActionRuntimeStatus> {
  if (!pluginInstance) {
    setStatus({ code: "stopped", message: "机器助手尚未初始化。" });
    return status;
  }

  let settings: ChatActionRuntimeSettings;
  try {
    settings = await loadChatActionBridgeRuntimeSettings();
  } catch {
    setStatus({ code: "connection_failed", message: "App Secret 无法解密，请重新填写。", detail: "secret_decrypt_failed" });
    return status;
  }

  if (!settings.feishu.appId) {
    setStatus({ code: "missing_app_id", message: "未配置 App ID" });
    return status;
  }
  if (!settings.feishu.appSecret) {
    setStatus({ code: "missing_app_secret", message: "未配置 App Secret" });
    return status;
  }

  setStatus({ code: "connecting", message: "正在启动本地飞书网关" });
  const result = await startFeishuLocalGatewayProcess(pluginInstance, settings);
  if (!result.ok) {
    setStatus({
      code: "gateway_unavailable",
      message: result.message,
      detail: result.detail ? sanitizeChatActionErrorMessage(result.detail, "本地飞书网关启动失败。") : undefined,
    });
    return status;
  }
  setStatus({ code: "stopped", message: result.message });
  return status;
}

function validateStartSettings(
  settings: ChatActionRuntimeSettings,
  isCaptureMode = false,
): ChatActionRuntimeStatus | null {
  if (!isChatActionPremiumAvailable()) {
    return { code: "premium_unavailable", message: "高级功能不可用，机器助手未启动。", updatedAt: Date.now() };
  }
  if (!settings.enabled || !settings.feishu.enabled) {
    return { code: "disabled", message: "未启用", updatedAt: Date.now() };
  }
  if (!settings.feishu.appId) {
    return { code: "missing_app_id", message: "未配置 App ID", updatedAt: Date.now() };
  }
  if (!settings.feishu.appSecret) {
    return { code: "missing_app_secret", message: "未配置 App Secret", updatedAt: Date.now() };
  }
  if (!isCaptureMode && !hasChatActionWhitelist(settings)) {
    return { code: "missing_whitelist", message: "未配置允许的用户或群聊。首次使用请点击「开始捕获下一条私聊消息」完成绑定。", updatedAt: Date.now() };
  }
  return null;
}

export async function startChatActionBridgeIfNeeded(options: { restart?: boolean; captureMode?: boolean } = {}): Promise<ChatActionRuntimeStatus> {
  if (!pluginInstance) {
    setStatus({ code: "stopped", message: "机器助手尚未初始化。" });
    return status;
  }
  if (client && !options.restart) return status;
  if (client) {
    await stopClient("正在重启机器助手。");
  }

  let settings: ChatActionRuntimeSettings;
  try {
    settings = await loadChatActionBridgeRuntimeSettings();
  } catch {
    setStatus({ code: "connection_failed", message: "App Secret 无法解密，请重新填写。", detail: "secret_decrypt_failed" });
    return status;
  }

  const isCaptureMode = options.captureMode === true;
  const invalid = validateStartSettings(settings, isCaptureMode);
  if (invalid) {
    runtimeSettings = null;
    setStatus({ code: invalid.code, message: invalid.message, detail: invalid.detail });
    return status;
  }

  runtimeSettings = settings;
  client = new FeishuEventClient({
    settings,
    onMessage: handleChatActionFeishuMessage,
    onStatusChange: (next, detail) => {
      if (next === "connecting") setStatus({ code: "connecting", message: "正在连接本地网关" });
      if (next === "connected") setStatus({ code: "connected", message: "本地网关已连接" });
      if (next === "gateway_unavailable") setStatus({ code: "gateway_unavailable", message: detail || "本地飞书网关未启动" });
      if (next === "connection_failed") setStatus({ code: "connection_failed", message: "连接失败", detail });
      if (next === "stopped") setStatus({ code: "stopped", message: "已停止" });
    },
  });

  try {
    await client.start();
  } catch (error) {
    client = null;
    runtimeSettings = null;
    if ((error as any)?.code === "gateway_unavailable") {
      setStatus({
        code: "gateway_unavailable",
        message: "飞书 Node SDK 不能在思源前端环境中直接运行，请启动本地飞书网关。",
      });
      return status;
    }
    setStatus({
      code: "connection_failed",
      message: "连接失败",
      detail: sanitizeChatActionErrorMessage(error, "飞书长连接启动失败。"),
    });
  }
  return status;
}

export async function stopChatActionBridge(): Promise<void> {
  await stopClient("已停止");
}

export async function startCapturePairing(restart = false): Promise<ChatActionRuntimeStatus> {
  const captureState = await loadPairingCaptureState();

  // If capture is already enabled and connection is live, just refresh TTL
  if (captureState.enabled && !restart) {
    const currentStatus = getChatActionBridgeRuntimeStatus();
    if (currentStatus.code === "connected") {
      await refreshPairingCaptureTtl();
      setStatus({ code: currentStatus.code, message: "网关已连接，等待飞书私聊绑定" });
      return getChatActionBridgeRuntimeStatus();
    }
  }

  // Ensure the bridge is started in capture mode (restart if requested or connection stale)
  const result = await startChatActionBridgeIfNeeded({ restart: true, captureMode: true });
  if (result.code === "connected") {
    await startPairingCapture();
    setStatus({ code: result.code, message: "网关已连接，等待飞书私聊绑定" });
  } else {
    // Connection failed — ensure no stale enabled state
    await clearCaptureResult();
  }
  return getChatActionBridgeRuntimeStatus();
}

export async function stopCapturePairing(): Promise<void> {
  const captureState = await loadPairingCaptureState();
  if (!captureState.enabled) return;
  await clearCaptureResult();

  // Check if we should stop the bridge or switch to normal mode
  const settings = await loadChatActionBridgeRuntimeSettings().catch(() => null);
  if (!settings || !settings.enabled || !settings.feishu.enabled || !hasChatActionWhitelist(settings)) {
    await stopChatActionBridge();
  } else {
    await startChatActionBridgeIfNeeded({ restart: true });
  }
}

async function handleSettingsChanged(): Promise<void> {
  const captureState = await loadPairingCaptureState();
  if (captureState.enabled && Date.now() <= captureState.expiresAt) {
    await startChatActionBridgeIfNeeded({ restart: true, captureMode: true });
    return;
  }
  await startChatActionBridgeIfNeeded({ restart: true });
}

async function handleAdvancedReady(): Promise<void> {
  await startChatActionBridgeIfNeeded({ restart: true });
}

async function handleAdvancedUnavailable(): Promise<void> {
  await stopClient("高级功能不可用，机器助手已停止。");
  setStatus({ code: "premium_unavailable", message: "高级功能不可用，机器助手已停止。" });
}

export function attachChatActionBridgeLifecycleListeners(): void {
  if (listenersAttached) return;
  window.addEventListener("chat-action-bridge-settings-changed", handleSettingsChanged);
  window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
  window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
  listenersAttached = true;
}

export async function destroyChatActionBridge(): Promise<void> {
  if (listenersAttached) {
    window.removeEventListener("chat-action-bridge-settings-changed", handleSettingsChanged);
    window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
    window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
    listenersAttached = false;
  }
  await stopClient("已停止");
  stopFeishuLocalGatewayProcess();
}

export function setChatActionBridgeServicePlugin(plugin: any): void {
  pluginInstance = plugin;
  attachChatActionBridgeLifecycleListeners();
}
