#!/usr/bin/env node
/* global process, Buffer, URL */
import http from "node:http";
import * as FeishuSdk from "@larksuiteoapi/node-sdk";

function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    i += 1;
  }
  return result;
}

function fail(message) {
  process.stderr.write(`[chat-action-feishu-gateway] ${message}\n`);
  process.exit(1);
}

function readRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readTextContent(content) {
  if (typeof content !== "string") return "";
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed?.text === "string") return parsed.text.trim();
  } catch {
    return content.trim();
  }
  return "";
}

function normalizeChatType(chatType) {
  const value = String(chatType ?? "").toLowerCase();
  if (value === "p2p" || value === "private") return "private";
  if (value === "group") return "group";
  return "unknown";
}

function readSenderId(sender) {
  const senderId = readRecord(sender.sender_id ?? sender.senderId);
  const openId = String(senderId.open_id ?? senderId.openId ?? sender.open_id ?? sender.openId ?? "").trim();
  const userId = String(senderId.user_id ?? senderId.userId ?? sender.user_id ?? sender.userId ?? "").trim();
  return {
    openId,
    userId,
    senderId: openId || userId || String(sender.sender_id ?? sender.senderId ?? "").trim(),
  };
}

function readEventPayload(raw) {
  const value = readRecord(raw);
  const data = readRecord(value.data);
  return readRecord(data.event ?? value.event ?? value);
}

function normalizeFeishuMessage(raw) {
  const event = readEventPayload(raw);
  const message = readRecord(event.message);
  const sender = readRecord(event.sender);
  const senderIds = readSenderId(sender);
  const messageId = String(message.message_id ?? message.messageId ?? event.message_id ?? "").trim();
  const chatId = String(message.chat_id ?? message.chatId ?? event.chat_id ?? "").trim();
  const messageType = String(message.message_type ?? message.messageType ?? event.message_type ?? "").trim();
  const mentions = Array.isArray(message.mentions) ? message.mentions : [];
  const text = readTextContent(message.content ?? event.content);

  if (!messageId || !chatId) return null;

  return {
    provider: "feishu",
    eventId: String(event.event_id ?? event.eventId ?? "").trim() || undefined,
    messageId,
    messageType,
    chatId,
    chatType: normalizeChatType(message.chat_type ?? message.chatType),
    openId: senderIds.openId,
    userId: senderIds.userId,
    senderId: senderIds.senderId,
    senderName: String(sender.sender_name ?? sender.senderName ?? sender.name ?? "").trim(),
    text,
    isFromBot: ["app", "bot"].includes(String(sender.sender_type ?? sender.senderType ?? "").toLowerCase()),
    isMentioned: mentions.length > 0,
    receivedAt: Date.now(),
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req, token) {
  const headerToken = String(req.headers["x-local-auth-token"] ?? "").trim();
  const auth = String(req.headers.authorization ?? "").trim();
  return headerToken === token || auth === `Bearer ${token}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const appId = String(args["app-id"] ?? "").trim();
  const appSecret = String(process.env.FEISHU_APP_SECRET ?? "").trim();
  const token = String(args["local-auth-token"] ?? process.env.CHAT_ACTION_LOCAL_AUTH_TOKEN ?? "").trim();
  const port = Number(args.port ?? 17626);

  if (!appId) fail("缺少 --app-id。");
  if (!appSecret) fail("缺少 FEISHU_APP_SECRET 环境变量。");
  if (!token) fail("缺少 CHAT_ACTION_LOCAL_AUTH_TOKEN 环境变量或 --local-auth-token。");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail("无效的 --port。");

  const pendingEvents = [];
  const recentMessageIds = new Map();
  const recentMessageTtlMs = 24 * 60 * 60 * 1000;

  function pruneRecentMessageIds(now) {
    for (const [messageId, expiresAt] of recentMessageIds) {
      if (expiresAt <= now || recentMessageIds.size > 1000) {
        recentMessageIds.delete(messageId);
      }
    }
  }

  function rememberMessageId(messageId) {
    const now = Date.now();
    pruneRecentMessageIds(now);
    if (recentMessageIds.has(messageId)) return false;
    recentMessageIds.set(messageId, now + recentMessageTtlMs);
    return true;
  }

  const client = new FeishuSdk.Client({
    appId,
    appSecret,
    disableTokenCache: false,
    loggerLevel: FeishuSdk.LoggerLevel?.error,
  });
  const eventDispatcher = new FeishuSdk.EventDispatcher({}).register({
    "im.message.receive_v1": async (data) => {
      const message = normalizeFeishuMessage(data);
      if (!message) return;
      if (!rememberMessageId(message.messageId)) return;
      pendingEvents.push(message);
      if (pendingEvents.length > 200) pendingEvents.splice(0, pendingEvents.length - 200);
    },
  });
  const wsClient = new FeishuSdk.WSClient({
    appId,
    appSecret,
    loggerLevel: FeishuSdk.LoggerLevel?.error,
  });

  async function sendReply(chatId, text) {
    const payload = {
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    };
    const creator = client.im?.v1?.message?.create ?? client.im?.message?.create;
    if (typeof creator !== "function") {
      throw new Error("feishu_message_create_unavailable");
    }
    await creator.call(client.im?.v1?.message ?? client.im?.message, payload);
  }

  const server = http.createServer(async (req, res) => {
    if (!isAuthorized(req, token)) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/events") {
        const messages = pendingEvents.splice(0, pendingEvents.length);
        sendJson(res, 200, { ok: true, messages });
        return;
      }
      if (req.method === "POST" && url.pathname === "/reply") {
        const body = await readJsonBody(req);
        const chatId = String(body.chatId ?? "").trim();
        const text = String(body.text ?? "").trim();
        if (!chatId || !text) {
          sendJson(res, 400, { ok: false, error: "invalid_reply_payload" });
          return;
        }
        await sendReply(chatId, text);
        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 404, { ok: false, error: "not_found" });
    } catch {
      sendJson(res, 500, { ok: false, error: "gateway_error" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  try {
    await wsClient.start({ eventDispatcher });
  } catch {
    server.close();
    fail("飞书长连接启动失败，请检查 App ID、App Secret、事件订阅和应用权限。");
  }

  async function shutdown() {
    server.close();
    try {
      if (typeof wsClient.stop === "function") await wsClient.stop();
      else if (typeof wsClient.close === "function") await wsClient.close();
      else if (typeof wsClient.shutdown === "function") await wsClient.shutdown();
    } catch {
      // ignore shutdown errors
    }
    process.exit(0);
  }

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });
}

main().catch(() => {
  fail("本地飞书网关异常退出。");
});
