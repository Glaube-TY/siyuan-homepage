/**
 * KB Session Store
 * 知识库会话状态管理
 */

import { writable, get } from "svelte/store";
import type { KbSessionState } from "../types/session";
import type { KbConversationSession } from "../types/chat";
import type { ChatMode } from "../constants/chat-modes";
import type { ChatModelSelection } from "../types/chat-model-selection";
import {
  restoreKbChatSessions,
  saveKbChatSessionStorage,
  isTransientAssistantPlaceholder,
} from "../services/session/kb-chat-session-storage";
import {
  resolveReferenceDocInfos,
  type ResolvedReferenceDocInfo,
} from "../services/session/reference-doc-resolver";
import { estimateContextUsage, estimateDocContentChars } from "../types/context-usage";
import { pushAgentDebugEvent } from "../services/agentic-rag/debug/agentic-rag-debug";
import { safeSqlSelect } from "../services/siyuan/safe-sql";
import { executeCompression as doCompress } from "../services/context-compression";

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

// 初始状态
const initialState: KbSessionState = {
  error: "",
  asking: false,
  qaError: "",
  messages: [],
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
  };
}

// 创建 store
function createKbSessionStore() {
  // 初始化一个默认会话
  const defaultConversation = createDefaultConversation();

  // 扩展状态，包含多会话管理
  const extendedInitialState = {
    ...initialState,
    // 将会话数据同步到 KbSessionState 的对应字段
    messages: defaultConversation.messages,
  };

  const { subscribe, set, update } = writable<KbSessionState & { conversations: KbConversationSession[]; activeConversationId: string }>({
    ...extendedInitialState,
    conversations: [defaultConversation],
    activeConversationId: defaultConversation.id,
  });

  // 扩展状态类型
  type ExtendedState = KbSessionState & { conversations: KbConversationSession[]; activeConversationId: string };

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

    let fixedDocContentChars = 0;
    let estimateFailedCount = 0;
    if (composerDocIds.length > 0) {
      try {
        const docResult = await estimateDocContentChars(composerDocIds, async (sql) => {
          return safeSqlSelect<{ root_id: string; total_chars: number }>(sql, {
            maxLimit: 100,
            allowedTables: ["blocks"],
          });
        });
        fixedDocContentChars = docResult.totalChars;
        estimateFailedCount = docResult.estimateFailedCount;
      } catch {
        estimateFailedCount = composerDocIds.length;
      }
    }

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
      fixedDocContentChars,
      runtimeReferenceDocCount: refDocIds.size,
      contextWindowTokens,
      compressedSummaryChars: state.compressedContextSummary?.length ?? 0,
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
      fixedDocContentChars,
      estimateFailedCount,
      breakdown: snapshot.breakdown,
    }, "info");

    update((s) => ({ ...s, contextUsage: snapshot }));
  }

  // ==================== 持久化内部实现 ====================

  /** 持久化 debounce 定时器 */
  let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** 调度持久化（内部使用） */
  function schedulePersist(): void {
    if (persistDebounceTimer) {
      clearTimeout(persistDebounceTimer);
    }
    persistDebounceTimer = setTimeout(() => {
      void (async () => {
        const state = get({ subscribe });

        // 先同步当前活跃会话的快照
        const activeConv = state.conversations.find((c) => c.id === state.activeConversationId);
        if (!activeConv) return;

        const updatedConv = buildConversationSnapshot(state, activeConv);
        const conversations = state.conversations.map((c) =>
          c.id === state.activeConversationId ? updatedConv : c
        );

        await saveKbChatSessionStorage({
          activeConversationId: state.activeConversationId,
          conversations,
          selectedMode: state.selectedMode,
        });
      })();
    }, PERSIST_DEBOUNCE_DELAY);
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
  // 注意：运行态字段不进入快照，避免持久化
  function buildConversationSnapshot(state: ExtendedState, conversation: KbConversationSession): KbConversationSession {
    return {
      ...conversation,
      messages: state.messages,
      updatedAt: Date.now(),
    };
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
    setThinkingMode: (thinkingMode: import("../types/session").ThinkingMode) => {
      update((state) => ({ ...state, thinkingMode }));
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

    // 清空当前对话（保留模式和设置，只清聊天/问答运行态）
    clearConversation: () => {
      update((state) => ({
        ...state,
        messages: [],
        asking: false,
        qaError: "",
        error: "",
        draftQuestion: "",
        agentStatus: undefined,
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
          agentStatus: undefined,
          asking: false,
          qaError: "",
          draftQuestion: "",
          contextUsage: undefined,
          compressedContextSummary: undefined,
          compressionState: undefined,
        };
      });
      // 触发持久化
      schedulePersist();
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
          agentStatus: undefined,
          asking: false,
          qaError: "",
          draftQuestion: "",
          error: "",
          contextUsage: undefined,
          compressedContextSummary: targetConv.compressedContextSummary,
          compressionState: targetConv.compressionState,
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
    deleteConversation: (id: string) => {
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
            agentStatus: undefined,
            asking: false,
            qaError: "",
            draftQuestion: "",
            error: "",
            contextUsage: undefined,
          };
        }

        return {
          ...stateWithSnapshot,
          conversations: remainingConversations,
        };
      });
      // 触发持久化
      schedulePersist();
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
    reset: () => {
      // 重置前先停止任何进行中的流
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      const defaultConv = createDefaultConversation();
      set({
        ...initialState,
        messages: defaultConv.messages,
        conversations: [defaultConv],
        activeConversationId: defaultConv.id,
      });
      // 触发持久化
      schedulePersist();
    },

    // ==================== 持久化方法 ====================

    /**
     * 从持久化存储恢复会话数据（hydrate）
     * - 如果没有存储数据，保持当前默认会话
     * - 清理所有 loading 消息
     * - 不恢复运行态字段
     * - 异步补全 reference 标题（懒加载）
     */
    hydrateConversations: async () => {
      const restored = await restoreKbChatSessions();
      if (!restored) {
        // 没有存储数据，保持默认会话
        return;
      }

      try {
        // 先更新状态，让界面立刻可用
        update((state) => {
          // 验证恢复的会话数据
          if (!restored.conversations || restored.conversations.length === 0) {
            console.warn("[KbSessionStore] Restored conversations is empty");
            return state;
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
            // 使用第一个会话作为默认
            activeId = cleanedConversations[0].id;
          }

          const targetConv = cleanedConversations.find((c) => c.id === activeId)!;

          return {
            ...state,
            conversations: cleanedConversations,
            activeConversationId: activeId,
            messages: targetConv.messages,
            agentStatus: undefined,
            asking: false,
            qaError: "",
            error: "",
            selectedMode: restored.selectedMode as ChatMode | undefined,
            compressedContextSummary: targetConv.compressedContextSummary,
            compressionState: targetConv.compressionState,
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
            const infoMap = await resolveReferenceDocInfos(docIds);

            if (infoMap.size === 0) {
              return;
            }

            // 再次获取最新状态，避免覆盖用户在加载期间的操作
            update((currentState) => {
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
      } catch (e) {
        console.warn("[KbSessionStore] Failed to hydrate conversations:", e);
        // 保持默认会话
      }
    },

    /**
     * 执行上下文压缩（用户手动触发）
     * - 调用 LLM 生成压缩摘要
     * - 标记旧消息为 compacted
     * - 保存 compressionState 和 compressedContextSummary
     * - 失败时不修改 messages
     */
    executeCompression: async (): Promise<{ success: boolean; error?: string }> => {
      const state = get({ subscribe });
      if (state.asking) {
        return { success: false, error: "正在问答中，请等待完成" };
      }

      const result = await doCompress(state.messages);

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
        const updatedMessages = s.messages.map((m) => {
          if (m.role === "user" && m.compacted) {
            const { compacted, ...rest } = m;
            return rest;
          }
          if (m.role === "assistant" && m.compacted) {
            const { compacted, ...rest } = m;
            return rest;
          }
          return m;
        });

        return {
          ...s,
          messages: updatedMessages,
          compressedContextSummary: undefined,
          compressionState: undefined,
          conversations: s.conversations.map((c) =>
            c.id === s.activeConversationId
              ? {
                  ...c,
                  messages: updatedMessages,
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
     * 立即持久化当前会话数据
     * - 不保存 loading 消息
     * - 不保存运行态 trace
     * - reference 只保存轻量元数据
     */
    persistConversationsNow: async () => {
      const state = get({ subscribe });

      // 先同步当前活跃会话的快照
      const activeConv = state.conversations.find((c) => c.id === state.activeConversationId);
      if (!activeConv) return;

      const updatedConv = buildConversationSnapshot(state, activeConv);
      const conversations = state.conversations.map((c) =>
        c.id === state.activeConversationId ? updatedConv : c
      );

      await saveKbChatSessionStorage({
        activeConversationId: state.activeConversationId,
        conversations,
        selectedMode: state.selectedMode,
      });
    },

    /**
     * 调度持久化（debounce）
     * - 避免频繁 saveData
     * - 流式 onChunk 阶段不会触发
     */
    schedulePersistConversations: () => {
      schedulePersist();
    },
  };
}

export const kbSessionStore = createKbSessionStore();