import type { RobotKernelHost } from "./kernel-host";
import type { RobotSessionKey, RobotSessionState } from "../features/robot-assistant/contracts/robot-session";
import type { RobotConfirmation } from "../features/robot-assistant/contracts/robot-confirmation";
import type { RobotHistoryItem } from "../features/robot-assistant/contracts/robot-history";
import type { RobotPairingCaptureState } from "../features/robot-assistant/contracts/robot-pairing";

function kvKey(prefix: string, key: string): string {
  return `${prefix}${key.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
}

/** Kernel session store：按 provider/account/chat/sender key 存 JSON。 */
export class KernelRobotSessionStore {
  private static readonly LEGACY_INDEX_KEY = "robot-session-index-v1";
  private static readonly INDEX_KEY = "robot-conversation-index-v2";
  private static readonly BINDINGS_KEY = "robot-conversation-bindings-v2";
  private mutationQueue: Promise<void> = Promise.resolve();
  private migrationPromise: Promise<void> | null = null;

  constructor(private readonly host: RobotKernelHost) {}

  private legacyKeyOf(sessionKey: RobotSessionKey): string {
    return kvKey("robot-session-", `${sessionKey.provider}_${sessionKey.accountId}_${sessionKey.chatId}_${sessionKey.senderId ?? "_"}`);
  }

  private conversationKey(conversationId: string): string {
    return kvKey("robot-conversation-", conversationId);
  }

  private routeKey(sessionKey: RobotSessionKey): string {
    return JSON.stringify({
      provider: sessionKey.provider,
      accountId: sessionKey.accountId,
      chatId: sessionKey.chatId,
      ...(sessionKey.senderId ? { senderId: sessionKey.senderId } : {}),
    });
  }

  async get(sessionKey: RobotSessionKey): Promise<RobotSessionState | null> {
    await this.ensureMigrated();
    const bindings = await this.readBindings();
    const conversationId = bindings[this.routeKey(sessionKey)];
    if (!conversationId) return null;
    const state = await this.readConversation(conversationId);
    return state && this.routeKey(state.key) === this.routeKey(sessionKey) ? state : null;
  }

  async put(state: RobotSessionState): Promise<void> {
    await this.ensureMigrated();
    await this.enqueueMutation(async () => {
      await this.host.storage.set(this.conversationKey(state.conversationId), JSON.stringify(state));
      const ids = await this.readIndex();
      if (!ids.includes(state.conversationId)) {
        await this.host.storage.set(KernelRobotSessionStore.INDEX_KEY, JSON.stringify([...ids, state.conversationId]));
      }
      const bindings = await this.readBindings();
      const route = this.routeKey(state.key);
      if (!bindings[route]) {
        bindings[route] = state.conversationId;
        await this.writeBindings(bindings);
      }
    });
  }

  async create(state: RobotSessionState): Promise<void> {
    await this.ensureMigrated();
    await this.enqueueMutation(async () => {
      await this.host.storage.set(this.conversationKey(state.conversationId), JSON.stringify(state));
      const ids = await this.readIndex();
      if (!ids.includes(state.conversationId)) {
        await this.host.storage.set(KernelRobotSessionStore.INDEX_KEY, JSON.stringify([...ids, state.conversationId]));
      }
      const bindings = await this.readBindings();
      bindings[this.routeKey(state.key)] = state.conversationId;
      await this.writeBindings(bindings);
    });
  }

  async activate(sessionKey: RobotSessionKey, conversationId: string): Promise<boolean> {
    await this.ensureMigrated();
    const state = await this.readConversation(conversationId);
    if (!state || this.routeKey(state.key) !== this.routeKey(sessionKey)) return false;
    await this.enqueueMutation(async () => {
      const bindings = await this.readBindings();
      bindings[this.routeKey(sessionKey)] = conversationId;
      await this.writeBindings(bindings);
    });
    return true;
  }

  async rename(conversationId: string, title: string): Promise<boolean> {
    await this.ensureMigrated();
    const state = await this.readConversation(conversationId);
    if (!state) return false;
    await this.enqueueMutation(() => this.host.storage.set(
      this.conversationKey(conversationId),
      JSON.stringify({ ...state, title: title.trim().slice(0, 80) || "新对话" }),
    ));
    return true;
  }

  async delete(conversationId: string): Promise<boolean> {
    await this.ensureMigrated();
    const state = await this.readConversation(conversationId);
    if (!state) return false;
    await this.enqueueMutation(async () => {
      await this.host.storage.remove(this.conversationKey(conversationId));
      const remainingIds = (await this.readIndex()).filter((id) => id !== conversationId);
      await this.host.storage.set(KernelRobotSessionStore.INDEX_KEY, JSON.stringify(remainingIds));
      const bindings = await this.readBindings();
      const route = this.routeKey(state.key);
      if (bindings[route] === conversationId) {
        const candidates: RobotSessionState[] = [];
        for (const id of remainingIds) {
          const candidate = await this.readConversation(id);
          if (candidate && this.routeKey(candidate.key) === route) candidates.push(candidate);
        }
        candidates.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
        if (candidates[0]) bindings[route] = candidates[0].conversationId;
        else delete bindings[route];
        await this.writeBindings(bindings);
      }
    });
    return true;
  }

  async reset(sessionKey: RobotSessionKey): Promise<void> {
    await this.ensureMigrated();
    const route = this.routeKey(sessionKey);
    await this.enqueueMutation(async () => {
      const ids = await this.readIndex();
      const keep: string[] = [];
      for (const id of ids) {
        const state = await this.readConversation(id);
        if (state && this.routeKey(state.key) === route) await this.host.storage.remove(this.conversationKey(id));
        else keep.push(id);
      }
      await this.host.storage.set(KernelRobotSessionStore.INDEX_KEY, JSON.stringify(keep));
      const bindings = await this.readBindings();
      delete bindings[route];
      await this.writeBindings(bindings);
    });
  }

  async list(): Promise<RobotSessionState[]> {
    await this.ensureMigrated();
    const ids = await this.readIndex();
    const states: RobotSessionState[] = [];
    for (const id of ids) {
      const state = await this.readConversation(id);
      if (state) states.push(state);
    }
    return states.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  async activeConversationIds(): Promise<Record<string, string>> {
    await this.ensureMigrated();
    return this.readBindings();
  }

  private async readConversation(conversationId: string): Promise<RobotSessionState | null> {
    const raw = await this.host.storage.get(this.conversationKey(conversationId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const state = parsed as RobotSessionState;
      return {
        ...state,
        title: typeof state.title === "string" && state.title.trim()
          ? state.title
          : this.deriveTitle(state.recentMessages),
        agentMessages: Array.isArray(state.agentMessages) ? state.agentMessages : [],
      };
    } catch {
      return null;
    }
  }

  private async readIndex(): Promise<string[]> {
    const raw = await this.host.storage.get(KernelRobotSessionStore.INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  }

  private async readBindings(): Promise<Record<string, string>> {
    const raw = await this.host.storage.get(KernelRobotSessionStore.BINDINGS_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch {
      return {};
    }
  }

  private writeBindings(bindings: Record<string, string>): Promise<void> {
    return this.host.storage.set(KernelRobotSessionStore.BINDINGS_KEY, JSON.stringify(bindings));
  }

  private enqueueMutation(task: () => Promise<void>): Promise<void> {
    const next = this.mutationQueue.catch(() => undefined).then(task);
    this.mutationQueue = next;
    return next;
  }

  private ensureMigrated(): Promise<void> {
    if (this.migrationPromise) return this.migrationPromise;
    this.migrationPromise = this.enqueueMutation(async () => {
      const legacyRaw = await this.host.storage.get(KernelRobotSessionStore.LEGACY_INDEX_KEY);
      if (!legacyRaw) return;
      let serializedKeys: string[] = [];
      try {
        const parsed = JSON.parse(legacyRaw) as unknown;
        if (Array.isArray(parsed)) serializedKeys = parsed.filter((value): value is string => typeof value === "string");
      } catch {
        return;
      }
      const ids = await this.readIndex();
      const bindings = await this.readBindings();
      let changed = false;
      for (const serialized of serializedKeys) {
        try {
          const key = JSON.parse(serialized) as RobotSessionKey;
          const raw = await this.host.storage.get(this.legacyKeyOf(key));
          if (!raw) continue;
          const legacy = JSON.parse(raw) as RobotSessionState;
          if (!legacy?.conversationId) continue;
          const migrated: RobotSessionState = {
            ...legacy,
            key,
            title: typeof legacy.title === "string" && legacy.title.trim()
              ? legacy.title
              : this.deriveTitle(legacy.recentMessages),
            agentMessages: Array.isArray(legacy.agentMessages) ? legacy.agentMessages : [],
          };
          await this.host.storage.set(this.conversationKey(migrated.conversationId), JSON.stringify(migrated));
          if (!ids.includes(migrated.conversationId)) ids.push(migrated.conversationId);
          const route = this.routeKey(key);
          if (!bindings[route]) bindings[route] = migrated.conversationId;
          changed = true;
        } catch {
          // 忽略单个损坏的旧会话，不影响其他会话迁移。
        }
      }
      if (changed) {
        await this.host.storage.set(KernelRobotSessionStore.INDEX_KEY, JSON.stringify(ids));
        await this.writeBindings(bindings);
        // v2 会话与绑定均已落盘后再清理旧索引/文件，避免下次启动用旧快照覆盖新对话。
        for (const serialized of serializedKeys) {
          try {
            const key = JSON.parse(serialized) as RobotSessionKey;
            await this.host.storage.remove(this.legacyKeyOf(key));
          } catch {
            // 损坏的旧索引项没有可解析路径，只清空索引即可。
          }
        }
        await this.host.storage.set(KernelRobotSessionStore.LEGACY_INDEX_KEY, "[]");
      }
    });
    return this.migrationPromise;
  }

  private deriveTitle(messages: RobotSessionState["recentMessages"]): string {
    const firstUser = Array.isArray(messages) ? messages.find((message) => message.role === "user")?.content : "";
    return firstUser?.trim().slice(0, 32) || "远程对话";
  }
}

/** Kernel confirmation store：confirmationId -> JSON。 */
export class KernelRobotConfirmationStore {
  private static readonly INDEX_KEY = "robot-confirmation-index-v1";
  private indexQueue: Promise<void> = Promise.resolve();

  constructor(private readonly host: RobotKernelHost) {}

  async get(confirmationId: string): Promise<RobotConfirmation | null> {
    const raw = await this.host.storage.get(kvKey("robot-confirmation-", confirmationId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? parsed as RobotConfirmation : null;
    } catch {
      return null;
    }
  }

  async put(confirmation: RobotConfirmation): Promise<void> {
    await this.host.storage.set(kvKey("robot-confirmation-", confirmation.confirmationId), JSON.stringify(confirmation));
    await this.updateIndex((ids) => ids.includes(confirmation.confirmationId) ? ids : [...ids, confirmation.confirmationId]);
  }

  async delete(confirmationId: string): Promise<void> {
    await this.host.storage.remove(kvKey("robot-confirmation-", confirmationId));
    await this.updateIndex((ids) => ids.filter((id) => id !== confirmationId));
  }

  async list(): Promise<RobotConfirmation[]> {
    const ids = await this.readIndex();
    const confirmations: RobotConfirmation[] = [];
    for (const id of ids) {
      const value = await this.get(id);
      if (value) confirmations.push(value);
    }
    return confirmations;
  }

  private async readIndex(): Promise<string[]> {
    const raw = await this.host.storage.get(KernelRobotConfirmationStore.INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  }

  private updateIndex(mutate: (ids: string[]) => string[]): Promise<void> {
    const task = this.indexQueue.catch(() => undefined).then(async () => {
      await this.host.storage.set(
        KernelRobotConfirmationStore.INDEX_KEY,
        JSON.stringify(mutate(await this.readIndex())),
      );
    });
    this.indexQueue = task;
    return task;
  }
}

/** Kernel history store：robot-history-v2 数组。 */
export class KernelRobotHistoryStore {
  private static readonly KEY = "robot-history-v2";
  private limit = 20;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly host: RobotKernelHost) {}

  setLimit(limit: number): void {
    this.limit = Math.max(1, Math.min(20, Math.round(limit)));
  }

  async prune(): Promise<void> {
    const task = this.writeQueue.catch(() => undefined).then(async () => {
      const items = await this.listAll();
      if (items.length > this.limit) {
        await this.host.storage.set(KernelRobotHistoryStore.KEY, JSON.stringify(items.slice(-this.limit)));
      }
    });
    this.writeQueue = task;
    await task;
  }

  async append(item: RobotHistoryItem): Promise<void> {
    const task = this.writeQueue.catch(() => undefined).then(async () => {
      const items = await this.listAll();
      items.push(item);
      await this.host.storage.set(KernelRobotHistoryStore.KEY, JSON.stringify(items.slice(-this.limit)));
    });
    this.writeQueue = task;
    await task;
  }

  async list(limit: number): Promise<RobotHistoryItem[]> {
    await this.writeQueue.catch(() => undefined);
    const items = await this.listAll();
    return items.slice(-limit);
  }

  async clear(): Promise<void> {
    const task = this.writeQueue.catch(() => undefined).then(() => (
      this.host.storage.set(KernelRobotHistoryStore.KEY, "[]")
    ));
    this.writeQueue = task;
    await task;
  }

  private async listAll(): Promise<RobotHistoryItem[]> {
    const raw = await this.host.storage.get(KernelRobotHistoryStore.KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed as RobotHistoryItem[] : [];
    } catch {
      return [];
    }
  }
}

/** Kernel pairing store：单一配对捕获状态（provider-independent，v1 迁移后通用服务）。 */
export class KernelRobotPairingStore {
  private static readonly KEY = "robot-pairing-v1";

  constructor(private readonly host: RobotKernelHost) {}

  async get(): Promise<RobotPairingCaptureState | null> {
    const raw = await this.host.storage.get(KernelRobotPairingStore.KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? parsed as RobotPairingCaptureState : null;
    } catch {
      return null;
    }
  }

  async put(state: RobotPairingCaptureState): Promise<void> {
    await this.host.storage.set(KernelRobotPairingStore.KEY, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    await this.host.storage.set(KernelRobotPairingStore.KEY, "");
  }
}
