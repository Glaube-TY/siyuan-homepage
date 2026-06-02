/**
 * ⚠️ LEGACY FLOW-CONTROL ⚠️
 *
 * AI 规划器节点：基于当前状态输出下一步工具动作，并交给 materializer 物化。
 *
 * 属于"legacy flow-control，待迁移为 observation-only"。
 *
 * 职责（v2）：
 * - 读取 state.runtimeTurnFacts、state.turnContextFact、state.workspace、state.budget、state.scope
 * - 调 buildAgentPlannerPrompt
 * - 调 callLlmObject<dynamicSchema>
 * - 调 normalizePlannerAction
 * - 调 materializePlannerAction
 * - 返回 state.plannerAction 和 state.plannerMaterializedAction
 * - 本节点只生成 plannerAction 和 plannerMaterializedAction，真正是否执行由 bridge 校验后决定
 * - 不直接执行 action、不修改 currentAction
 *
 * 日志：
 * - PLANNER_ACTION_RAW、PLANNER_ACTION_VALIDATED、PLANNER_ACTION_SELECTED
 * - PLANNER_ACTION_MATERIALIZED_FOR_BRIDGE
 *
 * v3 方向（见 docs/notebrain/agent-skill-workbench-v3-design.md §2/§3/§7）：
 * - 真正的 Planner 决策入口是 workbench PlannerLoop（src/features/kb/services/agentic-rag/workbench/planner-loop.ts）。
 * - 本节点是 v2 graph node，未来逐步把"Planner 决策"职责迁到 PlannerLoop。
 *
 * 迁移期约束：
 * - 本轮**不**新增新流程逻辑。
 * - 旧调用方暂不破坏。
 * - 后续轮次：把"流程建议"从本节点的 prompt 与 normalize 逻辑中剥离，
 *   改为通过 SkillRegistry.buildSkillPromptSections 提供给 Planner。
 */

import type { AgenticRagState, TraceStep } from "../state";
import type { PlannerActionMaterializeResult } from "../../actions/planner-action-materializer";
import type { AgentActionName } from "../../actions/action-types";
import {
  normalizePlannerAction,
  buildAllowedPlannerActionLooseSchema,
  deepRemoveForbiddenFields,
  countForbiddenFields,
  sanitizeArgsForLog,
} from "../../planner/planner-action";
import type { PlannerActionType } from "../../planner/planner-action";
import { buildAgentPlannerPrompt } from "../../prompts/agent-planner-prompt";
import { callLlmObject, callLlmJson, AiProviderUnavailableError, CONTROL_PLANE_JSON_MAX_OUTPUT_TOKENS } from "../../../qa/llm-client";
import { summarizeEvidenceWorkspaceForPlanner } from "../../workspace/workspace-summary";
import { buildStructureContextBrief } from "../../workspace/structure-context-summary";
import { materializePlannerAction } from "../../actions/planner-action-materializer";
import {
  buildPlannerContextPack,
  summarizePlannerContextPack,
} from "../../harness/context/planner-context";
import {
  getPlannerVisibleToolNames,
  isPlannerVisibleToolName,
} from "../../harness/contracts/tool-contract-registry";
import {
  checkPlannerDecisionGuard,
  checkFocusDocScopeHandlesGuard,
  emitFirstPrinciplesViolation,
} from "../../harness/guards/first-principles-guard";
import { getUnreadCandidateDocCount, getInventoryOnlyCandidateDocs } from "../../workspace/candidate-quality";
import { getRemainingSearchCalls, getRemainingReadDocs } from "../../safety/budget-guard";

import { pushAgentDebugEvent } from "../../debug/agentic-rag-debug";

interface PlannerPreviousEvidenceSummary {
  previousReferenceCount: number;
  previousReferenceTitles: string[];
  source: "followUpContext" | "readDocuments" | "none";
}

function resolvePlannerPreviousEvidenceSummary(state: AgenticRagState): PlannerPreviousEvidenceSummary {
  const followUpContext = state.followUpContext;
  if (followUpContext?.previousReferenceDocIds && followUpContext.previousReferenceDocIds.length > 0) {
    const titles = (followUpContext.previousReferenceTitles ?? []).filter(Boolean);
    return {
      previousReferenceCount: followUpContext.previousReferenceDocIds.length,
      previousReferenceTitles: titles,
      source: "followUpContext",
    };
  }

  if (state.workspace.readDocuments.length > 0) {
    const titles = state.workspace.readDocuments.map((d) => d.title).filter(Boolean);
    return {
      previousReferenceCount: state.workspace.readDocuments.length,
      previousReferenceTitles: titles,
      source: "readDocuments",
    };
  }

  return {
    previousReferenceCount: 0,
    previousReferenceTitles: [],
    source: "none",
  };
}

function appendPlannerSelectedTrace(
  traceLog: TraceStep[],
  actionType: string,
): void {
  traceLog.push({
    name: "PLANNER_ACTION_SELECTED",
    status: "success",
    detail: `AI 规划器：${actionType}（等待物化器和桥接层校验）`,
  });

  traceLog.push({
    name: "PLANNER_ACTION_SELECTED_FOR_BRIDGE",
    status: "success",
    detail: `${actionType}（等待桥接层校验）`,
  });
}

function appendPlannerMaterializerTrace(
  traceLog: TraceStep[],
  materializeResult: PlannerActionMaterializeResult,
): void {
  if (materializeResult.ok && materializeResult.action) {
    traceLog.push({
      name: "PLANNER_ACTION_MATERIALIZED_FOR_BRIDGE",
      status: "success",
      detail: `物化器已生成可校验动作：${materializeResult.action.type}`,
    });
    traceLog.push({
      name: "PLANNER_ACTION_MATERIALIZE_ACTION_TYPE",
      status: "success",
      detail: JSON.stringify({
        plannerActionType: materializeResult.debugSummary.plannerType,
        materializeActionType: materializeResult.action.type,
      }),
    });
  } else {
    traceLog.push({
      name: "PLANNER_ACTION_MATERIALIZE_FAILED",
      status: "failed",
      detail: JSON.stringify({
        plannerType: materializeResult.debugSummary.plannerType,
        reason: materializeResult.debugSummary.reason,
        warnings: materializeResult.warnings.length > 0 ? materializeResult.warnings : undefined,
      }),
    });
  }
}

export interface PlanNextActionNodeResult {
  state: AgenticRagState;
}

export async function planNextActionNode(params: {
  state: AgenticRagState;
  abortSignal?: AbortSignal;
}): Promise<PlanNextActionNodeResult> {
  const { state, abortSignal } = params;
  const traceLog: TraceStep[] = [...state.traceLog];

  try {
    const scopeSummary = state.scopeSummary;
    const workspaceSummary = summarizeEvidenceWorkspaceForPlanner(state.workspace);
    const plannerContextPack = buildPlannerContextPack({ state });
    const plannerContextSummary = summarizePlannerContextPack(plannerContextPack);

    const evidenceSummary = resolvePlannerPreviousEvidenceSummary(state);
    const previousReferenceTitles = evidenceSummary.previousReferenceTitles.slice(0, 8);
    const previousReferenceCount = evidenceSummary.previousReferenceCount;

    if (state.trace) {
      traceLog.push({
        name: "PLANNER_PREVIOUS_REFERENCE_FACTS",
        status: "success",
        detail: JSON.stringify({
          previousReferenceCount,
          previousReferenceTitleCount: previousReferenceTitles.length,
          previousReferenceSource: evidenceSummary.source,
          hasFollowUpContextPreviousReference: !!state.followUpContext?.previousReferenceDocIds?.length,
          readDocumentCount: state.workspace.readDocuments.length,
        }),
      });
    }

    const plannerVisibleAllowedActions = plannerContextPack.state.allowedActions.filter(isPlannerVisibleToolName);

    const rawAllowedCount = plannerContextPack.state.allowedActions.length;
    if (plannerVisibleAllowedActions.length < rawAllowedCount) {
      const filteredOut = plannerContextPack.state.allowedActions.filter((a) => !isPlannerVisibleToolName(a));
      console.info("[KB-AGENT | PLANNER_VISIBLE_ACTIONS_NORMALIZED_SAFE]", {
        rawAllowedCount,
        visibleCount: plannerVisibleAllowedActions.length,
        filteredTypes: filteredOut,
        state: plannerContextPack.state.current,
        reason: "execution-only actions filtered from planner-visible allowedActions",
      });
    }

    const availableToolNameSet = new Set(state.availableTools.map((t) => t.name));
    const readDocIdSet = new Set(state.workspace.readDocuments.map((d) => d.docId));
    const readableCandidateUnreadCount = getUnreadCandidateDocCount(state.workspace, readDocIdSet);
    const inventoryOnlyCandidateCount = getInventoryOnlyCandidateDocs(state.workspace).length;
    const candidateUnreadCount = readableCandidateUnreadCount;
    const budgetContext = { budget: state.budget, counters: state.counters };
    const searchBudgetRemaining = getRemainingSearchCalls(state.budget, budgetContext);
    const readBudgetRemaining = getRemainingReadDocs(state.budget, budgetContext);

    const VIRTUAL_PLANNER_ACTIONS = new Set<AgentActionName>([
      "read_candidate_docs",
      "read_previous_evidence",
      "answer",
    ]);

    const allowedBeforeCount = plannerVisibleAllowedActions.length;
    let effectiveAllowedActions = plannerVisibleAllowedActions.filter((action) => {
      if (VIRTUAL_PLANNER_ACTIONS.has(action)) {
        if (action === "read_candidate_docs") {
          return readableCandidateUnreadCount > 0 && readBudgetRemaining > 0;
        }
        if (action === "read_previous_evidence") {
          const hasPrevRefs = !!state.followUpContext?.previousReferenceDocIds?.length;
          return hasPrevRefs && readBudgetRemaining > 0;
        }
        return true;
      }
      if (action === "search_scope") {
        return searchBudgetRemaining > 0;
      }
      return availableToolNameSet.has(action);
    });

    if (effectiveAllowedActions.length === 0 && plannerVisibleAllowedActions.includes("answer")) {
      effectiveAllowedActions = ["answer"];
    }

    const allowedAfterCount = effectiveAllowedActions.length;
    const droppedUnavailableActionCount = allowedBeforeCount - allowedAfterCount;
    const searchScopeDroppedBecauseBudgetExhausted =
      plannerVisibleAllowedActions.includes("search_scope") &&
      !effectiveAllowedActions.includes("search_scope") &&
      searchBudgetRemaining <= 0;

    const hasReadPreviousEvidence = effectiveAllowedActions.includes("read_previous_evidence");
    pushAgentDebugEvent("PREVIOUS_EVIDENCE_ALLOWED_SAFE", {
      state: plannerContextPack.state.current,
      previousReferenceCount: previousReferenceCount,
      readBudgetRemaining,
      allowed: hasReadPreviousEvidence,
    }, "info");

    const defaultAvailableTools = getPlannerVisibleToolNames();
    const availableTools = effectiveAllowedActions.length > 0
      ? effectiveAllowedActions
      : defaultAvailableTools;

    const dynamicSchemaAllowedActions = effectiveAllowedActions.length > 0
      ? effectiveAllowedActions as PlannerActionType[]
      : defaultAvailableTools as PlannerActionType[];
    const dynamicSchema = buildAllowedPlannerActionLooseSchema(dynamicSchemaAllowedActions);
    const hasAnswerAllowed = dynamicSchemaAllowedActions.includes("answer");

    traceLog.push({
      name: "PLANNER_DYNAMIC_SCHEMA_SAFE",
      status: "success",
      detail: JSON.stringify({
        allowedActionCount: dynamicSchemaAllowedActions.length,
        hasAnswerAllowed,
        state: plannerContextPack.state.current,
      }),
    });

    traceLog.push({
      name: "PLANNER_EFFECTIVE_ALLOWED_ACTIONS_SAFE",
      status: "success",
      detail: JSON.stringify({
        state: plannerContextPack.state.current,
        allowedBeforeCount,
        allowedAfterCount,
        hasSearchScope: effectiveAllowedActions.includes("search_scope"),
        hasAnswerAllowed: effectiveAllowedActions.includes("answer"),
        searchBudgetRemaining,
        availableToolCount: state.availableTools.length,
        readableCandidateUnreadCount,
        inventoryOnlyCandidateCount,
        droppedUnavailableActionCount,
        searchScopeDroppedBecauseBudgetExhausted,
      }),
    });

    pushAgentDebugEvent("PLANNER_DECISION_SPACE_SAFE", {
      state: plannerContextPack.state.current,
      allowedActionCount: effectiveAllowedActions.length,
      hasAnswerAllowed: effectiveAllowedActions.includes("answer"),
      hasSearchAllowed: effectiveAllowedActions.includes("search_scope"),
      hasCandidateReadAllowed: effectiveAllowedActions.includes("read_candidate_docs"),
      hasPreviousEvidenceReadAllowed: effectiveAllowedActions.includes("read_previous_evidence"),
      hasAnyReadAllowed: effectiveAllowedActions.includes("read_candidate_docs") || effectiveAllowedActions.includes("read_previous_evidence") || effectiveAllowedActions.includes("read_block_context"),
    }, "info");

    traceLog.push({
      name: "PLANNER_CONTEXT_PACK_BUILT_SAFE",
      status: "success",
      detail: JSON.stringify(plannerContextSummary),
    });

    traceLog.push({
      name: "READABLE_CANDIDATE_COUNT_SAFE",
      status: "success",
      detail: JSON.stringify({
        candidateDocCountTotal: state.workspace.candidateDocs.length,
        readableCandidateUnreadCount,
        inventoryOnlyCandidateCount,
      }),
    });

    const gateV2 = state.evidenceGateV2;
    const readDocCount = state.workspace.readDocuments.length;
    const readBlockContextCount = state.workspace.readBlockContexts.length;
    const hasReadEvidence = readDocCount > 0 || readBlockContextCount > 0;
    const needsKnowledgeBase = state.runtimeTurnFacts?.modeRequiresKb !== false;

    let allowedEvidenceModes: string[] | undefined;
    if (hasAnswerAllowed) {
      if (needsKnowledgeBase) {
        if (gateV2?.status === "sufficient" && hasReadEvidence) {
          allowedEvidenceModes = ["with_evidence"];
        } else if (gateV2?.status === "insufficient_final" && !hasReadEvidence) {
          allowedEvidenceModes = ["insufficient_evidence"];
        } else {
          allowedEvidenceModes = ["with_evidence", "insufficient_evidence"];
        }
      } else {
        allowedEvidenceModes = ["without_kb_evidence"];
      }
    }

    traceLog.push({
      name: "PLANNER_ALLOWED_EVIDENCE_MODES_SAFE",
      status: "success",
      detail: JSON.stringify({
        hasAnswerAllowed,
        gateV2Status: gateV2?.status,
        readDocCount,
        readBlockContextCount,
        needsKnowledgeBase,
        allowedEvidenceModeCount: allowedEvidenceModes?.length ?? 0,
      }),
    });

    const isAnswerOnlyControl = effectiveAllowedActions.length === 1 && effectiveAllowedActions[0] === "answer";

    let prompt: string;
    if (isAnswerOnlyControl) {
      const evidenceModeEnum = allowedEvidenceModes && allowedEvidenceModes.length > 0
        ? allowedEvidenceModes.map((m) => `"${m}"`).join(" | ")
        : "\"with_evidence\" | \"insufficient_evidence\"";
      const readDocCountVal = state.workspace.readDocuments.length;
      const evidenceItemCount = readDocCountVal + readBlockContextCount;
      const sections: string[] = [];
      sections.push("## 用户问题");
      sections.push(state.question);
      sections.push("");
      sections.push("## 证据状态");
      sections.push(`已读文档: ${readDocCountVal}，证据条目: ${evidenceItemCount}`);
      sections.push("");
      sections.push("## 允许的 evidenceMode");
      sections.push(evidenceModeEnum);
      sections.push("");
      sections.push("## 输出格式");
      sections.push(`{ "type": "answer", "reason": "string", "args": { "evidenceMode": ${evidenceModeEnum} }, "confidence": number }`);
      sections.push("");
      sections.push("只输出 JSON。");
      prompt = sections.join("\n");
    } else {
      prompt = buildAgentPlannerPrompt({
        currentQuestion: state.question,
        scopeSummary,
        workspaceSummary,
        availableTools,
        plannerContextPack,
        currentDate: state.currentDate,
        currentDateTime: state.currentDateTime,
        structureContextBrief: buildStructureContextBrief(state.workspace.activeFocusScope),
        lastActionValidationError: state.lastActionValidationError,
        allowedEvidenceModes,
      });
    }

    traceLog.push({
      name: "PLANNER_PROMPT_BUILD_SAFE",
      status: "success",
      detail: JSON.stringify({
        isAnswerOnlyControl,
        promptLength: prompt.length,
        state: plannerContextPack.state.current,
      }),
    });

    let rawPlannerAction: unknown;
    try {
      const plannerCallStartMs = Date.now();
      const plannerTimeoutController = new AbortController();
      let plannerTimeoutId: ReturnType<typeof setTimeout> | undefined;

      if (abortSignal?.aborted) {
        plannerTimeoutController.abort(abortSignal.reason);
      } else {
        const PLANNER_TIMEOUT_MS = 45000;
        plannerTimeoutId = setTimeout(() => plannerTimeoutController.abort(new Error("PLANNER_TIMEOUT")), PLANNER_TIMEOUT_MS);
        if (abortSignal) {
          abortSignal.addEventListener("abort", () => plannerTimeoutController.abort(abortSignal.reason), { once: true });
        }
      }

      try {
        const answerOnlyMaxTokens = isAnswerOnlyControl ? 200 : CONTROL_PLANE_JSON_MAX_OUTPUT_TOKENS;
        rawPlannerAction = await callLlmObject(
          prompt,
          dynamicSchema,
          { abortSignal: plannerTimeoutController.signal, maxOutputTokens: answerOnlyMaxTokens, purpose: "planner", temperature: isAnswerOnlyControl ? 0.1 : undefined }
        );
      } finally {
        if (plannerTimeoutId !== undefined) clearTimeout(plannerTimeoutId);
      }

      const plannerCallDurationMs = Date.now() - plannerCallStartMs;
      traceLog.push({
        name: "PLANNER_CALL_TIMING_SAFE",
        status: "success",
        detail: JSON.stringify({
          durationMs: plannerCallDurationMs,
        }),
      });

      const sanitizedRaw = deepRemoveForbiddenFields(rawPlannerAction, []) as Record<string, unknown> | null;
      const removedFieldsCount = countForbiddenFields(rawPlannerAction);
      const rawConstraints = sanitizedRaw?.constraints as Record<string, unknown> | undefined;
      traceLog.push({
        name: "PLANNER_ACTION_RAW",
        status: "success",
        detail: JSON.stringify({
          type: sanitizedRaw?.type,
          reason: sanitizedRaw?.reason,
          args: sanitizeArgsForLog(sanitizedRaw?.args),
          confidence: sanitizedRaw?.confidence,
          removedForbiddenFields: removedFieldsCount > 0 ? removedFieldsCount : undefined,
          constraintsPresent: !!rawConstraints,
          requireUnreadFromPreviousTurn: rawConstraints?.requireUnreadFromPreviousTurn === true ? true : undefined,
        }),
      });
    } catch (llmErr) {
      if (isAnswerOnlyControl) {
        try {
          traceLog.push({
            name: "PLANNER_ANSWER_ONLY_RAW_RETRY_SAFE",
            status: "success",
            detail: JSON.stringify({ reason: "structured_output_failed_trying_raw_json" }),
          });
          const rawRetryStartMs = Date.now();
          rawPlannerAction = await callLlmJson(prompt, {
            abortSignal,
            maxOutputTokens: 512,
            purpose: "planner",
          });
          const rawRetryDurationMs = Date.now() - rawRetryStartMs;
          traceLog.push({
            name: "PLANNER_ANSWER_ONLY_RAW_RETRY_RESULT_SAFE",
            status: "success",
            detail: JSON.stringify({ durationMs: rawRetryDurationMs }),
          });
        } catch (rawRetryErr) {
          const plannerFailure = buildPlannerFailureFromError(llmErr, state);
          traceLog.push({
            name: "PLANNER_FAILED_NO_ACTION_SAFE",
            status: "failed",
            detail: JSON.stringify({
              errorKind: "answer_only_raw_retry_failed",
              allowedActionCount: 1,
              retryCount: plannerFailure.retryCount,
            }),
          });
          const newState: AgenticRagState = {
            ...state,
            plannerAction: undefined,
            plannerValidationWarnings: undefined,
            plannerMaterializedAction: undefined,
            plannerMaterializationWarnings: undefined,
            plannerMaterializeDebugSummary: undefined,
            plannerMaterializerMetadata: undefined,
            plannerFailure,
            currentAction: undefined,
            traceLog,
          };
          return { state: newState };
        }
      } else {
      const plannerFailure = buildPlannerFailureFromError(llmErr, state);
      const llmErrorMessage = llmErr instanceof Error ? llmErr.message : String(llmErr);

      if (plannerFailure.errorKind === "control_plane_failed") {
        traceLog.push({
          name: "PLANNER_CONTROL_PLANE_FAILED_SAFE",
          status: "failed",
          detail: JSON.stringify({
            providerType: "unknown",
            modelLabel: "unknown",
            strategy: "raw_first",
            retryCount: plannerFailure.retryCount,
            reasonCode: llmErrorMessage.includes("timeout") ? "timeout" : llmErrorMessage.includes("empty") ? "empty_response" : llmErrorMessage.includes("JSON") || llmErrorMessage.includes("parse") ? "json_parse_failed" : "provider_error",
            allowStructuredFallback: false,
          }),
        });
      }

      traceLog.push({
        name: "PLANNER_FAILED_NO_ACTION_SAFE",
        status: "failed",
        detail: JSON.stringify({
          providerType: plannerFailure.providerType,
          modelLabel: plannerFailure.modelLabel,
          durationMs: plannerFailure.durationMs,
          errorKind: plannerFailure.errorKind,
          allowedActionCount: plannerFailure.allowedActionCount,
          retryCount: plannerFailure.retryCount,
        }),
      });

      const newState: AgenticRagState = {
        ...state,
        plannerAction: undefined,
        plannerValidationWarnings: undefined,
        plannerMaterializedAction: undefined,
        plannerMaterializationWarnings: undefined,
        plannerMaterializeDebugSummary: undefined,
        plannerMaterializerMetadata: undefined,
        plannerFailure,
        currentAction: undefined,
        traceLog,
      };

      return { state: newState };
      }
    }

    const runtimeFacts = {
      previousReferenceDocIds: state.followUpContext?.previousReferenceDocIds,
      candidateDocCount: state.workspace.candidateDocs.length,
      candidateBlockCount: state.workspace.candidateBlocks.length,
      candidateUnreadCount,
      allowedActionTypes: dynamicSchemaAllowedActions as string[],
      queryText: state.question,
      primaryQuery: state.question,
    };

    const normalizeResult = normalizePlannerAction(rawPlannerAction, runtimeFacts);

    if (normalizeResult.normalizeFailed) {
      traceLog.push({
        name: "PLANNER_NORMALIZE_FAILED_SAFE",
        status: "failed",
        detail: JSON.stringify({
          originalType: (rawPlannerAction as Record<string, unknown>)?.type,
          normalizeFailureReason: normalizeResult.normalizeFailureReason,
          validationWarningCount: normalizeResult.validationWarnings.length,
        }),
      });

      const previousRetryCount = state.plannerFailure?.retryCount ?? 0;
      const plannerFailure = {
        errorKind: "normalize_failed" as const,
        allowedActionCount: dynamicSchemaAllowedActions.length,
        retryCount: previousRetryCount + 1,
        normalizeFailureReason: normalizeResult.normalizeFailureReason,
      };

      const newState: AgenticRagState = {
        ...state,
        plannerAction: undefined,
        plannerValidationWarnings: normalizeResult.validationWarnings.length > 0 ? normalizeResult.validationWarnings : undefined,
        plannerMaterializedAction: undefined,
        plannerMaterializationWarnings: undefined,
        plannerMaterializeDebugSummary: undefined,
        plannerMaterializerMetadata: undefined,
        plannerFailure,
        currentAction: undefined,
        lastActionValidationError: {
          actionType: (rawPlannerAction as Record<string, unknown>)?.type as string | undefined,
          reason: normalizeResult.normalizeFailureReason,
        },
        traceLog,
      };

      return { state: newState };
    }

    const validatedAction = normalizeResult.action!;
    const validationWarnings = normalizeResult.validationWarnings;

    if (normalizeResult.validationWarnings.length > 0) {
      traceLog.push({
        name: "PLANNER_ACTION_REJECTED",
        status: "failed",
        detail: JSON.stringify({
          originalType: (rawPlannerAction as Record<string, unknown>)?.type,
          validationWarningCount: normalizeResult.validationWarnings.length,
          firstWarning: normalizeResult.validationWarnings[0],
        }),
      });
    }

    traceLog.push({
      name: "PLANNER_ACTION_VALIDATED",
      status: "success",
      detail: JSON.stringify({
        type: validatedAction.type,
        reason: validatedAction.reason,
        args: sanitizeArgsForLog(validatedAction.args),
        confidence: validatedAction.confidence,
        validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
        constraintsPresent: !!validatedAction.constraints,
        requireUnreadFromPreviousTurn: validatedAction.constraints?.requireUnreadFromPreviousTurn ?? false,
      }),
    });

    appendPlannerSelectedTrace(traceLog, validatedAction.type);

    const materializeResult = materializePlannerAction({
      plannerAction: validatedAction,
      workspace: state.workspace,
      budget: state.budget,
      counters: state.counters,
      followUpContext: state.followUpContext,
      runtimeTurnFacts: state.runtimeTurnFacts,
      turnContextFact: state.turnContextFact,
      recentContext: state.runtime?.recentContext,
    });

    appendPlannerMaterializerTrace(traceLog, materializeResult);

    const materializedFrom = materializeResult.action?.type !== validatedAction.type
      ? validatedAction.type
      : undefined;

    console.info("[KB-AGENT | AGENTIC_DECISION_SOURCE_SAFE]", {
      actionType: materializeResult.action?.type ?? validatedAction.type,
      decisionSource: "ai_planner",
      strictAgentMode: true,
      state: plannerContextPack.state.current,
      materializedFrom,
    });

    const currentActionType = validatedAction.type;
    const history = state.actionHistory;
    let sameActionConsecutiveCount = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].type === currentActionType) {
        sameActionConsecutiveCount++;
      } else {
        break;
      }
    }
    const totalActionTypeCount = history.filter((a) => a.type === currentActionType).length;
    const invalidActionCount = state.plannerFailure?.retryCount ?? 0;

    pushAgentDebugEvent("PLANNER_ACTION_REPEAT_STATS_SAFE", {
      loopIndex: history.length,
      actionType: currentActionType,
      sameActionConsecutiveCount,
      totalActionTypeCount,
      invalidActionCount,
      decisionSource: "ai_planner",
    }, "info");

    const decisionGuard = checkPlannerDecisionGuard({
      plannerAction: validatedAction,
      decisionSource: "ai_planner",
      materializedAction: materializeResult.action,
      materializedFrom,
    });
    const focusGuard = checkFocusDocScopeHandlesGuard({ action: validatedAction });
    const combinedGuard = {
      ok: decisionGuard.ok && focusGuard.ok,
      violations: [...decisionGuard.violations, ...focusGuard.violations],
    };
    emitFirstPrinciplesViolation(traceLog, combinedGuard, "plan_next_action");

    if (!combinedGuard.ok) {
      const newState: AgenticRagState = {
        ...state,
        plannerAction: undefined,
        plannerValidationWarnings: undefined,
        plannerMaterializedAction: undefined,
        plannerMaterializationWarnings: undefined,
        plannerMaterializeDebugSummary: undefined,
        plannerMaterializerMetadata: undefined,
        plannerFailure: {
          errorKind: "normalize_failed" as const,
          allowedActionCount: 0,
          retryCount: (state.plannerFailure?.retryCount ?? 0) + 1,
          normalizeFailureReason: `first principles violation: ${combinedGuard.violations.map((v) => v.rule).join(", ")}`,
        },
        currentAction: undefined,
        traceLog,
      };
      return { state: newState };
    }

    const newState: AgenticRagState = {
      ...state,
      plannerAction: validatedAction,
      plannerValidationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
      plannerMaterializedAction: materializeResult.action,
      plannerMaterializationWarnings: materializeResult.warnings.length > 0 ? materializeResult.warnings : undefined,
      plannerMaterializeDebugSummary: materializeResult.debugSummary,
      plannerMaterializerMetadata: materializeResult.previousReferenceMetadata,
      traceLog,
    };

    return { state: newState };
  } catch (err) {
    if (err instanceof AiProviderUnavailableError) {
      if (state.trace) {
        console.info("[KB-AGENT | AI_PROVIDER_UNAVAILABLE]", {
          providerType: err.providerType,
          providerLabel: err.providerLabel,
          modelLabel: err.modelId,
          status: err.status,
          errorType: err.errorType,
        });
      }
      throw err;
    }

    const plannerFailure = buildPlannerFailureFromError(err, state);
    traceLog.push({
      name: "PLANNER_FAILED_NO_ACTION_SAFE",
      status: "failed",
      detail: JSON.stringify({
        providerType: plannerFailure.providerType,
        modelLabel: plannerFailure.modelLabel,
        durationMs: plannerFailure.durationMs,
        errorKind: plannerFailure.errorKind,
        allowedActionCount: plannerFailure.allowedActionCount,
        retryCount: plannerFailure.retryCount,
      }),
    });

    const isJsonOrSchemaError = plannerFailure.errorKind === "json_parse_failed";
    const lastActionValidationError = isJsonOrSchemaError
      ? {
          reason: "上次输出不是合法 JSON 或不符合 schema，请只输出 canonical JSON action",
        }
      : state.lastActionValidationError;

    const newState: AgenticRagState = {
      ...state,
      plannerAction: undefined,
      plannerValidationWarnings: undefined,
      plannerMaterializedAction: undefined,
      plannerMaterializationWarnings: undefined,
      plannerMaterializeDebugSummary: undefined,
      plannerMaterializerMetadata: undefined,
      plannerFailure,
      currentAction: undefined,
      lastActionValidationError,
      traceLog,
    };

    return { state: newState };
  }
}

function buildPlannerFailureFromError(
  err: unknown,
  state: AgenticRagState,
): NonNullable<AgenticRagState["plannerFailure"]> {
  const plannerContextPack = buildPlannerContextPack({ state });
  const allowedActionCount = plannerContextPack.state.allowedActions.length;
  const previousRetryCount = state.plannerFailure?.retryCount ?? 0;

  let errorKind: NonNullable<AgenticRagState["plannerFailure"]>["errorKind"] = "node_error";
  let isControlPlaneFailure = false;
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("PLANNER_TIMEOUT") || (err instanceof Error && err.name === "AbortError")) {
    errorKind = "timeout";
    isControlPlaneFailure = true;
  } else if (message.includes("JSON") || message.includes("schema") || message.includes("parse")) {
    errorKind = "json_parse_failed";
    isControlPlaneFailure = true;
  } else if (message.includes("空") || message.includes("empty")) {
    errorKind = "empty_response";
    isControlPlaneFailure = true;
  } else if (err instanceof AiProviderUnavailableError) {
    errorKind = "llm_call_failed";
    isControlPlaneFailure = true;
  } else if (message.includes("structured_fallback") || message.includes("raw_first")) {
    errorKind = "control_plane_failed";
    isControlPlaneFailure = true;
  }

  if (isControlPlaneFailure && errorKind !== "control_plane_failed") {
    errorKind = "control_plane_failed";
  }

  return {
    errorKind,
    allowedActionCount,
    retryCount: previousRetryCount + 1,
  };
}
