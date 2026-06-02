/**
 * Planner 执行桥接层
 *
 * 职责：
 * - 桥接层只校验 materializer 产生的动作；原始 PlannerAction 不能直接执行。
 * - 校验物化后的规划动作是否可执行
 * - 校验通过才 shouldUsePlannerAction=true
 * - 校验失败时桥接层不选择执行动作
 * - 只有物化动作可以被桥接层选中
 * - 不根据用户原文做语义判断
 */

import type { PlannerAction } from "../planner/planner-action";
import type { AgentAction } from "../actions/action-types";
import type { EvidenceWorkspace } from "../workspace/evidence-workspace";
import type { AgenticRagBudget, AgenticRagCounters } from "../runtime/budget";
import type { AgentScope } from "../scope/types";
import type { TraceStep } from "../graph/state";
import type { FollowUpContext } from "../runtime/follow-up-context";

export interface PlannerExecutionBridgeDecision {
  shouldUsePlannerAction: boolean;

  action?: AgentAction;
  rejectionReason?: string;
  warnings: string[];
  debugSummary: {
    plannerActionType?: string;
    materializedActionType?: string;
    selectedForExecution: boolean;
    reason: string;
  };
}

export interface SelectPlannerActionParams {
  plannerAction?: PlannerAction;
  plannerMaterializedAction?: AgentAction;
  workspace: EvidenceWorkspace;
  budget: AgenticRagBudget;
  counters: AgenticRagCounters;
  scope?: AgentScope;
  followUpContext?: FollowUpContext;
  traceLog?: TraceStep[];
  trace?: boolean;
}

export function selectPlannerActionForExecution(
  params: SelectPlannerActionParams
): PlannerExecutionBridgeDecision {
  const { plannerAction, plannerMaterializedAction } = params;
  const warnings: string[] = [];

  void plannerAction;
  void plannerMaterializedAction;

  return evaluatePlannerBridge(params, warnings);
}

function evaluatePlannerBridge(
  params: SelectPlannerActionParams,
  warnings: string[]
): PlannerExecutionBridgeDecision {
  const { plannerAction, plannerMaterializedAction, workspace, budget, counters, scope, followUpContext } = params;

  const plannerActionType = plannerAction?.type;
  const materializedActionType = plannerMaterializedAction?.type;

  if (!plannerMaterializedAction) {
    return {
      shouldUsePlannerAction: false,
      warnings,
      rejectionReason: "没有可执行的规划器物化动作",
      debugSummary: {
        plannerActionType,
        materializedActionType,
        selectedForExecution: false,
        reason: "没有可执行的规划器物化动作",
      },
    };
  }

  const validationErrors = validateMaterializedAction(plannerMaterializedAction, workspace, budget, counters, scope, followUpContext);

  if (validationErrors.length > 0) {
    warnings.push(...validationErrors);
    return {
      shouldUsePlannerAction: false,
      warnings,
      rejectionReason: validationErrors.join("; "),
      debugSummary: {
        plannerActionType,
        materializedActionType,
        selectedForExecution: false,
        reason: "规划器物化动作校验失败",
      },
    };
  }

  return {
    shouldUsePlannerAction: true,
    action: plannerMaterializedAction,
    warnings,
    debugSummary: {
      plannerActionType,
      materializedActionType,
      selectedForExecution: true,
      reason: "物化动作通过桥接层校验",
    },
  };
}

function validateMaterializedAction(
  action: AgentAction,
  workspace: EvidenceWorkspace,
  budget: AgenticRagBudget,
  _counters: AgenticRagCounters,
  scope?: AgentScope,
  followUpContext?: FollowUpContext,
): string[] {
  const errors: string[] = [];

  switch (action.type) {
    case "read_docs":
      validateReadDocs(action, workspace, scope, errors, followUpContext);
      break;
    case "read_block_context":
      validateReadBlockContext(action, workspace, errors);
      break;
    case "search_scope":
      validateSearchScope(action, budget, errors);
      break;
    case "list_scope_docs":
      validateListScopeDocs(action, budget, errors);
      break;
    case "answer":
      validateAnswer(action, workspace, errors);
      break;
    case "get_doc_tree_context":
      validateGetDocTreeContext(action, workspace, followUpContext, errors);
      break;
    case "get_conversation_used_references":
      validateGetConversationUsedReferences(action, errors);
      break;
    case "read_candidate_docs":
      validateReadCandidateDocs(action, workspace, errors);
      break;
    case "read_previous_evidence":
      validateReadPreviousEvidence(action, workspace, errors, followUpContext);
      break;
    case "list_knowledge_map":
      validateListKnowledgeMap(action, errors);
      break;
    case "focus_doc_scope":
      validateFocusDocScope(action, workspace, errors);
      break;
    default:
      errors.push(`不支持的动作类型：该动作不能由桥接层执行`);
      break;
  }

  return errors;
}

function getAllowedDocIds(
  workspace: EvidenceWorkspace,
  scope?: AgentScope,
): Set<string> {
  const allowed = new Set<string>();

  for (const doc of workspace.candidateDocs) {
    allowed.add(doc.docId);
  }
  for (const doc of workspace.readDocuments) {
    allowed.add(doc.docId);
  }
  for (const evidence of workspace.recentEvidence) {
    if (evidence.docId) {
      allowed.add(evidence.docId);
    }
  }

  if (workspace.conversationUsedReferences && workspace.conversationUsedReferences.length > 0) {
    for (const turnRef of workspace.conversationUsedReferences) {
      for (const ref of turnRef.references ?? []) {
        if (ref.internalDocId && ref.internalDocId.trim().length > 0) {
          allowed.add(ref.internalDocId);
        }
      }
    }
  }

  if (scope) {
    switch (scope.type) {
      case "current_doc":
        if (scope.docId) allowed.add(scope.docId);
        break;
      case "doc_tree":
        if (scope.rootDocId) allowed.add(scope.rootDocId);
        break;
      case "custom_docs":
        for (const id of scope.docIds) {
          allowed.add(id);
        }
        break;
    }
  }

  return allowed;
}

function validateReadDocs(
  action: Extract<AgentAction, { type: "read_docs" }>,
  workspace: EvidenceWorkspace,
  scope: AgentScope | undefined,
  errors: string[],
  followUpContext?: FollowUpContext,
): void {
  const docIds = action.args.docIds;

  if (!docIds || docIds.length === 0) {
    errors.push("read_docs: docIds must be non-empty");
    return;
  }

  const readSource = (action.args as unknown as Record<string, unknown>)?.readSource as string | undefined;
  const allowedDocIds = getAllowedDocIds(workspace, scope);

  let followUpDocCount = 0;
  if (readSource === "previous_evidence" && followUpContext?.previousReferenceDocIds && followUpContext.previousReferenceDocIds.length > 0) {
    for (const id of followUpContext.previousReferenceDocIds) {
      if (id && id.trim().length > 0) {
        allowedDocIds.add(id);
        followUpDocCount++;
      }
    }
  }

  const conversationRefDocCount = workspace.conversationUsedReferences
    ? workspace.conversationUsedReferences.reduce((sum, turnRef) => {
        return sum + (turnRef.references ?? []).filter((r) => r.internalDocId && r.internalDocId.trim().length > 0).length;
      }, 0)
    : 0;

  const invalidDocIds = docIds.filter((id) => !allowedDocIds.has(id));

  console.info("[KB-AGENT | READ_DOCS_PREVIOUS_EVIDENCE_ALLOWED_SOURCE_SAFE]", {
    readSource: readSource ?? "unknown",
    followUpDocCount,
    conversationRefDocCount,
    allowedDocCount: allowedDocIds.size,
    inputDocCount: docIds.length,
    invalidDocCount: invalidDocIds.length,
  });

  if (invalidDocIds.length > 0) {
    errors.push(`read_docs: ${invalidDocIds.length} docIds not from allowed sources (candidateDocs/readDocuments/recentEvidence/conversationUsedReferences/scope)`);
  }
}

function validateReadBlockContext(
  action: Extract<AgentAction, { type: "read_block_context" }>,
  workspace: EvidenceWorkspace,
  errors: string[]
): void {
  const blockIds = action.args.blockIds;

  if (!blockIds || blockIds.length === 0) {
    errors.push("read_block_context: blockIds must be non-empty");
    return;
  }

  const allowedBlockIds = new Set(workspace.candidateBlocks.map((b) => b.blockId));

  const invalidBlockIds = blockIds.filter((id) => !allowedBlockIds.has(id));
  if (invalidBlockIds.length > 0) {
    errors.push(`read_block_context: ${invalidBlockIds.length} blockIds not from workspace.candidateBlocks`);
  }
}

function validateSearchScope(
  action: Extract<AgentAction, { type: "search_scope" }>,
  budget: AgenticRagBudget,
  errors: string[]
): void {
  const queries = action.args.queries;

  if (!queries || queries.length === 0) {
    errors.push("search_scope: queries must be non-empty");
    return;
  }

  if (queries.length > (budget.maxQueriesPerSearch ?? 3)) {
    errors.push(`search_scope: queries count (${queries.length}) exceeds budget maxQueriesPerSearch (${budget.maxQueriesPerSearch ?? 3})`);
  }

  const includeDocIds = (action.args as unknown as Record<string, unknown>).includeDocIds;
  const excludeDocIds = (action.args as unknown as Record<string, unknown>).excludeDocIds;

  if (Array.isArray(includeDocIds) && includeDocIds.length > 0) {
    errors.push("search_scope: includeDocIds must not carry real IDs");
  }
  if (Array.isArray(excludeDocIds) && excludeDocIds.length > 0) {
    errors.push("search_scope: excludeDocIds must not carry real IDs");
  }
}

function validateListScopeDocs(
  action: Extract<AgentAction, { type: "list_scope_docs" }>,
  budget: AgenticRagBudget,
  _errors: string[]
): void {
  const args = action.args as unknown as Record<string, unknown>;
  const limit = args.limit;

  if (typeof limit === "number") {
    const clamped = Math.max(1, Math.min(limit, budget.maxReadDocs ?? 10));
    if (clamped !== limit) {
      (action.args as unknown as Record<string, unknown>).limit = clamped;
    }
  }
}

function validateAnswer(
  action: Extract<AgentAction, { type: "answer" }>,
  workspace: EvidenceWorkspace,
  errors: string[]
): void {
  const args = action.args as unknown as Record<string, unknown>;

  if (args.evidenceDocIds || args.evidenceBlockIds) {
    errors.push("answer: 桥接层校验中不得携带 evidenceDocIds/evidenceBlockIds");
    return;
  }

  if (args.evidenceMode === "with_evidence") {
    const hasReadDocs = workspace.readDocuments.length > 0;
    const hasReadBlocks = workspace.readBlockContexts.length > 0;
    const hasRecentEvidence = workspace.recentEvidence.length > 0;

    if (!hasReadDocs && !hasReadBlocks && !hasRecentEvidence) {
      errors.push("answer: with_evidence requires workspace to have readDocuments/readBlockContexts/recentEvidence");
    }
  }
}

function validateGetDocTreeContext(
  _action: Extract<AgentAction, { type: "get_doc_tree_context" }>,
  workspace: EvidenceWorkspace,
  followUpContext: FollowUpContext | undefined,
  errors: string[]
): void {
  const hasReadDocs = workspace.readDocuments.length > 0;
  const hasCandidateDocs = workspace.candidateDocs.length > 0;
  const hasConversationRefs = (workspace.conversationUsedReferences?.length ?? 0) > 0;
  const hasPreviousEvidence = (followUpContext?.previousReferenceDocIds?.length ?? 0) > 0;
  const hasDocHandleMappings = (workspace.docHandleMappings?.length ?? 0) > 0;

  if (!hasReadDocs && !hasCandidateDocs && !hasConversationRefs && !hasPreviousEvidence && !hasDocHandleMappings) {
    errors.push("get_doc_tree_context: no anchor source available");
  }
}

function validateGetConversationUsedReferences(
  _action: Extract<AgentAction, { type: "get_conversation_used_references" }>,
  _errors: string[]
): void {
}

function validateReadCandidateDocs(
  _action: Extract<AgentAction, { type: "read_candidate_docs" }>,
  workspace: EvidenceWorkspace,
  errors: string[]
): void {
  const readDocIdSet = new Set(workspace.readDocuments.map((d) => d.docId));
  const hasUnreadCandidates = workspace.candidateDocs.some((d) => !readDocIdSet.has(d.docId));
  const pool = workspace.researchCandidatePool;
  const hasPoolRemaining = pool
    ? pool.candidateDocIdsInRankOrder.length - pool.readDocIds.length - pool.skippedDocIds.length > 0
    : false;

  if (!hasUnreadCandidates && !hasPoolRemaining) {
    errors.push("read_candidate_docs: no unread candidates available");
  }
}

function validateReadPreviousEvidence(
  _action: Extract<AgentAction, { type: "read_previous_evidence" }>,
  workspace: EvidenceWorkspace,
  errors: string[],
  followUpContext?: FollowUpContext,
): void {
  const hasConversationRefs = (workspace.conversationUsedReferences?.length ?? 0) > 0;
  const hasFollowUpRefs = (followUpContext?.previousReferenceDocIds?.length ?? 0) > 0;

  if (!hasConversationRefs && !hasFollowUpRefs) {
    errors.push("read_previous_evidence: no previous evidence available from conversationUsedReferences or followUpContext");
  }
}

function validateListKnowledgeMap(
  action: Extract<AgentAction, { type: "list_knowledge_map" }>,
  errors: string[]
): void {
  const args = action.args as unknown as Record<string, unknown>;

  // 不允许携带真实 docId/path/box
  if (args.docId || args.docIds || args.path || args.box) {
    errors.push("list_knowledge_map: 不允许携带真实 docId/path/box");
  }

  // maxDepth clamp
  if (typeof args.maxDepth === "number") {
    const clamped = Math.max(1, Math.min(Math.floor(args.maxDepth), 6));
    if (clamped !== args.maxDepth) {
      (action.args as unknown as Record<string, unknown>).maxDepth = clamped;
    }
  }

  // maxNodes clamp
  if (typeof args.maxNodes === "number") {
    const clamped = Math.max(20, Math.min(Math.floor(args.maxNodes), 300));
    if (clamped !== args.maxNodes) {
      (action.args as unknown as Record<string, unknown>).maxNodes = clamped;
    }
  }
}

function validateFocusDocScope(
  action: Extract<AgentAction, { type: "focus_doc_scope" }>,
  workspace: EvidenceWorkspace,
  errors: string[]
): void {
  const args = action.args as unknown as Record<string, unknown>;

  // handles 必须非空
  if (!Array.isArray(args.handles) || args.handles.length === 0) {
    errors.push("focus_doc_scope: handles 必须非空");
    return;
  }

  // handles 不能像真实 docId（短字符串检查）
  for (const handle of args.handles) {
    if (typeof handle !== "string" || handle.length === 0) {
      errors.push("focus_doc_scope: handles 必须是短字符串");
      return;
    }
  }

  // 不允许携带真实 docIds/path/box
  if (args.docIds || args.path || args.box) {
    errors.push("focus_doc_scope: 不允许携带真实 docIds/path/box");
  }

  // maxDocIds clamp
  if (typeof args.maxDocIds === "number") {
    const clamped = Math.max(1, Math.min(Math.floor(args.maxDocIds), 200));
    if (clamped !== args.maxDocIds) {
      (action.args as unknown as Record<string, unknown>).maxDocIds = clamped;
    }
  }

  // 检查 workspace 是否有 docHandleMappings
  if (!workspace.docHandleMappings || workspace.docHandleMappings.length === 0) {
    errors.push("focus_doc_scope: 未加载文档图谱，请先调用 list_knowledge_map");
  }
}
