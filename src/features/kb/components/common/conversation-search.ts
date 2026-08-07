/**
 * 历史会话搜索（纯前端、纯内存、只读）
 *
 * 搜索范围：
 * - 会话标题；
 * - 会话中 role 为 user 的消息内容。
 *
 * 明确不搜索：
 * - AI 助手回答（assistant）；
 * - reasoning 内容；
 * - 工具执行日志；
 * - 引用来源；
 * - 阶段摘要 / 压缩摘要；
 * - 错误消息（role=error）；
 * - 加载中消息（role=loading）；
 * - 附加文档元数据。
 *
 * 约束：
 * - 不修改原 conversations 数组；
 * - 不调用任何异步存储接口；
 * - 不读取磁盘会话文件；
 * - 不使用未经转义的动态正则，全部采用字符串查找。
 */

import type { ChatMessage, KbConversationSession } from "../../types/chat";

/** 命中来源 */
export type ConversationMatchSource = "title" | "user_message";

/** 单条搜索结果 */
export interface ConversationSearchResult {
  /** 命中的会话（引用原对象，不复制） */
  conversation: KbConversationSession;
  /** 命中来源：标题或用户消息 */
  matchSource: ConversationMatchSource;
  /** 用户消息命中时的摘要（标题命中时不存在） */
  matchSnippet?: string;
  /** 第一条命中的用户消息 id（标题命中时不存在） */
  matchedUserMessageId?: string;
}

/** 高亮分段 */
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/** 摘要最大字符数（约 70 个中文字符） */
export const MAX_SNIPPET_CHARS = 70;

/**
 * 归一化搜索文本：
 * - 先 trim；
 * - 将连续空白字符（含换行、全角空格）压缩为单个空格。
 */
export function normalizeSearchText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/**
 * 纯文本大小写不敏感查找。
 * 返回第一个命中位置（基于原始大小写文本），未命中返回 -1。
 */
function indexOfNormalized(text: string, needle: string): number {
  if (!needle) return 0;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const idx = lowerText.indexOf(lowerNeedle);
  if (idx < 0) return -1;
  // toLowerCase 可能改变码元数量（极少数 Unicode 字符），此时回退大小写敏感查找
  if (idx + needle.length <= text.length) return idx;
  return text.indexOf(needle);
}

/** 判断文本是否包含搜索词（大小写不敏感、空白已归一化） */
function textContains(text: string, needle: string): boolean {
  return indexOfNormalized(text, needle) >= 0;
}

/** 从会话消息中找第一条命中的用户消息 */
function findFirstMatchingUserMessage(
  messages: readonly ChatMessage[],
  needle: string,
): { message: Extract<ChatMessage, { role: "user" }>; content: string; index: number } | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const content = message.content ?? "";
    if (!content) continue;
    const index = indexOfNormalized(normalizeSearchText(content), needle);
    if (index >= 0) {
      return { message, content, index };
    }
  }
  return null;
}

/**
 * 生成用户消息命中摘要：
 * - 换行和连续空格压缩成单个空格；
 * - 最长约 MAX_SNIPPET_CHARS 个字符；
 * - 命中位置尽量位于摘要中间；
 * - 前后被截断时显示省略号。
 */
function buildMatchSnippet(content: string, needle: string, index: number): string {
  const text = normalizeSearchText(content);
  const textLength = text.length;
  if (textLength <= MAX_SNIPPET_CHARS) return text;

  const hitLength = Math.max(1, needle.length);
  const hitCenter = index + hitLength / 2;

  let start = Math.max(0, Math.round(hitCenter - MAX_SNIPPET_CHARS / 2));
  let end = Math.min(textLength, start + MAX_SNIPPET_CHARS);
  if (end - start < MAX_SNIPPET_CHARS) {
    start = Math.max(0, end - MAX_SNIPPET_CHARS);
  }
  // 兜底：确保命中词完整可见
  if (start > index) {
    start = Math.max(0, index);
    end = Math.min(textLength, start + MAX_SNIPPET_CHARS);
  }
  if (end < index + hitLength && end < textLength) {
    end = Math.min(textLength, index + hitLength);
    start = Math.max(0, end - MAX_SNIPPET_CHARS);
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < textLength ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

/**
 * 搜索历史会话（纯内存、只读）。
 *
 * - 空搜索词返回全部会话（保持原顺序，不复制会话对象）；
 * - 标题命中优先，其次用户消息命中；
 * - 同一会话无论命中多少次只出现一次；
 * - 结果顺序与原 conversations 数组顺序一致；
 * - 不修改原 conversations 数组。
 */
export function searchConversations(
  conversations: readonly KbConversationSession[],
  rawQuery: string,
): ConversationSearchResult[] {
  const query = normalizeSearchText(rawQuery ?? "");
  const results: ConversationSearchResult[] = [];

  if (!query) {
    for (const conversation of conversations) {
      results.push({ conversation, matchSource: "title" });
    }
    return results;
  }

  for (const conversation of conversations) {
    // 1. 标题命中
    if (textContains(normalizeSearchText(conversation.title ?? ""), query)) {
      results.push({ conversation, matchSource: "title" });
      continue;
    }
    // 2. 用户消息命中（找到第一条即停止扫描该会话）
    const hit = findFirstMatchingUserMessage(conversation.messages ?? [], query);
    if (hit) {
      results.push({
        conversation,
        matchSource: "user_message",
        matchSnippet: buildMatchSnippet(hit.content, query, hit.index),
        matchedUserMessageId: hit.message.id,
      });
    }
  }

  return results;
}

/**
 * 将文本安全拆分为普通片段和命中片段，供 Svelte 模板逐段渲染。
 *
 * 安全说明：
 * - 只做纯字符串切片，不产生任何 HTML；
 * - 调用方必须以文本节点渲染各片段，禁止 {@html} 或字符串拼接 HTML；
 * - 不使用正则（含转义正则），大小写不敏感通过 toLowerCase 实现。
 */
export function splitHighlightSegments(text: string, query: string): HighlightSegment[] {
  const normalized = normalizeSearchText(text ?? "");
  const needle = normalizeSearchText(query ?? "");
  if (!normalized || !needle) {
    return normalized ? [{ text: normalized, highlighted: false }] : [];
  }

  const lowerText = normalized.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const hitIndex = lowerText.indexOf(lowerNeedle, cursor);
    if (hitIndex < 0) {
      segments.push({ text: normalized.slice(cursor), highlighted: false });
      break;
    }
    if (hitIndex > cursor) {
      segments.push({ text: normalized.slice(cursor, hitIndex), highlighted: false });
    }
    segments.push({ text: normalized.slice(hitIndex, hitIndex + needle.length), highlighted: true });
    cursor = hitIndex + needle.length;
  }

  return segments;
}
