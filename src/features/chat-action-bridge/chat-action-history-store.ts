import { CHAT_ACTION_BRIDGE_HISTORY_KEY, CHAT_ACTION_BRIDGE_PROCESSED_TTL_MS } from "./constants";
import { maskChatActionId, previewChatActionContent } from "./chat-action-redact";
import type { ChatActionHistoryItem, ChatActionHistoryStatus, ChatActionProvider, ChatActionType } from "./types";

const PROCESSED_STORE_KEY = "chatActionBridgeProcessed.json";

let pluginInstance: any = null;
const processedMessages = new Map<string, number>();

export function setChatActionHistoryPlugin(plugin: any): void {
  pluginInstance = plugin;
  void loadProcessedMessages();
}

function getPlugin(): any {
  if (!pluginInstance) throw new Error("Chat Action Bridge history store is not initialized.");
  return pluginInstance;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeHistoryItem(raw: unknown): ChatActionHistoryItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<ChatActionHistoryItem>;
  if (value.provider !== "feishu") return null;
  if (value.direction !== "in" && value.direction !== "out") return null;
  const allowedStatus = new Set<ChatActionHistoryStatus>(["received", "ignored", "rejected", "executed", "failed"]);
  if (!value.status || !allowedStatus.has(value.status)) return null;
  return {
    id: typeof value.id === "string" && value.id ? value.id : createId("chat-action-history"),
    provider: "feishu",
    direction: value.direction,
    action: value.action,
    status: value.status,
    senderIdMasked: typeof value.senderIdMasked === "string" ? value.senderIdMasked : "",
    chatIdMasked: typeof value.chatIdMasked === "string" ? value.chatIdMasked : "",
    messageId: typeof value.messageId === "string" ? value.messageId : undefined,
    contentPreview: typeof value.contentPreview === "string" ? previewChatActionContent(value.contentPreview) : undefined,
    resultSummary: typeof value.resultSummary === "string" ? previewChatActionContent(value.resultSummary, 120) : undefined,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
  };
}

export async function loadChatActionHistory(limit?: number): Promise<ChatActionHistoryItem[]> {
  try {
    const raw = await getPlugin().loadData(CHAT_ACTION_BRIDGE_HISTORY_KEY);
    const items = Array.isArray(raw)
      ? raw.map(normalizeHistoryItem).filter((item): item is ChatActionHistoryItem => item !== null)
      : [];
    const safeLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : items.length;
    return items.slice(0, safeLimit);
  } catch {
    return [];
  }
}

export async function saveChatActionHistory(items: ChatActionHistoryItem[], limit: number): Promise<void> {
  const safeLimit = Math.max(1, Math.floor(limit || 200));
  await getPlugin().saveData(CHAT_ACTION_BRIDGE_HISTORY_KEY, items.slice(0, safeLimit));
}

export async function appendChatActionHistory(
  item: {
    provider?: ChatActionProvider;
    direction: "in" | "out";
    action?: ChatActionType;
    status: ChatActionHistoryStatus;
    senderId?: string;
    chatId?: string;
    messageId?: string;
    content?: string;
    resultSummary?: string;
  },
  limit: number,
): Promise<ChatActionHistoryItem> {
  const next: ChatActionHistoryItem = {
    id: createId("chat-action-history"),
    provider: item.provider ?? "feishu",
    direction: item.direction,
    action: item.action,
    status: item.status,
    senderIdMasked: maskChatActionId(item.senderId),
    chatIdMasked: maskChatActionId(item.chatId),
    messageId: item.messageId,
    contentPreview: previewChatActionContent(item.content),
    resultSummary: previewChatActionContent(item.resultSummary, 120),
    createdAt: Date.now(),
  };
  const existing = await loadChatActionHistory();
  await saveChatActionHistory([next, ...existing], limit);
  window.dispatchEvent(new CustomEvent("chat-action-bridge-history-changed"));
  return next;
}

function pruneProcessedMessages(now: number): void {
  for (const [key, createdAt] of processedMessages.entries()) {
    if (now - createdAt > CHAT_ACTION_BRIDGE_PROCESSED_TTL_MS) {
      processedMessages.delete(key);
    }
  }
}

export function isChatActionMessageProcessed(provider: ChatActionProvider, messageId: string): boolean {
  if (!messageId) return false;
  const now = Date.now();
  pruneProcessedMessages(now);
  return processedMessages.has(`${provider}:message:${messageId}`);
}

export function markChatActionMessageProcessed(provider: ChatActionProvider, messageId: string): void {
  if (!messageId) return;
  const now = Date.now();
  pruneProcessedMessages(now);
  processedMessages.set(`${provider}:message:${messageId}`, now);
  void saveProcessedMessages();
}

export function clearChatActionProcessedMessages(): void {
  processedMessages.clear();
  void getPlugin().saveData(PROCESSED_STORE_KEY, []);
}

async function saveProcessedMessages(): Promise<void> {
  const now = Date.now();
  pruneProcessedMessages(now);
  const entries: Array<{ key: string; timestamp: number }> = [];
  for (const [key, timestamp] of processedMessages.entries()) {
    entries.push({ key, timestamp });
  }
  await getPlugin().saveData(PROCESSED_STORE_KEY, entries);
}

async function loadProcessedMessages(): Promise<void> {
  try {
    const raw = await getPlugin().loadData(PROCESSED_STORE_KEY);
    if (Array.isArray(raw)) {
      const now = Date.now();
      for (const entry of raw) {
        if (entry && typeof entry.key === "string" && typeof entry.timestamp === "number") {
          if (now - entry.timestamp > CHAT_ACTION_BRIDGE_PROCESSED_TTL_MS) continue;
          if (!processedMessages.has(entry.key)) {
            processedMessages.set(entry.key, entry.timestamp);
          }
        }
      }
    }
  } catch { /* ignore read errors */ }
}

export async function clearChatActionHistory(): Promise<void> {
  await getPlugin().saveData(CHAT_ACTION_BRIDGE_HISTORY_KEY, []);
  window.dispatchEvent(new CustomEvent("chat-action-bridge-history-changed"));
}

