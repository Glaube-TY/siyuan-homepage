/**
 * Conversation Context Builder
 *
 * Builds the session history JSON visible to Planner. It never includes
 * historical tool observations, workbench events, debug traces, full prompts,
 * internal paths, or tool return bodies.
 */
import type {
  AssistantChatMessage,
  ChatMessage,
  ConversationStageSummary,
  ReferenceItem,
  UserChatMessage,
} from "../../../types/chat";
import type { ContextCompressionState } from "../../../types/context-usage";
import {
  getCompleteConversationTurns,
  isCompletedAssistantMessage,
} from "./conversation-turns";

export interface ConversationReferenceContext {
  sourceType?: "siyuan_doc" | "web_page" | "file" | "mcp_resource" | "api_result";
  docId?: string;
  blockId?: string;
  url?: string;
  fileId?: string;
  resourceId?: string;
  title?: string;
  sourceName?: string;
  provider?: string;
  referenceReason?: "planner_explicit" | "read_content" | "structure_result" | "search_candidate";
  readLevel?: "content" | "structure" | "candidate";
  grounded?: boolean;
}

export interface ConversationTurnContext {
  turnIndex: number;
  userMessageId?: string;
  assistantMessageId?: string;
  createdAt?: number;
  user: {
    text: string;
    attachedDocs?: Array<{
      docId: string;
      title: string;
      source?: string;
    }>;
  };
  assistant?: {
    finalAnswer: string;
    references?: ConversationReferenceContext[];
    scope?: {
      type?: string;
      docId?: string;
      rootDocId?: string;
      notebookId?: string;
      docIds?: string[];
    };
  };
}

export type StageSummaryPressureLevel = "none" | "suggested" | "recommended" | "urgent" | "required";

export interface StageSummaryStatus {
  existingCount: number;
  lastSummarizedTurnIndex: number;
  unsummarizedTurnCount: number;
  lastSummaryCreatedAt?: number;
  note: string;
  pressureLevel: StageSummaryPressureLevel;
  pressureReason: string;
}

export interface RuntimeNowInfo {
  iso: string;
  localText: string;
  timezone: string | undefined;
  timezoneOffsetMinutes: number;
  timestampMs: number;
}

export interface ConversationContextSnapshot {
  version: number;
  currentTurn: {
    userQuestion: string;
    scope?: {
      type?: string;
      customDocCount?: number;
      attachedDocCount?: number;
      currentDocId?: string;
    };
    attachedDocs?: Array<{
      docId: string;
      title: string;
      source?: string;
    }>;
    runtimeNow?: RuntimeNowInfo;
    webAccess?: {
      enabled: boolean;
      mode: "smart" | "required";
      provider: string;
      maxResults: number;
      readPageMaxChars: number;
    };
    webReadAccess?: {
      enabled: true;
    };
  };
  stageSummaryStatus: StageSummaryStatus;
  compressed?: {
    summary: string;
    compressedMessageCount?: number;
    compressedTurnCount?: number;
    compressedStageSummaryCount?: number;
    latestCompressedStageIndex?: number;
    latestCompressedTurnIndex?: number;
    summaryChars?: number;
    lastCompressedAt?: number;
  };
  recentTurns: ConversationTurnContext[];
  note: string;
  /** 全局记忆内容（已截断处理） */
  globalMemory?: string;
}

export interface BuildConversationContextParams {
  messages: ChatMessage[];
  stageSummaries?: ConversationStageSummary[];
  currentUserMessageId?: string;
  currentQuestion: string;
  compressedContextSummary?: string;
  compressionState?: ContextCompressionState;
  usageRatio?: number;
  webSearchSettings?: {
    enabled: boolean;
    provider: string;
    maxResults: number;
    readPageMaxChars: number;
  };
  /** Override webAccessMode for current turn. Takes priority over user message requestContext.webAccessMode. */
  webAccessModeOverride?: "off" | "smart" | "required";
  /** 全局记忆内容（已截断处理） */
  globalMemory?: string;
}

const SNAPSHOT_VERSION = 2;
const MAX_USER_TEXT_CHARS = 1000;
const MAX_ASSISTANT_FINAL_ANSWER_CHARS = 3000;
const MAX_REFERENCES = 10;
const MAX_COMPRESSED_SUMMARY_CHARS = 8000;

const SNAPSHOT_NOTE =
  "本上下文只包含当前问题、阶段摘要状态、已压缩阶段摘要和未压缩的历史问答原文；不包含历史工具事件、调试信息、工具返回正文或内部路径。需要正文时，请根据可信资源 ID 决定是否使用读取能力。";

const STAGE_SUMMARY_STATUS_NOTE_UNCOMPRESSED =
  "已有阶段摘要正文暂不展示；如果本轮要输出 stageSummary，只总结 lastSummarizedTurnIndex 之后的新对话，并覆盖到当前最终回答为止；不要重述已有阶段摘要。";

const STAGE_SUMMARY_STATUS_NOTE_COMPRESSED =
  "已压缩阶段摘要见 compressed.summary；如果本轮要输出 stageSummary，只总结 lastSummarizedTurnIndex 之后的新对话，不要重述已有阶段摘要。";

function truncateText(value: string | undefined, maxChars: number): string {
  const text = (value ?? "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function buildAttachedDocs(user: UserChatMessage | undefined): ConversationContextSnapshot["currentTurn"]["attachedDocs"] {
  const docs = user?.attachedDocs
    ?.map((doc) => ({
      docId: doc.docId,
      title: doc.title,
      source: doc.source,
    }))
    .filter((doc) => doc.docId && doc.title);

  return docs && docs.length > 0 ? docs : undefined;
}

function buildTurnAttachedDocs(user: UserChatMessage): ConversationTurnContext["user"]["attachedDocs"] {
  return buildAttachedDocs(user);
}

function resolveWebAccessMode(
  user: UserChatMessage | undefined,
  settings: BuildConversationContextParams["webSearchSettings"],
  override?: "off" | "smart" | "required",
): "smart" | "required" | undefined {
  if (!settings?.enabled) return undefined;
  const mode = override ?? user?.requestContext?.webAccessMode;
  if (!mode || mode === "off") return undefined;
  return mode;
}

function buildWebSearchAccess(
  user: UserChatMessage | undefined,
  settings: BuildConversationContextParams["webSearchSettings"],
  override?: "off" | "smart" | "required",
): ConversationContextSnapshot["currentTurn"]["webAccess"] {
  const mode = resolveWebAccessMode(user, settings, override);
  if (!mode) return undefined;
  return {
    enabled: true,
    mode,
    provider: settings!.provider,
    maxResults: settings!.maxResults,
    readPageMaxChars: settings!.readPageMaxChars,
  };
}

function buildWebReadAccess(
  _user: UserChatMessage | undefined,
  settings: BuildConversationContextParams["webSearchSettings"],
  _override?: "off" | "smart" | "required",
): ConversationContextSnapshot["currentTurn"]["webReadAccess"] {
  // web_read_page is a global read-only tool, independent of the off/smart/required search mode
  // and independent of the webSearch.enabled toggle. It is available whenever webSearch settings
  // exist so that the Planner can read explicit URLs even when web search is turned off.
  if (!settings) return undefined;
  return { enabled: true };
}

function buildRuntimeNow(): RuntimeNowInfo {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    iso: now.toISOString(),
    localText: now.toLocaleString("zh-CN", { hour12: false }),
    timezone: timezone || undefined,
    timezoneOffsetMinutes: -now.getTimezoneOffset(),
    timestampMs: now.getTime(),
  };
}

function buildCurrentScope(user: UserChatMessage | undefined): ConversationContextSnapshot["currentTurn"]["scope"] {
  const requestContext = user?.requestContext;
  if (!requestContext) return undefined;
  const scope = {
    type: cleanString(requestContext.effectiveScopeMode),
    customDocCount: requestContext.customDocIds?.length,
    attachedDocCount: requestContext.attachedDocs?.length,
    currentDocId: cleanString(requestContext.currentDocId),
  };

  if (!scope.type && !scope.customDocCount && !scope.attachedDocCount && !scope.currentDocId) {
    return undefined;
  }
  return scope;
}

function buildScope(memory: AssistantChatMessage["agentMemory"]): NonNullable<ConversationTurnContext["assistant"]>["scope"] {
  if (!memory?.scope) return undefined;
  const scope = {
    type: cleanString(memory.scope.type),
    docId: cleanString(memory.scope.docId),
    rootDocId: cleanString(memory.scope.rootDocId),
    notebookId: cleanString(memory.scope.notebookId),
    docIds: Array.isArray(memory.scope.docIds)
      ? memory.scope.docIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined,
  };

  if (!scope.type && !scope.docId && !scope.rootDocId && !scope.notebookId && !scope.docIds?.length) {
    return undefined;
  }
  return scope;
}

function buildReferencesFromMemory(memory: AssistantChatMessage["agentMemory"]): ConversationReferenceContext[] {
  if (!memory?.footerReferenceDocIds?.length) return [];

  return memory.footerReferenceDocIds
    .map((docId, index) => {
      const sourceType = cleanString(memory.footerReferenceSourceTypes?.[index]) as ConversationReferenceContext["sourceType"] ?? "siyuan_doc";
      return {
        sourceType,
        docId,
        blockId: cleanString(memory.footerReferenceBlockIds?.[index]),
        title: cleanString(memory.footerReferenceTitles?.[index]),
        url: cleanString(memory.footerReferenceUrls?.[index]),
        sourceName: cleanString(memory.footerReferenceSourceNames?.[index]),
        provider: cleanString(memory.footerReferenceProviders?.[index]),
        referenceReason: cleanString(memory.footerReferenceReasons?.[index]) as ConversationReferenceContext["referenceReason"],
        readLevel: cleanString(memory.footerReferenceReadLevels?.[index]) as ConversationReferenceContext["readLevel"],
        grounded: memory.footerReferenceGroundedFlags?.[index] ?? false,
      };
    })
    .filter((ref) => ref.grounded === true && (ref.docId || ref.blockId || ref.url))
    .slice(0, MAX_REFERENCES);
}

const VALID_READ_LEVELS = new Set<string>(["content", "structure", "candidate"]);

function buildReferenceFromCitation(ref: ReferenceItem): ConversationReferenceContext | null {
  if (ref.grounded !== true) return null;

  const rawReadLevel = ref.readLevel;
  const readLevel = rawReadLevel && VALID_READ_LEVELS.has(rawReadLevel)
    ? rawReadLevel as "content" | "structure" | "candidate"
    : undefined;

  const sourceType = ref.sourceType ?? "siyuan_doc";

  const contextRef: ConversationReferenceContext = {
    sourceType: sourceType as ConversationReferenceContext["sourceType"],
    docId: cleanString(ref.docId),
    blockId: cleanString(ref.sourceBlockIds?.[0]),
    url: cleanString(ref.url),
    sourceName: cleanString(ref.sourceName),
    provider: cleanString(ref.provider),
    title: cleanString(ref.displayTitle) ?? cleanString(ref.docTitle) ?? cleanString(ref.headingPathText) ?? cleanString(ref.sourceName) ?? cleanString(ref.url),
    readLevel,
    referenceReason: ref.referenceReason,
    grounded: true,
  };

  if (sourceType === "web_page") {
    return contextRef.url ? contextRef : null;
  }
  return contextRef.docId || contextRef.blockId ? contextRef : null;
}

function buildReferences(message: AssistantChatMessage): ConversationReferenceContext[] | undefined {
  const fromMemory = buildReferencesFromMemory(message.agentMemory);
  const refs = fromMemory.length > 0
    ? fromMemory
    : (message.citedReferences ?? [])
        .map(buildReferenceFromCitation)
        .filter((ref): ref is ConversationReferenceContext => ref !== null)
        .slice(0, MAX_REFERENCES);

  return refs.length > 0 ? refs : undefined;
}

function buildAssistantContext(message: AssistantChatMessage): NonNullable<ConversationTurnContext["assistant"]> {
  const references = buildReferences(message);
  const scope = buildScope(message.agentMemory);
  return {
    finalAnswer: truncateText(message.content, MAX_ASSISTANT_FINAL_ANSWER_CHARS),
    ...(references ? { references } : {}),
    ...(scope ? { scope } : {}),
  };
}

function buildCompressed(
  summary: string | undefined,
  state: ContextCompressionState | undefined,
  maxChars: number = MAX_COMPRESSED_SUMMARY_CHARS,
): ConversationContextSnapshot["compressed"] {
  const trimmed = truncateText(summary, maxChars);
  if (!trimmed) return undefined;
  return {
    summary: trimmed,
    ...(typeof state?.compressedMessageCount === "number" ? { compressedMessageCount: state.compressedMessageCount } : {}),
    ...(typeof state?.compressedTurnCount === "number" ? { compressedTurnCount: state.compressedTurnCount } : {}),
    ...(typeof state?.compressedStageSummaryCount === "number" ? { compressedStageSummaryCount: state.compressedStageSummaryCount } : {}),
    ...(typeof state?.latestCompressedStageIndex === "number" ? { latestCompressedStageIndex: state.latestCompressedStageIndex } : {}),
    ...(typeof state?.latestCompressedTurnIndex === "number" ? { latestCompressedTurnIndex: state.latestCompressedTurnIndex } : {}),
    ...(typeof state?.summaryChars === "number" ? { summaryChars: state.summaryChars } : {}),
    ...(typeof state?.lastCompressedAt === "number" ? { lastCompressedAt: state.lastCompressedAt } : {}),
  };
}

function calculatePressureLevel(
  unsummarizedTurnCount: number,
  usageRatio: number,
  stageSummaryCoverage: boolean,
): { level: StageSummaryPressureLevel; reason: string } {
  if (usageRatio >= 0.9 && !stageSummaryCoverage) {
    return { level: "required", reason: `上下文用量已达 ${Math.round(usageRatio * 100)}%，且阶段摘要覆盖不足` };
  }
  if (usageRatio >= 0.75 && !stageSummaryCoverage) {
    return { level: "urgent", reason: `上下文用量已达 ${Math.round(usageRatio * 100)}%，阶段摘要覆盖不足` };
  }
  if (unsummarizedTurnCount >= 8 || usageRatio >= 0.65) {
    return { level: "recommended", reason: `未总结轮次 ${unsummarizedTurnCount} 轮，上下文用量 ${Math.round(usageRatio * 100)}%` };
  }
  if (unsummarizedTurnCount >= 4 || usageRatio >= 0.5) {
    return { level: "suggested", reason: `未总结轮次 ${unsummarizedTurnCount} 轮，上下文用量 ${Math.round(usageRatio * 100)}%` };
  }
  return { level: "none", reason: "未总结轮次少且上下文用量低" };
}

function buildStageSummaryStatus(
  messages: ChatMessage[],
  stageSummaries: readonly ConversationStageSummary[],
  hasCompressedSummary: boolean,
  usageRatio: number = 0,
): StageSummaryStatus {
  const completeTurnCount = getCompleteConversationTurns(messages).length;
  const sortedStageSummaries = [...stageSummaries].sort((a, b) => a.index - b.index);
  const latest = sortedStageSummaries[sortedStageSummaries.length - 1];
  const lastSummarizedTurnIndex = latest?.endTurnIndex ?? 0;
  const unsummarizedTurnCount = Math.max(0, completeTurnCount - lastSummarizedTurnIndex);
  const stageSummaryCoverage = lastSummarizedTurnIndex > 0 && unsummarizedTurnCount <= 2;
  const pressure = calculatePressureLevel(unsummarizedTurnCount, usageRatio, stageSummaryCoverage);

  return {
    existingCount: stageSummaries.length,
    lastSummarizedTurnIndex,
    unsummarizedTurnCount,
    ...(latest?.createdAt ? { lastSummaryCreatedAt: latest.createdAt } : {}),
    note: hasCompressedSummary ? STAGE_SUMMARY_STATUS_NOTE_COMPRESSED : STAGE_SUMMARY_STATUS_NOTE_UNCOMPRESSED,
    pressureLevel: pressure.level,
    pressureReason: pressure.reason,
  };
}

function buildRecentTurns(
  messages: ChatMessage[],
  currentUserMessageId?: string,
): ConversationTurnContext[] {
  const turns: ConversationTurnContext[] = [];
  let pendingUserTurn: ConversationTurnContext | null = null;
  let turnIndex = 0;

  const flushPendingUserTurn = (): void => {
    if (pendingUserTurn) {
      turns.push(pendingUserTurn);
      pendingUserTurn = null;
    }
  };

  for (const message of messages) {
    if (message.role === "user") {
      flushPendingUserTurn();
      turnIndex += 1;
      if (message.id === currentUserMessageId || message.compacted) {
        pendingUserTurn = null;
        continue;
      }

      const attachedDocs = buildTurnAttachedDocs(message);
      pendingUserTurn = {
        turnIndex,
        userMessageId: message.id,
        createdAt: message.createdAt,
        user: {
          text: truncateText(message.content, MAX_USER_TEXT_CHARS),
          ...(attachedDocs ? { attachedDocs } : {}),
        },
      };
      continue;
    }

    if (!isCompletedAssistantMessage(message)) continue;

    if (message.compacted) {
      pendingUserTurn = null;
      continue;
    }

    if (pendingUserTurn) {
      pendingUserTurn.assistantMessageId = message.id;
      pendingUserTurn.assistant = buildAssistantContext(message);
      turns.push(pendingUserTurn);
      pendingUserTurn = null;
    }
  }

  flushPendingUserTurn();
  return turns;
}

export function buildConversationContext(
  params: BuildConversationContextParams,
): ConversationContextSnapshot {
  const stageSummaries = params.stageSummaries ?? [];
  const currentUserMessage = params.currentUserMessageId
    ? params.messages.find((m): m is UserChatMessage => m.role === "user" && m.id === params.currentUserMessageId)
    : undefined;
  const attachedDocs = buildAttachedDocs(currentUserMessage);
  const currentScope = buildCurrentScope(currentUserMessage);
  const compressed = buildCompressed(params.compressedContextSummary, params.compressionState);
  const webSearchAccess = buildWebSearchAccess(currentUserMessage, params.webSearchSettings, params.webAccessModeOverride);
  const webReadAccess = buildWebReadAccess(currentUserMessage, params.webSearchSettings, params.webAccessModeOverride);

  return {
    version: SNAPSHOT_VERSION,
    currentTurn: {
      userQuestion: truncateText(params.currentQuestion, MAX_USER_TEXT_CHARS),
      ...(currentScope ? { scope: currentScope } : {}),
      ...(attachedDocs ? { attachedDocs } : {}),
      runtimeNow: buildRuntimeNow(),
      ...(webSearchAccess ? { webAccess: webSearchAccess } : {}),
      ...(webReadAccess ? { webReadAccess: webReadAccess } : {}),
    },
    stageSummaryStatus: buildStageSummaryStatus(params.messages, stageSummaries, !!compressed, params.usageRatio ?? 0),
    ...(compressed ? { compressed } : {}),
    recentTurns: buildRecentTurns(params.messages, params.currentUserMessageId),
    note: SNAPSHOT_NOTE,
    ...(params.globalMemory ? { globalMemory: params.globalMemory } : {}),
  };
}
