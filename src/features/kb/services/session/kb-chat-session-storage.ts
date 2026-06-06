import type {
  AssistantChatMessage,
  ChatMessage,
  ConversationStageSummary,
  ErrorChatMessage,
  KbConversationSession,
  ReferenceItem,
  UserChatMessage,
} from "../../types/chat";
import type { AgentTurnMemory } from "../agent-workbench/memory/agent-turn-memory";
import type { AgentWorkbenchEvent } from "../agent-workbench/contracts/turn-event";

export interface PersistedReferenceItem {
  index: number;
  docId?: string;
  readLevel?: "content" | "structure" | "candidate" | "snippet" | "section" | "document";
  referenceReason?: "planner_explicit" | "read_content" | "structure_result" | "search_candidate";
  grounded?: boolean;
  docTitle?: string;
  displayTitle?: string;
  box?: string;
  path?: string;
}

export interface PersistedAgentTurnMemory {
  turnId: string;
  createdAt: number;
  userQuestion: string;
  scope?: AgentTurnMemory["scope"];
  actionTraceSummary: {
    toolNames: string[];
  };
  footerReferenceDocIds: string[];
  footerReferenceTitles: string[];
  footerReferenceBlockIds?: string[];
  footerReferenceReasons?: string[];
  footerReferenceReadLevels?: string[];
  footerReferenceGroundedFlags?: boolean[];
}

export interface PersistedWorkbenchEvent {
  type: "ToolDispatch" | "ToolResult" | "TurnFailed" | "AssistantFinal";
  stepIndex?: number;
  at?: number;
  toolName?: string;
  argsPreview?: Record<string, unknown>;
  ok?: boolean;
  outputSummary?: string;
  errorCode?: string;
  durationMs?: number;
  message?: string;
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
      agentMemory?: PersistedAgentTurnMemory;
      workbenchEvents?: PersistedWorkbenchEvent[];
      reasoning?: { content: string; chars: number; partCount: number };
      compacted?: boolean;
    };

export interface PersistedConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: PersistedChatMessage[];
  stageSummaries?: ConversationStageSummary[];
  compressionState?: import("../../types/context-usage").ContextCompressionState;
  compressedContextSummary?: string;
}

export function isTransientAssistantPlaceholder(message: ChatMessage): boolean {
  return (
    message.role === "assistant" &&
    !message.content.trim() &&
    message.isComplete === false &&
    !message.agentMemory &&
    !(message.citedReferences && message.citedReferences.length > 0)
  );
}

function toPersistedAgentTurnMemory(memory: AgentTurnMemory): PersistedAgentTurnMemory {
  return {
    turnId: memory.turnId,
    createdAt: memory.createdAt,
    userQuestion: memory.userQuestion,
    scope: memory.scope,
    actionTraceSummary: {
      toolNames: memory.actionTraceSummary.toolNames,
    },
    // Do NOT use Set() here — it breaks index alignment across parallel arrays.
    footerReferenceDocIds: memory.footerReferenceDocIds,
    footerReferenceTitles: memory.footerReferenceTitles,
    footerReferenceBlockIds: memory.footerReferenceBlockIds,
    footerReferenceReasons: memory.footerReferenceReasons,
    footerReferenceReadLevels: memory.footerReferenceReadLevels,
    footerReferenceGroundedFlags: memory.footerReferenceGroundedFlags,
  };
}

function fromPersistedAgentTurnMemory(memory: PersistedAgentTurnMemory): AgentTurnMemory {
  // Ignore legacy answerSummary / answerItems if present in old persisted data
  return {
    turnId: memory.turnId,
    createdAt: memory.createdAt,
    userQuestion: memory.userQuestion,
    scope: memory.scope,
    actionTraceSummary: {
      toolNames: memory.actionTraceSummary.toolNames,
    },
    footerReferenceDocIds: memory.footerReferenceDocIds,
    footerReferenceTitles: memory.footerReferenceTitles,
    footerReferenceBlockIds: memory.footerReferenceBlockIds ?? [],
    footerReferenceReasons: memory.footerReferenceReasons ?? [],
    footerReferenceReadLevels: memory.footerReferenceReadLevels ?? [],
    footerReferenceGroundedFlags: memory.footerReferenceGroundedFlags ?? [],
  };
}

function truncatePersistedText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function toPersistedArgsPreview(argsPreview: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!argsPreview) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(argsPreview)) {
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = truncatePersistedText(value, 240);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 8).map((item) => {
        if (typeof item === "string") return truncatePersistedText(item, 120) ?? "";
        if (typeof item === "number" || typeof item === "boolean") return item;
        return "[object]";
      });
    } else {
      out[key] = "[object]";
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function toPersistedWorkbenchEvent(event: AgentWorkbenchEvent): PersistedWorkbenchEvent | null {
  switch (event.type) {
    case "ToolDispatch":
      return {
        type: "ToolDispatch",
        stepIndex: event.stepIndex,
        at: event.at,
        toolName: event.toolName,
        argsPreview: toPersistedArgsPreview(event.argsPreview),
      };
    case "ToolResult":
      return {
        type: "ToolResult",
        stepIndex: event.stepIndex,
        at: event.at,
        toolName: event.toolName,
        ok: event.ok,
        outputSummary: truncatePersistedText(event.outputSummary, 300),
        errorCode: truncatePersistedText(event.errorCode, 80),
        durationMs: event.durationMs,
      };
    case "TurnFailed":
      return {
        type: "TurnFailed",
        stepIndex: event.stepIndex,
        at: event.at,
        message: truncatePersistedText(event.message, 300),
        errorCode: truncatePersistedText(event.status, 80),
      };
    case "AssistantFinal":
      return {
        type: "AssistantFinal",
        stepIndex: event.stepIndex,
        at: event.at,
        message: truncatePersistedText(event.message, 200),
      };
    default:
      return null;
  }
}

function fromPersistedWorkbenchEvent(event: PersistedWorkbenchEvent): AgentWorkbenchEvent | null {
  const at = event.at ?? Date.now();
  const stepIndex = event.stepIndex ?? 0;
  switch (event.type) {
    case "ToolDispatch":
      return {
        type: "ToolDispatch",
        stepIndex,
        at,
        toolCallId: `persisted-${stepIndex}-${event.toolName ?? "tool"}`,
        toolName: event.toolName ?? "unknown",
        argsPreview: event.argsPreview ?? {},
        readOnly: true,
        startedAt: at,
      };
    case "ToolResult":
      return {
        type: "ToolResult",
        stepIndex,
        at,
        toolCallId: `persisted-${stepIndex}-${event.toolName ?? "tool"}`,
        toolName: event.toolName ?? "unknown",
        ok: event.ok ?? false,
        outputSummary: event.outputSummary,
        errorCode: event.errorCode,
        durationMs: event.durationMs ?? 0,
      };
    case "TurnFailed":
      return {
        type: "TurnFailed",
        stepIndex,
        at,
        message: event.message,
        status: event.errorCode,
      };
    case "AssistantFinal":
      return {
        type: "AssistantFinal",
        stepIndex,
        at,
        message: event.message,
      };
    default:
      return null;
  }
}

function toPersistedReferenceItem(item: ReferenceItem): PersistedReferenceItem {
  return {
    index: item.index,
    docId: item.docId,
    readLevel: item.readLevel,
    referenceReason: item.referenceReason,
    grounded: item.grounded,
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
    referenceReason: item.referenceReason,
    grounded: item.grounded,
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
      if (message.agentMemory) {
        persisted.agentMemory = toPersistedAgentTurnMemory(message.agentMemory);
      }
      if (message.isComplete !== false && message.workbenchEvents && message.workbenchEvents.length > 0) {
        const persistedEvents = message.workbenchEvents
          .map(toPersistedWorkbenchEvent)
          .filter((event): event is PersistedWorkbenchEvent => event !== null);
        if (persistedEvents.length > 0) persisted.workbenchEvents = persistedEvents;
      }
      if (message.reasoning?.status === "done" && message.reasoning.content.trim().length > 0) {
        persisted.reasoning = {
          content: message.reasoning.content,
          chars: message.reasoning.chars,
          partCount: message.reasoning.partCount,
        };
      }
      if (message.compacted) persisted.compacted = true;
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
      if (message.agentMemory) {
        assistantMsg.agentMemory = fromPersistedAgentTurnMemory(message.agentMemory);
      }
      if (message.workbenchEvents && message.workbenchEvents.length > 0) {
        const restoredEvents = message.workbenchEvents
          .map(fromPersistedWorkbenchEvent)
          .filter((event): event is AgentWorkbenchEvent => event !== null);
        if (restoredEvents.length > 0) assistantMsg.workbenchEvents = restoredEvents;
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
    stageSummaries: session.stageSummaries ?? [],
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
    stageSummaries: persisted.stageSummaries ?? [],
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
