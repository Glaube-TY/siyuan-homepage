/**
 * Chat session store.
 * 设计：index.json + sessions/*.json 分文件保存。
 */

import type { ChatSessionIndex, ChatSessionIndexEntry, ChatSessionData } from "./chat-session-types";
import {
  NOTEBRAIN_CHAT_INDEX_KEY,
  toSessionKey,
  isValidStorageId,
} from "./notebrain-storage-keys";
import { saveData, loadData, removeData } from "./notebrain-plugin-storage";

export async function loadChatSessionIndex(): Promise<ChatSessionIndex | null> {
  const data = await loadData<ChatSessionIndex>(NOTEBRAIN_CHAT_INDEX_KEY);
  if (data && data.version === 1) {
    return data;
  }
  return null;
}

export async function saveChatSessionIndex(index: ChatSessionIndex): Promise<void> {
  await saveData(NOTEBRAIN_CHAT_INDEX_KEY, index);
}

export async function loadChatSession(sessionId: string): Promise<ChatSessionData | null> {
  if (!isValidStorageId(sessionId)) return null;
  const key = toSessionKey(sessionId);
  const data = await loadData<ChatSessionData>(key);
  if (data && data.version === 1) {
    return data;
  }
  return null;
}

export async function saveChatSession(session: ChatSessionData): Promise<void> {
  if (!isValidStorageId(session.id)) {
    throw new Error(`[ChatSessionStore] Invalid session id: ${session.id}`);
  }
  const key = toSessionKey(session.id);
  await saveData(key, session);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  if (!isValidStorageId(sessionId)) return;
  const key = toSessionKey(sessionId);
  await removeData(key);
}

export function createSessionIndexEntry(
  session: ChatSessionData,
  lastMessagePreview: string,
): ChatSessionIndexEntry {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    lastMessagePreview: lastMessagePreview.slice(0, 100),
  };
}
