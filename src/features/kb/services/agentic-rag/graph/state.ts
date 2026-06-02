/**
 * Agentic RAG Graph State
 *
 * 职责：
 * - 定义 AgenticRagState、TraceStep
 * - 复用现有 AgentScope、AgentScopeSummary、AgentScopeMode、AgentRuntimeContext、ReferenceItem
 * - 不引用旧分类路由或旧任务计划类型
 */

import type { AgentScope, AgentScopeSummary, AgentScopeMode } from "../scope/types";
import type { AgenticRuntimeContext } from "../runtime/recent-context-types";
import type { ReferenceItem } from "../../../types/chat";
import type { AgentAction, AnswerAction } from "../actions/action-types";
import type { EvidenceWorkspace } from "../workspace/evidence-workspace";
import type { AgentToolDefinition, AgentToolExecutionResult } from "../tools/tool-types";
import type { AgenticRagBudget, AgenticRagCounters } from "../runtime/budget";
import type { EvidenceGateDecision } from "../evidence/evidence-gate";
import type { AgenticEvidencePack } from "../evidence/evidence-types";
import type { EvidenceGateV2Result } from "../harness/state/evidence-state";
import type { FollowUpContext } from "../runtime/follow-up-context";
import type { RuntimeTurnFacts } from "../runtime/runtime-turn-facts";
import type { TurnContextFact } from "../runtime/turn-context-fact";
import type { PlannerAction } from "../planner/planner-action";
import type { PlannerExecutionBridgeDecision } from "../actions/planner-execution-bridge";

export interface TraceStep {
  name: string;
  status: "success" | "skipped" | "failed" | "schema_failure";
  detail?: string;
}

export interface ActionValidationState {
  ok: boolean;
  actionType?: string;
  reason?: string;
  rejectedDocIds?: string[];
  rejectedBlockIds?: string[];
}

import type { PlannerActionMaterializeResult } from "../actions/planner-action-materializer";
import type { ThinkingMode } from "../../../types/session";

export interface AgenticRagState {
  question: string;
  mode: AgentScopeMode;
  customDocIds?: string[];
  recentContextSummary?: string;
  runtime?: AgenticRuntimeContext;
  trace?: boolean;
  thinkingMode?: ThinkingMode;
  currentDate?: string;  // YYYY-MM-DD
  currentDateTime?: string;  // YYYY-MM-DD HH:mm:ss

  scope?: AgentScope;
  scopeSummary?: AgentScopeSummary;

  availableTools: AgentToolDefinition[];
  currentAction?: AgentAction;
  actionValidation?: ActionValidationState;
  lastActionValidationError?: {
    actionType?: string;
    reason?: string;
    rejectedDocIds?: string[];
    rejectedBlockIds?: string[];
  };
  actionHistory: AgentAction[];

  workspace: EvidenceWorkspace;

  budget: AgenticRagBudget;
  counters: AgenticRagCounters;

  finalAnswerAction?: AnswerAction;
  hasSystemFailureMessage?: boolean;
  failClosedReason?: string;
  lastToolResult?: AgentToolExecutionResult;
  lastObservation?: {
    summary?: string;
    counts?: Record<string, number>;
    error?: string;
    warning?: string;
  };
  searchObservationTracking?: {
    consecutiveZeroHitSearchCount: number;
    totalZeroHitSearchCount: number;
    consecutiveNoStateChangeCount: number;
    lastSearchAddedCandidateCount: number;
  };
  evidenceGateDecision?: EvidenceGateDecision;
  evidenceGateV2?: EvidenceGateV2Result;
  composedAnswer?: string;
  finalEvidencePack?: AgenticEvidencePack;
  footerReferences: ReferenceItem[];
  insufficientMessage?: string;
  treeEmptyMessage?: string;
  followUpContext?: FollowUpContext;
  turnContextFact?: TurnContextFact;
  operatingContract?: string;
  runtimeTurnFacts?: RuntimeTurnFacts;
  warnings: string[];
  traceLog: TraceStep[];

  // Evidence lock state（最终引用白名单状态）
  finalEvidenceDocIds?: string[];
  droppedReferenceDocIds?: string[];

  // Planner 主链路状态
  plannerAction?: PlannerAction;
  plannerValidationWarnings?: string[];

  // Planner materializer state
  plannerMaterializedAction?: AgentAction;
  plannerMaterializationWarnings?: string[];
  plannerMaterializeDebugSummary?: {
    plannerType: string;
    materializedType?: string;
    selectedDocCount?: number;
    selectedBlockCount?: number;
    reason: string;
  };
  plannerMaterializerMetadata?: PlannerActionMaterializeResult["previousReferenceMetadata"];

  // Planner execution bridge state（active Planner 主链路）
  plannerExecutionBridgeDecision?: PlannerExecutionBridgeDecision;

  // Active planner loop protection state
  plannerLastSelectedActionKey?: string;
  plannerLastSelectedProgressSnapshot?: {
    searchCallCount: number;
    readDocCount: number;
    readBlockContextCount: number;
    candidateDocCount: number;
    candidateBlockCount: number;
    recentEvidenceCount: number;
    actionHistoryLength: number;
  };

  // Planner failure state：规划器调用失败时写入，不作为业务动作
  plannerFailure?: {
    providerType?: string;
    modelLabel?: string;
    durationMs?: number;
    errorKind: "llm_call_failed" | "json_parse_failed" | "timeout" | "empty_response" | "node_error" | "normalize_failed" | "control_plane_failed";
    allowedActionCount: number;
    retryCount: number;
    normalizeFailureReason?: string;
  };

  // Planner bridge failure：物化或桥接层失败，不是 Planner LLM 失败
  plannerBridgeFailure?: {
    reason: string;
    plannerActionType?: string;
    materializedActionType?: string;
  };

  // Trace-only terminal state fields（只用于 debug/trace，不影响业务逻辑）
  terminalAnswerSource?: "planner_compose" | "no_evidence_fixed" | "system_failure" | "harness_stopped";
  finalizeReasonCode?: string;
  composedAnswerSource?: "planner_compose" | "no_evidence_fixed" | "system_failure" | "provider_rejected";
}
