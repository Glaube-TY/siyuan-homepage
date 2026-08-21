import {
  getAgentProfile,
  KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
} from "../../../../agent-platform/agent-profile";
import type { AgentTurnResult } from "../contracts/turn-result";
import { resolveInlineCitations } from "./inline-citation";
import {
  buildReferenceGroundingSet,
  collectObservationReferences,
} from "./reference-collector";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import {
  runAgentProfile,
  type AgentProfileRunOutcome,
  type RunAgentProfileParams,
} from "./run-agent-profile";
import { streamFinalAnswerFromDraft } from "./final-answer-composer";
import {
  collectTemporaryWorkbenches,
  toTemporaryWorkbenchReference,
} from "../tools/homepage/homepage-workbench.tool";
import { attachTemporaryWorkbenchUsage } from "../tools/homepage/temporary-workbench-store";
import { validateTurnFinalAnswer } from "./tool-evidence-validator";

export type RunAgentTurnParams = Omit<
  RunAgentProfileParams<AgentTurnResult>,
  "profile" | "validateFinalAnswer" | "finalize" | "composeFinalAnswer"
>;

export type AgentTurnOutcome = AgentProfileRunOutcome<AgentTurnResult>;

/** 知识库领域适配器：Profile 运行结束后只负责引用与安全工作台记忆。 */
export async function runAgentTurn(params: RunAgentTurnParams): Promise<AgentTurnOutcome> {
  return runAgentProfile({
    ...params,
    profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
    composeFinalAnswer: (composition) => streamFinalAnswerFromDraft(composition),
    validateFinalAnswer: (answer, context) => validateTurnFinalAnswer(answer, context),
    finalize: async ({ answer, events, observations, resolvedScope }) => {
      const observationRefs = collectObservationReferences(observations);
      buildReferenceGroundingSet({
        observationRefs,
        conversationContext: params.conversationContext,
        scope: resolvedScope.scope,
        attachedDocs: params.attachedDocs,
      });
      const citationResolution = resolveInlineCitations(answer, observationRefs);
      const footerReferences = citationResolution.citedReferences;
      const finalAnswer = citationResolution.answer;
      pushAgentDebugEvent("INLINE_CITATIONS_RESOLVED_SAFE", {
        acceptedCount: citationResolution.acceptedCount,
        rejectedCount: citationResolution.rejectedCount,
        citedReferenceCount: footerReferences.length,
      }, citationResolution.rejectedCount > 0 ? "warn" : "info");

      const temporaryWorkbenches = collectTemporaryWorkbenches(observations).map(toTemporaryWorkbenchReference);
      if (temporaryWorkbenches.length > 0 && params.conversationId && params.turnId) {
        try {
          await attachTemporaryWorkbenchUsage(temporaryWorkbenches.map((item) => item.id), {
            kind: "chat-message",
            id: `${params.conversationId}:${params.turnId}`,
            label: "AI 知识库对话",
            conversationId: params.conversationId,
            messageId: params.turnId,
          });
        } catch (error) {
          pushAgentDebugEvent("TEMPORARY_WORKBENCH_USAGE_ATTACH_FAILED", {
            error: error instanceof Error ? error.message.slice(0, 120) : String(error),
          }, "warn");
        }
      }

      return {
        result: {
          scope: resolvedScope.scope,
          scopeSummary: resolvedScope.summary,
          answer: finalAnswer,
          footerReferences,
          citationSegments: citationResolution.citationSegments,
          warnings: [],
          events,
          temporaryWorkbenches,
        },
        footerReferencesCount: footerReferences.length,
      };
    },
  });
}
