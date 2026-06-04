/**
 * Knowledge Map Reader
 *
 * 文档图谱读取器：构建文档层级结构。
 *
 * 职责：
 * - 根据 scope 枚举文档
 * - 按 box 分组，根据 path 解析层级
 * - 构建真实 docId 映射（不生成 opaque identifier）
 * - 返回完整的文档树结构，供 AI planner 判断相关性
 * - 不读取正文，只返回标题和层级信息
 */

import type { AgenticDocLite } from "../doc-types";
import { listDocsForAgenticRag } from "./list-docs";
import type { AgentScope } from "../../scope/types";
import { lsNotebooksReadonly } from "../../../siyuan/read-only-kernel";
import type {
  KnowledgeMapNode,
  KnowledgeMapNotebook,
  ListKnowledgeMapSafeOutput,
  ListKnowledgeMapInternalOutput,
  KnowledgeDocResource,
} from "../knowledge-map-types";

interface InternalTreeNode {
  docId: string;
  title: string;
  titlePath?: string;
  box?: string;
  path?: string;
  depth: number;
  parentDocId?: string;
  siblingCount?: number;
  childCount: number;
  children: InternalTreeNode[];
}

interface NotebookMeta {
  notebookId: string;
  notebookName?: string;
  icon?: string;
  sort?: number;
  sortMode?: number;
  closed?: boolean;
}

interface BuildKnowledgeMapParams {
  scope: AgentScope;
  maxDepth?: number;
  maxNodes?: number;
  includeAncestors?: boolean;
  includeChildrenPreview?: boolean;
  trace?: boolean;
}

const SIYUAN_BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/i;
const BLOCK_ID_HEX_RE = /^[0-9a-f]{14,}$/i;
const PATH_SEPARATOR_RE = /[\\/]/;
const SY_EXTENSION_RE = /\.sy$/;

function sanitizeTitleForPlanner(title: string): string {
  if (SIYUAN_BLOCK_ID_RE.test(title)) return "Untitled";
  if (BLOCK_ID_HEX_RE.test(title)) return "Untitled";
  if (PATH_SEPARATOR_RE.test(title)) return "Untitled";
  if (SY_EXTENSION_RE.test(title)) return "Untitled";
  return title;
}

function parseDocIdFromPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

async function loadNotebookMetaMap(): Promise<{
  notebookApiLoaded: boolean;
  notebooks: Map<string, NotebookMeta>;
}> {
  try {
    const result = await lsNotebooksReadonly();
    const notebooks = new Map<string, NotebookMeta>();
    const source = Array.isArray(result?.notebooks) ? result.notebooks : [];
    for (const notebook of source) {
      if (!notebook?.id) continue;
      const raw = notebook as Notebook & { sortMode?: number };
      notebooks.set(raw.id, {
        notebookId: raw.id,
        notebookName: raw.name,
        icon: raw.icon,
        sort: raw.sort,
        sortMode: raw.sortMode,
        closed: raw.closed,
      });
    }
    return { notebookApiLoaded: true, notebooks };
  } catch {
    return { notebookApiLoaded: false, notebooks: new Map() };
  }
}

function buildDocTree(docs: AgenticDocLite[]): Map<string, InternalTreeNode[]> {
  const boxGroups = new Map<string, AgenticDocLite[]>();
  for (const doc of docs) {
    const box = doc.box || "";
    if (!box) continue;
    if (!boxGroups.has(box)) {
      boxGroups.set(box, []);
    }
    boxGroups.get(box)!.push(doc);
  }

  const result = new Map<string, InternalTreeNode[]>();

  for (const [box, boxDocs] of boxGroups) {
    const nodeMap = new Map<string, InternalTreeNode>();
    const rootNodes: InternalTreeNode[] = [];

    for (const doc of boxDocs) {
      nodeMap.set(doc.docId, {
        docId: doc.docId,
        title: doc.title || "未命名文档",
        titlePath: doc.titlePath,
        box: doc.box,
        path: doc.path,
        depth: 0,
        childCount: 0,
        children: [],
      });
    }

    for (const doc of boxDocs) {
      const node = nodeMap.get(doc.docId)!;
      if (!doc.path) {
        rootNodes.push(node);
        continue;
      }

      const pathParts = parseDocIdFromPath(doc.path);
      const parentIdx = pathParts.length - 2;

      if (parentIdx >= 0) {
        const parentId = pathParts[parentIdx];
        const parentNode = nodeMap.get(parentId);
        if (parentNode) {
          parentNode.children.push(node);
          parentNode.childCount = parentNode.children.length;
          node.depth = parentNode.depth + 1;
          node.parentDocId = parentNode.docId;
        } else {
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    }

    for (const node of nodeMap.values()) {
      if (node.parentDocId) {
        const parentNode = nodeMap.get(node.parentDocId);
        node.siblingCount = parentNode ? Math.max(0, parentNode.children.length - 1) : 0;
      } else {
        node.siblingCount = Math.max(0, rootNodes.length - 1);
      }
    }

    result.set(box, rootNodes);
  }

  return result;
}

function truncateTree(
  node: InternalTreeNode,
  maxDepth: number,
  maxNodes: number,
  currentCount: { value: number },
): KnowledgeMapNode | null {
  if (currentCount.value >= maxNodes) {
    return null;
  }

  if (node.depth > maxDepth) {
    return null;
  }

  currentCount.value++;

  const children: KnowledgeMapNode[] = [];
  const truncatedChildren = node.children.length > 0 && node.depth + 1 > maxDepth;

  if (!truncatedChildren) {
    for (const child of node.children) {
      if (currentCount.value >= maxNodes) {
        break;
      }
      const childNode = truncateTree(child, maxDepth, maxNodes, currentCount);
      if (childNode) {
        children.push(childNode);
      }
    }
  }

  return {
    docId: node.docId,
    sourceType: "siyuan_doc",
    title: sanitizeTitleForPlanner(node.title),
    depth: node.depth,
    childCount: node.childCount,
    parentDocId: node.parentDocId,
    siblingCount: node.siblingCount,
    children: children.length > 0 ? children : undefined,
    truncatedChildren: truncatedChildren || (node.children.length > children.length),
  };
}

/**
 * 从树节点构建 KnowledgeDocResource 映射。
 * 直接使用真实 docId，不生成 identifier。
 */
function buildResourceMappingFromTree(
  node: InternalTreeNode,
  mapping: KnowledgeDocResource[],
): void {
  mapping.push({
    internalDocId: node.docId,
    title: node.title,
    titlePath: node.titlePath,
    box: node.box,
    path: node.path,
    depth: node.depth,
    parentDocId: node.parentDocId,
    siblingCount: node.siblingCount,
    childCount: node.childCount,
    source: "knowledge_map",
  });

  for (const child of node.children) {
    buildResourceMappingFromTree(child, mapping);
  }
}

function buildNotebooksFromTrees(
  trees: Map<string, InternalTreeNode[]>,
  maxDepth: number,
  maxNodes: number,
  notebookMetaMap: Map<string, NotebookMeta>,
): {
  notebooks: KnowledgeMapNotebook[];
  totalNodeCount: number;
  returnedNodeCount: number;
  mapping: KnowledgeDocResource[];
  missingNotebookNameCount: number;
} {
  const notebooks: KnowledgeMapNotebook[] = [];
  const mapping: KnowledgeDocResource[] = [];
  let totalNodeCount = 0;
  let returnedNodeCount = 0;
  let missingNotebookNameCount = 0;

  for (const [box, roots] of trees) {
    const notebookNodes: KnowledgeMapNode[] = [];
    let notebookTotal = 0;

    for (const root of roots) {
      const countNodes = (n: InternalTreeNode): number => {
        let count = 1;
        for (const c of n.children) count += countNodes(c);
        return count;
      };
      notebookTotal += countNodes(root);

      const counter = { value: 0 };
      const safeNode = truncateTree(root, maxDepth, maxNodes - returnedNodeCount, counter);
      if (safeNode) {
        buildResourceMappingFromTree(root, mapping);
        returnedNodeCount += counter.value;
        notebookNodes.push(safeNode);
      }
    }

    totalNodeCount += notebookTotal;

    if (notebookNodes.length > 0) {
      // 使用真实 box ID 作为 notebookId，标题取第一个根文档标题或 "Notebook"
      const notebookMeta = notebookMetaMap.get(box);
      const notebookName = notebookMeta?.notebookName?.trim() || undefined;
      if (!notebookName) missingNotebookNameCount += 1;
      notebooks.push({
        notebookId: box,
        title: notebookName ?? box,
        notebookName,
        notebookNameStatus: notebookName ? "available" : "unavailable",
        icon: notebookMeta?.icon,
        sort: notebookMeta?.sort,
        sortMode: notebookMeta?.sortMode,
        closed: notebookMeta?.closed,
        docCount: notebookTotal,
        roots: notebookNodes,
        truncated: notebookTotal > returnedNodeCount,
      });
    }
  }

  return { notebooks, totalNodeCount, returnedNodeCount, mapping, missingNotebookNameCount };
}

export async function buildKnowledgeMap(
  params: BuildKnowledgeMapParams
): Promise<ListKnowledgeMapInternalOutput> {
  const {
    scope,
    maxDepth = 3,
    maxNodes = 120,
    trace,
  } = params;

  const docs = await listDocsForAgenticRag({
    scope,
    limit: maxNodes * 3,
    trace,
  });

  const { notebookApiLoaded, notebooks: notebookMetaMap } = await loadNotebookMetaMap();
  const trees = buildDocTree(docs);

  const { notebooks, totalNodeCount, returnedNodeCount, mapping, missingNotebookNameCount } =
    buildNotebooksFromTrees(trees, maxDepth, maxNodes, notebookMetaMap);

  const safeOutput: ListKnowledgeMapSafeOutput = {
    notebooks,
    totalNodeCount,
    returnedNodeCount,
    truncated: totalNodeCount > returnedNodeCount,
    notebookApiLoaded,
    notebookCount: notebookMetaMap.size,
    missingNotebookNameCount,
  };

  return {
    safeOutput,
    internalMapping: mapping,
  };
}
