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
import { saveData, loadData, loadDataStrict, removeData, type StorageReadResult } from "./notebrain-plugin-storage";

export type ValidatedStorageRead<T> = StorageReadResult<T> | { status: "invalid"; error: string };
/** SiYuan Plugin.loadData() returns an empty string for a file that does not exist yet. */
function isMissingPluginFileValue(value: unknown): boolean {
  return value === "";
}


export async function loadChatSessionIndexStrict(): Promise<ValidatedStorageRead<ChatSessionIndex>> {
  const result = await loadDataStrict<ChatSessionIndex>(NOTEBRAIN_CHAT_INDEX_KEY);
  if (result.status !== "ok") return result;
  if (isMissingPluginFileValue(result.data)) return { status: "missing" };
  const data = result.data;
  if (!data || data.version !== 1 || !Array.isArray(data.sessions)) {
    return { status: "invalid", error: "会话索引 JSON 结构无效。" };
  }
  return result;
}

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

export async function saveAndVerifyChatSessionIndex(index: ChatSessionIndex): Promise<void> {
  await saveChatSessionIndex(index);
  const verified = await loadChatSessionIndexStrict();
  if (verified.status !== "ok" || JSON.stringify(verified.data) !== JSON.stringify(index)) {
    throw new Error("会话索引写后验证失败。");
  }
}

export async function loadChatSession(sessionId: string): Promise<ChatSessionData | null> {
  if (!isValidStorageId(sessionId)) return null;
  const key = toSessionKey(sessionId);
  const data = await loadData<ChatSessionData>(key);
  if (data && data.version === 1 && data.schemaVersion === 3) {
    return data;
  }
  return null;
}

/** Read without applying the current schema validator; used only by archive parsing. */
export async function loadChatSessionRaw(sessionId: string): Promise<StorageReadResult<unknown>> {
  if (!isValidStorageId(sessionId)) return { status: "error", error: "会话 ID 无效。" };
  return loadDataStrict<unknown>(toSessionKey(sessionId));
}

export async function loadChatSessionStrict(sessionId: string): Promise<ValidatedStorageRead<ChatSessionData>> {
  if (!isValidStorageId(sessionId)) return { status: "invalid", error: "会话 ID 无效。" };
  const result = await loadDataStrict<ChatSessionData>(toSessionKey(sessionId));
  if (result.status !== "ok") return result;
  if (isMissingPluginFileValue(result.data)) return { status: "missing" };
  const data = result.data;
  if (!data || data.version !== 1 || data.schemaVersion !== 3 || data.id !== sessionId || !Array.isArray(data.messages)) {
    return { status: "invalid", error: `会话 ${sessionId} JSON 结构无效。` };
  }
  return result;
}

export async function saveChatSession(session: ChatSessionData): Promise<void> {
  if (!isValidStorageId(session.id)) {
    throw new Error(`[ChatSessionStore] Invalid session id: ${session.id}`);
  }
  const key = toSessionKey(session.id);
  await saveData(key, session);
}

export async function saveAndVerifyChatSession(session: ChatSessionData): Promise<void> {
  await saveChatSession(session);
  const verified = await loadChatSessionStrict(session.id);
  if (verified.status !== "ok" || JSON.stringify(verified.data) !== JSON.stringify(session)) {
    throw new Error(`会话 ${session.id} 写后验证失败。`);
  }
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  if (!isValidStorageId(sessionId)) return;
  const key = toSessionKey(sessionId);
  await removeData(key);
}

export function createSessionIndexEntry(
  session: ChatSessionData,
  lastMessagePreview: string,
  previousEntry?: ChatSessionIndexEntry,
): ChatSessionIndexEntry {
  return {
    ...previousEntry,
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    lastMessagePreview: lastMessagePreview.slice(0, 100),
    revision: session.revision ?? 0,
  };
}
