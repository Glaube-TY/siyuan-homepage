/**
 * Evidence Gate
 *
 * 只根据 workspace、budget、counters、lastToolResult、currentAction 判断证据状态。? *
 * 职责：? * - 不调用 LLM、不执行工具、不足 UI
 * - 不根据用户问题判断? * - 不新增 taskType，不恢复到 Planner
 * - 只看结构状态? */

import type { EvidenceWorkspace } from "../workspace/evidence-workspace";
import type { AgenticRagBudget, AgenticRagCounters } from "../runtime/budget";
import type { AgentToolExecutionResult } from "../tools/tool-types";
import type { AgentAction } from "../actions/action-types";
import type { EffectivePlannerConstraints } from "../planner/effective-planner-constraints";
import { canContinueAgentLoop, getRemainingReadDocs, getRemainingBlockContexts, getRemainingSearchCalls } from "../safety/budget-guard";
import { isStrongCandidateDoc, isInventoryOnlyCandidateDoc, hasOnlyInventoryCandidates } from "../workspace/candidate-quality";

export interface EvidenceQualitySummary {
  readDocCount: number;
  readBlockContextCount: number;
  totalReadDocChars: number;
  totalBlockContextChars: number;
  effectiveBlockContextCount: number;
  minBlockContextChars: number;
  avgBlockContextChars: number;
  hasEnoughTextEvidence: boolean;
  hasEnoughDocEvidence: boolean;
  hasEnoughBlockEvidence: boolean;
}

export function getEvidenceQualitySummary(workspace: EvidenceWorkspace): EvidenceQualitySummary {
  const readDocCount = workspace.readDocuments.length;
  const readBlockContextCount = workspace.readBlockContexts.length;

  let totalReadDocChars = 0;
  for (const doc of workspace.readDocuments) {
    totalReadDocChars += doc.contentChars ?? doc.content?.length ?? 0;
  }

  let totalBlockContextChars = 0;
  let minBlockContextChars = Infinity;
  const blockCharsList: number[] = [];
  for (const ctx of workspace.readBlockContexts) {
    const len = ctx.contentChars ?? ctx.content?.length ?? 0;
    totalBlockContextChars += len;
    blockCharsList.push(len);
    if (len < minBlockContextChars) minBlockContextChars = len;
  }

  const effectiveBlockContextCount = blockCharsList.filter((len) => len >= 30).length;
  const avgBlockContextChars = blockCharsList.length > 0 ? Math.round(totalBlockContextChars / blockCharsList.length) : 0;

  const hasEnoughDocEvidence = readDocCount > 0 && totalReadDocChars >= 200;
  const hasEnoughBlockEvidence = effectiveBlockContextCount >= 5 && totalBlockContextChars >= 500;
  const hasEnoughTextEvidence = hasEnoughDocEvidence || hasEnoughBlockEvidence;

  return {
    readDocCount,
    readBlockContextCount,
    totalReadDocChars,
    totalBlockContextChars,
    effectiveBlockContextCount,
    minBlockContextChars: minBlockContextChars === Infinity ? 0 : minBlockContextChars,
    avgBlockContextChars,
    hasEnoughTextEvidence,
    hasEnoughDocEvidence,
    hasEnoughBlockEvidence,
  };
}

function getReadDocIdSet(workspace: EvidenceWorkspace): Set<string> {
  const set = new Set<string>();
  for (const doc of workspace.readDocuments) {
    if (doc.docId) set.add(doc.docId);
  }
  for (const ctx of workspace.readBlockContexts) {
    if (ctx.docId) set.add(ctx.docId);
  }
  return set;
}

function hasReadableCandidateDocs(workspace: EvidenceWorkspace, readDocIdSet: Set<string>): boolean {
  return workspace.candidateDocs.some(
    (d) => !isInventoryOnlyCandidateDoc(d) && !readDocIdSet.has(d.docId)
  );
}

export type EvidenceGateStatus = "enough" | "weak" | "none" | "budget_exhausted" | "continue" | "insufficient" | "answer_with_tree_empty" | "needs_planner_decision";

export interface EvidenceGateDecision {
  status: EvidenceGateStatus;
  reasons: string[];
  shouldContinue: boolean;
  shouldAnswer: boolean;
  failureMessage?: string;
  treeEmptyMessage?: string;
}

export interface EvaluateEvidenceGateParams {
  workspace: EvidenceWorkspace;
  budget: AgenticRagBudget;
  counters: AgenticRagCounters;
  currentAction?: AgentAction;
  lastToolResult?: AgentToolExecutionResult;
  actionHistory?: AgentAction[];
  effectivePolicy?: EffectivePlannerConstraints;
  needsKnowledgeBase?: boolean;
}

export function evaluateEvidenceGate(params: EvaluateEvidenceGateParams): EvidenceGateDecision {
  const { workspace, budget, counters, currentAction, lastToolResult, effectivePolicy, needsKnowledgeBase } = params;
  const { readDocuments, readBlockContexts, candidateDocs, candidateBlocks, docOutlines } = workspace;
  const reasons: string[] = [];

  const canContinue = canContinueAgentLoop(budget, counters);
  const remainingSearch = getRemainingSearchCalls(budget, { counters, workspaceCoverage: workspace.coverage });
  const remainingReadDocs = getRemainingReadDocs(budget, { counters, workspaceCoverage: workspace.coverage });
  const remainingBlockContexts = getRemainingBlockContexts(budget, { counters, workspaceCoverage: workspace.coverage });
  const readDocIdSet = getReadDocIdSet(workspace);
  const readableDocs = hasReadableCandidateDocs(workspace, readDocIdSet);
  const hasUnreadStrongCandidateDocs = candidateDocs.some((d) => isStrongCandidateDoc(d) && !readDocIdSet.has(d.docId));
  const quality = getEvidenceQualitySummary(workspace);
  const hasReadEvidence = readDocuments.length > 0 || readBlockContexts.length > 0;
  const hasOnlyInventory = hasOnlyInventoryCandidates(workspace);
  const hasCandidateBlocks = candidateBlocks.length > 0;
  const hasDocOutlines = docOutlines.length > 0;
  const hasCandidates = readableDocs || hasCandidateBlocks || hasDocOutlines;
  const isBroadRead = effectivePolicy?.requireUnreadFromPreviousTurn === true;
  const broadCoverageRequested = effectivePolicy?.broadCoverageRequested === true;

  function needsPlannerDecision(reason: string): EvidenceGateDecision {
    return {
      status: "needs_planner_decision",
      reasons: [reason],
      shouldContinue: false,
      shouldAnswer: false,
    };
  }

  if (!canContinue.allowed) {
    reasons.push(canContinue.reason ?? "agent loop budget exhausted");
    return {
      status: "budget_exhausted",
      reasons,
      shouldContinue: false,
      shouldAnswer: true,
    };
  }

  if (lastToolResult && !lastToolResult.success) {
    reasons.push(
      lastToolResult.error
        ? `last tool failed: ${lastToolResult.error}`
        : "last tool failed",
    );
  }

  if (currentAction?.type === "answer") {
    const answerArgs = currentAction.args as { evidenceMode?: string } | undefined;
    if (answerArgs?.evidenceMode === "without_kb_evidence") {
      return {
        status: "enough",
        reasons: ["answer does not require KB evidence"],
        shouldContinue: false,
        shouldAnswer: true,
      };
    }

    if (hasReadEvidence) {
      return {
        status: "enough",
        reasons: ["answer action has read evidence"],
        shouldContinue: false,
        shouldAnswer: true,
      };
    }

    if ((hasUnreadStrongCandidateDocs || readableDocs) && remainingReadDocs > 0) {
      return needsPlannerDecision("answer needs evidence; unread candidate docs remain");
    }

    if (candidateBlocks.length > 0 && remainingBlockContexts > 0) {
      return needsPlannerDecision("answer needs evidence; no readable evidence yet");
    }

    return {
      status: "none",
      reasons: ["answer action has no usable evidence"],
      shouldContinue: false,
      shouldAnswer: true,
    };
  }

  if (hasReadEvidence) {
    if (readDocuments.length === 0 && quality.totalBlockContextChars < 200 && candidateBlocks.length > 0 && remainingBlockContexts > 0) {
      return needsPlannerDecision("short block context exists; no readable evidence yet");
    }

    const candidateUnreadCount = candidateDocs.filter((d) => !isInventoryOnlyCandidateDoc(d) && !readDocIdSet.has(d.docId)).length;
    if ((isBroadRead || broadCoverageRequested) && candidateUnreadCount > 0 && remainingReadDocs > 0) {
      return needsPlannerDecision("broad coverage requested; unread candidate docs remain");
    }

    return {
      status: "enough",
      reasons: ["read evidence is available"],
      shouldContinue: false,
      shouldAnswer: true,
    };
  }

  if ((hasUnreadStrongCandidateDocs || readableDocs) && remainingReadDocs > 0) {
    return needsPlannerDecision("candidate docs are available; no evidence has been read");
  }

  if (candidateBlocks.length > 0 && remainingBlockContexts > 0) {
    return needsPlannerDecision("candidate blocks are available; no evidence has been read");
  }

  if (hasCandidates) {
    return {
      status: "weak",
      reasons: ["candidates exist but no readable evidence has been collected"],
      shouldContinue: remainingReadDocs > 0 || remainingBlockContexts > 0,
      shouldAnswer: false,
    };
  }

  if (hasOnlyInventory && candidateBlocks.length === 0 && docOutlines.length === 0) {
    return needsPlannerDecision("inventory/navigation docs available; no readable evidence candidate");
  }

  if ((needsKnowledgeBase || remainingSearch > 0) && remainingSearch > 0) {
    return needsPlannerDecision("search budget remains; no evidence has been read");
  }

  return {
    status: needsKnowledgeBase ? "budget_exhausted" : "none",
    reasons: [needsKnowledgeBase ? "no evidence and no search budget remains" : "no KB evidence required or available"],
    shouldContinue: false,
    shouldAnswer: true,
  };
}