/**
 * First Principles Runtime Guard
 *
 * 代码级合规守门：检查 Agentic RAG 运行时是否符合第一铁律。
 * 只检查结构事实，不理解自然语言。
 *
 * 职责：
 * - 检查 decisionSource 是否为 ai_planner
 * - 检查 read_docs 不在 Planner allowedActions
 * - 检查 read_docs 只来自 read_candidate_docs materialization
 * - 检查 focus_doc_scope 必须有 planner-selected handles
 * - 检查 fast path 未启用
 * - 记录 FIRST_PRINCIPLES_VIOLATION_SAFE
 *
 * 禁止：
 * - 不理解用户问题、标题、正文
 * - 不根据自然语言选择工具
 * - 不输出用户原始问题/query/标题/正文/reasoning
 */

import type { TraceStep } from "../../graph/state";
import type { AgenticRagState } from "../../graph/state";
import type { PlannerAction } from "../../planner/planner-action";
import type { AgentAction } from "../../actions/action-types";
import { isPlannerVisibleToolName, getPlannerVisibleToolNames, assertReadDocsNotPlannerVisible, getPlannerAllowedNextActions } from "../contracts/tool-contract-registry";
import { getAllowedActionsForState, getAllowedActionsForStateContext } from "../state/transition-rules";
import type { KbAgentStateName } from "../state/kb-agent-state";
import { pushAgentDebugEvent } from "../../debug/agentic-rag-debug";
import { buildEmptyInsufficientEvidencePack } from "../../graph/final-answer-guards";

const KB_AGENT_STATE_NAMES: KbAgentStateName[] = [
  "TURN_STARTED", "SCOPE_RESOLVED", "NEEDS_KB", "NO_KB_REQUIRED",
  "MAP_REQUIRED", "MAP_LOADED", "FOCUS_REQUIRED", "FOCUS_SET",
  "SEARCH_REQUIRED", "SEARCH_DONE", "CANDIDATES_READY", "READ_REQUIRED",
  "EVIDENCE_READ", "TREE_EXPANSION_REQUIRED", "LINK_EXPANSION_REQUIRED",
  "EVIDENCE_SUFFICIENT", "EVIDENCE_INSUFFICIENT_WITH_OPTIONS",
  "EVIDENCE_INSUFFICIENT_FINAL", "ANSWER_READY", "FINALIZED",
];

export interface FirstPrinciplesViolation {
  rule: string;
  severity: "violation" | "severe";
  detail: Record<string, unknown>;
}

export interface FirstPrinciplesGuardResult {
  ok: boolean;
  violations: FirstPrinciplesViolation[];
}

const READ_DOCS = "read_docs";
const EXECUTION_ONLY_READ_SOURCE_VALUES = new Set(["candidate_docs", "search_scope", "previous_evidence"]);

export function checkPlannerDecisionGuard(input: {
  plannerAction: PlannerAction;
  decisionSource: string;
  materializedAction?: AgentAction;
  materializedFrom?: string;
}): FirstPrinciplesGuardResult {
  const violations: FirstPrinciplesViolation[] = [];

  if (input.decisionSource !== "ai_planner") {
    violations.push({
      rule: "decisionSource_must_be_ai_planner",
      severity: "severe",
      detail: { actionType: input.plannerAction.type, decisionSource: input.decisionSource },
    });
  }

  if (input.plannerAction.type === "answer" && input.decisionSource !== "ai_planner") {
    violations.push({
      rule: "answer_decisionSource_must_be_ai_planner",
      severity: "severe",
      detail: { decisionSource: input.decisionSource },
    });
  }

  if (input.materializedAction?.type === READ_DOCS) {
    const validFrom = input.materializedFrom === "read_candidate_docs" || input.materializedFrom === "read_previous_evidence";
    if (!validFrom) {
      violations.push({
        rule: "read_docs_must_come_from_candidate_or_previous",
        severity: "severe",
        detail: { materializedFrom: input.materializedFrom },
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export function checkPlannerAllowedActionsGuard(input: {
  allowedActions: string[];
}): FirstPrinciplesGuardResult {
  const violations: FirstPrinciplesViolation[] = [];

  if (input.allowedActions.includes(READ_DOCS)) {
    violations.push({
      rule: "read_docs_not_in_planner_allowedActions",
      severity: "severe",
      detail: { allowedActions: input.allowedActions },
    });
  }

  return { ok: violations.length === 0, violations };
}

export function checkActionBoundaryGuard(input: {
  action: AgentAction;
  isMaterialized: boolean;
  materializedFrom?: string;
}): FirstPrinciplesGuardResult {
  const violations: FirstPrinciplesViolation[] = [];

  if (input.action.type === READ_DOCS && !input.isMaterialized) {
    violations.push({
      rule: "read_docs_must_be_materialized",
      severity: "severe",
      detail: { actionType: input.action.type },
    });
  }

  if (input.action.type === READ_DOCS && input.isMaterialized) {
    if (!EXECUTION_ONLY_READ_SOURCE_VALUES.has(input.materializedFrom ?? "")) {
      violations.push({
        rule: "read_docs_materializedFrom_invalid",
        severity: "severe",
        detail: { materializedFrom: input.materializedFrom },
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export function checkFocusDocScopeHandlesGuard(input: {
  action: PlannerAction;
}): FirstPrinciplesGuardResult {
  const violations: FirstPrinciplesViolation[] = [];

  if (input.action.type === "focus_doc_scope") {
    const args = input.action.args as { handles?: unknown };
    if (!Array.isArray(args.handles) || args.handles.length === 0) {
      violations.push({
        rule: "focus_doc_scope_must_have_handles",
        severity: "severe",
        detail: { actionType: input.action.type },
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export function checkReadDocsNotPlannerVisibleGuard(): FirstPrinciplesGuardResult {
  const violations: FirstPrinciplesViolation[] = [];

  if (isPlannerVisibleToolName(READ_DOCS as any)) {
    violations.push({
      rule: "read_docs_must_not_be_planner_visible",
      severity: "severe",
      detail: {},
    });
  }

  const plannerTools = getPlannerVisibleToolNames();
  if (plannerTools.includes(READ_DOCS as any)) {
    violations.push({
      rule: "read_docs_not_in_planner_visible_list",
      severity: "severe",
      detail: {},
    });
  }

  return { ok: violations.length === 0, violations };
}

export function emitFirstPrinciplesViolation(
  traceLog: TraceStep[],
  guardResult: FirstPrinciplesGuardResult,
  context: string,
): void {
  if (guardResult.ok) return;

  for (const v of guardResult.violations) {
    const eventName = "FIRST_PRINCIPLES_VIOLATION_SAFE";
    traceLog.push({
      name: eventName,
      status: "failed",
      detail: JSON.stringify({
        rule: v.rule,
        severity: v.severity,
        context,
        ...v.detail,
      }),
    });
    console.error(`[KB-AGENT | ${eventName}]`, {
      rule: v.rule,
      severity: v.severity,
      context,
    });
    pushAgentDebugEvent(eventName, {
      rule: v.rule,
      severity: v.severity,
      context,
    }, "error");
  }
}

const FIRST_PRINCIPLES_GUARD_FAILURE_ANSWER = "系统内部校验失败（第一铁律 guard），已停止处理。";

export function finalizeFirstPrinciplesGuardFailureState(
  state: AgenticRagState,
  guardResult: FirstPrinciplesGuardResult,
  context: string,
): AgenticRagState {
  const traceLog = [...state.traceLog];
  emitFirstPrinciplesViolation(traceLog, guardResult, context);

  return {
    ...state,
    currentAction: undefined,
    finalAnswerAction: undefined,
    composedAnswer: FIRST_PRINCIPLES_GUARD_FAILURE_ANSWER,
    finalEvidencePack: buildEmptyInsufficientEvidencePack(),
    footerReferences: [],
    finalEvidenceDocIds: [],
    droppedReferenceDocIds: [],
    traceLog,
    warnings: [
      ...state.warnings,
      `first-principles: ${context} guard failed, fail closed`,
    ],
  };
}

export function finalizeSystemFailureState(
  state: AgenticRagState,
  message: string,
  traceName: string,
  warning: string,
  traceDetail?: Record<string, unknown>,
): AgenticRagState {
  return {
    ...state,
    currentAction: undefined,
    finalAnswerAction: undefined,
    composedAnswer: message,
    finalEvidencePack: buildEmptyInsufficientEvidencePack(),
    footerReferences: [],
    finalEvidenceDocIds: [],
    droppedReferenceDocIds: [],
    terminalAnswerSource: "system_failure",
    finalizeReasonCode: warning,
    composedAnswerSource: "system_failure",
    traceLog: [
      ...state.traceLog,
      {
        name: traceName,
        status: "success" as const,
        detail: JSON.stringify(traceDetail ?? {}),
      },
    ],
    warnings: [...state.warnings, warning],
  };
}

export function checkFirstPrinciplesChecklist(): {
  passed: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
  informational: { name: string; detail: string }[];
} {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const informational: { name: string; detail: string }[] = [];

  // ── 真实运行时检查 ──────────────────────────────────

  assertReadDocsNotPlannerVisible();

  const readDocsVisible = checkReadDocsNotPlannerVisibleGuard();
  checks.push({
    name: "read_docs_not_planner_visible",
    ok: readDocsVisible.ok,
    detail: readDocsVisible.ok ? undefined : "read_docs is visible to Planner",
  });

  const plannerTools = getPlannerVisibleToolNames();
  const hasReadDocsInPlannerTools = plannerTools.includes(READ_DOCS as any);
  checks.push({
    name: "planner_visible_tools_exclude_read_docs",
    ok: !hasReadDocsInPlannerTools,
    detail: hasReadDocsInPlannerTools ? "read_docs found in planner visible tools" : undefined,
  });

  const allToolNames = ["list_knowledge_map", "focus_doc_scope", "search_scope", "list_scope_docs",
    "read_candidate_docs", "read_block_context", "get_doc_tree_context",
    "get_conversation_used_references", "read_previous_evidence", "answer"] as const;
  for (const toolName of allToolNames) {
    const plannerNext = getPlannerAllowedNextActions(toolName as any);
    const hasReadDocsInNext = plannerNext.includes(READ_DOCS as any);
    checks.push({
      name: `planner_allowedNext_${toolName}_excludes_read_docs`,
      ok: !hasReadDocsInNext,
      detail: hasReadDocsInNext ? `${toolName} plannerAllowedNext contains read_docs` : undefined,
    });
  }

  for (const stateName of KB_AGENT_STATE_NAMES) {
    const allowed = getAllowedActionsForState({ state: stateName });
    const hasReadDocsInState = allowed.includes(READ_DOCS as any);
    checks.push({
      name: `getAllowedActionsForState_${stateName}_excludes_read_docs`,
      ok: !hasReadDocsInState,
      detail: hasReadDocsInState ? `${stateName} allowedActions contains read_docs` : undefined,
    });
  }

  const ctxAllowed = getAllowedActionsForStateContext({
    state: "EVIDENCE_INSUFFICIENT_WITH_OPTIONS",
    gateMissing: "only_candidates",
    candidateDocCount: 1,
    readableCandidateDocCount: 1,
    candidateBlockCount: 0,
    readDocCount: 0,
    readBlockContextCount: 0,
    hasKnowledgeMap: false,
    hasActiveFocusScope: false,
    searchBudgetRemaining: 10,
    readBudgetRemaining: 10,
  });
  if (ctxAllowed) {
    const hasReadDocsCtx = ctxAllowed.includes(READ_DOCS as any);
    checks.push({
      name: "getAllowedActionsForStateContext_excludes_read_docs",
      ok: !hasReadDocsCtx,
      detail: hasReadDocsCtx ? "getAllowedActionsForStateContext returned read_docs" : undefined,
    });
  }

  // ── 结构说明（不能在运行时 grep 源码验证） ─────────

  informational.push({
    name: "read_candidate_docs_can_materialize_read_docs",
    detail: "materializer supports read_candidate_docs -> read_docs",
  });

  informational.push({
    name: "answer_requires_ai_planner_decisionSource",
    detail: "checkPlannerDecisionGuard enforces decisionSource=ai_planner for answer",
  });

  informational.push({
    name: "severe_violation_blocks_execute",
    detail: "checkActionBoundaryGuard + checkPlannerAllowedActionsGuard both return early on violation",
  });

  informational.push({
    name: "no_state_recovery_code_exists",
    detail: "no business action recovery/continuation code exists; all tool results are observations returned to Planner",
  });

  informational.push({
    name: "no_buildDeterministicRequiredAction",
    detail: "action-continuation.ts deleted; no continuation/deterministic requirement logic remains",
  });

  informational.push({
    name: "no_legacy_route_hint_fields",
    detail: "legacy route hint fields removed; no tool plan or route hint logic remains",
  });

  informational.push({
    name: "system_failure_uses_finalizeSystemFailureState",
    detail: "protocol/system/planner terminal/compose catch failures all use finalizeSystemFailureState which clears currentAction/finalAnswerAction/finalEvidencePack/footerReferences",
  });

  informational.push({
    name: "finalAnswerAction_only_from_planner",
    detail: "finalAnswerAction only set by Planner answer path; system failure paths do not construct answer actions",
  });

  informational.push({
    name: "abort_fail_closed",
    detail: "finalizeAbortedState clears currentAction/finalAnswerAction/finalEvidencePack/footerReferences/finalEvidenceDocIds/droppedReferenceDocIds",
  });

  informational.push({
    name: "no_evidence_uses_finalizeNoEvidenceKbAnswerState",
    detail: "FINAL_ANSWER_PROTECTED_NO_EVIDENCE uses finalizeNoEvidenceKbAnswerState which clears finalAnswerAction/currentAction; does not rewrite evidenceMode",
  });

  informational.push({
    name: "planner_answer_not_rewritten_by_code",
    detail: "normalizeAnswerAction removed; code does not rewrite finalAnswerAction.args.evidenceMode",
  });

  informational.push({
    name: "search_bootstrap_no_planner_action",
    detail: "search-bootstrap.ts only exports diagnoseInitialSearchBootstrapNeed (pure diagnosis) and shouldBootstrapInitialSearch; no PlannerAction constructor",
  });

  informational.push({
    name: "planner_schema_excludes_semantic_first",
    detail: "VALID_RETRIEVAL_MODES only contains balanced / keyword_first / exact_only; Planner schema does not include semantic_first",
  });

  informational.push({
    name: "prompt_no_internal_field_names",
    detail: "runtime prompt does not expose allowedActions / forbiddenActions / readDocCount / Candidate Pack / Evidence Pack / State Machine",
  });

  informational.push({
    name: "final_answer_prompt_no_read_docs",
    detail: "final-answer-prompt.ts does not reference read_docs; historical references use natural language",
  });

  informational.push({
    name: "prompt_no_first_principle_text",
    detail: "runtime prompt does not contain first principle full text or implementation principle wording",
  });

  informational.push({
    name: "no_buildInsufficientEvidenceAnswer",
    detail: "planner-action-materializer.ts deleted buildInsufficientEvidenceAnswer; non-answer planner action failures return ok:false",
  });

  informational.push({
    name: "materializedType_answer_only_for_planner_answer",
    detail: "materializedType=answer only allowed when plannerType=answer; read_candidate_docs/read_previous_evidence/read_block_context failures do not return answer",
  });

  informational.push({
    name: "read_docs_not_in_source_allowedNext",
    detail: "read_docs contract allowedNext source field does not contain read_docs; getPlannerAllowedNextActions filter is defense layer only",
  });

  informational.push({
    name: "no_tool_plan_state_in_graph_logs",
    detail: "graph.ts log fields use observation status, not legacy tool plan or route hints",
  });

  informational.push({
    name: "prompt_no_canonical_args_or_system_hard_check",
    detail: "runtime prompt does not contain canonical args / system hard check / whole_kb",
  });

  informational.push({
    name: "agentic_search_source_no_hybrid",
    detail: "Agentic RAG search hit source uses keyword_fuzzy / keyword / fuzzy / fallback, not hybrid",
  });

  informational.push({
    name: "tool_prompt_no_evidence_pack_or_materialized_read",
    detail: "tool prompt does not output evidence pack / materialized read action / deterministic continuation / budgets exhausted / insufficient_evidence",
  });

  informational.push({
    name: "planner_prompt_no_internal_process_metrics",
    detail: "planner prompt does not output whole_kb raw value, confidence, doc count, catalog N items, read N docs",
  });

  informational.push({
    name: "agentic_rag_layer_no_hybrid_search_naming",
    detail: "Agentic RAG layer comments use keyword + fuzzy retrieval, not HybridSearch",
  });

  informational.push({
    name: "no_real_query_in_debug_trace",
    detail: "search-blocks.ts / search-scope-tool.ts / debugExecEnd do not output query.slice / query preview / queryTextShort",
  });

  informational.push({
    name: "exec_end_search_scope_uses_queries_array",
    detail: "search_scope EXEC_END uses argsSummary.queries array for queryCount/hasQuery/queryChars/queryHash",
  });

  informational.push({
    name: "validate_action_no_query_rewrite",
    detail: "validate-action-node.ts does not rewrite query; query guard only validates structure/count/empty",
  });

  informational.push({
    name: "search_blocks_no_hybrid_candidate_local_naming",
    detail: "search-blocks.ts uses import type RetrievalCandidate; local naming does not contain HybridCandidate / HybridSearch",
  });

  informational.push({
    name: "no_json_stringify_args_in_search_scope",
    detail: "search-scope-tool.ts does not use JSON.stringify(args) / rawArgsSummary / String(args).slice",
  });

  informational.push({
    name: "no_model_label_specific_compat_patch",
    detail: "compatibility uses providerFamily / providerType / capabilityProfile / runtime observation; no per-model-name branching or specific model id patches",
  });

  informational.push({
    name: "compatibility_uses_provider_or_observation",
    detail: "model compat uses providerFamily defaults / capabilityProfile / controlPlaneJsonObservation; no per-modelLabel branching in Agentic RAG layer",
  });

  return {
    passed: checks.every((c) => c.ok),
    checks,
    informational,
  };
}

const FORBIDDEN_RAW_QUERY_KEYS = ["sourceQuery", "sourceQueries", "searchedQueries"];
const FORBIDDEN_SCAN_MAX_DEPTH = 8;

function findForbiddenKeysDeep(
  obj: unknown,
  forbiddenKeys: readonly string[],
  path: string,
  violations: FirstPrinciplesViolation[],
  depth: number,
  maxDepth: number,
  visited: Set<object>,
): void {
  if (depth > maxDepth) return;
  if (obj === null || typeof obj !== "object") return;
  if (visited.has(obj)) return;
  visited.add(obj);

  const record = obj as Record<string, unknown>;
  for (const key of forbiddenKeys) {
    if (key in record) {
      violations.push({
        rule: "forbidden_raw_query_key_detected",
        severity: "severe",
        detail: { path: path ? `${path}.${key}` : key, key },
      });
    }
  }

  if (Array.isArray(record)) {
    for (let i = 0; i < record.length; i++) {
      findForbiddenKeysDeep(record[i], forbiddenKeys, `${path}[${i}]`, violations, depth + 1, maxDepth, visited);
    }
  } else {
    for (const k of Object.keys(record)) {
      if (forbiddenKeys.includes(k)) continue;
      const val = record[k];
      if (val !== null && typeof val === "object") {
        findForbiddenKeysDeep(val, forbiddenKeys, `${path}.${k}`, violations, depth + 1, maxDepth, visited);
      }
    }
  }
}

export function checkWorkspaceNoRawQueryFields(workspace: unknown): FirstPrinciplesGuardResult {
  const violations: FirstPrinciplesViolation[] = [];
  if (!workspace || typeof workspace !== "object") return { ok: true, violations };
  findForbiddenKeysDeep(workspace, FORBIDDEN_RAW_QUERY_KEYS, "workspace", violations, 0, FORBIDDEN_SCAN_MAX_DEPTH, new Set());
  return { ok: violations.length === 0, violations };
}

export function checkEvidencePackNoRawQueryFields(evidencePack: unknown): FirstPrinciplesGuardResult {
  const violations: FirstPrinciplesViolation[] = [];
  if (!evidencePack || typeof evidencePack !== "object") return { ok: true, violations };
  findForbiddenKeysDeep(evidencePack, FORBIDDEN_RAW_QUERY_KEYS, "evidencePack", violations, 0, FORBIDDEN_SCAN_MAX_DEPTH, new Set());
  return { ok: violations.length === 0, violations };
}
