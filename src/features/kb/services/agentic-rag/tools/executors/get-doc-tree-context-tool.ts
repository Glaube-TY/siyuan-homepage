/**
 * Get Doc Tree Context Tool Executor
 *
 * Agentic RAG 只读工具：基于已知文档 handle 获取其文档树邻近结构，产生可读取候选。
 *
 * 职责：
 * - 从 anchorRefs/anchorIndexes 在 workspace 内部解析 docId
 * - 可解析来源：workspace.candidateDocs、workspace.readDocuments、workspace.conversationUsedReferences
 * - 使用只读 SQL 查询 blocks 表，基于 path 计算文档树关系
 * - 返回 safe result：treeCandidateHandles、docTitle、relation、depth、sourceAnchorHandle
 * - result 里不得包含真实 docId/path/box/blockId
 * - 内部 workspace 可以保存 handle -> docId 映射，用于后续 read_candidate_docs 读取
 * - 日志 DOC_TREE_CONTEXT_LOADED_SAFE 只输出安全计数，不输出真实 ID
 * - 不读取正文，不检索全文，不直接作为证据
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import type { EvidenceWorkspace } from "../../workspace/evidence-workspace";
import { safeSqlSelect, escapeSqlString } from "@/features/kb/services/siyuan/safe-sql";
import {
  parseDocIdPath,
  getParentDocIdFromPath,
  isDirectChildPath,
  isSiblingPath,
  isDescendantPath,
} from "@/features/kb/services/doc-graph/path-utils";

const GetDocTreeContextArgsSchema = z.object({
  anchorRefs: z.array(z.string()).optional(),
  anchorIndexes: z.array(z.number()).optional(),
  includeParent: z.boolean().optional(),
  includeSiblings: z.boolean().optional(),
  includeChildren: z.boolean().optional(),
  includeDescendants: z.boolean().optional(),
  maxDepth: z.number().optional(),
  maxItems: z.number().optional(),
});

interface TreeContextCandidate {
  internalDocId: string;
  title: string;
  box?: string;
  path?: string;
  relation: "parent" | "sibling" | "child" | "descendant" | "self";
  depth: number;
  sourceAnchorHandle: string;
}

interface BlockRow {
  id: string;
  root_id: string;
  parent_id: string;
  box: string;
  path: string;
  type: string;
  content: string;
  hpath: string;
}

function resolveAnchorDocIds(
  workspace: EvidenceWorkspace,
  followUpContextPreviousReferenceDocIds: string[] | undefined,
  anchorRefs?: string[],
  anchorIndexes?: number[],
  maxAnchors: number = 10
): Map<string, string> {
  const handleToDocId = new Map<string, string>();

  const allCandidates = workspace.candidateDocs;
  const allReadDocs = workspace.readDocuments;
  const allRefs = workspace.conversationUsedReferences ?? [];

  for (const doc of allCandidates) {
    const handle = (doc as any).evidenceHandle ?? (doc as any).handle;
    if (handle) {
      handleToDocId.set(handle, doc.docId);
    }
  }

  for (const doc of allReadDocs) {
    const handle = (doc as any).evidenceHandle ?? (doc as any).handle;
    if (handle) {
      handleToDocId.set(handle, doc.docId);
    }
  }

  for (const turnRef of allRefs) {
    for (const ref of turnRef.references ?? []) {
      if (ref.referenceHandle && ref.internalDocId) {
        handleToDocId.set(ref.referenceHandle, ref.internalDocId);
      }
    }
  }

  for (const m of (workspace.docHandleMappings ?? [])) {
    if (m.handle && m.internalDocId && !handleToDocId.has(m.handle)) {
      handleToDocId.set(m.handle, m.internalDocId);
    }
  }

  const resolvedDocIds = new Set<string>();
  const resolvedAnchors = new Map<string, string>();

  if (anchorRefs && anchorRefs.length > 0) {
    for (const ref of anchorRefs) {
      const docId = handleToDocId.get(ref);
      if (docId) {
        resolvedDocIds.add(docId);
        resolvedAnchors.set(docId, ref);
      }
    }
  }

  if (anchorIndexes && anchorIndexes.length > 0) {
    const allDocs = [...allCandidates, ...allReadDocs];
    for (const idx of anchorIndexes) {
      if (idx >= 0 && idx < allDocs.length) {
        const doc = allDocs[idx];
        if (doc && doc.docId) {
          resolvedDocIds.add(doc.docId);
          const handle = (doc as any).evidenceHandle ?? (doc as any).handle ?? `index_${idx}`;
          resolvedAnchors.set(doc.docId, handle);
        }
      }
    }
  }

  if (resolvedAnchors.size === 0) {
    for (const doc of allReadDocs) {
      if (resolvedAnchors.size >= maxAnchors) break;
      const provenance = (doc as any).provenance;
      const readSource = (doc as any).readSource;
      if (provenance === "previous_evidence" || provenance === "candidate_docs" ||
          readSource === "previous_evidence" || readSource === "candidate_docs") {
        if (doc.docId && !resolvedDocIds.has(doc.docId)) {
          resolvedDocIds.add(doc.docId);
          const handle = (doc as any).evidenceHandle ?? (doc as any).handle ?? doc.docId;
          resolvedAnchors.set(doc.docId, handle);
        }
      }
    }

    if (resolvedAnchors.size < maxAnchors) {
      for (const turnRef of allRefs) {
        if (resolvedAnchors.size >= maxAnchors) break;
        for (const ref of turnRef.references ?? []) {
          if (resolvedAnchors.size >= maxAnchors) break;
          if (ref.internalDocId && !resolvedDocIds.has(ref.internalDocId)) {
            resolvedDocIds.add(ref.internalDocId);
            resolvedAnchors.set(ref.internalDocId, ref.referenceHandle ?? ref.internalDocId);
          }
        }
      }
    }

    if (resolvedAnchors.size < maxAnchors) {
      const previousReferenceDocIds = followUpContextPreviousReferenceDocIds ?? [];
      for (const docId of previousReferenceDocIds) {
        if (resolvedAnchors.size >= maxAnchors) break;
        if (docId && !resolvedDocIds.has(docId)) {
          resolvedDocIds.add(docId);
          resolvedAnchors.set(docId, docId);
        }
      }
    }

    if (resolvedAnchors.size < maxAnchors) {
      const recentContext = (workspace as any).recentContext;
      if (recentContext?.conversationTurns) {
        for (const turn of recentContext.conversationTurns) {
          if (resolvedAnchors.size >= maxAnchors) break;
          for (const footerRef of turn.footerRefs ?? []) {
            if (resolvedAnchors.size >= maxAnchors) break;
            if (footerRef.docId && !resolvedDocIds.has(footerRef.docId)) {
              resolvedDocIds.add(footerRef.docId);
              resolvedAnchors.set(footerRef.docId, footerRef.docTitle ?? footerRef.docId);
            }
          }
        }
      }
    }
  }

  return resolvedAnchors;
}

async function queryAnchorBlocks(anchorDocIds: string[]): Promise<Map<string, BlockRow>> {
  const anchorRows = new Map<string, BlockRow>();
  let fallbackRootIdHitCount = 0;

  for (const docId of anchorDocIds) {
    try {
      const safeId = escapeSqlString(docId);
      // 优先查询 id 字段
      const stmt = `SELECT id, root_id, parent_id, box, path, type, content, hpath FROM blocks WHERE id='${safeId}' AND type='d' LIMIT 1`;
      const rows = await safeSqlSelect<BlockRow>(stmt, { allowedTables: ["blocks"] });

      if (rows && rows.length > 0) {
        anchorRows.set(docId, rows[0]);
      } else {
        // fallback: 查询 root_id 字段
        const fallbackStmt = `SELECT id, root_id, parent_id, box, path, type, content, hpath FROM blocks WHERE root_id='${safeId}' AND type='d' LIMIT 1`;
        const fallbackRows = await safeSqlSelect<BlockRow>(fallbackStmt, { allowedTables: ["blocks"] });
        if (fallbackRows && fallbackRows.length > 0) {
          anchorRows.set(docId, fallbackRows[0]);
          fallbackRootIdHitCount++;
        }
      }
    } catch {
    }
  }

  console.info("[KB-AGENT | DOC_TREE_ANCHOR_ROWS_SAFE]", {
    anchorCount: anchorDocIds.length,
    anchorRowsFoundCount: anchorRows.size,
    fallbackRootIdHitCount,
    invalidAnchorCount: anchorDocIds.length - anchorRows.size,
  });

  return anchorRows;
}

async function queryAllDocsInBoxes(boxes: string[]): Promise<BlockRow[]> {
  if (boxes.length === 0) return [];

  const safeBoxes = boxes.map(b => `'${escapeSqlString(b)}'`).join(",");
  const stmt = `SELECT id, root_id, parent_id, box, path, type, content, hpath FROM blocks WHERE type='d' AND box IN (${safeBoxes}) LIMIT 500`;

  try {
    return await safeSqlSelect<BlockRow>(stmt, { allowedTables: ["blocks"] });
  } catch {
    return [];
  }
}

function extractTitleFromBlock(row: BlockRow): string {
  if (row.content && row.content.trim()) {
    return row.content.trim();
  }
  if (row.hpath && row.hpath.trim()) {
    const parts = row.hpath.split("/").filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }
  return "未命名文档";
}

async function execute(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const { workspace } = context;

  if (!workspace) {
    return { success: false, error: "get_doc_tree_context 需要 workspace 上下文" };
  }

  const parsed = GetDocTreeContextArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `参数无效：${parsed.error.message}` };
  }

  const inputArgs = parsed.data;
  const includeParent = inputArgs.includeParent ?? true;
  const includeSiblings = inputArgs.includeSiblings ?? true;
  const includeChildren = inputArgs.includeChildren ?? true;
  const includeDescendants = inputArgs.includeDescendants ?? false;
  const maxDepth = Math.min(inputArgs.maxDepth ?? 2, 5);
  const maxItems = Math.min(inputArgs.maxItems ?? 50, 100);

  const requestedAnchorRefCount = inputArgs.anchorRefs?.length ?? 0;
  const requestedAnchorIndexCount = inputArgs.anchorIndexes?.length ?? 0;

  const allReadDocs = workspace.readDocuments;
  const allRefs = workspace.conversationUsedReferences ?? [];

  const resolvedAnchors = resolveAnchorDocIds(workspace, context.followUpContext?.previousReferenceDocIds, inputArgs.anchorRefs, inputArgs.anchorIndexes);
  const anchorDocIds = [...resolvedAnchors.keys()];

  let workspaceReadAnchorCount = 0;
  let conversationRefAnchorCount = 0;
  let previousReferenceAnchorCount = 0;
  let recentFooterAnchorCount = 0;

  if (requestedAnchorRefCount === 0 && requestedAnchorIndexCount === 0) {
    for (const docId of anchorDocIds) {
      const isInReadDocs = allReadDocs.some(d => d.docId === docId);
      const isInRefs = allRefs.some(turnRef => turnRef.references?.some(ref => ref.internalDocId === docId));
      const isInPreviousReference = (context.followUpContext?.previousReferenceDocIds ?? []).includes(docId);
      const isInRecentFooter = (workspace as any).recentContext?.conversationTurns?.some(
        (turn: any) => turn.footerRefs?.some((fr: any) => fr.docId === docId)
      );

      if (isInReadDocs) workspaceReadAnchorCount++;
      if (isInRefs) conversationRefAnchorCount++;
      if (isInPreviousReference) previousReferenceAnchorCount++;
      if (isInRecentFooter) recentFooterAnchorCount++;
    }
  }

  console.info("[KB-AGENT | DOC_TREE_ANCHORS_RESOLVED_SAFE]", {
    requestedAnchorRefCount,
    requestedAnchorIndexCount,
    workspaceReadAnchorCount,
    conversationRefAnchorCount,
    previousReferenceAnchorCount,
    recentFooterAnchorCount,
    finalAnchorCount: anchorDocIds.length,
  });

  if (anchorDocIds.length === 0) {
    return {
      success: false,
      error: "无法解析任何 anchor handle/index 到内部文档 ID",
      warning: "anchorRefs/anchorIndexes 未在 workspace 中找到匹配，且无可用自动解析来源",
    };
  }

  const anchorBlocks = await queryAnchorBlocks(anchorDocIds);
  const anchorRowsFoundCount = anchorBlocks.size;
  const invalidAnchorCount = anchorDocIds.length - anchorRowsFoundCount;

  if (anchorRowsFoundCount === 0) {
    return {
      success: false,
      error: "anchor rows not found",
      warning: "所有 anchor docId 在 blocks 表中均未找到对应行",
    };
  }

  // 收集所有 anchor 的 block id，用于全局排除 anchor 自身
  const finalAnchorDocIds = new Set<string>();
  for (const [docId, row] of anchorBlocks) {
    finalAnchorDocIds.add(docId);
    finalAnchorDocIds.add(row.id);
  }

  const boxes = [...new Set([...anchorBlocks.values()].map(r => r.box).filter(Boolean))];
  const allDocsInBoxes = await queryAllDocsInBoxes(boxes);

  // 使用 Map 按 internalDocId 去重，保留第一个 relation
  const candidatesMap = new Map<string, TreeContextCandidate>();
  const relationCount: Record<string, number> = { parent: 0, sibling: 0, child: 0, descendant: 0 };

  let parentCount = 0;
  let siblingCount = 0;
  let childCount = 0;
  let descendantCount = 0;
  let excludedAnchorSelfCount = 0;

  for (const [anchorDocId, anchorRow] of anchorBlocks) {
    const sourceAnchorHandle = resolvedAnchors.get(anchorDocId) ?? anchorDocId;
    const anchorPath = anchorRow.path;

    if (includeParent) {
      try {
        const parentDocId = getParentDocIdFromPath(anchorPath);
        if (parentDocId) {
          // 排除 anchor 自身
          if (finalAnchorDocIds.has(parentDocId)) {
            excludedAnchorSelfCount++;
          } else if (!candidatesMap.has(parentDocId)) {
            const parentRow = allDocsInBoxes.find(r => r.id === parentDocId);
            if (parentRow) {
              candidatesMap.set(parentDocId, {
                internalDocId: parentDocId,
                title: extractTitleFromBlock(parentRow),
                box: parentRow.box,
                path: parentRow.path,
                relation: "parent",
                depth: 1,
                sourceAnchorHandle,
              });
              parentCount++;
              relationCount.parent++;
            }
          }
        }
      } catch {
      }
    }

    if (includeSiblings) {
      try {
        for (const candidateRow of allDocsInBoxes) {
          // 排除 anchor 自身
          if (finalAnchorDocIds.has(candidateRow.id)) {
            if (isSiblingPath(candidateRow.path, anchorPath)) {
              excludedAnchorSelfCount++;
            }
            continue;
          }
          if (candidatesMap.has(candidateRow.id)) continue;

          if (isSiblingPath(candidateRow.path, anchorPath)) {
            candidatesMap.set(candidateRow.id, {
              internalDocId: candidateRow.id,
              title: extractTitleFromBlock(candidateRow),
              box: candidateRow.box,
              path: candidateRow.path,
              relation: "sibling",
              depth: 1,
              sourceAnchorHandle,
            });
            siblingCount++;
            relationCount.sibling++;
          }
        }
      } catch {
      }
    }

    if (includeChildren) {
      try {
        for (const candidateRow of allDocsInBoxes) {
          // 排除 anchor 自身
          if (finalAnchorDocIds.has(candidateRow.id)) {
            if (isDirectChildPath(candidateRow.path, anchorPath)) {
              excludedAnchorSelfCount++;
            }
            continue;
          }
          if (candidatesMap.has(candidateRow.id)) continue;

          if (isDirectChildPath(candidateRow.path, anchorPath)) {
            candidatesMap.set(candidateRow.id, {
              internalDocId: candidateRow.id,
              title: extractTitleFromBlock(candidateRow),
              box: candidateRow.box,
              path: candidateRow.path,
              relation: "child",
              depth: 1,
              sourceAnchorHandle,
            });
            childCount++;
            relationCount.child++;
          }
        }
      } catch {
      }
    }

    if (includeDescendants) {
      try {
        const anchorDepth = parseDocIdPath(anchorPath).length;
        for (const candidateRow of allDocsInBoxes) {
          // 排除 anchor 自身
          if (finalAnchorDocIds.has(candidateRow.id)) {
            if (isDescendantPath(candidateRow.path, anchorPath)) {
              excludedAnchorSelfCount++;
            }
            continue;
          }
          if (candidatesMap.has(candidateRow.id)) continue;

          if (isDescendantPath(candidateRow.path, anchorPath)) {
            const candidateDepth = parseDocIdPath(candidateRow.path).length;
            const relativeDepth = candidateDepth - anchorDepth;
            if (relativeDepth <= maxDepth) {
              candidatesMap.set(candidateRow.id, {
                internalDocId: candidateRow.id,
                title: extractTitleFromBlock(candidateRow),
                box: candidateRow.box,
                path: candidateRow.path,
                relation: "descendant",
                depth: relativeDepth,
                sourceAnchorHandle,
              });
              descendantCount++;
              relationCount.descendant++;
            }
          }
        }
      } catch {
      }
    }
  }

  // 转换为数组并截断
  const candidates = [...candidatesMap.values()];
  const rawCandidateCount = candidates.length + excludedAnchorSelfCount;

  const truncatedCandidates = candidates.slice(0, maxItems);
  const totalCandidateCount = candidates.length;

  const treeCandidateHandles = truncatedCandidates.map((c, idx) => ({
    handle: `tree_ctx_${idx}`,
    docTitle: c.title,
    relation: c.relation,
    depth: c.depth,
    sourceAnchorHandle: c.sourceAnchorHandle,
  }));

  console.info("[KB-AGENT | DOC_TREE_CONTEXT_LOADED_SAFE]", {
    anchorCount: anchorDocIds.length,
    anchorRowsFoundCount,
    parentCount,
    siblingCount,
    childCount,
    descendantCount,
    rawCandidateCount,
    totalCandidateCount,
    excludedAnchorSelfCount,
    invalidAnchorCount,
    relationCount,
  });

  const internalMapping = truncatedCandidates.map((c) => ({
    handle: `tree_ctx_${candidates.indexOf(c)}`,
    internalDocId: c.internalDocId,
    title: c.title,
    relation: c.relation,
    provenance: "doc_tree_context" as const,
  }));

  return {
    success: true,
    data: {
      treeCandidateHandles,
      internalMapping,
      anchorCount: anchorDocIds.length,
      anchorRowsFoundCount,
      totalCandidateCount,
      excludedAnchorSelfCount,
      excludedAnchorCount: excludedAnchorSelfCount,
    },
  };
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "get_doc_tree_context 失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const count = (data?.totalCandidateCount as number) ?? 0;

  return {
    summary: `get_doc_tree_context 发现 ${count} 个树结构候选`,
    counts: { treeCandidates: count },
    warning: result.warning,
  };
}

function checkAvailability(context: AgentToolExecutionContext): AgentToolAvailability {
  const { workspace, followUpContext } = context;

  if (!workspace) {
    return { available: false, reason: "get_doc_tree_context 需要 workspace 上下文" };
  }

  const candidateCount = workspace.candidateDocs.length;
  const readDocCount = workspace.readDocuments.length;
  const conversationRefCount = workspace.conversationUsedReferences?.length ?? 0;
  const previousReferenceDocIdsCount = followUpContext?.previousReferenceDocIds?.length ?? 0;

  const hasCandidates = candidateCount > 0;
  const hasReadDocs = readDocCount > 0;
  const hasRefs = conversationRefCount > 0;
  const hasPreviousReference = previousReferenceDocIdsCount > 0;

  if (!hasCandidates && !hasReadDocs && !hasRefs && !hasPreviousReference) {
    return {
      available: false,
      reason: `无可用锚点文档（candidateCount=${candidateCount}, readDocCount=${readDocCount}, conversationRefCount=${conversationRefCount}, previousReferenceDocIdsCount=${previousReferenceDocIdsCount}）`,
    };
  }

  return { available: true };
}

function calcBudgetCost(): AgentToolBudgetCost {
  return {
    toolCallsUsed: 1,
    toolCallsRemaining: 0,
  };
}

export function createGetDocTreeContextTool(): AgentToolDefinition {
  return {
    name: "get_doc_tree_context",
    description: "用途：基于已知文档 handle 获取父级、兄弟、子级、后代等文档树邻近候选。输入：anchor handles/indexes 和结构范围参数。输出：安全候选 handle 和关系信息。边界：不读取正文，不作为证据。",
    readOnly: true,
    inputSchema: GetDocTreeContextArgsSchema,
    outputSchema: z.object({
      treeCandidateHandles: z.array(z.unknown()),
      internalMapping: z.array(z.unknown()),
      anchorCount: z.number(),
      totalCandidateCount: z.number(),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}
