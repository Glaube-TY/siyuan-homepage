/**
 * Chat session facade.
 *
 * Storage layer only handles session read/write. It does not choose tools,
 * inspect answer content for flow control, or decide Agent behavior.
 */

import type { ChatSessionIndex, ChatSessionIndexEntry, ChatSessionData } from "./chat-session-types";
import type { KbConversationSession } from "../../../types/chat";
import {
  fromPersistedConversation,
  toPersistedConversation,
  type PersistedConversation,
} from "../../session/kb-chat-session-storage";
export { isTransientAssistantPlaceholder } from "../../session/kb-chat-session-storage";
import {
  loadChatSessionIndex,
  saveChatSessionIndex,
  loadChatSession,
  saveChatSession,
  deleteChatSession,
  createSessionIndexEntry,
} from "./chat-session-store";

export interface ChatStorageSnapshot {
  activeConversationId: string;
  conversations: KbConversationSession[];
  selectedMode?: string;
}

function createLastMessagePreview(messages: ChatSessionData["messages"]): string {
  const last = [...messages].reverse().find((message) => {
    return typeof message.content === "string" && message.content.trim().length > 0;
  });
  return typeof last?.content === "string" ? last.content.trim() : "";
}

export async function restoreKbChatSessions(): Promise<ChatStorageSnapshot | null> {
  const index = await loadChatSessionIndex();
  if (!index || index.sessions.length === 0) return null;

  const conversations: KbConversationSession[] = [];

  for (const entry of index.sessions) {
    const session = await loadChatSession(entry.id);
    if (session) {
      conversations.push(fromPersistedConversation(session as PersistedConversation));
    }
  }

  return {
    activeConversationId: index.activeSessionId || (conversations.length > 0 ? conversations[0].id : ""),
    selectedMode: index.selectedMode,
    conversations,
  };
}

export async function saveKbChatSessionStorage(payload: {
  activeConversationId: string;
  conversations: KbConversationSession[];
  selectedMode?: string;
}): Promise<void> {
  const previousIndex = await loadChatSessionIndex();
  const nextSessionIds = new Set(payload.conversations.map((conv) => conv.id));
  const sessions: ChatSessionIndexEntry[] = [];

  for (const conv of payload.conversations) {
    const persisted = toPersistedConversation(conv);
    const sessionData: ChatSessionData = {
      version: 1,
      id: persisted.id,
      title: persisted.title,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      messages: persisted.messages as ChatSessionData["messages"],
      stageSummaries: persisted.stageSummaries,
      compressionState: persisted.compressionState,
      compressedContextSummary: persisted.compressedContextSummary,
      agentSession: persisted.agentSession,
    };

    await saveChatSession(sessionData);

    sessions.push(createSessionIndexEntry(sessionData, createLastMessagePreview(sessionData.messages)));
  }

  for (const entry of previousIndex?.sessions ?? []) {
    if (!nextSessionIds.has(entry.id)) {
      await deleteChatSession(entry.id);
    }
  }

  const index: ChatSessionIndex = {
    version: 1,
    activeSessionId: payload.activeConversationId,
    sessions,
    selectedMode: payload.selectedMode,
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
