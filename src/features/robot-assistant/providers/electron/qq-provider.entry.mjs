// QQ Electron Provider bundle entry（ESM 源，因 @tencent-connect/qqbot-nodejs 仅导出 import 条件）。
// 构建为 build/robot-electron/qq-provider.cjs（esbuild 打包 @tencent-connect/qqbot-nodejs + ws）。
// 由 Electron 前端通过 window.require 加载；前端把 SDK 收到的事件标准化后送 Kernel Robot Core。
//
// 导出契约：create(options) -> { connect, disconnect, getStatus, sendText, setMessageHandler }。
import { QQBot } from "@tencent-connect/qqbot-nodejs";

function normalizeInboundMessage(bot, msg) {
  const kind = msg && msg.kind;
  const replyTarget = msg && msg.replyTarget;
  const isGroup = kind === "group";
  if ((kind !== "c2c" && kind !== "group") || !replyTarget) {
    return null;
  }
  const chatId = isGroup ? (msg.groupOpenid || replyTarget.targetId || "") : replyTarget.targetId || "";
  if (!chatId) return null;

  const text = typeof msg.content === "string" ? msg.content : "";
  const mentioned = Array.isArray(msg.mentions) && msg.mentions.length > 0
    || /@_user_1\b|@_all\b/.test(text);

  return {
    provider: "qq",
    accountId: bot.accountId,
    messageId: msg.messageId || `qq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderId: msg.senderId || "",
    ...(typeof msg.senderName === "string" && msg.senderName ? { senderName: msg.senderName } : {}),
    chatId,
    chatType: isGroup ? "group" : "private",
    text,
    messageType: text && Array.isArray(msg.attachments) && msg.attachments.length > 0 ? "unsupported" : "text",
    isFromBot: msg.senderIsBot === true,
    isMentioned: mentioned,
    contextToken: isGroup ? "group" : "c2c",
    replyToMessageId: msg.messageId,
    receivedAt: Date.now(),
    rawMeta: {
      kind,
      hasAttachments: Array.isArray(msg.attachments) && msg.attachments.length > 0,
    },
  };
}

export function create(options) {
  const cfg = options || {};
  let handler = () => {};
  let bot = null;
  let abortController = null;
  let status = "disconnected";
  let statusHandler = () => {};
  let lastError = "";

  const appId = typeof cfg.appId === "string" ? cfg.appId.trim() : "";
  const appSecret = typeof cfg.appSecret === "string" ? cfg.appSecret.trim() : "";
  const accountId = typeof cfg.accountId === "string" && cfg.accountId ? cfg.accountId : appId;

  function currentStatus() {
    return {
      provider: "qq",
      runtimeKind: "electron",
      availability: appId && appSecret ? "available" : "not_configured",
      status,
      updatedAt: Date.now(),
      ...(lastError ? { message: lastError } : {}),
      ...(status === "connected" || status === "reconnecting"
        ? { account: { accountId, displayName: "QQ", authenticated: true } }
        : {}),
    };
  }

  function setStatus(next) {
    status = next;
    if (next === "connected") lastError = "";
    try { statusHandler(currentStatus()); } catch { /* 状态监听不影响 SDK */ }
  }

  function describeError(error) {
    const raw = error instanceof Error ? error.message : String(error || "QQ 连接失败");
    if (/\bip\b|white\s*list|白名单|出口地址/i.test(raw)) {
      return raw
        ? `QQ 开放平台可能要求配置当前公网出口 IP；请按 QQ 官方后台要求完成。（${raw.slice(0, 200)}）`
        : "QQ 开放平台可能要求配置当前公网出口 IP；请按 QQ 官方后台要求完成。";
    }
    return raw.slice(0, 300);
  }

  const api = {
    setMessageHandler(next) {
      handler = typeof next === "function" ? next : () => {};
    },
    setStatusHandler(next) {
      statusHandler = typeof next === "function" ? next : () => {};
    },
    getStatus: currentStatus,

    async connect() {
      if (!appId || !appSecret) {
        setStatus("disconnected");
        return currentStatus();
      }
      if (bot) return currentStatus();
      try {
        bot = new QQBot({
          appId,
          appSecret,
          accountId,
          logger: {
            info: () => {},
            error: () => {},
            warn: () => {},
            debug: () => {},
          },
        });
        abortController = new AbortController();

        bot.on("ready", () => {
          setStatus("connected");
        });
        bot.on("resumed", () => {
          setStatus("connected");
        });
        bot.on("error", (error) => {
          lastError = describeError(error);
          if (status !== "disconnected") setStatus("error");
        });
        bot.on("message", async (ctx, msg) => {
          const normalized = normalizeInboundMessage(bot, msg);
          if (!normalized) return;
          try {
            await handler(normalized);
          } catch {
            // 消息处理失败不影响长连接
          }
        });

        setStatus("connecting");
        void bot.start(abortController.signal).catch((error) => {
          if (abortController && !abortController.signal.aborted) {
            lastError = describeError(error);
            setStatus("error");
          }
        });
      } catch (err) {
        lastError = describeError(err);
        setStatus("error");
        throw err;
      }
      return currentStatus();
    },

    async disconnect() {
      if (abortController) {
        try {
          abortController.abort();
        } catch {
          // 忽略
        }
        abortController = null;
      }
      if (bot && typeof bot.stop === "function") {
        try {
          bot.stop();
        } catch {
          // 忽略关闭错误
        }
      }
      bot = null;
      setStatus("disconnected");
    },

    async sendText({ chatId, text, replyToMessageId, contextToken }) {
      if (!bot || !chatId) {
        throw new Error("QQ 客户端未初始化");
      }
      const scope = contextToken === "group" ? "group" : "c2c";
      const target = {
        scope,
        targetId: chatId,
        ...(replyToMessageId ? { msgId: replyToMessageId } : {}),
      };
      await bot.sendText(target, text);
    },
  };

  return api;
}

export default { create };
