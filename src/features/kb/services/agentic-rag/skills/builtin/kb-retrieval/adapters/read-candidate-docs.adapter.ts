/**
 * read_candidate_docs adapter
 *
 * 职责：
 * - 校验 docId/blockId 格式和存在性
 * - 区分 resource_not_found / empty_content / container_without_content / invalid_resource_id
 * - 只读取 Planner 显式传入的资源，不自动搜索或替换 ID
 * - 日志字段真实反映各阶段计数
 */

import { readDocFullForAgenticRag } from "../../../../tools/readers/read-doc-full";
import type { AgenticDocLite } from "../../../../tools/doc-types";
import type { KbRetrievalToolDeps } from "./kb-retrieval-tool-deps";
import { sanitizeTitle, sanitizeSnippet, sanitizeContent } from "./kb-safe-text";
import type {
  PlannerVisibleReadItem,
  ReadCandidateDocsError,
  ReadCandidateDocsInput,
  ReadCandidateDocsOutput,
} from "../schemas/read-candidate-docs.schema";
import { sqlSelectReadonly } from "../../../../../siyuan/read-only-kernel";

const DEFAULT_AGENT_READ_MAX_CHARS_PER_DOC = 12000;
const HARD_MAX_CHARS_PER_DOC = 100000;

/** 思源块 ID 标准格式：14位时间戳-7位字母数字 */
const SIYUAN_ID_RE = /^\d{14}-[a-z0-9]{7}$/i;

interface ResolvedDocForRead extends AgenticDocLite {
  inputId: string;
}

function clampReadChars(value: number | undefined, defaultValue: number): number {
  const raw = value ?? defaultValue;
  return Math.max(2000, Math.min(Math.floor(raw), HARD_MAX_CHARS_PER_DOC));
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

/** 校验 ID 是否符合思源块 ID 基本形态 */
function isValidSiyuanId(id: string): boolean {
  return SIYUAN_ID_RE.test(id);
}

interface ResourceMeta {
  id: string;
  title: string;
  type: string;  // 'd' = document, 'h' = heading, 'p' = paragraph, etc.
  box: string;
  path: string;
  rootId: string;
  parentId: string;
  childDocCount: number;
}

/**
 * 批量查询资源元数据，验证 ID 是否真实存在。
 * 返回 Map<id, ResourceMeta>，不存在的 ID 不会出现在 map 中。
 */
async function batchQueryResourceMeta(ids: string[]): Promise<Map<string, ResourceMeta>> {
  const result = new Map<string, ResourceMeta>();
  if (ids.length === 0) return result;

  const uniqueIds = [...new Set(ids)];
  const idList = uniqueIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(",");

  try {
    const rows = await sqlSelectReadonly<{
      id: string;
      content: string;
      type: string;
      box: string;
      path: string;
      root_id: string;
      parent_id: string;
    }>(
      `SELECT id, content, type, box, path, root_id, parent_id FROM blocks WHERE id IN (${idList})`,
      { maxLimit: Math.max(uniqueIds.length, 50), allowedTables: ["blocks"] }
    );

    if (!Array.isArray(rows)) return result;

    // 收集所有 docId，批量查子文档数
    const docIds = rows.filter((r) => r.type === "d").map((r) => r.id);
    const childCountMap = await batchQueryChildDocCount(docIds);

    for (const row of rows) {
      if (!row.id) continue;
      result.set(row.id, {
        id: row.id,
        title: row.content || "",
        type: row.type || "",
        box: row.box || "",
        path: row.path || "",
        rootId: row.root_id || "",
        parentId: row.parent_id || "",
        childDocCount: childCountMap.get(row.id) ?? 0,
      });
    }
  } catch {
    console.warn("[read-candidate-docs] 批量查询资源元数据失败");
  }

  return result;
}

/**
 * 批量查询文档的子文档数量。
 * 通过 path 前缀匹配：如果其他文档的 path 以 "/{docId}" 结尾或包含 "/{docId}/"，说明该文档有子文档。
 */
async function batchQueryChildDocCount(docIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (docIds.length === 0) return result;

  // 对每个 docId，检查 path 中包含该 ID 的文档数（排除自身）
  // 使用 LIKE 查询：path LIKE '%/{docId}/%' 表示该 docId 是某文档的祖先
  // 但更简单的方式：检查 path 以 /{parentPath}/{docId} 开头的文档
  // 由于 path 格式为 /id1/id2/id3，子文档的 path 会包含父文档的 ID

  try {
    // 一次性查询所有文档的 path，在内存中计算
    const idList = docIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");

    // 查询这些文档的 path
    const parentRows = await sqlSelectReadonly<{ id: string; path: string }>(
      `SELECT id, path FROM blocks WHERE id IN (${idList}) AND type = 'd'`,
      { maxLimit: Math.max(docIds.length, 50), allowedTables: ["blocks"] }
    );

    if (!Array.isArray(parentRows) || parentRows.length === 0) return result;

    // 构建每个父文档的 path 前缀
    const pathPrefixes = new Map<string, string>();
    for (const row of parentRows) {
      if (row.path) {
        // path 格式: /id1/id2/id3，子文档的 path 会以 "{parentPath}/" 开头
        pathPrefixes.set(row.id, row.path);
      }
    }

    if (pathPrefixes.size === 0) return result;

    // 查询所有可能相关的子文档
    // 使用 OR 条件查询 path LIKE 'prefix/%'
    const conditions: string[] = [];
    for (const [_parentId, parentPath] of pathPrefixes) {
      const escaped = parentPath.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
      conditions.push(`path LIKE '${escaped}/%' ESCAPE '\\'`);
    }

    if (conditions.length === 0) return result;

    // 分批查询避免 SQL 过长
    const batchSize = 20;
    for (let i = 0; i < conditions.length; i += batchSize) {
      const batchConditions = conditions.slice(i, i + batchSize);
      const whereClause = batchConditions.join(" OR ");
      const childRows = await sqlSelectReadonly<{ path: string }>(
        `SELECT path FROM blocks WHERE (${whereClause}) AND type = 'd'`,
        { maxLimit: 500, allowedTables: ["blocks"] }
      );

      if (Array.isArray(childRows)) {
        for (const childRow of childRows) {
          const childPath = childRow.path || "";
          // 找到这个子文档属于哪个父文档
          for (const [parentId, parentPath] of pathPrefixes) {
            if (childPath.startsWith(parentPath + "/") && childPath !== parentPath) {
              result.set(parentId, (result.get(parentId) ?? 0) + 1);
            }
          }
        }
      }
    }
  } catch {
    console.warn("[read-candidate-docs] 批量查询子文档数失败");
  }

  return result;
}

/**
 * 收集所有输入 ID，进行格式校验，返回有效 ID 列表和错误列表。
 * docs 数组中同时传入 docId + blockId 时，记录配对关系用于后续归属校验。
 */
function collectAndValidateIds(
  args: ReadCandidateDocsInput,
): {
  validIds: Array<{ id: string; inputId: string; kind: "doc" | "block"; pairedDocId?: string }>;
  errors: ReadCandidateDocsError[];
  requestedDocIdCount: number;
  requestedBlockIdCount: number;
} {
  const errors: ReadCandidateDocsError[] = [];
  const validIds: Array<{ id: string; inputId: string; kind: "doc" | "block"; pairedDocId?: string }> = [];
  const seenIds = new Set<string>();

  let requestedDocIdCount = 0;
  let requestedBlockIdCount = 0;

  // 处理 docs 数组
  if (args.docs) {
    for (const ref of args.docs) {
      // 如果同时有 docId 和 blockId，blockId 是主读取目标，docId 用于归属校验
      const hasBoth = ref.docId && ref.blockId && ref.docId !== ref.blockId;
      const id = hasBoth ? ref.blockId! : (ref.docId || ref.blockId);
      if (!id) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      // ID 格式校验
      if (!isValidSiyuanId(id)) {
        errors.push({
          docId: ref.docId,
          blockId: ref.blockId,
          code: "invalid_resource_id",
          message: `该 ID 不符合思源资源 ID 基本形态。`,
          hint: "请检查 ID 是否正确复制，思源 ID 格式为 14位时间戳-7位字母数字，如 20230101000000-abc1234。",
        });
        continue;
      }

      // 同时校验 pairedDocId 格式
      if (hasBoth && !isValidSiyuanId(ref.docId!)) {
        errors.push({
          docId: ref.docId,
          blockId: ref.blockId,
          code: "invalid_resource_id",
          message: `配对的 docId 不符合思源资源 ID 基本形态。`,
          hint: "请检查 docId 是否正确复制。",
        });
        continue;
      }

      const kind = hasBoth ? "block" : (ref.docId ? "doc" : "block");
      if (kind === "doc") requestedDocIdCount++;
      else requestedBlockIdCount++;
      validIds.push({ id, inputId: id, kind, pairedDocId: hasBoth ? ref.docId : undefined });
    }
  }

  // 处理 docIds 数组
  if (args.docIds) {
    for (const docId of args.docIds) {
      if (seenIds.has(docId)) continue;
      seenIds.add(docId);
      requestedDocIdCount++;

      if (!isValidSiyuanId(docId)) {
        errors.push({
          docId,
          code: "invalid_resource_id",
          message: `该 docId 不符合思源资源 ID 基本形态。`,
          hint: "请检查 ID 是否正确复制，思源 ID 格式为 14位时间戳-7位字母数字。",
        });
        continue;
      }

      validIds.push({ id: docId, inputId: docId, kind: "doc" });
    }
  }

  // 处理 blockIds 数组
  if (args.blockIds) {
    for (const blockId of args.blockIds) {
      if (seenIds.has(blockId)) continue;
      seenIds.add(blockId);
      requestedBlockIdCount++;

      if (!isValidSiyuanId(blockId)) {
        errors.push({
          blockId,
          code: "invalid_resource_id",
          message: `该 blockId 不符合思源资源 ID 基本形态。`,
          hint: "请检查 ID 是否正确复制，思源 ID 格式为 14位时间戳-7位字母数字。",
        });
        continue;
      }

      validIds.push({ id: blockId, inputId: blockId, kind: "block" });
    }
  }

  return { validIds, errors, requestedDocIdCount, requestedBlockIdCount };
}

export async function executeReadCandidateDocs(
  deps: KbRetrievalToolDeps,
  args: ReadCandidateDocsInput,
): Promise<{ safeOutput: ReadCandidateDocsOutput }> {
  const readMode = args.readMode ?? "default";
  const cursorTarget = readMode === "next" ? parseCursor(args.cursor) : null;

  // ── 处理 cursor 模式 ──
  // cursor 只作用于匹配的 docId，不为所有 doc 设置相同 offset。
  let cursorDoc: ResolvedDocForRead | null = null;
  if (readMode === "next" && cursorTarget) {
    cursorDoc = { inputId: cursorTarget.docId, docId: cursorTarget.docId, title: "" };
  }

  // 无效 cursor 早早失败
  if (readMode === "next" && !cursorTarget) {
    return {
      safeOutput: {
        items: [], readItems: [], contentItems: [],
        errors: [{ code: "invalid_cursor", message: "readMode=next 需要有效的 cursor，但未提供或格式不正确。", hint: "请使用上次返回的 nextCursor 值。" }],
        readItemCount: 0, contentItemCount: 0, readDocCount: 0,
        requestedDocIdCount: 0, validDocIdCount: 0, resolvedDocCount: 0,
        resolvedBlockCount: 0, resourceMismatchCount: 0,
        emptyContentCount: 0, containerCount: 0, failedResourceCount: 1,
        truncated: false, readMode,
      },
    };
  }

  // ── 第一步：收集并校验 ID 格式 ──
  const { validIds, errors: formatErrors, requestedDocIdCount, requestedBlockIdCount } =
    collectAndValidateIds(args);

  const validDocIdCount = validIds.length;

  // ── 第二步：查询资源元数据，验证存在性 ──
  const allIds = validIds.map((v) => v.id);
  if (cursorDoc) allIds.push(cursorTarget!.docId);
  const metaMap = await batchQueryResourceMeta(allIds);

  const resolvedDocs: ResolvedDocForRead[] = [];
  const existenceErrors: ReadCandidateDocsError[] = [];

  // 处理 cursor doc
  if (cursorDoc) {
    const meta = metaMap.get(cursorTarget!.docId);
    if (!meta) {
      existenceErrors.push({
        docId: cursorTarget!.docId,
        code: "resource_not_found",
        message: "cursor 对应的资源不存在。",
        hint: "该 ID 在知识库中未找到，请确认 ID 是否正确。",
      });
    } else {
      resolvedDocs.push({
        inputId: cursorTarget!.docId,
        docId: cursorTarget!.docId,
        title: meta.title || "未命名文档",
        box: meta.box,
        path: meta.path,
      });
    }
  }

  // 处理普通 ID
  let resolvedBlockCount = 0;
  let resourceMismatchCount = 0;
  for (const { id, kind, pairedDocId } of validIds) {
    const meta = metaMap.get(id);
    if (!meta) {
      existenceErrors.push({
        ...(kind === "doc" ? { docId: id } : { blockId: id }),
        code: "resource_not_found",
        message: kind === "doc"
          ? "该 docId 对应的文档不存在。"
          : "该 blockId 对应的块不存在。",
        hint: "该 ID 在知识库中未找到，请确认 ID 是否正确或是否已被删除。",
      });
      continue;
    }

    // 块类型资源：需要找到其所属文档来读取
    if (meta.type !== "d") {
      // blockId 归属校验：如果调用方同时传了 docId，检查 root_id 是否一致
      if (pairedDocId && meta.rootId && meta.rootId !== pairedDocId) {
        resourceMismatchCount++;
        existenceErrors.push({
          docId: pairedDocId,
          blockId: id,
          code: "resource_mismatch",
          message: `该 blockId 所属文档（root_id=${meta.rootId}）与传入的 docId（${pairedDocId}）不一致。`,
          hint: "请确认 blockId 与 docId 的归属关系是否正确，blockId 必须属于对应 docId 的文档。",
        });
        continue;
      }
      resolvedBlockCount++;
      // 非 document 类型的块，使用 root_id 作为文档 ID
      resolvedDocs.push({
        inputId: id,
        docId: meta.rootId || id,
        title: meta.title || "未命名块",
        box: meta.box,
        path: meta.path,
      });
    } else {
      // type="d" 的文档根块：如果同时传了 blockId 且 blockId===docId，这是文档级引用
      // 如果 pairedDocId 存在且与 id 不同，说明调用方误把文档 ID 当成了块
      if (pairedDocId && pairedDocId !== id) {
        resourceMismatchCount++;
        existenceErrors.push({
          docId: pairedDocId,
          blockId: id,
          code: "resource_mismatch",
          message: `该 ID 实际是文档根块（type="d"），与传入的 docId（${pairedDocId}）不一致。`,
          hint: "该 blockId 是文档根块，如需引用整篇文档请只传 docId。",
        });
        continue;
      }
      resolvedDocs.push({
        inputId: id,
        docId: id,
        title: meta.title || "未命名文档",
        box: meta.box,
        path: meta.path,
      });
    }
  }

  const resolvedDocCount = resolvedDocs.length;
  const allErrors = [...formatErrors, ...existenceErrors];

  console.info("[KB-AGENT | READ_CANDIDATE_DOCS_RESOLVE]", {
    requestedDocIdCount,
    requestedBlockIdCount,
    validDocIdCount,
    resolvedDocCount,
    resolvedBlockCount,
    resourceMismatchCount,
    formatErrorCount: formatErrors.length,
    existenceErrorCount: existenceErrors.length,
    readMode,
  });

  if (resolvedDocs.length === 0) {
    return {
      safeOutput: {
        items: [], readItems: [], contentItems: [],
        errors: allErrors.length > 0 ? allErrors : undefined,
        readItemCount: 0, contentItemCount: 0, readDocCount: 0,
        requestedDocIdCount, requestedBlockIdCount,
        validDocIdCount, resolvedDocCount: 0,
        resolvedBlockCount, resourceMismatchCount,
        emptyContentCount: 0, containerCount: 0,
        failedResourceCount: allErrors.length,
        truncated: false, readMode,
      },
    };
  }

  // ── 第三步：读取内容 ──
  const settingsDefault = deps.getSettings?.()?.agentReadMaxCharsPerDoc;
  const defaultMaxChars = clampReadChars(
    typeof settingsDefault === "number" ? settingsDefault : undefined,
    DEFAULT_AGENT_READ_MAX_CHARS_PER_DOC,
  );
  const maxChars = readMode === "full"
    ? clampReadChars(args.maxCharsPerDoc, HARD_MAX_CHARS_PER_DOC)
    : clampReadChars(args.maxCharsPerDoc, defaultMaxChars);
  const rangeStartOffset = readMode === "range" ? Math.max(0, Math.floor(args.startOffset ?? 0)) : 0;

  const items: PlannerVisibleReadItem[] = [];
  const readErrors: ReadCandidateDocsError[] = [];
  const seenOffsets = new Map<string, number>(); // docId → last startOffset, for dedup
  let emptyContentCount = 0;
  let containerCount = 0;
  let duplicateReadItemCount = 0;

  for (const candidate of resolvedDocs) {
    // cursor 偏移只作用于 cursor 对应的文档
    const isCursorDoc = readMode === "next" && cursorTarget && candidate.docId === cursorTarget.docId;
    const docStartOffset = isCursorDoc ? cursorTarget.startOffset : rangeStartOffset;

    // 去重：同一 docId+startOffset 不重复读取
    const lastOffset = seenOffsets.get(candidate.docId);
    if (lastOffset !== undefined && lastOffset === docStartOffset) {
      duplicateReadItemCount++;
      continue;
    }
    seenOffsets.set(candidate.docId, docStartOffset);
    const doc = await readDocFullForAgenticRag({ doc: candidate, maxChars, startOffset: docStartOffset });
    if (!doc) {
      readErrors.push({
        docId: candidate.docId,
        code: "resource_not_found",
        message: "未能读取该文档内容，资源可能不存在或暂时不可访问。",
        hint: "请确认该 docId 是否正确，或尝试搜索获取有效 ID。",
      });
      continue;
    }

    if ((doc as { contentEmpty?: boolean }).contentEmpty) {
      // 区分 empty_content 和 container_without_content
      const meta = metaMap.get(candidate.inputId);
      const childDocCount = meta?.childDocCount ?? 0;

      if (childDocCount > 0) {
        containerCount++;
        readErrors.push({
          docId: candidate.docId,
          code: "container_without_content",
          message: "该 ID 指向目录节点/容器文档，正文为空，但有子文档。",
          hint: "可改读其子文档，或使用 list_knowledge_map 查看其子节点后选择具体子文档 ID 读取。",
        });
      } else {
        emptyContentCount++;
        readErrors.push({
          docId: candidate.docId,
          code: "empty_content",
          message: "该文档存在，但正文为空。",
          hint: "可查看其子文档或改读其他文档 ID。",
        });
      }
      continue;
    }

    const item: PlannerVisibleReadItem = {
      docId: doc.docId,
      title: sanitizeTitle(doc.title),
      content: sanitizeContent(doc.content),
      snippet: sanitizeSnippet(doc.content),
      referenceIndex: items.length + 1,
      originalContentChars: doc.originalContentChars ?? doc.contentChars,
      returnedContentChars: doc.returnedContentChars ?? doc.contentChars,
      remainingChars: doc.remainingChars ?? 0,
      startOffset: doc.startOffset ?? docStartOffset,
    };
    if (doc.truncated) {
      item.truncated = true;
      if (doc.nextStartOffset !== undefined) {
        item.nextCursor = makeCursor(doc.docId, doc.nextStartOffset);
      }
    }
    items.push(item);
  }

  const allReadErrors = [...allErrors, ...readErrors];
  const failedResourceCount = allReadErrors.length;
  const truncatedDocCount = items.filter((i) => i.truncated).length;
  const totalReturnedChars = items.reduce((sum, i) => sum + (i.returnedContentChars ?? 0), 0);
  const largestDocChars = items.length > 0 ? Math.max(...items.map((i) => i.returnedContentChars ?? 0)) : 0;

  return {
    safeOutput: {
      items, readItems: items, contentItems: items,
      errors: allReadErrors.length > 0 ? allReadErrors : undefined,
      readItemCount: items.length, contentItemCount: items.length, readDocCount: items.length,
      requestedDocIdCount, requestedBlockIdCount,
      validDocIdCount, resolvedDocCount,
      resolvedBlockCount, resourceMismatchCount,
      emptyContentCount, containerCount, failedResourceCount,
      duplicateReadItemCount,
      truncatedDocCount, totalReturnedChars, largestDocChars,
      truncated: items.some((item) => item.truncated), readMode,
    },
  };
}
