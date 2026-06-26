import type { ChatActionMenuItem, ChatActionPendingSession, ChatActionProvider } from "./types";

const sessions = new Map<string, ChatActionPendingSession>();

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getChatActionSessionKey(provider: ChatActionProvider, chatId: string, senderId: string): string {
  return `${provider}:${chatId}:${senderId}`;
}

export function createChatActionPendingSession(params: {
  provider: ChatActionProvider;
  chatId: string;
  senderId: string;
  messageId: string;
  content: string;
  menuType: ChatActionPendingSession["menuType"];
  actions: ChatActionMenuItem[];
  ttlMs: number;
}): ChatActionPendingSession {
  const now = Date.now();
  const session: ChatActionPendingSession = {
    id: createId(),
    provider: params.provider,
    chatId: params.chatId,
    senderId: params.senderId,
    messageId: params.messageId,
    content: params.content,
    menuType: params.menuType,
    actions: params.actions,
    createdAt: now,
    expiresAt: now + params.ttlMs,
  };
  sessions.set(getChatActionSessionKey(params.provider, params.chatId, params.senderId), session);
  return session;
}

export function getChatActionPendingSession(
  provider: ChatActionProvider,
  chatId: string,
  senderId: string,
): ChatActionPendingSession | null {
  const key = getChatActionSessionKey(provider, chatId, senderId);
  const session = sessions.get(key);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(key);
    return null;
  }
  return session;
}

export function hasExpiredChatActionSession(provider: ChatActionProvider, chatId: string, senderId: string): boolean {
  const key = getChatActionSessionKey(provider, chatId, senderId);
  const session = sessions.get(key);
  if (!session) return false;
  if (Date.now() <= session.expiresAt) return false;
  sessions.delete(key);
  return true;
}

export function clearChatActionPendingSession(provider: ChatActionProvider, chatId: string, senderId: string): void {
  sessions.delete(getChatActionSessionKey(provider, chatId, senderId));
}

export function clearAllChatActionSessions(): void {
  sessions.clear();
}

