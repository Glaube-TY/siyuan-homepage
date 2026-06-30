import type { AgentMessage, AgentToolMessage } from "./agent-message";
import { createSystemMessage } from "./agent-message";
import { normalizeToolCallMessages } from "./message-normalizer";
import { parseToolResultContentEnvelope } from "../tools/tool-execution-result";

export interface MessageCompactionOptions {
  maxMessages?: number;
  maxToolContentChars?: number;
  summaryChars?: number;
}

const DEFAULT_MAX_MESSAGES = 48;
const DEFAULT_MAX_TOOL_CONTENT_CHARS = 18000;
const DEFAULT_SUMMARY_CHARS = 4000;

/** Write tool names whose results should include status + target for historical context. */
const WRITE_TOOL_NAMES = new Set([
  "replace_doc_content", "update_block", "insert_block",
  "delete_blocks", "move_block", "create_doc", "rename_doc", "delete_doc",
  "edit_global_memory",
]);

/** Tool names with named content compaction strategies. */
const READ_DOCS = "read_docs";
const READ_DOC_BLOCKS = "read_doc_blocks";
const SEARCH_SCOPE = "search_scope";

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.max(0, maxChars - head - 80);
  return `${text.slice(0, head)}\n...[compact: middle omitted]...\n${text.slice(-tail)}`;
}

/**
 * Compact a read_docs result: keep docId, title, truncated flag.
 */
function compactReadDocsContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      const compacted: Record<string, unknown> = { ok: parsed.ok };
      if (parsed.data) {
        const items = Array.isArray(parsed.data.items) ? parsed.data.items : [parsed.data];
        compacted.data = {
          items: items.map((item: any) => ({
            docId: item.docId,
            title: item.title,
            contentChars: item.contentChars,
            truncated: item.truncated,
            ...(item.nextCursor ? { hasMore: true } : {}),
          })),
          note: "Content compacted. Call read_docs again for full content.",
        };
      }
      return JSON.stringify(compacted);
    }
  } catch { /* fall through */ }
  return truncateText(content, 800);
}

/**
 * Compact a read_doc_blocks result: keep block structure summary.
 */
function compactReadDocBlocksContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      const compacted: Record<string, unknown> = { ok: parsed.ok };
      if (parsed.data) {
        compacted.data = {
          blocks: Array.isArray(parsed.data.blocks) ? parsed.data.blocks.map((b: any) => ({
            id: b.id,
            type: b.type,
            content: b.content ? truncateText(b.content, 120) : undefined,
          })) : undefined,
          note: "Content compacted. Call read_doc_blocks again for full structure.",
        };
      }
      return JSON.stringify(compacted);
    }
  } catch { /* fall through */ }
  return truncateText(content, 800);
}

/**
 * Compact a search_scope result: keep top candidates only.
 */
function compactSearchScopeContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      const compacted: Record<string, unknown> = { ok: parsed.ok };
      if (parsed.data) {
        const candidates = Array.isArray(parsed.data.candidates) ? parsed.data.candidates : [];
        compacted.data = {
          candidates: candidates.slice(0, 5).map((c: any) => ({
            docId: c.docId, title: c.title, path: c.path, score: c.score,
          })),
          totalCount: candidates.length,
          note: candidates.length > 5 ? "Top 5 shown. Content compacted." : "Content compacted.",
        };
      }
      return JSON.stringify(compacted);
    }
  } catch { /* fall through */ }
  return truncateText(content, 800);
}

/**
 * Compact a write tool result: keep status, target, failure reason.
 */
function compactWriteToolContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify({
        ok: parsed.ok,
        code: parsed.code,
        message: parsed.message,
        status: parsed.status,
        deletedCount: parsed.deletedCount,
        requestedCount: parsed.requestedCount,
        reasonCode: parsed.reasonCode,
        note: "Write result compacted.",
      });
    }
  } catch { /* fall through */ }
  return truncateText(content, 500);
}

const STORAGE_COMPACT_SUMMARY_MARKER = "Agent session storage compacted by runtime.";

/**
 * Storage-safe compact a read_docs result.
 * Keeps only lightweight metadata; never keeps content, markdown, kramdown, blocks, or path.
 */
function storageCompactReadDocsContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      const compacted: Record<string, unknown> = { ok: parsed.ok };
      if (parsed.data) {
        const items = Array.isArray(parsed.data.items) ? parsed.data.items : [parsed.data];
        compacted.data = {
          items: items.map((item: any) => ({
            docId: item.docId,
            title: item.title,
            contentChars: item.contentChars,
            truncated: item.truncated,
            ...(item.nextCursor ? { hasMore: true } : {}),
          })),
          note: "Content compacted for storage. Call read_docs again for full content.",
        };
      }
      return JSON.stringify(compacted);
    }
  } catch { /* fall through */ }
  return JSON.stringify({ ok: false, note: "Tool result compacted for storage." });
}

/**
 * Storage-safe compact a read_doc_blocks result.
 * Keeps only block id/type/count; never keeps block content, markdown, or kramdown.
 */
function storageCompactReadDocBlocksContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      const compacted: Record<string, unknown> = { ok: parsed.ok };
      if (parsed.data) {
        const blocks = Array.isArray(parsed.data.blocks) ? parsed.data.blocks : [];
        compacted.data = {
          blockCount: blocks.length,
          blockRefs: blocks.slice(0, 20).map((b: any) => ({ id: b.id, type: b.type })),
          note: "Content compacted for storage. Call read_doc_blocks again for full structure.",
        };
      }
      return JSON.stringify(compacted);
    }
  } catch { /* fall through */ }
  return JSON.stringify({ ok: false, note: "Tool result compacted for storage." });
}

/**
 * Storage-safe compact a search_scope result.
 * Keeps only candidate docId/title/score and totalCount; never keeps path, snippet, or content.
 */
function storageCompactSearchScopeContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      const compacted: Record<string, unknown> = { ok: parsed.ok };
      if (parsed.data) {
        const candidates = Array.isArray(parsed.data.candidates) ? parsed.data.candidates : [];
        compacted.data = {
          candidates: candidates.map((c: any) => ({ docId: c.docId, title: c.title, score: c.score })),
          totalCount: candidates.length,
          note: "Content compacted for storage. Call search_scope again for full results.",
        };
      }
      return JSON.stringify(compacted);
    }
  } catch { /* fall through */ }
  return JSON.stringify({ ok: false, note: "Tool result compacted for storage." });
}

/**
 * Storage-safe compact a write tool result.
 * Keeps only status, counts, and reason; never keeps confirmationId, snapshots, toolInput, or markdown.
 */
function storageCompactWriteToolContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify({
        ok: parsed.ok,
        code: parsed.code,
        errorCode: parsed.errorCode,
        message: parsed.message,
        status: parsed.status,
        requestedCount: parsed.requestedCount,
        affectedCount: parsed.affectedCount,
        deletedCount: parsed.deletedCount,
        reasonCode: parsed.reasonCode,
        note: "Write result compacted for storage.",
      });
    }
  } catch { /* fall through */ }
  return JSON.stringify({ ok: false, note: "Write result compacted for storage." });
}

const SENSITIVE_STRING_KEYS = ["api_key", "apikey", "secret", "token", "password", "authorization"];

function sanitizeToolResultString(value: string, maxChars: number): string {
  let sanitized = value.trim();

  // Redact absolute/internal paths
  sanitized = sanitized.replace(/\b[a-zA-Z]:[\\/](?:[^\\/\s]+[\\/])*[^\\/\s]*\b/g, "[path]");
  // Unix-like absolute paths: only match after start/whitespace/punctuation to avoid URLs like https://example.com/path
  sanitized = sanitized.replace(/(^|[\s(\[\{"'=,;:])(\/[^/\s]+(?:\/[^/\s]+)*\/?)/g, "$1[path]");

  // Redact Authorization: Bearer <token> before generic key=value patterns
  sanitized = sanitized.replace(/\b(Authorization)\s*:\s*(Bearer\s+[^\s,]+)/gi, "$1: [redacted]");

  // Redact sensitive key=value patterns
  const pattern = new RegExp(`\\b(${SENSITIVE_STRING_KEYS.join("|")})\\s*[:=]\\s*[^\\s&,"]+`, "gi");
  sanitized = sanitized.replace(pattern, "$1=[redacted]");

  if (sanitized.length > maxChars) {
    sanitized = `${sanitized.slice(0, maxChars - 3)}...`;
  }
  return sanitized;
}

/**
 * Storage-safe compact for unknown tool results.
 * JSON results keep only lightweight status fields; non-JSON results are replaced
 * with a safe placeholder, never storing raw preview.
 */
function storageCompactUnknownToolContent(content: string): string {
  const parsed = parseToolResultContentEnvelope(content);
  if (parsed) {
    return JSON.stringify({
      ok: parsed.ok === true,
      code: parsed.code,
      errorCode: parsed.errorCode,
      status: parsed.status,
      message: sanitizeToolResultString(String(parsed.message ?? ""), 200),
      summary: sanitizeToolResultString(String(parsed.summary ?? ""), 200),
      note: "Tool result compacted for storage.",
    });
  }
  return JSON.stringify({ ok: false, note: "Tool result compacted for storage." });
}

/**
 * Storage-safe compaction applied to every tool message before persistence.
 * Always runs regardless of content length.
 */
function storageCompactToolMessage(message: AgentToolMessage): AgentToolMessage {
  if (message.name === READ_DOCS) {
    return { ...message, content: storageCompactReadDocsContent(message.content) };
  }
  if (message.name === READ_DOC_BLOCKS) {
    return { ...message, content: storageCompactReadDocBlocksContent(message.content) };
  }
  if (message.name === SEARCH_SCOPE) {
    return { ...message, content: storageCompactSearchScopeContent(message.content) };
  }
  if (WRITE_TOOL_NAMES.has(message.name)) {
    return { ...message, content: storageCompactWriteToolContent(message.content) };
  }
  return { ...message, content: storageCompactUnknownToolContent(message.content) };
}

function compactToolMessage(message: AgentToolMessage, maxChars: number): AgentToolMessage {
  if (message.content.length <= maxChars) return message;

  // Per-tool-type compaction
  if (message.name === READ_DOCS) {
    return { ...message, content: compactReadDocsContent(message.content) };
  }
  if (message.name === READ_DOC_BLOCKS) {
    return { ...message, content: compactReadDocBlocksContent(message.content) };
  }
  if (message.name === SEARCH_SCOPE) {
    return { ...message, content: compactSearchScopeContent(message.content) };
  }
  if (WRITE_TOOL_NAMES.has(message.name)) {
    return { ...message, content: compactWriteToolContent(message.content) };
  }

  return { ...message, content: truncateText(message.content, maxChars) };
}

function summarizeOlderMessages(messages: readonly AgentMessage[], maxChars: number): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const contentPreview = message.content.length > 120
        ? `${message.content.slice(0, 120)}...`
        : message.content;
      lines.push(`tool ${message.name}: ${contentPreview.replace(/\s+/g, " ")}`);
    } else if (message.role === "assistant") {
      const tools = message.toolCalls?.map((call) => call.name).join(", ");
      const contentPreview = message.content.length > 120
        ? `${message.content.slice(0, 120)}...`
        : message.content;
      lines.push(`assistant: ${contentPreview.replace(/\s+/g, " ")}${tools ? ` [tool_calls: ${tools}]` : ""}`);
    } else if (message.role === "user") {
      const contentPreview = message.content.length > 120
        ? `${message.content.slice(0, 120)}...`
        : message.content;
      lines.push(`user: ${contentPreview.replace(/\s+/g, " ")}`);
    }
    if (lines.join("\n").length > maxChars) break;
  }
  return truncateText(lines.join("\n"), maxChars);
}

/**
 * Storage-safe summary for older messages.
 * Contains user/assistant text previews and tool success/failure status only.
 * Never includes tool content previews.
 */
function summarizeOlderMessagesForStorage(messages: readonly AgentMessage[], maxChars: number): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      let ok = false;
      try {
        const parsed = JSON.parse(message.content);
        if (typeof parsed === "object" && parsed !== null) {
          ok = parsed.ok === true;
        }
      } catch { /* ignore malformed JSON */ }
      lines.push(`tool ${message.name}: ${ok ? "成功" : "失败"}`);
    } else if (message.role === "assistant") {
      const tools = message.toolCalls?.map((call) => call.name).join(", ");
      const contentPreview = message.content.length > 120
        ? `${message.content.slice(0, 120)}...`
        : message.content;
      lines.push(`assistant: ${contentPreview.replace(/\s+/g, " ")}${tools ? ` [tool_calls: ${tools}]` : ""}`);
    } else if (message.role === "user") {
      const contentPreview = message.content.length > 120
        ? `${message.content.slice(0, 120)}...`
        : message.content;
      lines.push(`user: ${contentPreview.replace(/\s+/g, " ")}`);
    }
    if (lines.join("\n").length > maxChars) break;
  }
  return truncateText(lines.join("\n"), maxChars);
}

/**
 * Compact agent messages to fit within limits, preserving tool-call/tool-result pairing.
 *
 * Rules:
 * - Keep recent messages (last ~8 non-system messages)
 * - Compress older messages into a summary system message
 * - Per-tool-type compaction for read_docs/read_doc_blocks/search_scope/write tools
 * - Ensure no orphan role=tool messages survive (via normalizeToolCallMessages)
 */
export function compactAgentMessages(
  messages: readonly AgentMessage[],
  options: MessageCompactionOptions = {},
): AgentMessage[] {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxToolContentChars = options.maxToolContentChars ?? DEFAULT_MAX_TOOL_CONTENT_CHARS;
  const summaryChars = options.summaryChars ?? DEFAULT_SUMMARY_CHARS;

  const withCompactTools = messages.map((message) =>
    message.role === "tool" ? compactToolMessage(message, maxToolContentChars) : message,
  );

  if (withCompactTools.length <= maxMessages) {
    return normalizeToolCallMessages(withCompactTools);
  }

  const leadingSystem = withCompactTools.filter((message) => message.role === "system");
  const nonSystem = withCompactTools.filter((message) => message.role !== "system");
  const keepCount = Math.max(8, maxMessages - leadingSystem.length - 1);
  const older = nonSystem.slice(0, Math.max(0, nonSystem.length - keepCount));
  const recent = nonSystem.slice(-keepCount);
  const summary = summarizeOlderMessages(older, summaryChars);

  const compacted = [
    ...leadingSystem,
    createSystemMessage(`Earlier conversation compacted by the runtime. Preserve facts and tool outcomes from this summary only when relevant. If you need full content, call the appropriate read tool again.\n${summary}`),
    ...recent,
  ];

  return normalizeToolCallMessages(compacted);
}

/**
 * Storage-level compaction for persisted AgentSession messages.
 *
 * - Always applies storage-safe tool compaction (regardless of content length).
 * - Drops old storage compact summaries to avoid accumulation.
 * - Uses a storage-safe summary without tool content previews.
 * - Preserves valid assistant tool_calls / role=tool pairing.
 */
export function compactAgentSessionMessagesForStorage(
  messages: readonly AgentMessage[],
): AgentMessage[] {
  const maxMessages = 48;
  const summaryChars = 3000;

  const withStorageSafeTools = messages.map((message) =>
    message.role === "tool" ? storageCompactToolMessage(message) : message,
  );

  if (withStorageSafeTools.length <= maxMessages) {
    return normalizeToolCallMessages(withStorageSafeTools);
  }

  const leadingSystem: AgentMessage[] = [];
  const nonSystem: AgentMessage[] = [];
  for (const message of withStorageSafeTools) {
    if (message.role === "system" && message.content.startsWith(STORAGE_COMPACT_SUMMARY_MARKER)) {
      continue;
    }
    if (message.role === "system") {
      leadingSystem.push(message);
    } else {
      nonSystem.push(message);
    }
  }

  const keepCount = Math.max(8, maxMessages - leadingSystem.length - 1);
  const older = nonSystem.slice(0, Math.max(0, nonSystem.length - keepCount));
  const recent = nonSystem.slice(-keepCount);
  const summary = summarizeOlderMessagesForStorage(older, summaryChars);

  const compacted = [
    ...leadingSystem,
    createSystemMessage(
      `${STORAGE_COMPACT_SUMMARY_MARKER} Preserve facts and tool outcomes from this summary only when relevant. If you need full content, call the appropriate read tool again.\n${summary}`,
    ),
    ...recent,
  ];

  return normalizeToolCallMessages(compacted);
}
