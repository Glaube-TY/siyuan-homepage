/**
 * KB Session Store
 * 知识库会话状态管理
 */

import { writable, get } from "svelte/store";
import type { KbSessionState } from "../types/session";
import type { ChatMessage, KbConversationSession } from "../types/chat";
import type { ChatMode } from "../constants/chat-modes";
import type { ChatModelSelection } from "../types/chat-model-selection";
import type { ThinkingMode, WebAccessMode } from "../types/session";
import {
  restoreKbChatSessions,
  saveKbChatSessionStorage,
  inspectKbChatSessionStorage,
  flushStorageWrites,
  type ChatStorageSaveResult,
  type ChatSessionReadIssue,
  isTransientAssistantPlaceholder,
} from "../services/agent-workbench/storage/chat-session-facade";
import type { ResolvedReferenceDocInfo } from "../services/session/reference-doc-resolver";
import { estimateContextUsage } from "../types/context-usage";
import { pushAgentDebugEvent } from "../services/agent-workbench/debug/workbench-debug";
import { executeCompression as doCompress } from "../services/context-compression";
import {
  clearTurnJournalAfterPersistence,
  readTurnJournal,
  readTurnJournalAsync,
  readLastKnownState,
  clearLastKnownState,
  type SafeWorkbenchEvent,
} from "../services/agent-workbench/runtime/in-flight-turn-journal";
import { inspectAgentRunResume } from "../services/agent-core/session/agent-run-checkpoint";
import type { AgentWorkbenchEvent } from "../services/agent-workbench";

/** 生成会话唯一 id */
function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 默认会话标题 */
const DEFAULT_CONVERSATION_TITLE = "新对话";

/** 截取字符串前 N 个字符 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

function getTurnDeleteTarget(messages: readonly ChatMessage[], assistantIndex: number): {
  startIndex: number;
} | null {
  let startIndex = -1;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return null;

  return { startIndex };
}

function restoreSafeWorkbenchEvent(
  event: SafeWorkbenchEvent,
  index: number,
  identity: { sessionId: string; runId: string; correlationId: string },
): AgentWorkbenchEvent | null {
  const base = {
    at: Date.now(),
    eventId: `${identity.runId}-recovery-${index}`,
    ...identity,
    stepIndex: event.stepIndex,
  };
  const toolCallId = `recovery-tool-${event.stepIndex ?? index}`;
  switch (event.type) {
    case "tool_start":
      return { ...base, type: "tool_start", toolCallId, toolName: event.toolName ?? "", argsPreview: event.argsPreview ?? {}, readOnly: false, startedAt: base.at };
    case "tool_result":
      return {
        ...base,
        type: "tool_result",
        toolCallId,
        toolName: event.toolName ?? "",
        result: { ok: event.ok === true, summary: event.outputSummary, errorCode: event.errorCode },
        durationMs: 0,
        argsPreview: event.argsPreview,
      } as AgentWorkbenchEvent;
    case "permission_required":
      return { ...base, type: "permission_required", toolCallId, preview: { toolName: event.toolName ?? "" } } as AgentWorkbenchEvent;
    case "permission_resolved":
      return { ...base, type: "permission_resolved", toolCallId, approved: event.ok === true };
    case "notice":
      return { ...base, type: "notice", message: event.message ?? "运行状态已恢复。" };
    case "error":
      return { ...base, type: "error", code: event.errorCode ?? "interrupted", message: event.message ?? "上次运行已中断。" };
    case "done":
      return { ...base, type: "done", status: event.status ?? "failed" };
    default:
      return null;
  }
}

function removeCompactedFlag<T extends ChatMessage>(message: T): T {
  if ((message.role !== "user" && message.role !== "assistant") || !message.compacted) {
    return message;
  }
  const next = { ...message } as T & { compacted?: boolean };
  delete next.compacted;
  return next as T;
}

// 初始状态
const initialState: KbSessionState = {
  error: "",
  asking: false,
  qaError: "",
  messages: [],
  stageSummaries: [],
  thinkingMode: "off",
  webAccessMode: "off",
  // selectedMode 初始 undefined，由组件决定默认值
};

/** 当前进行中的 AbortController（用于流式中断） */
let currentAbortController: AbortController | null = null;

// ==================== 持久化相关 ====================

/** 持久化 debounce 延迟（毫秒） */
const PERSIST_DEBOUNCE_DELAY = 800;

/** 获取并清理已有 AbortController */
export function getNewAbortController(): AbortController {
  // 如果存在正在运行的 controller，先 abort
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  return currentAbortController;
}

// 创建默认会话
function createDefaultConversation(): KbConversationSession {
  const now = Date.now();
  return {
    id: generateConversationId(),
    title: DEFAULT_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
    stageSummaries: [],
    thinkingMode: "off",
    webAccessMode: "off",
  };
}

// 创建 store
export function createKbSessionStore(options: { persistDebounceDelay?: number } = {}) {
  // 初始化一个默认会话
  const defaultConversation = createDefaultConversation();

  // 扩展状态，包含多会话管理
  const extendedInitialState = {
    ...initialState,
    // 将会话数据同步到 KbSessionState 的对应字段
    messages: defaultConversation.messages,
    stageSummaries: defaultConversation.stageSummaries ?? [],
  };

  const {
    subscribe,
    set: storeSet,
    update: storeUpdate,
  } = writable<KbSessionState & { conversations: KbConversationSession[]; activeConversationId: string }>({
    ...extendedInitialState,
    conversations: [defaultConversation],
    activeConversationId: defaultConversation.id,
  });

  // 扩展状态类型
  type ExtendedState = KbSessionState & { conversations: KbConversationSession[]; activeConversationId: string };

  /** 只记录本地业务状态变化；存储结果回写、hydrate 和运行时补全不递增。 */
  let localMutationVersion = 0;
  let storageApplicationVersion = 0;

  function update(updater: (state: ExtendedState) => ExtendedState): void {
    storeUpdate((state) => {
      const next = updater(state);
      if (next !== state) localMutationVersion += 1;
      return next;
    });
  }

  function set(state: ExtendedState): void {
    localMutationVersion += 1;
    storeSet(state);
  }

  // ==================== Context Usage Debounce ====================
  const CONTEXT_USAGE_DEBOUNCE_MS = 1500;
  let contextUsageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let contextUsageRequestSeq = 0;
  let lastContextUsageSnapshotKey = "";
  let lastContextLifecycleLogKey = "";

  async function executeRefreshContextUsage(
    composerDocIds: string[],
    contextWindowTokens?: number,
  ): Promise<void> {
    const seq = ++contextUsageRequestSeq;
    const state = get({ subscribe });

    // 竞态防护：如果已有更新的请求，跳过本次写入
    if (seq !== contextUsageRequestSeq) return;

    const refDocIds = new Set<string>();
    for (const msg of state.messages) {
      if (msg.role === "assistant" && msg.citedReferences) {
        for (const ref of msg.citedReferences) {
          if (ref.docId) refDocIds.add(ref.docId);
        }
      }
    }

    const snapshot = estimateContextUsage({
      messages: state.messages,
      attachedDocCount: composerDocIds.length,
      runtimeReferenceDocCount: refDocIds.size,
      contextWindowTokens,
      compressedSummaryChars: state.compressedContextSummary?.length ?? 0,
      stageSummaryStatusChars: 160 + ((state.stageSummaries?.length ?? 0) > 0 ? 80 : 0),
    });

    // 写入前再次检查竞态
    if (seq !== contextUsageRequestSeq) return;

    const snapshotKey = `${state.messages.length}:${composerDocIds.length}:${snapshot.usageRatio.toFixed(2)}`;
    if (snapshotKey === lastContextUsageSnapshotKey) return;
    lastContextUsageSnapshotKey = snapshotKey;

    pushAgentDebugEvent("CONTEXT_USAGE_SNAPSHOT_SAFE", {
      usedChars: snapshot.usedChars,
      estimatedTokens: snapshot.estimatedTokens,
      maxContextTokens: snapshot.maxContextTokens,
      maxContextSource: snapshot.maxContextSource,
      usageRatioPct: Math.round(snapshot.usageRatio * 100),
      unclampedRatioPct: snapshot.unclampedRatioPct,
      level: snapshot.level,
      messageCount: state.messages.length,
      attachedDocCount: composerDocIds.length,
      breakdown: snapshot.breakdown,
    }, "info");

    storeUpdate((s) => ({ ...s, contextUsage: snapshot }));
  }

  // ==================== 持久化内部实现 ====================

  /** 持久化 debounce 定时器 */
  let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Store 级队列：覆盖快照捕获、存储事务和结果回写的完整顺序。 */
  let storePersistenceTail: Promise<void> = Promise.resolve();
  let pendingStorePersistenceCount = 0;
  const pendingExplicitDeletedSessionIds = new Set<string>();

  /** Hydration 完成标记：防止 hydration 前默认空会话被持久化覆盖存储 */
  let hydrationCompleted = false;
  type HydrationState = "idle" | "loading" | "ready" | "failed";
  let hydrationState: HydrationState = "idle";
  let hydrationPromise: Promise<void> | null = null;
  let hydrationError: Error | null = null;

  type StorageBackedConversation = KbConversationSession & { storageRevision?: number };

  interface CapturedPersistenceSnapshot {
    conversations: KbConversationSession[];
    activeConversationId: string;
    selectedMode?: ChatMode;
    mutationVersion: number;
  }

  function storageRevisionOf(conversation: KbConversationSession | undefined): number | undefined {
    const value = (conversation as StorageBackedConversation | undefined)?.storageRevision;
    return Number.isSafeInteger(value) && (value ?? 0) >= 0 ? value : undefined;
  }

  function sameConversationContent(a: KbConversationSession, b: KbConversationSession): boolean {
    return JSON.stringify({
      id: a.id,
      title: a.title,
      createdAt: a.createdAt,
      messages: a.messages,
      stageSummaries: a.stageSummaries ?? [],
      thinkingMode: a.thinkingMode ?? "off",
      webAccessMode: a.webAccessMode ?? "off",
      compressedContextSummary: a.compressedContextSummary,
      compressionState: a.compressionState,
    }) === JSON.stringify({
      id: b.id,
      title: b.title,
      createdAt: b.createdAt,
      messages: b.messages,
      stageSummaries: b.stageSummaries ?? [],
      thinkingMode: b.thinkingMode ?? "off",
      webAccessMode: b.webAccessMode ?? "off",
      compressedContextSummary: b.compressedContextSummary,
      compressionState: b.compressionState,
    });
  }

  function withStorageRevision(
    conversation: KbConversationSession,
    saved: KbConversationSession | undefined,
  ): KbConversationSession {
    const storageRevision = storageRevisionOf(saved);
    if (storageRevision === undefined) return conversation;
    return { ...conversation, storageRevision } as StorageBackedConversation;
  }

  function materializeActiveConversation(state: ExtendedState): KbConversationSession[] {
    const active = state.conversations.find((item) => item.id === state.activeConversationId);
    if (!active) return state.conversations;
    const snapshot = buildConversationSnapshot(state, active);
    return state.conversations.map((item) => item.id === active.id ? snapshot : item);
  }

  function mergeStorageResultIntoCurrentState(
    state: ExtendedState,
    result: ChatStorageSaveResult,
  ): ExtendedState {
    const currentConversations = materializeActiveConversation(state);
    const savedById = new Map(result.conversations.map((item) => [item.id, item]));
    const mergedById = new Map<string, KbConversationSession>();
    // Persistence may intentionally sanitize runtime-only fields. Never replace the live
    // message list with the round-tripped storage representation; only adopt revisions.
    for (const current of currentConversations) {
      if (pendingExplicitDeletedSessionIds.has(current.id)) continue;
      mergedById.set(current.id, withStorageRevision(current, savedById.get(current.id)));
    }
    for (const saved of result.conversations) {
      if (pendingExplicitDeletedSessionIds.has(saved.id) || mergedById.has(saved.id)) continue;
      mergedById.set(saved.id, saved);
    }

    const conversations = [...mergedById.values()];
    let activeConversationId = state.activeConversationId;
    if (!conversations.some((item) => item.id === activeConversationId)) {
      activeConversationId = conversations.some((item) => item.id === result.activeConversationId)
        ? result.activeConversationId
        : conversations[0]?.id ?? "";
    }
    const active = conversations.find((item) => item.id === activeConversationId);
    if (!active) return state;

    return {
      ...state,
      conversations,
      activeConversationId,
      messages: active.messages,
      stageSummaries: active.stageSummaries ?? [],
      thinkingMode: active.thinkingMode ?? "off",
      webAccessMode: active.webAccessMode ?? "off",
      compressedContextSummary: active.compressedContextSummary,
      compressionState: active.compressionState,
      error: state.error,
    };
  }

  /** 合并存储结果；返回 true 表示保存期间又有本地变化，需要补保存。 */
  function applyStorageResult(
    result: ChatStorageSaveResult,
    captured: CapturedPersistenceSnapshot,
  ): boolean {
    if (!result.success) {
      storeUpdate((state) => ({ ...state, error: result.errors.join("；") || "会话保存失败。" }));
      return false;
    }
    const hasNewerMutation = localMutationVersion > captured.mutationVersion;
    storeUpdate((state) => {
      if (result.conversations.length === 0) return state;
      return mergeStorageResultIntoCurrentState(state, result);
    });
    storageApplicationVersion += 1;
    return hasNewerMutation;
  }

  async function persistCurrentSnapshot(): Promise<ChatStorageSaveResult | null> {
    const state = get({ subscribe });
    const activeConv = state.conversations.find((c) => c.id === state.activeConversationId);
    if (!activeConv) return null;
    const updatedConv = buildConversationSnapshot(state, activeConv);
    const conversations = state.conversations.map((c) =>
      c.id === state.activeConversationId ? updatedConv : c
    );
    const captured: CapturedPersistenceSnapshot = {
      conversations,
      activeConversationId: state.activeConversationId,
      selectedMode: state.selectedMode,
      mutationVersion: localMutationVersion,
    };
    const explicitDeletedSessionIds = [...pendingExplicitDeletedSessionIds];
    const result = await saveKbChatSessionStorage({
      activeConversationId: captured.activeConversationId,
      conversations,
      selectedMode: captured.selectedMode,
      explicitDeletedSessionIds,
    });
    if (result.success) {
      for (const id of result.deletedSessionIds) {
        pendingExplicitDeletedSessionIds.delete(id);
      }
    }
    const needsFollowUp = applyStorageResult(result, captured);
    if (result.success) {
      const journal = readTurnJournal() ?? await readTurnJournalAsync();
      if (
        journal?.status === "completed_pending_persist"
        && result.conversations.some((conversation) =>
          conversation.messages.some((message) => message.id === journal.assistantMessageId)
        )
      ) {
        await clearTurnJournalAfterPersistence();
      }
    }
    if (needsFollowUp && pendingStorePersistenceCount <= 1) {
      if (persistDebounceTimer) {
        clearTimeout(persistDebounceTimer);
        persistDebounceTimer = null;
      }
      void enqueueStorePersistence();
    }
    return result;
  }

  function enqueueStorePersistence(
    explicitDeletedSessionIds: readonly string[] = [],
  ): Promise<ChatStorageSaveResult | null> {
    for (const id of explicitDeletedSessionIds) {
      pendingExplicitDeletedSessionIds.add(id);
    }
    pendingStorePersistenceCount += 1;
    const run = storePersistenceTail
      .catch(() => undefined)
      .then(() => persistCurrentSnapshot());
    const settled = run.finally(() => {
      pendingStorePersistenceCount -= 1;
    });
    storePersistenceTail = settled.then(() => undefined, () => undefined);
    return settled;
  }

  async function waitForStorePersistence(): Promise<void> {
    while (true) {
      const tail = storePersistenceTail;
      await tail;
      if (tail === storePersistenceTail) return;
    }
  }

  function formatSessionReadWarning(issues: readonly ChatSessionReadIssue[]): string {
    if (issues.length === 0) return "";
    const invalidCount = issues.filter((item) => item.status === "invalid").length;
    const missingCount = issues.filter((item) => item.status === "missing").length;
    const parts: string[] = [];
    if (invalidCount > 0) parts.push(`${invalidCount} 个会话文件损坏`);
    if (missingCount > 0) parts.push(`${missingCount} 个会话文件暂时不可用`);
    return `部分聊天记录未能读取：${parts.join("，")}。原索引和文件均未被修改。`;
  }

  function schedulePersist(): void {
    if (!hydrationCompleted) return;
    if (persistDebounceTimer) {
      clearTimeout(persistDebounceTimer);
    }
    persistDebounceTimer = setTimeout(() => {
      persistDebounceTimer = null;
      void enqueueStorePersistence();
    }, options.persistDebounceDelay ?? PERSIST_DEBOUNCE_DELAY);
  }

  // ==================== 引用标题补全相关 ====================

  /**
   * 从所有会话消息中收集 assistant.citedReferences 的 docId
   */
  function collectReferenceDocIds(conversations: KbConversationSession[]): string[] {
    const docIds = new Set<string>();
    for (const conv of conversations) {
      for (const message of conv.messages) {
        if (message.role === "assistant" && message.citedReferences) {
          for (const item of message.citedReferences) {
            if (item.docId) {
              docIds.add(item.docId);
            }
          }
        }
      }
    }
    return [...docIds];
  }

  /**
   * 将解析后的文档信息应用到会话消息中
   * - 只更新内存中的 assistant.citedReferences
   * - 不触发持久化
   */
  function applyResolvedReferenceDocInfos(
    conversations: KbConversationSession[],
    infoMap: Map<string, ResolvedReferenceDocInfo>
  ): KbConversationSession[] {
    return conversations.map((conv) => ({
      ...conv,
      messages: conv.messages.map((message) => {
        if (message.role === "assistant" && message.citedReferences) {
          return {
            ...message,
            citedReferences: message.citedReferences.map((item) => {
              if (!item.docId || !infoMap.has(item.docId)) {
                return item;
              }
              const info = infoMap.get(item.docId)!;
              return {
                ...item,
                docTitle: info.docTitle,
                displayTitle: info.docTitle,
                box: info.box ?? item.box,
              };
            }),
          };
        }
        return message;
      }),
    }));
  }

  // 统一快照 helper - 将当前 active state 写回会话
  // 注意：运行态字段不进入快照，避免持久化；但压缩状态需要持久化
  function buildConversationSnapshot(state: ExtendedState, conversation: KbConversationSession): KbConversationSession {
    const snapshot: KbConversationSession = {
      ...conversation,
      messages: state.messages,
      stageSummaries: state.stageSummaries ?? [],
      compressedContextSummary: state.compressedContextSummary,
      compressionState: state.compressionState,
      // 会话级按钮状态：写入快照使其随会话持久化
      thinkingMode: state.thinkingMode ?? "off",
      webAccessMode: state.webAccessMode ?? "off",
      updatedAt: conversation.updatedAt,
    };
    return sameConversationContent(snapshot, conversation)
      ? snapshot
      : { ...snapshot, updatedAt: Date.now() };
  }

  // 同步当前活跃会话到 conversations 列表
  function syncActiveConversation(state: ExtendedState): ExtendedState {
    const activeConv = state.conversations.find(c => c.id === state.activeConversationId);
    if (!activeConv) return state;

    const updatedConv = buildConversationSnapshot(state, activeConv);
    return {
      ...state,
      conversations: state.conversations.map(c =>
        c.id === state.activeConversationId ? updatedConv : c
      ),
    };
  }
  let hydrateConversations!: () => Promise<void>;

  return {
    subscribe,
    update,

    // 设置当前聊天模式
    setSelectedMode: (selectedMode: ChatMode) => {
      update((state) => ({ ...state, selectedMode }));
      // 触发持久化
      schedulePersist();
    },

    // 设置输入框草稿
    setDraftQuestion: (draftQuestion: string) => {
      update((state) => ({ ...state, draftQuestion }));
    },

    // 设置输入框当前选择的聊天模型
    setSelectedChatModelSelection: (selection: ChatModelSelection | undefined) => {
      update((state) => ({ ...state, selectedChatModelSelection: selection }));
    },

    // 设置思考模式
    setThinkingMode: (thinkingMode: ThinkingMode) => {
      update((state) => ({ ...state, thinkingMode }));
      schedulePersist();
    },

    // 设置联网搜索模式（会话级持久化）
    setWebAccessMode: (webAccessMode: WebAccessMode) => {
      update((state) => ({ ...state, webAccessMode }));
      schedulePersist();
    },

    // 清空上下文用量快照（会话切换/新建/删除时调用）
    clearContextUsage: () => {
      update((s) => ({ ...s, contextUsage: undefined }));
    },

    // 刷新上下文用量快照（仅运行时，不持久化，带 debounce 和竞态防护）
    refreshContextUsage: (options?: {
      composerAttachedDocIds?: string[];
      contextWindowTokens?: number;
      reason?: string;
    }) => {
      const reason = options?.reason ?? "unknown";
      const composerDocIds = options?.composerAttachedDocIds ?? [];
      const contextWindowTokens = options?.contextWindowTokens;
      const messageCount = get({ subscribe }).messages.length;

      const lifecycleLogKey = `${reason}|${messageCount}|${composerDocIds.length}`;
      if (lifecycleLogKey !== lastContextLifecycleLogKey) {
        lastContextLifecycleLogKey = lifecycleLogKey;
        pushAgentDebugEvent("CONTEXT_USAGE_REFRESH_LIFECYCLE_SAFE", {
          reason,
          hasMessages: messageCount > 0,
          attachedDocCount: composerDocIds.length,
          hasModelContextWindow: !!contextWindowTokens,
        }, "info");
      }

      // Debounce：清除上一次待执行的定时器
      if (contextUsageDebounceTimer) {
        clearTimeout(contextUsageDebounceTimer);
      }

      contextUsageDebounceTimer = setTimeout(() => {
        void executeRefreshContextUsage(composerDocIds, contextWindowTokens);
      }, CONTEXT_USAGE_DEBOUNCE_MS);
    },

    // 获取新的 AbortController（用于新一轮请求）
    getNewAbortController,

    // 停止当前流式回答
    stop: () => {
      // 如果 controller 存在，先 abort
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      // 无论 controller 是否存在，都设置 asking=false
      // 处理边界情况：AbortController 已被清理但 asking 仍为 true
      update((state) => ({
        ...state,
        asking: false,
        agentStatus: undefined,
      }));
      // 触发持久化
      schedulePersist();
    },

    // 立即将当前运行中的 assistant 气泡标记为手动停止
    markLatestAssistantManuallyStopped: () => {
      update((state) => {
        const messages = [...state.messages];
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m.role !== "assistant" || m.isComplete === true) continue;

          if (m.content.trim()) {
            messages[i] = { ...m, agentStatus: undefined, isComplete: false };
          } else {
            messages[i] = {
              ...m,
              content: "已手动停止回答。",
              agentStatus: undefined,
              isComplete: true,
              reasoning: m.reasoning?.status === "streaming" ? undefined : m.reasoning,
            };
          }
          break;
        }

        return {
          ...state,
          messages,
          asking: false,
          agentStatus: undefined,
          qaError: "",
          error: "",
        };
      });
      schedulePersist();
    },
    // 清空当前对话（保留模式和设置，只清聊天/问答运行态）
    clearConversation: () => {
      update((state) => ({
        ...state,
        messages: [],
        stageSummaries: [],
        asking: false,
        qaError: "",
        error: "",
        draftQuestion: "",
        agentStatus: undefined,
        contextUsage: undefined,
        compressedContextSummary: undefined,
        compressionState: undefined,
        conversations: state.conversations.map((c) =>
          c.id === state.activeConversationId
            ? {
                ...c,
                messages: [],
                stageSummaries: [],
                compressedContextSummary: undefined,
                compressionState: undefined,
                updatedAt: Date.now(),
              }
            : c
        ),
      }));
      // 触发持久化
      schedulePersist();
    },

    // 保存当前活跃会话的快照
    saveActiveConversationSnapshot: () => {
      update((state) => syncActiveConversation(state));
    },

    // 同步当前活跃会话到 conversations（用于外部调用）
    syncActiveConversationSnapshot: () => {
      update((state) => syncActiveConversation(state));
      // 触发持久化调度
      schedulePersist();
    },

    // 创建新会话
    createConversation: () => {
      update((state) => {
        // 先使用统一 helper 保存当前会话完整快照
        const stateWithSnapshot = syncActiveConversation(state);

        // 创建新会话
        const newConversation = createDefaultConversation();

        return {
          ...stateWithSnapshot,
          conversations: [...stateWithSnapshot.conversations, newConversation],
          activeConversationId: newConversation.id,
          messages: newConversation.messages,
          stageSummaries: newConversation.stageSummaries ?? [],
          agentStatus: undefined,
          asking: false,
          qaError: "",
          draftQuestion: "",
          contextUsage: undefined,
          compressedContextSummary: undefined,
          compressionState: undefined,
          // 新会话默认按钮状态为 off，并把当前运行态切到新会话的 off
          thinkingMode: newConversation.thinkingMode ?? "off",
          webAccessMode: newConversation.webAccessMode ?? "off",
        };
      });
      // 新会话 ID 和索引立即进入统一队列；失败时保留本地会话并显示真实错误。
      if (hydrationCompleted) {
        void enqueueStorePersistence().then((result) => {
          if (!result?.success) {
            storeUpdate((state) => ({
              ...state,
              error: result?.errors.join("；") || "新会话保存失败，请稍后重试。",
            }));
          }
        });
      }
    },

    // 切换会话
    switchConversation: (id: string) => {
      update((state) => {
        const targetConv = state.conversations.find(c => c.id === id);
        if (!targetConv || id === state.activeConversationId) return state;

        // 使用统一 helper 保存当前会话完整快照
        const stateWithSnapshot = syncActiveConversation(state);

        return {
          ...stateWithSnapshot,
          activeConversationId: id,
          messages: targetConv.messages,
          stageSummaries: targetConv.stageSummaries ?? [],
          agentStatus: undefined,
          asking: false,
          qaError: "",
          draftQuestion: "",
          error: "",
          contextUsage: undefined,
          compressedContextSummary: targetConv.compressedContextSummary,
          compressionState: targetConv.compressionState,
          // 恢复目标会话的输入区按钮状态
          thinkingMode: targetConv.thinkingMode ?? "off",
          webAccessMode: targetConv.webAccessMode ?? "off",
        };
      });
      // 触发持久化
      schedulePersist();
    },

    // 重命名会话
    renameConversation: (id: string, title: string) => {
      update((state) => ({
        ...state,
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, title: title.trim() || DEFAULT_CONVERSATION_TITLE, updatedAt: Date.now() } : c
        ),
      }));
      // 触发持久化
      schedulePersist();
    },

    // 删除会话
    deleteConversation: async (id: string) => {
      const beforeDelete = get({ subscribe });
      if (beforeDelete.conversations.length <= 1) return;
      update((state) => {
        // 至少保留一个会话
        if (state.conversations.length <= 1) return state;

        // 如果删除的是当前会话，先保存快照
        const stateWithSnapshot = id === state.activeConversationId
          ? syncActiveConversation(state)
          : state;

        const remainingConversations = stateWithSnapshot.conversations.filter(c => c.id !== id);
        
        // 如果删除的是当前活跃会话，切换到最近的一个
        if (id === stateWithSnapshot.activeConversationId) {
          const newActiveConv = remainingConversations[remainingConversations.length - 1];
          return {
            ...stateWithSnapshot,
            conversations: remainingConversations,
            activeConversationId: newActiveConv.id,
            messages: newActiveConv.messages,
            stageSummaries: newActiveConv.stageSummaries ?? [],
            agentStatus: undefined,
            asking: false,
            qaError: "",
            draftQuestion: "",
            error: "",
            contextUsage: undefined,
            compressedContextSummary: newActiveConv.compressedContextSummary,
            compressionState: newActiveConv.compressionState,
            // 恢复新 active 会话的输入区按钮状态
            thinkingMode: newActiveConv.thinkingMode ?? "off",
            webAccessMode: newActiveConv.webAccessMode ?? "off",
          };
        }

        return {
          ...stateWithSnapshot,
          conversations: remainingConversations,
        };
      });
      const deleteMutationVersion = localMutationVersion;
      const deleteStorageApplicationVersion = storageApplicationVersion;
      if (persistDebounceTimer) {
        clearTimeout(persistDebounceTimer);
        persistDebounceTimer = null;
      }
      const result = await enqueueStorePersistence([id]);
      if (!result?.success) {
        // 仅在保存期间没有后续本地操作时回滚，避免失败结果覆盖更新状态。
        if (
          localMutationVersion === deleteMutationVersion
          && storageApplicationVersion === deleteStorageApplicationVersion
        ) {
          pendingExplicitDeletedSessionIds.delete(id);
          set(beforeDelete);
        }
        storeUpdate((state) => ({ ...state, error: result?.errors.join("；") || "删除会话保存失败，请重试。" }));
      }
    },

    // 尝试自动生成标题（用户发送第一条问题时调用）
    maybeAutoGenerateTitle: (userQuestion: string) => {
      update((state) => {
        const activeConv = state.conversations.find(c => c.id === state.activeConversationId);
        if (!activeConv || activeConv.title !== DEFAULT_CONVERSATION_TITLE) return state;

        // 截取用户问题前 20 字作为标题
        const newTitle = truncate(userQuestion.trim(), 20);

        return {
          ...state,
          conversations: state.conversations.map(c =>
            c.id === state.activeConversationId
              ? { ...c, title: newTitle, updatedAt: Date.now() }
              : c
          ),
        };
      });
      // 触发持久化（debounce）
      schedulePersist();
    },

    // 重置
    reset: async () => {
      const beforeReset = get({ subscribe });
      // 重置前先停止任何进行中的流
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      const defaultConv = createDefaultConversation();
      set({
        ...initialState,
        messages: defaultConv.messages,
        stageSummaries: defaultConv.stageSummaries ?? [],
        conversations: [defaultConv],
        activeConversationId: defaultConv.id,
      });
      const resetMutationVersion = localMutationVersion;
      const resetStorageApplicationVersion = storageApplicationVersion;
      const deletedSessionIds = beforeReset.conversations.map((item) => item.id);
      if (persistDebounceTimer) {
        clearTimeout(persistDebounceTimer);
        persistDebounceTimer = null;
      }
      const result = await enqueueStorePersistence(deletedSessionIds);
      if (!result?.success) {
        if (
          localMutationVersion === resetMutationVersion
          && storageApplicationVersion === resetStorageApplicationVersion
        ) {
          for (const id of deletedSessionIds) pendingExplicitDeletedSessionIds.delete(id);
          set(beforeReset);
        }
        storeUpdate((state) => ({ ...state, error: result?.errors.join("；") || "重置会话保存失败，请重试。" }));
      }
    },

    // ==================== 持久化方法 ====================

    /**
     * 从持久化存储恢复会话数据（hydrate）
     * - 如果没有存储数据，保持当前默认会话
     * - 清理所有 loading 消息
     * - 不恢复运行态字段
     * - 异步补全 reference 标题（懒加载）
     */
    hydrateConversations: hydrateConversations = () => {
      if (hydrationState === "ready") return Promise.resolve();
      if (hydrationState === "loading" && hydrationPromise) return hydrationPromise;
      if (hydrationState === "failed") {
        return Promise.reject(hydrationError ?? new Error("聊天记录恢复失败，请明确重试。"));
      }
      hydrationState = "loading";
      hydrationError = null;
      const hydrationStartMutationVersion = localMutationVersion;
      hydrationPromise = (async () => {
        try {
        const restored = await restoreKbChatSessions();
        if (!restored) {
          hydrationCompleted = true;
          hydrationState = "ready";
          return;
        }
        const restoreWarning = formatSessionReadWarning(restored.sessionReadIssues);
        // 先更新状态，让界面立刻可用
        storeUpdate((state) => {
          // 验证恢复的会话数据
          if (!restored.conversations || restored.conversations.length === 0) {
            console.warn("[KbSessionStore] Restored conversations is empty");
            return {
              ...state,
              error: restoreWarning || "聊天记录索引存在，但会话文件暂时无法读取。",
            };
          }

          // 清理所有 loading 消息和运行态占位 assistant 消息
          const cleanedConversations = restored.conversations.map((conv) => ({
            ...conv,
            messages: conv.messages.filter((m) => {
              if (m.role === "loading") return false;
              if (isTransientAssistantPlaceholder(m)) return false;
              return true;
            }),
          }));

          // 验证 activeConversationId 是否有效
          let activeId = restored.activeConversationId;
          const activeConv = cleanedConversations.find((c) => c.id === activeId);
          if (!activeConv) {
            // Active 会话不可用：优先恢复 updatedAt 最新的非空会话
            const nonEmpty = cleanedConversations
              .filter((c) => c.messages.length > 0)
              .sort((a, b) => b.updatedAt - a.updatedAt);
            if (nonEmpty.length > 0) {
              activeId = nonEmpty[0].id;
              console.warn(`[KbSessionStore] Active conversation ${restored.activeConversationId} not found, restored most recent non-empty: ${activeId}`);
            } else {
              activeId = cleanedConversations[0].id;
              console.warn(`[KbSessionStore] Active conversation ${restored.activeConversationId} not found, restored first available: ${activeId}`);
            }
          }

          const targetConv = cleanedConversations.find((c) => c.id === activeId)!;

          if (localMutationVersion > hydrationStartMutationVersion) {
            const currentConversations = materializeActiveConversation(state);
            const currentIds = new Set(currentConversations.map((item) => item.id));
            return {
              ...state,
              conversations: [
                ...currentConversations,
                ...cleanedConversations.filter((item) => !currentIds.has(item.id)),
              ],
              error: restoreWarning || state.error,
            };
          }

          return {
            ...state,
            conversations: cleanedConversations,
            activeConversationId: activeId,
            messages: targetConv.messages,
            stageSummaries: targetConv.stageSummaries ?? [],
            agentStatus: undefined,
            asking: false,
            qaError: "",
            error: restoreWarning,
            selectedMode: restored.selectedMode as ChatMode | undefined,
            compressedContextSummary: targetConv.compressedContextSummary,
            compressionState: targetConv.compressionState,
            // 恢复 active 会话的输入区按钮状态（旧会话缺字段时为 "off"）
            thinkingMode: targetConv.thinkingMode ?? "off",
            webAccessMode: targetConv.webAccessMode ?? "off",
          };
        });

        // 异步补全 reference 标题
        // 使用 setTimeout 让基础恢复先完成，避免阻塞界面
        setTimeout(async () => {
          try {
            const stateAfterUpdate = get({ subscribe });
            const docIds = collectReferenceDocIds(stateAfterUpdate.conversations);

            if (docIds.length === 0) {
              return;
            }

            // 批量查询文档标题
            const { resolveReferenceDocInfos } = await import("../services/session/reference-doc-resolver.js");
            const infoMap = await resolveReferenceDocInfos(docIds);

            if (infoMap.size === 0) {
              return;
            }

            // 再次获取最新状态，避免覆盖用户在加载期间的操作
            storeUpdate((currentState) => {
              // 只更新 conversations 中的 reference items
              const updatedConversations = applyResolvedReferenceDocInfos(
                currentState.conversations,
                infoMap
              );

              // 找到当前活跃会话
              const activeConv = updatedConversations.find(
                (c) => c.id === currentState.activeConversationId
              );

              return {
                ...currentState,
                conversations: updatedConversations,
                // 如果当前活跃会话存在，同步更新 messages
                messages: activeConv?.messages ?? currentState.messages,
              };
            });

            // 不触发持久化，因为持久化仍然只保存 docId
            // 即使后续保存，storage converter 也会剥离标题
          } catch (err) {
            console.warn("[KbSessionStore] Failed to resolve reference doc titles:", err);
          }
        }, 100);

        // 基础 Hydration 成功完成，允许恢复消息复用统一持久化入口。
        hydrationCompleted = true;

        // ── In-flight turn journal recovery ──
        try {
          const journal = await readTurnJournalAsync();
          if (journal && (
            journal.status === "running"
            || journal.status === "failed"
            || journal.status === "completed_pending_persist"
          )) {
            const lastKnown = readLastKnownState();
            const wasPermissionConfirm = lastKnown?.permissionConfirmClicked === true;

            let journalAlreadyPersisted = false;
            let recoveredPartialAnswer = false;
            const recoveryCheckpoint = journal.agentRunCheckpoint;
            const recoveryDecision = recoveryCheckpoint
              ? inspectAgentRunResume(recoveryCheckpoint)
              : undefined;
            const agentRecovery = recoveryCheckpoint
                ? {
                  checkpoint: recoveryCheckpoint,
                  userMessageId: journal.userMessageId,
                }
              : undefined;
            update((state) => {
              // 1. Locate target conversation by journal.conversationId first, fallback to active
              const targetConvId = state.conversations.some((c) => c.id === journal.conversationId)
                ? journal.conversationId
                : state.activeConversationId;
              const targetConv = state.conversations.find((c) => c.id === targetConvId);
              if (!targetConv) return state;

              const targetConvMessages = targetConvId === state.activeConversationId
                ? state.messages
                : targetConv.messages;

              // 2. Build recovery content with details
              const detailParts: string[] = [];
              if (wasPermissionConfirm) {
                detailParts.push("中断发生在确认写工具后");
                if (lastKnown?.nativePermissionToolName) {
                  detailParts.push(`工具：${lastKnown.nativePermissionToolName}`);
                }
                if (lastKnown?.nativePermissionAction) {
                  detailParts.push(`操作：${lastKnown.nativePermissionAction}`);
                }
              } else {
                if (journal.lastToolName) detailParts.push(`工具：${journal.lastToolName}`);
                if (journal.lastAction) detailParts.push(`操作：${journal.lastAction}`);
                if (journal.lastInnerAction) detailParts.push(`子操作：${journal.lastInnerAction}`);
                if (journal.lastArgsDigest) detailParts.push(`参数摘要：${journal.lastArgsDigest}`);
              }
              const detailStr = detailParts.length > 0 ? `（${detailParts.join("，")}）` : "";
              let recoveryContent = "上次回答过程中断，已恢复中断前的工具执行记录。";
              if (wasPermissionConfirm) {
                recoveryContent = `上次中断发生在确认某个写工具后，工具是否执行成功未知，请以思源当前状态为准。${detailStr}请重新发起测试或让我继续分析。`;
              } else if (journal.lastToolName) {
                recoveryContent = `上次回答在工具执行期间中断。${detailStr}已恢复中断前的工具执行记录。请重新发起测试或让我继续分析。`;
              } else {
                recoveryContent = `上次回答过程中断，已恢复中断前的工具执行记录。请重新发起测试或让我继续分析。`;
              }
              if (recoveryDecision?.resumable) {
                recoveryContent = `${recoveryContent.replace(/请重新发起测试或让我继续分析。$/, "")}可从下方安全检查点继续。`;
              }

              const recoveryIdentity = recoveryCheckpoint?.identity ?? {
                sessionId: journal.conversationId,
                runId: journal.assistantMessageId,
                correlationId: journal.assistantMessageId,
              };
              const safeWorkbenchEvents = journal.workbenchEvents
                .map((event, index) => restoreSafeWorkbenchEvent(event, index, recoveryIdentity))
                .filter((event): event is AgentWorkbenchEvent => event !== null);

              const hasAssistantMsg = targetConvMessages.some(
                (m: any) => m.role === "assistant" && m.id === journal.assistantMessageId
              );

              if (journal.status === "completed_pending_persist" && hasAssistantMsg) {
                journalAlreadyPersisted = true;
                return state;
              }

              let updatedConvMessages: any[];
              if (hasAssistantMsg) {
                updatedConvMessages = targetConvMessages.map((m: any) =>
                  m.id === journal.assistantMessageId && m.role === "assistant"
                    ? m.content.trim()
                      ? (() => {
                          recoveredPartialAnswer = true;
                          return {
                            ...m,
                            isComplete: false,
                            workbenchEvents: safeWorkbenchEvents,
                            agentStatus: undefined,
                            agentRecovery,
                          };
                        })()
                      : {
                          ...m,
                          content: recoveryContent,
                          isComplete: true,
                          workbenchEvents: safeWorkbenchEvents,
                          agentStatus: undefined,
                          agentRecovery,
                        }
                    : m
                );
              } else {
                const userMsgIndex = targetConvMessages.findIndex(
                  (m: any) => m.role === "user" && m.id === journal.userMessageId
                );
                const completedPending = journal.status === "completed_pending_persist";
                const recoveryMsg = {
                  id: journal.assistantMessageId,
                  role: "assistant" as const,
                  content: completedPending
                    ? `上次回答完成后未能持久化，以下为可恢复内容：${journal.answerPreview || "未保留完整回答，请重新提问。"}`
                    : recoveryContent,
                  createdAt: Date.now(),
                  isComplete: completedPending ? false : true,
                  workbenchEvents: safeWorkbenchEvents,
                  ...(!completedPending && agentRecovery ? { agentRecovery } : {}),
                };
                if (userMsgIndex >= 0) {
                  updatedConvMessages = [
                    ...targetConvMessages.slice(0, userMsgIndex + 1),
                    recoveryMsg,
                    ...targetConvMessages.slice(userMsgIndex + 1),
                  ];
                } else {
                  updatedConvMessages = [...targetConvMessages, recoveryMsg];
                }
              }

              // 3. Update both top-level messages AND conversations[].messages
              const updatedConversations = state.conversations.map((c) =>
                c.id === targetConvId
                  ? { ...c, messages: updatedConvMessages, updatedAt: Date.now() }
                  : c
              );

              if (targetConvId === state.activeConversationId) {
                return {
                  ...state,
                  messages: updatedConvMessages,
                  conversations: updatedConversations,
                  asking: false,
                  agentStatus: undefined,
                };
              }
              return {
                ...state,
                conversations: updatedConversations,
                asking: false,
                agentStatus: undefined,
              };
            });

            if (journalAlreadyPersisted) {
              await clearTurnJournalAfterPersistence();
              clearLastKnownState();
              hydrationState = "ready";
              return;
            }
            if (recoveredPartialAnswer) {
              storeUpdate((state) => ({
                ...state,
                error: "上次回答未完成，已恢复持久化检查点中的部分内容。",
              }));
            }

            // 4. 通过 Store 级协调器立即保存恢复内容，并合并新 revision。
            const recoverySaveResult = await enqueueStorePersistence();
            if (!recoverySaveResult?.success) {
              storeUpdate((state) => ({
                ...state,
                error: `恢复记录尚未保存：${recoverySaveResult?.errors.join("；") || "会话保存失败，请稍后重试。"}`,
              }));
            } else if (!recoveryDecision?.resumable) {
              await clearTurnJournalAfterPersistence();
              clearLastKnownState();
            }
          } else {
            clearLastKnownState();
          }
        } catch (error) {
          storeUpdate((state) => ({
            ...state,
            error: `恢复记录尚未保存：${error instanceof Error ? error.message : String(error)}`,
          }));
        }
        hydrationState = "ready";
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.warn("[KbSessionStore] Failed to hydrate conversations:", error);
        hydrationCompleted = false;
        hydrationState = "failed";
        hydrationError = error;
        storeUpdate((state) => ({
          ...state,
          error: `聊天记录恢复失败：${error.message}。为防止覆盖旧数据，已停止自动保存。`,
        }));
        throw error;
      }
      })();
      return hydrationPromise;
    },

    retryHydration: () => {
      if (hydrationState === "loading" && hydrationPromise) return hydrationPromise;
      if (hydrationState === "ready") return Promise.resolve();
      hydrationState = "idle";
      hydrationPromise = null;
      hydrationError = null;
      return hydrateConversations();
    },

    getHydrationState: () => hydrationState,

    diagnosePersistence: async (sessionId?: string) => {
      const storage = await inspectKbChatSessionStorage(sessionId);
      const journal = readTurnJournal() ?? await readTurnJournalAsync();
      return {
        ...storage,
        journal: journal ? {
          status: journal.status,
          conversationId: journal.conversationId,
          assistantMessageId: journal.assistantMessageId,
        } : null,
      };
    },

    /**
     * 执行上下文压缩（用户手动触发）
     * - 手动常规压缩不调用 LLM；Emergency Compaction 只在发送前硬阈值兜底触发
     * - 只使用 Agent 阶段摘要做边界 compact
     * - 未覆盖对话继续保留原文
     * - 标记旧消息为 compacted（不物理删除）
     * - 保存 compressionState 和 compressedContextSummary
     * - 失败时不修改 messages
     */
    executeCompression: async (): Promise<{ success: boolean; error?: string }> => {
      const state = get({ subscribe });
      if (state.asking) {
        return { success: false, error: "正在问答中，请等待完成" };
      }

      const result = await doCompress(
        state.messages,
        state.stageSummaries ?? [],
        state.compressedContextSummary,
        state.compressionState,
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      update((s) => {
        const updatedMessages = s.messages.map((m) => {
          if (result.compactedMessageIds?.includes(m.id)) {
            if (m.role === "user") {
              return { ...m, compacted: true };
            }
            if (m.role === "assistant") {
              return { ...m, compacted: true };
            }
          }
          return m;
        });

        return {
          ...s,
          messages: updatedMessages,
          compressedContextSummary: result.summary,
          compressionState: result.compressionState,
          conversations: s.conversations.map((c) =>
            c.id === s.activeConversationId
              ? {
                  ...c,
                  messages: updatedMessages,
                  stageSummaries: s.stageSummaries ?? [],
                  compressionState: result.compressionState,
                  compressedContextSummary: result.summary,
                  updatedAt: Date.now(),
                }
              : c
          ),
        };
      });

      schedulePersist();

      return { success: true };
    },

    /**
     * 清除压缩摘要，恢复旧消息进入上下文
     */
    clearCompression: () => {
      update((s) => {
        const updatedMessages = s.messages.map(removeCompactedFlag);

        return {
          ...s,
          messages: updatedMessages,
          stageSummaries: [],
          contextUsage: undefined,
          compressedContextSummary: undefined,
          compressionState: undefined,
          conversations: s.conversations.map((c) =>
            c.id === s.activeConversationId
              ? {
                  ...c,
                  messages: updatedMessages,
                  stageSummaries: [],
                  compressionState: undefined,
                  compressedContextSummary: undefined,
                  updatedAt: Date.now(),
                }
              : c
          ),
        };
      });

      schedulePersist();
    },

    /**
     * 根据 assistant 消息 ID 删除整轮对话（包含对应的 user 消息）
     * 删除后清空阶段摘要和压缩状态，避免被删内容继续出现在上下文中
     */
    deleteTurnByAssistantId: (assistantMessageId: string): boolean => {
      let deleted = false;
      update((state) => {
        const assistantIndex = state.messages.findIndex(
          (m) => m.id === assistantMessageId && m.role === "assistant"
        );
        if (assistantIndex < 0) return state;

        const deleteTarget = getTurnDeleteTarget(state.messages, assistantIndex);
        if (!deleteTarget) return state;
        const { startIndex } = deleteTarget;

        const newMessages = state.messages.filter((_, i) => i < startIndex || i > assistantIndex);

        // 移除剩余消息的 compacted 标记
        const unCompactedMessages = newMessages.map(removeCompactedFlag);

        // 重新生成标题：无消息则恢复默认，否则取第一条 user 消息前 20 字
        let newTitle = state.conversations.find((c) => c.id === state.activeConversationId)?.title ?? DEFAULT_CONVERSATION_TITLE;
        const firstUser = unCompactedMessages.find((m) => m.role === "user");
        if (!firstUser) {
          newTitle = DEFAULT_CONVERSATION_TITLE;
        } else if (newTitle !== DEFAULT_CONVERSATION_TITLE) {
          // 如果当前标题等于被删 user 消息的截断，则重新生成
          const deletedUser = state.messages[startIndex];
          if (deletedUser?.role === "user" && newTitle === truncate(deletedUser.content.trim(), 20)) {
            newTitle = truncate(firstUser.content.trim(), 20);
          }
        }

        deleted = true;
        return {
          ...state,
          messages: unCompactedMessages,
          stageSummaries: [],
          compressedContextSummary: undefined,
          compressionState: undefined,
          contextUsage: undefined,
          conversations: state.conversations.map((c) =>
            c.id === state.activeConversationId
              ? {
                  ...c,
                  messages: unCompactedMessages,
                  stageSummaries: [],
                  compressedContextSummary: undefined,
                  compressionState: undefined,
                  title: newTitle,
                  updatedAt: Date.now(),
                }
              : c
          ),
        };
      });

      if (deleted) {
        schedulePersist();
      }
      return deleted;
    },

    /**
     * 立即持久化当前会话数据
     * - 不保存 loading 消息
     * - 不保存运行态 trace
     * - reference 只保存轻量元数据
     */
    persistConversationsNow: async (): Promise<ChatStorageSaveResult | null> => {
      if (persistDebounceTimer) {
        clearTimeout(persistDebounceTimer);
        persistDebounceTimer = null;
      }
      return enqueueStorePersistence();
    },

    /**
     * 调度持久化（debounce）
     * - 避免频繁 saveData
     * - 流式 onChunk 阶段不会触发
     */
    schedulePersistConversations: () => {
      schedulePersist();
    },

    /** 页面销毁前提交 debounce 快照并等待统一写队列排空。 */
    flushPersistence: async () => {
      if (persistDebounceTimer) {
        clearTimeout(persistDebounceTimer);
        persistDebounceTimer = null;
        void enqueueStorePersistence();
      }
      await waitForStorePersistence();
      await flushStorageWrites();
    },
  };
}

export const kbSessionStore = createKbSessionStore();
