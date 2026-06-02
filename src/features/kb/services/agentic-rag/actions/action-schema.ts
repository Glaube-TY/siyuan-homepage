/**
 * Agent Action Schema
 *
 * Zod schema for validating AgentAction structures.
 *
 * 职责：
 * - 使用 z.discriminatedUnion("type", [...]) 避免 type 和 args 错配
 * - schema 只校验结构，不根据用户问题语义改 action
 */

import { z } from "zod";

const VALID_RETRIEVAL_MODES = ["balanced", "keyword_first", "exact_only"] as const;

function optionalTrimmedString() {
  return z.any().optional().transform((val: unknown) => {
    if (typeof val !== "string") return undefined;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });
}

function optionalRetrievalMode() {
  return z.any().optional().transform((val: unknown): "balanced" | "keyword_first" | "exact_only" | undefined => {
    if (typeof val !== "string") return undefined;
    const trimmed = val.trim().toLowerCase();
    return (VALID_RETRIEVAL_MODES as readonly string[]).includes(trimmed) ? trimmed as "balanced" | "keyword_first" | "exact_only" : undefined;
  });
}

const SearchScopeQuerySchema = z.object({
  text: z.string().trim().min(1),
  keywordQuery: optionalTrimmedString(),
  fuzzyQuery: optionalTrimmedString(),
  channels: z.object({
    keyword: z.boolean().optional(),
    fuzzy: z.boolean().optional(),
  }).optional(),
  mode: optionalRetrievalMode(),
});

export const SearchScopeArgsSchema = z.object({
  queries: z.array(SearchScopeQuerySchema).min(1),
  limit: z.number().optional(),
  excludeDocIds: z.array(z.string()).optional(),
  excludeAlreadyRead: z.boolean().optional(),
  includeDocIds: z.array(z.string()).optional(),
});

export const ListScopeDocsArgsSchema = z.object({
  limit: z.number().optional(),
  query: z.preprocess((val) => {
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return val;
  }, z.string().optional()),
});

export const ReadDocsArgsSchema = z.object({
  docIds: z.array(z.string()).min(1),
  maxCharsPerDoc: z.number().optional(),
  readSource: z.enum(["previous_evidence", "search_scope", "candidate_docs", "list_scope_docs", "manual"]).optional(),
});

export const ReadBlockContextArgsSchema = z.object({
  blockIds: z.array(z.string()).min(1),
  before: z.number().optional(),
  after: z.number().optional(),
  includeParent: z.boolean().optional(),
  includeChildren: z.boolean().optional(),
  includeHeadingPath: z.boolean().optional(),
  maxCharsPerBlock: z.number().optional(),
});

export const AnswerArgsSchema = z.object({
  evidenceMode: z.enum(["with_evidence", "insufficient_evidence", "without_kb_evidence"]),
  evidenceDocIds: z.array(z.string()).optional(),
  evidenceBlockIds: z.array(z.string()).optional(),
});

export const GetConversationUsedReferencesArgsSchema = z.object({
  turnScope: z.enum(["last", "recent", "all", "selected"]).optional(),
  turnIndexes: z.array(z.number()).optional(),
  maxTurns: z.number().optional(),
  maxRefsPerTurn: z.number().optional(),
  includeAnswerItemMapping: z.boolean().optional(),
});

export const GetDocTreeContextArgsSchema = z.object({
  anchorRefs: z.array(z.string()).optional(),
  anchorIndexes: z.array(z.number()).optional(),
  includeParent: z.boolean().optional(),
  includeSiblings: z.boolean().optional(),
  includeChildren: z.boolean().optional(),
  includeDescendants: z.boolean().optional(),
  maxDepth: z.number().optional().transform((val: unknown) => {
    if (typeof val !== "number" || isNaN(val)) return undefined;
    return Math.min(Math.max(Math.floor(val), 0), 5);
  }),
  maxItems: z.number().optional().transform((val: unknown) => {
    if (typeof val !== "number" || isNaN(val)) return undefined;
    return Math.min(Math.max(Math.floor(val), 1), 100);
  }),
});

export const ListKnowledgeMapArgsSchema = z.object({
  query: optionalTrimmedString(),
  maxDepth: z.number().optional().transform((val: unknown) => {
    if (typeof val !== "number" || isNaN(val)) return undefined;
    return Math.min(Math.max(Math.floor(val), 1), 6);
  }),
  maxNodes: z.number().optional().transform((val: unknown) => {
    if (typeof val !== "number" || isNaN(val)) return undefined;
    return Math.min(Math.max(Math.floor(val), 20), 300);
  }),
  rootHandles: z.array(z.string()).optional(),
  includeAncestors: z.boolean().optional(),
  includeChildrenPreview: z.boolean().optional(),
});

export const FocusDocScopeArgsSchema = z.object({
  handles: z.array(z.string()).min(1).max(20),
  mode: z.enum(["exact", "subtree", "siblings", "notebook"]).optional(),
  reason: z.string().optional(),
  maxDocIds: z.number().optional().transform((val: unknown) => {
    if (typeof val !== "number" || isNaN(val)) return undefined;
    return Math.min(Math.max(Math.floor(val), 1), 200);
  }),
});

export const ReadCandidateDocsArgsSchema = z.object({
  selection: z.enum(["top_k", "representative", "unread_top_k"]),
  k: z.number().optional(),
});

export const ReadPreviousEvidenceArgsSchema = z.object({
  k: z.number().optional(),
  previousAnswerItemIndexes: z.array(z.number()).optional(),
  evidenceHandles: z.array(z.string()).optional(),
});

export const AgentActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("search_scope"),
    reason: z.string(),
    args: SearchScopeArgsSchema,
  }),
  z.object({
    type: z.literal("list_scope_docs"),
    reason: z.string(),
    args: ListScopeDocsArgsSchema,
  }),
  z.object({
    type: z.literal("read_docs"),
    reason: z.string(),
    args: ReadDocsArgsSchema,
  }),
  z.object({
    type: z.literal("read_candidate_docs"),
    reason: z.string(),
    args: ReadCandidateDocsArgsSchema,
  }),
  z.object({
    type: z.literal("read_previous_evidence"),
    reason: z.string(),
    args: ReadPreviousEvidenceArgsSchema,
  }),
  z.object({
    type: z.literal("read_block_context"),
    reason: z.string(),
    args: ReadBlockContextArgsSchema,
  }),
  z.object({
    type: z.literal("answer"),
    reason: z.string(),
    args: AnswerArgsSchema,
  }),
  z.object({
    type: z.literal("get_conversation_used_references"),
    reason: z.string(),
    args: GetConversationUsedReferencesArgsSchema,
  }),
  z.object({
    type: z.literal("get_doc_tree_context"),
    reason: z.string(),
    args: GetDocTreeContextArgsSchema,
  }),
  z.object({
    type: z.literal("list_knowledge_map"),
    reason: z.string(),
    args: ListKnowledgeMapArgsSchema,
  }),
  z.object({
    type: z.literal("focus_doc_scope"),
    reason: z.string(),
    args: FocusDocScopeArgsSchema,
  }),
]);

export type AgentActionObject = z.infer<typeof AgentActionSchema>;
