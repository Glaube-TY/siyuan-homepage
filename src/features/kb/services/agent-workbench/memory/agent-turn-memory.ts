/**
 * Agent Workbench turn memory.
 *
 * Stores only lightweight metadata needed by chat history.
 * It does NOT persist tool observations, read content, candidate caches,
 * answer summaries, answer items, or internal workspace state.
 * Stage summaries (planner_stage_summary) are the sole compression source.
 */

import type { AgentWorkbenchEvent } from "../contracts/turn-event";

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
  actionTraceSummary: {
    toolNames: string[];
  };
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

function extractToolNames(events: readonly AgentWorkbenchEvent[] | undefined): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const event of events ?? []) {
    if (event.type !== "ToolDispatch" && event.type !== "ToolResult") continue;
    if (!event.toolName || seen.has(event.toolName)) continue;
    // final_answer is a system action, not an ordinary tool — exclude from trace
    if (event.toolName === "final_answer") continue;
    seen.add(event.toolName);
    names.push(event.toolName);
  }
  return names;
}

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
    actionTraceSummary: {
      toolNames: extractToolNames(result.events),
    },
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
