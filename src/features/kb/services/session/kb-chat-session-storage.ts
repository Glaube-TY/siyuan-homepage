import type {
  AssistantChatMessage,
  ChatMessage,
  ErrorChatMessage,
  KbConversationSession,
  ReferenceItem,
  UserChatMessage,
} from "../../types/chat";
import type { AgenticRagTurnMemory } from "../agentic-rag/runtime/turn-memory";

export interface PersistedReferenceItem {
  index: number;
  docId?: string;
  readLevel?: "snippet" | "section" | "document";
  docTitle?: string;
  displayTitle?: string;
  box?: string;
  path?: string;
}

export interface PersistedAgenticRagTurnMemory {
  turnId: string;
  createdAt: number;
  userQuestion: string;
  scope?: AgenticRagTurnMemory["scope"];
  answerSummary: string;
  answerItems?: AgenticRagTurnMemory["answerItems"];
  actionTraceSummary: {
    toolNames: string[];
  };
  footerReferenceDocIds: string[];
  footerReferenceTitles: string[];
  footerReferenceBlockIds?: string[];
  workspaceSummary?: AgenticRagTurnMemory["workspaceSummary"];
}

export type PersistedChatMessage =
  | {
      id: string;
      role: "user" | "error";
      content: string;
      createdAt: number;
      attachedDocs?: import("../../types/chat").AttachedKbDoc[];
      requestContext?: import("../../types/chat").UserMessageRequestContext;
      compacted?: boolean;
    }
  | {
      id: string;
      role: "assistant";
      content: string;
      createdAt: number;
      citationSegments?: import("../../types/chat").CitationSegment[];
      citedReferences?: PersistedReferenceItem[];
      isComplete?: boolean;
      agenticMemory?: PersistedAgenticRagTurnMemory;
      reasoning?: { content: string; chars: number; partCount: number };
      compacted?: boolean;
      hiddenTurnSummary?: string;
      hiddenTurnSummaryMeta?: AssistantChatMessage["hiddenTurnSummaryMeta"];
    };

export interface PersistedConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: PersistedChatMessage[];
  compressionState?: import("../../types/context-usage").ContextCompressionState;
  compressedContextSummary?: string;
}

export function isTransientAssistantPlaceholder(message: ChatMessage): boolean {
  return (
    message.role === "assistant" &&
    !message.content.trim() &&
    message.isComplete === false &&
    !message.agenticMemory &&
    !(message.citedReferences && message.citedReferences.length > 0)
  );
}

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
    footerReferenceBlockIds: memory.footerReferenceBlockIds,
    workspaceSummary: memory.workspaceSummary,
  };
}

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
    footerReferenceBlockIds: memory.footerReferenceBlockIds ?? [],
    workspaceSummary: memory.workspaceSummary,
  };
}

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
        if (message.attachedDocs && message.attachedDocs.length > 0) {
          persisted.attachedDocs = message.attachedDocs;
        }
        if (message.requestContext) {
          persisted.requestContext = message.requestContext;
        }
        if (message.compacted) {
          persisted.compacted = true;
        }
      }
      return persisted;
    }
    case "assistant": {
      if (isTransientAssistantPlaceholder(message)) return null;
      const persisted: PersistedChatMessage = {
        id: message.id,
        role: "assistant",
        content: message.content,
        createdAt: message.createdAt,
      };
      if (message.citationSegments && message.citationSegments.length > 0) {
        persisted.citationSegments = message.citationSegments;
      }
      if (message.citedReferences && message.citedReferences.length > 0) {
        persisted.citedReferences = message.citedReferences.map(toPersistedReferenceItem);
      }
      if (message.isComplete === false) {
        persisted.isComplete = false;
      }
      if (message.agenticMemory) {
        persisted.agenticMemory = toPersistedAgenticRagTurnMemory(message.agenticMemory);
      }
      if (message.reasoning?.status === "done" && message.reasoning.content.trim().length > 0) {
        persisted.reasoning = {
          content: message.reasoning.content,
          chars: message.reasoning.chars,
          partCount: message.reasoning.partCount,
        };
      }
      if (message.compacted) persisted.compacted = true;
      if (message.hiddenTurnSummary) persisted.hiddenTurnSummary = message.hiddenTurnSummary;
      if (message.hiddenTurnSummaryMeta) persisted.hiddenTurnSummaryMeta = message.hiddenTurnSummaryMeta;
      return persisted;
    }
    case "loading":
      return null;
    default:
      return null;
  }
}

function fromPersistedMessage(message: PersistedChatMessage): ChatMessage {
  switch (message.role) {
    case "user":
    case "error": {
      const restored: UserChatMessage | ErrorChatMessage = {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      } as UserChatMessage | ErrorChatMessage;
      if (message.role === "user") {
        const userRestored = restored as UserChatMessage;
        if (message.attachedDocs) userRestored.attachedDocs = message.attachedDocs;
        if (message.requestContext) userRestored.requestContext = message.requestContext;
        if (message.compacted) userRestored.compacted = true;
      }
      return restored;
    }
    case "assistant": {
      const assistantMsg: AssistantChatMessage = {
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
      if (message.agenticMemory) {
        assistantMsg.agenticMemory = fromPersistedAgenticRagTurnMemory(message.agenticMemory);
      }
      if (message.reasoning && message.reasoning.content.trim().length > 0) {
        assistantMsg.reasoning = {
          content: message.reasoning.content,
          status: "done",
          chars: message.reasoning.chars,
          partCount: message.reasoning.partCount,
        };
      }
      if (message.compacted) assistantMsg.compacted = true;
      if (message.hiddenTurnSummary) assistantMsg.hiddenTurnSummary = message.hiddenTurnSummary;
      if (message.hiddenTurnSummaryMeta) assistantMsg.hiddenTurnSummaryMeta = message.hiddenTurnSummaryMeta;
      return assistantMsg;
    }
  }
}

export function toPersistedConversation(session: KbConversationSession): PersistedConversation {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages.map(toPersistedMessage).filter((m): m is PersistedChatMessage => !!m),
    compressionState: session.compressionState,
    compressedContextSummary: session.compressedContextSummary,
  };
}

export function fromPersistedConversation(
  persisted: PersistedConversation,
  defaults: Partial<KbConversationSession> = {},
): KbConversationSession {
  return {
    id: persisted.id,
    title: persisted.title,
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
    messages: persisted.messages.map(fromPersistedMessage),
    compressionState: persisted.compressionState,
    compressedContextSummary: persisted.compressedContextSummary,
    ...defaults,
  };
}

export async function loadKbChatSessionStorage(): Promise<null> {
  return null;
}

export async function saveKbChatSessionStorage(_payload: {
  activeConversationId: string;
  conversations: KbConversationSession[];
  selectedMode?: string;
}): Promise<void> {
  return;
}

export async function restoreKbChatSessions(): Promise<null> {
  return null;
}
