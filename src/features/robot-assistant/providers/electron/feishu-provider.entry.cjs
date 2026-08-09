// Feishu Electron Provider bundle entry。
// 构建为 build/robot-electron/feishu-provider.cjs（esbuild 打包 @larksuiteoapi/node-sdk + ws + protobuf）。
// 由 Electron 前端通过 window.require 加载；前端把 SDK 收到的事件标准化后送 Kernel Robot Core。
//
// 导出契约：create(options) -> { connect, disconnect, getStatus, sendText, setMessageHandler }。
"use strict";

const lark = require("@larksuiteoapi/node-sdk");

// 飞书 SDK 默认使用 info 级别，会在每次启动时输出 client/event/ws ready 等
// 调试信息。Provider 的连接状态已经由 setStatusHandler 对外提供，因此控制台
// 只保留真正的 SDK 错误，避免正常启动刷屏。
const FEISHU_SDK_OPTIONS = {
  loggerLevel: lark.LoggerLevel.error,
};

function createFeishuHttpInstance() {
  // SDK 的默认 Axios 实例会强制补 User-Agent。Electron 渲染进程最终使用
  // XMLHttpRequest 发起请求，而浏览器禁止脚本设置该请求头，会为每次请求打印
  // 一整段 “Refused to set unsafe header” 调用栈。使用隔离实例，并在请求发出前
  // 仅移除这个浏览器禁用头；鉴权头和其他业务请求头保持不变。
  const httpInstance = lark.defaultHttpInstance.create();
  httpInstance.interceptors.request.use((config) => {
    const headers = config?.headers;
    if (!headers) return config;

    if (typeof headers.delete === "function") {
      headers.delete("User-Agent");
      headers.delete("user-agent");
      return config;
    }

    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "user-agent") delete headers[key];
    }
    return config;
  });
  // lark.defaultHttpInstance 还会把 AxiosResponse 解包成飞书响应正文。
  // 隔离实例不会继承拦截器，必须保持同一返回契约，否则 WSClient 会读到
  // code=undefined 并把已经成功的连接配置误判成异常。
  httpInstance.interceptors.response.use((response) => {
    if (response?.config?.$return_headers) {
      return { data: response.data, headers: response.headers };
    }
    return response.data;
  });
  return httpInstance;
}

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
  // 写操作的 exactly-once 防护依赖稳定平台 ID。缺少 message_id 时仅允许使用
  // 飞书事件 ID；两者都不存在就丢弃，不能用 Date.now() 制造一个无法去重的新 ID。
  const stableMessageId = message.message_id || data?.event_id || "";
  if (!stableMessageId || !chatId || !sender.open_id) return null;
  return {
    provider: "feishu",
    accountId: "",
    messageId: stableMessageId,
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
  const httpInstance = createFeishuHttpInstance();

  if (appId && appSecret) {
    try {
      client = new lark.Client({
        appId,
        appSecret,
        httpInstance,
        ...FEISHU_SDK_OPTIONS,
      });
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
        const eventDispatcher = new lark.EventDispatcher(FEISHU_SDK_OPTIONS).register({
          "im.message.receive_v1": async (data) => {
            const received = normalizeReceiveEvent(data);
            if (!received) return;
            const normalized = { ...received, accountId: appId };
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
          httpInstance,
          ...FEISHU_SDK_OPTIONS,
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
