import type { RobotSessionKey, RobotSessionState } from "../contracts/robot-session";
import type { RobotSessionStore } from "../contracts/robot-session";

export class RobotSessionService {
  constructor(private readonly store: RobotSessionStore) {}

  keyFromParts(parts: { provider: string; accountId: string; chatId: string; senderId?: string }): RobotSessionKey {
    return {
      provider: parts.provider as RobotSessionKey["provider"],
      accountId: parts.accountId,
      chatId: parts.chatId,
      ...(parts.senderId ? { senderId: parts.senderId } : {}),
    };
  }

  async load(key: RobotSessionKey, conversationId: string, ttlMs: number, now = Date.now()): Promise<RobotSessionState> {
    const existing = await this.store.get(key);
    if (existing) {
      return { ...existing, key };
    }
    // 远程对话与本地 Agent 对话一致：不会因为闲置时间自动丢失上下文。
    // ttlMs 仅作为旧设置兼容字段保留，显式“新会话”才切换上下文。
    void ttlMs;
    const created: RobotSessionState = {
      key,
      conversationId,
      title: "新对话",
      recentMessages: [],
      agentMessages: [],
      toolCallSummaries: [],
      lastActivityAt: now,
      createdAt: now,
    };
    await this.store.create(created);
    return created;
  }

  async save(state: RobotSessionState, now = Date.now()): Promise<void> {
    await this.store.put({ ...state, lastActivityAt: now });
  }

  async reset(key: RobotSessionKey): Promise<void> {
    await this.store.reset(key);
  }

  async create(key: RobotSessionKey, conversationId: string, title = "新对话", now = Date.now()): Promise<RobotSessionState> {
    const state: RobotSessionState = {
      key,
      conversationId,
      title: title.trim().slice(0, 80) || "新对话",
      recentMessages: [],
      agentMessages: [],
      toolCallSummaries: [],
      lastActivityAt: now,
      createdAt: now,
    };
    await this.store.create(state);
    return state;
  }

  activate(key: RobotSessionKey, conversationId: string): Promise<boolean> {
    return this.store.activate(key, conversationId);
  }

  rename(conversationId: string, title: string): Promise<boolean> {
    return this.store.rename(conversationId, title.trim().slice(0, 80) || "新对话");
  }

  delete(conversationId: string): Promise<boolean> {
    return this.store.delete(conversationId);
  }
}
