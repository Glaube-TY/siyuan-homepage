// Feishu Electron Provider bundle entry。
// 构建为 build/robot-electron/feishu-provider.cjs（esbuild 打包 @larksuiteoapi/node-sdk + ws + protobuf）。
// 由 Electron 前端通过 window.require 加载；前端把 SDK 收到的事件标准化后送 Kernel Robot Core。
//
// 导出契约：create(options) -> { connect, disconnect, getStatus, sendText, setMessageHandler }。
"use strict";

const lark = require("@larksuiteoapi/node-sdk");

function normalizeReceiveEvent(data) {
  // EventDispatcher 的正式回调参数就是事件体；保留 event 外壳兼容旧推送形态。
  const event = data?.event || data || {};
  const message = event.message || {};
  const sender = event.sender?.sender_id || {};
  const chatType = event.message?.chat_type || "unknown";
  const msgType = message.message_type || "text";
  const contentRaw = message.content || "";
  let text = "";
  if (msgType === "text") {
    try {
      const parsed = JSON.parse(contentRaw);
      text = typeof parsed.text === "string" ? parsed.text : "";
    } catch {
      text = "";
    }
  }
  const chatId = message.chat_id || "";
  return {
    provider: "feishu",
    accountId: "",
    messageId: message.message_id || `feishu_${Date.now()}`,
    senderId: sender.open_id || "",
    senderName: sender.user_id || undefined,
    chatId,
    chatType: chatType === "p2p" ? "private" : chatType === "group" ? "group" : "unknown",
    text,
    messageType: msgType === "text" ? "text" : "unsupported",
    isFromBot: event.sender?.sender_type === "app" || event.sender?.sender_type === "bot",
    isMentioned: msgType === "text" && (
      (Array.isArray(message.mentions) && message.mentions.length > 0)
      || /@_user_1\b|@_all\b/.test(text)
    ),
    receivedAt: Date.now(),
    eventId: data?.event_id,
  };
}

function create(options) {
  const cfg = options || {};
  let handler = () => {};
  let ws = null;
  let client = null;
  let status = "disconnected";
  let statusHandler = () => {};
  let lastError = "";

  const appId = cfg.appId || "";
  const appSecret = cfg.appSecret || "";

  if (appId && appSecret) {
    try {
      client = new lark.Client({ appId, appSecret });
    } catch {
      // appId/Secret 无效时保持 not_configured
    }
  }

  function currentStatus() {
    return {
      provider: "feishu",
      runtimeKind: "electron",
      availability: appId && appSecret ? "available" : "not_configured",
      status,
      updatedAt: Date.now(),
      ...(lastError ? { message: lastError } : {}),
      ...(status === "connected" ? { account: { accountId: appId, displayName: "飞书", authenticated: true } } : {}),
    };
  }

  function setStatus(next) {
    status = next;
    if (next === "connected") lastError = "";
    try { statusHandler(currentStatus()); } catch { /* 状态监听不影响 SDK */ }
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
      if (ws) return currentStatus();
      try {
        const eventDispatcher = new lark.EventDispatcher({}).register({
          "im.message.receive_v1": async (data) => {
            const normalized = { ...normalizeReceiveEvent(data), accountId: appId };
            try {
              await handler(normalized);
            } catch {
              // 消息处理失败不影响长连接
            }
          },
        });
        ws = new lark.WSClient({
          appId,
          appSecret,
          onReady: () => setStatus("connected"),
          onError: (error) => {
            lastError = error instanceof Error ? error.message : String(error || "飞书长连接失败");
            setStatus("error");
          },
          onReconnecting: () => setStatus("reconnecting"),
          onReconnected: () => setStatus("connected"),
        });
        setStatus("connecting");
        await ws.start({ eventDispatcher });
        const connection = typeof ws.getConnectionStatus === "function" ? ws.getConnectionStatus() : null;
        if (connection?.state === "connected") setStatus("connected");
        else if (connection?.state === "failed") setStatus("error");
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err || "飞书长连接失败");
        setStatus("error");
        throw err;
      }
      return currentStatus();
    },

    async disconnect() {
      if (ws && typeof ws.close === "function") {
        try {
          await ws.close();
        } catch {
          // 忽略关闭错误
        }
      }
      ws = null;
      setStatus("disconnected");
    },

    async sendText({ chatId, text, replyToMessageId }) {
      if (!client) {
        throw new Error("飞书客户端未初始化");
      }
      const data = { msg_type: "text", content: JSON.stringify({ text }) };
      if (replyToMessageId) {
        await client.im.message.reply({ data, path: { message_id: replyToMessageId } });
      } else {
        await client.im.message.create({ data: { ...data, receive_id: chatId }, params: { receive_id_type: "chat_id" } });
      }
    },
  };

  return api;
}

module.exports = { create };
