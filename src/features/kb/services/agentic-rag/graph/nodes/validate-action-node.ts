/**
 * Validate Action Node
 *
 * 验证 state.currentAction，使用 action-normalizer 统一 trim/dedup/clamp。
 *
 * 职责：
 * - 读取 state.currentAction
 * - 如果没有 currentAction，追加 warning/trace，保持 state
 * - 使用现有 validate/parse AgentAction
 * - parse 成功后调用 normalizeAgentAction
 * - 将 normalizedAction 写回 state.currentAction
 * - 如果 action.type === "answer"，写入 state.finalAnswerAction
 * - 如果不是 answer：
 *   - 在 state.availableTools 中按 name 找工具
 *   - 找不到或不可用时，warnings + counters.invalidActionCount +1
 *   - 不抛致命错误
 * - ID 型工具参数必须来自系统已知 allowlist，禁止模型编造 docId/blockId
 * - 校验失败时不进入 execute_action，写 trace/debug，invalidActionCount +1
 * - 不做语义 fallback，不根据用户问题改 action.type
 */

import type { AgenticRagState, ActionValidationState } from "../state";
import { parseAgentAction } from "../../actions/action-validation";
import { normalizeAgentAction, type ActionBudgetLimits, type AgentAction } from "../../actions/action-normalizer";
import { buildAllowedToolIds } from "../../actions/action-validation";
import { debugActionIdGuard, debugValidationGate } from "../../debug/agentic-rag-debug";
import { deriveKbAgentStateContext } from "../../harness/state/state-machine";
import { pushAgentDebugEvent } from "../../debug/agentic-rag-debug";
import {
  checkActionBoundaryGuard,
  checkPlannerAllowedActionsGuard,
  emitFirstPrinciplesViolation,
} from "../../harness/guards/first-principles-guard";
import { isInventoryOnlyCandidateDoc } from "../../workspace/candidate-quality";

export interface AnswerValidationResult {
  ok: boolean;
  violation?: string;
  evidenceMode?: string;
  answerKind?: string;
  gateV2Status?: string;
  readDocCount: number;
  validated: boolean;
}

export function validateAnswerActionAgainstEvidenceState(params: {
  evidenceMode: string;
  answerKind?: string;
  gateV2Status?: string;
  readDocCount: number;
  readBlockContextCount: number;
  needsKnowledgeBase: boolean;
}): AnswerValidationResult {
  const { evidenceMode, answerKind, gateV2Status, readDocCount, readBlockContextCount, needsKnowledgeBase } = params;
  const hasReadEvidence = readDocCount > 0 || readBlockContextCount > 0;

  if (answerKind === "needs_clarification") {
    if (hasReadEvidence && gateV2Status === "sufficient") {
      return {
        ok: false,
        violation: "answerKind=needs_clarification 不适用于已有充分证据的场景",
        evidenceMode,
        answerKind,
        gateV2Status,
        readDocCount,
        validated: false,
      };
    }
    return {
      ok: true,
      evidenceMode,
      answerKind,
      gateV2Status,
      readDocCount,
      validated: true,
    };
  }

  if (needsKnowledgeBase && evidenceMode === "without_kb_evidence") {
    return {
      ok: false,
      violation: "evidenceMode=without_kb_evidence 不适用于需要知识库证据的场景",
      evidenceMode,
      answerKind,
      gateV2Status,
      readDocCount,
      validated: false,
    };
  }

  if (needsKnowledgeBase && gateV2Status === "sufficient" && hasReadEvidence && evidenceMode !== "with_evidence") {
    return {
      ok: false,
      violation: `evidenceMode=${evidenceMode} 不适用于证据充足的场景，应使用 with_evidence`,
      evidenceMode,
      answerKind,
      gateV2Status,
      readDocCount,
      validated: false,
    };
  }

  if (needsKnowledgeBase && gateV2Status === "insufficient_final" && !hasReadEvidence && evidenceMode !== "insufficient_evidence") {
    return {
      ok: false,
      violation: `evidenceMode=${evidenceMode} 不适用于证据不足终态，应使用 insufficient_evidence`,
      evidenceMode,
      answerKind,
      gateV2Status,
      readDocCount,
      validated: false,
    };
  }

  return {
    ok: true,
    evidenceMode,
    answerKind,
    gateV2Status,
    readDocCount,
    validated: true,
  };
}

export interface ValidateActionNodeInput {
  state: AgenticRagState;
}

export interface ValidateActionNodeOutput {
  state: AgenticRagState;
}

function buildBudgetLimits(state: AgenticRagState): ActionBudgetLimits {
  const { budget } = state;
  return {
    maxQueries: budget.maxQueriesPerSearch,
    maxDocIds: budget.maxReadDocs,
    maxBlockIds: budget.maxBlockContexts,
    maxLimit: budget.maxContextChars,
    maxCharsPerDoc: budget.maxContextChars,
    maxCharsPerBlock: budget.maxContextChars,
  };
}

/**
 * search_scope query guard：验证 search_scope query 结构
 * 
 * 只检查：
 * - query 非空
 * - query 数量不超过上限
 * - query 文本不为空、长度不低于下限
 * 
 * search_scope query guard 只校验结构、数量和空值；不理解、不改写、不替换自然语言 query。
 */
function validateSearchQuery(action: AgentAction, state: AgenticRagState): { ok: boolean; reason?: string } {
  if (action.type !== "search_scope") {
    return { ok: true };
  }

  const args = action.args as unknown as Record<string, unknown> | undefined;
  const queries = args?.queries as Array<{ text?: string }> | undefined;
  if (!queries || queries.length === 0) {
    return { ok: false, reason: "search_scope 缺少 queries 参数" };
  }

  const maxQueries = state.budget.maxQueriesPerSearch ?? 5;
  if (queries.length > maxQueries) {
    return { ok: false, reason: `search_scope queries 数量 ${queries.length} 超过上限 ${maxQueries}` };
  }

  for (const q of queries) {
    if (!q.text || q.text.trim().length === 0) {
      return { ok: false, reason: "search_scope query 为空" };
    }
    if (q.text.trim().length < 2) {
      return { ok: false, reason: "search_scope query 过短" };
    }
  }

  return { ok: true };
}

export function validateActionNode(input: ValidateActionNodeInput): ValidateActionNodeOutput {
  const { state } = input;
  const { currentAction } = state;

  const traceLog = [...state.traceLog];
  const warnings = [...state.warnings];
  const counters = { ...state.counters };

  if (!currentAction) {
    traceLog.push({
      name: "validate_action",
      status: "skipped",
      detail: "没有可校验的 currentAction",
    });
    warnings.push("未提供 currentAction");
    const actionValidation: ActionValidationState = {
      ok: false,
      reason: "没有可校验的 currentAction",
    };
    return {
      state: {
        ...state,
        actionValidation,
        lastActionValidationError: undefined,
        warnings,
        traceLog,
        counters,
      },
    };
  }

  const parsed = parseAgentAction(currentAction);
  if (!parsed.ok) {
    const errorMessages = (parsed as Extract<typeof parsed, { ok: false }>).errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    traceLog.push({
      name: "validate_action",
      status: "failed",
      detail: `动作格式无效：${errorMessages}`,
    });
    warnings.push(`动作格式无效：${errorMessages}`);
    counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
    const actionValidation: ActionValidationState = {
      ok: false,
      actionType: currentAction.type,
      reason: `动作格式无效：${errorMessages}`,
    };
    return {
      state: {
        ...state,
        currentAction: undefined,
        actionValidation,
        lastActionValidationError: {
          actionType: currentAction.type,
          reason: `动作格式无效：${errorMessages}`,
        },
        warnings,
        traceLog,
        counters,
      },
    };
  }

  const budgetLimits = buildBudgetLimits(state);
  const parsedAction = parsed.data as AgentAction;

  // ACTION_QUERY_GUARD: 结构化 query 结构校验
  const queryGuardResult = validateSearchQuery(parsedAction, state);
  if (!queryGuardResult.ok) {
    traceLog.push({
      name: "validate_action",
      status: "failed",
      detail: queryGuardResult.reason,
    });
    warnings.push(queryGuardResult.reason ?? "search_scope query 校验失败");
    counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
    const actionValidation: ActionValidationState = {
      ok: false,
      actionType: parsedAction.type,
      reason: queryGuardResult.reason,
    };
    return {
      state: {
        ...state,
        currentAction: undefined,
        actionValidation,
        lastActionValidationError: {
          actionType: parsedAction.type,
          reason: queryGuardResult.reason,
        },
        warnings,
        traceLog,
        counters,
      },
    };
  }

  let finalAction = parsedAction;

  // ─── 重复无进展 validation guard ───
  // 如果当前 action.type 与最近连续 N 次相同，且这些 action 都没有增加进展，则 reject
  // 对 answer 不做此校验
  const REPEATED_NO_PROGRESS_THRESHOLD = 2;
  if (finalAction.type !== "answer") {
    const recentActions = state.actionHistory.slice(-REPEATED_NO_PROGRESS_THRESHOLD);
    const allSameType = recentActions.length >= REPEATED_NO_PROGRESS_THRESHOLD
      && recentActions.every((a) => a.type === finalAction.type);

    if (allSameType) {
      const hasProgress = state.workspace.readDocuments.length > 0
        || state.workspace.candidateDocs.length > 0
        || state.workspace.readBlockContexts.length > 0
        || state.counters.searchCallCount > 0
        || state.workspace.activeFocusScope !== undefined;

      if (!hasProgress) {
        traceLog.push({
          name: "REPEATED_NO_PROGRESS_ACTION_SAFE",
          status: "failed",
          detail: JSON.stringify({
            actionType: finalAction.type,
            recentActionCount: recentActions.length,
            threshold: REPEATED_NO_PROGRESS_THRESHOLD,
          }),
        });
        warnings.push(`动作 ${finalAction.type} 连续 ${recentActions.length} 次无进展`);
        counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
        pushAgentDebugEvent("REPEATED_NO_PROGRESS_ACTION_SAFE", {
          actionType: finalAction.type,
          recentActionCount: recentActions.length,
        }, "warn");
        return {
          state: {
            ...state,
            currentAction: undefined,
            actionValidation: {
              ok: false,
              actionType: finalAction.type,
              reason: "repeated_no_progress_action",
            },
            lastActionValidationError: {
              actionType: finalAction.type,
              reason: "repeated_no_progress_action",
            },
            warnings,
            traceLog,
            counters,
          },
        };
      }
    }
  }

  const normalizedAction = normalizeAgentAction(finalAction, budgetLimits);
  const parsedActionType = normalizedAction.type;

  // ─── 区分 PlannerAction 与 materialized ExecutionAction ───
  // read_docs 是执行层动作，不暴露给 Planner。如果它来自合法
  // read_candidate_docs / read_previous_evidence 的 materialization，
  // 不应被 Planner allowedActions / forbiddenActions 拒绝。
  const isMaterialized = isMaterializedExecutionAction(normalizedAction, state);
  const materializedFrom = isMaterialized
    ? ((normalizedAction.args as Record<string, unknown>)?.readSource as string | undefined) ?? "unknown"
    : undefined;

  const stateContext = deriveKbAgentStateContext({ state });

  const boundaryGuard = checkActionBoundaryGuard({
    action: normalizedAction,
    isMaterialized,
    materializedFrom,
  });
  if (!boundaryGuard.ok) {
    emitFirstPrinciplesViolation(traceLog, boundaryGuard, "validate_action");
    counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
    return {
      state: {
        ...state,
        currentAction: undefined,
        actionValidation: {
          ok: false,
          actionType: normalizedAction.type,
          reason: `first principles violation: ${boundaryGuard.violations.map((v) => v.rule).join(", ")}`,
        },
        lastActionValidationError: {
          actionType: normalizedAction.type,
          reason: `first principles violation: ${boundaryGuard.violations.map((v) => v.rule).join(", ")}`,
        },
        warnings,
        traceLog,
        counters,
      },
    };
  }

  const allowedActionsGuard = checkPlannerAllowedActionsGuard({
    allowedActions: stateContext.allowedActions,
  });
  if (!allowedActionsGuard.ok) {
    emitFirstPrinciplesViolation(traceLog, allowedActionsGuard, "validate_action_state_context");
    counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
    return {
      state: {
        ...state,
        currentAction: undefined,
        actionValidation: {
          ok: false,
          actionType: parsedActionType,
          reason: `first principles violation: ${allowedActionsGuard.violations.map((v) => v.rule).join(", ")}`,
        },
        lastActionValidationError: {
          actionType: parsedActionType,
          reason: `first principles violation: ${allowedActionsGuard.violations.map((v) => v.rule).join(", ")}`,
        },
        warnings,
        traceLog,
        counters,
      },
    };
  }

  // 非 materialized 动作：PlannerAction → 必须通过 allowedActions/forbiddenActions 检查
  if (!isMaterialized) {
    const isActionAllowed = stateContext.allowedActions.includes(parsedActionType as any);
    const isActionForbidden = stateContext.forbiddenActions.includes(parsedActionType as any);

      if (!isActionAllowed || isActionForbidden) {
        traceLog.push({
          name: "PLANNER_ACTION_REJECTED_BY_STATE_SAFE",
          status: "failed",
          detail: JSON.stringify({
            actionType: parsedActionType,
            state: stateContext.state,
            isAllowed: isActionAllowed,
            isForbidden: isActionForbidden,
            allowedActionCount: stateContext.allowedActions.length,
            forbiddenActionCount: stateContext.forbiddenActions.length,
          }),
        });
        warnings.push(`动作 ${parsedActionType} 在状态 ${stateContext.state} 中不允许`);
        counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
        const actionValidation: ActionValidationState = {
          ok: false,
          actionType: parsedActionType,
          reason: `动作 ${parsedActionType} 在当前状态 ${stateContext.state} 中不允许`,
        };
        pushAgentDebugEvent("PLANNER_ACTION_REJECTED_BY_STATE_SAFE", {
          actionType: parsedActionType,
          state: stateContext.state,
          allowedActionCount: stateContext.allowedActions.length,
        }, "warn");
        return {
          state: {
            ...state,
            currentAction: undefined,
            actionValidation,
            lastActionValidationError: {
              actionType: parsedActionType,
              reason: `动作 ${parsedActionType} 在当前状态 ${stateContext.state} 中不允许`,
            },
            warnings,
            traceLog,
            counters,
          },
        };
      }
    }
    // else: materialized execution action → skip Planner allowedActions,
    // proceed to execution contract validation below

  if (normalizedAction.type === "answer") {
    const answerEvidenceMode = normalizedAction.args?.evidenceMode;
    const answerKind = normalizedAction.args?.answerKind;
    const gateV2 = state.evidenceGateV2;
    const readDocCount = state.workspace.readDocuments.length;
    const readBlockContextCount = state.workspace.readBlockContexts.length;
    const needsKnowledgeBase = state.runtimeTurnFacts?.modeRequiresKb !== false;

    const answerValidation = validateAnswerActionAgainstEvidenceState({
      evidenceMode: answerEvidenceMode,
      answerKind,
      gateV2Status: gateV2?.status,
      readDocCount,
      readBlockContextCount,
      needsKnowledgeBase,
    });

    const answerValidationPayload = {
      source: "validateActionNode",
      gateV2Status: gateV2?.status,
      readDocCount,
      evidenceMode: answerEvidenceMode,
      answerKind,
      validated: answerValidation.ok,
    };
    traceLog.push({
      name: "ANSWER_VALIDATION_PATH_SAFE",
      status: answerValidation.ok ? "success" : "failed",
      detail: JSON.stringify(answerValidationPayload),
    });
    pushAgentDebugEvent("ANSWER_VALIDATION_PATH_SAFE", answerValidationPayload, answerValidation.ok ? "info" : "warn");
    pushAgentDebugEvent("PLANNER_TERMINAL_ANSWER_SAFE", {
      answerKind: answerKind ?? "unspecified",
      evidenceMode: answerEvidenceMode,
      gateV2Status: gateV2?.status ?? "unknown",
      readDocCount,
      validated: answerValidation.ok,
    }, answerValidation.ok ? "info" : "warn");

    if (!answerValidation.ok) {
      traceLog.push({
        name: "ANSWER_EVIDENCE_MODE_VALIDATION_FAILED",
        status: "failed",
        detail: JSON.stringify({
          evidenceMode: answerEvidenceMode,
          gateV2Status: gateV2?.status,
          readDocCount,
          readBlockContextCount,
          needsKnowledgeBase,
          reason: answerValidation.violation,
        }),
      });
      counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
      return {
        state: {
          ...state,
          currentAction: undefined,
          actionValidation: {
            ok: false,
            actionType: "answer",
            reason: answerValidation.violation,
          },
          lastActionValidationError: {
            actionType: "answer",
            reason: answerValidation.violation,
          },
          warnings,
          traceLog,
          counters,
        },
      };
    }

    traceLog.push({
      name: "validate_action",
      status: "success",
      detail: "answer 动作已校验并归一化，写入 finalAnswerAction",
    });
    traceLog.push({
      name: "ANSWER_VALIDATED_AND_FINALIZED",
      status: "success",
      detail: JSON.stringify({
        evidenceMode: normalizedAction.args?.evidenceMode ?? "unknown",
        reason: normalizedAction.reason?.substring(0, 100),
      }),
    });
    const actionValidation: ActionValidationState = {
      ok: true,
      actionType: "answer",
    };
    return {
      state: {
        ...state,
        currentAction: undefined,
        finalAnswerAction: normalizedAction,
        actionValidation,
        lastActionValidationError: undefined,
        traceLog,
        counters,
      },
    };
  }

  let allowedIds = buildAllowedToolIds(state);

  if (normalizedAction.type === "read_docs") {
    const args = (normalizedAction.args as unknown) as Record<string, unknown>;
    const readSource = args?.readSource as string | undefined;

    if (readSource === "previous_evidence") {
      const enhancedDocIds = new Set(allowedIds.allowedDocIds);
      let followUpDocCount = 0;
      let conversationRefDocCount = 0;
      let recentRefDocCount = 0;

      if (state.followUpContext?.previousReferenceDocIds) {
        for (const id of state.followUpContext.previousReferenceDocIds) {
          if (id && id.trim().length > 0 && !enhancedDocIds.has(id)) {
            enhancedDocIds.add(id);
            followUpDocCount++;
          }
        }
      }

      if (state.workspace.conversationUsedReferences) {
        for (const turnRef of state.workspace.conversationUsedReferences) {
          for (const ref of turnRef.references ?? []) {
            if (ref.internalDocId && ref.internalDocId.trim().length > 0 && !enhancedDocIds.has(ref.internalDocId)) {
              enhancedDocIds.add(ref.internalDocId);
              conversationRefDocCount++;
            }
          }
        }
      }

      const recentDocIds = state.runtime?.recentContext?.lastReferenceDocIds;
      if (Array.isArray(recentDocIds)) {
        for (const id of recentDocIds) {
          if (id && id.trim().length > 0 && !enhancedDocIds.has(id)) {
            enhancedDocIds.add(id);
            recentRefDocCount++;
          }
        }
      }

      const inputDocIds = (args?.docIds as string[]) ?? [];
      const inputDocCount = inputDocIds.length;
      const rejectedDocIds = inputDocIds.filter((id) => !enhancedDocIds.has(id));
      const baseAllowedDocCount = allowedIds.allowedDocIds.size;
      const finalAllowedDocCount = enhancedDocIds.size;

      pushAgentDebugEvent("VALIDATE_NODE_PREVIOUS_EVIDENCE_ID_GUARD_SAFE", {
        readSource,
        followUpDocCount,
        conversationRefDocCount,
        recentRefDocCount,
        baseAllowedDocCount,
        finalAllowedDocCount,
        inputDocCount,
        rejectedDocIdCount: rejectedDocIds.length,
      }, "info");

      allowedIds = {
        ...allowedIds,
        allowedDocIds: enhancedDocIds,
      };
    }
  }

  const idGuardResult = validateActionIds(normalizedAction, allowedIds);

  if (!idGuardResult.allowed) {
    const failureEventName = isMaterialized ? "MATERIALIZED_ACTION_ID_GUARD_FAILED_SAFE" : "validate_action";
    traceLog.push({
      name: failureEventName,
      status: "failed",
      detail: `ID 来源校验失败：${idGuardResult.reason}`,
    });
    warnings.push(idGuardResult.reason);
    if (!isMaterialized) {
      counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
    }

    if (state.trace) {
      debugActionIdGuard(state.trace, undefined, {
        actionType: normalizedAction.type,
        inputDocIds: idGuardResult.inputDocIds,
        allowedDocIds: Array.from(allowedIds.allowedDocIds),
        allowedDocIdsCount: allowedIds.allowedDocIds.size,
        rejectedDocIds: idGuardResult.rejectedDocIds,
        inputBlockIds: idGuardResult.inputBlockIds,
        allowedBlockIds: Array.from(allowedIds.allowedBlockIds),
        allowedBlockIdsCount: allowedIds.allowedBlockIds.size,
        rejectedBlockIds: idGuardResult.rejectedBlockIds,
        allowed: false,
        reason: idGuardResult.reason,
      });
    }

    const actionValidation: ActionValidationState = {
      ok: false,
      actionType: normalizedAction.type,
      reason: idGuardResult.reason,
      rejectedDocIds: idGuardResult.rejectedDocIds,
      rejectedBlockIds: idGuardResult.rejectedBlockIds,
    };

    if (state.trace) {
      debugValidationGate(state.trace, undefined, {
        ok: false,
        actionType: normalizedAction.type,
        reason: idGuardResult.reason,
        invalidActionCount: counters.invalidActionCount,
        rejectedDocIds: idGuardResult.rejectedDocIds,
        rejectedBlockIds: idGuardResult.rejectedBlockIds,
        willExecute: false,
      });
    }

    return {
      state: {
        ...state,
        currentAction: undefined,
        actionValidation,
        lastActionValidationError: {
          actionType: normalizedAction.type,
          reason: idGuardResult.reason,
          rejectedDocIds: idGuardResult.rejectedDocIds,
          rejectedBlockIds: idGuardResult.rejectedBlockIds,
        },
        warnings,
        traceLog,
        counters,
      },
    };
  }

  if (state.trace) {
    debugActionIdGuard(state.trace, undefined, {
      actionType: normalizedAction.type,
      inputDocIds: idGuardResult.inputDocIds,
      allowedDocIds: Array.from(allowedIds.allowedDocIds),
      allowedDocIdsCount: allowedIds.allowedDocIds.size,
      rejectedDocIds: idGuardResult.rejectedDocIds,
      inputBlockIds: idGuardResult.inputBlockIds,
      allowedBlockIds: Array.from(allowedIds.allowedBlockIds),
      allowedBlockIdsCount: allowedIds.allowedBlockIds.size,
      rejectedBlockIds: idGuardResult.rejectedBlockIds,
      allowed: true,
      reason: undefined,
    });
  }

  const tool = state.availableTools.find((t) => t.name === normalizedAction.type);

  // 白名单通道：deterministic read_candidate_docs 的内部批次读取
  // 如果 read_docs 不在 availableTools 中，但 action 是 read_candidate_docs materialized 的，
  // 且满足条件，则允许执行
  let availabilityBypass = false;
  let availabilityBypassReason: string | undefined;

  if (!tool && normalizedAction.type === "read_docs") {
    const args = (normalizedAction.args as unknown) as Record<string, unknown>;
    const readSource = args?.readSource as string | undefined;

    if (readSource === "search_scope" || readSource === "candidate_docs") {
      const maxTotalResearchDocs = state.budget.maxTotalResearchDocs ?? 20;
      const totalReadSoFar = state.workspace.readDocuments.length;
      const candidateResearchRemaining = Math.max(0, maxTotalResearchDocs - totalReadSoFar);

      const candidateDocIdSet = new Set(state.workspace.candidateDocs.map((d) => d.docId));
      const poolDocIdSet = new Set<string>();
      if (state.workspace.researchCandidatePool) {
        for (const id of state.workspace.researchCandidatePool.candidateDocIdsInRankOrder) {
          poolDocIdSet.add(id);
        }
      }

      const inputDocIds = (args?.docIds as string[]) ?? [];
      const allFromCandidates = inputDocIds.every(
        (id) => candidateDocIdSet.has(id) || poolDocIdSet.has(id)
      );

      const perBatchReadLimit = state.budget.perBatchReadLimit ?? Math.min(5, state.budget.maxReadDocs ?? 5);

      if (allFromCandidates && candidateResearchRemaining > 0 && inputDocIds.length <= perBatchReadLimit) {
        availabilityBypass = true;
        availabilityBypassReason = `deterministic read_candidate_docs bypass: readSource=${readSource}, candidateResearchRemaining=${candidateResearchRemaining}, inputDocCount=${inputDocIds.length} <= perBatchReadLimit=${perBatchReadLimit}`;

        if (state.trace) {
          debugValidationGate(state.trace, undefined, {
            ok: true,
            actionType: normalizedAction.type,
            reason: availabilityBypassReason,
            invalidActionCount: counters.invalidActionCount,
            rejectedDocIds: [],
            rejectedBlockIds: [],
            willExecute: true,
          });
        }

        console.info("[KB-AGENT | VALIDATION_GATE]", {
          ok: true,
          actionType: normalizedAction.type,
          readSource,
          candidateResearchRemaining,
          availabilityBypassReason,
        });
      }
    }
  }

  if (!tool && !availabilityBypass) {
    const toolFailEventName = isMaterialized ? "MATERIALIZED_ACTION_TOOL_UNAVAILABLE_SAFE" : "validate_action";
    traceLog.push({
      name: toolFailEventName,
      status: "failed",
      detail: `工具 ${normalizedAction.type} 不在当前可用工具列表中`,
    });
    warnings.push(`工具 ${normalizedAction.type} 当前不可用`);
    if (!isMaterialized) {
      counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
    }
    const actionValidation: ActionValidationState = {
      ok: false,
      actionType: normalizedAction.type,
      reason: `工具 ${normalizedAction.type} 不在当前可用工具列表中`,
    };
    traceLog.push({
      name: "TOOL_UNAVAILABLE_OBSERVATION_SAFE",
      status: "failed",
      detail: JSON.stringify({
        actionType: normalizedAction.type,
        availableToolCount: state.availableTools.length,
        hasKnowledgeMap: state.workspace.knowledgeMap?.loaded === true,
        candidateDocCount: state.workspace.candidateDocs.length,
        readDocCount: state.workspace.readDocuments.length,
      }),
    });
    pushAgentDebugEvent("TOOL_UNAVAILABLE_OBSERVATION_SAFE", {
      actionType: normalizedAction.type,
      availableToolCount: state.availableTools.length,
      hasKnowledgeMap: state.workspace.knowledgeMap?.loaded === true,
      candidateDocCount: state.workspace.candidateDocs.length,
      readDocCount: state.workspace.readDocuments.length,
    }, "warn");
    if (state.trace) {
      debugValidationGate(state.trace, undefined, {
        ok: false,
        actionType: normalizedAction.type,
        reason: `工具 ${normalizedAction.type} 当前不可用`,
        invalidActionCount: counters.invalidActionCount,
        rejectedDocIds: [],
        rejectedBlockIds: [],
        willExecute: false,
      });
    }
    return {
      state: {
        ...state,
        currentAction: undefined,
        actionValidation,
        lastActionValidationError: {
          actionType: normalizedAction.type,
          reason: `工具 ${normalizedAction.type} 不在当前可用工具列表中`,
        },
        warnings,
        traceLog,
        counters,
      },
    };
  }

  traceLog.push({
    name: isMaterialized ? "validate_action" : "validate_action",
    status: "success",
    detail: `动作 ${normalizedAction.type} 已校验并归一化，工具可用`,
  });

  if (isMaterialized && normalizedAction.type === "read_docs") {
    const args = (normalizedAction.args as unknown) as Record<string, unknown>;
    const docIds = ((args?.docIds as string[]) ?? []);

    if (materializedFrom === "read_candidate_docs") {
      const candidateDocMap = new Map(state.workspace.candidateDocs.map((d) => [d.docId, d]));
      const rejectedInventoryDocIds: string[] = [];
      for (const docId of docIds) {
        const candidate = candidateDocMap.get(docId);
        if (candidate && isInventoryOnlyCandidateDoc(candidate)) {
          rejectedInventoryDocIds.push(docId);
        }
      }
      if (rejectedInventoryDocIds.length > 0) {
        traceLog.push({
          name: "VALIDATE_MATERIALIZED_READ_DOCS_INVENTORY_REJECTED",
          status: "failed",
          detail: JSON.stringify({
            materializedFrom,
            inputDocCount: docIds.length,
            rejectedInventoryCount: rejectedInventoryDocIds.length,
          }),
        });
        counters.invalidActionCount = (counters.invalidActionCount ?? 0) + 1;
        return {
          state: {
            ...state,
            currentAction: undefined,
            actionValidation: {
              ok: false,
              actionType: "read_docs",
              reason: "materialized read_docs contains inventoryOnly candidates",
            },
            lastActionValidationError: {
              actionType: "read_docs",
              reason: "materialized read_docs contains inventoryOnly candidates",
            },
            warnings,
            traceLog,
            counters,
          },
        };
      }
    }

    console.info("[KB-AGENT | READ_DOCS_EXECUTION_VALIDATED_SAFE]", {
      docIdCount: docIds.length,
      candidateDocCount: state.workspace.candidateDocs.length,
      readDocCount: state.workspace.readDocuments.length,
      budgetRemaining: Math.max(0, (state.budget.maxTotalResearchDocs ?? 20) - state.workspace.readDocuments.length),
      materializedFrom,
      state: stateContext.state,
      reason: "materialized read_docs passed execution contract validation",
    });
  }

  const actionValidation: ActionValidationState = {
    ok: true,
    actionType: normalizedAction.type,
  };

  if (state.trace) {
    debugValidationGate(state.trace, undefined, {
      ok: true,
      actionType: normalizedAction.type,
      reason: undefined,
      invalidActionCount: counters.invalidActionCount,
      rejectedDocIds: [],
      rejectedBlockIds: [],
      willExecute: true,
    });
  }

  return {
    state: {
      ...state,
      currentAction: normalizedAction,
      actionValidation,
      lastActionValidationError: undefined,
      traceLog,
      counters,
    },
  };
}

interface ActionIdGuardResult {
  allowed: boolean;
  inputDocIds: string[];
  rejectedDocIds: string[];
  inputBlockIds: string[];
  rejectedBlockIds: string[];
  reason?: string;
}

/**
 * 检测 action 是否是从 Planner 安全动作物化而来的执行层动作。
 *
 * read_docs 是执行层动作，不暴露给 Planner。如果它来自合法
 * read_candidate_docs / read_previous_evidence 的 materialization，
 * 则跳过 Planner allowedActions 检查，走 execution contract 校验。
 */
function isMaterializedExecutionAction(
  action: AgentAction,
  _state: AgenticRagState,
): boolean {
  if (action.type !== "read_docs") return false;

  const args = action.args as unknown as Record<string, unknown> | undefined;
  const readSource = args?.readSource as string | undefined;

  // readSource 由 materializer 设置，只可能是 candidate_docs / search_scope / previous_evidence
  return readSource === "candidate_docs" || readSource === "search_scope" || readSource === "previous_evidence";
}

function validateActionIds(
  action: AgentAction,
  allowedIds: { allowedDocIds: Set<string>; allowedBlockIds: Set<string> }
): ActionIdGuardResult {
  const inputDocIds: string[] = [];
  const rejectedDocIds: string[] = [];
  const inputBlockIds: string[] = [];
  const rejectedBlockIds: string[] = [];

  const args = action.args as Record<string, unknown> | undefined;
  if (!args) {
    return { allowed: true, inputDocIds: [], rejectedDocIds: [], inputBlockIds: [], rejectedBlockIds: [] };
  }

  const docIds = Array.isArray(args.docIds) ? (args.docIds as string[]) : [];
  const blockIds = Array.isArray(args.blockIds) ? (args.blockIds as string[]) : [];

  for (const id of docIds) {
    inputDocIds.push(id);
    if (!allowedIds.allowedDocIds.has(id)) {
      rejectedDocIds.push(id);
    }
  }

  for (const id of blockIds) {
    inputBlockIds.push(id);
    if (!allowedIds.allowedBlockIds.has(id)) {
      rejectedBlockIds.push(id);
    }
  }

  if (rejectedDocIds.length === 0 && rejectedBlockIds.length === 0) {
    return { allowed: true, inputDocIds, rejectedDocIds, inputBlockIds, rejectedBlockIds };
  }

  let reason = "";
  if (rejectedDocIds.length > 0) {
    reason = `read_docs 的 docIds 不在当前候选或范围允许列表中，已拒绝执行，避免读取无效 ID。rejectedDocIdCount=${rejectedDocIds.length}`;
  }
  if (rejectedBlockIds.length > 0) {
    reason += reason ? "; " : "";
    reason += `read_block_context 的 blockIds 不在当前候选或范围允许列表中，已拒绝执行。rejectedBlockIdCount=${rejectedBlockIds.length}`;
  }

  return { allowed: false, inputDocIds, rejectedDocIds, inputBlockIds, rejectedBlockIds, reason };
}
