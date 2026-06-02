/**
 * Legacy chat session facade
 *
 * Compatibility layer from legacy single-file storage to index + sessions storage.
 * Only for existing UI store transition. New code should use chat-session-store directly.
 *
 * Legacy behavior: reads all sessions into memory at once.
 * New behavior: load index.json at startup, load individual session files on demand.
 *
 * Constraints:
 * - Storage layer only handles data read/write.
 * - Storage layer cannot automatically choose business tools based on content.
 * - Don't manually concatenate absolute paths.
 * - Don't use Node fs/path.
 */

import type { ChatSessionIndex, ChatSessionIndexEntry, ChatSessionData } from "./chat-session-types";
import {
  loadChatSessionIndex,
  saveChatSessionIndex,
  loadChatSession,
  saveChatSession,
  deleteChatSession,
  createSessionIndexEntry,
} from "./chat-session-store";

export interface LegacyKbConversationSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: unknown[];
  [key: string]: unknown;
}

export interface LegacyChatStorage {
  activeConversationId: string;
  conversations: LegacyKbConversationSession[];
  selectedMode?: string;
}

export async function restoreKbChatSessionsLegacy(): Promise<LegacyChatStorage | null> {
  const index = await loadChatSessionIndex();
  if (!index || index.sessions.length === 0) return null;

  const conversations: LegacyKbConversationSession[] = [];

  for (const entry of index.sessions) {
    const session = await loadChatSession(entry.id);
    if (session) {
      conversations.push({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messages,
      });
    }
  }

  return {
    activeConversationId: index.activeSessionId || (conversations.length > 0 ? conversations[0].id : ""),
    conversations,
  };
}

export async function saveKbChatSessionStorageLegacy(payload: {
  activeConversationId: string;
  conversations: LegacyKbConversationSession[];
  selectedMode?: string;
}): Promise<void> {
  const sessions: ChatSessionIndexEntry[] = [];

  for (const conv of payload.conversations) {
    const sessionData: ChatSessionData = {
      version: 1,
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: conv.messages as ChatSessionData["messages"],
    };

    await saveChatSession(sessionData);

    sessions.push(createSessionIndexEntry(sessionData, ""));
  }

  const index: ChatSessionIndex = {
    version: 1,
    activeSessionId: payload.activeConversationId,
    sessions,
  };

  await saveChatSessionIndex(index);
}

export {
  loadChatSessionIndex,
  saveChatSessionIndex,
  loadChatSession,
  saveChatSession,
  deleteChatSession,
  createSessionIndexEntry,
};
