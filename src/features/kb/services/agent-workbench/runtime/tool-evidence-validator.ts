import type { FinalAnswerValidationResult } from "../../agent-core/loop/native-tool-agent-loop";
import type { ToolResultEntry } from "./tool-result-log";
import { buildMissingCitationRetryInstruction } from "./inline-citation";
import { collectObservationReferences } from "./reference-collector";

export interface TurnValidationContext {
  observations: readonly ToolResultEntry[];
}

/**
 * 语言无关的终稿验证器：
 * 不分析用户问题或模型正文的自然语言意图，
 * 仅基于结构化 Observation 证据进行引用完整性校验。
 */
export function validateTurnFinalAnswer(
  answer: string,
  context: TurnValidationContext,
): FinalAnswerValidationResult | undefined {
  const hasToolEvidence = context.observations.length > 0;

  if (hasToolEvidence) {
    const citationRetryInstruction = buildMissingCitationRetryInstruction(
      answer,
      collectObservationReferences(context.observations),
    );
    if (citationRetryInstruction) {
      return {
        valid: false,
        retryInstruction: citationRetryInstruction,
        forceToolCall: false,
        errorCode: "missing_citation_reference",
        errorMessage: "回答未能通过来源引用校验，缺少有效引用标记。",
      };
    }
  }

  return undefined;
}
