/**
 * Agent Action Normalizer
 *
 * Pure function for structural cleaning of AgentAction.
 *
 * 职责：
 * - trim 字符串（text/keywordQuery/fuzzyQuery/reason）
 * - 数组去重（docIds/blockIds/excludeDocIds）
 * - 数字 clamp（limit/before/after/maxHeadings/maxCharsPerDoc/maxCharsPerBlock）
 * - 不允许根据用户问题修改 action type
 */

import type { AgentAction, SearchScopeQuery, RetrievalMode } from "./action-types";
export type { AgentAction };

export interface ActionBudgetLimits {
  maxQueries?: number;
  maxQueryTextLen?: number;
  maxDocIds?: number;
  maxBlockIds?: number;
  maxLimit?: number;
  maxBeforeAfter?: number;
  maxHeadings?: number;
  maxCharsPerDoc?: number;
  maxCharsPerBlock?: number;
}

function clampNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  return Math.min(Math.max(value, min), max);
}

function dedupStrings(arr: string[] | undefined): string[] {
  if (!arr) return [];
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function trimString(s: string | undefined): string {
  return (s ?? "").trim();
}

const VALID_RETRIEVAL_MODES: RetrievalMode[] = [
  "balanced",
  "keyword_first",
  "exact_only",
];

function normalizeRetrievalMode(value: string | undefined): RetrievalMode | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if ((VALID_RETRIEVAL_MODES as string[]).includes(trimmed)) {
    return trimmed as RetrievalMode;
  }
  return undefined;
}

function normalizeSearchScopeQuery(q: SearchScopeQuery, budget?: ActionBudgetLimits): SearchScopeQuery {
  return {
    text: trimString(q.text).slice(0, budget?.maxQueryTextLen ?? 200),
    keywordQuery: q.keywordQuery ? trimString(q.keywordQuery).slice(0, budget?.maxQueryTextLen ?? 200) : undefined,
    fuzzyQuery: q.fuzzyQuery ? trimString(q.fuzzyQuery).slice(0, budget?.maxQueryTextLen ?? 200) : undefined,
    channels: q.channels ? { ...q.channels } : undefined,
    mode: normalizeRetrievalMode(q.mode),
  };
}

export function normalizeAgentAction(
  action: AgentAction,
  budget?: ActionBudgetLimits
): AgentAction {
  switch (action.type) {
    case "search_scope": {
      let queries = action.args.queries.map((q) => normalizeSearchScopeQuery(q, budget));
      if (budget?.maxQueries !== undefined) {
        queries = queries.slice(0, budget.maxQueries);
      }
      const excludeDocIds = dedupStrings(action.args.excludeDocIds);
      const includeDocIds = action.args.includeDocIds
        ? [...new Set(action.args.includeDocIds.map((s) => s.trim()).filter(Boolean))].slice(0, 50)
        : undefined;
      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          queries,
          limit: clampNumber(action.args.limit, 1, budget?.maxLimit ?? 200),
          excludeDocIds,
          excludeAlreadyRead: action.args.excludeAlreadyRead,
          includeDocIds,
        },
      };
    }

    case "list_scope_docs": {
      const query = action.args.query?.trim();
      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          limit: clampNumber(action.args.limit, 1, budget?.maxLimit ?? 200),
          query: query && query.length > 0 ? query : undefined,
        },
      };
    }

    case "read_docs": {
      const docIds = dedupStrings(action.args.docIds);
      const clampedDocIds = budget?.maxDocIds !== undefined
        ? docIds.slice(0, budget.maxDocIds)
        : docIds;
      const readSource = action.args.readSource;
      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          docIds: clampedDocIds,
          ...(action.args.maxCharsPerDoc !== undefined ? {
            maxCharsPerDoc: clampNumber(
              action.args.maxCharsPerDoc,
              100,
              budget?.maxCharsPerDoc ?? 50000
            ),
          } : {}),
          ...(readSource ? { readSource } : {}),
        },
      };
    }

    case "read_block_context": {
      const blockIds = dedupStrings(action.args.blockIds);
      const clampedBlockIds = budget?.maxBlockIds !== undefined
        ? blockIds.slice(0, budget.maxBlockIds)
        : blockIds;
      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          blockIds: clampedBlockIds,
          before: clampNumber(action.args.before, 0, budget?.maxBeforeAfter ?? 50),
          after: clampNumber(action.args.after, 0, budget?.maxBeforeAfter ?? 50),
          includeParent: action.args.includeParent,
          includeChildren: action.args.includeChildren,
          includeHeadingPath: action.args.includeHeadingPath,
          maxCharsPerBlock: clampNumber(
            action.args.maxCharsPerBlock,
            50,
            budget?.maxCharsPerBlock ?? 20000
          ),
        },
      };
    }

    case "answer": {
      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          evidenceMode: action.args.evidenceMode,
          evidenceDocIds: action.args.evidenceDocIds ? dedupStrings(action.args.evidenceDocIds) : undefined,
          evidenceBlockIds: action.args.evidenceBlockIds ? dedupStrings(action.args.evidenceBlockIds) : undefined,
        },
      };
    }

    case "get_conversation_used_references": {
      const turnScope = action.args.turnScope;
      const normalizedTurnScope = turnScope && ["last", "recent", "all", "selected"].includes(turnScope)
        ? turnScope
        : undefined;

      const turnIndexes = action.args.turnIndexes
        ? [...new Set(action.args.turnIndexes.filter((n): n is number => typeof n === "number"))]
        : undefined;

      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          turnScope: normalizedTurnScope,
          turnIndexes,
          maxTurns: clampNumber(action.args.maxTurns, 1, 20),
          maxRefsPerTurn: clampNumber(action.args.maxRefsPerTurn, 1, 50),
          includeAnswerItemMapping: typeof action.args.includeAnswerItemMapping === "boolean"
            ? action.args.includeAnswerItemMapping
            : undefined,
        },
      };
    }

    case "get_doc_tree_context": {
      const anchorRefs = action.args.anchorRefs
        ? dedupStrings(action.args.anchorRefs)
        : undefined;
      const anchorIndexes = action.args.anchorIndexes
        ? [...new Set(action.args.anchorIndexes.filter((n): n is number => typeof n === "number"))]
        : undefined;

      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          anchorRefs,
          anchorIndexes,
          includeParent: action.args.includeParent,
          includeSiblings: action.args.includeSiblings,
          includeChildren: action.args.includeChildren,
          includeDescendants: action.args.includeDescendants,
          maxDepth: clampNumber(action.args.maxDepth, 0, 5),
          maxItems: clampNumber(action.args.maxItems, 1, 100),
        },
      };
    }

    case "list_knowledge_map": {
      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          query: action.args.query ? trimString(action.args.query).slice(0, 200) : undefined,
          maxDepth: clampNumber(action.args.maxDepth, 1, 6),
          maxNodes: clampNumber(action.args.maxNodes, 20, 300),
          rootHandles: action.args.rootHandles ? dedupStrings(action.args.rootHandles).slice(0, 20) : undefined,
          includeAncestors: action.args.includeAncestors,
          includeChildrenPreview: action.args.includeChildrenPreview,
        },
      };
    }

    case "focus_doc_scope": {
      return {
        ...action,
        reason: trimString(action.reason),
        args: {
          handles: dedupStrings(action.args.handles).slice(0, 20),
          mode: action.args.mode,
          reason: action.args.reason ? trimString(action.args.reason).slice(0, 200) : undefined,
          maxDocIds: clampNumber(action.args.maxDocIds, 1, 200),
        },
      };
    }
  }
}
