/**
 * Execute Action Phase
 *
 * Shared helper for executing validated actions and applying progress gating.
 */

import type { AgenticRagState } from "../../graph/state";
import type { AgenticRagProgressEvent } from "../../runtime/progress-types";
import { executeActionNode } from "../../graph/nodes/execute-action-node";
import { snapshotProgress, applyProgressGate } from "../../graph/graph";
import { pushAgentDebugEvent } from "../../debug/agentic-rag-debug";

export interface ExecuteActionPhaseParams {
  state: AgenticRagState;
  abortSignal?: AbortSignal;
  onProgress?: (event: AgenticRagProgressEvent) => void;
  loopIndex?: number;
  consecutiveNoProgressCount?: number;
  lastActionType?: string;
}

export interface ExecuteActionPhaseResult {
  state: AgenticRagState;
  consecutiveNoProgressCount: number;
  lastActionType: string;
  shouldBreak: boolean;
}

export async function runAgenticRagExecuteActionPhase(
  params: ExecuteActionPhaseParams,
): Promise<ExecuteActionPhaseResult> {
  let state = params.state;
  let consecutiveNoProgressCount = params.consecutiveNoProgressCount ?? 0;
  let lastActionType = params.lastActionType ?? "";

  if (state.currentAction?.type === "read_candidate_docs") {
    pushAgentDebugEvent("EXECUTE_ACTION_BLOCKED_PLANNER_ONLY_ACTION", {
      blockedActionType: state.currentAction.type,
      reason: "read_candidate_docs must be materialized before execution",
    }, "warn");

    return {
      state: {
        ...state,
        warnings: [
          ...state.warnings,
          "execute_action: blocked execution of planner-only action read_candidate_docs",
        ],
        traceLog: [
          ...state.traceLog,
          {
            name: "EXECUTE_ACTION_BLOCKED_PLANNER_ONLY_ACTION",
            status: "skipped",
            detail: "read_candidate_docs must be materialized before execution",
          },
        ],
      },
      consecutiveNoProgressCount,
      lastActionType,
      shouldBreak: false,
    };
  }

  if (!state.currentAction || state.currentAction.type === "answer") {
    if (state.currentAction?.type === "answer" && !state.finalAnswerAction) {
      const answerAction = state.currentAction;
      return {
        state: {
          ...state,
          currentAction: undefined,
          finalAnswerAction: answerAction,
          traceLog: [
            ...state.traceLog,
            {
              name: "EXECUTE_ACTION_ANSWER_TERMINAL_SAFE",
              status: "success",
              detail: "answer is terminal action",
            },
          ],
        },
        consecutiveNoProgressCount,
        lastActionType: "answer",
        shouldBreak: true,
      };
    }

    return {
      state: { ...state, currentAction: undefined },
      consecutiveNoProgressCount,
      lastActionType,
      shouldBreak: false,
    };
  }

  const actionType = state.currentAction.type;
  params.onProgress?.({
    phase: actionType === "search_scope" ? "searching_evidence" : "running_agent_loop",
    scopeType: state.scope?.type,
    detail: `Executing ${actionType}`,
  } as AgenticRagProgressEvent);

  const before = snapshotProgress(state);
  state = (await executeActionNode({ state, abortSignal: params.abortSignal })).state;
  if (state.currentAction && state.currentAction.type !== "answer") {
    const staleActionType = state.currentAction.type;
    pushAgentDebugEvent("CURRENT_ACTION_STALE_AFTER_EXECUTE_SAFE", {
      actionType: staleActionType,
      actionHistoryCount: state.actionHistory.length,
    }, "warn");
    state = {
      ...state,
      currentAction: undefined,
      warnings: [
        ...state.warnings,
        `execute_action: cleared stale currentAction after ${staleActionType}`,
      ],
      traceLog: [
        ...state.traceLog,
        {
          name: "CURRENT_ACTION_STALE_AFTER_EXECUTE_SAFE",
          status: "skipped",
          detail: JSON.stringify({
            actionType: staleActionType,
            actionHistoryCount: state.actionHistory.length,
          }),
        },
      ],
    };
  }
  const progressGate = applyProgressGate(before, state, actionType);
  state = progressGate.state;

  if (progressGate.noProgress && lastActionType === actionType) {
    consecutiveNoProgressCount += 1;
  } else {
    consecutiveNoProgressCount = progressGate.noProgress ? 1 : 0;
  }
  lastActionType = actionType;

  return {
    state,
    consecutiveNoProgressCount,
    lastActionType,
    shouldBreak: consecutiveNoProgressCount >= 2,
  };
}
