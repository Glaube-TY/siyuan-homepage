import type {
  AssistantChatMessage,
  AttachedKbDoc,
  ChatMessage,
  CitationSegment,
  ErrorChatMessage,
  KbConversationSession,
  ReferenceItem,
  UserChatMessage,
} from "../../types/chat";
import type { AgentTurnMemory } from "../agent-workbench/memory/agent-turn-memory";
import type { AgentWorkbenchEvent } from "../agent-workbench/contracts/turn-event";
import type { ThinkingMode, WebAccessMode } from "../../types/session";
import type { ContextCompactionSnapshot } from "../../types/context-compaction";
import { CURRENT_CONVERSATION_SCHEMA_VERSION, type CurrentConversationRecord, type LegacyConversationRecord } from "../../types/conversation-record";
import { sanitizePersistedSummaryText } from "./persisted-summary-sanitizer";
import {
  hasSettledWorkbenchTerminal,
  isProviderOutputTruncatedWorkbench,
} from "../agent-workbench/runtime/workbench-terminal-state";
import {
  normalizeTemporaryWorkbench,
  normalizeTemporaryWorkbenchReference,
  toTemporaryWorkbenchReference,
  type AgentTemporaryWorkbenchReference,
} from "../agent-workbench/tools/homepage/homepage-workbench.tool";
import {
  attachTemporaryWorkbenchUsage,
  saveTemporaryWorkbench,
} from "../agent-workbench/tools/homepage/temporary-workbench-store";

export interface PersistedReferenceItem {
  index: number;
  docId?: string;
  sourceBlockIds?: string[];
  readLevel?: "content" | "structure" | "candidate";
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
  eventId?: string;
  sessionId?: string;
  runId?: string;
  correlationId?: string;
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
  providerFinishReason?: string;
  outputChars?: number;
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
      temporaryWorkbenches?: AgentTemporaryWorkbenchReference[];
      reasoning?: { content: string; chars: number; partCount: number };
    };

export interface PersistedConversation {
  schemaVersion: 3;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: PersistedChatMessage[];
  latestCompactionSnapshot?: ContextCompactionSnapshot;
  /** 会话级"深度思考"按钮状态；旧文件缺字段时默认 "off" */
  thinkingMode?: ThinkingMode;
  /** 会话级"联网搜索"按钮状态；旧文件缺字段时默认 "off" */
  webAccessMode?: WebAccessMode;
}

export function isTransientAssistantPlaceholder(message: ChatMessage): boolean {
  return (
    message.role === "assistant" &&
    !message.content.trim() &&
    message.isComplete === false &&
    !message.agentMemory &&
    !(message.citedReferences && message.citedReferences.length > 0) &&
    !(message.workbenchEvents && message.workbenchEvents.length > 0) &&
    !(message.temporaryWorkbenches && message.temporaryWorkbenches.length > 0)
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

function sanitizeCompactionSnapshot(
  snapshot: ContextCompactionSnapshot | undefined,
): ContextCompactionSnapshot | undefined {
  // V1 snapshots used a different coverage/merge contract. They are ignored
  // deliberately; the transcript remains readable and can be compacted again.
  if (!snapshot || snapshot.version !== 2) return undefined;
  const list = (values: unknown): string[] => Array.isArray(values)
    ? [...new Set(values
      .map((value) => sanitizePersistedSummaryText(value, 320))
      .filter((value): value is string => !!value))]
      .slice(0, 20)
    : [];
  const state = snapshot.state;
  return {
    version: 2,
    generation: Number.isSafeInteger(snapshot.generation) && snapshot.generation >= 0 ? snapshot.generation : 0,
    createdAt: Number.isFinite(snapshot.createdAt) ? snapshot.createdAt : Date.now(),
    trigger: snapshot.trigger === "manual" || snapshot.trigger === "auto" || snapshot.trigger === "hard"
      ? snapshot.trigger
      : "auto",
    coveredThroughTurnIndex: Number.isSafeInteger(snapshot.coveredThroughTurnIndex)
      ? snapshot.coveredThroughTurnIndex
      : 0,
    coveredThroughMessageId: typeof snapshot.coveredThroughMessageId === "string"
      ? snapshot.coveredThroughMessageId.slice(0, 200)
      : "",
    sourceHash: typeof snapshot.sourceHash === "string" ? snapshot.sourceHash.slice(0, 32) : "",
    state: {
      currentGoal: sanitizePersistedSummaryText(state.currentGoal, 500) ?? "",
      userConstraints: list(state.userConstraints),
      importantDecisions: list(state.importantDecisions),
      completedWork: list(state.completedWork),
      currentState: list(state.currentState),
      unresolvedIssues: list(state.unresolvedIssues),
      nextActions: list(state.nextActions),
      importantReferences: list(state.importantReferences),
      verifiedWriteOutcomes: list(state.verifiedWriteOutcomes),
    },
    ...(Number.isSafeInteger(snapshot.estimatedTokens) && snapshot.estimatedTokens >= 0
      ? { estimatedTokens: snapshot.estimatedTokens }
      : {}),
    ...(snapshot.stale ? { stale: true } : {}),
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
  const identity = {
    eventId: event.eventId,
    sessionId: event.sessionId,
    runId: event.runId,
    correlationId: event.correlationId,
  };
  switch (event.type) {
    case "tool_start":
      return {
        type: "tool_start",
        ...identity,
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
        ...identity,
        stepIndex: event.stepIndex,
        at: event.at,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argsPreview: toPersistedArgsPreview(event.argsPreview),
        ok: event.result.ok,
        outputSummary: sanitizePersistedSummaryText(event.result.summary, 300),
        errorCode: truncatePersistedText(event.result.errorCode ?? event.result.code, 80),
        durationMs: event.durationMs,
        safeTargetPreview: event.result.safeTargetPreview,
      };
    case "error":
      return {
        type: "error",
        ...identity,
        stepIndex: event.stepIndex,
        at: event.at,
        message: sanitizePersistedSummaryText(event.message, 300),
        errorCode: truncatePersistedText(event.code, 80),
      };
    case "assistant_final":
      return {
        type: "assistant_final",
        ...identity,
        stepIndex: event.stepIndex,
        at: event.at,
        message: truncatePersistedText(event.answer, 200),
      };
    case "done":
      return {
        type: "done",
        ...identity,
        stepIndex: event.stepIndex,
        at: event.at,
        status: event.status,
        providerFinishReason: truncatePersistedText(event.providerFinishReason, 80),
        outputChars: event.outputChars,
      };
    case "notice":
      return {
        type: "notice",
        ...identity,
        stepIndex: event.stepIndex,
        at: event.at,
        message: sanitizePersistedSummaryText(event.message, 200),
      };
    default:
      return null;
  }
}

function fromPersistedWorkbenchEvent(event: PersistedWorkbenchEvent): AgentWorkbenchEvent | null {
  if (!event.eventId || !event.sessionId || !event.runId || !event.correlationId) return null;
  const identity = {
    eventId: event.eventId,
    sessionId: event.sessionId,
    runId: event.runId,
    correlationId: event.correlationId,
  };
  const at = event.at ?? Date.now();
  const stepIndex = event.stepIndex ?? 0;
  switch (event.type) {
    case "tool_start":
      return {
        type: "tool_start",
        ...identity,
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
        ...identity,
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
        argsPreview: toPersistedArgsPreview(event.argsPreview),
        durationMs: event.durationMs ?? 0,
      };
    case "error":
      return {
        type: "error",
        ...identity,
        stepIndex,
        at,
        message: sanitizePersistedSummaryText(event.message, 300) ?? event.message ?? "",
        code: event.errorCode ?? "agent_workbench_runtime_error",
      };
    case "assistant_final":
      return {
        type: "assistant_final",
        ...identity,
        stepIndex,
        at,
        answer: event.message ?? "",
      };
    case "done":
      return {
        type: "done",
        ...identity,
        stepIndex,
        at,
        status: (event.status as "answer_ready" | "failed" | "cancelled" | undefined) ?? "failed",
        providerFinishReason: event.providerFinishReason,
        outputChars: event.outputChars,
      };
    case "notice":
      return {
        type: "notice",
        ...identity,
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
    sourceBlockIds: item.sourceBlockIds?.slice(0, 8),
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
    sourceBlockIds: item.sourceBlockIds ?? [],
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
      }
      return persisted;
    }
    case "assistant": {
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
      // 工具事件本身已经过安全裁剪。即使本轮被停止或失败，也要保留执行记录，
      // 否则刷新后会丢失失败原因与工具统计。
      if (message.workbenchEvents && message.workbenchEvents.length > 0) {
        const persistedEvents = message.workbenchEvents
          .map(toPersistedWorkbenchEvent)
          .filter((event): event is PersistedWorkbenchEvent => event !== null);
        if (persistedEvents.length > 0) persisted.workbenchEvents = persistedEvents;
      }
      if (message.temporaryWorkbenches && message.temporaryWorkbenches.length > 0) {
        const workbenches = message.temporaryWorkbenches
          .map(normalizeTemporaryWorkbenchReference)
          .filter((item): item is AgentTemporaryWorkbenchReference => item !== undefined)
          .slice(-3);
        if (workbenches.length > 0) persisted.temporaryWorkbenches = workbenches;
      }
      if (message.reasoning?.status === "done" && message.reasoning.content.trim().length > 0) {
        persisted.reasoning = {
          content: message.reasoning.content,
          chars: message.reasoning.chars,
          partCount: message.reasoning.partCount,
        };
      }
      return persisted;
    }
    case "loading":
      return null;
    default:
      return null;
  }
}

function fromPersistedMessage(message: PersistedChatMessage, conversationId: string): ChatMessage {
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
        if (restoredEvents.length > 0) {
          assistantMsg.workbenchEvents = restoredEvents;
          // 兼容旧版终态落盘竞态：已明确结束的运行时终态可以修复错误的未完成标记。
          // 达到模型输出上限时正文确实可能不完整，必须保留 isComplete=false。
          if (
            hasSettledWorkbenchTerminal(restoredEvents)
            && !isProviderOutputTruncatedWorkbench(restoredEvents)
            && assistantMsg.content.trim().length > 0
          ) {
            assistantMsg.isComplete = true;
          }
        }
      }
      if (message.temporaryWorkbenches && message.temporaryWorkbenches.length > 0) {
        const workbenches = message.temporaryWorkbenches
          .map((value) => {
            const legacy = normalizeTemporaryWorkbench(value);
            if (legacy) {
              void (async () => {
                await saveTemporaryWorkbench(legacy, {
                  profileId: "knowledge-chat",
                  label: "AI 知识库对话",
                  conversationId,
                  messageId: message.id,
                });
                await attachTemporaryWorkbenchUsage([legacy.id], {
                  kind: "chat-message",
                  id: `${conversationId}:${message.id}`,
                  label: "AI 知识库对话",
                  conversationId,
                  messageId: message.id,
                });
              })().catch(() => undefined);
              return toTemporaryWorkbenchReference(legacy);
            }
            return normalizeTemporaryWorkbenchReference(value);
          })
          .filter((item): item is AgentTemporaryWorkbenchReference => item !== undefined)
          .slice(-3);
        if (workbenches.length > 0) assistantMsg.temporaryWorkbenches = workbenches;
      }
      if (message.reasoning && message.reasoning.content.trim().length > 0) {
        assistantMsg.reasoning = {
          content: message.reasoning.content,
          status: "done",
          chars: message.reasoning.chars,
          partCount: message.reasoning.partCount,
        };
      }
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
    schemaVersion: CURRENT_CONVERSATION_SCHEMA_VERSION,
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages.map(toPersistedMessage).filter((m): m is PersistedChatMessage => !!m),
    latestCompactionSnapshot: sanitizeCompactionSnapshot(session.latestCompactionSnapshot),
    thinkingMode: session.thinkingMode,
    webAccessMode: session.webAccessMode,
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
    messages: persisted.messages.map((message) => fromPersistedMessage(message, persisted.id)),
    latestCompactionSnapshot: sanitizeCompactionSnapshot(persisted.latestCompactionSnapshot),
    // 会话按钮字段缺失时归一化为 "off"
    thinkingMode: normalizeThinkingMode(persisted.thinkingMode),
    webAccessMode: normalizeWebAccessMode(persisted.webAccessMode),
    ...defaults,
  };
}

const LEGACY_INTERNAL_ROLES = new Set([
  "tool",
  "system",
  "internal",
  "runtime",
  "agent_runtime",
  "runtime_only",
  "runtime-only",
  "tool_result",
  "tool_output",
  "assistant_runtime",
  "assistant-runtime",
  "loading",
]);

function parseLegacyAttachedDocs(value: unknown, fallbackCreatedAt: number): AttachedKbDoc[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const docs = value.slice(0, 32).flatMap((item): AttachedKbDoc[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const docId = sanitizePersistedSummaryText(source.docId, 200);
    const title = sanitizePersistedSummaryText(source.title, 300);
    if (!docId || !title) return [];
    const box = sanitizePersistedSummaryText(source.box, 200);
    const path = sanitizePersistedSummaryText(source.path, 500);
    return [{
      docId,
      title,
      source: source.source === "current_doc" ? "current_doc" : "manual_search",
      createdAt: Number.isFinite(source.createdAt) ? Number(source.createdAt) : fallbackCreatedAt,
      ...(box ? { box } : {}),
      ...(path ? { path } : {}),
    }];
  });
  return docs.length > 0 ? docs : undefined;
}

function parseLegacyCitationSegments(value: unknown): CitationSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const segments = value.slice(0, 64).flatMap((item): CitationSegment[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const text = sanitizePersistedSummaryText(source.text, 2_000);
    const citationIds = Array.isArray(source.citationIds)
      ? [...new Set(source.citationIds.filter((id): id is number => Number.isInteger(id) && id >= 0 && id < 100_000))]
      : [];
    return text && citationIds.length > 0 ? [{ text, citationIds }] : [];
  });
  return segments.length > 0 ? segments : undefined;
}

function parseLegacyReferences(value: unknown): ReferenceItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const references = value.slice(0, 32).flatMap((item, index): ReferenceItem[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const docTitle = sanitizePersistedSummaryText(source.docTitle ?? source.title, 300);
    if (!docTitle) return [];
    const rawSourceBlockIds = Array.isArray(source.sourceBlockIds) ? source.sourceBlockIds : source.blockIds;
    const sourceBlockIds = Array.isArray(rawSourceBlockIds)
      ? rawSourceBlockIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .slice(0, 32)
      : [];
    const sourceType = ["siyuan_doc", "web_page", "file", "mcp_resource", "api_result"]
      .includes(String(source.sourceType))
      ? source.sourceType as ReferenceItem["sourceType"]
      : undefined;
    const readLevel = ["content", "structure", "candidate"].includes(String(source.readLevel))
      ? source.readLevel as ReferenceItem["readLevel"]
      : undefined;
    const referenceReason = ["agent_explicit", "read_content", "structure_result", "search_candidate"]
      .includes(String(source.referenceReason))
      ? source.referenceReason as ReferenceItem["referenceReason"]
      : undefined;
    const docId = sanitizePersistedSummaryText(source.docId, 200);
    const displayTitle = sanitizePersistedSummaryText(source.displayTitle, 300);
    const box = sanitizePersistedSummaryText(source.box, 200);
    const path = sanitizePersistedSummaryText(source.path, 500);
    const url = sanitizePersistedSummaryText(source.url, 1_000);
    const sourceName = sanitizePersistedSummaryText(source.sourceName, 300);
    const provider = sanitizePersistedSummaryText(source.provider, 200);
    return [{
      index: Number.isInteger(source.index) ? Number(source.index) : index,
      docTitle,
      headingPathText: sanitizePersistedSummaryText(
        source.headingPathText
          ?? (Array.isArray(source.headingPath) ? source.headingPath.join(" > ") : undefined),
        500,
      ) ?? "",
      sourceBlockIds,
      ...(docId ? { docId } : {}),
      ...(displayTitle ? { displayTitle } : {}),
      ...(box ? { box } : {}),
      ...(path ? { path } : {}),
      ...(sourceType ? { sourceType } : {}),
      ...(url ? { url } : {}),
      ...(sourceName ? { sourceName } : {}),
      ...(provider ? { provider } : {}),
      ...(readLevel ? { readLevel } : {}),
      ...(referenceReason ? { referenceReason } : {}),
      ...(typeof source.grounded === "boolean" ? { grounded: source.grounded } : {}),
    }];
  });
  return references.length > 0 ? references : undefined;
}

/**
 * Tolerant reader for pre-V4 records. It intentionally returns an archive
 * record only; legacy compression/checkpoint/runtime fields never cross this
 * boundary into the current Agent runtime.
 */
export function parseLegacyConversationRecord(
  raw: unknown,
  fallback: { id: string; title?: string; createdAt?: number; updatedAt?: number },
): LegacyConversationRecord {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  // The index ID is authoritative when available; a damaged file must not
  // escape its indexed archive slot by supplying a different ID.
  const id = fallback.id || (typeof source.id === "string" && source.id.trim() ? source.id : "legacy");
  const title = typeof source.title === "string" && source.title.trim()
    ? source.title
    : fallback.title ?? "旧版对话";
  const createdAt = Number.isFinite(source.createdAt) ? Number(source.createdAt) : fallback.createdAt ?? Date.now();
  const updatedAt = Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : fallback.updatedAt ?? createdAt;
  const rawMessages = Array.isArray(source.messages) ? source.messages : [];
  const messages: ChatMessage[] = [];
  let ignoredInternalCount = 0;
  let unparseableVisibleCount = 0;
  for (let index = 0; index < rawMessages.length; index += 1) {
    const message = rawMessages[index];
    if (!message || typeof message !== "object") continue;
    const item = message as Record<string, unknown>;
    const role = item.role;
    if (typeof role === "string" && LEGACY_INTERNAL_ROLES.has(role)) {
      ignoredInternalCount += 1;
      continue;
    }
    if (role !== "user" && role !== "assistant" && role !== "error") continue;
    if (typeof item.content !== "string") {
      unparseableVisibleCount += 1;
      continue;
    }
    const messageId = typeof item.id === "string" && item.id.trim()
      ? item.id
      : `${id}-legacy-${index}`;
    const messageCreatedAt = Number.isFinite(item.createdAt) ? Number(item.createdAt) : createdAt + index;
    if (role === "user") {
      const attachedDocs = parseLegacyAttachedDocs(item.attachedDocs, messageCreatedAt);
      messages.push({
        id: messageId,
        role,
        content: item.content,
        createdAt: messageCreatedAt,
        ...(attachedDocs ? { attachedDocs } : {}),
      });
    } else if (role === "assistant") {
      const citationSegments = parseLegacyCitationSegments(item.citationSegments);
      const citedReferences = parseLegacyReferences(item.citedReferences);
      messages.push({
        id: messageId,
        role,
        content: item.content,
        createdAt: messageCreatedAt,
        isComplete: item.isComplete === false ? false : true,
        ...(citationSegments ? { citationSegments } : {}),
        ...(citedReferences ? { citedReferences } : {}),
      });
    } else {
      messages.push({ id: messageId, role, content: item.content, createdAt: messageCreatedAt });
    }
  }
  const corrupted = !Array.isArray(source.messages) || unparseableVisibleCount > 0;
  return {
    id,
    title,
    createdAt,
    updatedAt,
    messages,
    kind: "legacy",
    readOnly: true,
    legacySchemaVersion: source.schemaVersion,
    ...(ignoredInternalCount > 0 ? { ignoredInternalCount } : {}),
    ...(unparseableVisibleCount > 0 ? { unparseableVisibleCount } : {}),
    ...(corrupted ? { corrupted: true, archiveError: "旧版会话部分消息无法解析，已按可读归档保留。" } : {}),
  };
}

export function asCurrentConversationRecord(
  session: KbConversationSession,
): CurrentConversationRecord {
  return {
    ...session,
    kind: "current",
    readOnly: false,
    schemaVersion: 3,
  };
}
