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
import type { ChatMessage, ConversationStageSummary } from "../../types/chat";
import type { AgentScopeMode } from "../agent-workbench/scope/types";
import { runAgentTurn, type AgentTurnOutcome } from "../agent-workbench/runtime/run-agent-turn";
import type { AgentTurnResult } from "../agent-workbench";
import { buildAgentTurnMemory } from "../agent-workbench/memory/agent-turn-memory";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { maybeAutoCompressContext } from "../context-compression";
import { estimateContextUsage } from "../../types/context-usage";
import { buildConversationContext } from "../agent-workbench/runtime/conversation-context-builder";
import { findCompleteConversationTurn } from "../agent-workbench/runtime/conversation-turns";
import { showMessage } from "siyuan";

/**
 * Agent Workbench Mode Flow 参数
 */
export interface RunAgentWorkbenchModeFlowParams extends AskByModeParams {
  userMessageAlreadyAdded?: boolean;
  userMessageId?: string;
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createStageSummaryId(): string {
  return `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mapChatModeToAgentScopeMode(mode: ChatMode): AgentScopeMode | null {
  switch (mode) {
    case "current_doc_with_children":
      return "current_doc_with_children";
    case "current_notebook":
      return "current_notebook";
    case "whole_kb":
      return "whole_kb";
    default:
      return null;
  }
}

function formatAgentWorkbenchUserError(errorMsg: string): string {
  if (errorMsg.includes("AI 调用失败") || errorMsg.includes("LLM") || errorMsg.includes("模型") || errorMsg.includes("网络") || errorMsg.includes("连接")) {
    return "AI 模型调用失败，请检查模型配置或网络连接后重试。";
  }
  if (errorMsg.includes("检索") || errorMsg.includes("索引") || errorMsg.includes("search") || errorMsg.includes("index")) {
    return "资料检索失败，请检查索引状态或稍后重试。";
  }
  if (errorMsg.includes("scope") || errorMsg.includes("current document") || errorMsg.includes("范围") || errorMsg.includes("未打开")) {
    return "当前范围不可用，请确认已打开文档或切换提问范围。";
  }
  return "本轮问答失败，请稍后重试。";
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
 * - 仅用于诊断 Agent Workbench 失败路径，不参与 Planner 工具选择，不改变 Tool/Skill 决策。
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
  // Agent Workbench 自身的 safe code 形如 "stopped_by_planner" / "exception"，已经安全。
  return String(raw).slice(0, 64);
}

function appendPlannerStageSummary(params: {
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
    source: "planner_stage_summary",
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
    const usageRatio = usageSnapshot.usageRatio;
    const forceCompressionRatio = stateForConversationContext.compressionState?.forceCompressionRatio ?? 0.9;
    const isForce = usageRatio >= forceCompressionRatio;

    try {
      const autoCompressResult = await maybeAutoCompressContext({
        messages: stateForConversationContext.messages,
        stageSummaries: stateForConversationContext.stageSummaries ?? [],
        compressedContextSummary: stateForConversationContext.compressedContextSummary,
        compressionState: stateForConversationContext.compressionState,
        usageRatio,
        maxContextTokens: usageSnapshot.maxContextTokens,
        maxContextSource: usageSnapshot.maxContextSource,
      });

      if (autoCompressResult.action === "compressed" && autoCompressResult.updatedMessages) {
        // Update state with compressed messages and summary
        updateState((state) => ({
          ...state,
          messages: autoCompressResult.updatedMessages!,
          compressedContextSummary: autoCompressResult.newCompressedContextSummary ?? state.compressedContextSummary,
          compressionState: autoCompressResult.newCompressionState ?? state.compressionState,
        }));

        // Persist if available
        try {
          const persistFn = (params as unknown as Record<string, unknown>).schedulePersist;
          if (typeof persistFn === "function") {
            (persistFn as () => void)();
          }
        } catch { /* persist failure is non-blocking */ }
      } else if (autoCompressResult.action === "emergency_compressed" && autoCompressResult.newStageSummaries) {
        // Emergency compression generated new stage summaries — merge them in
        updateState((state) => ({
          ...state,
          stageSummaries: [...(state.stageSummaries ?? []), ...autoCompressResult.newStageSummaries!],
        }));

        // After emergency stage summaries are added, try normal compression again
        const stateAfterEmergency = getState();
        const retryResult = maybeAutoCompressContext({
          messages: stateAfterEmergency.messages,
          stageSummaries: stateAfterEmergency.stageSummaries ?? [],
          compressedContextSummary: stateAfterEmergency.compressedContextSummary,
          compressionState: stateAfterEmergency.compressionState,
          usageRatio,
          maxContextTokens: usageSnapshot.maxContextTokens,
          maxContextSource: usageSnapshot.maxContextSource,
        });

        // Note: retryResult is a Promise now since maybeAutoCompressContext is async
        // but we don't want to recursively trigger emergency again, so we handle
        // only "compressed" result here
        const resolvedRetry = await retryResult;
        if (resolvedRetry.action === "compressed" && resolvedRetry.updatedMessages) {
          updateState((state) => ({
            ...state,
            messages: resolvedRetry.updatedMessages!,
            compressedContextSummary: resolvedRetry.newCompressedContextSummary ?? state.compressedContextSummary,
            compressionState: resolvedRetry.newCompressionState ?? state.compressionState,
          }));
        }

        try {
          const persistFn = (params as unknown as Record<string, unknown>).schedulePersist;
          if (typeof persistFn === "function") {
            (persistFn as () => void)();
          }
        } catch { /* persist failure is non-blocking */ }
      } else if (isForce && autoCompressResult.action === "no_op") {
        // Emergency compression was attempted but failed — notify user via toast
        try {
          showMessage("上下文压力过大，紧急压缩未能完成。建议手动压缩或开启新对话。", 5000);
        } catch { /* showMessage may not be available in all contexts */ }
      }
    } catch (err) {
      // Auto compression failure must not block the conversation
      pushAgentDebugEvent("CONTEXT_AUTO_COMPRESSION_FAILED", {
        error: err instanceof Error ? err.message.slice(0, 80) : String(err),
        phase: "pre_build_context",
      }, "warn");
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

    const conversationContext = buildConversationContext({
      messages: stateAfterCompression.messages,
      stageSummaries: stateAfterCompression.stageSummaries ?? [],
      currentUserMessageId: actualUserMessageId,
      currentQuestion: trimmed,
      compressedContextSummary: stateAfterCompression.compressedContextSummary,
      compressionState: stateAfterCompression.compressionState,
      usageRatio: usageSnapshotForContext.usageRatio,
    });

    // Extract attachedDocs from current user message for reference grounding
    const currentUserMessage = stateAfterCompression.messages.find(
      (m): m is import("../../types/chat").UserChatMessage =>
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
      agentStatus: undefined,
    }));

    if (isAgentWorkbenchDebugLogEnabled()) {
      pushAgentDebugEvent("WORKBENCH_START", {
        scopeMode,
        traceEnabled: true,
      }, "debug");
    }

    let streamingContent = "";
    let liveWorkbenchEvents: import("../agent-workbench").AgentWorkbenchEvent[] = [];

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
      thinkingMode: thinkingMode ?? "off",
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
            messages.map((m) =>
              m.id === assistantMessageId && m.role === "assistant"
                ? { ...m, workbenchEvents: liveWorkbenchEvents }
                : m
            )
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
      const safeCode = sanitizeAgentTurnErrorCode(agentTurnOutcome.agentErrorCode);
      const errMsg = `Agent Workbench 未完成本轮回答：${safeCode}`;
      pushAgentDebugEvent("WORKBENCH_NO_FALLBACK", {
        agentErrorCode: safeCode,
        stopReasonCode: agentTurnOutcome.stopReasonCode,
        scopeMode,
      }, "warn");

      if (isWorkbenchStrictRuntimeTestEnabled()) {
        throw new Error(`Agent Workbench runtime failed: ${safeCode}`);
      }

      result = {
        scope: { type: "whole_kb" },
        scopeSummary: { type: "whole_kb", title: "知识库" },
        answer: errMsg,
        footerReferences: [],
        warnings: [errMsg],
        events: liveWorkbenchEvents,
      };
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
          messages
            .map((m) => {
              if (m.id !== assistantMessageId || m.role !== "assistant") return m;
              if (!m.content.trim()) return null;
              return {
                ...m,
                agentStatus: undefined,
                isComplete: false,
              };
            })
            .filter((m): m is ChatMessage => m !== null)
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

      setMessages((messages) =>
        messages.map((m) =>
          m.id === assistantMessageId && m.role === "assistant"
            ? {
                ...m,
                content: streamingContent || result.answer,
                citedReferences: result.footerReferences,
                agentMemory,
                workbenchEvents: result.events.length > 0 ? result.events : liveWorkbenchEvents,
                isComplete: true,
                agentStatus: undefined,
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
          const nextStageSummaries = appendPlannerStageSummary({
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
        setMessages((messages) => {
          const filtered = messages.filter((m) => {
            if (m.id !== assistantMessageId) return true;
            if (m.role !== "assistant") return true;
            return m.content.trim().length > 0;
          });

          return filtered.map((m) =>
            m.id === assistantMessageId && m.role === "assistant"
              ? { ...m, agentStatus: undefined, isComplete: false }
              : m
          );
        });
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
    pushAgentDebugEvent("MODE_FLOW_FAILED", { error: rawErrorMsg }, "error");

    if (setMessages) {
      setMessages((messages) =>
        messages.filter((m) => m.id !== assistantMessageId)
      );
    }

    const userErrorMsg = formatAgentWorkbenchUserError(rawErrorMsg);

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
