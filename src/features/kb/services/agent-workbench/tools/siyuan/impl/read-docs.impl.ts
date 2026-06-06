/**
 * read_docs adapter.
 *
 * The adapter only reads resources explicitly passed by the Planner as
 * docIds, blockIds, or a per-document nextCursor. It does not accept old
 * sourceType/doc reference objects, search for replacements, or continue
 * reading automatically.
 */

import { readSiyuanDocForTool } from "../internal/readers/read-doc-full";
import type { SiyuanDocLite } from "../internal/doc-types";
import type { AgentScope } from "../../../scope/types";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import { sanitizeTitle, sanitizeContent } from "./safe-text";
import type {
  ReadDocsItem,
  ReadDocsError,
  ReadDocsInput,
  ReadDocsOutput,
} from "../contracts/read-docs.contract";
import { sqlSelectReadonly } from "../../../../siyuan/read-only-kernel";

const DEFAULT_AGENT_READ_MAX_CHARS = 12000;
const HARD_MAX_CHARS = 100000;
const SIYUAN_ID_RE = /^\d{14}-[a-z0-9]{7}$/i;
const READ_NOTE = "这些是已读取正文，可用于总结、分析、比较。nextCursor 只绑定当前 docId。";

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

function clampReadChars(value: number | undefined, defaultValue: number): number {
  const raw = value ?? defaultValue;
  return Math.max(2000, Math.min(Math.floor(raw), HARD_MAX_CHARS));
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

function getResourceDocId(meta: ResourceMeta): string {
  return meta.type === "d" ? meta.id : (meta.rootId || meta.id);
}

function describeScope(scope: AgentScope): string {
  switch (scope.type) {
    case "current_doc":
      return "当前文档";
    case "doc_tree":
      return "当前文档及子文档";
    case "notebook":
      return "当前笔记本";
    case "custom_docs":
      return "用户选择的文档";
    case "whole_kb":
      return "全库";
    default:
      return "当前范围";
  }
}

function isResourceInsideExplicitScope(
  scope: AgentScope | undefined,
  meta: ResourceMeta,
  rootMeta?: ResourceMeta,
): boolean {
  if (!scope || scope.type === "whole_kb") return true;

  const resourceDocId = getResourceDocId(meta);
  switch (scope.type) {
    case "current_doc":
      return resourceDocId === scope.docId;
    case "custom_docs":
      return scope.docIds.includes(resourceDocId);
    case "notebook":
      return meta.box === scope.notebookId;
    case "doc_tree":
      if (resourceDocId === scope.rootDocId) return true;
      if (!rootMeta?.path || meta.box !== scope.box) return false;
      return meta.path === rootMeta.path || meta.path.startsWith(`${rootMeta.path}/`);
    default:
      return true;
  }
}

function makeOutOfScopeError(
  scope: AgentScope | undefined,
  meta: ResourceMeta,
  kind: "doc" | "block",
): ReadDocsError | null {
  if (!scope || scope.type === "whole_kb") return null;
  return {
    ...(kind === "doc" ? { docId: meta.id } : { blockId: meta.id, docId: meta.rootId || undefined }),
    code: "out_of_scope",
    message: `该资源不在用户显式选择的${describeScope(scope)}范围内。`,
    hint: "请使用当前范围内由结构或搜索工具返回的真实 docId/blockId，或让用户切换知识范围。",
  };
}

async function batchQueryResourceMeta(ids: string[]): Promise<Map<string, ResourceMeta>> {
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

  const scope = deps.getEffectiveScope() ?? deps.getScope();
  const allIds = validIds.map((v) => v.id);
  if (scope?.type === "doc_tree") {
    allIds.push(scope.rootDocId);
  } else if (scope?.type === "current_doc") {
    allIds.push(scope.docId);
  } else if (scope?.type === "custom_docs") {
    allIds.push(...scope.docIds);
  }

  const metaMap = await batchQueryResourceMeta(allIds);
  const scopeRootMeta = scope?.type === "doc_tree" ? metaMap.get(scope.rootDocId) : undefined;
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

    if (!isResourceInsideExplicitScope(scope, meta, scopeRootMeta)) {
      const scopeError = makeOutOfScopeError(scope, meta, kind);
      if (scopeError) existenceErrors.push(scopeError);
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

  const settingsDefault = deps.getSettings?.()?.agentReadMaxCharsPerDoc;
  const defaultMaxChars = clampReadChars(
    typeof settingsDefault === "number" ? settingsDefault : undefined,
    DEFAULT_AGENT_READ_MAX_CHARS,
  );
  const maxChars = clampReadChars(args.maxChars, defaultMaxChars);
  const items: ReadDocsItem[] = [];
  const readErrors: ReadDocsError[] = [];
  const seenReadWindows = new Set<string>();

  for (const candidate of resolvedDocs) {
    const startOffset = cursorTarget && candidate.docId === cursorTarget.docId
      ? cursorTarget.startOffset
      : 0;
    const readWindowKey = `${candidate.docId}:${startOffset}`;
    if (seenReadWindows.has(readWindowKey)) continue;
    seenReadWindows.add(readWindowKey);

    const doc = await readSiyuanDocForTool({ doc: candidate, maxChars, startOffset });
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

    const item: ReadDocsItem = {
      docId: doc.docId,
      title: sanitizeTitle(doc.title),
      content: sanitizeContent(doc.content),
      contentChars: doc.returnedContentChars ?? doc.contentChars,
    };
    if (candidate.inputKind === "block") item.blockId = candidate.inputId;
    if (doc.truncated) {
      item.truncated = true;
      if (doc.nextStartOffset !== undefined) {
        item.nextCursor = makeCursor(doc.docId, doc.nextStartOffset);
      }
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
