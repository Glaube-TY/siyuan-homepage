/**
 * Ask By Mode Orchestration
 * 按聊天模式统一分发提问请求
 *
 * 职责：
 * - 统一接收 mode + question
 * - 作为 dispatcher 分发到 Agentic RAG Mode Flow
 * - 所有模式统一收口到 Agentic RAG
 */

import { isChatModeAvailable, CHAT_MODES } from "../../constants/chat-modes";
import type { AskByModeParams, AskByModeResult } from "./ask-by-mode-types";
import { runAgenticRagModeFlow } from "./agentic-rag-mode-flow";
import { pushAgentDebugEvent } from "../agentic-rag/debug/agentic-rag-debug";
import type { UserMessageRequestContext } from "../../types/chat";

export type { AskByModeParams, AskByModeResult } from "./ask-by-mode-types";

/**
 * 生成消息唯一 id
 */
function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 统一入口：按模式提问
 * 直接转发到 askByModeInner，模型选择由 runAgenticRagTurn 内部处理
 */
export async function askByMode(params: AskByModeParams): Promise<AskByModeResult> {
  return askByModeInner(params);
}

/**
 * askByMode 内部实现
 * 统一收口到 Agentic RAG Mode Flow
 */
async function askByModeInner(params: AskByModeParams): Promise<AskByModeResult> {
  const { mode, question, addMessage, updateState, existingUserMessageId, attachedDocs } = params;

  // 检查模式可用性
  if (!isChatModeAvailable(mode)) {
    const modeLabel = CHAT_MODES.find((m) => m.id === mode)?.label || mode;
    return {
      success: false,
      error: `「${modeLabel}」功能暂未开放`,
    };
  }

  const trimmed = question.trim();
  if (!trimmed) {
    return { success: false, error: "问题不能为空" };
  }

  const hasCustomDocs = Array.isArray(attachedDocs) && attachedDocs.length > 0;
  const effectiveScopeMode = hasCustomDocs ? "custom_docs" : mode;
  const customDocIds = hasCustomDocs ? attachedDocs!.map((d) => d.docId) : undefined;

  const effectiveAttachedDocs = attachedDocs;

  let userMessageId: string;

  if (existingUserMessageId) {
    // 重新生成：复用已有 user message，不追加重复 user
    userMessageId = existingUserMessageId;
  } else {
    // 新提问：添加用户消息
    userMessageId = createMessageId();
    const requestContext: UserMessageRequestContext = {
      originalMode: mode,
      effectiveScopeMode,
      customDocIds,
      attachedDocs: effectiveAttachedDocs,
      thinkingMode: params.thinkingMode,
      createdFrom: "send",
    };
    addMessage({
      id: userMessageId,
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
      ...(effectiveAttachedDocs && effectiveAttachedDocs.length > 0 ? { attachedDocs: effectiveAttachedDocs } : {}),
      requestContext,
    });
    pushAgentDebugEvent("USER_MESSAGE_REQUEST_CONTEXT_STORED_SAFE", {
      originalMode: mode,
      effectiveScopeMode,
      hasCustomDocs,
      hasEffectiveAttachedDocs: Array.isArray(effectiveAttachedDocs) && effectiveAttachedDocs.length > 0,
      docCount: customDocIds?.length ?? (effectiveAttachedDocs?.length ?? 0),
      createdFrom: "send",
    }, "info");
  }

  // 进入 asking 状态，开始后台处理，并清空上一轮调试态
  updateState((state) => ({
    ...state,
    asking: true,
    qaError: "",
    error: "",
  }));

  // 所有模式统一收口到 Agentic RAG Mode Flow
  return runAgenticRagModeFlow({
    ...params,
    attachedDocs: effectiveAttachedDocs,
    question: trimmed,
    userMessageAlreadyAdded: true,
    userMessageId,
    abortSignal: params.abortSignal,
  });
}
