/**
 * Agent Workbench turn memory.
 *
 * Stores only lightweight metadata needed by chat history.
 * It does NOT persist tool observations, read content, candidate caches,
 * answer summaries, answer items, or internal workspace state.
 * Stage summaries (agent_stage_summary) are the sole compression source.
 *
 * ── Lightweight Session Working Memory ──
 *
 * Three-layer design:
 * 1. activeWorkingTarget — current working document/block target (ActiveWorkingTarget)
 * 2. recentActionMemory — last 10 turns of fairly complete action outcomes (AgentTurnActionOutcome[])
 * 3. recentTargetIndex — last 20 turns of compressed target index (AgentTurnTargetIndex)
 *
 * All layers MUST NOT contain:
 *   - observation raw data / tool return bodies
 *   - document content / markdown / kramdown / text / body
 *   - beforeSnapshot / afterSnapshot / visualCompare
 *   - confirmationId
 *   - debug trace
 *   - internalPath / realPath
 *   - provider raw errors
 *   - API keys / secrets
 */

import type { AgentWorkbenchEvent, ToolResultEvent } from "../contracts/turn-event";

/* ------------------------------------------------------------------ */
/*  Outcome types                                                      */
/* ------------------------------------------------------------------ */

/** Current working target — the most likely document/block being worked on. */
export interface ActiveWorkingTarget {
  docId?: string;
  title?: string;
  /** Max 20 blockIds */
  blockIds?: string[];
  lastToolName?: string;
  /** Max 120 chars */
  lastOperationSummary?: string;
  lastWriteStatus?: "none" | "success" | "failed" | "partial" | "rejected" | "aborted";
  updatedAt?: number;
}

/** Per-tool outcome in a turn. Max 8 per turn. */
export interface AgentTurnActionOutcome {
  toolName: string;
  readOnly: boolean;
  ok: boolean;
  /** Max 120 chars */
  summary: string;
  errorCode?: string;
  /** Max 10 docIds */
  targetDocIds?: string[];
  /** Max 20 blockIds */
  targetBlockIds?: string[];
  /** Max 10 titles */
  targetTitles?: string[];
  writeOperation?: boolean;
  needsVerification?: boolean;
  timestamp?: number;
}

/** Compressed target index for one turn (recentTargetIndex). Max 20 turns. */
export interface AgentTurnTargetIndex {
  turnId: string;
  /** Max 80 chars */
  userTextPreview?: string;
  /** Max 80 chars */
  assistantTextPreview?: string;
  /** Max 5 docIds */
  lastTouchedDocIds?: string[];
  /** Max 10 blockIds */
  lastTouchedBlockIds?: string[];
  /** Max 5 titles */
  lastTouchedTitles?: string[];
  lastWriteStatus?: "none" | "success" | "failed" | "partial" | "rejected" | "aborted";
  /** Max 120 chars */
  lastWriteSummary?: string;
}

/* ------------------------------------------------------------------ */
/*  AgentTurnMemory                                                    */
/* ------------------------------------------------------------------ */

export interface AgentTurnActionTraceSummary {
  toolNames: string[];
  outcomes?: AgentTurnActionOutcome[];
  lastTouchedDocIds?: string[];
  lastTouchedBlockIds?: string[];
  lastTouchedTitles?: string[];
  lastWriteStatus?: "none" | "success" | "failed" | "partial" | "rejected" | "aborted";
  lastWriteSummary?: string;
}

export interface AgentTurnMemory {
  turnId: string;
  createdAt: number;
  userQuestion: string;
  scope?: {
    type: string;
    docId?: string;
    rootDocId?: string;
    notebookId?: string;
    docIds?: string[];
  };
  actionTraceSummary: AgentTurnActionTraceSummary;
  footerReferenceDocIds: string[];
  footerReferenceTitles: string[];
  footerReferenceBlockIds: string[];
  footerReferenceReasons: string[];
  footerReferenceReadLevels: string[];
  footerReferenceGroundedFlags: boolean[];
  footerReferenceSourceTypes: string[];
  footerReferenceUrls: string[];
  footerReferenceSourceNames: string[];
  footerReferenceProviders: string[];
}

export interface BuildAgentTurnMemoryParams {
  turnId: string;
  userQuestion: string;
  result: AgentTurnMemoryResultLike;
}

export interface AgentTurnMemoryResultLike {
  scope?: { type: string; [k: string]: unknown };
  footerReferences?: {
    docId?: string;
    docTitle?: string;
    sourceBlockIds?: string[];
    readLevel?: string;
    referenceReason?: string;
    grounded?: boolean;
    sourceType?: string;
    url?: string;
    sourceName?: string;
    provider?: string;
  }[];
  events?: AgentWorkbenchEvent[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_SUMMARY_CHARS = 120;
const MAX_OUTCOMES_PER_TURN = 8;
const MAX_TARGET_DOC_IDS = 10;
const MAX_TARGET_BLOCK_IDS = 20;
const MAX_TARGET_TITLES = 10;
const MAX_TOOL_NAMES = 20;

/** Tools that require verification after execution. */
const WRITE_TOOL_NAMES_FOR_VERIFICATION = new Set([
  "replace_doc_content", "update_block", "insert_block",
  "delete_blocks", "move_block", "create_doc", "rename_doc", "delete_doc",
]);

/** Safe arg keys — only these are extracted from argsPreview. */
const SAFE_ARG_KEYS = new Set<string>([
  "docId", "docIds", "blockId", "blockIds", "targetId", "title",
]);

/** Tools where targetId is a docId (not a blockId). */
const DOC_TARGET_TOOLS = new Set([
  "get_doc_info", "read_docs", "list_docs_by_time", "list_doc_status",
  "rename_doc", "delete_doc", "create_doc", "replace_doc_content",
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncateText(value: string | undefined, maxChars: number): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
}

/**
 * Extract only safe target fields from argsPreview.
 * Uses toolName to correctly classify targetId as docId vs blockId.
 * Does NOT save full argsPreview, content, markdown, or any text body.
 */
function extractSafeArgs(
  toolName: string,
  argsPreview: Record<string, unknown> | undefined,
): {
  targetDocIds: string[];
  targetBlockIds: string[];
  targetTitles: string[];
} {
  const targetDocIds: string[] = [];
  const targetBlockIds: string[] = [];
  const targetTitles: string[] = [];

  if (!argsPreview) return { targetDocIds, targetBlockIds, targetTitles };

  for (const [key, value] of Object.entries(argsPreview)) {
    if (!SAFE_ARG_KEYS.has(key)) continue;
    if (value == null) continue;

    if (key === "docId" && typeof value === "string" && value.trim()) {
      targetDocIds.push(value.trim());
    } else if (key === "blockId" && typeof value === "string" && value.trim()) {
      targetBlockIds.push(value.trim());
    } else if (key === "targetId" && typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      // Classify targetId based on tool and scope
      if (toolName === "read_doc_blocks") {
        const scope = argsPreview?.scope;
        if (scope === "document_top") {
          // scope=document_top means targetId is a docId
          targetDocIds.push(trimmed);
        } else {
          // scope=block_subtree or other — targetId is a blockId
          targetBlockIds.push(trimmed);
        }
      } else if (DOC_TARGET_TOOLS.has(toolName)) {
        // Document-level tools: targetId is a docId
        targetDocIds.push(trimmed);
      } else {
        // Default: treat as blockId for block-level tools
        targetBlockIds.push(trimmed);
      }
    } else if (key === "title" && typeof value === "string" && value.trim()) {
      targetTitles.push(value.trim());
    } else if ((key === "docIds" || key === "blockIds") && Array.isArray(value)) {
      const arr = value as unknown[];
      for (const item of arr) {
        if (typeof item === "string" && item.trim()) {
          if (key === "docIds") {
            targetDocIds.push(item.trim());
          } else {
            targetBlockIds.push(item.trim());
          }
        }
      }
    }
  }

  // Deduplicate and limit
  const uniqueDocs = [...new Set(targetDocIds)].slice(0, MAX_TARGET_DOC_IDS);
  const uniqueBlocks = [...new Set(targetBlockIds)].slice(0, MAX_TARGET_BLOCK_IDS);
  const uniqueTitles = [...new Set(targetTitles)].slice(0, MAX_TARGET_TITLES);

  return {
    targetDocIds: uniqueDocs,
    targetBlockIds: uniqueBlocks,
    targetTitles: uniqueTitles,
  };
}

/* ------------------------------------------------------------------ */
/*  Outcome prioritization: keep writes/failures/rejections first      */
/* ------------------------------------------------------------------ */

export function outcomePriority(o: AgentTurnActionOutcome): number {
  // Higher = keep
  if (!o.ok) return 100;                // failures
  if (o.writeOperation) return 90;      // write success
  return 50;                            // read-only success
}

function trimOutcomes(outcomes: AgentTurnActionOutcome[], maxCount: number): AgentTurnActionOutcome[] {
  if (outcomes.length <= maxCount) return outcomes;
  // Sort by priority, keep top N, then restore original order
  const indexed = outcomes.map((o, i) => ({ outcome: o, index: i }));
  const sorted = [...indexed].sort((a, b) => {
    const prioDiff = outcomePriority(b.outcome) - outcomePriority(a.outcome);
    if (prioDiff !== 0) return prioDiff;
    // Within same priority, keep later ones (higher index = more recent)
    return b.index - a.index;
  });
  const kept = new Set(sorted.slice(0, maxCount).map((item) => item.index));
  return outcomes.filter((_, i) => kept.has(i));
}

/* ------------------------------------------------------------------ */
/*  Extraction: build full action trace summary from events            */
/* ------------------------------------------------------------------ */

function extractActionTraceSummary(
  events: readonly AgentWorkbenchEvent[] | undefined,
): AgentTurnActionTraceSummary {
  const emptyResult: AgentTurnActionTraceSummary = { toolNames: [] };

  if (!events || events.length === 0) return emptyResult;

  // Collect tool_start events by toolCallId for readOnly lookup
  const dispatchMap = new Map<string, { toolName: string; readOnly: boolean; at: number }>();
  const resultEvents: Array<{ toolCallId: string; toolName: string; ok: boolean; outputSummary?: string; errorCode?: string; at: number }> = [];

  for (const event of events) {
    if (event.type === "tool_start") {
      dispatchMap.set(event.toolCallId, {
        toolName: event.toolName,
        readOnly: event.readOnly,
        at: event.at ?? Date.now(),
      });
    } else if (event.type === "tool_result") {
      resultEvents.push({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ok: event.result.ok,
        outputSummary: event.result.summary,
        errorCode: event.result.errorCode ?? event.result.code,
        at: event.at ?? Date.now(),
      });
    }
  }

  // Build outcomes by matching dispatch + result
  const outcomes: AgentTurnActionOutcome[] = [];
  const allToolNames = new Set<string>();
  const allDocIds = new Set<string>();
  const allBlockIds = new Set<string>();
  const allTitles = new Set<string>();

  // Track argsPreview from dispatch events for safe arg extraction
  const argsByCallId = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    if (event.type === "tool_start" && event.toolCallId && event.argsPreview) {
      argsByCallId.set(event.toolCallId, event.argsPreview);
    }
  }

  for (const result of resultEvents) {
    const dispatch = dispatchMap.get(result.toolCallId);
    const readOnly = dispatch?.readOnly ?? true;
    const writeOperation = !readOnly;
    const needsVerification = writeOperation && WRITE_TOOL_NAMES_FOR_VERIFICATION.has(result.toolName);

    // Extract from dispatch argsPreview (tool-aware classification)
    const argsSafe = extractSafeArgs(result.toolName, argsByCallId.get(result.toolCallId));

    // Merge safeTargetPreview from tool_result event (higher priority for docId/blockId/title)
    const resultEvent = events.find(
      (e) => e.type === "tool_result" && (e as ToolResultEvent).toolCallId === result.toolCallId,
    ) as ToolResultEvent | undefined;
    const safePreview = resultEvent?.result.safeTargetPreview;
    if (safePreview) {
      if (safePreview.targetDocIds) {
        for (const id of safePreview.targetDocIds) {
          if (!argsSafe.targetDocIds.includes(id)) argsSafe.targetDocIds.push(id);
        }
      }
      if (safePreview.targetBlockIds) {
        for (const id of safePreview.targetBlockIds) {
          if (!argsSafe.targetBlockIds.includes(id)) argsSafe.targetBlockIds.push(id);
        }
      }
      if (safePreview.targetTitles) {
        for (const t of safePreview.targetTitles) {
          if (!argsSafe.targetTitles.includes(t)) argsSafe.targetTitles.push(t);
        }
      }
      // Also carry forward reasonCode from result preview to errorCode of outcome if not already set
      if (!result.errorCode && safePreview.reasonCode) {
        result.errorCode = safePreview.reasonCode;
      }
    }

    // Re-apply limits after merge
    argsSafe.targetDocIds = [...new Set(argsSafe.targetDocIds)].slice(0, MAX_TARGET_DOC_IDS);
    argsSafe.targetBlockIds = [...new Set(argsSafe.targetBlockIds)].slice(0, MAX_TARGET_BLOCK_IDS);
    argsSafe.targetTitles = [...new Set(argsSafe.targetTitles)].slice(0, MAX_TARGET_TITLES);

    const outcome: AgentTurnActionOutcome = {
      toolName: result.toolName,
      readOnly,
      ok: result.ok,
      summary: truncateText(result.outputSummary, MAX_SUMMARY_CHARS),
      errorCode: result.errorCode ? truncateText(result.errorCode, 80) : undefined,
      targetDocIds: argsSafe.targetDocIds.length > 0 ? argsSafe.targetDocIds : undefined,
      targetBlockIds: argsSafe.targetBlockIds.length > 0 ? argsSafe.targetBlockIds : undefined,
      targetTitles: argsSafe.targetTitles.length > 0 ? argsSafe.targetTitles : undefined,
      writeOperation: writeOperation ? true : undefined,
      needsVerification: needsVerification ? true : undefined,
      timestamp: result.at,
    };

    outcomes.push(outcome);

    // Accumulate tool names
    allToolNames.add(result.toolName);

    // Accumulate touched targets
    for (const id of argsSafe.targetDocIds) allDocIds.add(id);
    for (const id of argsSafe.targetBlockIds) allBlockIds.add(id);
    for (const t of argsSafe.targetTitles) allTitles.add(t);
  }

  // Also include dispatch-only events (tools that were dispatched but no result — rare)
  for (const [callId, dispatch] of dispatchMap) {
    if (outcomes.some((o) => o.toolName === dispatch.toolName && o.timestamp === dispatch.at)) continue;
    // Check if we already have a result for this callId
    const hasResult = resultEvents.some((r) => r.toolCallId === callId);
    if (hasResult) continue;

    // Dispatch without result — mark as unknown status
    const argsSafe = extractSafeArgs(dispatch.toolName, argsByCallId.get(callId));
    allToolNames.add(dispatch.toolName);
    for (const id of argsSafe.targetDocIds) allDocIds.add(id);
    for (const id of argsSafe.targetBlockIds) allBlockIds.add(id);
    for (const t of argsSafe.targetTitles) allTitles.add(t);
  }

  // Trim outcomes — keep at most MAX_OUTCOMES_PER_TURN, prioritize writes/failures
  const trimmedOutcomes = trimOutcomes(outcomes, MAX_OUTCOMES_PER_TURN);

  // Compute write status
  const writeOutcomes = trimmedOutcomes.filter((o) => o.writeOperation);
  let writeStatus: AgentTurnActionTraceSummary["lastWriteStatus"] = "none";
  let writeSummary: string | undefined;

  const isRejectedCode = (code?: string): boolean =>
    code === "user_rejected" || code === "rejected" || code === "tool_rejected";

  const isAbortedCode = (code?: string): boolean =>
    code === "user_aborted" || code === "aborted" || code === "manual_stop";

  if (writeOutcomes.length > 0) {
    const hasRejected = writeOutcomes.some((o) => isRejectedCode(o.errorCode));
    const hasAborted = writeOutcomes.some((o) => isAbortedCode(o.errorCode));
    const hasFailed = writeOutcomes.some((o) => !o.ok && !isRejectedCode(o.errorCode) && !isAbortedCode(o.errorCode));
    const hasSuccess = writeOutcomes.some((o) => o.ok);

    if (hasRejected && !hasSuccess) {
      writeStatus = "rejected";
      writeSummary = writeOutcomes.find((o) => isRejectedCode(o.errorCode))?.summary;
    } else if (hasAborted && !hasSuccess) {
      writeStatus = "aborted";
      writeSummary = writeOutcomes.find((o) => isAbortedCode(o.errorCode))?.summary;
    } else if (hasFailed && hasSuccess) {
      writeStatus = "partial";
      writeSummary = `${writeOutcomes.filter((o) => o.ok).length} 成功, ${writeOutcomes.filter((o) => !o.ok).length} 失败`;
    } else if (hasFailed && !hasSuccess) {
      writeStatus = "failed";
      writeSummary = writeOutcomes.find((o) => !o.ok)?.summary;
    } else {
      writeStatus = "success";
      writeSummary = writeOutcomes[writeOutcomes.length - 1]?.summary;
    }
  } else {
    // Check for aborted status in native error/done events
    const hasAbortEvent = events.some(
      (e) => (e.type === "error" && isAbortedCode(e.code)) || (e.type === "done" && isAbortedCode(e.status)),
    );
    if (hasAbortEvent) {
      writeStatus = "aborted";
    }
  }

  // Build last touched arrays (deduplicated, limited)
  const lastTouchedDocIds = [...allDocIds].slice(0, MAX_TARGET_DOC_IDS);
  const lastTouchedBlockIds = [...allBlockIds].slice(0, MAX_TARGET_BLOCK_IDS);
  const lastTouchedTitles = [...allTitles].slice(0, MAX_TARGET_TITLES);

  return {
    toolNames: [...allToolNames].slice(0, MAX_TOOL_NAMES),
    outcomes: trimmedOutcomes.length > 0 ? trimmedOutcomes : undefined,
    lastTouchedDocIds: lastTouchedDocIds.length > 0 ? lastTouchedDocIds : undefined,
    lastTouchedBlockIds: lastTouchedBlockIds.length > 0 ? lastTouchedBlockIds : undefined,
    lastTouchedTitles: lastTouchedTitles.length > 0 ? lastTouchedTitles : undefined,
    lastWriteStatus: writeOutcomes.length > 0 || writeStatus === "aborted" ? writeStatus : undefined,
    lastWriteSummary: writeSummary ? truncateText(writeSummary, MAX_SUMMARY_CHARS) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Main builder                                                       */
/* ------------------------------------------------------------------ */

export function buildAgentTurnMemory(params: BuildAgentTurnMemoryParams): AgentTurnMemory {
  const { turnId, userQuestion, result } = params;

  const footerReferenceDocIds: string[] = [];
  const footerReferenceTitles: string[] = [];
  const footerReferenceBlockIds: string[] = [];
  const footerReferenceReasons: string[] = [];
  const footerReferenceReadLevels: string[] = [];
  const footerReferenceGroundedFlags: boolean[] = [];
  const footerReferenceSourceTypes: string[] = [];
  const footerReferenceUrls: string[] = [];
  const footerReferenceSourceNames: string[] = [];
  const footerReferenceProviders: string[] = [];
  for (const ref of result.footerReferences ?? []) {
    // Push ALL fields for EVERY ref to keep parallel arrays aligned at the same index.
    // Missing values become empty strings / false.
    footerReferenceDocIds.push(ref.docId ?? "");
    footerReferenceTitles.push(ref.docTitle ?? "");
    footerReferenceBlockIds.push(ref.sourceBlockIds?.[0] ?? "");
    footerReferenceReasons.push((ref as { referenceReason?: string }).referenceReason ?? "");
    footerReferenceReadLevels.push(ref.readLevel ?? "");
    footerReferenceGroundedFlags.push((ref as { grounded?: boolean }).grounded ?? false);
    footerReferenceSourceTypes.push((ref as { sourceType?: string }).sourceType ?? "");
    footerReferenceUrls.push((ref as { url?: string }).url ?? "");
    footerReferenceSourceNames.push((ref as { sourceName?: string }).sourceName ?? "");
    footerReferenceProviders.push((ref as { provider?: string }).provider ?? "");
  }

  return {
    turnId,
    createdAt: Date.now(),
    userQuestion,
    scope: result.scope
      ? {
          type: result.scope.type,
          docId: result.scope.docId as string | undefined,
          rootDocId: result.scope.rootDocId as string | undefined,
          notebookId: result.scope.notebookId as string | undefined,
          docIds: result.scope.docIds as string[] | undefined,
        }
      : undefined,
    actionTraceSummary: extractActionTraceSummary(result.events),
    footerReferenceDocIds,
    footerReferenceTitles,
    footerReferenceBlockIds,
    footerReferenceReasons,
    footerReferenceReadLevels,
    footerReferenceGroundedFlags,
    footerReferenceSourceTypes,
    footerReferenceUrls,
    footerReferenceSourceNames,
    footerReferenceProviders,
  };
}
