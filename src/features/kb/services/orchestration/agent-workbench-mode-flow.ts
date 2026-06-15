/**
 * Agent Workbench Mode Flow
 *
 * Agent Workbench 的 orchestration 适配层。
 *
 * 职责：
 * - 添加/复用 user message、创建 assistant pending
 * - 调用 runAgentTurn、把 composed answer 写回 assistant message
 * - 支持流式输出：onAnswerChunk 逐 chunk 更新 assistant message content
 * - 写入 agentMemory 和 citedReferences
 *
 * 重要（runtime cutover to Agent Workbench）：
 * - 真实聊天只走 Agent Workbench；不允许 switch 到其他运行时。
 * - Agent Workbench 失败时直接把安全错误呈现到当前 assistant message。
 * - 本路径只调用 Agent Workbench。
 *
 * 流程：
 *   1. trim question
 *   2. map mode
 *   3. 添加 user message
 *   4. updateState asking=true
 *   5. 创建 assistant pending
 *   6. 调用 runAgentTurn（含流式回调）
 *   7. 处理结果（abort/正常/错误）
 *   8. updateState asking=false
 */

import type { AskByModeParams, AskByModeResult } from "./ask-by-mode-types";
import type { ChatMode } from "../../constants/chat-modes";
import type { ChatMessage, ConversationStageSummary, UserChatMessage } from "../../types/chat";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { AgentScopeMode } from "../agent-workbench/scope/types";
import { runAgentTurn, type AgentTurnOutcome } from "../agent-workbench/runtime/run-agent-turn";
import type { AgentTurnResult, AgentWorkbenchEvent } from "../agent-workbench";
import { buildAgentTurnMemory } from "../agent-workbench/memory/agent-turn-memory";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { maybeAutoCompressContext, emergencyCompressContext } from "../context-compression";
import type { MaybeAutoCompressResult } from "../context-compression";
import { getKbSettings } from "../settings/kb-settings-service";
import { estimateContextUsage } from "../../types/context-usage";
import { readGlobalMemory, validateGlobalMemoryDocId } from "../agent-workbench/memory/global-memory-doc";
import { buildConversationContext } from "../agent-workbench/runtime/conversation-context-builder";
import type { BuildConversationContextParams } from "../agent-workbench/runtime/conversation-context-builder";
import { findCompleteConversationTurn, getCompleteConversationTurns } from "../agent-workbench/runtime/conversation-turns";
import { mapAgentErrorToUserFacing } from "../agent-workbench/runtime/user-facing-agent-error";
import { showMessage } from "siyuan";
import type { KbSessionState } from "../../types/session";
import type { ContextUsageSnapshot } from "../../types/context-usage";
import type { AgentMessage } from "../agent-core/messages/agent-message";

/**
 * Agent Workbench Mode Flow 参数
 */
export interface RunAgentWorkbenchModeFlowParams extends AskByModeParams {
  userMessageAlreadyAdded?: boolean;
  userMessageId?: string;
}

const MANUAL_STOP_MESSAGE = "已手动停止回答。";

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createStageSummaryId(): string {
  return `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface PreflightCompressionResult {
  ok: boolean;
  reason?: string;
}

async function resolvePreflightCompression(
  params: {
    getState: () => KbSessionState;
    updateState: (updater: (state: KbSessionState) => Partial<KbSessionState>) => void;
    initialUsageSnapshot: ContextUsageSnapshot;
    contextWindowTokens: number | undefined;
    chatModelSelection: ChatModelSelection | null | undefined;
    abortSignal: AbortSignal | undefined;
    schedulePersist: (() => void) | undefined;
  }
): Promise<PreflightCompressionResult> {
  const { getState, updateState, initialUsageSnapshot, contextWindowTokens, chatModelSelection, abortSignal, schedulePersist } = params;

  const forceCompressionRatio = getState().compressionState?.forceCompressionRatio ?? 0.9;
  const isForce = initialUsageSnapshot.usageRatio >= forceCompressionRatio;

  const reEstimate = (state: KbSessionState): ContextUsageSnapshot => {
    return estimateContextUsage({
      messages: state.messages,
      attachedDocCount: 0,
      compressedSummaryChars: state.compressedContextSummary?.length ?? 0,
      stageSummaryStatusChars: 160 + ((state.stageSummaries?.length ?? 0) > 0 ? 80 : 0),
      contextWindowTokens: contextWindowTokens ?? initialUsageSnapshot.maxContextTokens,
    });
  };

  const applyCompressResult = (result: MaybeAutoCompressResult): boolean => {
    if (result.action === "compressed" && result.updatedMessages) {
      updateState((state) => ({
        ...state,
        messages: result.updatedMessages!,
        compressedContextSummary: result.newCompressedContextSummary ?? state.compressedContextSummary,
        compressionState: result.newCompressionState ?? state.compressionState,
      }));
      return true;
    }
    if (result.action === "emergency_compressed" && result.newStageSummaries) {
      updateState((state) => ({
        ...state,
        stageSummaries: [...(state.stageSummaries ?? []), ...result.newStageSummaries!],
      }));
      return true;
    }
    return false;
  };

  const tryCompress = async (allowEmergency: boolean): Promise<MaybeAutoCompressResult> => {
    const state = getState();
    const snapshot = reEstimate(state);
    return maybeAutoCompressContext({
      messages: state.messages,
      stageSummaries: state.stageSummaries ?? [],
      compressedContextSummary: state.compressedContextSummary,
      compressionState: state.compressionState,
      usageRatio: snapshot.usageRatio,
      maxContextTokens: snapshot.maxContextTokens,
      maxContextSource: snapshot.maxContextSource,
      chatModelSelection,
      abortSignal,
      allowEmergency,
    });
  };

  // Step 1: try compression (allow emergency fallback inside maybeAutoCompressContext)
  const step1 = await tryCompress(true);
  const step1Applied = applyCompressResult(step1);
  if (step1Applied) {
    try { schedulePersist?.(); } catch { /* persist failure is non-blocking */ }
  }

  if (!isForce) {
    return { ok: true };
  }

  // Force path: must re-estimate after each step
  let state = getState();
  let snapshot = reEstimate(state);

  if (snapshot.usageRatio < forceCompressionRatio) {
    return { ok: true };
  }

  // Still over limit after step 1
  const completeTurns = getCompleteConversationTurns(state.messages);
  const lastSummarizedTurnIndex = state.stageSummaries?.length
    ? Math.max(...state.stageSummaries.map((s) => s.endTurnIndex))
    : 0;
  const hasUncoveredTurns = completeTurns.some(
    (t) => t.turnIndex > lastSummarizedTurnIndex && !t.user.compacted && !t.assistant.compacted
  );

  if (!hasUncoveredTurns) {
    pushAgentDebugEvent("CONTEXT_FORCE_COMPRESSION_STILL_OVER_LIMIT", {
      usageRatioPct: Math.round(snapshot.usageRatio * 100),
      maxContextTokens: snapshot.maxContextTokens,
      messageCount: state.messages.length,
      stageSummaryCount: state.stageSummaries?.length ?? 0,
      compressedMessageCount: state.compressionState?.compressedMessageCount ?? 0,
    }, "warn");
    return { ok: false, reason: "普通压缩后仍超过硬阈值，且没有可进一步压缩的轮次" };
  }

  // If step1 already triggered emergency, retry normal compression then re-estimate
  if (step1.action === "emergency_compressed") {
    const retry = await tryCompress(false);
    if (applyCompressResult(retry)) {
      try { schedulePersist?.(); } catch { /* persist failure is non-blocking */ }
    }

    state = getState();
    snapshot = reEstimate(state);

    if (snapshot.usageRatio < forceCompressionRatio) {
      return { ok: true };
    }

    pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_STILL_OVER_LIMIT", {
      usageRatioPct: Math.round(snapshot.usageRatio * 100),
      maxContextTokens: snapshot.maxContextTokens,
      messageCount: state.messages.length,
      stageSummaryCount: state.stageSummaries?.length ?? 0,
      compressedMessageCount: state.compressionState?.compressedMessageCount ?? 0,
    }, "warn");
    return { ok: false, reason: "emergency 压缩后仍超过硬阈值" };
  }

  // Step 1 was "compressed" or "no_op". We have uncovered turns. Trigger emergency manually.
  const emergencyResult = await emergencyCompressContext({
    messages: state.messages,
    stageSummaries: state.stageSummaries ?? [],
    usageRatio: snapshot.usageRatio,
    maxContextTokens: snapshot.maxContextTokens,
    chatModelSelection,
    abortSignal,
  });

  if (!emergencyResult.success || !emergencyResult.newStageSummaries) {
    pushAgentDebugEvent("CONTEXT_FORCE_COMPRESSION_STILL_OVER_LIMIT", {
      usageRatioPct: Math.round(snapshot.usageRatio * 100),
      maxContextTokens: snapshot.maxContextTokens,
      messageCount: state.messages.length,
      stageSummaryCount: state.stageSummaries?.length ?? 0,
      compressedMessageCount: state.compressionState?.compressedMessageCount ?? 0,
    }, "warn");
    return { ok: false, reason: "普通压缩后仍超过硬阈值，emergency 压缩失败" };
  }

  updateState((s) => ({
    ...s,
    stageSummaries: [...(s.stageSummaries ?? []), ...emergencyResult.newStageSummaries!],
  }));
  try { schedulePersist?.(); } catch { /* persist failure is non-blocking */ }

  // Retry normal compression after emergency (allowEmergency = false)
  const retry = await tryCompress(false);
  if (applyCompressResult(retry)) {
    try { schedulePersist?.(); } catch { /* persist failure is non-blocking */ }
  }

  state = getState();
  snapshot = reEstimate(state);

  if (snapshot.usageRatio < forceCompressionRatio) {
    return { ok: true };
  }

  pushAgentDebugEvent("CONTEXT_EMERGENCY_COMPACTION_STILL_OVER_LIMIT", {
    usageRatioPct: Math.round(snapshot.usageRatio * 100),
    maxContextTokens: snapshot.maxContextTokens,
    messageCount: state.messages.length,
    stageSummaryCount: state.stageSummaries?.length ?? 0,
    compressedMessageCount: state.compressionState?.compressedMessageCount ?? 0,
  }, "warn");
  return { ok: false, reason: "emergency 压缩后仍超过硬阈值" };
}

function mapChatModeToAgentScopeMode(mode: ChatMode): AgentScopeMode | null {
  switch (mode) {
    case "current_doc_with_children":
      return "current_doc_with_children";
    case "current_doc_neighborhood":
      return "current_doc_neighborhood";
    case "current_notebook":
      return "current_notebook";
    case "whole_kb":
      return "whole_kb";
    default:
      return null;
  }
}

function formatAgentWorkbenchUserError(input: { errorCode?: string; message?: string }): string {
  const userFacing = mapAgentErrorToUserFacing({ agentErrorCode: input.errorCode, message: input.message });
  let result = `${userFacing.title}：${userFacing.message}`;
  if (userFacing.suggestion) {
    result += ` ${userFacing.suggestion}`;
  }
  return result;
}

function isAbortLikeError(err: unknown, abortSignal?: AbortSignal): boolean {
  if (abortSignal?.aborted) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

function isAgentWorkbenchDebugLogEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } }).env;
  return env?.DEV === true || env?.MODE === "development";
}

/**
 * dev-only Agent Workbench strict runtime test 开关。
 * - 仅在开发环境生效。
 * - 通过 localStorage "kbAgent.workbenchStrictRuntimeTest" === "1" 开启。
 * - 默认不开启，不影响普通用户。
 * - 仅用于诊断 Agent Workbench 失败路径，不参与 Agent 工具选择，不改变 Tool/Skill 决策。
 */
function isWorkbenchStrictRuntimeTestEnabled(): boolean {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return false;
  }
  try {
    if (window.localStorage.getItem("kbAgent.workbenchStrictRuntimeTest") !== "1") {
      return false;
    }
  } catch {
    return false;
  }
  return isAgentWorkbenchDebugLogEnabled();
}

function sanitizeAgentTurnErrorCode(raw: string | undefined): string {
  if (!raw) return "agent_workbench_runtime_error";
  // 仅保留可见的 safe code；不含 docId / path / 内部 mapping。
  // Agent Workbench 自身的 safe code 形如 "stopped_by_agent" / "exception"，已经安全。
  return String(raw).slice(0, 64);
}

function mergeWorkbenchEvents(a: AgentWorkbenchEvent[], b: AgentWorkbenchEvent[]): AgentWorkbenchEvent[] {
  const seen = new Set<string>();
  const out: AgentWorkbenchEvent[] = [];
  for (const event of a) {
    const key =
      (event.type === "tool_start" || event.type === "tool_result") && "toolCallId" in event
        ? `${event.type}:${event.toolCallId}`
        : `${event.type}:${event.stepIndex ?? -1}:${event.at}:${(event as { message?: string }).message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  for (const event of b) {
    const key =
      (event.type === "tool_start" || event.type === "tool_result") && "toolCallId" in event
        ? `${event.type}:${event.toolCallId}`
        : `${event.type}:${event.stepIndex ?? -1}:${event.at}:${(event as { message?: string }).message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

function getPersistedAgentSessionMessages(state: KbSessionState): AgentMessage[] | undefined {
  const extended = state as KbSessionState & {
    activeConversationId?: string;
    conversations?: Array<{ id: string; agentSession?: { messages?: AgentMessage[] } }>;
  };
  const conversation = extended.conversations?.find((item) => item.id === extended.activeConversationId);
  return conversation?.agentSession?.messages;
}

function persistAgentSessionMessages(
  state: KbSessionState,
  conversationId: string | undefined,
  messages: AgentMessage[] | undefined,
): Partial<KbSessionState> {
  if (!messages) return {};
  const extended = state as KbSessionState & {
    activeConversationId?: string;
    conversations?: Array<Record<string, unknown> & { id: string }>;
  };
  const activeId = conversationId ?? extended.activeConversationId;
  if (!activeId || !Array.isArray(extended.conversations)) return {};
  return {
    conversations: extended.conversations.map((conversation) =>
      conversation.id === activeId
        ? {
            ...conversation,
            agentSession: {
              id: activeId,
              messages,
              updatedAt: Date.now(),
            },
          }
        : conversation,
    ),
  } as Partial<KbSessionState>;
}

function appendAgentStageSummary(params: {
  messages: ChatMessage[];
  existing: readonly ConversationStageSummary[] | undefined;
  result: AgentTurnResult;
  userMessageId?: string;
  assistantMessageId: string;
}): ConversationStageSummary[] | undefined {
  const summary = params.result.stageSummary?.summary?.trim();
  if (!summary) return undefined;

  const endTurn = findCompleteConversationTurn(params.messages, {
    userMessageId: params.userMessageId,
    assistantMessageId: params.assistantMessageId,
  });
  const existing = [...(params.existing ?? [])].sort((a, b) => a.index - b.index);
  const previous = existing[existing.length - 1];
  const startTurnIndex = previous ? previous.endTurnIndex + 1 : 1;

  if (!endTurn || endTurn.turnIndex < startTurnIndex) {
    pushAgentDebugEvent("STAGE_SUMMARY_DROPPED_INVALID_RANGE", {
      hasEndTurn: !!endTurn,
      startTurnIndex,
      endTurnIndex: endTurn?.turnIndex ?? 0,
      assistantMessageId: params.assistantMessageId,
    }, "warn");
    return undefined;
  }

  const next: ConversationStageSummary = {
    id: createStageSummaryId(),
    index: (previous?.index ?? 0) + 1,
    summary,
    createdAt: Date.now(),
    ...(previous?.endAssistantMessageId
      ? { startAfterAssistantMessageId: previous.endAssistantMessageId }
      : {}),
    startTurnIndex,
    endUserMessageId: endTurn.user.id,
    endAssistantMessageId: endTurn.assistant.id,
    endTurnIndex: endTurn.turnIndex,
    source: "agent_stage_summary",
    summaryChars: summary.length,
  };

  pushAgentDebugEvent("STAGE_SUMMARY_RECORDED_SAFE", {
    index: next.index,
    startTurnIndex: next.startTurnIndex,
    endTurnIndex: next.endTurnIndex,
    summaryChars: next.summaryChars,
  }, "info");

  return [...existing, next];
}

/**
 * 运行 Agent Workbench Mode Flow
 * 适配层：将 runAgentTurn 结果转换为现有聊天消息和状态
 * @param params 参数
 * @returns AskByModeResult
 */
export async function runAgentWorkbenchModeFlow(
  params: RunAgentWorkbenchModeFlowParams
): Promise<AskByModeResult> {
  const {
    mode,
    question,
    getState,
    updateState,
    addMessage,
    setMessages,
    userMessageAlreadyAdded,
    userMessageId,
    abortSignal,
    chatModelSelection,
    thinkingMode,
    customDocIds,
    contextWindowTokens,
  } = params;

  const assistantMessageId = createMessageId();

  try {
    const trimmed = question.trim();
    if (!trimmed) {
      return { success: false, error: "问题不能为空" };
    }

    let scopeMode = mapChatModeToAgentScopeMode(mode);
    if (scopeMode === null) {
      return { success: false, error: `未知或暂不支持的模式: ${mode}` };
    }

    const hasCustomDocs = Array.isArray(customDocIds) && customDocIds.length > 0;
    if (hasCustomDocs) {
      scopeMode = "custom_docs";
      pushAgentDebugEvent("MANUAL_DOC_SCOPE_SELECTED_SAFE", {
        selectedDocCount: customDocIds!.length,
        originalMode: mode,
        effectiveScopeMode: "custom_docs",
      }, "info");
      pushAgentDebugEvent("MANUAL_DOC_ATTACHED_SAFE", {
        selectedDocCount: customDocIds!.length,
        source: "user_input_bar",
      }, "info");
    }

    if (scopeMode === "custom_docs") {
      pushAgentDebugEvent("FIXED_SCOPE_SELECTED_SAFE", {
        source: "custom_docs",
        docCount: customDocIds!.length,
        mode: scopeMode,
      }, "info");
    }

    let actualUserMessageId = userMessageId;
    if (userMessageAlreadyAdded !== true) {
      const newUserMessageId = userMessageId || createMessageId();
      actualUserMessageId = newUserMessageId;
      addMessage({
        id: newUserMessageId,
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      });
    }

    const stateForConversationContext = getState();

    // ── Auto compression check before building conversationContext ──
    const usageSnapshot = estimateContextUsage({
      messages: stateForConversationContext.messages,
      attachedDocCount: 0,
      compressedSummaryChars: stateForConversationContext.compressedContextSummary?.length ?? 0,
      stageSummaryStatusChars: 160 + ((stateForConversationContext.stageSummaries?.length ?? 0) > 0 ? 80 : 0),
      contextWindowTokens,
    });

    const preflightResult = await resolvePreflightCompression({
      getState,
      updateState,
      initialUsageSnapshot: usageSnapshot,
      contextWindowTokens,
      chatModelSelection: params.chatModelSelection,
      abortSignal: params.abortSignal,
      schedulePersist: () => {
        try {
          const persistFn = (params as unknown as Record<string, unknown>).schedulePersist;
          if (typeof persistFn === "function") {
            (persistFn as () => void)();
          }
        } catch { /* persist failure is non-blocking */ }
      },
    });

    if (!preflightResult.ok) {
      try {
        showMessage("上下文压力过大，紧急压缩未能完成。建议手动压缩或开启新对话。", 5000);
      } catch { /* showMessage may not be available in all contexts */ }

      if (setMessages) {
        setMessages((messages) =>
          messages.filter((m) => !(m.id === assistantMessageId && m.role === "assistant" && !m.content.trim()))
        );
      }

      updateState((state) => ({
        ...state,
        asking: false,
        qaError: "",
        error: "",
        agentStatus: undefined,
      }));

      return { success: false, error: preflightResult.reason ?? "上下文压力过大，紧急压缩未能完成" };
    }

    // Re-read state after potential auto compression
    const stateAfterCompression = getState();

    // Calculate usageRatio for pressureLevel
    const usageSnapshotForContext = estimateContextUsage({
      messages: stateAfterCompression.messages,
      attachedDocCount: 0,
      compressedSummaryChars: stateAfterCompression.compressedContextSummary?.length ?? 0,
      stageSummaryStatusChars: 160 + ((stateAfterCompression.stageSummaries?.length ?? 0) > 0 ? 80 : 0),
      contextWindowTokens,
    });

    // Fetch web search settings and global memory for conversation context
    let webSearchSettings: BuildConversationContextParams["webSearchSettings"];
    let globalMemoryText: string | undefined;
    let kbSettings: Awaited<ReturnType<typeof getKbSettings>> | undefined;
    try {
      kbSettings = await getKbSettings();
      if (kbSettings?.webSearch) {
        webSearchSettings = {
          enabled: kbSettings.webSearch.enabled,
          provider: kbSettings.webSearch.provider,
          maxResults: kbSettings.webSearch.maxResults,
          readPageMaxChars: kbSettings.webSearch.readPageMaxChars,
        };
      }
      if (kbSettings?.globalMemory?.enabled && kbSettings.globalMemory.docId) {
        const validation = await validateGlobalMemoryDocId(kbSettings.globalMemory.docId);
        if (validation.valid) {
          const mem = await readGlobalMemory(kbSettings.globalMemory.docId, kbSettings.globalMemory.maxChars);
          if (!mem.readOk) {
            globalMemoryText = "全局记忆读取失败，本轮不使用全局记忆。";
          } else {
            globalMemoryText = mem.content;
            if (mem.truncated) {
              globalMemoryText += "\n（记忆内容已截断）";
            }
          }
        }
      }
    } catch { /* ignore */ }

    // Determine effective webAccessMode for this turn.
    // Priority: params.webAccessMode (from UI) > user message requestContext > "off"
    // kb-main-panel already resolves requestContext > inputBar > "off" before passing here,
    // so params.webAccessMode is usually the correct effective value.
    // This fallback to requestContext is a safety net for internal callers that may not pass it.
    const currentUserMsg = stateAfterCompression.messages.find(
      (m): m is UserChatMessage =>
        m.role === "user" && m.id === actualUserMessageId,
    );
    const effectiveWebAccessMode = params.webAccessMode
      ?? currentUserMsg?.requestContext?.webAccessMode
      ?? "off";

    pushAgentDebugEvent("WEB_ACCESS_MODE_SOURCE_SAFE", {
      sourceName: "agent-workbench-mode-flow",
      rawValue: params.webAccessMode,
      normalizedValue: effectiveWebAccessMode,
      hasExplicitUserValue: params.webAccessMode !== undefined && params.webAccessMode !== null,
      requestContextFallback: !params.webAccessMode && !!currentUserMsg?.requestContext?.webAccessMode,
    }, "info");

    const conversationContext = buildConversationContext({
      messages: stateAfterCompression.messages,
      stageSummaries: stateAfterCompression.stageSummaries ?? [],
      currentUserMessageId: actualUserMessageId,
      currentQuestion: trimmed,
      compressedContextSummary: stateAfterCompression.compressedContextSummary,
      compressionState: stateAfterCompression.compressionState,
      usageRatio: usageSnapshotForContext.usageRatio,
      webSearchSettings,
      webAccessModeOverride: effectiveWebAccessMode,
      globalMemory: globalMemoryText,
    });

    // Extract attachedDocs from current user message for reference grounding
    const currentUserMessage = stateAfterCompression.messages.find(
      (m): m is UserChatMessage =>
        m.role === "user" && m.id === actualUserMessageId,
    );
    const attachedDocs = currentUserMessage?.attachedDocs?.map((d) => ({
      docId: d.docId,
      title: d.title,
    }));

    addMessage({
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      isComplete: false,
      agentStatus: "正在分析问题...",
    });

    pushAgentDebugEvent("ASSISTANT_RUN_MESSAGE_CREATED", {
      contentChars: 0,
      isComplete: false,
    }, "debug");

    updateState((state) => ({
      ...state,
      asking: true,
      qaError: "",
      error: "",
      agentStatus: "正在分析问题...",
    }));

    if (isAgentWorkbenchDebugLogEnabled()) {
      pushAgentDebugEvent("WORKBENCH_START", {
        scopeMode,
        traceEnabled: true,
      }, "debug");
    }

    let streamingContent = "";
    let liveWorkbenchEvents: AgentWorkbenchEvent[] = [];
    let reasoningContent = "";
    let reasoningPartCount = 0;
    const userThinkingMode = thinkingMode ?? "off";

    // Agent Workbench runtime path.
    // 真实聊天只走 Agent Workbench。
    // Agent Workbench 失败时直接把安全错误呈现到当前 assistant message。
    let result: AgentTurnResult | null = null;
    const agentTurnOutcome: AgentTurnOutcome = await runAgentTurn({
      question: trimmed,
      conversationContext,
      mode: scopeMode,
      customDocIds: hasCustomDocs ? customDocIds : undefined,
      attachedDocs,
      abortSignal,
      chatModelSelection,
      thinkingMode: userThinkingMode,
      globalMemory: globalMemoryText,
      conversationId: params.conversationId ?? actualUserMessageId,
      agentSessionMessages: getPersistedAgentSessionMessages(stateAfterCompression),
      kbSettings,
      onReasoningDelta: (event) => {
        // Only process reasoning when thinkingMode=on
        if (userThinkingMode !== "on") {
          pushAgentDebugEvent("REASONING_RECEIVED_WHEN_OFF_SAFE", {
            type: event.type,
            action: "discarded",
          }, "info");
          return;
        }
        if (event.type === "reasoning-start") {
          reasoningContent = "";
          reasoningPartCount = 0;
          if (setMessages) {
            setMessages((messages) =>
              messages.map((m) => {
                if (m.id !== assistantMessageId || m.role !== "assistant") return m;
                return { ...m, reasoning: { content: "", status: "streaming", partCount: 0, chars: 0 } };
              })
            );
          }
        } else if (event.type === "reasoning-delta" && event.delta) {
          reasoningContent += event.delta;
          reasoningPartCount++;
          if (setMessages) {
            setMessages((messages) =>
              messages.map((m) => {
                if (m.id !== assistantMessageId || m.role !== "assistant") return m;
                return { ...m, reasoning: { content: reasoningContent, status: "streaming", partCount: reasoningPartCount, chars: reasoningContent.length } };
              })
            );
          }
        } else if (event.type === "reasoning-end") {
          if (setMessages) {
            setMessages((messages) =>
              messages.map((m) => {
                if (m.id !== assistantMessageId || m.role !== "assistant") return m;
                const finalReasoning = reasoningContent.trim().length > 0
                  ? { content: reasoningContent, status: "done" as const, partCount: reasoningPartCount, chars: reasoningContent.length }
                  : undefined;
                return { ...m, reasoning: finalReasoning };
              })
            );
          }
        } else if (event.type === "reasoning-reset") {
          reasoningContent = "";
          reasoningPartCount = 0;
          if (setMessages) {
            setMessages((messages) =>
              messages.map((m) => {
                if (m.id !== assistantMessageId || m.role !== "assistant") return m;
                return { ...m, reasoning: undefined };
              })
            );
          }
        }
      },
      onAnswerChunk: ({ fullContent }) => {
        streamingContent = fullContent;
        if (setMessages) {
          setMessages((messages) =>
            messages.map((m) => {
              if (m.id !== assistantMessageId || m.role !== "assistant") return m;
              return { ...m, content: fullContent, agentStatus: undefined, isComplete: false };
            })
          );
        }
      },
      onWorkbenchEvent: (event) => {
        liveWorkbenchEvents = [...liveWorkbenchEvents, event];
        if (setMessages) {
          setMessages((messages) =>
            messages.map((m) => {
              if (m.id !== assistantMessageId || m.role !== "assistant") return m;
              if (m.isComplete === true) return m;
              if (event.type === "assistant_text_reset") {
                return { ...m, content: "", workbenchEvents: liveWorkbenchEvents };
              }
              // Clear agentStatus when a tool starts executing or when assistant finalizes;
              // workbenchEvents will show the specific tool details.
              // Set agentStatus on notice events.
              const nextAgentStatus =
                event.type === "tool_start" || event.type === "assistant_final"
                  ? undefined
                  : event.type === "notice"
                    ? event.message
                    : m.agentStatus;
              return { ...m, workbenchEvents: liveWorkbenchEvents, agentStatus: nextAgentStatus };
            })
          );
        }
      },
      onAnswerFinish: (fullContent) => {
        if (fullContent.trim().length > 0 && setMessages) {
          setMessages((messages) =>
            messages.map((m) =>
              m.id === assistantMessageId && m.role === "assistant"
                ? { ...m, agentStatus: undefined, isComplete: false }
                : m
            )
          );
        }
      },
    });

    if (agentTurnOutcome.ok && agentTurnOutcome.result) {
      result = agentTurnOutcome.result;
    } else {
      // Agent Workbench 失败：直接呈现安全错误到 assistant message，不 switch 到其他运行时。
      const displayError = agentTurnOutcome.displayError;
      const safeCode = sanitizeAgentTurnErrorCode(agentTurnOutcome.agentErrorCode);
      pushAgentDebugEvent("WORKBENCH_NO_FALLBACK", {
        agentErrorCode: safeCode,
        stopReasonCode: agentTurnOutcome.stopReasonCode,
        scopeMode,
        displayErrorTitle: displayError?.title,
      }, "warn");

      if (isWorkbenchStrictRuntimeTestEnabled()) {
        throw new Error(`Agent Workbench runtime failed: ${safeCode}`);
      }

      // 用户可读错误消息：优先使用 displayError，fallback 到旧格式
      const errMsg = displayError
        ? `${displayError.title}：${displayError.message}${displayError.completedStepsSummary ? `\n${displayError.completedStepsSummary}` : ""}`
        : "本轮未完成：模型没有给出可继续执行的有效内容，本轮已停止。";

      result = {
        scope: { type: "whole_kb" },
        scopeSummary: { type: "whole_kb", title: "知识库" },
        answer: errMsg,
        footerReferences: [],
        warnings: [],
        events: liveWorkbenchEvents,
      };
    }

    if (agentTurnOutcome.agentSessionMessages) {
      updateState((state) =>
        persistAgentSessionMessages(
          state,
          params.conversationId ?? actualUserMessageId,
          agentTurnOutcome.agentSessionMessages,
        )
      );
    }

    if (isAgentWorkbenchDebugLogEnabled() && result) {
      pushAgentDebugEvent("AGENT_TURN_OUTCOME", {
        scopeMode,
        agentOk: agentTurnOutcome.ok,
        steps: agentTurnOutcome.steps,
        footerReferencesCount: agentTurnOutcome.footerReferencesCount ?? result.footerReferences.length,
      }, "debug");
    }

    if (abortSignal?.aborted) {
      if (setMessages) {
        setMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantMessageId || m.role !== "assistant") return m;
            if (m.content.trim()) {
              return { ...m, agentStatus: undefined, isComplete: false };
            }
            return {
              ...m,
              content: MANUAL_STOP_MESSAGE,
              agentStatus: undefined,
              isComplete: true,
              reasoning: m.reasoning?.status === "streaming" ? undefined : m.reasoning,
            };
          })
        );
      }

      updateState((state) => ({
        ...state,
        asking: false,
        qaError: "",
        error: "",
        agentStatus: undefined,
      }));

      return { success: true };
    }

    if (setMessages) {
      const agentMemory = buildAgentTurnMemory({
        turnId: assistantMessageId,
        userQuestion: trimmed,
        result,
      });

      const finalWorkbenchEvents = mergeWorkbenchEvents(liveWorkbenchEvents, result.events);

      setMessages((messages) =>
        messages.map((m) =>
          m.id === assistantMessageId && m.role === "assistant"
            ? {
                ...m,
                content: streamingContent || result.answer,
                citedReferences: result.footerReferences,
                agentMemory,
                workbenchEvents: finalWorkbenchEvents,
                isComplete: true,
                agentStatus: undefined,
                // Ensure reasoning status is "done" at finalize
                reasoning: m.reasoning && m.reasoning.status === "streaming"
                  ? { ...m.reasoning, status: "done" as const }
                  : m.reasoning,
              }
            : m
        )
      );

      const finalContent = streamingContent || result.answer;
      pushAgentDebugEvent("ASSISTANT_RUN_FINALIZED", {
        answerChars: finalContent.length,
        hasReferences: (result.footerReferences?.length ?? 0) > 0,
        isComplete: true,
      }, "debug");

      if (result.stageSummary?.summary?.trim()) {
        updateState((state) => {
          const nextStageSummaries = appendAgentStageSummary({
            messages: state.messages,
            existing: state.stageSummaries,
            result,
            userMessageId: actualUserMessageId,
            assistantMessageId,
          });
          return nextStageSummaries
            ? { stageSummaries: nextStageSummaries }
            : {};
        });
      }
    }

    updateState((state) => ({
      ...state,
      asking: false,
      qaError: "",
      error: "",
      agentStatus: undefined,
    }));

    return { success: true };
  } catch (err) {
    if (isAbortLikeError(err, abortSignal)) {
      if (setMessages) {
        setMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantMessageId || m.role !== "assistant") return m;
            if (m.content.trim()) {
              return { ...m, agentStatus: undefined, isComplete: false };
            }
            return {
              ...m,
              content: MANUAL_STOP_MESSAGE,
              agentStatus: undefined,
              isComplete: true,
              reasoning: m.reasoning?.status === "streaming" ? undefined : m.reasoning,
            };
          })
        );
      }

      updateState((state) => ({
        ...state,
        asking: false,
        qaError: "",
        error: "",
        agentStatus: undefined,
      }));

      return { success: true };
    }

    const rawErrorMsg = err instanceof Error ? err.message : String(err);
    pushAgentDebugEvent("MODE_FLOW_FAILED", { error: rawErrorMsg.slice(0, 200) }, "error");

    if (setMessages) {
      setMessages((messages) =>
        messages.filter((m) => m.id !== assistantMessageId)
      );
    }

    const userErrorMsg = formatAgentWorkbenchUserError({
      errorCode: "agent_workbench_unexpected_error",
    });

    addMessage({
      id: createMessageId(),
      role: "error",
      content: userErrorMsg,
      createdAt: Date.now(),
    });

    updateState((state) => ({
      ...state,
      asking: false,
      qaError: userErrorMsg,
      error: userErrorMsg,
      agentStatus: undefined,
    }));

    return { success: false, error: rawErrorMsg };
  }
}
