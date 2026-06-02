/**
 * Agentic RAG Mode Flow
 *
 * 新 Agentic RAG 服务入口到现有聊天 UI 状态的适配层。
 *
 * 职责：
 * - 添加/复用 user message、创建 assistant pending、构建 recentContext
 * - 调用 runAgenticRagTurn、把 composed answer 写回 assistant message
 * - 支持流式输出：onAnswerChunk 逐 chunk 更新 assistant message content
 * - 写入 agenticMemory 和 citedReferences，不构建旧 AgentTurnMemory
 *
 * 流程：
 *   1. trim question
 *   2. map mode
 *   3. 添加 user message
 *   4. updateState asking=true
 *   5. 创建 assistant pending
 *   6. 构建 recentContext
 *   7. 调用 runAgenticRagTurn（含流式回调）
 *   8. 处理结果（abort/正常/错误）
 *   9. updateState asking=false
 */

import type { AskByModeParams, AskByModeResult } from "./ask-by-mode-types";
import type { ChatMode } from "../../constants/chat-modes";
import type { ChatMessage } from "../../types/chat";
import type { AgentScopeMode } from "../agentic-rag/scope/types";
import type { AgenticRagProgressEvent } from "../agentic-rag/run-agentic-rag-turn";
import { runAgenticRagTurn } from "../agentic-rag/run-agentic-rag-turn";
import { buildAgenticRecentContext } from "../agentic-rag/runtime/build-runtime-context";
import { buildAgenticRagTurnMemory } from "../agentic-rag/runtime/turn-memory";
import { pushAgentDebugEvent } from "../agentic-rag/debug/agentic-rag-debug";
import { buildTurnSummary } from "../context-compression";

/**
 * Agentic RAG Mode Flow 参数
 */
export interface RunAgenticRagModeFlowParams extends AskByModeParams {
  userMessageAlreadyAdded?: boolean;
  userMessageId?: string;
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

function formatAgenticRagUserError(errorMsg: string): string {
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

function isAgenticRagDebugLogEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } }).env;
  return env?.DEV === true || env?.MODE === "development";
}

function mapAgenticRagProgressToStatusText(event: AgenticRagProgressEvent): string {
  switch (event.phase) {
    case "resolving_scope":
      return "正在获取上下文";
    case "building_context":
      return "正在准备上下文";
    case "analyzing_question":
      return "正在分析问题";
    case "planning_retrieval":
      return "正在确定检索方案";
    case "searching_evidence":
      return "正在检索资料";
    case "assembling_evidence":
      return "正在组合资料";
    case "reading_fixed_docs":
      return "正在获取文档";
    case "running_agent_loop":
      return "正在分析和检索资料";
    case "composing_answer":
      return "正在组织回答";
    case "streaming_answer":
      return "正在生成回答";
    case "done":
      return "已完成";
    default:
      return "正在处理";
  }
}

function logAgenticRagDebugSnapshot(result: Awaited<ReturnType<typeof runAgenticRagTurn>>): void {
  if (!isAgenticRagDebugLogEnabled()) {
    return;
  }

  const traceBrief = (result.trace ?? []).slice(0, 20).map((s) => ({
    name: s.name,
    status: s.status,
  }));

  const actionNames = (result.actionHistory ?? []).map((a) => a.type);

  console.debug("[AgenticRagDebugSnapshot]", {
    scopeType: result.scope?.type,
    workspaceReadDocs: result.workspace?.readDocuments?.length ?? 0,
    workspaceBlockContexts: result.workspace?.readBlockContexts?.length ?? 0,
    toolActionNames: actionNames,
    evidenceItemCount: result.finalEvidencePack?.items.length ?? 0,
    footerReferencesCount: result.footerReferences.length,
    warningsCount: result.warnings.length,
    traceBrief,
  });
}

/**
 * 运行 Agentic RAG Mode Flow
 * 适配层：将 runAgenticRagTurn 结果转换为现有聊天消息和状态
 * @param params 参数
 * @returns AskByModeResult
 */
export async function runAgenticRagModeFlow(
  params: RunAgenticRagModeFlowParams
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
    attachedDocs,
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

    addMessage({
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      agentStatus: "正在准备上下文",
      isComplete: false,
    });

    console.info("[KB-AGENT | ASSISTANT_RUN_MESSAGE_CREATED_SAFE]", {
      hasAgentStatus: true,
      contentChars: 0,
      isComplete: false,
    });

    updateState((state) => ({
      ...state,
      asking: true,
      qaError: "",
      error: "",
      agentStatus: "正在准备上下文",
    }));

    const excludeMessageIds = [
      actualUserMessageId,
      assistantMessageId,
    ].filter((id): id is string => Boolean(id));

    const currentState = getState();
    const recentContext = buildAgenticRecentContext({
      messages: currentState.messages,
      excludeMessageIds,
      maxTurns: 6,
      maxChars: 2400,
      compressedContextSummary: currentState.compressedContextSummary,
    });

    const traceEnabled = isAgenticRagDebugLogEnabled();

    if (traceEnabled) {
      console.info("[KB-AGENT | RAG 启动]", {
        scopeMode,
        traceEnabled,
      });
    }

    let streamingContent = "";
    let hasTextDeltaStarted = false;
    let reasoningStreamingActive = false;
    let latestStatusKind = "正在准备上下文";
    let uiChunkIndex = 0;

    const updateRunMessageAgentStatus = (statusText: string | undefined) => {
      if (!setMessages) return;
      if (statusText === latestStatusKind) return;
      const previousStatus = latestStatusKind;
      latestStatusKind = statusText ?? "cleared";
      setMessages((messages) =>
        messages.map((m) => {
          if (m.id !== assistantMessageId || m.role !== "assistant") return m;
          if (m.content.trim().length > 0) return m;
          console.info("[KB-AGENT | ASSISTANT_RUN_STATUS_UPDATED_SAFE]", {
            from: previousStatus,
            to: statusText ?? "cleared",
            contentChars: m.content.length,
          });
          return { ...m, agentStatus: statusText };
        })
      );
    };

    const result = await runAgenticRagTurn({
      question: trimmed,
      mode: scopeMode,
      customDocIds: hasCustomDocs ? customDocIds : undefined,
      attachedDocs: attachedDocs && attachedDocs.length > 0 ? attachedDocs : undefined,
      recentContextSummary: recentContext?.summary,
      trace: traceEnabled,
      runtime: {
        abortSignal,
        trace: traceEnabled,
        recentContext: recentContext
          ? {
              ...recentContext,
            }
          : undefined,
        onAnswerStart: () => {
          if (reasoningStreamingActive) return;
          pushAgentDebugEvent("ASSISTANT_RUN_WAITING_FOR_TEXT_STATE_SAFE", {
            mode: scopeMode,
            isFixedDocumentScope: scopeMode === "custom_docs",
            hasContent: streamingContent.length > 0,
            statusSet: "waiting_for_text",
          }, "info");
          updateRunMessageAgentStatus("正在等待模型正文输出");
        },
        onAnswerChunk: ({ chunk, fullContent }) => {
          uiChunkIndex++;
          streamingContent = fullContent;
          if (!hasTextDeltaStarted) {
            hasTextDeltaStarted = true;
            pushAgentDebugEvent("ASSISTANT_RUN_FIRST_CHUNK_CLEARED_STATUS_SAFE", {
              chunkIndex: uiChunkIndex,
              fullContentChars: fullContent.length,
              hadAgentStatus: latestStatusKind !== "cleared",
            }, "info");
          }
          if (setMessages) {
            let messageFound = false;
            let isComplete = false;
            let hadAgentStatus = false;
            setMessages((messages) =>
              messages.map((m) => {
                if (m.id !== assistantMessageId || m.role !== "assistant") return m;
                messageFound = true;
                isComplete = !!m.isComplete;
                hadAgentStatus = !!m.agentStatus;
                return { ...m, content: fullContent, agentStatus: undefined, isComplete: false };
              })
            );
            if (!messageFound) {
              pushAgentDebugEvent("ASSISTANT_RUN_STREAM_CHUNK_DROPPED_SAFE", {
                chunkIndex: uiChunkIndex,
                deltaChars: chunk.length,
                fullContentChars: fullContent.length,
                messageFound: false,
              }, "warn");
            } else if (uiChunkIndex === 0) {
              pushAgentDebugEvent("ASSISTANT_RUN_STREAM_CHUNK_APPLIED_SAFE", {
                chunkIndex: uiChunkIndex,
                deltaChars: chunk.length,
                fullContentChars: fullContent.length,
                messageFound: true,
                isComplete,
                hadAgentStatus,
              }, "debug");
            }
          }
        },
        onAnswerFinish: (fullContent) => {
          reasoningStreamingActive = false;
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
        onReasoningStart: () => {
          reasoningStreamingActive = true;
          updateState((state) => ({
            ...state,
            agentStatus: undefined,
          }));
          if (setMessages) {
            setMessages((messages) =>
              messages.map((m) =>
                m.id === assistantMessageId && m.role === "assistant"
                  ? { ...m, reasoning: { content: "", status: "streaming", partCount: 0, chars: 0 }, agentStatus: undefined }
                  : m
              )
            );
          }
        },
        onReasoningChunk: ({ fullContent }) => {
          if (setMessages) {
            setMessages((messages) =>
              messages.map((m) => {
                if (m.id !== assistantMessageId || m.role !== "assistant") return m;
                const prev = m.reasoning ?? { content: "", status: "streaming" as const, partCount: 0, chars: 0 };
                return {
                  ...m,
                  reasoning: {
                    content: fullContent,
                    status: "streaming" as const,
                    partCount: prev.partCount + 1,
                    chars: fullContent.length,
                  },
                  agentStatus: undefined,
                };
              })
            );
          }
        },
        onReasoningFinish: (fullContent) => {
          reasoningStreamingActive = false;
          if (setMessages) {
            setMessages((messages) =>
              messages.map((m) => {
                if (m.id !== assistantMessageId || m.role !== "assistant") return m;
                const prev = m.reasoning ?? { content: "", status: "streaming" as const, partCount: 0, chars: 0 };
                return {
                  ...m,
                  reasoning: {
                    content: fullContent,
                    status: "done",
                    partCount: prev.partCount,
                    chars: fullContent.length,
                  },
                };
              })
            );
          }
        },
      },
      chatModelSelection,
      thinkingMode: thinkingMode ?? "off",
      onProgress: (event) => {
        if (event.phase === "resolving_scope") {
          console.info("[KB-AGENT | THINKING_MODE_RESOLVED_SAFE]", {
            uiValue: thinkingMode ?? "off",
            runtimeValue: thinkingMode ?? "off",
            mode: scopeMode,
          });
        }
        if (event.phase === "streaming_answer") {
          if (!hasTextDeltaStarted) {
            hasTextDeltaStarted = true;
            reasoningStreamingActive = false;
            updateRunMessageAgentStatus("正在等待模型正文输出");
          }
          return;
        }
        if (reasoningStreamingActive) return;
        const statusText = event.detail || mapAgenticRagProgressToStatusText(event);
        updateState((state) => ({
          ...state,
          agentStatus: statusText,
        }));
        updateRunMessageAgentStatus(statusText);
      },
    });

    if (isAgenticRagDebugLogEnabled()) {
      logAgenticRagDebugSnapshot(result);
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
      const agenticMemory = buildAgenticRagTurnMemory({
        turnId: assistantMessageId,
        userQuestion: trimmed,
        answer: result.answer,
        result,
      });

      const turnSummaryResult = buildTurnSummary({
        userQuestion: trimmed,
        answerContent: streamingContent || result.answer,
        answerSummary: agenticMemory.answerSummary,
        footerReferenceDocIds: agenticMemory.footerReferenceDocIds,
        footerReferenceTitles: agenticMemory.footerReferenceTitles,
        scopeMode: scopeMode,
        citedReferenceTitles: result.footerReferences?.map(r => r.docTitle).filter(Boolean),
      });

      setMessages((messages) =>
        messages.map((m) =>
          m.id === assistantMessageId && m.role === "assistant"
            ? {
                ...m,
                content: streamingContent || result.answer,
                citedReferences: result.footerReferences,
                agenticMemory,
                isComplete: true,
                agentStatus: undefined,
                hiddenTurnSummary: turnSummaryResult.summary || undefined,
                hiddenTurnSummaryMeta: turnSummaryResult.meta,
              }
            : m
        )
      );

      const finalContent = streamingContent || result.answer;
      console.info("[KB-AGENT | ASSISTANT_RUN_FINALIZED_SAFE]", {
        answerChars: finalContent.length,
        hasReferences: (result.footerReferences?.length ?? 0) > 0,
        isComplete: true,
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
    console.warn("[AgenticRagModeFlow] failed:", err);

    if (setMessages) {
      setMessages((messages) =>
        messages.filter((m) => m.id !== assistantMessageId)
      );
    }

    const userErrorMsg = formatAgenticRagUserError(rawErrorMsg);

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
