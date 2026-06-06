/**
 * Context Usage Estimation
 *
 * 只做用量统计和 UI 显示，不改变任何业务动作。
 * 不读取/输出文档正文内容，只统计长度/count。
 * 不因为 usageRatio 自动裁剪、压缩或改变工具动作。
 *
 * attached docs 只进入轻量元信息估算，不自动把全文塞入上下文。
 * 文档正文应由 Planner 调 read_docs 获取。
 */

import type { ChatMessage } from "./chat";

export type ContextUsageLevel = "normal" | "warn" | "critical";

export type ContextUsageMaxContextSource = "model_config" | "default";

export interface ContextUsageBreakdown {
  conversationMessages: number;
  attachedDocsMeta: number;
  runtimeReferences: number;
  agentTraceExcluded: number;
  finalPromptEstimate: number;
}

export interface ContextUsageSnapshot {
  usedChars: number;
  estimatedTokens: number;
  maxContextTokens: number;
  maxContextSource: ContextUsageMaxContextSource;
  usageRatio: number;
  unclampedRatioPct: number;
  level: ContextUsageLevel;
  breakdown: ContextUsageBreakdown;
}

/**
 * 上下文压缩状态
 * 支持手动触发和自动触发。
 */
export interface ContextCompressionState {
  enabled: boolean;
  lastCompressedAt?: number;
  /** Number of messages marked as compacted (message count, not turn count) */
  compressedMessageCount?: number;
  /** Number of complete turns (user+assistant pairs) that have been compacted (optional, for debug) */
  compressedTurnCount?: number;
  /** Number of Planner stage summaries rendered into compressedContextSummary */
  compressedStageSummaryCount?: number;
  /** Latest compressed stage summary index */
  latestCompressedStageIndex?: number;
  /** Latest complete turn index covered by compression */
  latestCompressedTurnIndex?: number;
  summaryChars?: number;
  summaryTokenEstimate?: number;
  version?: number;
  /** Whether auto compression is enabled */
  autoCompressionEnabled?: boolean;
  /** Usage ratio threshold to trigger auto compression (default 0.75) */
  autoCompressionRatio?: number;
  /** Usage ratio threshold to force compression (default 0.9) */
  forceCompressionRatio?: number;
  /** Max chars for compressed summary before rolling (default 8000) */
  maxCompressedSummaryChars?: number;
  /** Timestamp of last auto compression */
  lastAutoCompressedAt?: number;
  /** Number of auto compressions performed */
  autoCompressedCount?: number;
  /** Number of times summary was rolled/overflowed (not exact message count) */
  rolledSummaryCount?: number;
  /** Trigger type of the most recent compression */
  lastCompressionTrigger?: "manual" | "auto" | "force";
}

export const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
const CHARS_PER_TOKEN = 3.5;
const WARN_RATIO = 0.6;
const CRITICAL_RATIO = 0.85;

const SYSTEM_PROMPT_ESTIMATE_CHARS = 4000;
const TOOL_CONTRACT_ESTIMATE_CHARS = 2000;
const ANSWER_FORMAT_ESTIMATE_CHARS = 1000;
const FINAL_PROMPT_ESTIMATE_CHARS = SYSTEM_PROMPT_ESTIMATE_CHARS + TOOL_CONTRACT_ESTIMATE_CHARS + ANSWER_FORMAT_ESTIMATE_CHARS;

const RUNTIME_REFERENCE_PER_DOC_CHARS = 120;
const ATTACHED_DOCS_META_PER_DOC_CHARS = 80;

export function estimateTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN);
}

function resolveLevel(ratio: number): ContextUsageLevel {
  if (ratio >= CRITICAL_RATIO) return "critical";
  if (ratio >= WARN_RATIO) return "warn";
  return "normal";
}

function estimateMessageChars(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if ((msg as { compacted?: boolean }).compacted) continue;
    if ("content" in msg && typeof msg.content === "string") {
      total += msg.content.length;
    }
    if (msg.role === "user" && msg.attachedDocs) {
      for (const doc of msg.attachedDocs) {
        total += (doc.title || "").length + ATTACHED_DOCS_META_PER_DOC_CHARS;
      }
    }
    if (msg.role === "assistant") {
      if (msg.citedReferences) {
        for (const ref of msg.citedReferences) {
          total += (ref.docTitle || "").length + (ref.headingPathText || "").length + RUNTIME_REFERENCE_PER_DOC_CHARS;
        }
      }
    }
  }
  return total;
}

export interface EstimateContextUsageParams {
  messages: ChatMessage[];
  attachedDocCount: number;
  runtimeReferenceDocCount?: number;
  contextWindowTokens?: number;
  compressedSummaryChars?: number;
  stageSummaryStatusChars?: number;
}

export function estimateContextUsage(params: EstimateContextUsageParams): ContextUsageSnapshot {
  const {
    messages,
    attachedDocCount,
    runtimeReferenceDocCount = 0,
    contextWindowTokens,
    compressedSummaryChars = 0,
    stageSummaryStatusChars = 0,
  } = params;

  const maxContextTokens = contextWindowTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  const maxContextSource: ContextUsageMaxContextSource = contextWindowTokens ? "model_config" : "default";
  const maxContextChars = Math.round(maxContextTokens * CHARS_PER_TOKEN);

  const conversationMessages = estimateMessageChars(messages) + compressedSummaryChars + stageSummaryStatusChars;
  const attachedDocsMeta = attachedDocCount * ATTACHED_DOCS_META_PER_DOC_CHARS;
  const runtimeReferences = runtimeReferenceDocCount * RUNTIME_REFERENCE_PER_DOC_CHARS;
  const agentTraceExcluded = 0;
  const finalPromptEstimate = FINAL_PROMPT_ESTIMATE_CHARS;

  const usedChars = conversationMessages + attachedDocsMeta + runtimeReferences + finalPromptEstimate;
  const estimatedTokens = estimateTokens(usedChars);
  const rawRatio = maxContextChars > 0 ? usedChars / maxContextChars : 0;
  const usageRatio = Math.min(rawRatio, 1);
  const unclampedRatioPct = Math.round(rawRatio * 100);
  const level = resolveLevel(usageRatio);

  return {
    usedChars,
    estimatedTokens,
    maxContextTokens,
    maxContextSource,
    usageRatio,
    unclampedRatioPct,
    level,
    breakdown: {
      conversationMessages,
      attachedDocsMeta,
      runtimeReferences,
      agentTraceExcluded,
      finalPromptEstimate,
    },
  };
}
