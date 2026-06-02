/**
 * Agentic RAG Graph
 *
 * Agentic Harness loop for the read-only KB Agent.
 */

import type { AgenticRagState, TraceStep } from "./state";
import type { AgentAction } from "../actions/action-types";
import type { AgenticRagProgressEvent } from "../runtime/progress-types";
import { canContinueAgentLoop } from "../safety/budget-guard";
import { resolveToolsNode } from "./nodes/resolve-tools-node";
import { analyzeTurnNode } from "./nodes/analyze-turn-node";
import { validateActionNode } from "./nodes/validate-action-node";
import { executeActionNode } from "./nodes/execute-action-node";
import { evidenceGateNode } from "./nodes/evidence-gate-node";
import { composeAnswerNode } from "./nodes/compose-answer-node";
import { planNextActionNode } from "./nodes/plan-next-action-node";
import { selectPlannerActionForExecution } from "../actions/planner-execution-bridge";
import { pushAgentDebugEvent } from "../debug/agentic-rag-debug";
import { validateAnswerActionAgainstEvidenceState } from "./nodes/validate-action-node";

import { getPlannerVisibleToolNames } from "../harness/contracts/tool-contract-registry";
import { getUnreadCandidateDocCount } from "../workspace/candidate-quality";

export interface RunAgenticRagDomainStepParams {
  initialState: AgenticRagState;
  abortSignal?: AbortSignal;
  onProgress?: (event: AgenticRagProgressEvent) => void;
  skipFinalCompose?: boolean;
  skipInitialResolveTools?: boolean;
  stopAfterLoopIterations?: number;
  suppressGraphLifecycleTrace?: boolean;
  startPhase?: "plan" | "validate" | "execute";
}

function pushTrace(state: AgenticRagState, step: TraceStep): AgenticRagState {
  return {
    ...state,
    traceLog: [...state.traceLog, step],
  };
}

function finalizeAbortedState(state: AgenticRagState, reason: string): AgenticRagState {
  return {
    ...state,
    currentAction: undefined,
    finalAnswerAction: undefined,
    warnings: [...state.warnings, `aborted: ${reason}`],
    traceLog: [
      ...state.traceLog,
      { name: "abort", status: "skipped", detail: reason } as TraceStep,
    ],
  };
}

export interface ProgressSnapshot {
  actionHistoryCount: number;
  readDocCount: number;
  readBlockContextCount: number;
  candidateDocCount: number;
  candidateBlockCount: number;
  searchCallCount: number;
  currentActionKey?: string;
}

function getActionKey(action?: AgentAction): string | undefined {
  if (!action) return undefined;
  return JSON.stringify({ type: action.type, args: action.args ?? null });
}

export function snapshotProgress(state: AgenticRagState): ProgressSnapshot {
  return {
    actionHistoryCount: state.actionHistory.length,
    readDocCount: state.workspace.readDocuments.length,
    readBlockContextCount: state.workspace.readBlockContexts.length,
    candidateDocCount: state.workspace.candidateDocs.length,
    candidateBlockCount: state.workspace.candidateBlocks.length,
    searchCallCount: state.counters.searchCallCount ?? 0,
    currentActionKey: getActionKey(state.currentAction),
  };
}

function detectNoProgress(before: ProgressSnapshot, after: ProgressSnapshot, actionType: string): boolean {
  if (actionType === "answer") return false;
  return before.actionHistoryCount === after.actionHistoryCount
    && before.readDocCount === after.readDocCount
    && before.readBlockContextCount === after.readBlockContextCount
    && before.candidateDocCount === after.candidateDocCount
    && before.candidateBlockCount === after.candidateBlockCount
    && before.searchCallCount === after.searchCallCount
    && before.currentActionKey === after.currentActionKey;
}

export interface ApplyProgressGateResult {
  state: AgenticRagState;
  noProgress: boolean;
}

export function applyProgressGate(
  before: ProgressSnapshot,
  state: AgenticRagState,
  actionType: string,
): ApplyProgressGateResult {
  const after = snapshotProgress(state);
  const noProgress = detectNoProgress(before, after, actionType);
  if (!noProgress) {
    return { state, noProgress };
  }

  const nextState = pushTrace(state, {
    name: "progress_gate",
    status: "skipped",
    detail: `no progress after ${actionType}`,
  } as TraceStep);

  return {
    state: {
      ...nextState,
      warnings: [...nextState.warnings, `No progress after ${actionType}; stopping loop.`],
    },
    noProgress,
  };
}

async function maybeAnalyzeState(state: AgenticRagState): Promise<AgenticRagState> {
  if (state.runtimeTurnFacts) return state;
  const result = await analyzeTurnNode({ state });
  return result.state;
}

function hasTerminalPlannerAnswer(state: AgenticRagState): boolean {
  return !!state.finalAnswerAction;
}

function finalizeHarnessFailureState(state: AgenticRagState, reason: string): AgenticRagState {
  const actionTypeCounts = new Map<string, number>();
  for (const action of state.actionHistory) {
    actionTypeCounts.set(action.type, (actionTypeCounts.get(action.type) ?? 0) + 1);
  }
  let repeatedActionType: string | undefined;
  let repeatedActionCount = 0;
  for (const [type, count] of actionTypeCounts) {
    if (count > repeatedActionCount) {
      repeatedActionType = type;
      repeatedActionCount = count;
    }
  }

  const failClosedTrace: TraceStep = {
    name: "HARNESS_FAIL_CLOSED_SAFE",
    status: "failed",
    detail: JSON.stringify({
      reason,
      repeatedActionType,
      repeatedActionCount,
      hasKnowledgeMap: state.workspace.knowledgeMap?.loaded === true,
      readDocCount: state.workspace.readDocuments.length,
      candidateDocCount: state.workspace.candidateDocs.length,
      searchCallCount: state.counters.searchCallCount ?? 0,
    }),
  };

  let composedAnswer = "当前无法完成本轮知识库检索回答，请稍后重试或更换模型。";
  if (state.plannerFailure?.errorKind === "control_plane_failed") {
    composedAnswer = "模型没有返回可解析的工具决策 JSON，控制面调用失败。可重试或换一个更稳定输出 JSON 的模型。";
  }

  return {
    ...state,
    currentAction: undefined,
    finalAnswerAction: undefined,
    hasSystemFailureMessage: true,
    failClosedReason: reason,
    composedAnswer,
    finalEvidencePack: undefined,
    footerReferences: [],
    warnings: [...state.warnings, reason],
    terminalAnswerSource: "system_failure",
    finalizeReasonCode: reason,
    composedAnswerSource: "system_failure",
    traceLog: [...state.traceLog, failClosedTrace],
  };
}

export async function runAgenticRagDomainStep(params: RunAgenticRagDomainStepParams): Promise<AgenticRagState> {
  const {
    abortSignal,
    onProgress,
    skipFinalCompose,
    skipInitialResolveTools,
    stopAfterLoopIterations,
    suppressGraphLifecycleTrace,
    startPhase,
  } = params;

  let state = params.initialState;

  if (!suppressGraphLifecycleTrace) {
    pushAgentDebugEvent("GRAPH_START", {
      startPhase: startPhase ?? "full",
      skipFinalCompose: !!skipFinalCompose,
    }, "info");
  }

  if (abortSignal?.aborted) {
    return finalizeAbortedState(state, "aborted before graph start");
  }

  if (startPhase !== "validate" && startPhase !== "execute") {
    state = await maybeAnalyzeState(state);
  }

  if (!skipInitialResolveTools && startPhase !== "validate" && startPhase !== "execute") {
    state = resolveToolsNode({ state }).state;
  }

  const DEFAULT_AGENTIC_MAX_ITERATIONS = 20;
  const maxIterations = stopAfterLoopIterations ?? state.budget.maxSteps ?? DEFAULT_AGENTIC_MAX_ITERATIONS;
  state.traceLog.push({
    name: "AGENT_LOOP_LIMIT_SAFE",
    status: "success",
    detail: JSON.stringify({
      maxIterations,
      loopIndex: 0,
      remainingLoops: maxIterations,
    }),
  });
  let consecutiveMaterializedValidationFailures = 0;
  let lastMaterializedFailActionKey = "";
  let lastRepeatedActionType = "";
  let consecutiveSameActionCount = 0;

  for (let loopIndex = 0; loopIndex < maxIterations; loopIndex += 1) {
    if (abortSignal?.aborted) {
      return finalizeAbortedState(state, "aborted during graph loop");
    }

    onProgress?.({
      phase: "running_agent_loop",
      detail: `Agent loop ${loopIndex + 1}/${maxIterations}`,
      scopeType: state.scope?.type,
    });

    const budgetDecision = canContinueAgentLoop(state.budget, state.counters);
    if (!budgetDecision.allowed) {
      state = pushTrace(state, {
        name: "budget_guard",
        status: "skipped",
        detail: budgetDecision.reason ?? "budget exhausted",
      } as TraceStep);
      state = evidenceGateNode({ state }).state;
      if (hasTerminalPlannerAnswer(state) || state.composedAnswer) {
        break;
      }
      const gateV2 = state.evidenceGateV2;
      if (gateV2?.status === "insufficient_final" && !state.finalAnswerAction) {
        const plannerVisible = getPlannerVisibleToolNames();
        if (plannerVisible.includes("answer")) {
          state = { ...state, currentAction: undefined };
          state = (await planNextActionNode({ state })).state;
          const bridge = selectPlannerActionForExecution({
            plannerAction: state.plannerAction,
            plannerMaterializedAction: state.plannerMaterializedAction,
            workspace: state.workspace,
            budget: state.budget,
            counters: state.counters,
          });
          if (bridge.action?.type === "answer") {
            const answerArgs = bridge.action.args as { evidenceMode?: string; answerKind?: string } | undefined;
            const answerValidation = validateAnswerActionAgainstEvidenceState({
              evidenceMode: answerArgs?.evidenceMode ?? "unknown",
              answerKind: answerArgs?.answerKind,
              gateV2Status: gateV2?.status,
              readDocCount: state.workspace.readDocuments.length,
              readBlockContextCount: state.workspace.readBlockContexts.length,
              needsKnowledgeBase: state.runtimeTurnFacts?.modeRequiresKb !== false,
            });
            const answerValidationPayload = {
              source: "terminal_gate_answer",
              gateV2Status: gateV2?.status,
              readDocCount: state.workspace.readDocuments.length,
              evidenceMode: answerArgs?.evidenceMode,
              validated: answerValidation.ok,
            };
            state.traceLog.push({
              name: "ANSWER_VALIDATION_PATH_SAFE",
              status: answerValidation.ok ? "success" : "failed",
              detail: JSON.stringify(answerValidationPayload),
            });
            pushAgentDebugEvent("ANSWER_VALIDATION_PATH_SAFE", answerValidationPayload, answerValidation.ok ? "info" : "warn");
            if (answerValidation.ok) {
              state = {
                ...state,
                currentAction: undefined,
                finalAnswerAction: bridge.action as any,
              };
            } else {
              state = {
                ...state,
                currentAction: undefined,
                lastObservation: {
                  summary: answerValidation.violation ?? "answer evidenceMode 校验失败",
                  warning: "answer evidenceMode 与证据状态不匹配",
                },
              };
            }
          }
          break;
        }
      }
      break;
    }

    // 每轮刷新工具能力快照，确保 workspace 变更后 availableTools 最新
    state = resolveToolsNode({ state }).state;
    state.traceLog.push({
      name: "TOOL_CAPABILITIES_REFRESHED_SAFE",
      status: "success",
      detail: JSON.stringify({
        loopIndex,
        availableToolCount: state.availableTools.length,
        focusDocScopeAvailable: state.availableTools.some((t) => t.name === "focus_doc_scope"),
        readCandidateDocsAvailable: state.availableTools.some((t) => t.name === "read_candidate_docs"),
        searchScopeAvailable: state.availableTools.some((t) => t.name === "search_scope"),
        hasKnowledgeMap: state.workspace.knowledgeMap?.loaded === true,
        candidateDocCount: state.workspace.candidateDocs.length,
        readDocCount: state.workspace.readDocuments.length,
      }),
    });

    if (!state.currentAction && !state.finalAnswerAction && startPhase !== "execute") {
      state = (await planNextActionNode({ state })).state;

      if (state.plannerFailure?.errorKind === "control_plane_failed") {
        const failureRetryCount = state.plannerFailure.retryCount ?? 1;
        if (failureRetryCount >= 2) {
          state.traceLog.push({
            name: "CONTROL_PLANE_FAILURE_TERMINATED_SAFE",
            status: "failed",
            detail: JSON.stringify({
              errorKind: state.plannerFailure.errorKind,
              retryCount: failureRetryCount,
              reasonCode: "repeated_control_plane_failure",
            }),
          });
          pushAgentDebugEvent("CONTROL_PLANE_FAILURE_TERMINATED_SAFE", {
            errorKind: state.plannerFailure.errorKind,
            retryCount: failureRetryCount,
            reasonCode: "repeated_control_plane_failure",
          }, "warn");
          state = {
            ...state,
            lastObservation: {
              summary: "模型没有返回可解析的工具决策 JSON，控制面调用失败。可重试或换一个更稳定输出 JSON 的模型",
              warning: "control_plane_failed",
            },
          };
          break;
        }
      }

      // Planner execution bridge: 桥接 Planner 物化动作到 currentAction
      const bridge = selectPlannerActionForExecution({
        plannerAction: state.plannerAction,
        plannerMaterializedAction: state.plannerMaterializedAction,
        workspace: state.workspace,
        budget: state.budget,
        counters: state.counters,
        scope: state.scope,
        followUpContext: state.followUpContext,
        traceLog: state.traceLog,
        trace: state.trace,
      });

      state = {
        ...state,
        plannerExecutionBridgeDecision: bridge,
      };

      if (bridge.shouldUsePlannerAction && bridge.action) {
        // Bridge 接受：将物化动作写入 currentAction
        state.traceLog.push({
          name: "PLANNER_BRIDGE_ACCEPTED_SAFE",
          status: "success",
          detail: JSON.stringify({
            plannerActionType: bridge.debugSummary.plannerActionType,
            materializedActionType: bridge.debugSummary.materializedActionType,
            selectedForExecution: bridge.debugSummary.selectedForExecution,
          }),
        });

        // answer 动作特殊处理：不执行 executeActionNode，直接写入 finalAnswerAction
        if (bridge.action.type === "answer") {
          const answerArgs = bridge.action.args as { evidenceMode?: string; answerKind?: string } | undefined;
          const answerValidation = validateAnswerActionAgainstEvidenceState({
            evidenceMode: answerArgs?.evidenceMode ?? "unknown",
            answerKind: answerArgs?.answerKind,
            gateV2Status: state.evidenceGateV2?.status,
            readDocCount: state.workspace.readDocuments.length,
            readBlockContextCount: state.workspace.readBlockContexts.length,
            needsKnowledgeBase: state.runtimeTurnFacts?.modeRequiresKb !== false,
          });
          const answerValidation2Payload = {
            source: "planner_bridge_answer",
            gateV2Status: state.evidenceGateV2?.status,
            readDocCount: state.workspace.readDocuments.length,
            evidenceMode: answerArgs?.evidenceMode,
            validated: answerValidation.ok,
          };
          state.traceLog.push({
            name: "ANSWER_VALIDATION_PATH_SAFE",
            status: answerValidation.ok ? "success" : "failed",
            detail: JSON.stringify(answerValidation2Payload),
          });
          pushAgentDebugEvent("ANSWER_VALIDATION_PATH_SAFE", answerValidation2Payload, answerValidation.ok ? "info" : "warn");
          if (answerValidation.ok) {
            state = {
              ...state,
              currentAction: undefined,
              finalAnswerAction: bridge.action as any,
              actionHistory: [...state.actionHistory, bridge.action],
            };
            pushAgentDebugEvent("PLANNER_BRIDGE_ANSWER_ACCEPTED_SAFE", {
              plannerActionType: bridge.debugSummary.plannerActionType,
            materializedActionType: bridge.debugSummary.materializedActionType,
          }, "info");
          } else {
            state = {
              ...state,
              currentAction: undefined,
              lastObservation: {
                summary: answerValidation.violation ?? "answer evidenceMode 校验失败",
                warning: "answer evidenceMode 与证据状态不匹配",
              },
            };
          }
        } else {
          state = {
            ...state,
            currentAction: bridge.action,
          };
          consecutiveMaterializedValidationFailures = 0;
          lastMaterializedFailActionKey = "";
          pushAgentDebugEvent("PLANNER_BRIDGE_ACCEPTED_SAFE", {
            plannerActionType: bridge.debugSummary.plannerActionType,
            materializedActionType: bridge.debugSummary.materializedActionType,
            selectedForExecution: bridge.debugSummary.selectedForExecution,
          }, "info");
        }
      } else {
        // Bridge 拒绝：清空 currentAction，写入 observation
        const bridgeFailKey = `${bridge.debugSummary.plannerActionType ?? "unknown"}->${bridge.debugSummary.materializedActionType ?? "unknown"}`;
        if (bridgeFailKey === lastMaterializedFailActionKey) {
          consecutiveMaterializedValidationFailures++;
        } else {
          consecutiveMaterializedValidationFailures = 1;
          lastMaterializedFailActionKey = bridgeFailKey;
        }

        if (consecutiveMaterializedValidationFailures >= 3) {
          state.traceLog.push({
            name: "MATERIALIZED_VALIDATION_REPEAT_STOP_SAFE",
            status: "failed",
            detail: JSON.stringify({
              actionType: bridge.debugSummary.plannerActionType,
              materializedActionType: bridge.debugSummary.materializedActionType,
              reasonCode: "repeated_no_progress",
              repeatCount: consecutiveMaterializedValidationFailures,
            }),
          });
          pushAgentDebugEvent("MATERIALIZED_VALIDATION_REPEAT_STOP_SAFE", {
            actionType: bridge.debugSummary.plannerActionType,
            materializedActionType: bridge.debugSummary.materializedActionType,
            reasonCode: "repeated_no_progress",
            repeatCount: consecutiveMaterializedValidationFailures,
          }, "warn");

          state = {
            ...state,
            currentAction: undefined,
            lastObservation: {
              summary: "历史参考资料读取被安全校验拦截，未能继续回答，请检查日志或重试",
              warning: bridge.rejectionReason,
            },
            lastActionValidationError: {
              actionType: bridge.debugSummary.plannerActionType,
              reason: bridge.rejectionReason ?? bridge.warnings[0],
            },
          };
          break;
        }

        state.traceLog.push({
          name: "PLANNER_BRIDGE_REJECTED_SAFE",
          status: "skipped",
          detail: JSON.stringify({
            plannerActionType: bridge.debugSummary.plannerActionType,
            materializedActionType: bridge.debugSummary.materializedActionType,
            warningCount: bridge.warnings.length,
            reasonCode: bridge.rejectionReason ? "validation_failed" : "no_materialized_action",
            failureStage: bridge.rejectionReason ? "validation" : "materialization",
          }),
        });

        state = {
          ...state,
          currentAction: undefined,
          lastObservation: {
            summary: bridge.rejectionReason ?? "Planner bridge 校验失败",
            warning: bridge.warnings.length > 0 ? bridge.warnings[0] : undefined,
          },
          lastActionValidationError: {
            actionType: bridge.debugSummary.plannerActionType,
            reason: bridge.rejectionReason ?? bridge.warnings[0],
          },
        };
        pushAgentDebugEvent("PLANNER_BRIDGE_REJECTED_SAFE", {
          plannerActionType: bridge.debugSummary.plannerActionType,
          materializedActionType: bridge.debugSummary.materializedActionType,
          warningCount: bridge.warnings.length,
          reasonCode: bridge.rejectionReason ? "validation_failed" : "no_materialized_action",
          failureStage: bridge.rejectionReason ? "validation" : "materialization",
        }, "warn");
        continue;
      }
    }

    if (state.currentAction && startPhase !== "execute") {
      // 防御性刷新：bridge/plan 后工具能力可能已变化
      state = resolveToolsNode({ state }).state;
      state = validateActionNode({ state }).state;
      if (!state.actionValidation?.ok) {
        const validationFailKey = `${state.lastActionValidationError?.actionType ?? "unknown"}->validation`;
        if (validationFailKey === lastMaterializedFailActionKey) {
          consecutiveMaterializedValidationFailures++;
        } else {
          consecutiveMaterializedValidationFailures = 1;
          lastMaterializedFailActionKey = validationFailKey;
        }

        if (consecutiveMaterializedValidationFailures >= 3) {
          state.traceLog.push({
            name: "MATERIALIZED_VALIDATION_REPEAT_STOP_SAFE",
            status: "failed",
            detail: JSON.stringify({
              actionType: state.lastActionValidationError?.actionType,
              materializedActionType: state.lastActionValidationError?.actionType,
              reasonCode: "repeated_no_progress",
              repeatCount: consecutiveMaterializedValidationFailures,
            }),
          });
          pushAgentDebugEvent("MATERIALIZED_VALIDATION_REPEAT_STOP_SAFE", {
            actionType: state.lastActionValidationError?.actionType,
            materializedActionType: state.lastActionValidationError?.actionType,
            reasonCode: "repeated_no_progress",
            repeatCount: consecutiveMaterializedValidationFailures,
          }, "warn");

          state = {
            ...state,
            currentAction: undefined,
            lastObservation: {
              summary: "历史参考资料读取被安全校验拦截，未能继续回答，请检查日志或重试",
              warning: state.lastActionValidationError?.reason,
            },
          };
          break;
        }

        state = pushTrace(state, {
          name: "validate_action",
          status: "failed",
          detail: state.lastActionValidationError?.reason ?? "action validation failed",
        } as TraceStep);
        state = { ...state, currentAction: undefined };
        continue;
      } else {
        consecutiveMaterializedValidationFailures = 0;
        lastMaterializedFailActionKey = "";
      }
    }

    if (hasTerminalPlannerAnswer(state)) {
      state = evidenceGateNode({ state }).state;
      break;
    }

    if (state.currentAction) {
      const before = snapshotProgress(state);
      const actionType = state.currentAction.type;
      state = (await executeActionNode({ state, abortSignal })).state;
      state = {
        ...state,
        currentAction: undefined,
      };
      state = evidenceGateNode({ state }).state;
      const progressGate = applyProgressGate(before, state, actionType);
      state = progressGate.state;

      const afterReadDocCount = state.workspace.readDocuments.length;
      const afterCandidateDocCount = state.workspace.candidateDocs.length;
      const candidateDelta = afterCandidateDocCount - before.candidateDocCount;
      const readDelta = afterReadDocCount - before.readDocCount;

      if (actionType === lastRepeatedActionType) {
        consecutiveSameActionCount++;
      } else {
        lastRepeatedActionType = actionType;
        consecutiveSameActionCount = 1;
      }

      if (consecutiveSameActionCount >= 3 && candidateDelta === 0 && readDelta === 0) {
        const readDocIdSet = new Set(state.workspace.readDocuments.map((d) => d.docId));
        const readableCandidateUnreadCount = getUnreadCandidateDocCount(state.workspace, readDocIdSet);
        pushAgentDebugEvent("PLANNER_NO_PROGRESS_OBSERVATION_SAFE", {
          actionType,
          repeatCount: consecutiveSameActionCount,
          candidateDelta,
          readDelta,
          mapLoaded: state.workspace.knowledgeMap?.loaded === true,
          readableCandidateUnreadCount,
        }, "warn");
      }
      if (progressGate.noProgress || hasTerminalPlannerAnswer(state) || state.composedAnswer) break;
      state = { ...state, currentAction: undefined };
      continue;
    }

    state = evidenceGateNode({ state }).state;
    if (hasTerminalPlannerAnswer(state) || state.composedAnswer) {
      break;
    }
  }

  if (!state.composedAnswer && !state.finalAnswerAction) {
    const gateV2 = state.evidenceGateV2;
    const isTerminalGate = gateV2?.status === "sufficient" || gateV2?.status === "insufficient_final";
    if (isTerminalGate) {
      state = { ...state, currentAction: undefined };
      state = (await planNextActionNode({ state })).state;
      const bridge = selectPlannerActionForExecution({
        plannerAction: state.plannerAction,
        plannerMaterializedAction: state.plannerMaterializedAction,
        workspace: state.workspace,
        budget: state.budget,
        counters: state.counters,
      });
      if (bridge.action?.type === "answer") {
        const answerArgs = bridge.action.args as { evidenceMode?: string; answerKind?: string } | undefined;
        const answerValidation = validateAnswerActionAgainstEvidenceState({
          evidenceMode: answerArgs?.evidenceMode ?? "unknown",
          answerKind: answerArgs?.answerKind,
          gateV2Status: gateV2?.status,
          readDocCount: state.workspace.readDocuments.length,
          readBlockContextCount: state.workspace.readBlockContexts.length,
          needsKnowledgeBase: state.runtimeTurnFacts?.modeRequiresKb !== false,
        });
        const answerValidation3Payload = {
          source: "terminal_gate_planner_turn",
          gateV2Status: gateV2?.status,
          readDocCount: state.workspace.readDocuments.length,
          evidenceMode: answerArgs?.evidenceMode,
          validated: answerValidation.ok,
        };
        state.traceLog.push({
          name: "ANSWER_VALIDATION_PATH_SAFE",
          status: answerValidation.ok ? "success" : "failed",
          detail: JSON.stringify(answerValidation3Payload),
        });
        pushAgentDebugEvent("ANSWER_VALIDATION_PATH_SAFE", answerValidation3Payload, answerValidation.ok ? "info" : "warn");
        if (answerValidation.ok) {
          state = {
            ...state,
            currentAction: undefined,
            finalAnswerAction: bridge.action as any,
            actionHistory: [...state.actionHistory, bridge.action],
          };
          state.traceLog.push({
            name: "TERMINAL_PLANNER_TURN_SAFE",
            status: "success",
            detail: JSON.stringify({
              reasonCode: "terminal_gate_answer",
              evidenceGateV2Status: gateV2?.status,
              allowedActionCount: 1,
              hasAnswerAllowed: true,
              plannerAcceptedAnswer: true,
            }),
          });
        } else {
          state = {
            ...state,
            currentAction: undefined,
            lastObservation: {
              summary: answerValidation.violation ?? "answer evidenceMode 校验失败",
              warning: "answer evidenceMode 与证据状态不匹配",
            },
          };
        }
      }
    }
  }

  if (!skipFinalCompose && !state.composedAnswer && state.finalAnswerAction) {
    onProgress?.({ phase: "composing_answer" } as AgenticRagProgressEvent);
    state = (await composeAnswerNode({ state })).state;
    // 正常 compose 后设置 trace 字段（如果 compose 没有设置的话）
    if (!state.terminalAnswerSource) {
      state.terminalAnswerSource = "planner_compose";
      state.composedAnswerSource = "planner_compose";
    }
  }

  if (!state.composedAnswer && !state.finalAnswerAction) {
    state = finalizeHarnessFailureState(state, "Harness stopped without Planner answer action");
  }

  if (!suppressGraphLifecycleTrace) {
    const hadPlannerAnswerAction = state.actionHistory.some((a) => a.type === "answer");
    const plannerAnswerAcceptedCount = state.actionHistory.filter((a) => a.type === "answer").length;
    const finalEvidenceMode = state.finalAnswerAction?.args?.evidenceMode ?? "unknown";
    const evidencePackItemCount = state.finalEvidencePack?.items?.length ?? 0;
    const readDocCount = state.workspace.readDocuments.length;
    pushAgentDebugEvent("GRAPH_END", {
      hasFinalAnswerAction: !!state.finalAnswerAction,
      hasComposedAnswerFromPlannerAnswer: !!state.composedAnswer && !!state.finalAnswerAction,
      hasSystemFailureMessage: !!state.hasSystemFailureMessage,
      failClosedReason: state.failClosedReason ?? undefined,
      warningCount: state.warnings.length,
      hadPlannerAnswerAction,
      hadPlannerAnswerAccepted: hadPlannerAnswerAction,
      plannerAnswerAcceptedCount,
      finalEvidenceMode,
      evidencePackItemCount,
      readDocCount,
      terminalAnswerSource: state.terminalAnswerSource ?? "unknown",
      finalizeReasonCode: state.finalizeReasonCode ?? undefined,
      composedAnswerSource: state.composedAnswerSource ?? "unknown",
    }, "info");
  }

  return state;
}
