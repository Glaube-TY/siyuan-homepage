/**
 * Runtime Turn Facts
 *
 * 中性 runtime facts，不包含任何对话分类、上下文模式或 AI 理解结果。
 *
 * 职责：
 * - 提供 detectForbiddenRuntimeIds 安全检查
 * - 提供 FORBIDDEN_RUNTIME_ID_FIELDS 常量
 * - 不包含 relationToPrevious / coverageIntent / conversationReferents / queryPlan / target / needsKnowledgeBase
 */

export interface RuntimeTurnFacts {
  modeRequiresKb: boolean;
}

export const FORBIDDEN_RUNTIME_ID_FIELDS = [
  "id",
  "ids",
  "docId",
  "docIds",
  "blockId",
  "blockIds",
  "sourceDocId",
  "sourceDocIds",
  "sourceBlockId",
  "sourceBlockIds",
  "evidenceDocId",
  "evidenceDocIds",
  "usedEvidenceDocId",
  "usedEvidenceDocIds",
  "finalEvidenceDocId",
  "finalEvidenceDocIds",
  "candidateDoc",
  "candidateDocs",
  "candidateDocId",
  "candidateDocIds",
  "candidateBlock",
  "candidateBlocks",
  "candidateBlockId",
  "candidateBlockIds",
  "previousReferenceDocIds",
  "dailyNoteId",
  "dailyNoteIds",
  "idList",
];

export function detectForbiddenRuntimeIds(rawInput: unknown): string[] {
  const warnings: string[] = [];
  if (rawInput === null || typeof rawInput !== "object") return warnings;

  function scanKeys(obj: unknown, path: string): void {
    if (obj === null || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => scanKeys(item, `${path}[${idx}]`));
      return;
    }
    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_RUNTIME_ID_FIELDS.includes(key)) {
        warnings.push(`forbiddenRuntimeIdFields: "${key}" at ${path}.${key}`);
      }
      scanKeys(record[key], `${path}.${key}`);
    }
  }

  scanKeys(rawInput, "$");
  return warnings;
}

export function buildRuntimeTurnFacts(): RuntimeTurnFacts {
  return {
    modeRequiresKb: true,
  };
}
