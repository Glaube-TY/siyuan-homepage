/**
 * Agentic RAG Mode Flow
 *
 * v3 Skill-first Agent Workbench 的 orchestration 适配层。
 *
 * 职责：
 * - 添加/复用 user message、创建 assistant pending、构建 recentContext
 * - 调用 runV3AgenticRagTurn、把 composed answer 写回 assistant message
 * - 支持流式输出：onAnswerChunk 逐 chunk 更新 assistant message content
 * - 写入 agenticMemory 和 citedReferences，不构建旧 AgentTurnMemory
 *
 * 重要（runtime cutover to v3-only）：
 * - 真实聊天只走 v3；不允许 switch 到其他运行时。
 * - v3 失败时直接把安全错误呈现到当前 assistant message。
 * - 本路径只调用 V3 Agent Workbench。
 *
 * 流程：
 *   1. trim question
 *   2. map mode
 *   3. 添加 user message
 *   4. updateState asking=true
 *   5. 创建 assistant pending
 *   6. 构建 recentContext
 *   7. 调用 runV3AgenticRagTurn（含流式回调）
 *   8. 处理结果（abort/正常/错误）
 *   9. updateState asking=false
 */

import type { AskByModeParams, AskByModeResult } from "./ask-by-mode-types";
import type { ChatMode } from "../../constants/chat-modes";
import type { ChatMessage } from "../../types/chat";
import type { AgentScopeMode } from "../agentic-rag/scope/types";
import { runV3AgenticRagTurn, type V3TurnOutcome } from "../agentic-rag/run-v3-agentic-rag-turn";
import type { V3TurnResult } from "../agentic-rag/workbench/contracts/turn-result";
import { buildAgenticRagTurnMemory } from "../agentic-rag/runtime/turn-memory";
import { pushAgentDebugEvent } from "../agentic-rag/debug/agentic-rag-debug";
import { buildTurnSummary } from "../context-compression";
import type { RecentTurnContext } from "../agentic-rag/workbench/contracts/recent-turn-context";

// Re-export for backward compatibility
export type { RecentTurnContext };

/** 最多保留最近 N 轮对话上下文。 */
const MAX_RECENT_TURNS = 6;

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

/**
 * 从历史消息构建最近对话上下文（脱敏，不含 docId/blockId/path/internalMapping）。
 * - 提取最近 N 条 user/assistant 消息摘要。
 * - 如果上一轮 assistant 展示了 references，提取其资源 ID + title + sourceType + snippet。
 * - 如果上一轮有 visible artifacts（如文档树、候选列表），提取其摘要。
 * - 内容只作为中性上下文事实，不触发任何工具选择。
 * - 通用结构，未来可复用于网页、MCP、文件等来源。
 */
function buildRecentConversationContext(messages: ChatMessage[]): RecentTurnContext[] {
  const turns: RecentTurnContext[] = [];

  // 从后往前遍历，收集最近 N 轮
  // turnIndex: 0=最近一轮 assistant，1=上一轮...
  let assistantTurnIndex = 0;
  for (let i = messages.length - 1; i >= 0 && turns.length < MAX_RECENT_TURNS; i--) {
    const msg = messages[i];

    if (msg.role === "user") {
      turns.unshift({
        role: "user",
        textPreview: truncateText(msg.content, 200),
        createdAt: msg.createdAt,
      });
    } else if (msg.role === "assistant" && msg.content) {
      const currentTurnAge = assistantTurnIndex;
      assistantTurnIndex++;

      const entry: RecentTurnContext = {
        role: "assistant",
        textPreview: truncateText(msg.content, 300),
        createdAt: msg.createdAt,
        turnIndex: currentTurnAge,
      };

      // 提取 displayReferences：直接使用真实 docId/blockId。
      const mem = (msg as { agenticMemory?: { footerReferenceDocIds?: string[]; footerReferenceTitles?: string[]; footerReferenceBlockIds?: string[]; workspaceSummary?: { candidateDocCount?: number; candidateBlockCount?: number } }; id?: string }).agenticMemory;
      const msgId = (msg as { id?: string }).id;
      const footerRefs = mem?.footerReferenceDocIds?.map((docId, idx) => {
        const blockId = mem?.footerReferenceBlockIds?.[idx];
        const rawTitle = mem?.footerReferenceTitles?.[idx];
        const ref: NonNullable<RecentTurnContext["displayReferences"]>[number] = {
          docId,
          // title 为空但 docId 存在时不丢资源，使用"未命名资源"
          title: rawTitle || "未命名资源",
          sourceType: "siyuan_doc",
          source: "final_answer_reference",
          turnAge: currentTurnAge,
          sourceTurnId: msgId,
        };
        if (blockId) {
          ref.blockId = blockId;
        }
        return ref;
      }).filter((r) => r.docId);
      if (footerRefs && footerRefs.length > 0) {
        entry.displayReferences = footerRefs;
      }

      // 提取 visible artifacts（如文档树标题、候选列表数量等）
      const artifacts = extractVisibleArtifacts(mem);
      if (artifacts && artifacts.length > 0) {
        entry.visibleArtifacts = artifacts;
      }

      turns.unshift(entry);
    }
  }

  return turns;
}

/** 截断文本到指定长度。 */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/** 从 assistant message 的 agenticMemory 提取可见产物摘要（如文档树标题、候选列表数量等）。 */
function extractVisibleArtifacts(mem: { workspaceSummary?: { candidateDocCount?: number; candidateBlockCount?: number } } | undefined): RecentTurnContext["visibleArtifacts"] {
  const artifacts: NonNullable<RecentTurnContext["visibleArtifacts"]> = [];

  // 从 agenticMemory 的 workspaceSummary 提取候选文档/块数量
  const ws = mem?.workspaceSummary;
  if (ws) {
    if (ws.candidateDocCount && ws.candidateDocCount > 0) {
      artifacts.push({
        type: "candidate_docs",
        count: ws.candidateDocCount,
        summary: `候选文档 ${ws.candidateDocCount} 篇`,
      });
    }
    if (ws.candidateBlockCount && ws.candidateBlockCount > 0) {
      artifacts.push({
        type: "candidate_blocks",
        count: ws.candidateBlockCount,
        summary: `候选块 ${ws.candidateBlockCount} 段`,
      });
    }
  }

  return artifacts.length > 0 ? artifacts : undefined;
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

/**
 * dev-only v3 strict runtime test 开关。
 * - 仅在开发环境或 trace/debug 开启时生效。
 * - 通过 localStorage "kbAgent.v3StrictRuntimeTest" === "1" 开启。
 * - 默认不开启，不影响普通用户。
 * - 仅用于诊断 v3 失败路径，不参与 Planner 工具选择，不改变 Tool/Skill 决策。
 */
function isV3StrictRuntimeTestEnabled(): boolean {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return false;
  }
  try {
    if (window.localStorage.getItem("kbAgent.v3StrictRuntimeTest") !== "1") {
      return false;
    }
  } catch {
    return false;
  }
  return isAgenticRagDebugLogEnabled();
}

function sanitizeV3ErrorCode(raw: string | undefined): string {
  if (!raw) return "v3_runtime_error";
  // 仅保留可见的 safe code；不含 docId / path / 内部 mapping。
  // v3 自身的 safe code 形如 "stopped_by_planner" / "fail_closed_max_steps" /
  // "fail_closed_no_planner_decision" / "exception"，已经安全。
  return String(raw).slice(0, 64);
}

/**
 * 运行 Agentic RAG Mode Flow
 * 适配层：将 runV3AgenticRagTurn 结果转换为现有聊天消息和状态
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
    // actualUserMessageId 当前 v3 路径下不直接被引用；保留赋值以备 future 最近上下文回写。
    void actualUserMessageId;

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

    const currentState = getState();

    if (isAgenticRagDebugLogEnabled()) {
      console.info("[KB-AGENT | RAG 启动]", {
        scopeMode,
        traceEnabled: true,
      });
    }

    let streamingContent = "";

    // ── v3-only runtime path（runtime cutover） ──
    // 真实聊天只走 v3 Agent Workbench。
    // v3 失败时直接把安全错误呈现到当前 assistant message。
    let result: V3TurnResult | null = null;
    const recentConversationContext = buildRecentConversationContext(currentState.messages);
    const v3Outcome: V3TurnOutcome = await runV3AgenticRagTurn({
      question: trimmed,
      mode: scopeMode,
      customDocIds: hasCustomDocs ? customDocIds : undefined,
      abortSignal,
      chatModelSelection,
      thinkingMode: thinkingMode ?? "off",
      recentConversationContext,
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

    if (v3Outcome.ok && v3Outcome.result) {
      result = v3Outcome.result;
    } else {
      // v3 失败：直接呈现安全错误到 assistant message，不 switch 到其他运行时。
      const safeCode = sanitizeV3ErrorCode(v3Outcome.v3ErrorCode);
      const errMsg = `V3 Workbench 未完成本轮回答：${safeCode}`;
      console.info("[AgenticRagV3] V3_RUNTIME_NO_FALLBACK", {
        v3ErrorCode: safeCode,
        stopReasonCode: v3Outcome.stopReasonCode,
        scopeMode,
      });

      if (isV3StrictRuntimeTestEnabled()) {
        throw new Error(`V3 runtime failed: ${safeCode}`);
      }

      result = {
        scope: { type: "whole_kb" },
        scopeSummary: { type: "whole_kb", title: "知识库" },
        answer: errMsg,
        footerReferences: [],
        warnings: [errMsg],
        trace: [],
        actionHistory: [],
      };
    }

    if (isAgenticRagDebugLogEnabled() && result) {
      console.info("[KB-AGENT | V3_TURN_OUTCOME]", {
        scopeMode,
        v3Ok: v3Outcome.ok,
        steps: v3Outcome.steps,
        footerReferencesCount: v3Outcome.footerReferencesCount ?? result.footerReferences.length,
      });
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
