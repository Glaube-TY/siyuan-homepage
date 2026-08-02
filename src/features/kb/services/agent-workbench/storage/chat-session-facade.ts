/**
 * Chat session facade.
 *
 * 所有会话变更都在统一事务队列中执行：会话文件先写，索引最后写，且写后回读验证。
 * 本地快照缺少某个会话不代表删除；删除只能通过 explicitDeletedSessionIds 表达。
 */

import type {
  ChatSessionData,
  ChatSessionIndex,
  ChatSessionTombstone,
} from "./chat-session-types";
import type { KbConversationSession } from "../../../types/chat";
import {
  fromPersistedConversation,
  toPersistedConversation,
  type PersistedConversation,
} from "../../session/kb-chat-session-storage";
export { isTransientAssistantPlaceholder } from "../../session/kb-chat-session-storage";
import {
  loadChatSessionIndex,
  loadChatSessionIndexStrict,
  saveChatSessionIndex,
  saveAndVerifyChatSessionIndex,
  loadChatSession,
  loadChatSessionStrict,
  saveChatSession,
  saveAndVerifyChatSession,
  deleteChatSession,
  createSessionIndexEntry,
} from "./chat-session-store";
import { enqueueStorageWrite, flushStorageWrites } from "./storage-write-queue";

type StorageBackedConversation = KbConversationSession & { storageRevision?: number };

export interface ChatStorageSnapshot {
  activeConversationId: string;
  conversations: KbConversationSession[];
  selectedMode?: string;
}

export interface ChatStorageConflict {
  sourceSessionId: string;
  conflictSessionId: string;
}

export interface ChatStorageSaveResult extends ChatStorageSnapshot {
  success: boolean;
  conflicts: ChatStorageConflict[];
  deletedSessionIds: string[];
  errors: string[];
}

function revisionOf(value: { revision?: number } | null | undefined): number {
  return Number.isSafeInteger(value?.revision) && (value?.revision ?? 0) >= 0
    ? value!.revision!
    : 0;
}

function createLastMessagePreview(messages: ChatSessionData["messages"]): string {
  const last = [...messages].reverse().find((message) => {
    return typeof message.content === "string" && message.content.trim().length > 0;
  });
  return typeof last?.content === "string" ? last.content.trim() : "";
}

function toSessionData(conv: KbConversationSession): ChatSessionData {
  const persisted = toPersistedConversation(conv);
  return {
    version: 1,
    id: persisted.id,
    title: persisted.title,
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
    messages: persisted.messages as ChatSessionData["messages"],
    stageSummaries: persisted.stageSummaries,
    compressionState: persisted.compressionState,
    compressedContextSummary: persisted.compressedContextSummary,
    thinkingMode: persisted.thinkingMode,
    webAccessMode: persisted.webAccessMode,
    agentSession: persisted.agentSession,
  };
}

function fromSessionData(data: ChatSessionData): KbConversationSession {
  const conversation = fromPersistedConversation(data as PersistedConversation) as StorageBackedConversation;
  conversation.storageRevision = revisionOf(data);
  return conversation;
}

function sameKnownSessionPayload(remote: ChatSessionData, local: ChatSessionData): boolean {
  for (const key of Object.keys(local)) {
    if (key === "revision") continue;
    if (JSON.stringify(remote[key]) !== JSON.stringify(local[key])) return false;
  }
  return true;
}

function createConflictId(sourceId: string): string {
  const safePrefix = sourceId.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, "-");
  return `conflict-${safePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createOperationId(): string {
  return `delete-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeTombstones(
  existing: readonly ChatSessionTombstone[],
  deletedSessionIds: readonly string[],
): ChatSessionTombstone[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const now = Date.now();
  for (const id of deletedSessionIds) {
    if (!byId.has(id)) {
      byId.set(id, { id, deletedAt: now, operationId: createOperationId() });
    }
  }
  return [...byId.values()];
}

function emptyIndex(): ChatSessionIndex {
  return { version: 1, activeSessionId: "", sessions: [], revision: 0, deletedSessions: [] };
}

async function readIndexForWrite(): Promise<ChatSessionIndex> {
  const result = await loadChatSessionIndexStrict();
  if (result.status === "missing") return emptyIndex();
  if (result.status !== "ok") {
    throw new Error(result.status === "invalid" ? result.error : `读取会话索引失败：${result.error}`);
  }
  return result.data;
}

async function loadSnapshotFromIndex(index: ChatSessionIndex): Promise<ChatStorageSnapshot> {
  const tombstoned = new Set((index.deletedSessions ?? []).map((item) => item.id));
  const conversations: KbConversationSession[] = [];
  for (const entry of index.sessions) {
    if (tombstoned.has(entry.id)) continue;
    const session = await loadChatSessionStrict(entry.id);
    if (session.status !== "ok") continue;
    conversations.push(fromSessionData(session.data));
  }
  const activeConversationId = conversations.some((item) => item.id === index.activeSessionId)
    ? index.activeSessionId
    : conversations[0]?.id ?? "";
  return { activeConversationId, conversations, selectedMode: index.selectedMode };
}

export async function restoreKbChatSessions(): Promise<ChatStorageSnapshot | null> {
  const result = await loadChatSessionIndexStrict();
  if (result.status === "missing") return null;
  if (result.status !== "ok") {
    throw new Error(result.status === "invalid" ? result.error : `读取会话索引失败：${result.error}`);
  }
  const snapshot = await loadSnapshotFromIndex(result.data);
  return snapshot.conversations.length > 0 ? snapshot : null;
}

export async function saveKbChatSessionStorage(payload: {
  activeConversationId: string;
  conversations: KbConversationSession[];
  selectedMode?: string;
  explicitDeletedSessionIds?: string[];
}): Promise<ChatStorageSaveResult> {
  return enqueueStorageWrite("chat-session-transaction", async () => {
    const conflicts: ChatStorageConflict[] = [];
    const errors: string[] = [];
    try {
      const previousIndex = await readIndexForWrite();
      const explicitDeletes = [...new Set(payload.explicitDeletedSessionIds ?? [])];
      const tombstones = mergeTombstones(previousIndex.deletedSessions ?? [], explicitDeletes);
      const deletedIds = new Set(tombstones.map((item) => item.id));
      const entries = new Map(previousIndex.sessions.map((entry) => [entry.id, entry]));
      for (const id of deletedIds) entries.delete(id);

      let activeSessionId = payload.activeConversationId;
      const pendingWrites: ChatSessionData[] = [];

      for (const conv of payload.conversations) {
        if (deletedIds.has(conv.id)) continue;
        const local = toSessionData(conv);
        const latest = await loadChatSessionStrict(conv.id);
        if (latest.status === "error" || latest.status === "invalid") {
          throw new Error(latest.status === "invalid" ? latest.error : `读取会话 ${conv.id} 失败：${latest.error}`);
        }

        const storedRevision = (conv as StorageBackedConversation).storageRevision;
        const baseRevision = Number.isSafeInteger(storedRevision) && (storedRevision ?? 0) >= 0
          ? storedRevision!
          : 0;
        if (latest.status === "missing") {
          const next = { ...local, revision: 1 };
          pendingWrites.push(next);
          entries.set(next.id, createSessionIndexEntry(
            next,
            createLastMessagePreview(next.messages),
            entries.get(next.id),
          ));
          continue;
        }

        const remote = latest.data;
        const remoteRevision = revisionOf(remote);
        if (sameKnownSessionPayload(remote, local)) {
          entries.set(remote.id, createSessionIndexEntry(
            remote,
            createLastMessagePreview(remote.messages),
            entries.get(remote.id),
          ));
          continue;
        }

        if (baseRevision === remoteRevision) {
          const next = { ...remote, ...local, revision: remoteRevision + 1 };
          pendingWrites.push(next);
          entries.set(next.id, createSessionIndexEntry(
            next,
            createLastMessagePreview(next.messages),
            entries.get(next.id),
          ));
          continue;
        }

        const conflictSessionId = createConflictId(conv.id);
        const conflictCreatedAt = Date.now();
        const conflict = {
          ...local,
          id: conflictSessionId,
          title: `${local.title}（冲突副本）`,
          updatedAt: conflictCreatedAt,
          revision: 1,
          conflictOfSessionId: conv.id,
          conflictCreatedAt,
        } satisfies ChatSessionData;
        pendingWrites.push(conflict);
        entries.set(remote.id, createSessionIndexEntry(
          remote,
          createLastMessagePreview(remote.messages),
          entries.get(remote.id),
        ));
        entries.set(conflict.id, createSessionIndexEntry(conflict, createLastMessagePreview(conflict.messages)));
        conflicts.push({ sourceSessionId: conv.id, conflictSessionId });
        if (activeSessionId === conv.id) activeSessionId = conflictSessionId;
      }

      // 会话文件必须全部成功并通过回读验证，才能提交索引。
      for (const session of pendingWrites) {
        await enqueueStorageWrite(`chat-session:${session.id}`, () => saveAndVerifyChatSession(session));
      }

      const sessionEntries = [...entries.values()];
      if (!sessionEntries.some((entry) => entry.id === activeSessionId)) {
        activeSessionId = previousIndex.activeSessionId;
      }
      if (!sessionEntries.some((entry) => entry.id === activeSessionId)) {
        activeSessionId = sessionEntries[0]?.id ?? "";
      }

      const nextIndex: ChatSessionIndex = {
        ...previousIndex,
        version: 1,
        activeSessionId,
        sessions: sessionEntries,
        selectedMode: payload.selectedMode ?? previousIndex.selectedMode,
        revision: revisionOf(previousIndex) + 1,
        deletedSessions: tombstones,
      };
      await saveAndVerifyChatSessionIndex(nextIndex);

      const snapshot = await loadSnapshotFromIndex(nextIndex);
      return {
        ...snapshot,
        success: true,
        conflicts,
        deletedSessionIds: explicitDeletes,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        activeConversationId: payload.activeConversationId,
        conversations: payload.conversations,
        selectedMode: payload.selectedMode,
        success: false,
        conflicts,
        deletedSessionIds: [],
        errors,
      };
    }
  });
}

export { flushStorageWrites };

export {
  loadChatSessionIndex,
  saveChatSessionIndex,
  loadChatSession,
  saveChatSession,
  deleteChatSession,
  createSessionIndexEntry,
};
