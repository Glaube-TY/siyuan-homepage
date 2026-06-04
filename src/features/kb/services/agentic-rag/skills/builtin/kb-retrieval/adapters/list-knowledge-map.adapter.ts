/**
 * list_knowledge_map adapter: 调用底层 knowledge-map-reader 获取文档树，
 * 直接返回 docId/blockId，不再使用 opaque identifier。
 *
 * 修复：
 * - mode=list 有 rootDocId 时，从 mapping 解析 rootPath 以匹配后代节点
 * - 无效 rootDocId/notebookId 返回结构化错误而非静默返回 0
 * - 每个资源输出 sourceType/docId/title/nodeKind/hasChildren/childCount/canReadContent
 */

import { buildKnowledgeMap } from "../../../../tools/readers/knowledge-map-reader";
import type { KnowledgeDocResource } from "../../../../tools/knowledge-map-types";
import {
  getBacklinkReadonly,
  getTagsReadonly,
  sqlSelectReadonly,
  type ReadonlyTag,
} from "../../../../../siyuan/read-only-kernel";
import type { KbRetrievalToolDeps } from "./kb-retrieval-tool-deps";
import { sanitizeTitle } from "./kb-safe-text";
import type {
  ListKnowledgeMapInput,
  ListKnowledgeMapOutput,
  PlannerVisibleLinkedDoc,
  PlannerVisibleKnowledgeMapNode,
  PlannerVisibleKnowledgeMapNotebook,
} from "../schemas/list-knowledge-map.schema";

interface FilterSpec {
  box?: string;
  rootPath?: string;
  rootDocId?: string;
}

type KnowledgeMapView = NonNullable<ListKnowledgeMapInput["view"]>;
type TagStatus = "loaded" | "not_requested" | "not_available" | "truncated";

interface PageWindow<T> {
  items: T[];
  offset: number;
  hasMore: boolean;
  nextCursor?: string;
  total: number;
}

interface TagAttachResult {
  status: TagStatus;
  taggedNodeCount: number;
  tagErrorCount: number;
}

interface TagBlockRow {
  id?: string;
  root_id?: string;
  content?: string;
  markdown?: string;
}

interface TagDictionaryEntry {
  name: string;
  count: number;
}

function normalizePath(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveView(args: ListKnowledgeMapInput): KnowledgeMapView {
  if (args.view) return args.view;
  return args.mode === "list" ? "list" : "notebook_roots";
}

function parseOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  if (!match) return 0;
  return Math.max(0, Number(match[1]) || 0);
}

function pageItems<T>(items: T[], limit: number, cursor: string | undefined): PageWindow<T> {
  const offset = parseOffsetCursor(cursor);
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const selected = items.slice(offset, offset + safeLimit);
  const nextOffset = offset + selected.length;
  const hasMore = nextOffset < items.length;
  return {
    items: selected,
    offset,
    hasMore,
    nextCursor: hasMore ? `offset:${nextOffset}` : undefined,
    total: items.length,
  };
}

function findMappingByDocId(sourceMapping: KnowledgeDocResource[], docId: string | undefined): KnowledgeDocResource | undefined {
  if (!docId) return undefined;
  return sourceMapping.find((m) => m.internalDocId === docId);
}

function isDirectChild(mapping: KnowledgeDocResource, parentDocId: string): boolean {
  if (mapping.parentDocId) return mapping.parentDocId === parentDocId;
  const pathParts = normalizePath(mapping.path).split("/").filter(Boolean);
  if (pathParts.length < 2) return false;
  return pathParts[pathParts.length - 2] === parentDocId;
}

function isNotebookRoot(mapping: KnowledgeDocResource): boolean {
  if (mapping.parentDocId) return false;
  const pathParts = normalizePath(mapping.path).split("/").filter(Boolean);
  return pathParts.length <= 1;
}

function resolveFilterSpec(
  _deps: KbRetrievalToolDeps,
  args: ListKnowledgeMapInput,
  sourceMapping: KnowledgeDocResource[],
): FilterSpec | undefined {
  if (args.rootDocId) {
    const rootMapping = sourceMapping.find((m) => m.internalDocId === args.rootDocId);
    return {
      rootDocId: args.rootDocId,
      rootPath: rootMapping?.path,
    };
  }
  if (args.notebookId) return { box: args.notebookId };
  return undefined;
}

function matchesFilter(mapping: KnowledgeDocResource | undefined, filter: FilterSpec | undefined): boolean {
  if (!filter) return true;
  if (!mapping) return false;
  if (filter.box && mapping.box !== filter.box) return false;
  if (filter.rootDocId === "__unresolved__") return false;

  // 无 rootPath 和 rootDocId 时，匹配全部
  if (!filter.rootPath && !filter.rootDocId) return true;

  // 有 rootDocId：匹配自身 + 后代
  if (filter.rootDocId) {
    // 自身匹配
    if (mapping.internalDocId === filter.rootDocId) return true;
    // 后代匹配：path 以 rootPath + "/" 开头
    if (filter.rootPath) {
      const candidatePath = normalizePath(mapping.path);
      const rootPath = normalizePath(filter.rootPath);
      if (candidatePath && rootPath && candidatePath.startsWith(`${rootPath}/`)) return true;
    }
    return false;
  }

  // 只有 rootPath 的情况
  const candidatePath = normalizePath(mapping.path);
  const rootPath = normalizePath(filter.rootPath);
  return !!candidatePath && !!rootPath && candidatePath.startsWith(`${rootPath}/`);
}

function resourceToNode(mapping: KnowledgeDocResource, children?: PlannerVisibleKnowledgeMapNode[]): PlannerVisibleKnowledgeMapNode {
  const childCount = typeof mapping.childCount === "number" ? mapping.childCount : children?.length ?? 0;
  const hasChildren = childCount > 0;
  const node: PlannerVisibleKnowledgeMapNode = {
    docId: mapping.internalDocId,
    sourceType: "siyuan_doc",
    title: sanitizeTitle(mapping.title),
    depth: mapping.depth,
    childCount,
    parentDocId: mapping.parentDocId,
    siblingCount: mapping.siblingCount,
    hasChildren,
    nodeKind: "document",
    canReadContent: true, // 有真实 docId 默认可尝试读取，empty_content/container_without_content 由 read_candidate_docs 判断
  };
  if (children && children.length > 0) node.children = children;
  return node;
}

function collectDescendants(sourceMapping: KnowledgeDocResource[], rootDocId: string, maxDepth: number): KnowledgeDocResource[] {
  const root = findMappingByDocId(sourceMapping, rootDocId);
  if (!root) return [];
  const rootPath = normalizePath(root.path);
  const rootDepth = root.depth;
  return sourceMapping.filter((mapping) => {
    if (mapping.internalDocId === rootDocId) return true;
    if (mapping.parentDocId) {
      let current: KnowledgeDocResource | undefined = mapping;
      let guard = 0;
      while (current?.parentDocId && guard < 50) {
        if (current.parentDocId === rootDocId) return mapping.depth - rootDepth <= maxDepth;
        current = findMappingByDocId(sourceMapping, current.parentDocId);
        guard += 1;
      }
      return false;
    }
    const candidatePath = normalizePath(mapping.path);
    return !!candidatePath && !!rootPath && candidatePath.startsWith(`${rootPath}/`) && mapping.depth - rootDepth <= maxDepth;
  });
}

function relationGroupsToLinkedDocs(
  groups: unknown,
  relation: "backlink" | "mention",
  relationLimit: number,
): PlannerVisibleLinkedDoc[] {
  if (!Array.isArray(groups) || relationLimit <= 0) return [];
  const result: PlannerVisibleLinkedDoc[] = [];
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const raw = group as {
      root?: unknown;
      id?: unknown;
      name?: unknown;
      count?: unknown;
      blocks?: unknown;
    };
    const docId = typeof raw.root === "string" && raw.root.trim()
      ? raw.root.trim()
      : typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : undefined;
    if (!docId) continue;
    const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
    const firstBlock = blocks[0] as { id?: unknown } | undefined;
    const sampleBlockId = typeof firstBlock?.id === "string" && firstBlock.id.trim()
      ? firstBlock.id.trim()
      : undefined;
    const item: PlannerVisibleLinkedDoc = {
      docId,
      title: sanitizeTitle(raw.name),
      relation,
      count: typeof raw.count === "number" && Number.isFinite(raw.count) ? Math.max(0, Math.floor(raw.count)) : blocks.length,
      source: "getBacklink",
    };
    if (sampleBlockId) item.sampleBlockId = sampleBlockId;
    result.push(item);
    if (result.length >= relationLimit) break;
  }
  return result;
}

async function attachLinkedDocsToNodes(
  nodes: PlannerVisibleKnowledgeMapNode[],
  includeLinkedDocs: boolean,
  relationLimit: number,
): Promise<number> {
  if (!includeLinkedDocs || relationLimit <= 0) {
    for (const node of nodes) node.linkedDocsStatus = "not_requested";
    return 0;
  }

  let errorCount = 0;
  for (const node of nodes) {
    try {
      const response = await getBacklinkReadonly({
        id: node.docId,
        k: "",
        mk: "",
        beforeLen: 12,
        containChildren: true,
      });
      if (!response) {
        errorCount += 1;
        node.linkedDocs = [];
        node.linkRefsCount = 0;
        node.mentionsCount = 0;
        node.linkedDocsStatus = "unavailable";
        continue;
      }
      const backlinks = relationGroupsToLinkedDocs(response?.backlinks, "backlink", relationLimit);
      const remaining = Math.max(0, relationLimit - backlinks.length);
      const mentions = relationGroupsToLinkedDocs(response?.backmentions, "mention", remaining);
      node.linkedDocs = [...backlinks, ...mentions];
      node.linkRefsCount = typeof response?.linkRefsCount === "number" ? response.linkRefsCount : backlinks.length;
      node.mentionsCount = typeof response?.mentionsCount === "number" ? response.mentionsCount : mentions.length;
      node.linkedDocsStatus = "available";
    } catch {
      errorCount += 1;
      node.linkedDocs = [];
      node.linkRefsCount = 0;
      node.mentionsCount = 0;
      node.linkedDocsStatus = "error";
    }
  }
  return errorCount;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function stripTagHighlight(value: string): string {
  return value
    .replace(/<\/?mark>/gi, "")
    .replace(/&lt;\/?mark&gt;/gi, "")
    .trim();
}

function normalizeTagName(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripTagHighlight(value)
    .replace(/^#+/, "")
    .replace(/#+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeVisibleTagName(value: string): string {
  return value
    .replace(/\d{14}-[a-z0-9]{7}/gi, "[redacted-id]")
    .replace(/\b[0-9a-f]{32}\b/gi, "[redacted-id]")
    .replace(/\.sy\b/gi, "[redacted-file]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function flattenTagDictionary(tags: ReadonlyTag[]): Map<string, TagDictionaryEntry> {
  const dictionary = new Map<string, TagDictionaryEntry>();
  const visit = (tag: ReadonlyTag) => {
    const canonicalName = normalizeTagName(tag.name ?? tag.label);
    if (canonicalName) {
      const entry = {
        name: sanitizeVisibleTagName(canonicalName),
        count: typeof tag.count === "number" && Number.isFinite(tag.count) ? Math.max(0, Math.floor(tag.count)) : 0,
      };
      dictionary.set(canonicalName, entry);
      const labelName = normalizeTagName(tag.label);
      if (labelName) dictionary.set(labelName, entry);
    }
    if (Array.isArray(tag.children)) {
      for (const child of tag.children) visit(child);
    }
  };
  for (const tag of tags) visit(tag);
  return dictionary;
}

function isHeadingMarkdown(markdown: string): boolean {
  return /^\s{0,3}#{1,6}\s+\S/.test(markdown);
}

function extractInlineTagsFromText(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const tags: string[] = [];
  const re = /#([^#\s][^#\n]*?)#/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const tagName = normalizeTagName(match[1]);
    if (tagName) tags.push(tagName);
  }
  return tags;
}

function extractInlineTagsFromBlock(row: TagBlockRow): string[] {
  const tags = extractInlineTagsFromText(row.content);
  if (typeof row.markdown === "string" && !isHeadingMarkdown(row.markdown)) {
    tags.push(...extractInlineTagsFromText(row.markdown));
  }
  return tags;
}

function resolveRowDocId(row: TagBlockRow, allowedDocIds: Set<string>): string | undefined {
  const rootId = typeof row.root_id === "string" ? row.root_id.trim() : "";
  if (rootId && allowedDocIds.has(rootId)) return rootId;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (id && allowedDocIds.has(id)) return id;
  return undefined;
}

async function attachTagsToNodes(
  nodes: PlannerVisibleKnowledgeMapNode[],
  includeTags: boolean,
  tagLimit: number,
): Promise<TagAttachResult> {
  if (!includeTags) {
    for (const node of nodes) node.tagStatus = "not_requested";
    return { status: "not_requested", taggedNodeCount: 0, tagErrorCount: 0 };
  }

  const safeTagLimit = Math.max(0, Math.min(Math.floor(tagLimit), 100));
  const docIds = [...new Set(nodes.map((node) => node.docId).filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (docIds.length === 0) {
    return { status: "loaded", taggedNodeCount: 0, tagErrorCount: 0 };
  }

  try {
    const tagDictionary = flattenTagDictionary(await getTagsReadonly({ ignoreMaxListHint: true }));
    const tagSetsByDocId = new Map<string, Set<string>>();
    const rowLimit = Math.min(Math.max(docIds.length * 80, 200), 3000);
    const idList = docIds.map((id) => `'${escapeSqlLiteral(id)}'`).join(",");
    const rows = await sqlSelectReadonly<TagBlockRow>(
      `SELECT id, root_id, content, markdown FROM blocks WHERE root_id IN (${idList}) OR id IN (${idList}) LIMIT ${rowLimit}`,
      { maxLimit: rowLimit, allowedTables: ["blocks"] },
    );
    const allowedDocIds = new Set(docIds);
    for (const row of rows) {
      const docId = resolveRowDocId(row, allowedDocIds);
      if (!docId) continue;
      const matchedTags = extractInlineTagsFromBlock(row);
      if (matchedTags.length === 0) continue;
      let docTags = tagSetsByDocId.get(docId);
      if (!docTags) {
        docTags = new Set<string>();
        tagSetsByDocId.set(docId, docTags);
      }
      for (const tagName of matchedTags) {
        const dictionaryEntry = tagDictionary.get(tagName);
        if (dictionaryEntry?.name) docTags.add(dictionaryEntry.name);
      }
    }

    let taggedNodeCount = 0;
    let hasTruncated = rows.length >= rowLimit;
    for (const node of nodes) {
      const tagList = [...(tagSetsByDocId.get(node.docId) ?? [])];
      node.tagCount = tagList.length;
      if (tagList.length > 0) taggedNodeCount += 1;
      node.tags = tagList.slice(0, safeTagLimit);
      if (tagList.length > safeTagLimit || rows.length >= rowLimit) {
        node.tagStatus = "truncated";
        hasTruncated = true;
      } else {
        node.tagStatus = "loaded";
      }
    }

    return {
      status: hasTruncated ? "truncated" : "loaded",
      taggedNodeCount,
      tagErrorCount: 0,
    };
  } catch {
    for (const node of nodes) {
      node.tags = [];
      node.tagCount = 0;
      node.tagStatus = "not_available";
    }
    return { status: "not_available", taggedNodeCount: 0, tagErrorCount: 1 };
  }
}

function cloneSafeNodeFromRaw(
  rawNode: unknown,
  sourceMapping: KnowledgeDocResource[],
  state: {
    mappingByDocId: Map<string, KnowledgeDocResource>;
    returnedNodeCount: number;
    filter?: FilterSpec;
  },
): PlannerVisibleKnowledgeMapNode | null {
  if (!rawNode || typeof rawNode !== "object") return null;
  const raw = rawNode as {
    docId?: unknown;
    title?: unknown;
    depth?: unknown;
    childCount?: unknown;
    parentDocId?: unknown;
    siblingCount?: unknown;
    children?: unknown;
    truncatedChildren?: unknown;
  };

  // 直接使用真实 docId 查找 mapping
  const rawDocId = typeof raw.docId === "string" ? raw.docId : undefined;
  const resourceMapping = rawDocId ? state.mappingByDocId.get(rawDocId) : undefined;

  // 递归处理子节点
  const children: PlannerVisibleKnowledgeMapNode[] = [];
  if (Array.isArray(raw.children)) {
    for (const child of raw.children) {
      const safeChild = cloneSafeNodeFromRaw(child, sourceMapping, state);
      if (safeChild) children.push(safeChild);
    }
  }

  // 过滤：自身不匹配且无子节点则跳过
  const selfMatches = matchesFilter(resourceMapping, state.filter);
  if (!selfMatches && children.length === 0) return null;

  state.returnedNodeCount += 1;

  // 使用真实 docId
  const docId = resourceMapping?.internalDocId || rawDocId;
  if (!docId) return null;

  const childCount = typeof raw.childCount === "number" && Number.isInteger(raw.childCount)
    ? raw.childCount
    : children.length;
  const hasChildren = childCount > 0;
  const nodeKind: PlannerVisibleKnowledgeMapNode["nodeKind"] = "document";
  const canReadContent = true;

  const safeNode: PlannerVisibleKnowledgeMapNode = {
    docId,
    sourceType: "siyuan_doc",
    title: sanitizeTitle(raw.title),
    depth: typeof raw.depth === "number" && Number.isInteger(raw.depth) ? raw.depth : 0,
    childCount,
    parentDocId: resourceMapping?.parentDocId ?? (typeof raw.parentDocId === "string" ? raw.parentDocId : undefined),
    siblingCount: typeof resourceMapping?.siblingCount === "number"
      ? resourceMapping.siblingCount
      : typeof raw.siblingCount === "number" && Number.isInteger(raw.siblingCount)
        ? raw.siblingCount
        : undefined,
    hasChildren,
    nodeKind,
    canReadContent,
  };
  if (children.length > 0) safeNode.children = children;
  if (raw.truncatedChildren === true) safeNode.truncatedChildren = true;
  return safeNode;
}

function buildTreeSafeOutput(
  deps: KbRetrievalToolDeps,
  args: ListKnowledgeMapInput,
  sourceOutput: unknown,
  sourceMapping: KnowledgeDocResource[],
): { safeOutput: ListKnowledgeMapOutput } {
  const source = sourceOutput as {
    notebooks?: unknown;
    totalNodeCount?: unknown;
    truncated?: unknown;
    notebookApiLoaded?: unknown;
    notebookCount?: unknown;
    missingNotebookNameCount?: unknown;
  };

  // 校验 rootDocId 是否存在于 mapping 中
  if (args.rootDocId) {
    const rootExists = sourceMapping.some((m) => m.internalDocId === args.rootDocId);
    if (!rootExists) {
      throw new Error(`[resource_not_found] rootDocId "${args.rootDocId}" 在当前范围内不存在。请确认 rootDocId 是否来自当前可见范围内的真实文档 ID。`);
    }
  }

  // 校验 notebookId 是否有对应的 mapping
  if (args.notebookId) {
    const notebookExists = sourceMapping.some((m) => m.box === args.notebookId);
    if (!notebookExists) {
      throw new Error(`[resource_not_found] notebookId "${args.notebookId}" 在当前范围内不存在。请使用工具返回的真实 notebookId。`);
    }
  }

  const filter = resolveFilterSpec(deps, args, sourceMapping);

  // 建立 docId -> mapping 映射
  const mappingByDocId = new Map(sourceMapping.map((m) => [m.internalDocId, m]));

  const state = {
    mappingByDocId,
    returnedNodeCount: 0,
    filter,
  };

  const notebooks: PlannerVisibleKnowledgeMapNotebook[] = [];
  const rawNotebooks = Array.isArray(source.notebooks) ? source.notebooks : [];
  for (let notebookIndex = 0; notebookIndex < rawNotebooks.length; notebookIndex += 1) {
    const rawNotebook = rawNotebooks[notebookIndex] as {
      notebookId?: unknown;
      title?: unknown;
      notebookName?: unknown;
      notebookNameStatus?: unknown;
      icon?: unknown;
      sort?: unknown;
      sortMode?: unknown;
      closed?: unknown;
      docCount?: unknown;
      roots?: unknown;
      truncated?: unknown;
    };
    const roots: PlannerVisibleKnowledgeMapNode[] = [];
    if (Array.isArray(rawNotebook.roots)) {
      for (const root of rawNotebook.roots) {
        const safeRoot = cloneSafeNodeFromRaw(root, sourceMapping, state);
        if (safeRoot) roots.push(safeRoot);
      }
    }
    // 无过滤时保留所有 notebook（即使 roots 为空也反映结构）；有过滤时跳过空 notebook
    if (roots.length === 0 && filter) continue;
    const safeNotebookId = typeof rawNotebook.notebookId === "string" && rawNotebook.notebookId.trim()
      ? rawNotebook.notebookId.trim()
      : undefined;
    if (!safeNotebookId) continue;
    const notebookName = typeof rawNotebook.notebookName === "string" && rawNotebook.notebookName.trim()
      ? rawNotebook.notebookName.trim()
      : undefined;
    const safeNotebook: PlannerVisibleKnowledgeMapNotebook = {
      notebookId: safeNotebookId,
      title: typeof rawNotebook.title === "string" && rawNotebook.title.trim()
        ? rawNotebook.title
        : safeNotebookId,
      docCount: typeof rawNotebook.docCount === "number" && Number.isInteger(rawNotebook.docCount)
        ? rawNotebook.docCount
        : roots.length,
      roots,
      truncated: rawNotebook.truncated === true,
    };
    if (notebookName) safeNotebook.notebookName = notebookName;
    if (rawNotebook.notebookNameStatus === "available" || rawNotebook.notebookNameStatus === "unavailable") {
      safeNotebook.notebookNameStatus = rawNotebook.notebookNameStatus;
    }
    if (typeof rawNotebook.icon === "string") safeNotebook.icon = rawNotebook.icon;
    if (typeof rawNotebook.sort === "number") safeNotebook.sort = rawNotebook.sort;
    if (typeof rawNotebook.sortMode === "number") safeNotebook.sortMode = rawNotebook.sortMode;
    if (typeof rawNotebook.closed === "boolean") safeNotebook.closed = rawNotebook.closed;
    notebooks.push(safeNotebook);
  }

  const totalNodeCount = typeof source.totalNodeCount === "number" && Number.isInteger(source.totalNodeCount)
    ? source.totalNodeCount
    : state.returnedNodeCount;

  return {
    safeOutput: {
      mode: "tree",
      view: "subtree",
      resultScope: "subtree",
      notebooks,
      totalNodeCount,
      returnedNodeCount: state.returnedNodeCount,
      truncated: source.truncated === true || totalNodeCount > state.returnedNodeCount,
      hasMore: source.truncated === true || totalNodeCount > state.returnedNodeCount,
    },
  };
}

function buildListSafeOutput(
  deps: KbRetrievalToolDeps,
  args: ListKnowledgeMapInput,
  sourceMapping: KnowledgeDocResource[],
): { safeOutput: ListKnowledgeMapOutput } {
  const filter = resolveFilterSpec(deps, args, sourceMapping);
  const limit = Math.max(1, Math.min(args.limit ?? args.maxNodes ?? 120, 500));

  // 校验 rootDocId 是否存在于 mapping 中
  if (args.rootDocId) {
    const rootExists = sourceMapping.some((m) => m.internalDocId === args.rootDocId);
    if (!rootExists) {
      return {
        safeOutput: {
          mode: "list",
          view: "list",
          resultScope: "list",
          notebooks: [],
          docs: [],
          totalNodeCount: 0,
          returnedNodeCount: 0,
          returnedDocCount: 0,
          truncated: false,
          hasMore: false,
          error: {
            code: "resource_not_found",
            message: `rootDocId "${args.rootDocId}" 在当前范围内不存在。`,
            hint: "请确认 rootDocId 是否来自当前可见范围内的真实文档 ID。",
          },
        },
      };
    }
  }

  // 校验 notebookId 是否有对应的 mapping
  if (args.notebookId) {
    const notebookExists = sourceMapping.some((m) => m.box === args.notebookId);
    if (!notebookExists) {
      throw new Error(`[resource_not_found] notebookId "${args.notebookId}" 在当前范围内不存在。请使用工具返回的真实 notebookId。`);
    }
  }

  const filtered = sourceMapping.filter((mapping) => matchesFilter(mapping, filter));
  const page = pageItems(filtered, limit, args.cursor);
  const selected = page.items;
  const docs: PlannerVisibleKnowledgeMapNode[] = [];

  for (const mapping of selected) {
    docs.push(resourceToNode(mapping));
  }

  const zeroError = filtered.length === 0
    ? { code: "empty_scope" as const, message: "当前范围下没有匹配的文档。", hint: "请检查参数是否正确，或改用 notebooks 查看所有笔记本。" }
    : undefined;

  return {
    safeOutput: {
      mode: "list",
      notebooks: [],
      docs,
      totalNodeCount: filtered.length,
      returnedNodeCount: docs.length,
      returnedDocCount: docs.length,
      truncated: page.hasMore,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      resultScope: "list",
      error: zeroError,
    },
  };
}

function collectTreeNodes(notebooks: PlannerVisibleKnowledgeMapNotebook[]): PlannerVisibleKnowledgeMapNode[] {
  const nodes: PlannerVisibleKnowledgeMapNode[] = [];
  const visit = (node: PlannerVisibleKnowledgeMapNode) => {
    nodes.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  for (const notebook of notebooks) {
    for (const root of notebook.roots) visit(root);
  }
  return nodes;
}

function filterNotebook(
  notebook: PlannerVisibleKnowledgeMapNotebook,
  args: ListKnowledgeMapInput,
): boolean {
  if (args.notebookId && notebook.notebookId !== args.notebookId) return false;
  if (!args.includeClosedNotebooks && notebook.closed === true) return false;
  return true;
}

function cloneNotebookMeta(notebook: PlannerVisibleKnowledgeMapNotebook, roots: PlannerVisibleKnowledgeMapNode[]): PlannerVisibleKnowledgeMapNotebook {
  return {
    notebookId: notebook.notebookId,
    title: notebook.title,
    notebookName: notebook.notebookName,
    notebookNameStatus: notebook.notebookNameStatus,
    icon: notebook.icon,
    sort: notebook.sort,
    sortMode: notebook.sortMode,
    closed: notebook.closed,
    docCount: notebook.docCount,
    roots,
    truncated: notebook.truncated,
  };
}

function buildPagedDocsOutput(
  view: KnowledgeMapView,
  docs: KnowledgeDocResource[],
  args: ListKnowledgeMapInput,
  zeroError?: { code: "empty_children" | "empty_scope"; message: string; hint: string },
): { safeOutput: ListKnowledgeMapOutput; nodesForRelations: PlannerVisibleKnowledgeMapNode[] } {
  const page = pageItems(docs, args.limit ?? 50, args.cursor);
  const nodes = page.items.map((mapping) => resourceToNode(mapping));
  return {
    safeOutput: {
      mode: view === "list" ? "list" : "tree",
      view,
      resultScope: view,
      notebooks: [],
      docs: nodes,
      totalNodeCount: page.total,
      returnedNodeCount: nodes.length,
      returnedDocCount: nodes.length,
      truncated: page.hasMore,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      error: docs.length === 0 && zeroError ? zeroError : undefined,
    },
    nodesForRelations: nodes,
  };
}

function buildNotebookSummaryOutput(
  sourceOutput: { notebooks: PlannerVisibleKnowledgeMapNotebook[] },
  args: ListKnowledgeMapInput,
): { safeOutput: ListKnowledgeMapOutput; nodesForRelations: PlannerVisibleKnowledgeMapNode[] } {
  const filtered = sourceOutput.notebooks.filter((notebook) => filterNotebook(notebook, args));
  const page = pageItems(filtered, args.limit ?? 50, args.cursor);
  const notebooks = page.items.map((notebook) => cloneNotebookMeta(notebook, []));
  return {
    safeOutput: {
      mode: "tree",
      view: "notebooks",
      resultScope: "notebooks",
      notebooks,
      totalNodeCount: filtered.length,
      returnedNodeCount: notebooks.length,
      truncated: page.hasMore,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
    nodesForRelations: [],
  };
}

function buildNotebookRootsOutput(
  sourceOutput: { notebooks: PlannerVisibleKnowledgeMapNotebook[] },
  args: ListKnowledgeMapInput,
): { safeOutput: ListKnowledgeMapOutput; nodesForRelations: PlannerVisibleKnowledgeMapNode[] } {
  const filtered = sourceOutput.notebooks.filter((notebook) => filterNotebook(notebook, args));
  const page = pageItems(filtered, args.limit ?? 50, args.cursor);
  const relationNodes: PlannerVisibleKnowledgeMapNode[] = [];
  const notebooks = page.items.map((notebook) => {
    const roots = notebook.roots.map((root) => {
      const node: PlannerVisibleKnowledgeMapNode = { ...root, children: undefined, canReadContent: true, nodeKind: "document" };
      relationNodes.push(node);
      return node;
    });
    return cloneNotebookMeta(notebook, roots);
  });
  return {
    safeOutput: {
      mode: "tree",
      view: "notebook_roots",
      resultScope: "notebook_roots",
      notebooks,
      totalNodeCount: filtered.length,
      returnedNodeCount: relationNodes.length,
      truncated: page.hasMore,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
    nodesForRelations: relationNodes,
  };
}

function buildChildrenOutput(
  sourceMapping: KnowledgeDocResource[],
  args: ListKnowledgeMapInput,
): { safeOutput: ListKnowledgeMapOutput; nodesForRelations: PlannerVisibleKnowledgeMapNode[] } {
  let docs: KnowledgeDocResource[];
  if (args.rootDocId) {
    docs = sourceMapping.filter((mapping) => isDirectChild(mapping, args.rootDocId!));
  } else if (args.notebookId) {
    docs = sourceMapping.filter((mapping) => mapping.box === args.notebookId && isNotebookRoot(mapping));
  } else {
    docs = sourceMapping.filter((mapping) => isNotebookRoot(mapping));
  }
  const zeroError = docs.length === 0
    ? args.rootDocId
      ? { code: "empty_children" as const, message: `该文档没有子文档。`, hint: "请确认 rootDocId 是否正确，或改用 subtree/neighborhood 查看更广范围。" }
      : { code: "empty_scope" as const, message: `当前范围下没有根文档。`, hint: "请检查 notebookId 是否正确，或改用 notebooks 查看所有笔记本。" }
    : undefined;
  return buildPagedDocsOutput("children", docs, args, zeroError);
}

function buildSubtreeOutput(
  sourceMapping: KnowledgeDocResource[],
  args: ListKnowledgeMapInput,
): { safeOutput: ListKnowledgeMapOutput; nodesForRelations: PlannerVisibleKnowledgeMapNode[] } {
  let docs = sourceMapping;
  if (args.rootDocId) {
    docs = collectDescendants(sourceMapping, args.rootDocId, args.maxDepth ?? 2);
  } else if (args.notebookId) {
    docs = sourceMapping.filter((mapping) => mapping.box === args.notebookId && mapping.depth <= (args.maxDepth ?? 2));
  } else {
    docs = sourceMapping.filter((mapping) => mapping.depth <= (args.maxDepth ?? 2));
  }
  const zeroError = docs.length === 0
    ? args.rootDocId
      ? { code: "empty_children" as const, message: `该文档在指定深度内没有子文档。`, hint: "请确认 rootDocId 是否正确，或增大 maxDepth。" }
      : { code: "empty_scope" as const, message: `当前范围下没有文档。`, hint: "请检查 notebookId 是否正确，或改用 notebooks 查看所有笔记本。" }
    : undefined;
  return buildPagedDocsOutput("subtree", docs, args, zeroError);
}

function buildNeighborhoodOutput(
  sourceMapping: KnowledgeDocResource[],
  args: ListKnowledgeMapInput,
): { safeOutput: ListKnowledgeMapOutput; nodesForRelations: PlannerVisibleKnowledgeMapNode[] } {
  const centerDocId = args.centerDocId ?? args.rootDocId;
  const center = findMappingByDocId(sourceMapping, centerDocId);
  if (!center) {
    return {
      safeOutput: {
        mode: "tree",
        view: "neighborhood",
        resultScope: "neighborhood",
        notebooks: [],
        docs: [],
        totalNodeCount: 0,
        returnedNodeCount: 0,
        returnedDocCount: 0,
        truncated: false,
        hasMore: false,
        error: {
          code: "resource_not_found",
          message: `centerDocId "${centerDocId ?? ""}" 在当前范围内不存在。`,
          hint: "请使用当前工具结果中明确返回的 docId 作为 centerDocId。",
        },
      },
      nodesForRelations: [],
    };
  }
  const parent = center.parentDocId ? findMappingByDocId(sourceMapping, center.parentDocId) : undefined;
  const siblings = center.parentDocId
    ? sourceMapping.filter((mapping) => mapping.parentDocId === center.parentDocId && mapping.internalDocId !== center.internalDocId)
    : sourceMapping.filter((mapping) => mapping.box === center.box && isNotebookRoot(mapping) && mapping.internalDocId !== center.internalDocId);
  const children = sourceMapping.filter((mapping) => isDirectChild(mapping, center.internalDocId));
  const docs = [parent, center, ...siblings, ...children].filter((item): item is KnowledgeDocResource => !!item);
  return buildPagedDocsOutput("neighborhood", docs, args);
}

export async function executeListKnowledgeMap(
  deps: KbRetrievalToolDeps,
  args: ListKnowledgeMapInput,
): Promise<{
  safeOutput: ListKnowledgeMapOutput;
}> {
  const scope = deps.getScope();
  if (!scope) {
    throw new Error("Scope not available.");
  }
  const view = resolveView(args);

  const result = await buildKnowledgeMap({
    scope,
    maxDepth: args.maxDepth,
    maxNodes: Math.max(args.limit ?? 50, args.maxNodes ?? 120),
  });

  let output: { safeOutput: ListKnowledgeMapOutput; nodesForRelations?: PlannerVisibleKnowledgeMapNode[] };
  switch (view) {
    case "notebooks":
      output = buildNotebookSummaryOutput(result.safeOutput, args);
      break;
    case "notebook_roots":
      output = buildNotebookRootsOutput(result.safeOutput, args);
      break;
    case "children":
      output = buildChildrenOutput(result.internalMapping, args);
      break;
    case "subtree":
      output = args.mode === "tree" && !args.cursor
        ? { ...buildTreeSafeOutput(deps, args, result.safeOutput, result.internalMapping), nodesForRelations: [] }
        : buildSubtreeOutput(result.internalMapping, args);
      break;
    case "neighborhood":
      output = buildNeighborhoodOutput(result.internalMapping, args);
      break;
    case "list":
    default:
      output = buildListSafeOutput(deps, args, result.internalMapping);
      break;
  }

  const nodesForRelations = output.nodesForRelations && output.nodesForRelations.length > 0
    ? output.nodesForRelations
    : collectTreeNodes(output.safeOutput.notebooks);
  const linkedDocsErrorCount = await attachLinkedDocsToNodes(
    nodesForRelations,
    args.includeLinkedDocs === true,
    args.relationLimit ?? 5,
  );
  const tagResult = await attachTagsToNodes(
    nodesForRelations,
    args.includeTags === true,
    args.tagLimit ?? 20,
  );
  output.safeOutput.notebookApiLoaded = result.safeOutput.notebookApiLoaded;
  output.safeOutput.notebookCount = result.safeOutput.notebookCount;
  output.safeOutput.missingNotebookNameCount = result.safeOutput.missingNotebookNameCount;
  output.safeOutput.linkedDocsRequested = args.includeLinkedDocs === true;
  output.safeOutput.linkedDocsErrorCount = linkedDocsErrorCount;
  output.safeOutput.tagStatus = tagResult.status;
  output.safeOutput.taggedNodeCount = tagResult.taggedNodeCount;
  output.safeOutput.tagErrorCount = tagResult.tagErrorCount;

  console.info("[KB-AGENT | LIST_KNOWLEDGE_MAP_LOADED]", {
    mode: output.safeOutput.mode ?? "tree",
    view: output.safeOutput.view,
    resultScope: output.safeOutput.resultScope,
    returnedNodeCount: output.safeOutput.returnedNodeCount,
    notebookCount: output.safeOutput.notebooks.length,
    hasMore: output.safeOutput.hasMore,
    notebookApiLoaded: output.safeOutput.notebookApiLoaded,
    sourceNotebookCount: output.safeOutput.notebookCount,
    missingNotebookNameCount: output.safeOutput.missingNotebookNameCount,
    linkedDocsRequested: output.safeOutput.linkedDocsRequested,
    linkedDocsErrorCount: output.safeOutput.linkedDocsErrorCount,
    tagStatus: output.safeOutput.tagStatus,
    taggedNodeCount: output.safeOutput.taggedNodeCount,
    tagErrorCount: output.safeOutput.tagErrorCount,
    internalMappingCount: result.internalMapping.length,
    hasError: !!output.safeOutput.error,
    sourceNotebooksCount: Array.isArray((result.safeOutput as { notebooks?: unknown })?.notebooks)
      ? ((result.safeOutput as { notebooks?: unknown[] }).notebooks?.length ?? 0)
      : 0,
  });

  return output;
}
