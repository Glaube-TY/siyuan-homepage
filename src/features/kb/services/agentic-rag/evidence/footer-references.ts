/**
 * Footer References
 *
 * 从 AgenticEvidencePack 派生 ReferenceItem[]。
 *
 * 职责：
 * - 按 docId 去重，优先 readLevel document/section/recent
 * - maxRefs 默认 5
 * - 不基于 taskType 选择引用
 * - insufficient_evidence 时过滤空 content 的引用
 * - 引用选择只基于结构化信号：
 *   - AI 明确输出 <!-- EVIDENCE_USED: [1,2] --> 时按 handle 选择
 *   - 否则按 evidence pack 原始顺序 / readLevel 优先级选择
 * - 不基于标题/正文自然语言匹配判断引用使用
 * - debug：FOOTER_REFERENCE_USAGE_FILTERED
 */

import type { ReferenceItem } from "../../../types/chat";
import type { AgenticEvidencePack, AgenticEvidenceItem } from "../evidence/evidence-types";

export interface BuildFooterReferencesOptions {
  maxRefs?: number;
  answerText?: string;
  finalEvidenceDocIds?: string[];
  droppedReferenceDocIds?: string[];
}

const READ_LEVEL_PRIORITY: Record<string, number> = {
  document: 5,
  section: 4,
  snippet: 3,
  outline: 2,
  recent: 1,
};

function getReadLevelPriority(readLevel: string): number {
  return READ_LEVEL_PRIORITY[readLevel] ?? 0;
}

function shouldReplaceReference(
  existing: { readLevel: string; originalIndex: number; handleScore: number },
  incoming: { readLevel: string; originalIndex: number; handleScore: number },
): boolean {
  if (incoming.handleScore !== existing.handleScore) {
    return incoming.handleScore > existing.handleScore;
  }
  const incomingPriority = getReadLevelPriority(incoming.readLevel);
  const existingPriority = getReadLevelPriority(existing.readLevel);
  if (incomingPriority !== existingPriority) {
    return incomingPriority > existingPriority;
  }
  return incoming.originalIndex < existing.originalIndex;
}

function hasSubstantiveContent(item: AgenticEvidenceItem): boolean {
  if (item.readLevel === "recent") return false;
  if (!item.content || item.content.trim().length === 0) return false;
  return true;
}

function parseUsedEvidenceHandles(answerText: string): Set<number> {
  const handles = new Set<number>();
  const match = answerText.match(/<!--\s*EVIDENCE_USED:\s*\[([^\]]*)\]\s*-->/);
  if (!match) return handles;

  const content = match[1];
  const parts = content.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (!isNaN(num) && num > 0) {
      handles.add(num);
    }
  }
  return handles;
}

export function buildFooterReferencesFromAgenticEvidencePack(
  pack: AgenticEvidencePack,
  options?: BuildFooterReferencesOptions
): ReferenceItem[] {
  const maxRefs = options?.maxRefs ?? Math.max(pack.items.length, 20);
  const answerText = options?.answerText ?? "";
  const finalEvidenceDocIds = options?.finalEvidenceDocIds;
  const droppedReferenceDocIds = options?.droppedReferenceDocIds;

  let items = pack.items;
  if (pack.evidenceMode === "insufficient_evidence") {
    items = items.filter(hasSubstantiveContent);
  }

  if (finalEvidenceDocIds && finalEvidenceDocIds.length > 0) {
    const allowedDocIds = new Set(finalEvidenceDocIds);
    items = items.filter((item) => allowedDocIds.has(item.docId));
  }

  const excludedDocIds = new Set<string>(droppedReferenceDocIds ?? []);
  if (excludedDocIds.size > 0) {
    items = items.filter((item) => !excludedDocIds.has(item.docId));
  }

  const totalEvidenceItems = items.length;
  const usedHandles = answerText.length > 0 ? parseUsedEvidenceHandles(answerText) : undefined;
  const hasExplicitHandles = usedHandles !== undefined && usedHandles.size > 0;

  let droppedInvalidHandleCount = 0;
  if (hasExplicitHandles) {
    for (const handle of usedHandles) {
      if (handle < 1 || handle > items.length) {
        droppedInvalidHandleCount++;
      }
    }
  }

  const docMap = new Map<string, { item: AgenticEvidenceItem; handleScore: number; originalIndex: number }>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const evidenceIndex = i + 1;
    const handleScore = hasExplicitHandles && usedHandles.has(evidenceIndex) ? 1 : 0;
    if (hasExplicitHandles && handleScore === 0) continue;
    const existing = docMap.get(item.docId);
    const incoming = { readLevel: item.readLevel, handleScore, originalIndex: i };
    if (!existing || shouldReplaceReference(
      { readLevel: existing.item.readLevel, originalIndex: existing.originalIndex, handleScore: existing.handleScore },
      incoming,
    )) {
      docMap.set(item.docId, { item, handleScore, originalIndex: i });
    }
  }

  const allEntries = Array.from(docMap.values());
  const handleMappedCount = hasExplicitHandles
    ? allEntries.filter((e) => e.handleScore > 0).length
    : 0;

  const selectedEntries = hasExplicitHandles
    ? allEntries.filter((e) => e.handleScore > 0)
    : allEntries
      .sort((a, b) => {
        if (a.handleScore !== b.handleScore) return b.handleScore - a.handleScore;
        const priorityA = getReadLevelPriority(a.item.readLevel);
        const priorityB = getReadLevelPriority(b.item.readLevel);
        if (priorityB !== priorityA) return priorityB - priorityA;
        return a.originalIndex - b.originalIndex;
      })
      .slice(0, maxRefs);

  const selectedBy = hasExplicitHandles ? "explicit_handles" : "evidence_order";

  console.info("[KB-AGENT | FOOTER_REFERENCE_USAGE_FILTERED]", {
    totalEvidenceItems,
    usedHandleCount: usedHandles?.size ?? 0,
    handleMappedCount,
    selectedBy,
    droppedInvalidHandleCount,
    droppedByEvidenceLockCount: totalEvidenceItems - selectedEntries.length,
    maxRefs,
    finalRefCount: selectedEntries.length,
  });

  const fallbackUntitledCount = selectedEntries.filter(
    (e) => !e.item.docTitle || e.item.docTitle === "未命名文档"
  ).length;
  const uniqueTitles = new Set(selectedEntries.map((e) => e.item.docTitle).filter(Boolean));
  console.info("[KB-AGENT | FOOTER_REFERENCE_TITLE_SAFE]", {
    referenceCount: selectedEntries.length,
    fallbackUntitledCount,
    uniqueTitleHashCount: uniqueTitles.size,
  });

  return selectedEntries.map((entry, index) => {
    const item = entry.item;
    const ref: ReferenceItem = {
      index: index + 1,
      docTitle: item.docTitle,
      path: item.path,
      headingPathText: "",
      sourceBlockIds: item.sourceBlockIds ?? [],
      docId: item.docId,
      box: item.box,
      readLevel: item.readLevel === "document" ? "document" : item.readLevel === "section" ? "section" : "snippet",
    };
    return ref;
  });
}
