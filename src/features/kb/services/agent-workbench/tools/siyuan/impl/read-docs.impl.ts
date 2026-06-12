/**
 * read_docs adapter.
 *
 * The adapter only reads resources explicitly passed by the Agent as
 * docIds, blockIds, or a per-document nextCursor. It does not accept old
 * sourceType/doc reference objects, search for replacements, or continue
 * reading automatically.
 *
 * Chunking model (new):
 * - Internal: fetch full Markdown for each doc (no truncation).
 * - External: return only the requested chunk by chunkIndex.
 * - Metadata includes fullContentChars, chunkCount, hasNextChunk, etc.
 * - nextCursor is kept for backward compatibility; Agent should prefer chunkIndex.
 */

import { readSiyuanDocForTool } from "../internal/readers/read-doc-full";
import type { SiyuanDocLite } from "../internal/doc-types";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import { sanitizeTitle, sanitizeContent } from "./safe-text";
import type {
  ReadDocsItem,
  ReadDocsError,
  ReadDocsInput,
  ReadDocsOutput,
  ReadDocsChunkMeta,
} from "../contracts/read-docs.contract";
import { sqlSelectReadonly } from "../../../../siyuan/read-only-kernel";

const DEFAULT_CHUNK_CHARS = 12000;
const SIYUAN_ID_RE = /^\d{14}-[a-z0-9]{7}$/i;
const READ_NOTE = "这些是已读取正文，可用于总结、分析、比较。支持分块返回，chunkIndex 从 1 开始。";

interface ResourceMeta {
  id: string;
  title: string;
  type: string;
  box: string;
  path: string;
  rootId: string;
  childDocCount: number;
}

interface ResolvedDocForRead extends SiyuanDocLite {
  inputId: string;
  inputKind: "doc" | "block";
}

function clampChunkChars(value: number | undefined, defaultValue: number): number {
  const raw = value ?? defaultValue;
  return Math.max(2000, Math.min(Math.floor(raw), 30000));
}

function makeCursor(docId: string, nextOffset: number): string {
  return `rdc:${encodeURIComponent(docId)}:${nextOffset}`;
}

function parseCursor(cursor: string | undefined): { docId: string; startOffset: number } | null {
  if (!cursor) return null;
  const match = /^rdc:([^:]+):(\d+)$/.exec(cursor);
  if (!match) return null;
  const startOffset = Number.parseInt(match[2], 10);
  if (!Number.isFinite(startOffset) || startOffset < 0) return null;
  try {
    return { docId: decodeURIComponent(match[1]), startOffset };
  } catch {
    return null;
  }
}

function isValidSiyuanId(id: string): boolean {
  return SIYUAN_ID_RE.test(id);
}

export async function batchQueryResourceMeta(ids: string[]): Promise<Map<string, ResourceMeta>> {
  const result = new Map<string, ResourceMeta>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  const idList = uniqueIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  const rows = await sqlSelectReadonly<{
    id: string;
    content: string;
    type: string;
    box: string;
    path: string;
    root_id: string;
  }>(
    `SELECT id, content, type, box, path, root_id FROM blocks WHERE id IN (${idList})`,
    { maxLimit: Math.max(uniqueIds.length, 50), allowedTables: ["blocks"] },
  );

  const metas: ResourceMeta[] = [];
  for (const row of rows ?? []) {
    if (!row.id) continue;
    metas.push({
      id: row.id,
      title: row.content || "",
      type: row.type || "",
      box: row.box || "",
      path: row.path || "",
      rootId: row.root_id || "",
      childDocCount: 0,
    });
  }

  for (const meta of metas) {
    if (meta.type === "d" && meta.path) {
      meta.childDocCount = await queryChildDocCount(meta);
    }
    result.set(meta.id, meta);
  }
  return result;
}

async function queryChildDocCount(meta: ResourceMeta): Promise<number> {
  const escapedPath = meta.path.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const rows = await sqlSelectReadonly<{ id: string }>(
    `SELECT id FROM blocks WHERE box = '${meta.box.replace(/'/g, "''")}' AND type = 'd' AND path LIKE '${escapedPath}/%' ESCAPE '\\' LIMIT 2`,
    { maxLimit: 2, allowedTables: ["blocks"] },
  );
  return rows.length;
}

function collectAndValidateIds(
  args: ReadDocsInput,
): {
  validIds: Array<{ id: string; kind: "doc" | "block" }>;
  errors: ReadDocsError[];
} {
  const errors: ReadDocsError[] = [];
  const validIds: Array<{ id: string; kind: "doc" | "block" }> = [];
  const seenIds = new Set<string>();

  const addId = (id: string, kind: "doc" | "block"): void => {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    if (!isValidSiyuanId(id)) {
      errors.push({
        ...(kind === "doc" ? { docId: id } : { blockId: id }),
        code: "invalid_resource_id",
        message: "该 ID 不符合思源资源 ID 基本形态。",
        hint: "请使用工具返回的真实 docId/blockId，格式应为 14 位时间戳-7 位字母数字。",
      });
      return;
    }
    validIds.push({ id, kind });
  };

  for (const docId of args.docIds ?? []) addId(docId, "doc");
  for (const blockId of args.blockIds ?? []) addId(blockId, "block");
  return { validIds, errors };
}

function makeEmptyOutput(errors: ReadDocsError[] | undefined): ReadDocsOutput {
  return {
    items: [],
    errors: errors && errors.length > 0 ? errors : undefined,
    note: READ_NOTE,
  };
}

// ── Chunk utilities ──

function splitIntoChunks(text: string, chunkSize: number): { chunks: string[]; metas: ReadDocsChunkMeta[] } {
  const chunks: string[] = [];
  const metas: ReadDocsChunkMeta[] = [];
  let start = 0;
  let index = 1;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const searchStart = Math.max(start, Math.floor(end - chunkSize * 0.2));
      const searchWindow = text.slice(searchStart, end);
      const lastBreak = Math.max(searchWindow.lastIndexOf("\n\n"), searchWindow.lastIndexOf("\n"));
      if (lastBreak > 0) {
        end = searchStart + lastBreak;
      }
    }
    const chunkText = text.slice(start, end);
    chunks.push(chunkText);
    metas.push({ index, start, end, charCount: chunkText.length });
    start = end;
    index++;
  }

  return { chunks, metas };
}

function splitIntoExactChunkCount(text: string, chunkCount: number): { chunks: string[]; metas: ReadDocsChunkMeta[] } {
  const chunks: string[] = [];
  const metas: ReadDocsChunkMeta[] = [];
  const total = text.length;
  let start = 0;

  for (let i = 0; i < chunkCount; i++) {
    const isLast = i === chunkCount - 1;
    const idealEnd = isLast ? total : Math.round(((i + 1) / chunkCount) * total);
    let end = idealEnd;

    if (!isLast && end < total) {
      const chunkSize = idealEnd - start;
      const searchRadius = Math.max(1, Math.floor(chunkSize * 0.2));
      const searchStart = Math.max(start, end - searchRadius);
      const searchEnd = Math.min(total, end + searchRadius);
      const window = text.slice(searchStart, searchEnd);
      let bestBreak = -1;
      let bestDist = Infinity;
      for (let pos = 0; pos < window.length; pos++) {
        if (window[pos] === "\n") {
          const absPos = searchStart + pos;
          const dist = Math.abs(absPos - idealEnd);
          if (dist < bestDist) {
            bestDist = dist;
            bestBreak = absPos;
          }
        }
      }
      if (bestBreak >= 0) {
        end = bestBreak;
      }
    }

    const chunkText = text.slice(start, end);
    chunks.push(chunkText);
    metas.push({ index: i + 1, start, end, charCount: chunkText.length });
    start = end;
  }

  return { chunks, metas };
}

function findChunkIndexForOffset(metas: ReadDocsChunkMeta[], offset: number): number {
  for (const meta of metas) {
    if (offset >= meta.start && offset < meta.end) return meta.index;
  }
  return metas.length > 0 ? metas[metas.length - 1].index : 1;
}

// ── Main execution ──

export async function executeReadDocs(
  deps: KbRetrievalToolDeps,
  args: ReadDocsInput,
): Promise<{ safeOutput: ReadDocsOutput }> {
  const cursorTarget = args.cursor ? parseCursor(args.cursor) : null;
  if (args.cursor && !cursorTarget) {
    return {
      safeOutput: makeEmptyOutput([
        {
          cursor: args.cursor,
          code: "invalid_cursor",
          message: "cursor 格式不正确。",
          hint: "请使用上次返回的 nextCursor 值。",
        },
      ]),
    };
  }

  const { validIds, errors: formatErrors } = collectAndValidateIds(args);
  if (cursorTarget) validIds.push({ id: cursorTarget.docId, kind: "doc" });

  const allIds = validIds.map((v) => v.id);
  const metaMap = await batchQueryResourceMeta(allIds);
  const resolvedDocs: ResolvedDocForRead[] = [];
  const existenceErrors: ReadDocsError[] = [];

  for (const { id, kind } of validIds) {
    const meta = metaMap.get(id);
    if (!meta) {
      existenceErrors.push({
        ...(kind === "doc" ? { docId: id } : { blockId: id }),
        code: "resource_not_found",
        message: kind === "doc" ? "该 docId 对应的文档不存在。" : "该 blockId 对应的块不存在。",
        hint: "请确认 ID 来自结构或搜索工具返回，并且资源尚未被删除。",
      });
      continue;
    }

    resolvedDocs.push({
      inputId: id,
      inputKind: kind,
      docId: meta.type === "d" ? meta.id : (meta.rootId || meta.id),
      title: meta.title || (kind === "doc" ? "未命名文档" : "未命名块"),
      box: meta.box,
      path: meta.path,
    });
  }

  if (resolvedDocs.length === 0) {
    return { safeOutput: makeEmptyOutput([...formatErrors, ...existenceErrors]) };
  }

  // Resolve chunk params
  const settingsDefault = deps.getSettings?.()?.agentReadMaxCharsPerDoc;
  const defaultChunkChars = clampChunkChars(
    typeof settingsDefault === "number" ? settingsDefault : undefined,
    DEFAULT_CHUNK_CHARS,
  );
  const globalChunkIndex = Math.max(1, Math.floor(args.chunkIndex ?? 1));

  let globalChunkSize: number;
  let globalEffectiveChunkCount: number | undefined;
  if (args.chunkCount != null && args.chunkCount > 0) {
    globalEffectiveChunkCount = args.chunkCount;
  } else {
    globalChunkSize = clampChunkChars(args.chunkChars ?? args.maxChars, defaultChunkChars);
  }

  const items: ReadDocsItem[] = [];
  const readErrors: ReadDocsError[] = [];
  const seenReadWindows = new Set<string>();

  for (const candidate of resolvedDocs) {
    const readWindowKey = `${candidate.docId}:full`;
    if (seenReadWindows.has(readWindowKey)) continue;
    seenReadWindows.add(readWindowKey);

    // Read full content (no truncation)
    const doc = await readSiyuanDocForTool({ doc: candidate, maxChars: undefined, startOffset: 0 });
    if (!doc) {
      readErrors.push({
        docId: candidate.docId,
        code: "resource_not_found",
        message: "未能读取该文档内容，资源可能不存在或暂时不可访问。",
        hint: "请确认 docId 是否正确，或重新通过结构/搜索工具定位。",
      });
      continue;
    }

    if ((doc as { contentEmpty?: boolean }).contentEmpty) {
      const meta = metaMap.get(candidate.docId) ?? metaMap.get(candidate.inputId);
      if ((meta?.childDocCount ?? 0) > 0) {
        readErrors.push({
          docId: candidate.docId,
          code: "container_without_content",
          message: "该 ID 指向目录节点/容器文档，正文为空，但有子文档。",
          hint: "可使用 list_knowledge_map 查看其子节点后选择具体子文档 ID 读取。",
        });
      } else {
        readErrors.push({
          docId: candidate.docId,
          code: "empty_content",
          message: "该文档存在，但正文为空。",
          hint: "可查看其子文档或改读其他文档 ID。",
        });
      }
      continue;
    }

    const fullContent = doc.content;
    const fullChars = fullContent.length;

    // Determine per-doc chunk params
    let chunkSize: number;
    let effectiveChunkCount: number | undefined;
    if (globalEffectiveChunkCount != null) {
      effectiveChunkCount = globalEffectiveChunkCount;
    } else {
      chunkSize = globalChunkSize!;
    }

    let chunks: string[];
    let metas: ReadDocsChunkMeta[];
    if (effectiveChunkCount != null) {
      const safeCount = Math.min(effectiveChunkCount, Math.max(1, fullChars));
      ({ chunks, metas } = splitIntoExactChunkCount(fullContent, safeCount));
    } else {
      ({ chunks, metas } = splitIntoChunks(fullContent, chunkSize));
    }
    const totalChunks = chunks.length;

    // Determine chunkIndex for this doc
    let docChunkIndex = globalChunkIndex;
    if (cursorTarget && candidate.docId === cursorTarget.docId && !args.chunkIndex) {
      // Backward compat: if cursor points to this doc and no explicit chunkIndex,
      // infer chunkIndex from cursor startOffset
      docChunkIndex = findChunkIndexForOffset(metas, cursorTarget.startOffset);
    }

    if (docChunkIndex > totalChunks) {
      readErrors.push({
        docId: candidate.docId,
        code: "chunk_index_out_of_range",
        message: `chunkIndex ${docChunkIndex} 超出范围，当前文档共 ${totalChunks} 块。`,
        hint: `请使用 1-${totalChunks} 之间的 chunkIndex。`,
      });
      continue;
    }

    const currentChunkText = chunks[docChunkIndex - 1];
    const currentMeta = metas[docChunkIndex - 1];

    const item: ReadDocsItem = {
      docId: doc.docId,
      title: sanitizeTitle(doc.title),
      content: sanitizeContent(currentChunkText),
      contentChars: currentChunkText.length,
      truncated: totalChunks > 1,
      // Chunk metadata
      fullContentChars: fullChars,
      returnedContentChars: currentChunkText.length,
      chunkIndex: docChunkIndex,
      chunkCount: totalChunks,
      chunkStart: currentMeta.start,
      chunkEnd: currentMeta.end,
      hasPrevChunk: docChunkIndex > 1,
      hasNextChunk: docChunkIndex < totalChunks,
      chunks: metas,
    };
    if (candidate.inputKind === "block") item.blockId = candidate.inputId;

    // Backward-compat nextCursor
    if (docChunkIndex < totalChunks) {
      item.nextCursor = makeCursor(doc.docId, currentMeta.end);
    }

    items.push(item);
  }

  return {
    safeOutput: {
      items,
      errors: [...formatErrors, ...existenceErrors, ...readErrors].filter(Boolean),
      note: READ_NOTE,
    },
  };
}
