/**
 * Ask By Mode 共享类型定义
 *
 * 本文件职责：
 * - 集中存放 ask-by-mode 相关 orchestrator/helper 共享使用的类型
 *
 * 注意：
 * - 只包含类型定义，不包含运行时逻辑
 * - 保持文件小而清晰
 */

import type { KbSessionState } from "../../types/session";
import type { ChatMessage, AttachedKbDoc } from "../../types/chat";
import type { ChatMode } from "../../constants/chat-modes";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { ThinkingMode } from "../../types/session";

/** Ask By Mode 参数 */
export interface AskByModeParams {
  mode: ChatMode;
  question: string;
  getState: () => KbSessionState;
  updateState: (updater: (state: KbSessionState) => Partial<KbSessionState>) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => void;
  /** 用于中断流式输出的 AbortSignal */
  abortSignal?: AbortSignal;
  /** 本轮对话使用的模型选择（优先于 settings 中的默认模型） */
  chatModelSelection?: ChatModelSelection | null;
  /** 重新生成时复用已有 user message，不追加重复 user */
  existingUserMessageId?: string;
  /** 思考模式：off=关闭，on=开启 */
  thinkingMode?: ThinkingMode;
  /** 用户手动附加的文档 ID 列表（可选，非空时强制走 custom_docs scope） */
  customDocIds?: string[];
  /** 用户手动附加的文档轻量元信息（可选，写入 user message 便于 UI 展示） */
  attachedDocs?: AttachedKbDoc[];
  /** 当前模型的上下文窗口 tokens 数（可选，用于上下文预算估算和压缩触发） */
  contextWindowTokens?: number;
}

/** Ask By Mode 结果 */
export interface AskByModeResult {
  success: boolean;
  error?: string;
}
