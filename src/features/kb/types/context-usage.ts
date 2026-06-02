/**
 * Context Usage Estimation
 *
 * 只做用量统计和 UI 显示，不改变任何业务动作。
 * 不读取/输出文档正文内容，只统计长度/count。
 * 不因为 usageRatio 自动裁剪、压缩或改变工具动作。
 */

import type { ChatMessage } from "./chat";

export type ContextUsageLevel = "normal" | "warn" | "critical";

export type ContextUsageMaxContextSource = "model_config" | "default";

export interface ContextUsageBreakdown {
  conversationMessages: number;
  attachedDocsMeta: number;
  runtimeReferences: number;
  fixedDocContentEstimate: number;
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
 * 只能用户手动触发，不能自动执行。
 */
export interface ContextCompressionState {
  enabled: boolean;
  lastCompressedAt?: number;
  compressedMessageCount?: number;
  summaryChars?: number;
  summaryTokenEstimate?: number;
  preservedRecentTurnCount?: number;
  version?: number;
}

export interface DocCharCountEntry {
  docIdHash: string;
  charCount: number;
}

export interface DocCharCountResult {
  entries: DocCharCountEntry[];
  totalChars: number;
  estimateFailedCount: number;
}

export interface DocCharCountSqlExecutor {
  (sql: string): Promise<{ root_id: string; total_chars: number }[]>;
}

const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
const CHARS_PER_TOKEN = 3.5;
const WARN_RATIO = 0.6;
const CRITICAL_RATIO = 0.85;

const SYSTEM_PROMPT_ESTIMATE_CHARS = 4000;
const TOOL_CONTRACT_ESTIMATE_CHARS = 2000;
const ANSWER_FORMAT_ESTIMATE_CHARS = 1000;
const FINAL_PROMPT_ESTIMATE_CHARS = SYSTEM_PROMPT_ESTIMATE_CHARS + TOOL_CONTRACT_ESTIMATE_CHARS + ANSWER_FORMAT_ESTIMATE_CHARS;

const RUNTIME_REFERENCE_PER_DOC_CHARS = 120;
const ATTACHED_DOCS_META_PER_DOC_CHARS = 80;

const docCharCountCache = new Map<string, number>();

function hashDocId(docId: string): string {
  return docId.slice(0, 6) + "…" + docId.slice(-4);
}

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
      if (msg.agenticMemory) {
        total += msg.agenticMemory.answerSummary?.length ?? 0;
        for (const item of msg.agenticMemory.answerItems ?? []) {
          total += item.itemText?.length ?? 0;
        }
      }
    }
  }
  return total;
}

export async function estimateDocContentChars(
  docIds: string[],
  sqlExecutor: DocCharCountSqlExecutor,
): Promise<DocCharCountResult> {
  if (docIds.length === 0) {
    return { entries: [], totalChars: 0, estimateFailedCount: 0 };
  }

  const uncachedIds: string[] = [];
  const entries: DocCharCountEntry[] = [];
  let totalChars = 0;

  for (const docId of docIds) {
    const cached = docCharCountCache.get(docId);
    if (cached !== undefined) {
      entries.push({ docIdHash: hashDocId(docId), charCount: cached });
      totalChars += cached;
    } else {
      uncachedIds.push(docId);
    }
  }

  if (uncachedIds.length > 0) {
    try {
      const escapedIds = uncachedIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
      const rows = await sqlExecutor(
        `select root_id, sum(length(content)) as total_chars from blocks where root_id in (${escapedIds}) group by root_id`,
      );

      const queriedSet = new Set(rows.map((r) => r.root_id));
      for (const row of rows) {
        const chars = Number(row.total_chars) || 0;
        docCharCountCache.set(row.root_id, chars);
        entries.push({ docIdHash: hashDocId(row.root_id), charCount: chars });
        totalChars += chars;
      }

      const failedCount = uncachedIds.filter((id) => !queriedSet.has(id)).length;
      return { entries, totalChars, estimateFailedCount: failedCount };
    } catch {
      return { entries, totalChars, estimateFailedCount: uncachedIds.length };
    }
  }

  return { entries, totalChars, estimateFailedCount: 0 };
}

export function clearDocCharCountCache(docIds?: string[]): void {
  if (docIds) {
    for (const id of docIds) docCharCountCache.delete(id);
  } else {
    docCharCountCache.clear();
  }
}

export interface EstimateContextUsageParams {
  messages: ChatMessage[];
  attachedDocCount: number;
  fixedDocContentChars?: number;
  runtimeReferenceDocCount?: number;
  contextWindowTokens?: number;
  compressedSummaryChars?: number;
}

export function estimateContextUsage(params: EstimateContextUsageParams): ContextUsageSnapshot {
  const {
    messages,
    attachedDocCount,
    fixedDocContentChars = 0,
    runtimeReferenceDocCount = 0,
    contextWindowTokens,
    compressedSummaryChars = 0,
  } = params;

  const maxContextTokens = contextWindowTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  const maxContextSource: ContextUsageMaxContextSource = contextWindowTokens ? "model_config" : "default";
  const maxContextChars = Math.round(maxContextTokens * CHARS_PER_TOKEN);

  const conversationMessages = estimateMessageChars(messages) + compressedSummaryChars;
  const attachedDocsMeta = attachedDocCount * ATTACHED_DOCS_META_PER_DOC_CHARS;
  const runtimeReferences = runtimeReferenceDocCount * RUNTIME_REFERENCE_PER_DOC_CHARS;
  const fixedDocContentEstimate = fixedDocContentChars;
  const agentTraceExcluded = 0;
  const finalPromptEstimate = FINAL_PROMPT_ESTIMATE_CHARS;

  const usedChars = conversationMessages + attachedDocsMeta + runtimeReferences + fixedDocContentEstimate + finalPromptEstimate;
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
      fixedDocContentEstimate,
      agentTraceExcluded,
      finalPromptEstimate,
    },
  };
}
