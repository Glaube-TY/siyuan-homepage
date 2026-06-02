/**
 * Agentic RAG Recent Context Types
 *
 * Agentic RAG 专用的轻量运行时上下文类型，只保存最终回答中显示过的参考资料。
 *
 * 职责：
 * - 定义 AgenticRuntimeRecentContext：供 executor 读取的轻量 recent context
 * - 定义 AgenticRuntimeContext：Agentic RAG 运行时上下文
 * - 只保留 displayed references（footer/cited），不保存 hidden evidence
 * - 不包含 readEvidenceRefs、evidenceReferences、recentEvidenceReferences
 * - 支持 ConversationTurnMemory 数组，保留最近 N 轮完整工作记忆
 */

import type { AgenticRagProgressEvent } from "./progress-types";

export interface ConversationTurnMemoryForContext {
  turnId: string;
  userQuestion: string;
  assistantSummary: string;
  answerItems: {
    itemIndex: number;
    itemText: string;
    usedEvidenceHandles: string[];
  }[];
  footerRefs: { docId?: string; docTitle: string }[];
}

export interface AgenticRuntimeRecentContext {
  summary?: string;
  recentUserQuestions?: string[];
  recentAssistantSummaries?: string[];
  recentReferenceDocIds?: string[];
  recentReferenceTitles?: string[];
  lastUserQuestion?: string;
  lastAssistantSummary?: string;
  lastReferenceDocIds?: string[];
  lastReferenceTitles?: string[];
  conversationTurns?: ConversationTurnMemoryForContext[];
}

export interface AgenticRuntimeContext {
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
  now?: number;
  trace?: boolean;
  recentContext?: AgenticRuntimeRecentContext;
  onAnswerChunk?: (event: { chunk: string; fullContent: string }) => void;
  onAnswerStart?: () => void;
  onAnswerFinish?: (fullContent: string) => void;
  onProgress?: (event: AgenticRagProgressEvent) => void;
  onReasoningChunk?: (event: { chunk: string; fullContent: string }) => void;
  onReasoningStart?: () => void;
  onReasoningFinish?: (fullContent: string) => void;
}
