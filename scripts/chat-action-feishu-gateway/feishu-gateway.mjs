#!/usr/bin/env node
/* global process, Buffer, URL, setTimeout, clearTimeout */
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
  const pendingWaiters = [];
  const recentMessageIds = new Map();
  const recentMessageTtlMs = 24 * 60 * 60 * 1000;
  const messageTtlMs = 24 * 60 * 60 * 1000;
  const MAX_QUEUE_LENGTH = 1000;
  const TARGET_QUEUE_LENGTH = 500;
  const DEFAULT_EVENTS_LIMIT = 20;
  const MAX_EVENTS_LIMIT = 50;
  const DEFAULT_EVENTS_WAIT_MS = 25000;
  const MAX_EVENTS_WAIT_MS = 30000;

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

  function prunePendingEvents(now) {
    const cutoff = now - messageTtlMs;
    let removed = 0;
    while (pendingEvents.length > 0 && pendingEvents[0].receivedAt < cutoff) {
      pendingEvents.shift();
      removed += 1;
    }
    if (pendingEvents.length > MAX_QUEUE_LENGTH) {
      const excess = pendingEvents.length - TARGET_QUEUE_LENGTH;
      pendingEvents.splice(0, excess);
    }
    return removed;
  }

  function enqueueMessage(message) {
    const now = Date.now();
    if (!rememberMessageId(message.messageId)) return;
    prunePendingEvents(now);
    pendingEvents.push(message);
    if (pendingEvents.length > MAX_QUEUE_LENGTH) {
      pendingEvents.splice(0, pendingEvents.length - TARGET_QUEUE_LENGTH);
    }
    // Wake any waiting long-poll requests with the newest messages
    while (pendingWaiters.length > 0) {
      const waiter = pendingWaiters.shift();
      try {
        waiter.resolve();
      } catch {
        // ignore waiter errors
      }
    }
  }

  function ackMessages(messageIds) {
    const idSet = new Set(messageIds);
    for (let i = pendingEvents.length - 1; i >= 0; i -= 1) {
      if (idSet.has(pendingEvents[i].messageId)) {
        pendingEvents.splice(i, 1);
      }
    }
  }

  function peekPendingMessages(limit) {
    if (pendingEvents.length === 0) return [];
    return pendingEvents.slice(0, Math.min(limit, pendingEvents.length));
  }

  function clampNumber(value, defaultValue, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return defaultValue;
    return Math.min(max, Math.max(min, number));
  }

  function parseEventsQuery(url) {
    const limit = clampNumber(
      url.searchParams.get("limit") ?? DEFAULT_EVENTS_LIMIT,
      DEFAULT_EVENTS_LIMIT,
      1,
      MAX_EVENTS_LIMIT,
    );
    const waitMs = clampNumber(
      url.searchParams.get("waitMs") ?? DEFAULT_EVENTS_WAIT_MS,
      DEFAULT_EVENTS_WAIT_MS,
      0,
      MAX_EVENTS_WAIT_MS,
    );
    return { limit, waitMs };
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
      enqueueMessage(message);
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
        prunePendingEvents(Date.now());
        sendJson(res, 200, { ok: true, queueLength: pendingEvents.length });
        return;
      }
      if (req.method === "GET" && url.pathname === "/events") {
        prunePendingEvents(Date.now());
        const { limit, waitMs } = parseEventsQuery(url);
        let messages = peekPendingMessages(limit);
        if (messages.length > 0) {
          sendJson(res, 200, { ok: true, messages, queueLength: pendingEvents.length });
          return;
        }
        if (waitMs <= 0) {
          sendJson(res, 200, { ok: true, messages: [], queueLength: pendingEvents.length });
          return;
        }
        // Long-polling: wait up to waitMs for new messages
        let timer = null;
        let waiter = null;
        let closed = false;
        function cleanupWaiter() {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (waiter) {
            const index = pendingWaiters.indexOf(waiter);
            if (index >= 0) pendingWaiters.splice(index, 1);
            try {
              waiter.resolve();
            } catch {
              // ignore
            }
            waiter = null;
          }
        }
        function onReqClose() {
          closed = true;
          cleanupWaiter();
        }
        const waitPromise = new Promise((resolve) => {
          waiter = { resolve };
          pendingWaiters.push(waiter);
          timer = setTimeout(() => {
            cleanupWaiter();
            resolve();
          }, waitMs);
        });
        req.once("close", onReqClose);
        try {
          await waitPromise;
        } finally {
          cleanupWaiter();
          req.removeListener("close", onReqClose);
        }
        if (closed || res.writableEnded) return;
        messages = peekPendingMessages(limit);
        sendJson(res, 200, { ok: true, messages, queueLength: pendingEvents.length });
        return;
      }
      if (req.method === "POST" && url.pathname === "/ack") {
        prunePendingEvents(Date.now());
        const body = await readJsonBody(req);
        const messageIds = Array.isArray(body.messageIds) ? body.messageIds : [];
        ackMessages(messageIds);
        sendJson(res, 200, { ok: true, queueLength: pendingEvents.length });
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
