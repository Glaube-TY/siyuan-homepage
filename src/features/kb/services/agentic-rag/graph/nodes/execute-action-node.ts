/**
 * Execute Action Node
 *
 * Executes non-answer tool actions, updates the workspace, counters, and trace.
 */

import type { AgenticRagState } from "../state";
import type { AgentAction } from "../../actions/action-types";
import type { AgentToolExecutionResult } from "../../tools/tool-types";
import { updateWorkspaceFromToolResult } from "../../workspace/workspace-update";
import { debugExecStart, debugExecEnd, buildSearchScopeArgsSummary, buildReadDocsArgsSummary, buildListScopeDocsArgsSummary } from "../../debug/agentic-rag-debug";

function buildArgsSummary(actionType: string, args: Record<string, unknown> | undefined): object | undefined {
  switch (actionType) {
    case "search_scope": return buildSearchScopeArgsSummary(args);
    case "read_docs": return buildReadDocsArgsSummary(args);
    case "list_scope_docs": return buildListScopeDocsArgsSummary(args);
    default: return undefined;
  }
}

export interface ExecuteActionNodeInput {
  state: AgenticRagState;
  abortSignal?: AbortSignal;
}

export interface ExecuteActionNodeOutput {
  state: AgenticRagState;
}

function buildActionConsumedTrace(
  actionType: string,
  success: boolean,
  hasObservation: boolean,
  actionHistoryCount: number,
): TraceStepLike {
  return {
    name: "TOOL_ACTION_CONSUMED_SAFE",
    status: "success",
    detail: JSON.stringify({
      actionType,
      success,
      hasObservation,
      actionHistoryCount,
    }),
  };
}

type TraceStepLike = AgenticRagState["traceLog"][number];

export async function executeActionNode(input: ExecuteActionNodeInput): Promise<ExecuteActionNodeOutput> {
  const { state, abortSignal } = input;
  const { currentAction } = state;

  const traceLog = [...state.traceLog];
  const warnings = [...state.warnings];
  const counters = { ...state.counters };

  if (!currentAction || currentAction.type === "answer") {
    traceLog.push({
      name: "execute_action",
      status: "skipped",
      detail: currentAction?.type === "answer" ? "answer action skipped" : "no currentAction",
    });
    return {
      state: {
        ...state,
        traceLog,
        counters,
      },
    };
  }

  const tool = state.availableTools.find((t) => t.name === currentAction.type);
  if (!tool) {
    const actionHistory = [...state.actionHistory, currentAction];
    traceLog.push({
      name: "execute_action",
      status: "failed",
      detail: `tool ${currentAction.type} not found`,
    });
    warnings.push(`tool ${currentAction.type} not found; execution failed`);

    const errorResult: AgentToolExecutionResult = {
      success: false,
      error: `tool ${currentAction.type} not found`,
    };
    const lastObservation = {
      error: errorResult.error,
      warning: errorResult.warning,
    };
    traceLog.push(buildActionConsumedTrace(currentAction.type, false, true, actionHistory.length));

    return {
      state: {
        ...state,
        currentAction: undefined,
        lastToolResult: errorResult,
        lastObservation,
        actionHistory,
        warnings,
        traceLog,
        counters,
      },
    };
  }

  const context = {
    scope: state.scope,
    scopeSummary: state.scopeSummary,
    runtime: state.runtime,
    workspace: state.workspace,
    budget: state.budget,
    counters: state.counters,
    followUpContext: state.followUpContext,
    abortSignal,
    trace: state.trace,
  };

  let execResult: AgentToolExecutionResult;
  const execStart = Date.now();
  debugExecStart(state.trace, state.counters.stepCount, currentAction.type);
  try {
    execResult = await tool.execute(currentAction.args as Record<string, unknown>, context);
  } catch {
    const actionHistory = [...state.actionHistory, currentAction];
    const durationMs = Date.now() - execStart;
    const argsSummary = buildArgsSummary(currentAction.type, currentAction.args as Record<string, unknown> | undefined);
    debugExecEnd(state.trace, state.counters.stepCount, currentAction.type, durationMs, false, undefined, { error: "execution failed", argsSummary });
    traceLog.push({
      name: "execute_action",
      status: "failed",
      detail: `tool ${currentAction.type} threw during execution`,
    });
    warnings.push(`tool ${currentAction.type} threw during execution`);

    const errorResult: AgentToolExecutionResult = {
      success: false,
      error: "execution failed",
    };
    const lastObservation = {
      error: errorResult.error,
      warning: errorResult.warning,
    };
    traceLog.push(buildActionConsumedTrace(currentAction.type, false, true, actionHistory.length));

    return {
      state: {
        ...state,
        currentAction: undefined,
        lastToolResult: errorResult,
        lastObservation,
        actionHistory,
        warnings,
        traceLog,
        counters,
      },
    };
  }

  const observation = tool.observationFormatter(execResult);

  const actionForUpdate: AgentAction = {
    type: currentAction.type,
    reason: currentAction.reason,
    args: currentAction.args,
  } as AgentAction;

  const newWorkspace = updateWorkspaceFromToolResult({
    workspace: state.workspace,
    action: actionForUpdate,
    result: execResult,
    observation,
    materializerMetadata: state.plannerMaterializerMetadata,
  });

  const updatedCounters = { ...counters };

  switch (currentAction.type) {
    case "search_scope":
      if (execResult.success) {
        updatedCounters.searchCallCount = (updatedCounters.searchCallCount ?? 0) + 1;
      }
      break;
    case "read_docs": {
      const docs = (execResult.data as Record<string, unknown> | undefined)?.documents;
      const docCount = Array.isArray(docs) ? docs.length : 0;
      updatedCounters.readDocCount = (updatedCounters.readDocCount ?? 0) + docCount;
      break;
    }
    case "read_block_context": {
      const ctxs = (execResult.data as Record<string, unknown> | undefined)?.contexts;
      const ctxCount = Array.isArray(ctxs) ? ctxs.length : 0;
      updatedCounters.readBlockContextCount = (updatedCounters.readBlockContextCount ?? 0) + ctxCount;
      break;
    }
    default:
      break;
  }

  const durationMs = Date.now() - execStart;
  const toolCounts: Record<string, number> = {};
  if (currentAction.type === "search_scope") toolCounts.searchCallCount = updatedCounters.searchCallCount ?? 0;
  if (currentAction.type === "read_docs") toolCounts.readDocCount = updatedCounters.readDocCount ?? 0;
  if (currentAction.type === "read_block_context") toolCounts.readBlockContextCount = updatedCounters.readBlockContextCount ?? 0;

  const argsSummary = buildArgsSummary(currentAction.type, currentAction.args as Record<string, unknown> | undefined);
  const resultData = execResult.data as Record<string, unknown> | undefined;
  const execDetail = {
    error: execResult.error,
    warning: execResult.warning,
    argsSummary,
    documentsCount: currentAction.type === "read_docs" ? ((resultData?.documents as unknown[])?.length ?? 0) : undefined,
    failedDocIds: currentAction.type === "read_docs" ? (resultData?.failedDocIds as string[] | undefined) : undefined,
    attemptedDocIds: currentAction.type === "read_docs" ? (resultData?.attemptedDocIds as string[] | undefined) : undefined,
    candidateDocCount: currentAction.type === "search_scope" ? ((resultData?.candidateDocs as unknown[])?.length ?? 0) : undefined,
    candidateBlockCount: currentAction.type === "search_scope" ? ((resultData?.candidateBlocks as unknown[])?.length ?? 0) : undefined,
  };
  debugExecEnd(state.trace, state.counters.stepCount, currentAction.type, durationMs, execResult.success, toolCounts, execDetail);

  if (!execResult.success) {
    if (execResult.error) {
      warnings.push(`tool ${currentAction.type} failed: ${execResult.error}`);
    }
    const isSchemaFailure = (execResult.error ?? "").includes("invalid search_scope args") || (execResult.error ?? "").includes("schema validation failed");
    if (currentAction.type === "search_scope" && isSchemaFailure) {
      traceLog.push({
        name: "execute_action",
        status: "schema_failure",
        detail: `tool ${currentAction.type} schema validation failed: ${execResult.error ?? "unknown"} | warning: ${execResult.warning ?? ""}`,
      });
    } else {
      traceLog.push({
        name: "execute_action",
        status: "failed",
        detail: `tool ${currentAction.type} failed: ${observation?.summary ?? "no summary"} | error: ${execResult.error ?? ""} | warning: ${execResult.warning ?? ""}`,
      });
    }
  } else {
    traceLog.push({
      name: "execute_action",
      status: "success",
      detail: `tool ${currentAction.type} succeeded: ${observation?.summary ?? "no summary"}`,
    });
  }

  const actionHistory = [...state.actionHistory, currentAction];
  traceLog.push(buildActionConsumedTrace(currentAction.type, execResult.success, !!observation, actionHistory.length));

  const prevTracking = state.searchObservationTracking;
  let searchObservationTracking = prevTracking;
  if (currentAction.type === "search_scope" && execResult.success) {
    const resultData = execResult.data as Record<string, unknown> | undefined;
    const addedCount = Array.isArray(resultData?.candidateDocs) ? (resultData.candidateDocs as unknown[]).length : 0;
    const prev = prevTracking ?? { consecutiveZeroHitSearchCount: 0, totalZeroHitSearchCount: 0, consecutiveNoStateChangeCount: 0, lastSearchAddedCandidateCount: 0 };
    searchObservationTracking = {
      consecutiveZeroHitSearchCount: addedCount === 0 ? prev.consecutiveZeroHitSearchCount + 1 : 0,
      totalZeroHitSearchCount: addedCount === 0 ? prev.totalZeroHitSearchCount + 1 : prev.totalZeroHitSearchCount,
      consecutiveNoStateChangeCount: addedCount === 0 ? prev.consecutiveNoStateChangeCount + 1 : 0,
      lastSearchAddedCandidateCount: addedCount > 0 ? addedCount : prev.lastSearchAddedCandidateCount,
    };
  } else if ((currentAction.type === "list_scope_docs" || currentAction.type === "focus_doc_scope") && execResult.success) {
    const resultData = execResult.data as Record<string, unknown> | undefined;
    const addedCount = Array.isArray(resultData?.candidateDocs) ? (resultData.candidateDocs as unknown[]).length : 0;
    const prev = prevTracking ?? { consecutiveZeroHitSearchCount: 0, totalZeroHitSearchCount: 0, consecutiveNoStateChangeCount: 0, lastSearchAddedCandidateCount: 0 };
    searchObservationTracking = {
      ...prev,
      consecutiveNoStateChangeCount: addedCount === 0 ? prev.consecutiveNoStateChangeCount + 1 : 0,
    };
  }

  return {
    state: {
      ...state,
      currentAction: undefined,
      workspace: newWorkspace,
      lastToolResult: execResult,
      lastObservation: {
        summary: observation?.summary,
        counts: observation?.counts as Record<string, number> | undefined,
        error: observation?.error ?? execResult.error,
        warning: observation?.warning ?? execResult.warning,
      },
      actionHistory,
      warnings,
      traceLog,
      counters: updatedCounters,
      searchObservationTracking,
    },
  };
}
