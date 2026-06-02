/**
 * Workspace to Evidence Pack
 *
 * 从 EvidenceWorkspace 派生 AgenticEvidencePack。
 *
 * 职责：
 * - 读取 finalAnswerAction.args.evidenceDocIds / evidenceBlockIds 进行筛选
 * - 证据来源优先级：readDocuments → readBlockContexts → docOutlines → recentEvidence
 * - 不把 candidateDocs/candidateBlocks 直接作为最终证据
 * - content 需要截断，避免 prompt 过大
 * - 按 docId/source block 去重
 * - recentEvidence 不进入 items，仅用于 coverage 和 warnings
 * - evidenceMode 优先使用 finalAnswerAction.args.evidenceMode，不根据证据状态自动改写
 */

import type { EvidenceWorkspace } from "./evidence-workspace";
import type { AnswerAction } from "../actions/action-types";
import type { AgenticEvidenceItem, AgenticEvidencePack } from "../evidence/evidence-types";
import { buildSourceCoverageSummary } from "./source-coverage";

export interface BuildAgenticEvidencePackParams {
  workspace: EvidenceWorkspace;
  finalAnswerAction?: AnswerAction;
  maxItems?: number;
  maxItemChars?: number;
  // Fast path evidence lock
  finalEvidenceDocIds?: string[];
  droppedReferenceDocIds?: string[];
}

function truncateContent(content: string, maxChars: number | undefined): { content: string; truncated: boolean } {
  if (maxChars === undefined || content.length <= maxChars) {
    return { content, truncated: false };
  }
  return { content: content.slice(0, maxChars) + "...", truncated: true };
}

function hasSubstantiveContent(item: AgenticEvidenceItem): boolean {
  if (item.readLevel === "recent") return false;
  if (!item.content || item.content.trim().length === 0) return false;
  return true;
}

interface BlockContextFilterInput {
  docId: string;
  blockId: string;
  sourceBlockIds?: string[];
}

function buildDocFilter(docIds: string[]): (docId: string) => boolean {
  const set = new Set(docIds);
  return (docId: string) => set.has(docId);
}

function buildBlockFilter(blockIds: string[]): (ctx: BlockContextFilterInput) => boolean {
  const set = new Set(blockIds);
  return (ctx: BlockContextFilterInput) =>
    set.has(ctx.blockId) || (ctx.sourceBlockIds && ctx.sourceBlockIds.some((id) => set.has(id)));
}

export function buildAgenticEvidencePackFromWorkspace(params: BuildAgenticEvidencePackParams): AgenticEvidencePack {
  const { workspace, finalAnswerAction, maxItems = 20, maxItemChars, finalEvidenceDocIds, droppedReferenceDocIds } = params;

  // Fast path evidence lock 优先级最高
  // finalEvidenceDocIds 显式传入（包括空数组）时，不使用 args.evidenceDocIds 回退
  const hasEvidenceLock = finalEvidenceDocIds !== undefined && finalEvidenceDocIds.length > 0;
  const hasExplicitEvidenceLock = finalEvidenceDocIds !== undefined;
  const hasExplicitEmptyEvidenceLock = finalEvidenceDocIds !== undefined && finalEvidenceDocIds.length === 0;
  
  const evidenceDocIds = hasEvidenceLock ? finalEvidenceDocIds : (hasExplicitEvidenceLock ? [] : (finalAnswerAction?.args?.evidenceDocIds));
  const evidenceBlockIds = finalAnswerAction?.args?.evidenceBlockIds;
  const hasDocFilter = evidenceDocIds && evidenceDocIds.length > 0;
  const hasBlockFilter = evidenceBlockIds && evidenceBlockIds.length > 0;

  // 当 finalEvidenceDocIds 显式传入且为空数组时，不允许回退加入 readDocuments/readBlockContexts/docOutlines
  // 这是 active + insufficient_evidence / without_kb_evidence 的关键防线
  if (hasExplicitEmptyEvidenceLock) {
    const requestedMode = finalAnswerAction?.args?.evidenceMode ?? "insufficient_evidence";
    const conflictWarning = requestedMode === "with_evidence"
      ? "Planner 请求 with_evidence，但 final evidence lock 为空，compose guard 应阻止带证据回答"
      : undefined;

    return {
      items: [],
      evidenceMode: requestedMode,
      coverage: {
        selectedDocCount: 0,
        readDocCount: workspace.readDocuments.length,
        readBlockContextCount: workspace.readBlockContexts.length,
        outlineCount: workspace.docOutlines.length,
        recentEvidenceCount: workspace.recentEvidence.length,
        searchedQueryMetas: [],
        warnings: conflictWarning
          ? [`active 模式下 ${requestedMode}，Evidence Pack 为空`, conflictWarning]
          : [`active 模式下 ${requestedMode}，Evidence Pack 为空`],
      },
    };
  }

  const shouldIncludeDoc = hasDocFilter ? buildDocFilter(evidenceDocIds!) : () => true;
  const shouldIncludeBlock = hasBlockFilter ? buildBlockFilter(evidenceBlockIds!) : () => true;

  // 构建排除列表：droppedReferenceDocIds 不能进入 final evidence pack
  const excludedDocIds = new Set<string>(droppedReferenceDocIds ?? []);

  const items: AgenticEvidenceItem[] = [];
  const seenDocIds = new Set<string>();
  const seenBlockIds = new Set<string>();

  // 1. readDocuments -> readLevel document
  for (const doc of workspace.readDocuments) {
    if (seenDocIds.has(doc.docId)) continue;
    if (excludedDocIds.has(doc.docId)) continue;
    if (hasDocFilter && !shouldIncludeDoc(doc.docId)) continue;
    seenDocIds.add(doc.docId);

    const { content, truncated } = truncateContent(doc.content, maxItemChars);
    items.push({
      id: `doc:${doc.docId}`,
      docId: doc.docId,
      docTitle: doc.title,
      box: doc.box,
      path: doc.path,
      readLevel: "document",
      content,
      truncated,
    });
  }

  // 2. readBlockContexts -> readLevel section
  // 同时满足 docId 和 blockId 约束
  for (const ctx of workspace.readBlockContexts) {
    if (seenBlockIds.has(ctx.blockId)) continue;
    if (excludedDocIds.has(ctx.docId)) continue;
    if (hasDocFilter && !shouldIncludeDoc(ctx.docId)) continue;
    if (hasBlockFilter && !shouldIncludeBlock({ docId: ctx.docId, blockId: ctx.blockId, sourceBlockIds: ctx.sourceBlockIds })) continue;
    seenBlockIds.add(ctx.blockId);

    const { content, truncated } = truncateContent(ctx.content, maxItemChars);
    items.push({
      id: `block:${ctx.blockId}`,
      docId: ctx.docId,
      docTitle: ctx.docTitle,
      box: ctx.box,
      path: ctx.path,
      sourceBlockIds: ctx.sourceBlockIds,
      readLevel: "section",
      content,
      truncated,
      metadata: ctx.headingPath ? { headingPath: ctx.headingPath } : undefined,
    });
  }

  // 3. docOutlines -> readLevel outline，内容用标题层级摘要
  for (const outline of workspace.docOutlines) {
    if (seenDocIds.has(outline.docId)) continue;
    if (excludedDocIds.has(outline.docId)) continue;
    if (hasDocFilter && !shouldIncludeDoc(outline.docId)) continue;
    seenDocIds.add(outline.docId);

    const outlineContent = formatOutlineContent(outline);
    const { content, truncated } = truncateContent(outlineContent, maxItemChars);
    items.push({
      id: `outline:${outline.docId}`,
      docId: outline.docId,
      docTitle: outline.title,
      readLevel: "outline",
      content,
      truncated,
    });
  }

  // 4. recentEvidence 不进入 items，仅用于 coverage 和 warnings
  // recentEvidence 是轻量引用，content 为空，不应作为正文证据出现在 final prompt 中

  // 截断 items 数量
  const truncatedItems = items.slice(0, maxItems);

  // 计算实质证据
  const substantiveItems = truncatedItems.filter(hasSubstantiveContent);
  const hasSubstantiveEvidence = substantiveItems.length > 0;

  // 确定 evidenceMode：优先使用 finalAnswerAction.args.evidenceMode，不根据证据状态自动改写
  const requestedMode = finalAnswerAction?.args?.evidenceMode;
  const evidenceMode: AgenticEvidencePack["evidenceMode"] = requestedMode ?? "insufficient_evidence";

  // 增加 warnings，便于调试
  const warnings: string[] = [];

  if (requestedMode === "with_evidence" && !hasSubstantiveEvidence) {
    warnings.push("Planner 请求 with_evidence 但过滤后没有实质证据，evidenceMode 冲突");
  }

  if (requestedMode === "insufficient_evidence" && hasSubstantiveEvidence) {
    warnings.push("Planner 请求 insufficient_evidence 但存在实质证据，evidenceMode 冲突");
  }

  if (workspace.candidateDocs.length === 0 && workspace.candidateBlocks.length === 0 && truncatedItems.length === 0) {
    warnings.push("工作区中没有候选资料或正文证据");
  }

  if (evidenceMode === "insufficient_evidence" && workspace.recentEvidence.length > 0 && !hasSubstantiveEvidence) {
    warnings.push("仅有最近引用，未读取正文证据");
  }

  // selectedDocCount 按最终 items 去重 docId 计算
  const uniqueDocIdsInItems = new Set(truncatedItems.map((i) => i.docId));

  // source coverage 统计
  const sourceCoverage = buildSourceCoverageSummary(workspace);

  // 如果 evidenceMode 是 with_evidence 但 sourceCoverageRatio < 1 且 unreadSourceCount > 0，加入 warning
  if (
    evidenceMode === "with_evidence" &&
    sourceCoverage.sourceCoverageRatio < 1 &&
    sourceCoverage.unreadSourceCount > 0
  ) {
    warnings.push(`仍有未读来源，回答覆盖有限 (${sourceCoverage.unreadSourceCount} 个未读来源)`);
  }

  // Evidence Pack 全文确认日志
  const totalContentChars = truncatedItems.reduce((sum, i) => sum + (i.content?.length ?? 0), 0);
  const truncatedItemCount = truncatedItems.filter((i) => i.truncated === true).length;

  console.info("[KB-AGENT | EVIDENCE_PACK_FULLTEXT_SAFE]", {
    itemCount: truncatedItems.length,
    totalContentChars,
    truncatedItemCount,
  });

  return {
    items: truncatedItems,
    coverage: {
      selectedDocCount: uniqueDocIdsInItems.size,
      readDocCount: workspace.coverage.readDocCount,
      readBlockContextCount: workspace.coverage.readBlockContextCount,
      outlineCount: workspace.docOutlines.length,
      recentEvidenceCount: workspace.recentEvidence.length,
      searchedQueryMetas: [...workspace.coverage.searchedQueryMetas],
      warnings,
      candidateDocCount: workspace.candidateDocs.length,
      candidateBlockCount: workspace.candidateBlocks.length,
      selectedEvidenceItemCount: truncatedItems.length,
      hasSubstantiveEvidence,
      evidenceAvailability: hasSubstantiveEvidence ? "available" : "empty",
      evidenceModeConflict: (requestedMode === "with_evidence" && !hasSubstantiveEvidence) || (requestedMode === "insufficient_evidence" && hasSubstantiveEvidence),
      discoveredSourceCount: sourceCoverage.discoveredSourceCount,
      readSourceCount: sourceCoverage.readSourceCount,
      unreadSourceCount: sourceCoverage.unreadSourceCount,
      sourceCoverageRatio: sourceCoverage.sourceCoverageRatio,
    },
    evidenceMode,
  };
}

interface OutlineNode {
  content: string;
  level: number;
  children: OutlineNode[];
}

function formatOutlineContent(outline: { title: string; rootNodes: OutlineNode[] }): string {
  const lines: string[] = [`# ${outline.title}`];
  for (const node of outline.rootNodes) {
    lines.push(formatOutlineNode(node, 0));
  }
  return lines.join("\n");
}

function formatOutlineNode(node: OutlineNode, depth: number): string {
  const indent = "  ".repeat(depth);
  const heading = `${indent}${"#".repeat(node.level + 1)} ${node.content}`;
  const children = node.children.slice(0, 3).map((c) => formatOutlineNode(c, depth + 1)).join("\n");
  return children ? `${heading}\n${children}` : heading;
}
