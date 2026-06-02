import type { AgenticRagState } from "../../graph/state";
import type { ComposeContextPack } from "./context-pack-types";
import { buildEvidencePack } from "./evidence-pack";
import { buildStructurePack } from "./structure-pack";

export function buildComposeContextPack(input: {
  state: AgenticRagState;
}): ComposeContextPack {
  const { state } = input;
  const requestedEvidenceMode = state.finalAnswerAction?.args?.evidenceMode;
  const evidencePack = buildEvidencePack({
    workspace: state.workspace,
    requestedEvidenceMode,
  });
  const structurePack = buildStructurePack({ workspace: state.workspace });

  // mustUseEvidence 服从 Planner answer 的 requestedEvidenceMode，不只看 itemCount
  let mustUseEvidence: boolean;
  if (requestedEvidenceMode === "with_evidence") {
    mustUseEvidence = evidencePack.itemCount > 0;
  } else {
    // insufficient_evidence / without_kb_evidence / 缺失：不强制基于证据回答
    mustUseEvidence = false;
  }

  return {
    question: state.question,
    structureSummary: structurePack.loaded ? structurePack.summaryText : undefined,
    evidencePack,
    answerPolicy: {
      mustUseEvidence,
      mayUseStructureAsRelevanceExplanation: structurePack.loaded,
      mustNotTreatStructureAsContentEvidence: true,
      insufficientEvidenceBehavior: "When the evidence pack is empty, answer in insufficient_evidence mode and do not claim content conclusions.",
    },
    citationPolicy: {
      includeFooterReferences: true,
      preferUsedEvidenceDocs: true,
    },
  };
}

export function summarizeComposeContextPack(pack: ComposeContextPack): Record<string, unknown> {
  return {
    hasStructureSummary: !!pack.structureSummary,
    evidenceItemCount: pack.evidencePack.itemCount,
    totalContentChars: pack.evidencePack.totalContentChars,
    requestedEvidenceMode: pack.evidencePack.evidenceMode,
    mustUseEvidence: pack.answerPolicy.mustUseEvidence,
  };
}
