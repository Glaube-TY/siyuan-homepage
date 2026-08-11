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

interface ResolvedToolOperation {
  action: string;
  innerAction?: string;
  args: Record<string, unknown>;
}

function collectToolCallArgs(messages: readonly AgentMessage[]): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      try {
        const parsed = JSON.parse(call.arguments);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          result.set(call.id, parsed as Record<string, unknown>);
        }
      } catch { /* 参数损坏时按未知、高敏结果压缩。 */ }
    }
  }
  return result;
}

function resolveToolOperation(rawArgs?: Record<string, unknown>): ResolvedToolOperation {
  const outer = rawArgs ?? {};
  const nested = outer.args && typeof outer.args === "object" && !Array.isArray(outer.args)
    ? outer.args as Record<string, unknown>
    : outer;
  const action = typeof outer.action === "string" ? outer.action : "unknown";
  const innerAction = nested !== outer && typeof nested.action === "string" ? nested.action : undefined;
  return { action, innerAction, args: nested };
}

function digestSafeText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  let hash = 0x811c9dc5;
  for (const char of value.trim()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function unwrapToolPayload(parsed: Record<string, any>): Record<string, any> {
  const data = asRecord(parsed.data);
  return asRecord(data.result ?? data.content ?? parsed.result ?? data ?? parsed);
}

function safeStrings(value: unknown, max = 5): string[] {
  const items = Array.isArray(value) ? value : (typeof value === "string" ? [value] : []);
  return [...new Set(items.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
    .slice(0, max)
    .map((item) => sanitizeToolResultString(item, 120));
}

function actionAwareStorageContent(
  message: AgentToolMessage,
  rawArgs?: Record<string, unknown>,
): string {
  const operation = resolveToolOperation(rawArgs);
  let parsed: Record<string, any> = {};
  try { parsed = asRecord(JSON.parse(message.content)); } catch { /* safe fallback below */ }
  const payload = unwrapToolPayload(parsed);
  const ok = parsed.ok === true || payload.ok === true || payload.status === "success";
  const base = {
    ok,
    action: operation.action,
    ...(operation.innerAction ? { innerAction: operation.innerAction } : {}),
  };

  if ((message.name === "siyuan_kb" && operation.action === "search") || message.name === SEARCH_SCOPE) {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    return JSON.stringify({
      ...base,
      queryDigest: digestSafeText(operation.args.query),
      candidateCount: payload.returnedCandidateCount ?? payload.totalCount ?? candidates.length,
      docIds: safeStrings(candidates.map((item: any) => item?.docId)),
      blockIds: safeStrings(candidates.map((item: any) => item?.blockId)),
      titles: safeStrings(candidates.map((item: any) => item?.title)),
      needsContentRead: true,
      note: "Search candidates compacted; candidates are not grounded content.",
    });
  }

  if ((message.name === "siyuan_kb" && operation.action === "read_docs") || message.name === READ_DOCS) {
    const items = Array.isArray(payload.items) ? payload.items : [payload];
    return JSON.stringify({
      ...base,
      items: items.slice(0, 5).map((item: any) => ({
        docId: item?.docId,
        blockId: item?.blockId,
        title: sanitizeToolResultString(String(item?.title ?? ""), 120) || undefined,
        chunkIndex: item?.chunkIndex ?? operation.args.chunkIndex,
        chunkCount: item?.chunkCount,
        contentChars: item?.contentChars,
        hasNextChunk: item?.hasNextChunk ?? Boolean(item?.nextCursor),
        truncated: item?.truncated === true,
      })),
      note: "Document content removed from persisted session.",
    });
  }

  if (message.name === "siyuan_kb" && operation.action === "read_evidence") {
    const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.evidence) ? payload.evidence : []);
    return JSON.stringify({
      ...base,
      items: items.slice(0, 5).map((item: any) => ({
        blockId: item?.blockId,
        docId: item?.docId,
        title: sanitizeToolResultString(String(item?.docTitle ?? item?.title ?? ""), 120) || undefined,
        evidenceChars: item?.evidenceChars ?? item?.contentChars,
        truncated: item?.truncated === true,
        headingPathSummary: sanitizeToolResultString(
          Array.isArray(item?.headingPath) ? item.headingPath.join(" > ") : String(item?.headingPath ?? ""),
          160,
        ) || undefined,
      })),
      note: "Evidence text removed from persisted session.",
    });
  }

  if (message.name === READ_DOC_BLOCKS
    || (message.name === "siyuan_doc_edit" && ["read_blocks", "block_read"].includes(operation.action))) {
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : (Array.isArray(payload.items) ? payload.items : []);
    return JSON.stringify({
      ...base,
      blockCount: blocks.length,
      blocks: blocks.slice(0, 20).map((item: any) => ({ id: item?.id ?? item?.blockId, type: item?.type, docId: item?.docId })),
      note: "Block content removed from persisted session.",
    });
  }

  const readOnlyAggregateActions = new Set([
    "overview", "query_tasks", "query_records", "find_docs", "list", "read", "find_rows",
    "extra_read", "read_blocks", "block_read", "doc_path", "read_page", "http_get",
  ]);
  const isWrite = WRITE_TOOL_NAMES.has(message.name)
    || (["siyuan_doc_edit", "diary_task", "siyuan_database", "siyuan_tree", "siyuan_meta", "siyuan_asset", "siyuan_riff"].includes(message.name)
      && !readOnlyAggregateActions.has(operation.action));
  if (isWrite) {
    const target = asRecord(payload.target);
    return JSON.stringify({
      ...base,
      status: payload.status ?? (ok ? "success" : "failed"),
      requestedCount: payload.requestedCount,
      affectedCount: payload.affectedCount ?? payload.deletedCount,
      targetDocIds: safeStrings(payload.targetDocIds ?? target.docId ?? operation.args.docIds ?? operation.args.docId),
      targetBlockIds: safeStrings(payload.targetBlockIds ?? target.blockId ?? operation.args.blockIds ?? operation.args.blockId),
      targetTitles: safeStrings(payload.targetTitles ?? target.title ?? operation.args.title),
      reasonCode: sanitizeToolResultString(String(payload.reasonCode ?? parsed.errorCode ?? parsed.code ?? ""), 80) || undefined,
      verificationStatus: payload.verificationStatus ?? asRecord(payload.verification).status,
      note: "Write result compacted for storage.",
    });
  }

  if (readOnlyAggregateActions.has(operation.action)) {
    const items = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.tasks)
        ? payload.tasks
        : Array.isArray(payload.records)
          ? payload.records
          : [];
    return JSON.stringify({
      ...base,
      itemCount: items.length,
      docIds: safeStrings(items.map((item: any) => item?.docId ?? item?.sourceDocId ?? item?.rootId)),
      blockIds: safeStrings(items.map((item: any) => item?.blockId ?? item?.headingBlockId)),
      titles: safeStrings(items.map((item: any) => item?.title ?? item?.taskname ?? item?.docTitle)),
      note: "Read result compacted for storage.",
    });
  }

  return storageCompactUnknownToolContent(message.content);
}

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
function storageCompactToolMessage(
  message: AgentToolMessage,
  rawArgs?: Record<string, unknown>,
): AgentToolMessage {
  return { ...message, content: actionAwareStorageContent(message, rawArgs) };
}

function compactToolMessage(
  message: AgentToolMessage,
  maxChars: number,
  rawArgs?: Record<string, unknown>,
): AgentToolMessage {
  if (message.content.length <= maxChars) return message;

  const operation = resolveToolOperation(rawArgs);
  if (message.name === "siyuan_kb") {
    if (operation.action === "search") return { ...message, content: compactSearchScopeContent(message.content) };
    if (operation.action === "read_docs" || operation.action === "read_evidence") {
      return { ...message, content: actionAwareStorageContent(message, rawArgs) };
    }
  }

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

  const argsByToolCallId = collectToolCallArgs(messages);
  const withCompactTools = messages.map((message) =>
    message.role === "tool"
      ? compactToolMessage(message, maxToolContentChars, argsByToolCallId.get(message.toolCallId))
      : message,
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

  const argsByToolCallId = collectToolCallArgs(messages);
  const withStorageSafeTools = messages.map((message) =>
    message.role === "tool"
      ? storageCompactToolMessage(message, argsByToolCallId.get(message.toolCallId))
      : message,
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
