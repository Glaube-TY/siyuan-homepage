import type { AgenticEvidencePack } from "../evidence/evidence-types";
import type { AgenticRagState } from "./state";

export const FIXED_NO_EVIDENCE_KB_ANSWER =
  "当前没有读取到可用资料，无法基于知识库继续回答。可以换一种问法或先确认检索服务是否可用。";

export const PLANNER_PROTOCOL_FAILURE_ANSWER =
  "模型未返回可执行的工具动作，请重试或更换模型。";

export const CONTROL_PLANE_FAILURE_ANSWER =
  "模型没有返回可解析的工具决策 JSON，控制面调用失败。可重试或换一个更稳定输出 JSON 的模型。";

export function buildEmptyInsufficientEvidencePack(): AgenticEvidencePack {
  return {
    items: [],
    coverage: {
      selectedDocCount: 0,
      readDocCount: 0,
      readBlockContextCount: 0,
      outlineCount: 0,
      recentEvidenceCount: 0,
      searchedQueryMetas: [],
      warnings: ["no evidence items available"],
      selectedEvidenceItemCount: 0,
      hasSubstantiveEvidence: false,
    },
    evidenceMode: "insufficient_evidence",
  };
}

export function finalizeNoEvidenceKbAnswerState(
  state: AgenticRagState,
  params: {
    reason: string;
    traceName: string;
    detail?: Record<string, unknown>;
  },
): AgenticRagState {
  const gateV2 = state.evidenceGateV2;
  const nextReasons = gateV2
    ? [...gateV2.reasons, params.reason]
    : [params.reason];

  return {
    ...state,
    currentAction: undefined,
    finalAnswerAction: undefined,
    evidenceGateV2: gateV2
      ? {
        ...gateV2,
        status: "insufficient_final",
        reasons: nextReasons,
      }
      : gateV2,
    composedAnswer: FIXED_NO_EVIDENCE_KB_ANSWER,
    finalEvidencePack: buildEmptyInsufficientEvidencePack(),
    footerReferences: [],
    finalEvidenceDocIds: [],
    droppedReferenceDocIds: [],
    warnings: state.warnings.includes(params.reason)
      ? state.warnings
      : [...state.warnings, params.reason],
    terminalAnswerSource: "no_evidence_fixed",
    finalizeReasonCode: params.reason,
    composedAnswerSource: "no_evidence_fixed",
    traceLog: [
      ...state.traceLog,
      {
        name: params.traceName,
        status: "success",
        detail: JSON.stringify({
          reason: params.reason,
          evidenceItemCount: 0,
          finalAnswer: "fixed_no_evidence_kb_answer",
          hadPlannerAnswerAction: !!state.finalAnswerAction,
          terminalAnswerSource: "no_evidence_fixed",
          finalizeReasonCode: params.reason,
          ...(params.detail ?? {}),
        }),
      },
    ],
  };
}
