/**
 * Chat session types
 *
 * 聊天会话存储类型定义。
 * 设计：index.json + sessions/*.json 分文件保存。
 *
 * 约束：
 * - index.json 只保存会话索引（轻量字段）。
 * - session 文件保存完整消息。
 * - sessionId 和文件名必须安全，禁止路径穿越。
 */

import type { ConversationStageSummary } from "../../../types/chat";
import type { AgentMessage } from "../../agent-core/messages/agent-message";
import type { ThinkingMode, WebAccessMode } from "../../../types/session";

export interface ChatSessionIndexEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview: string;
  modelProfileId?: string;
  pinned?: boolean;
  archived?: boolean;
}

export interface ChatSessionIndex {
  version: 1;
  activeSessionId: string;
  sessions: ChatSessionIndexEntry[];
  selectedMode?: string;
}

export interface ChatSessionMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  createdAt: number;
  [key: string]: unknown;
}

export interface ChatSessionData {
  version: 1;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatSessionMessage[];
  summary?: string;
  references?: unknown[];
  stageSummaries?: ConversationStageSummary[];
  compressionState?: unknown;
  compressedContextSummary?: string;
  /**
   * 当前会话输入区"深度思考"按钮状态（会话级持久化）
   * 旧 session 文件缺字段时默认 "off"
   */
  thinkingMode?: ThinkingMode;
  /**
   * 当前会话输入区"联网搜索"按钮状态（会话级持久化）
   * 旧 session 文件缺字段时默认 "off"
   */
  webAccessMode?: WebAccessMode;
  agentSession?: {
    id: string;
    messages: AgentMessage[];
    updatedAt: number;
  };
}
