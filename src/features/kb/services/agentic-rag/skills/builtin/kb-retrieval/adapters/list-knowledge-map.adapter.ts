/**
 * list_knowledge_map adapter: 调用底层 knowledge-map-reader 获取安全图谱输出。
 */

import { buildKnowledgeMap } from "../../../../tools/readers/knowledge-map-reader";
import type { KnowledgeDocHandleMapping } from "../../../../tools/knowledge-map-types";
import type { KbRetrievalToolDeps } from "./kb-retrieval-tool-deps";
import type {
  ListKnowledgeMapInput,
  ListKnowledgeMapOutput,
  PlannerVisibleKnowledgeMapNode,
  PlannerVisibleKnowledgeMapNotebook,
} from "../schemas/list-knowledge-map.schema";

const SIYUAN_BLOCK_ID_PATTERN = /\d{14}-[a-z0-9]{7}/i;
const HEX_32_PATTERN = /\b[0-9a-f]{32}\b/i;
const PATH_SEPARATOR_PATTERN = /[\\/]/;
const SY_FILE_PATTERN = /\.sy\b/i;

function sanitizePlannerTitle(value: unknown): string {
  if (typeof value !== "string") return "Untitled";
  const title = value.trim();
  if (!title) return "Untitled";
  if (SIYUAN_BLOCK_ID_PATTERN.test(title)) return "Untitled";
  if (HEX_32_PATTERN.test(title)) return "Untitled";
  if (PATH_SEPARATOR_PATTERN.test(title)) return "Untitled";
  if (SY_FILE_PATTERN.test(title)) return "Untitled";
  return title.slice(0, 80);
}

function cloneSafeNode(
  node: unknown,
  state: {
    nextNodeIndex: number;
    mappingByHandle: Map<string, KnowledgeDocHandleMapping>;
    remapped: KnowledgeDocHandleMapping[];
    returnedNodeCount: number;
  },
): PlannerVisibleKnowledgeMapNode | null {
  if (!node || typeof node !== "object") return null;
  const raw = node as {
    handle?: unknown;
    title?: unknown;
    depth?: unknown;
    childCount?: unknown;
    children?: unknown;
    truncatedChildren?: unknown;
  };

  const handle = `km_${state.nextNodeIndex++}`;
  const originalHandle = typeof raw.handle === "string" ? raw.handle : undefined;
  const originalMapping = originalHandle ? state.mappingByHandle.get(originalHandle) : undefined;
  if (originalMapping) {
    state.remapped.push({ ...originalMapping, handle });
  }

  state.returnedNodeCount += 1;

  const children: PlannerVisibleKnowledgeMapNode[] = [];
  if (Array.isArray(raw.children)) {
    for (const child of raw.children) {
      const safeChild = cloneSafeNode(child, state);
      if (safeChild) children.push(safeChild);
    }
  }

  const safeNode: PlannerVisibleKnowledgeMapNode = {
    handle,
    title: sanitizePlannerTitle(raw.title),
    depth: typeof raw.depth === "number" && Number.isInteger(raw.depth) ? raw.depth : 0,
    childCount: typeof raw.childCount === "number" && Number.isInteger(raw.childCount)
      ? raw.childCount
      : children.length,
  };
  if (children.length > 0) safeNode.children = children;
  if (raw.truncatedChildren === true) safeNode.truncatedChildren = true;
  return safeNode;
}

function buildSafeOutput(
  sourceOutput: unknown,
  sourceMapping: KnowledgeDocHandleMapping[],
): { safeOutput: ListKnowledgeMapOutput; internalMapping: KnowledgeDocHandleMapping[] } {
  const source = sourceOutput as {
    notebooks?: unknown;
    totalNodeCount?: unknown;
    truncated?: unknown;
  };
  const mappingByHandle = new Map(sourceMapping.map((m) => [m.handle, m]));
  const state = {
    nextNodeIndex: 0,
    mappingByHandle,
    remapped: [] as KnowledgeDocHandleMapping[],
    returnedNodeCount: 0,
  };

  const notebooks: PlannerVisibleKnowledgeMapNotebook[] = [];
  const rawNotebooks = Array.isArray(source.notebooks) ? source.notebooks : [];
  for (let notebookIndex = 0; notebookIndex < rawNotebooks.length; notebookIndex += 1) {
    const rawNotebook = rawNotebooks[notebookIndex] as {
      docCount?: unknown;
      roots?: unknown;
      truncated?: unknown;
    };
    const roots: PlannerVisibleKnowledgeMapNode[] = [];
    if (Array.isArray(rawNotebook.roots)) {
      for (const root of rawNotebook.roots) {
        const safeRoot = cloneSafeNode(root, state);
        if (safeRoot) roots.push(safeRoot);
      }
    }
    notebooks.push({
      handle: `nb_${notebookIndex}`,
      title: `Notebook ${notebookIndex + 1}`,
      docCount: typeof rawNotebook.docCount === "number" && Number.isInteger(rawNotebook.docCount)
        ? rawNotebook.docCount
        : roots.length,
      roots,
      truncated: rawNotebook.truncated === true,
    });
  }

  const totalNodeCount = typeof source.totalNodeCount === "number" && Number.isInteger(source.totalNodeCount)
    ? source.totalNodeCount
    : state.returnedNodeCount;

  return {
    safeOutput: {
      notebooks,
      totalNodeCount,
      returnedNodeCount: state.returnedNodeCount,
      truncated: source.truncated === true || totalNodeCount > state.returnedNodeCount,
    },
    internalMapping: state.remapped,
  };
}

export async function executeListKnowledgeMap(
  deps: KbRetrievalToolDeps,
  args: ListKnowledgeMapInput,
): Promise<{
  safeOutput: ListKnowledgeMapOutput;
  internalMapping: KnowledgeDocHandleMapping[];
}> {
  const scope = deps.getScope();
  if (!scope) {
    throw new Error("Scope not available.");
  }

  const result = await buildKnowledgeMap({
    scope,
    maxDepth: args.maxDepth,
    maxNodes: args.maxNodes,
  });

  return buildSafeOutput(result.safeOutput, result.internalMapping);
}
