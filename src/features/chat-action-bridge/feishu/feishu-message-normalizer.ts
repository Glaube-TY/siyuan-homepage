import type { FeishuNormalizedMessage } from "../types";

function readRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function readTextContent(content: unknown): string {
  if (typeof content !== "string") return "";
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed?.text === "string") return parsed.text.trim();
  } catch {
    return content.trim();
  }
  return "";
}

function normalizeChatType(chatType: unknown): FeishuNormalizedMessage["chatType"] {
  const value = String(chatType ?? "").toLowerCase();
  if (value === "p2p" || value === "private") return "private";
  if (value === "group") return "group";
  return "unknown";
}

function readSenderId(sender: Record<string, any>): { openId: string; userId: string; senderId: string } {
  const senderId = readRecord(sender.sender_id ?? sender.senderId);
  const openId = String(senderId.open_id ?? senderId.openId ?? sender.open_id ?? sender.openId ?? "").trim();
  const userId = String(senderId.user_id ?? senderId.userId ?? sender.user_id ?? sender.userId ?? "").trim();
  return {
    openId,
    userId,
    senderId: openId || userId || String(sender.sender_id ?? sender.senderId ?? "").trim(),
  };
}

function readEventPayload(raw: unknown): Record<string, any> {
  const value = readRecord(raw);
  const data = readRecord(value.data);
  return readRecord(data.event ?? value.event ?? value);
}

export function normalizeFeishuMessage(raw: unknown): FeishuNormalizedMessage | null {
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
    raw,
  };
}

