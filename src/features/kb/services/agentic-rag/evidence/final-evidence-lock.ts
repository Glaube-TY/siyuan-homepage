/**
 * Final Evidence Lock for Planner Answer
 *
 * 在 Planner answer 出口锁定最终证据白名单。
 *
 * 职责：
 * - 从 workspace.readDocuments / readBlockContexts / recentEvidence 提取已实际可用的证据
 * - 计算 droppedReferenceDocIds（未被选中的文档，覆盖候选和已读）
 * - 不改写 Planner 请求的 evidenceMode，冲突只记录 warning
 * - 不依赖 Planner args 中的 evidenceDocIds/evidenceBlockIds
 * - 不打印真实 docIds/blockIds 到日志
 */

import type { AgenticRagState } from "../graph/state";

export interface FinalEvidenceLockResult {
  finalEvidenceDocIds: string[];
  droppedReferenceDocIds: string[];
  evidenceAvailability: "available" | "empty" | "not_requested";
  warnings: string[];
  debugSummary: {
    finalEvidenceDocCount: number;
    droppedReferenceDocCount: number;
    readDocCount: number;
    readBlockContextCount: number;
    requestedEvidenceMode: string;
    reason: string;
  };
}

export function lockFinalEvidenceForPlannerAnswer(state: AgenticRagState): FinalEvidenceLockResult {
  const warnings: string[] = [];
  const requestedEvidenceMode = state.finalAnswerAction?.args?.evidenceMode ?? "with_evidence";

  if (requestedEvidenceMode === "without_kb_evidence") {
    const droppedReferenceDocIds = extractAllAvailableEvidenceDocIds(state);
    return {
      finalEvidenceDocIds: [],
      droppedReferenceDocIds,
      evidenceAvailability: "not_requested",
      warnings,
      debugSummary: {
        finalEvidenceDocCount: 0,
        droppedReferenceDocCount: droppedReferenceDocIds.length,
        readDocCount: state.workspace.readDocuments.length,
        readBlockContextCount: state.workspace.readBlockContexts.length,
        requestedEvidenceMode,
        reason: "Planner 请求不使用知识库证据",
      },
    };
  }

  const readDocIds = state.workspace.readDocuments.map((d) => d.docId);
  const readBlockDocIds = [...new Set(state.workspace.readBlockContexts.map((b) => b.docId))];
  const hasReadContent = readDocIds.length > 0 || readBlockDocIds.length > 0;

  if (requestedEvidenceMode === "insufficient_evidence") {
    if (hasReadContent) {
      warnings.push("Planner 请求 insufficient_evidence，但当前已有已读证据；保持 Planner 请求模式，不自动切换为 with_evidence");
    }
    const droppedReferenceDocIds = extractAllAvailableEvidenceDocIds(state);
    return {
      finalEvidenceDocIds: [],
      droppedReferenceDocIds,
      evidenceAvailability: hasReadContent ? "available" : "empty",
      warnings,
      debugSummary: {
        finalEvidenceDocCount: 0,
        droppedReferenceDocCount: droppedReferenceDocIds.length,
        readDocCount: state.workspace.readDocuments.length,
        readBlockContextCount: state.workspace.readBlockContexts.length,
        requestedEvidenceMode,
        reason: hasReadContent
          ? "Planner 请求证据不足，保持 insufficient_evidence"
          : "无已读正文证据",
      },
    };
  }

  // with_evidence 路径
  let finalEvidenceDocIds: string[] = [];

  if (readDocIds.length > 0) {
    finalEvidenceDocIds = [...new Set(readDocIds)];
  } else if (readBlockDocIds.length > 0) {
    finalEvidenceDocIds = [...readBlockDocIds];
  }

  if (finalEvidenceDocIds.length === 0) {
    warnings.push("仅有最近引用，未读取正文证据，未锁定最终引用白名单");
  }

  const droppedReferenceDocIds = extractDroppedReferences(state, finalEvidenceDocIds);

  return {
    finalEvidenceDocIds,
    droppedReferenceDocIds,
    evidenceAvailability: finalEvidenceDocIds.length > 0 ? "available" : "empty",
    warnings,
    debugSummary: {
      finalEvidenceDocCount: finalEvidenceDocIds.length,
      droppedReferenceDocCount: droppedReferenceDocIds.length,
      readDocCount: state.workspace.readDocuments.length,
      readBlockContextCount: state.workspace.readBlockContexts.length,
      requestedEvidenceMode,
      reason: finalEvidenceDocIds.length > 0
        ? `从已读证据锁定 ${finalEvidenceDocIds.length} 个文档`
        : "无已读证据可用",
    },
  };
}

function extractDroppedReferences(state: AgenticRagState, finalEvidenceDocIds: string[] = []): string[] {
  const finalSet = new Set(finalEvidenceDocIds);
  const candidateDocIds = state.workspace.candidateDocs.map((d) => d.docId);
  return [...new Set(candidateDocIds.filter((id) => !finalSet.has(id)))];
}

function extractAllAvailableEvidenceDocIds(state: AgenticRagState): string[] {
  const allDocIds: string[] = [];

  for (const doc of state.workspace.candidateDocs) {
    allDocIds.push(doc.docId);
  }
  for (const doc of state.workspace.readDocuments) {
    allDocIds.push(doc.docId);
  }
  for (const block of state.workspace.readBlockContexts) {
    allDocIds.push(block.docId);
  }
  for (const item of state.workspace.recentEvidence) {
    allDocIds.push(item.docId);
  }

  return [...new Set(allDocIds)];
}
