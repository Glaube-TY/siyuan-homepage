/**
 * KB Chat Session Storage Service
 *
 * 职责：
 * - 使用思源插件的 plugin.saveData / plugin.loadData 持久化聊天会话
 * - 保存会话列表、消息、轻量证据记忆
 * - 不保存 reference 具体内容，只保存 docId 等轻量元数据
 */

import type { Plugin } from "siyuan";
import type { KbConversationSession } from "../../types/chat";
import type { ChatMessage, ReferenceItem, CitationSegment, LegacyAgentTurnMemory, AttachedKbDoc, UserMessageRequestContext } from "../../types/chat";
import type { AgenticRagTurnMemory } from "../agentic-rag/runtime/turn-memory";
import { pushAgentDebugEvent } from "../agentic-rag/debug/agentic-rag-debug";

let pluginInstance: Plugin | null = null;

/**
 * 设置插件实例（类似 kb-settings-service）
 */
export function setKbChatSessionStoragePlugin(plugin: Plugin): void {
  pluginInstance = plugin;
}

/**
 * 获取插件实例
 */
function getPlugin(): Plugin | null {
  return pluginInstance;
}

// ==================== 持久化数据结构 ====================

/** 持久化版本号 */
const STORAGE_VERSION = 6;

/** 轻量引用项（持久化用） */
interface PersistedReferenceItem {
  index: number;
  docId?: string;
  readLevel?: "snippet" | "section" | "document";
  docTitle?: string;
  displayTitle?: string;
  box?: string;
  path?: string;
}

/** 轻量 Agent Turn Memory（持久化用，legacy 兼容） */
interface PersistedAgentTurnMemory {
  turnId: string;
  createdAt: number;
  userQuestion: string;
  standaloneQuestion: string;
  taskType: string;
  scope: unknown;
  planSummary: string;
  evidenceDocIds: string[];
  footerReferenceDocIds: string[];
  footerReferenceTitles: string[];
  answerSummary: string;
}

/** 轻量 Agentic RAG Turn Memory（持久化用） */
interface PersistedAgenticRagTurnMemory {
  turnId: string;
  createdAt: number;
  userQuestion: string;
  scope?: {
    type: string;
    docId?: string;
    rootDocId?: string;
    notebookId?: string;
    docIds?: string[];
  };
  answerSummary: string;
  answerItems?: {
    itemIndex: number;
    itemText: string;
    usedEvidenceHandles: string[];
  }[];
  actionTraceSummary: {
    toolNames: string[];
  };
  footerReferenceDocIds: string[];
  footerReferenceTitles: string[];
  workspaceSummary?: {
    candidateDocCount: number;
    candidateBlockCount: number;
    outlineCount: number;
    warnings: string[];
  };
}

/** 轻量消息（持久化用） */
type PersistedChatMessage =
  | {
      id: string;
      role: "user" | "error";
      content: string;
      createdAt: number;
      /** 用户附加文档轻量元信息（可选） */
      attachedDocs?: AttachedKbDoc[];
      /** 请求上下文轻量元信息（可选） */
      requestContext?: UserMessageRequestContext;
      compacted?: boolean;
    }
  | {
      id: string;
      role: "assistant";
      content: string;
      createdAt: number;
      citationSegments?: CitationSegment[];
      citedReferences?: PersistedReferenceItem[];
      isComplete?: boolean;
      agentMemory?: PersistedAgentTurnMemory;
      agenticMemory?: PersistedAgenticRagTurnMemory;
      /** 持久化的 reasoning（仅 done 状态） */
      reasoning?: { content: string; chars: number; partCount: number };
      compacted?: boolean;
      hiddenTurnSummary?: string;
      hiddenTurnSummaryMeta?: {
        summaryVersion: number;
        summaryCreatedAt: number;
        summarySource: string;
        summaryFailed?: boolean;
      };
    };

/** 轻量会话 */
interface PersistedConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: PersistedChatMessage[];
  compressionState?: import("../../types/context-usage").ContextCompressionState;
  compressedContextSummary?: string;
}

/** 持久化根结构 */
interface PersistedStorage {
  version: number;
  activeConversationId: string;
  conversations: PersistedConversation[];
  selectedMode?: string;
  updatedAt: number;
}

// ==================== 转换函数 ====================

/**
 * 判断是否为运行态占位 assistant 消息
 * - 空内容、未完成、无引用、无 agentMemory
 * - 此类消息不应持久化，也不应在恢复时保留
 */
export function isTransientAssistantPlaceholder(message: ChatMessage): boolean {
  return (
    message.role === "assistant" &&
    !message.content.trim() &&
    message.isComplete === false &&
    !message.agenticMemory &&
    !message.agentMemory &&
    !(message.citedReferences && message.citedReferences.length > 0)
  );
}

/**
 * 将 LegacyAgentTurnMemory 转为轻量持久化格式
 */
function toPersistedAgentTurnMemory(memory: LegacyAgentTurnMemory): PersistedAgentTurnMemory {
  return {
    turnId: memory.turnId,
    createdAt: memory.createdAt,
    userQuestion: memory.userQuestion,
    standaloneQuestion: memory.standaloneQuestion,
    taskType: memory.taskType,
    scope: memory.scope,
    planSummary: memory.planSummary,
    evidenceDocIds: Array.from(new Set(memory.evidenceDocIds)),
    footerReferenceDocIds: Array.from(new Set(memory.footerReferenceDocIds)),
    footerReferenceTitles: Array.from(new Set(memory.footerReferenceTitles)),
    answerSummary: memory.answerSummary,
  };
}

/**
 * 将轻量持久化格式转为 LegacyAgentTurnMemory
 */
function fromPersistedAgentTurnMemory(memory: PersistedAgentTurnMemory): LegacyAgentTurnMemory {
  return {
    turnId: memory.turnId,
    createdAt: memory.createdAt,
    userQuestion: memory.userQuestion,
    standaloneQuestion: memory.standaloneQuestion,
    taskType: memory.taskType,
    scope: memory.scope,
    planSummary: memory.planSummary,
    evidenceDocIds: memory.evidenceDocIds,
    footerReferenceDocIds: memory.footerReferenceDocIds,
    footerReferenceTitles: memory.footerReferenceTitles,
    answerSummary: memory.answerSummary,
  };
}

/**
 * 将 AgenticRagTurnMemory 转为轻量持久化格式
 */
function toPersistedAgenticRagTurnMemory(memory: AgenticRagTurnMemory): PersistedAgenticRagTurnMemory {
  return {
    turnId: memory.turnId,
    createdAt: memory.createdAt,
    userQuestion: memory.userQuestion,
    scope: memory.scope,
    answerSummary: memory.answerSummary,
    answerItems: memory.answerItems,
    actionTraceSummary: {
      toolNames: memory.actionTraceSummary.toolNames,
    },
    footerReferenceDocIds: Array.from(new Set(memory.footerReferenceDocIds)),
    footerReferenceTitles: Array.from(new Set(memory.footerReferenceTitles)),
    workspaceSummary: memory.workspaceSummary,
  };
}

/**
 * 将轻量持久化格式转为 AgenticRagTurnMemory
 */
function fromPersistedAgenticRagTurnMemory(memory: PersistedAgenticRagTurnMemory): AgenticRagTurnMemory {
  return {
    turnId: memory.turnId,
    createdAt: memory.createdAt,
    userQuestion: memory.userQuestion,
    scope: memory.scope,
    answerSummary: memory.answerSummary,
    answerItems: memory.answerItems ?? [],
    actionTraceSummary: {
      toolNames: memory.actionTraceSummary.toolNames,
    },
    footerReferenceDocIds: memory.footerReferenceDocIds,
    footerReferenceTitles: memory.footerReferenceTitles,
    workspaceSummary: memory.workspaceSummary,
  };
}

/**
 * 将 ReferenceItem 转为轻量持久化格式
 */
function toPersistedReferenceItem(item: ReferenceItem): PersistedReferenceItem {
  return {
    index: item.index,
    docId: item.docId,
    readLevel: item.readLevel,
    docTitle: item.docTitle,
    displayTitle: item.displayTitle,
    box: item.box,
    path: item.path,
  };
}

/**
 * 将轻量持久化格式转为 ReferenceItem（恢复时构造最小结构）
 */
function fromPersistedReferenceItem(item: PersistedReferenceItem): ReferenceItem {
  return {
    index: item.index,
    docId: item.docId,
    docTitle: item.docTitle || (item.docId ? `文档 ${item.docId}` : "参考文档"),
    displayTitle: item.displayTitle,
    headingPathText: item.docTitle || "",
    sourceBlockIds: [],
    readLevel: item.readLevel,
    box: item.box,
    path: item.path,
  };
}

/**
 * 将 ChatMessage 转为轻量持久化格式
 */
function toPersistedMessage(message: ChatMessage): PersistedChatMessage | null {
  switch (message.role) {
    case "user":
    case "error": {
      const persisted: PersistedChatMessage = {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      };
      if (message.role === "user") {
        const userMsg = message as import("../../types/chat").UserChatMessage;
        if (userMsg.attachedDocs && userMsg.attachedDocs.length > 0) {
          persisted.attachedDocs = userMsg.attachedDocs.map((d) => ({
            docId: d.docId,
            title: d.title,
            box: d.box,
            path: d.path,
            source: d.source,
            createdAt: d.createdAt,
          }));
        }
        if (userMsg.requestContext) {
          persisted.requestContext = userMsg.requestContext;
        }
        if (userMsg.compacted) {
          persisted.compacted = true;
        }
      }
      return persisted;
    }
    case "assistant":
      // 运行态占位消息不持久化
      if (isTransientAssistantPlaceholder(message)) {
        return null;
      }

      // 保存 citationSegments 和 citedReferences
      // 保存 isComplete
      const persistedAssistant: PersistedChatMessage = {
        id: message.id,
        role: "assistant",
        content: message.content,
        createdAt: message.createdAt,
      };
      if (message.citationSegments && message.citationSegments.length > 0) {
        persistedAssistant.citationSegments = message.citationSegments;
      }
      if (message.citedReferences && message.citedReferences.length > 0) {
        persistedAssistant.citedReferences = message.citedReferences.map(toPersistedReferenceItem);
      }
      // 保存完成状态（只有明确为 false 时才保存，节省空间）
      if (message.isComplete === false) {
        persistedAssistant.isComplete = false;
      }
      // Agent Core：保存轻量轮次记忆
      if (message.agentMemory) {
        persistedAssistant.agentMemory = toPersistedAgentTurnMemory(message.agentMemory);
      }
      // Agentic RAG：保存轻量轮次记忆
      if (message.agenticMemory) {
        persistedAssistant.agenticMemory = toPersistedAgenticRagTurnMemory(message.agenticMemory);
      }
      // 保存 reasoning（仅 done 状态且有内容）
      if (
        message.reasoning?.status === "done" &&
        message.reasoning.content.trim().length > 0
      ) {
        persistedAssistant.reasoning = {
          content: message.reasoning.content,
          chars: message.reasoning.chars,
          partCount: message.reasoning.partCount,
        };
      }
      if ((message as import("../../types/chat").AssistantChatMessage).compacted) {
        persistedAssistant.compacted = true;
      }
      const assistantTyped = message as import("../../types/chat").AssistantChatMessage;
      if (assistantTyped.hiddenTurnSummary) {
        persistedAssistant.hiddenTurnSummary = assistantTyped.hiddenTurnSummary;
      }
      if (assistantTyped.hiddenTurnSummaryMeta) {
        persistedAssistant.hiddenTurnSummaryMeta = assistantTyped.hiddenTurnSummaryMeta;
      }
      return persistedAssistant;
    case "loading":
      // loading 消息不保存
      return null;
    default:
      return null;
  }
}

/**
 * 将轻量持久化格式转为 ChatMessage
 */
function fromPersistedMessage(message: PersistedChatMessage): ChatMessage {
  switch (message.role) {
    case "user":
    case "error": {
      const restored: ChatMessage = {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      };
      if (message.role === "user") {
        const userRestored = restored as import("../../types/chat").UserChatMessage;
        if (message.attachedDocs && message.attachedDocs.length > 0) {
          userRestored.attachedDocs = message.attachedDocs;
        }
        if (message.requestContext) {
          userRestored.requestContext = message.requestContext;
        }
        if (message.compacted) {
          userRestored.compacted = true;
        }
      }
      return restored;
    }
    case "assistant":
      const assistantMsg: ChatMessage = {
        id: message.id,
        role: "assistant",
        content: message.content,
        createdAt: message.createdAt,
        isComplete: message.isComplete ?? true,
      };
      if (message.citationSegments && message.citationSegments.length > 0) {
        assistantMsg.citationSegments = message.citationSegments;
      }
      if (message.citedReferences && message.citedReferences.length > 0) {
        assistantMsg.citedReferences = message.citedReferences.map(fromPersistedReferenceItem);
      }
      if (message.agentMemory) {
        assistantMsg.agentMemory = fromPersistedAgentTurnMemory(message.agentMemory);
      }
      if (message.agenticMemory) {
        assistantMsg.agenticMemory = fromPersistedAgenticRagTurnMemory(message.agenticMemory);
      }
      // 恢复 reasoning（持久化时只保存 done 状态）
      if (message.reasoning && message.reasoning.content.trim().length > 0) {
        assistantMsg.reasoning = {
          content: message.reasoning.content,
          status: "done",
          chars: message.reasoning.chars,
          partCount: message.reasoning.partCount,
        };
      }
      if (message.compacted) {
        (assistantMsg as import("../../types/chat").AssistantChatMessage).compacted = true;
      }
      if (message.hiddenTurnSummary) {
        (assistantMsg as import("../../types/chat").AssistantChatMessage).hiddenTurnSummary = message.hiddenTurnSummary;
      }
      if (message.hiddenTurnSummaryMeta) {
        (assistantMsg as import("../../types/chat").AssistantChatMessage).hiddenTurnSummaryMeta = message.hiddenTurnSummaryMeta as import("../../types/chat").AssistantChatMessage["hiddenTurnSummaryMeta"];
      }
      return assistantMsg;
  }
}

/**
 * 将 KbConversationSession 转为轻量持久化格式
 */
function toPersistedConversation(session: KbConversationSession): PersistedConversation {
  let withRequestContextCount = 0;
  let attachedDocTotalCount = 0;
  let zeroDocContextCount = 0;
  const persistedMessages: PersistedChatMessage[] = [];
  for (const msg of session.messages) {
    const persisted = toPersistedMessage(msg);
    if (!persisted) continue;
    persistedMessages.push(persisted);
    if (persisted.role === "user" && persisted.requestContext) {
      withRequestContextCount++;
      const docCount = persisted.requestContext.customDocIds?.length ?? persisted.requestContext.attachedDocs?.length ?? 0;
      attachedDocTotalCount += docCount;
      if (docCount === 0) zeroDocContextCount++;
    }
  }
  if (persistedMessages.length > 0) {
    pushAgentDebugEvent("USER_MESSAGE_REQUEST_CONTEXT_PERSISTED_SAFE", {
      messageCount: persistedMessages.length,
      withRequestContextCount,
      attachedDocTotalCount,
      zeroDocContextCount,
    }, "debug");
  }
  const persisted: PersistedConversation = {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: persistedMessages,
  };
  if (session.compressionState) {
    persisted.compressionState = session.compressionState;
  }
  if (session.compressedContextSummary) {
    persisted.compressedContextSummary = session.compressedContextSummary;
  }
  return persisted;
}

/**
 * 将轻量持久化格式转为 KbConversationSession
 */
function fromPersistedConversation(
  persisted: PersistedConversation,
  defaults: Partial<KbConversationSession> = {}
): KbConversationSession {
  let withRequestContextCount = 0;
  let attachedDocTotalCount = 0;
  let zeroDocContextCount = 0;
  const restoredMessages: ChatMessage[] = [];
  for (const msg of persisted.messages) {
    const restored = fromPersistedMessage(msg);
    restoredMessages.push(restored);
    if (restored.role === "user") {
      const userMsg = restored as import("../../types/chat").UserChatMessage;
      if (userMsg.requestContext) {
        withRequestContextCount++;
        const docCount = userMsg.requestContext.customDocIds?.length ?? userMsg.requestContext.attachedDocs?.length ?? 0;
        attachedDocTotalCount += docCount;
        if (docCount === 0) zeroDocContextCount++;
      }
    }
  }
  if (restoredMessages.length > 0) {
    pushAgentDebugEvent("USER_MESSAGE_REQUEST_CONTEXT_RESTORED_SAFE", {
      messageCount: restoredMessages.length,
      withRequestContextCount,
      attachedDocTotalCount,
      zeroDocContextCount,
    }, "debug");
  }
  const session: KbConversationSession = {
    id: persisted.id,
    title: persisted.title,
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
    messages: restoredMessages,
    ...defaults,
  };
  if (persisted.compressionState) {
    session.compressionState = persisted.compressionState;
  }
  if (persisted.compressedContextSummary) {
    session.compressedContextSummary = persisted.compressedContextSummary;
  }
  return session;
}

// ==================== 存储 API ====================

const STORAGE_KEY = "kb-chat-sessions";

/**
 * 加载持久化的会话存储
 * @returns 持久化数据或 null
 */
export async function loadKbChatSessionStorage(): Promise<PersistedStorage | null> {
  const plugin = getPlugin();
  if (!plugin) {
    console.warn("[KbChatSessionStorage] Plugin not initialized");
    return null;
  }

  try {
    const data = await plugin.loadData(STORAGE_KEY);
    if (!data) {
      return null;
    }

    // 版本检查：版本不一致则重置会话存储
    if (data.version !== STORAGE_VERSION) {
      console.info(`[KbChatSessionStorage] Storage version changed, resetting local chat sessions`);
      return null;
    }

    return data as PersistedStorage;
  } catch (e) {
    console.error("[KbChatSessionStorage] Failed to load:", e);
    return null;
  }
}

/**
 * 保存会话存储到持久化
 * @param payload 要保存的数据
 */
export async function saveKbChatSessionStorage(payload: {
  activeConversationId: string;
  conversations: KbConversationSession[];
  selectedMode?: string;
}): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) {
    console.warn("[KbChatSessionStorage] Plugin not initialized");
    return;
  }

  try {
    const storage: PersistedStorage = {
      version: STORAGE_VERSION,
      activeConversationId: payload.activeConversationId,
      conversations: payload.conversations.map(toPersistedConversation),
      selectedMode: payload.selectedMode,
      updatedAt: Date.now(),
    };

    await plugin.saveData(STORAGE_KEY, storage);
  } catch (e) {
    console.warn("[KbChatSessionStorage] Failed to save:", e);
    // 不要中断问答流程
  }
}

/**
 * 从持久化存储恢复会话数据
 * @returns 恢复后的数据或 null
 */
export async function restoreKbChatSessions(): Promise<{
  activeConversationId: string;
  conversations: KbConversationSession[];
  selectedMode?: string;
} | null> {
  const storage = await loadKbChatSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const conversations = storage.conversations.map((c) => fromPersistedConversation(c));

    return {
      activeConversationId: storage.activeConversationId,
      conversations,
      selectedMode: storage.selectedMode,
    };
  } catch (e) {
    console.error("[KbChatSessionStorage] Failed to restore:", e);
    return null;
  }
}
