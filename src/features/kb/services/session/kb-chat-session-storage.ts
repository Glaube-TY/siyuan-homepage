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
import type { AgentMessage } from "../agent-core/messages/agent-message";
import { compactAgentSessionMessagesForStorage } from "../agent-core/messages/message-compactor";
import type { ThinkingMode, WebAccessMode } from "../../types/session";
import { sanitizeMessageForStorage } from "../agent-core/session/session-store";
import { sanitizePersistedSummaryText } from "./persisted-summary-sanitizer";

export interface PersistedReferenceItem {
  index: number;
  docId?: string;
  readLevel?: "content" | "structure" | "candidate" | "snippet" | "section" | "document";
  referenceReason?: "agent_explicit" | "read_content" | "structure_result" | "search_candidate";
  grounded?: boolean;
  docTitle?: string;
  displayTitle?: string;
  box?: string;
  path?: string;
  sourceType?: "siyuan_doc" | "web_page" | "file" | "mcp_resource" | "api_result";
  url?: string;
  sourceName?: string;
  provider?: string;
}

export interface PersistedAgentTurnMemory {
  turnId: string;
  createdAt: number;
  userQuestion: string;
  scope?: AgentTurnMemory["scope"];
  actionTraceSummary: {
    toolNames: string[];
    outcomes?: import("../agent-workbench/memory/agent-turn-memory").AgentTurnActionOutcome[];
    lastTouchedDocIds?: string[];
    lastTouchedBlockIds?: string[];
    lastTouchedTitles?: string[];
    lastWriteStatus?: "none" | "success" | "failed" | "partial" | "rejected" | "aborted";
    lastWriteSummary?: string;
  };
  footerReferenceDocIds: string[];
  footerReferenceTitles: string[];
  footerReferenceBlockIds?: string[];
  footerReferenceReasons?: string[];
  footerReferenceReadLevels?: string[];
  footerReferenceGroundedFlags?: boolean[];
  footerReferenceSourceTypes?: string[];
  footerReferenceUrls?: string[];
  footerReferenceSourceNames?: string[];
  footerReferenceProviders?: string[];
}

export interface PersistedWorkbenchEvent {
  type: "tool_start" | "tool_result" | "error" | "assistant_final" | "done" | "notice";
  stepIndex?: number;
  at?: number;
  toolName?: string;
  toolCallId?: string;
  argsPreview?: Record<string, unknown>;
  readOnly?: boolean;
  ok?: boolean;
  outputSummary?: string;
  errorCode?: string;
  status?: string;
  durationMs?: number;
  message?: string;
  safeTargetPreview?: {
    targetDocIds?: string[];
    targetBlockIds?: string[];
    targetTitles?: string[];
    requestedCount?: number;
    affectedCount?: number;
    reasonCode?: string;
  };
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
  /** 会话级"深度思考"按钮状态；旧文件缺字段时默认 "off" */
  thinkingMode?: ThinkingMode;
  /** 会话级"联网搜索"按钮状态；旧文件缺字段时默认 "off" */
  webAccessMode?: WebAccessMode;
  agentSession?: {
    id: string;
    messages: AgentMessage[];
    updatedAt: number;
  };
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
      outcomes: memory.actionTraceSummary.outcomes?.map(sanitizePersistedActionOutcome),
      lastTouchedDocIds: memory.actionTraceSummary.lastTouchedDocIds,
      lastTouchedBlockIds: memory.actionTraceSummary.lastTouchedBlockIds,
      lastTouchedTitles: memory.actionTraceSummary.lastTouchedTitles,
      lastWriteStatus: memory.actionTraceSummary.lastWriteStatus,
      lastWriteSummary: sanitizePersistedSummaryText(
        memory.actionTraceSummary.lastWriteSummary,
        300,
      ),
    },
    // Do NOT use Set() here — it breaks index alignment across parallel arrays.
    footerReferenceDocIds: memory.footerReferenceDocIds,
    footerReferenceTitles: memory.footerReferenceTitles,
    footerReferenceBlockIds: memory.footerReferenceBlockIds,
    footerReferenceReasons: memory.footerReferenceReasons,
    footerReferenceReadLevels: memory.footerReferenceReadLevels,
    footerReferenceGroundedFlags: memory.footerReferenceGroundedFlags,
    footerReferenceSourceTypes: memory.footerReferenceSourceTypes,
    footerReferenceUrls: memory.footerReferenceUrls,
    footerReferenceSourceNames: memory.footerReferenceSourceNames,
    footerReferenceProviders: memory.footerReferenceProviders,
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
      toolNames: memory.actionTraceSummary.toolNames ?? [],
      outcomes: memory.actionTraceSummary.outcomes?.map(sanitizePersistedActionOutcome),
      lastTouchedDocIds: memory.actionTraceSummary.lastTouchedDocIds,
      lastTouchedBlockIds: memory.actionTraceSummary.lastTouchedBlockIds,
      lastTouchedTitles: memory.actionTraceSummary.lastTouchedTitles,
      lastWriteStatus: memory.actionTraceSummary.lastWriteStatus,
      lastWriteSummary: sanitizePersistedSummaryText(
        memory.actionTraceSummary.lastWriteSummary,
        300,
      ) ?? memory.actionTraceSummary.lastWriteSummary,
    },
    footerReferenceDocIds: memory.footerReferenceDocIds,
    footerReferenceTitles: memory.footerReferenceTitles,
    footerReferenceBlockIds: memory.footerReferenceBlockIds ?? [],
    footerReferenceReasons: memory.footerReferenceReasons ?? [],
    footerReferenceReadLevels: memory.footerReferenceReadLevels ?? [],
    footerReferenceGroundedFlags: memory.footerReferenceGroundedFlags ?? [],
    footerReferenceSourceTypes: memory.footerReferenceSourceTypes ?? [],
    footerReferenceUrls: memory.footerReferenceUrls ?? [],
    footerReferenceSourceNames: memory.footerReferenceSourceNames ?? [],
    footerReferenceProviders: memory.footerReferenceProviders ?? [],
  };
}

function truncatePersistedText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function sanitizePersistedActionOutcome(
  outcome: import("../agent-workbench/memory/agent-turn-memory").AgentTurnActionOutcome,
): import("../agent-workbench/memory/agent-turn-memory").AgentTurnActionOutcome {
  return {
    ...outcome,
    summary: sanitizePersistedSummaryText(outcome.summary, 120) ?? outcome.summary,
    errorCode: sanitizePersistedSummaryText(outcome.errorCode, 80) ?? outcome.errorCode,
    targetTitles: outcome.targetTitles?.map(
      (title) => sanitizePersistedSummaryText(title, 120) ?? title,
    ),
  };
}

function sanitizeConversationStageSummary(
  summary: import("../../types/chat").ConversationStageSummary,
): import("../../types/chat").ConversationStageSummary {
  const sanitizedSummary = sanitizePersistedSummaryText(summary.summary, 6000) ?? summary.summary;
  return {
    ...summary,
    summary: sanitizedSummary,
    summaryChars: sanitizedSummary.length,
  };
}

function toPersistedArgsPreview(argsPreview: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!argsPreview) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(argsPreview)) {
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = sanitizePersistedSummaryText(value, 240);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 8).map((item) => {
        if (typeof item === "string") return sanitizePersistedSummaryText(item, 120) ?? "";
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
    case "tool_start":
      return {
        type: "tool_start",
        stepIndex: event.stepIndex,
        at: event.at,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argsPreview: toPersistedArgsPreview(event.argsPreview),
        readOnly: event.readOnly,
      };
    case "tool_result":
      return {
        type: "tool_result",
        stepIndex: event.stepIndex,
        at: event.at,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ok: event.result.ok,
        outputSummary: sanitizePersistedSummaryText(event.result.summary, 300),
        errorCode: truncatePersistedText(event.result.errorCode ?? event.result.code, 80),
        durationMs: event.durationMs,
        safeTargetPreview: event.result.safeTargetPreview,
      };
    case "error":
      return {
        type: "error",
        stepIndex: event.stepIndex,
        at: event.at,
        message: sanitizePersistedSummaryText(event.message, 300),
        errorCode: truncatePersistedText(event.code, 80),
      };
    case "assistant_final":
      return {
        type: "assistant_final",
        stepIndex: event.stepIndex,
        at: event.at,
        message: truncatePersistedText(event.answer, 200),
      };
    case "done":
      return {
        type: "done",
        stepIndex: event.stepIndex,
        at: event.at,
        status: event.status,
      };
    case "notice":
      return {
        type: "notice",
        stepIndex: event.stepIndex,
        at: event.at,
        message: sanitizePersistedSummaryText(event.message, 200),
      };
    default:
      return null;
  }
}

function fromPersistedWorkbenchEvent(event: PersistedWorkbenchEvent): AgentWorkbenchEvent | null {
  const at = event.at ?? Date.now();
  const stepIndex = event.stepIndex ?? 0;
  switch (event.type) {
    case "tool_start":
      return {
        type: "tool_start",
        stepIndex,
        at,
        toolCallId: event.toolCallId ?? `persisted-${stepIndex}-${event.toolName ?? "tool"}`,
        toolName: event.toolName ?? "unknown",
        argsPreview: toPersistedArgsPreview(event.argsPreview) ?? {},
        readOnly: event.readOnly ?? true,
        startedAt: at,
      };
    case "tool_result":
      return {
        type: "tool_result",
        stepIndex,
        at,
        toolCallId: event.toolCallId ?? `persisted-${stepIndex}-${event.toolName ?? "tool"}`,
        toolName: event.toolName ?? "unknown",
        result: {
          ok: event.ok ?? false,
          content: "",
          summary: sanitizePersistedSummaryText(event.outputSummary, 300) ?? event.outputSummary ?? "",
          errorCode: event.errorCode,
          safeTargetPreview: event.safeTargetPreview,
        },
        durationMs: event.durationMs ?? 0,
      };
    case "error":
      return {
        type: "error",
        stepIndex,
        at,
        message: sanitizePersistedSummaryText(event.message, 300) ?? event.message ?? "",
        code: event.errorCode ?? "agent_workbench_runtime_error",
      };
    case "assistant_final":
      return {
        type: "assistant_final",
        stepIndex,
        at,
        answer: event.message ?? "",
      };
    case "done":
      return {
        type: "done",
        stepIndex,
        at,
        status: (event.status as "answer_ready" | "failed" | "cancelled" | undefined) ?? "failed",
      };
    case "notice":
      return {
        type: "notice",
        stepIndex,
        at,
        message: sanitizePersistedSummaryText(event.message, 200) ?? event.message ?? "",
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
    sourceType: item.sourceType,
    url: item.url,
    sourceName: item.sourceName,
    provider: item.provider,
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
    sourceType: item.sourceType,
    url: item.url,
    sourceName: item.sourceName,
    provider: item.provider,
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

/** 规范化 ThinkingMode：仅接受 "off" | "on"，其余值（含 undefined）归一为 "off" */
function normalizeThinkingMode(value: unknown): ThinkingMode {
  return value === "on" ? "on" : "off";
}

/** 规范化 WebAccessMode：仅接受 "off" | "smart" | "required"，其余值（含 undefined）归一为 "off" */
function normalizeWebAccessMode(value: unknown): WebAccessMode {
  return value === "smart" || value === "required" ? value : "off";
}

export function toPersistedConversation(session: KbConversationSession): PersistedConversation {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages.map(toPersistedMessage).filter((m): m is PersistedChatMessage => !!m),
    stageSummaries: session.stageSummaries?.map(sanitizeConversationStageSummary) ?? [],
    compressionState: session.compressionState,
    compressedContextSummary:
      sanitizePersistedSummaryText(session.compressedContextSummary, 16000) ??
      session.compressedContextSummary,
    thinkingMode: session.thinkingMode,
    webAccessMode: session.webAccessMode,
    agentSession: session.agentSession
      ? {
          id: session.agentSession.id,
          messages: compactAgentSessionMessagesForStorage(session.agentSession.messages).map(
            sanitizeMessageForStorage,
          ),
          updatedAt: session.agentSession.updatedAt,
        }
      : undefined,
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
    stageSummaries: persisted.stageSummaries?.map(sanitizeConversationStageSummary) ?? [],
    compressionState: persisted.compressionState,
    compressedContextSummary:
      sanitizePersistedSummaryText(persisted.compressedContextSummary, 16000) ??
      persisted.compressedContextSummary,
    // 旧 session 文件没有这两个字段时，归一化为 "off"，保持向前兼容
    thinkingMode: normalizeThinkingMode(persisted.thinkingMode),
    webAccessMode: normalizeWebAccessMode(persisted.webAccessMode),
    agentSession: persisted.agentSession,
    ...defaults,
  };
}
