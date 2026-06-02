/**
 * Planner Action 物化器
 *
 * 确定性 AI 规划器动作物化器：把 PlannerAction 转成可执行 AgentAction。
 *
 * 职责：
 * - read_candidate_docs → 从 workspace.candidateDocs 按文档级分数选择真实 docIds → materialized read_docs
 * - read_previous_evidence → 从 workspace.conversationUsedReferences 的 displayed references 选择真实 docIds → materialized read_docs
 * - read_block_context → 从 workspace.candidateBlocks 选择真实 blockIds → materialized read_block_context
 * - search_scope / list_scope_docs → 直接转换为同名 AgentAction
 * - answer → 转为 answer，按证据状态做安全降级
 *
 * 核心规则：
 * - AI 不能生成真实 ID。物化器只能从 workspace、previous reference、scope 中选择真实 docIds/blockIds。
 * - 不允许 PlannerAction.args 中的 docIds/blockIds/candidateDocIds/candidateBlockIds 进入最终 action。
 * - 不根据用户原文做语义判断。
 */

import type { PlannerAction } from "../planner/planner-action";
import type { AgentAction, SearchScopeQuery, RetrievalMode } from "../actions/action-types";
import type { EvidenceWorkspace, CandidateDoc, CandidateBlock } from "../workspace/evidence-workspace";
import type { AgenticRagBudget, AgenticRagCounters } from "../runtime/budget";
import type { FollowUpContext } from "../runtime/follow-up-context";
import type { RuntimeTurnFacts } from "../runtime/runtime-turn-facts";
import type { TurnContextFact } from "../runtime/turn-context-fact";
import type { AgenticRuntimeRecentContext } from "../runtime/recent-context-types";
import { deriveEffectiveCandidatePolicy } from "../planner/effective-planner-constraints";
import { getNextBatchFromPool } from "../workspace/research-candidate-pool";
import { priorityFor } from "../harness/context/candidate-pack";
import { isStrongCandidateDoc, isInventoryOnlyCandidateDoc } from "../workspace/candidate-quality";
import { pushAgentDebugEvent } from "../debug/agentic-rag-debug";
import { buildPreviousEvidenceHandleIndex } from "../harness/context/previous-evidence-handle-index";

const VALID_RETRIEVAL_MODES: RetrievalMode[] = ["balanced", "keyword_first", "exact_only"];

export interface PlannerActionMaterializeParams {
  plannerAction: PlannerAction;
  workspace: EvidenceWorkspace;
  budget: AgenticRagBudget;
  counters: AgenticRagCounters;
  followUpContext?: FollowUpContext;
  runtimeTurnFacts?: RuntimeTurnFacts;
  turnContextFact?: TurnContextFact;
  recentContext?: AgenticRuntimeRecentContext;
}

export interface PlannerActionMaterializeResult {
  ok: boolean;
  action?: AgentAction;
  warnings: string[];
  selectedDocIds?: string[];
  selectedBlockIds?: string[];
  previousReferenceMetadata?: {
    sourceDocIds: string[];
    selectedDocIds: string[];
    remainingAfterBatch: number;
    source: "conversation_used_references" | "followUp_context" | "recent_context";
    selectedTitleCount?: number;
    missingTitleCount?: number;
  };
  debugSummary: {
    plannerType: string;
    materializedType?: string;
    selectedDocCount?: number;
    selectedBlockCount?: number;
    inventoryOnlyCandidateCount?: number;
    selectedTitleCount?: number;
    missingTitleCount?: number;
    reason: string;
  };
}

export function materializePlannerAction(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction } = params;

  switch (plannerAction.type) {
    case "list_knowledge_map":
      return materializeListKnowledgeMap(params);
    case "focus_doc_scope":
      return materializeFocusDocScope(params);
    case "read_candidate_docs":
      return materializeReadCandidateDocs(params);
    case "read_previous_evidence":
      return materializeReadPreviousEvidence(params);
    case "read_block_context":
      return materializeReadBlockContext(params);
    case "search_scope":
      return materializeSearchScope(params);
    case "list_scope_docs":
      return materializeListScopeDocs(params);
    case "get_conversation_used_references":
      return materializeGetConversationUsedReferences(params);
    case "get_doc_tree_context":
      return materializeGetDocTreeContext(params);
    case "answer":
      return materializeAnswer(params);
    default:
      return {
        ok: false,
        warnings: [`未知的 AI 规划器动作类型：${plannerAction.type}`],
        debugSummary: {
          plannerType: plannerAction.type,
          reason: "未知的 AI 规划器动作类型",
        },
      };
  }
}

function materializeListKnowledgeMap(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as {
    query?: string;
    maxDepth?: number;
    maxNodes?: number;
    rootHandles?: string[];
    includeAncestors?: boolean;
    includeChildrenPreview?: boolean;
  };

  const action: AgentAction = {
    type: "list_knowledge_map",
    reason: `materialized from planner list_knowledge_map: ${plannerAction.reason}`,
    args: {
      query: typeof args.query === "string" && args.query.trim().length > 0 ? args.query.trim() : undefined,
      maxDepth: typeof args.maxDepth === "number" ? Math.min(Math.max(Math.floor(args.maxDepth), 1), 6) : undefined,
      maxNodes: typeof args.maxNodes === "number" ? Math.min(Math.max(Math.floor(args.maxNodes), 20), 300) : undefined,
      rootHandles: Array.isArray(args.rootHandles) ? args.rootHandles.filter((h): h is string => typeof h === "string" && h.length > 0) : undefined,
      includeAncestors: typeof args.includeAncestors === "boolean" ? args.includeAncestors : undefined,
      includeChildrenPreview: typeof args.includeChildrenPreview === "boolean" ? args.includeChildrenPreview : undefined,
    },
  };

  return {
    ok: true,
    action,
    warnings,
    debugSummary: {
      plannerType: "list_knowledge_map",
      materializedType: "list_knowledge_map",
      reason: `query=${args.query ? "provided" : "none"}, maxDepth=${args.maxDepth ?? "default"}, maxNodes=${args.maxNodes ?? "default"}`,
    },
  };
}

function materializeFocusDocScope(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as {
    handles?: string[];
    mode?: string;
    reason?: string;
    maxDocIds?: number;
  };

  const handles = Array.isArray(args.handles) ? args.handles.filter((h): h is string => typeof h === "string" && h.length > 0) : [];

  if (handles.length === 0) {
    warnings.push("no_valid_handles_provided");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "focus_doc_scope",
        reason: "no valid handles provided",
      },
    };
  }

  const validModes = ["exact", "subtree", "siblings", "notebook"];
  const mode = validModes.includes(args.mode ?? "") ? args.mode as "exact" | "subtree" | "siblings" | "notebook" : undefined;

  const action: AgentAction = {
    type: "focus_doc_scope",
    reason: `materialized from planner focus_doc_scope: ${plannerAction.reason}`,
    args: {
      handles,
      mode,
      reason: typeof args.reason === "string" && args.reason.trim().length > 0 ? args.reason.trim() : undefined,
      maxDocIds: typeof args.maxDocIds === "number" ? Math.min(Math.max(Math.floor(args.maxDocIds), 1), 200) : undefined,
    },
  };

  return {
    ok: true,
    action,
    warnings,
    debugSummary: {
      plannerType: "focus_doc_scope",
      materializedType: "focus_doc_scope",
      reason: `handles=${handles.length}, mode=${mode ?? "default"}`,
    },
  };
}

function getRemainingBlockBudget(budget: AgenticRagBudget, counters: AgenticRagCounters, workspace: EvidenceWorkspace): number {
  const usedByCounter = counters.readBlockContextCount ?? 0;
  const usedByWorkspace = workspace.readBlockContexts.length;
  const used = Math.max(usedByCounter, usedByWorkspace);
  return Math.max(0, budget.maxBlockContexts - used);
}

function getReadDocIdsSet(workspace: EvidenceWorkspace): Set<string> {
  return new Set(workspace.readDocuments.map((d) => d.docId));
}

/**
 * 候选文档排序：统一调用 Candidate Pack 的 priorityFor。
 * 不再使用旧的 scoreCandidateDoc 独立逻辑。
 */
function rankCandidateDoc(doc: CandidateDoc): number {
  return priorityFor({
    provenance: (doc as { provenance?: string }).provenance ?? doc.source,
    aggregateScore: doc.aggregateScore,
    relevanceScore: doc.relevanceScore,
    score: doc.score,
    source: doc.source,
    relationToFocus: (doc as { relationToFocus?: string }).relationToFocus,
  });
}

function scoreCandidateBlock(block: CandidateBlock): number {
  if (typeof block.score === "number" && !isNaN(block.score)) {
    return block.score;
  }
  return 0;
}

function materializeReadCandidateDocs(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction, workspace, budget, followUpContext } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as { selection?: string; k?: number };

  const effectivePolicy = deriveEffectiveCandidatePolicy({
    plannerAction,
  });

  // read_candidate_docs 使用 maxTotalResearchDocs 作为总读取预算，不使用 maxReadDocs
  const maxTotalResearchDocs = budget.maxTotalResearchDocs ?? 30;
  const totalReadSoFar = workspace.readDocuments.length;
  const remainingResearchDocs = Math.max(0, maxTotalResearchDocs - totalReadSoFar);

  if (remainingResearchDocs <= 0) {
    warnings.push("total_research_read_limit_reached");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_candidate_docs",
        reason: "total research read limit reached",
      },
    };
  }

  const pool = workspace.researchCandidatePool;
  const readDocIds = getReadDocIdsSet(workspace);

  // 统计未读候选文档数量
  const unreadCandidateCount = workspace.candidateDocs.filter((d) => !readDocIds.has(d.docId)).length;

  if (pool && pool.candidateDocIdsInRankOrder.length > 0) {
    const perBatchLimit = budget.perBatchReadLimit ?? Math.min(5, budget.maxReadDocs);
    // 批次大小：min(请求k, 单批限制, 研究剩余预算, 未读候选数)
    const batchSize = Math.min(args.k ?? perBatchLimit, perBatchLimit, remainingResearchDocs, unreadCandidateCount);

    const excludeSet = new Set<string>();
    for (const id of pool.readDocIds) excludeSet.add(id);
    for (const id of pool.skippedDocIds) excludeSet.add(id);
    // 也要排除 workspace.readDocuments 中已读的
    for (const id of readDocIds) excludeSet.add(id);

    const { docIds: batchDocIds, exhausted } = getNextBatchFromPool(pool, batchSize, excludeSet);

    const candidateDocMap = new Map(workspace.candidateDocs.map((d) => [d.docId, d]));
    const strongPoolDocIds: string[] = [];
    let inventoryDroppedCount = 0;
    for (const docId of batchDocIds) {
      const doc = candidateDocMap.get(docId);
      if (!doc) {
        strongPoolDocIds.push(docId);
        continue;
      }
      if (isInventoryOnlyCandidateDoc(doc)) {
        inventoryDroppedCount++;
        continue;
      }
      if (isStrongCandidateDoc(doc)) {
        strongPoolDocIds.push(docId);
      }
    }
    

    console.info("[KB-AGENT | READ_CANDIDATE_DOCS_POOL_FILTERED_SAFE]", {
      poolDocCount: batchDocIds.length,
      strongPoolDocCount: strongPoolDocIds.length,
      inventoryDroppedCount,
      selectedDocCount: strongPoolDocIds.length,
    });

    if (strongPoolDocIds.length === 0) {
      if (inventoryDroppedCount > 0) {
        warnings.push("only_inventory_candidates_for_read_candidate_docs");
        return {
          ok: false,
          warnings,
          debugSummary: {
            plannerType: "read_candidate_docs",
            reason: "pool batch contained only inventory candidates after filtering",
          },
        };
      }
    }

    const filteredBatchDocIds = strongPoolDocIds;

    // 已读候选集合 = workspace.readDocuments docId 与 workspace.candidateDocs docId 的交集 + pool.readDocIds
    const candidateDocIdSet = new Set(workspace.candidateDocs.map((d) => d.docId));
    const alreadyReadFromWorkspace = workspace.readDocuments.filter((d) => candidateDocIdSet.has(d.docId)).length;
    const alreadyReadCount = Math.max(pool.readDocIds.length, alreadyReadFromWorkspace);
    // remainingAfterBatch 表示候选剩余未读数量，不要混成研究预算剩余
    const unreadCandidatesAfterBatch = Math.max(0, pool.candidateDocIdsInRankOrder.length - alreadyReadCount - filteredBatchDocIds.length - pool.skippedDocIds.length);

    // 计算唯一候选文档数（按 internalDocId 去重）
    const uniqueCandidateDocIds = [...new Set(workspace.candidateDocs.map((d) => d.docId))];
    const uniqueReadDocIds = [...new Set(workspace.readDocuments.map((d) => d.docId))];
    const alreadyReadUniqueDocCount = uniqueCandidateDocIds.filter(id => uniqueReadDocIds.includes(id)).length;
    const unreadUniqueDocCount = uniqueCandidateDocIds.length - alreadyReadUniqueDocCount;

    console.info("[KB-AGENT | RESEARCH_BATCH_SELECTED_SAFE]", {
      candidateTotal: pool.totalCandidateCount,
      uniqueCandidateDocCount: uniqueCandidateDocIds.length,
      alreadyReadCount,
      alreadyReadUniqueDocCount,
      unreadCount: pool.candidateDocIdsInRankOrder.length - alreadyReadCount - pool.skippedDocIds.length,
      unreadUniqueDocCount,
      selectedCount: filteredBatchDocIds.length,
      remainingAfterBatch: unreadCandidatesAfterBatch,
      batchLimit: perBatchLimit,
      researchReadRemaining: remainingResearchDocs,
      batchIndex: pool.batchCount + 1,
    });

    if (filteredBatchDocIds.length === 0) {
      // 如果唯一未读候选数为 0，说明所有候选都已读或重复
      if (unreadUniqueDocCount === 0) {
        console.info("[KB-AGENT | RESEARCH_ALL_CANDIDATES_READ_SAFE]", {
          uniqueCandidateDocCount: uniqueCandidateDocIds.length,
          alreadyReadUniqueDocCount,
          unreadUniqueDocCount,
          reason: "all unique candidates have been read or are duplicates",
        });
        warnings.push("all_candidates_read");
        return {
          ok: false,
          warnings,
          debugSummary: {
            plannerType: "read_candidate_docs",
            reason: "all unique candidates have been read",
          },
        };
      }

      // pool 与 workspace 不一致：返回 failed materialize observation
      if (unreadCandidateCount > 0) {
        console.info("[KB-AGENT | POOL_INCONSISTENT_WORKSPACE_UNREAD_SAFE]", {
          selectedCount: 0,
          candidateUnreadCount: unreadCandidateCount,
          candidateResearchRemaining: remainingResearchDocs,
          poolCandidateCount: pool.candidateDocIdsInRankOrder.length,
          workspaceCandidateCount: workspace.candidateDocs.length,
          readDocCount: workspace.readDocuments.length,
        });
        warnings.push("pool_inconsistent_workspace_unread");
        return {
          ok: false,
          warnings,
          debugSummary: {
            plannerType: "read_candidate_docs",
            reason: "pool inconsistent with workspace unread candidates",
          },
        };
      }

      console.info("[KB-AGENT | RESEARCH_NEXT_BATCH_EMPTY]", {
        poolRemaining: pool.candidateDocIdsInRankOrder.length - pool.readDocIds.length - pool.skippedDocIds.length,
        workspaceUnreadCount: workspace.candidateDocs.filter((d) => !readDocIds.has(d.docId)).length,
        readDocCount: workspace.readDocuments.length,
        reason: "pool exhausted and no workspace unread candidates",
      });

      warnings.push("pool_exhausted");
      return {
        ok: false,
        warnings,
        debugSummary: {
          plannerType: "read_candidate_docs",
          reason: "candidate pool exhausted",
        },
      };
    }

    const action: AgentAction = {
      type: "read_docs",
      reason: `materialized from planner read_candidate_docs (batch): ${plannerAction.reason}`,
      args: {
        docIds: filteredBatchDocIds,
        readSource: "candidate_docs",
      },
    };

    return {
      ok: true,
      action,
      warnings,
      selectedDocIds: filteredBatchDocIds,
      debugSummary: {
        plannerType: "read_candidate_docs",
        materializedType: "read_docs",
        selectedDocCount: filteredBatchDocIds.length,
        reason: `batch selected ${filteredBatchDocIds.length} docs from pool (total=${pool.totalCandidateCount}, readSoFar=${pool.readDocIds.length}, batchIndex=${pool.batchCount + 1}, maxBatches=${budget.maxResearchBatches ?? 3}, exhausted=${exhausted})`,
      },
    };
  }

  let filteredCandidates = workspace.candidateDocs.filter(
    (d) => d.source !== "previous_evidence" && d.provenance !== "previous_evidence"
  );
  const excludedPreviousEvidenceCount = workspace.candidateDocs.length - filteredCandidates.length;

  let excludedPreviousTurnCount = 0;
  if (effectivePolicy.requireUnreadFromPreviousTurn && followUpContext?.previousReferenceDocIds) {
    const previousDocIdSet = new Set(followUpContext.previousReferenceDocIds);
    const beforeCount = filteredCandidates.length;
    filteredCandidates = filteredCandidates.filter((d) => !previousDocIdSet.has(d.docId));
    excludedPreviousTurnCount = beforeCount - filteredCandidates.length;
  }

  if (filteredCandidates.length === 0) {
    warnings.push("no_candidate_docs_after_constraints");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_candidate_docs",
        reason: "no candidate docs available after constraints filtering",
      },
    };
  }

  const strongCandidates = filteredCandidates.filter(isStrongCandidateDoc);
  const inventoryOnlyCandidates = filteredCandidates.filter(isInventoryOnlyCandidateDoc);

  if (strongCandidates.length === 0 && inventoryOnlyCandidates.length > 0) {
    warnings.push("only_inventory_candidates_for_read_candidate_docs");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_candidate_docs",
        reason: "only inventory candidates available, no strong candidates to read",
        inventoryOnlyCandidateCount: inventoryOnlyCandidates.length,
      },
    };
  }

  const selectionPool = strongCandidates;

  const k = Math.min(
    args.k ?? 5,
    remainingResearchDocs,
    selectionPool.length
  );

  if (k <= 0) {
    warnings.push("k_is_zero_after_budget_clamp");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_candidate_docs",
        reason: "k is zero after budget clamp",
      },
    };
  }

  const selection = args.selection ?? "top_k";

  let sortedDocs: CandidateDoc[];

  if (selection === "unread_top_k") {
    const unread = selectionPool.filter((d) => !readDocIds.has(d.docId));
    if (unread.length === 0) {
      warnings.push("no_unread_candidates");
      return {
        ok: false,
        warnings,
        debugSummary: {
          plannerType: "read_candidate_docs",
          reason: "no unread candidate docs",
        },
      };
    }
    sortedDocs = [...unread].sort((a, b) => rankCandidateDoc(b) - rankCandidateDoc(a));
  } else if (selection === "representative") {
    sortedDocs = selectRepresentativeDocs(selectionPool, readDocIds, k);
  } else {
    const unread = selectionPool.filter((d) => !readDocIds.has(d.docId));
    const read = selectionPool.filter((d) => readDocIds.has(d.docId));
    const sortedUnread = [...unread].sort((a, b) => rankCandidateDoc(b) - rankCandidateDoc(a));
    const sortedRead = [...read].sort((a, b) => rankCandidateDoc(b) - rankCandidateDoc(a));
    sortedDocs = [...sortedUnread, ...sortedRead];
  }

  const selectedDocs = sortedDocs.slice(0, k);
  const selectedDocIds = selectedDocs.map((d) => d.docId).filter(Boolean);
  const selectedInventoryOnlyCount = selectedDocs.filter(isInventoryOnlyCandidateDoc).length;

  if (selectedDocIds.length === 0) {
    warnings.push("no_valid_doc_ids_selected");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_candidate_docs",
        reason: "no valid doc ids selected",
      },
    };
  }

  if (strongCandidates.length === 0 && inventoryOnlyCandidates.length > 0) {
    warnings.push("only_inventory_candidates_for_read_candidate_docs");
  }

  const action: AgentAction = {
    type: "read_docs",
    reason: `materialized from planner read_candidate_docs: ${plannerAction.reason}`,
    args: {
      docIds: selectedDocIds,
      readSource: "candidate_docs",
    },
  };

  console.info("[KB-AGENT | CANDIDATE_SELECTION_FILTERED]", {
    candidateCount: workspace.candidateDocs.length,
    excludedPreviousTurnCount,
    selectedDocCount: selectedDocIds.length,
    effectiveRequireUnreadFromPreviousTurn: effectivePolicy.requireUnreadFromPreviousTurn,
    derivedFromTurnContext: effectivePolicy.derivedFromTurnContext,
    excludedPreviousReferenceDocIdCount: followUpContext?.previousReferenceDocIds?.length ?? 0,
    strongCandidateCount: strongCandidates.length,
    inventoryOnlyCandidateCount: inventoryOnlyCandidates.length,
    selectedInventoryOnlyCount,
  });

  return {
    ok: true,
    action,
    warnings,
    selectedDocIds,
    debugSummary: {
      plannerType: "read_candidate_docs",
      materializedType: "read_docs",
      selectedDocCount: selectedDocIds.length,
      reason: `selected ${selectedDocIds.length} docs from ${filteredCandidates.length} candidates (excluded ${excludedPreviousEvidenceCount} previous_evidence, ${excludedPreviousTurnCount} previous_turn), selection=${selection}, k=${k}`,
    },
  };
}

function selectRepresentativeDocs(
  candidates: CandidateDoc[],
  readDocIds: Set<string>,
  k: number,
): CandidateDoc[] {
  const unread = candidates.filter((d) => !readDocIds.has(d.docId));
  const pool = unread.length > 0 ? unread : candidates;
  const sorted = [...pool].sort((a, b) => rankCandidateDoc(b) - rankCandidateDoc(a));

  if (sorted.length <= k) return sorted;

  const selected: CandidateDoc[] = [];
  const usedSources = new Set<string>();
  const usedTitlePaths = new Set<string>();

  for (const doc of sorted) {
    if (selected.length >= k) break;

    const sourceKey = doc.provenance ?? doc.source ?? "";
    const titlePathKey = doc.titlePath ?? (doc.parentTitles ? doc.parentTitles.join("/") : "");

    if (!usedSources.has(sourceKey) || !usedTitlePaths.has(titlePathKey)) {
      selected.push(doc);
      usedSources.add(sourceKey);
      usedTitlePaths.add(titlePathKey);
    }
  }

  if (selected.length < k) {
    for (const doc of sorted) {
      if (selected.length >= k) break;
      if (!selected.includes(doc)) {
        selected.push(doc);
      }
    }
  }

  return selected;
}

/**
 * read_previous_evidence 使用共享 handle index 解析历史引用。
 */
function materializeReadPreviousEvidence(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction, workspace, budget, followUpContext, recentContext } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as { k?: number; evidenceHandles?: string[] };

  const maxTotalResearchDocs = budget.maxTotalResearchDocs ?? 20;
  const totalReadSoFar = workspace.readDocuments.length;
  const historicalReadRemaining = Math.max(0, maxTotalResearchDocs - totalReadSoFar);

  if (historicalReadRemaining <= 0) {
    warnings.push("no_remaining_historical_read_budget");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_previous_evidence",
        reason: "historical read budget exhausted",
      },
    };
  }

  const index = buildPreviousEvidenceHandleIndex(workspace, followUpContext, recentContext);

  if (!index || index.readableCount === 0) {
    warnings.push("no_previous_evidence_doc_ids");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_previous_evidence",
        reason: "no readable previous evidence available",
      },
    };
  }

  const requestedHandles = args.evidenceHandles ? new Set(args.evidenceHandles) : null;
  const handleInputCount = requestedHandles?.size ?? 0;
  const source = index.items[0]?.sourceKind !== undefined ? "conversation_used_references" : "followUp_context";

  let selectedDocIds: string[] = [];
  let missingHandleCount = 0;
  let alreadyReadCount = 0;

  if (requestedHandles && requestedHandles.size > 0) {
    let resolvedHandleCount = 0;
    const resolvedDocIds = new Set<string>();
    for (const handle of requestedHandles) {
      const docId = index.handleToDocId.get(handle);
      if (docId) {
        resolvedHandleCount++;
        resolvedDocIds.add(docId);
      }
    }

    for (const docId of resolvedDocIds) {
      if (workspace.readDocuments.some((d) => d.docId === docId)) {
        alreadyReadCount++;
      }
    }

    const uniqueResolvedDocCount = resolvedDocIds.size;
    missingHandleCount = Math.max(0, requestedHandles.size - resolvedHandleCount);

    pushAgentDebugEvent("PREVIOUS_EVIDENCE_HANDLE_RESOLUTION_SAFE", {
      handleInputCount,
      resolvedHandleCount,
      uniqueResolvedDocCount,
      missingHandleCount,
      selectedCount: 0,
      source,
      alreadyReadCount,
    }, "info");

    if (missingHandleCount > 0) {
      warnings.push("previous_evidence_handles_partially_unresolved");
      return {
        ok: false,
        warnings,
        debugSummary: {
          plannerType: "read_previous_evidence",
          reason: "selected handles partially unresolved",
        },
      };
    }

    selectedDocIds = [...resolvedDocIds].filter(
      (id) => !workspace.readDocuments.some((d) => d.docId === id)
    );

    if (selectedDocIds.length === 0) {
      warnings.push("previous_evidence_already_read");
      return {
        ok: false,
        warnings,
        debugSummary: {
          plannerType: "read_previous_evidence",
          reason: "all selected handles already read",
        },
      };
    }
  } else {
    const unreadDocIds = index.unreadReadableItems
      .map((item) => index.handleToDocId.get(item.handle))
      .filter((id): id is string => !!id);

    selectedDocIds = [...new Set(unreadDocIds)];
    alreadyReadCount = index.alreadyReadCount;

    pushAgentDebugEvent("PREVIOUS_EVIDENCE_HANDLE_RESOLUTION_SAFE", {
      handleInputCount: 0,
      resolvedHandleCount: index.readableCount,
      uniqueResolvedDocCount: selectedDocIds.length,
      missingHandleCount: 0,
      selectedCount: selectedDocIds.length,
      source,
      alreadyReadCount,
    }, "info");
  }

  if (selectedDocIds.length === 0) {
    warnings.push("no_previous_evidence_doc_ids");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_previous_evidence",
        reason: `no unread previous evidence available (source=${source})`,
      },
    };
  }

  const perBatchReadLimit = args.k ?? 5;
  const k = Math.min(perBatchReadLimit, historicalReadRemaining, selectedDocIds.length);

  if (k <= 0) {
    warnings.push("k_is_zero_after_budget_clamp");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_previous_evidence",
        reason: "k is zero after budget clamp",
      },
    };
  }

  const batchDocIds = selectedDocIds.slice(0, k);
  const remainingAfterBatch = selectedDocIds.length - k;

  const lastBatch = workspace.lastReadPreviousEvidenceBatch;
  if (lastBatch && lastBatch.length === batchDocIds.length && batchDocIds.length > 0) {
    const isDuplicate = lastBatch.every((id, i) => id === batchDocIds[i]);
    if (isDuplicate) {
      console.warn("[KB-AGENT | READ_PREVIOUS_EVIDENCE_DUPLICATE_BATCH_SAFE]", {
        selectedCount: batchDocIds.length,
        lastBatchLength: lastBatch.length,
      });
      warnings.push("duplicate_previous_evidence_batch_detected");
      return {
        ok: false,
        warnings,
        debugSummary: {
          plannerType: "read_previous_evidence",
          reason: "duplicate batch detected, stopping retry",
        },
      };
    }
  }

  console.info("[KB-AGENT | READ_PREVIOUS_EVIDENCE_BATCH_SAFE]", {
    source,
    availableCount: selectedDocIds.length,
    alreadyReadCount,
    selectedCount: batchDocIds.length,
    remainingAfterBatch,
    batchLimit: perBatchReadLimit,
    historicalReadRemaining,
  });

  pushAgentDebugEvent("READ_PREVIOUS_EVIDENCE_SELECTED_SAFE", {
    source,
    availableCount: selectedDocIds.length,
    selectedCount: batchDocIds.length,
    remainingAfterBatch,
    batchLimit: perBatchReadLimit,
  }, "info");

  const action: AgentAction = {
    type: "read_docs",
    reason: `materialized from planner read_previous_evidence: ${plannerAction.reason}`,
    args: {
      docIds: batchDocIds,
      readSource: "previous_evidence",
    },
  };

  return {
    ok: true,
    action,
    warnings,
    selectedDocIds: batchDocIds,
    previousReferenceMetadata: {
      sourceDocIds: selectedDocIds,
      selectedDocIds: batchDocIds,
      remainingAfterBatch,
      source,
    },
    debugSummary: {
      plannerType: "read_previous_evidence",
      materializedType: "read_docs",
      selectedDocCount: batchDocIds.length,
      reason: `selected ${batchDocIds.length} docs from ${selectedDocIds.length} available, k=${k}`,
    },
  };
}

function materializeReadBlockContext(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction, workspace, budget, counters } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as { selection?: string; k?: number };

  const remainingBudget = getRemainingBlockBudget(budget, counters, workspace);
  if (remainingBudget <= 0) {
    warnings.push("no_remaining_block_budget");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_block_context",
        reason: "no remaining block budget",
      },
    };
  }

  const candidateBlocks = workspace.candidateBlocks;
  if (candidateBlocks.length === 0) {
    warnings.push("no_candidate_blocks");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_block_context",
        reason: "no candidate blocks available",
      },
    };
  }

  const k = Math.min(
    args.k ?? 3,
    remainingBudget,
    candidateBlocks.length
  );

  if (k <= 0) {
    warnings.push("k_is_zero_after_budget_clamp");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_block_context",
        reason: "k is zero after budget clamp",
      },
    };
  }

  const selection = args.selection ?? "top_blocks";
  let selectedBlocks: CandidateBlock[];

  if (selection === "from_read_docs") {
    const readDocIds = getReadDocIdsSet(workspace);
    const fromReadDocs = candidateBlocks.filter((b) => readDocIds.has(b.docId));
    if (fromReadDocs.length === 0) {
      warnings.push("没有已读文档内的候选块，兜底使用排名靠前的候选块");
      selectedBlocks = [...candidateBlocks]
        .sort((a, b) => scoreCandidateBlock(b) - scoreCandidateBlock(a))
        .slice(0, k);
    } else {
      selectedBlocks = [...fromReadDocs]
        .sort((a, b) => scoreCandidateBlock(b) - scoreCandidateBlock(a))
        .slice(0, k);
    }
  } else {
    selectedBlocks = [...candidateBlocks]
      .sort((a, b) => scoreCandidateBlock(b) - scoreCandidateBlock(a))
      .slice(0, k);
  }

  const selectedBlockIds = selectedBlocks.map((b) => b.blockId).filter(Boolean);

  if (selectedBlockIds.length === 0) {
    warnings.push("no_valid_block_ids_selected");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "read_block_context",
        reason: "no valid block ids selected",
      },
    };
  }

  const action: AgentAction = {
    type: "read_block_context",
    reason: `materialized from planner read_block_context: ${plannerAction.reason}`,
    args: {
      blockIds: selectedBlockIds,
      before: 2,
      after: 2,
      includeParent: true,
      includeChildren: false,
      includeHeadingPath: true,
    },
  };

  return {
    ok: true,
    action,
    warnings,
    selectedBlockIds,
    debugSummary: {
      plannerType: "read_block_context",
      materializedType: "read_block_context",
      selectedBlockCount: selectedBlockIds.length,
      reason: `selected ${selectedBlockIds.length} blocks from ${candidateBlocks.length} candidates, selection=${selection}, k=${k}`,
    },
  };
}

function materializeSearchScope(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction, followUpContext } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as Record<string, unknown>;

  const effectivePolicy = deriveEffectiveCandidatePolicy({
    plannerAction,
  });

  const rawQueries = (args.queries as Array<Record<string, unknown>> | undefined) ?? [];
  const queries: SearchScopeQuery[] = rawQueries
    .filter((q) => q && typeof q.text === "string" && q.text.trim().length > 0)
    .map((q) => {
      const rawMode = q.mode as string | undefined;
      const mode: RetrievalMode | undefined = (VALID_RETRIEVAL_MODES as string[]).includes(rawMode ?? "")
        ? rawMode as RetrievalMode
        : undefined;
      return {
        text: (q.text as string).trim(),
        keywordQuery: typeof q.keywordQuery === "string" ? (q.keywordQuery as string).trim() || undefined : undefined,
        fuzzyQuery: typeof q.fuzzyQuery === "string" ? (q.fuzzyQuery as string).trim() || undefined : undefined,
        mode,
      };
    });

  if (queries.length === 0) {
    warnings.push("no_valid_queries");
    return {
      ok: false,
      warnings,
      debugSummary: {
        plannerType: "search_scope",
        reason: "no valid queries provided",
      },
    };
  }

  const limit = (args.limit as number | undefined) !== undefined ? Math.max(1, Math.min(args.limit as number, 200)) : undefined;
  const excludeAlreadyRead = typeof args.excludeAlreadyRead === "boolean" ? args.excludeAlreadyRead : undefined;

  const effectiveExclude = effectivePolicy.requireUnreadFromPreviousTurn || excludeAlreadyRead;
  const excludedPreviousEvidenceDocCount =
    effectiveExclude && followUpContext?.previousReferenceDocIds
      ? followUpContext.previousReferenceDocIds.length
      : 0;

  const action: AgentAction = {
    type: "search_scope",
    reason: `materialized from planner search_scope: ${plannerAction.reason}`,
    args: {
      queries,
      limit,
      excludeAlreadyRead: effectiveExclude ? true : excludeAlreadyRead,
    },
  };

  return {
    ok: true,
    action,
    warnings,
    debugSummary: {
      plannerType: "search_scope",
      materializedType: "search_scope",
      reason: `converted ${queries.length} queries, limit=${limit ?? "default"}, excludedPreviousEvidenceDocCount=${excludedPreviousEvidenceDocCount}`,
    },
  };
}

function materializeListScopeDocs(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as { limit?: number; query?: string };

  const limit = args.limit !== undefined ? Math.max(1, Math.min(args.limit, 200)) : undefined;
  const query = typeof args.query === "string" && args.query.trim().length > 0 ? args.query.trim() : undefined;

  const action: AgentAction = {
    type: "list_scope_docs",
    reason: `materialized from planner list_scope_docs: ${plannerAction.reason}`,
    args: {
      limit,
      query,
    },
  };

  return {
    ok: true,
    action,
    warnings,
    debugSummary: {
      plannerType: "list_scope_docs",
      materializedType: "list_scope_docs",
      reason: `limit=${limit ?? "default"}, query=${query ? "provided" : "none"}`,
    },
  };
}

function materializeAnswer(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction, workspace } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as { evidenceMode?: string };

  const plannerEvidenceMode = args.evidenceMode ?? "insufficient_evidence";

  const hasReadEvidence = workspace.readDocuments.length > 0 || workspace.readBlockContexts.length > 0;

  const action: AgentAction = {
    type: "answer",
    reason: `materialized from planner answer: ${plannerAction.reason}`,
    args: {
      evidenceMode: plannerEvidenceMode as "with_evidence" | "insufficient_evidence" | "without_kb_evidence",
    },
  };

  return {
    ok: true,
    action,
    warnings,
    debugSummary: {
      plannerType: "answer",
      materializedType: "answer",
      reason: `plannerEvidenceMode=${plannerEvidenceMode}, hasEvidence=${hasReadEvidence}`,
    },
  };
}

function materializeGetConversationUsedReferences(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction, workspace } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as {
    turnScope?: string;
    turnIndexes?: number[];
    maxTurns?: number;
    maxRefsPerTurn?: number;
    includeAnswerItemMapping?: boolean;
  };

  const conversationUsedRefs = workspace?.conversationUsedReferences;
  if (!conversationUsedRefs || conversationUsedRefs.length === 0) {
    warnings.push("no_conversation_used_references_in_workspace");
  }

  const action: AgentAction = {
    type: "get_conversation_used_references",
    reason: `materialized from planner get_conversation_used_references: ${plannerAction.reason}`,
    args: {
      turnScope: args.turnScope as "last" | "recent" | "all" | "selected" | undefined,
      turnIndexes: Array.isArray(args.turnIndexes) ? args.turnIndexes : undefined,
      maxTurns: typeof args.maxTurns === "number" ? args.maxTurns : undefined,
      maxRefsPerTurn: typeof args.maxRefsPerTurn === "number" ? args.maxRefsPerTurn : undefined,
      includeAnswerItemMapping: typeof args.includeAnswerItemMapping === "boolean" ? args.includeAnswerItemMapping : undefined,
    },
  };

  return {
    ok: true,
    action,
    warnings,
    debugSummary: {
      plannerType: "get_conversation_used_references",
      materializedType: "get_conversation_used_references",
      reason: `conversation used references materialized (${conversationUsedRefs?.length ?? 0} turns available)`,
    },
  };
}

function materializeGetDocTreeContext(
  params: PlannerActionMaterializeParams
): PlannerActionMaterializeResult {
  const { plannerAction } = params;
  const warnings: string[] = [];
  const args = plannerAction.args as {
    anchorRefs?: string[];
    anchorIndexes?: number[];
    includeParent?: boolean;
    includeSiblings?: boolean;
    includeChildren?: boolean;
    includeDescendants?: boolean;
    maxDepth?: number;
    maxItems?: number;
  };

  const anchorRefs = Array.isArray(args.anchorRefs) ? args.anchorRefs.filter((r): r is string => typeof r === "string" && r.length > 0) : undefined;
  const anchorIndexes = Array.isArray(args.anchorIndexes) ? args.anchorIndexes.filter((n): n is number => typeof n === "number") : undefined;

  if ((!anchorRefs || anchorRefs.length === 0) && (!anchorIndexes || anchorIndexes.length === 0)) {
    warnings.push("no_anchor_refs_or_indexes_provided");
  }

  const maxDepth = typeof args.maxDepth === "number" ? Math.min(Math.max(Math.floor(args.maxDepth), 0), 5) : undefined;
  const maxItems = typeof args.maxItems === "number" ? Math.min(Math.max(Math.floor(args.maxItems), 1), 100) : undefined;

  const action: AgentAction = {
    type: "get_doc_tree_context",
    reason: `materialized from planner get_doc_tree_context: ${plannerAction.reason}`,
    args: {
      anchorRefs,
      anchorIndexes,
      includeParent: typeof args.includeParent === "boolean" ? args.includeParent : undefined,
      includeSiblings: typeof args.includeSiblings === "boolean" ? args.includeSiblings : undefined,
      includeChildren: typeof args.includeChildren === "boolean" ? args.includeChildren : undefined,
      includeDescendants: typeof args.includeDescendants === "boolean" ? args.includeDescendants : undefined,
      maxDepth,
      maxItems,
    },
  };

  return {
    ok: true,
    action,
    warnings,
    debugSummary: {
      plannerType: "get_doc_tree_context",
      materializedType: "get_doc_tree_context",
      reason: `doc tree context materialized (anchors: ${anchorRefs?.length ?? 0} refs, ${anchorIndexes?.length ?? 0} indexes)`,
    },
  };
}


