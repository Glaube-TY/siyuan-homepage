/**
 * Planner Action Contract
 *
 * AI Planner 工具动作的严格 Zod schema 和类型定义。
 *
 * 职责：
 * - 定义 PlannerAction 类型和 Zod schema
 * - 提供 normalizePlannerAction 校验函数
 * - 检测并移除 forbidden runtime id fields（docIds、blockIds 等）
 * - 返回 validationWarnings
 * - 不解析用户自然语言
 *
 * 允许的工具动作：
 * - list_scope_docs
 * - search_scope
 * - read_candidate_docs
 * - read_previous_evidence
 * - read_block_context
 * - get_conversation_used_references
 * - answer
 *
 * 禁止：
 * - collection_summary、multi_doc_sweep、single_doc 作为 planner action
 * - AI 输出 docIds/blockIds
 * - read_candidate_docs 输出 docIds，只能输出 selection
 * - read_previous_evidence 输出 docIds
 * - read_block_context 输出 blockIds
 */

import { z } from "zod";
import { FORBIDDEN_RUNTIME_ID_FIELDS } from "../runtime/runtime-turn-facts";

export type PlannerActionType =
  | "list_scope_docs"
  | "search_scope"
  | "read_candidate_docs"
  | "read_previous_evidence"
  | "read_block_context"
  | "get_conversation_used_references"
  | "get_doc_tree_context"
  | "answer"
  | "list_knowledge_map"
  | "focus_doc_scope";

export type CandidateDocSelection = "top_k" | "representative" | "unread_top_k";
export type BlockContextSelection = "top_blocks" | "from_read_docs";
export type SearchMode = "balanced" | "keyword_first" | "exact_only";
export type EvidenceCoverage = "single" | "several" | "representative" | "broad" | "unknown";
export type EvidenceMode = "with_evidence" | "insufficient_evidence" | "without_kb_evidence";

export type AnswerKind = "with_evidence" | "insufficient_evidence" | "needs_clarification";

export interface PlannerListScopeDocsArgs {
  limit?: number;
  query?: string;
}

export interface PlannerSearchScopeQuery {
  text: string;
  keywordQuery?: string;
  fuzzyQuery?: string;
  mode?: SearchMode;
}

export interface PlannerSearchScopeArgs {
  queries: PlannerSearchScopeQuery[];
  limit?: number;
  excludeAlreadyRead?: boolean;
}

export interface PlannerReadCandidateDocsArgs {
  selection: CandidateDocSelection;
  k?: number;
}

export interface PlannerReadPreviousEvidenceArgs {
  k?: number;
  previousAnswerItemIndexes?: number[];
  evidenceHandles?: string[];
}

export interface PlannerReadBlockContextArgs {
  selection: BlockContextSelection;
  k?: number;
}

export type ConversationUsedReferencesTurnScope = "last" | "recent" | "all" | "selected";

export interface PlannerGetConversationUsedReferencesArgs {
  turnScope?: ConversationUsedReferencesTurnScope;
  turnIndexes?: number[];
  maxTurns?: number;
  maxRefsPerTurn?: number;
  includeAnswerItemMapping?: boolean;
}

export interface PlannerGetDocTreeContextArgs {
  anchorRefs?: string[];
  anchorIndexes?: number[];
  includeParent?: boolean;
  includeSiblings?: boolean;
  includeChildren?: boolean;
  includeDescendants?: boolean;
  maxDepth?: number;
  maxItems?: number;
}

export interface PlannerAnswerArgs {
  evidenceMode: EvidenceMode;
  answerKind?: AnswerKind;
}

export interface PlannerListKnowledgeMapArgs {
  query?: string;
  maxDepth?: number;
  maxNodes?: number;
  rootHandles?: string[];
  includeAncestors?: boolean;
  includeChildrenPreview?: boolean;
}

export type PlannerFocusScopeMode = "exact" | "subtree" | "siblings" | "notebook";

export interface PlannerFocusDocScopeArgs {
  handles: string[];
  mode?: PlannerFocusScopeMode;
  reason?: string;
  maxDocIds?: number;
}

export interface PlannerEvidenceGoal {
  minimumReadDocs?: number;
  preferredReadDocs?: number;
  coverage: EvidenceCoverage;
  needsFullDocument: boolean;
}

export interface PlannerActionConstraints {
  requireUnreadFromPreviousTurn?: boolean;
}

export interface PlannerAction {
  type: PlannerActionType;
  reason: string;
  args:
    | PlannerListScopeDocsArgs
    | PlannerSearchScopeArgs
    | PlannerReadCandidateDocsArgs
    | PlannerReadPreviousEvidenceArgs
    | PlannerReadBlockContextArgs
    | PlannerGetConversationUsedReferencesArgs
    | PlannerGetDocTreeContextArgs
    | PlannerAnswerArgs
    | PlannerListKnowledgeMapArgs
    | PlannerFocusDocScopeArgs;
  evidenceGoal?: PlannerEvidenceGoal;
  constraints?: PlannerActionConstraints;
  confidence: number;
  validationWarnings?: string[];
}

export type PlannerActionBase = Omit<PlannerAction, "validationWarnings">;

export const PlannerListScopeDocsArgsSchema = z.object({
  limit: z.number().optional(),
  query: z.string().optional(),
}).strict();

const PlannerSearchScopeQuerySchema = z.object({
  text: z.string(),
  keywordQuery: z.string().optional(),
  fuzzyQuery: z.string().optional(),
  mode: z.enum(["balanced", "keyword_first", "exact_only"]).optional(),
}).strict();

export const PlannerSearchScopeArgsSchema = z.object({
  queries: z.array(PlannerSearchScopeQuerySchema).min(1),
  limit: z.number().optional(),
  excludeAlreadyRead: z.boolean().optional(),
}).strict();

export const PlannerReadCandidateDocsArgsSchema = z.object({
  selection: z.enum(["top_k", "representative", "unread_top_k"]),
  k: z.number().optional(),
}).strict();

export const PlannerReadPreviousEvidenceArgsSchema = z.object({
  k: z.number().optional(),
  previousAnswerItemIndexes: z.array(z.number()).optional(),
  evidenceHandles: z.array(z.string()).optional(),
}).strict();

export const PlannerReadBlockContextArgsSchema = z.object({
  selection: z.enum(["top_blocks", "from_read_docs"]),
  k: z.number().optional(),
}).strict();

export const PlannerGetConversationUsedReferencesArgsSchema = z.object({
  turnScope: z.enum(["last", "recent", "all", "selected"]).optional(),
  turnIndexes: z.array(z.number()).optional(),
  maxTurns: z.number().optional(),
  maxRefsPerTurn: z.number().optional(),
  includeAnswerItemMapping: z.boolean().optional(),
}).strict();

export const PlannerGetDocTreeContextArgsSchema = z.object({
  anchorRefs: z.array(z.string()).optional(),
  anchorIndexes: z.array(z.number()).optional(),
  includeParent: z.boolean().optional(),
  includeSiblings: z.boolean().optional(),
  includeChildren: z.boolean().optional(),
  includeDescendants: z.boolean().optional(),
  maxDepth: z.number().optional(),
  maxItems: z.number().optional(),
}).strict();

export const PlannerAnswerArgsSchema = z.object({
  evidenceMode: z.enum(["with_evidence", "insufficient_evidence", "without_kb_evidence"]),
  answerKind: z.enum(["with_evidence", "insufficient_evidence", "needs_clarification"]).optional(),
}).strict();

export const PlannerListKnowledgeMapArgsSchema = z.object({
  query: z.string().optional(),
  maxDepth: z.number().min(1).max(6).optional(),
  maxNodes: z.number().min(20).max(300).optional(),
  rootHandles: z.array(z.string()).optional(),
  includeAncestors: z.boolean().optional(),
  includeChildrenPreview: z.boolean().optional(),
}).strict();

export const PlannerFocusDocScopeArgsSchema = z.object({
  handles: z.array(z.string()).min(1).max(20),
  mode: z.enum(["exact", "subtree", "siblings", "notebook"]).optional(),
  reason: z.string().optional(),
  maxDocIds: z.number().min(1).max(200).optional(),
}).strict();

const PlannerEvidenceGoalSchema = z.object({
  minimumReadDocs: z.number().optional(),
  preferredReadDocs: z.number().optional(),
  coverage: z.enum(["single", "several", "representative", "broad", "unknown"]),
  needsFullDocument: z.boolean(),
}).strict();

const PlannerActionConstraintsSchema = z.object({
  requireUnreadFromPreviousTurn: z.boolean().optional(),
}).strict();

export const PlannerActionLooseSchema = z.object({
  type: z.string(),
  reason: z.string().optional(),
  args: z.object({}).passthrough().optional(),
  evidenceGoal: z.object({}).passthrough().optional(),
  confidence: z.number().optional(),
}).passthrough();

const PLANNER_ACTION_TYPE_SCHEMAS: Record<PlannerActionType, z.ZodObject<any>> = {
  list_scope_docs: z.object({
    type: z.literal("list_scope_docs"),
    reason: z.string(),
    args: PlannerListScopeDocsArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  search_scope: z.object({
    type: z.literal("search_scope"),
    reason: z.string(),
    args: PlannerSearchScopeArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  read_candidate_docs: z.object({
    type: z.literal("read_candidate_docs"),
    reason: z.string(),
    args: PlannerReadCandidateDocsArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  read_previous_evidence: z.object({
    type: z.literal("read_previous_evidence"),
    reason: z.string(),
    args: PlannerReadPreviousEvidenceArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  read_block_context: z.object({
    type: z.literal("read_block_context"),
    reason: z.string(),
    args: PlannerReadBlockContextArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  get_conversation_used_references: z.object({
    type: z.literal("get_conversation_used_references"),
    reason: z.string(),
    args: PlannerGetConversationUsedReferencesArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  get_doc_tree_context: z.object({
    type: z.literal("get_doc_tree_context"),
    reason: z.string(),
    args: PlannerGetDocTreeContextArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  answer: z.object({
    type: z.literal("answer"),
    reason: z.string(),
    args: PlannerAnswerArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  list_knowledge_map: z.object({
    type: z.literal("list_knowledge_map"),
    reason: z.string(),
    args: PlannerListKnowledgeMapArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  focus_doc_scope: z.object({
    type: z.literal("focus_doc_scope"),
    reason: z.string(),
    args: PlannerFocusDocScopeArgsSchema,
    evidenceGoal: PlannerEvidenceGoalSchema.optional(),
    constraints: PlannerActionConstraintsSchema.optional(),
    confidence: z.number().min(0).max(1),
  }),
};

export const PlannerActionSchema = z.discriminatedUnion("type", Object.values(PLANNER_ACTION_TYPE_SCHEMAS) as [
  z.ZodObject<any>,
  z.ZodObject<any>,
  ...z.ZodObject<any>[]
]);

export function buildAllowedPlannerActionSchema(
  allowedActions: PlannerActionType[],
): z.ZodTypeAny {
  const rawCount = allowedActions.length;
  const safeAllowed = allowedActions.filter((a) => !EXECUTION_ONLY_ACTION_TYPES.has(a));
  if (safeAllowed.length < rawCount) {
    const removed = allowedActions.filter((a) => EXECUTION_ONLY_ACTION_TYPES.has(a));
    console.info("[KB-AGENT | PLANNER_VISIBLE_ACTIONS_NORMALIZED_SAFE]", {
      rawCount,
      normalizedCount: safeAllowed.length,
      removedTypes: removed,
      reason: "execution-only action types removed from planner-visible set",
    });
  }
  const validActions = safeAllowed.filter((a) => a in PLANNER_ACTION_TYPE_SCHEMAS);

  if (validActions.length === 0) {
    return z.object({
      type: z.enum(["_no_action_available"]),
      reason: z.string(),
      confidence: z.number(),
    });
  }

  if (validActions.length === 1) {
    return PLANNER_ACTION_TYPE_SCHEMAS[validActions[0]];
  }

  const schemas = validActions.map((a) => PLANNER_ACTION_TYPE_SCHEMAS[a]);
  return z.discriminatedUnion("type", schemas as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]]);
}

export function buildAllowedPlannerActionLooseSchema(
  allowedActions: PlannerActionType[],
): z.ZodTypeAny {
  const rawCount = allowedActions.length;
  const safeAllowed = allowedActions.filter((a) => !EXECUTION_ONLY_ACTION_TYPES.has(a));
  if (safeAllowed.length < rawCount) {
    const removed = allowedActions.filter((a) => EXECUTION_ONLY_ACTION_TYPES.has(a));
    console.info("[KB-AGENT | PLANNER_VISIBLE_ACTIONS_NORMALIZED_SAFE]", {
      rawCount,
      normalizedCount: safeAllowed.length,
      removedTypes: removed,
      reason: "execution-only action types removed from planner-visible set",
    });
  }
  const validActions = safeAllowed.filter((a) => a in PLANNER_ACTION_TYPE_SCHEMAS);

  if (validActions.length === 0) {
    return z.object({
      type: z.enum(["_no_action_available"]),
      reason: z.string().optional(),
      args: z.object({}).passthrough().optional(),
      evidenceGoal: z.object({}).passthrough().optional(),
      confidence: z.number().optional(),
    }).passthrough();
  }

  return z.object({
    type: z.enum(validActions as [string, ...string[]]),
    reason: z.string().optional(),
    args: z.object({}).passthrough().optional(),
    evidenceGoal: z.object({}).passthrough().optional(),
    confidence: z.number().optional(),
  }).passthrough();
}

export interface NormalizePlannerActionResult {
  action?: PlannerAction;
  normalizeFailed: boolean;
  normalizeFailureReason?: string;
  validationWarnings: string[];
}

function computeNormalizeFailureDiagnostics(
  rawInput: unknown,
  opts?: {
    allowedActionTypeCount?: number;
    zodIssueCount?: number;
    firstIssueCode?: string;
    firstIssuePath?: string;
    canonicalizedArgKeyCount?: number;
    canonicalizedQueryCount?: number;
    droppedUnknownQueryKeyCount?: number;
    invalidModeDroppedCount?: number;
    nestedQueryObjectFlattenedCount?: number;
    emptyQueryDroppedCount?: number;
  },
): {
  rawType?: string;
  argsKeyCount: number;
  missingRequiredKeyCount: number;
  issueCodes: string[];
  allowedActionTypeCount: number;
  zodIssueCount?: number;
  firstIssueCode?: string;
  firstIssuePath?: string;
  canonicalizedArgKeyCount?: number;
  actionType?: string;
  argsShape?: string;
  hasArgs?: boolean;
  hasQueries?: boolean;
  queriesKind?: string;
  queryCount?: number;
  firstQueryKeyCount?: number;
  hasEvidenceMode?: boolean;
  missingEvidenceMode?: boolean;
  canonicalizedQueryCount?: number;
  droppedUnknownQueryKeyCount?: number;
  invalidModeDroppedCount?: number;
  nestedQueryObjectFlattenedCount?: number;
  emptyQueryDroppedCount?: number;
} {
  const record = (rawInput !== null && typeof rawInput === "object" && !Array.isArray(rawInput))
    ? rawInput as Record<string, unknown>
    : {};
  const rawType = typeof record.type === "string" ? record.type : undefined;
  const argsObj = (record.args !== null && typeof record.args === "object" && !Array.isArray(record.args))
    ? record.args as Record<string, unknown>
    : {};
  const argsKeyCount = Object.keys(argsObj).length;
  const issueCodes: string[] = [];
  if (!record.type) issueCodes.push("missing_type");
  if (!record.reason || typeof record.reason !== "string") issueCodes.push("missing_or_invalid_reason");
  if (typeof record.confidence !== "number" || isNaN(record.confidence)) issueCodes.push("missing_or_invalid_confidence");
  const requiredKeys = ["type", "reason", "confidence"];
  const missingRequiredKeyCount = requiredKeys.filter((k) => !(k in record) || record[k] === undefined || record[k] === null).length;

  const actionType = rawType;
  const hasArgs = argsKeyCount > 0;
  const argsShape = Object.keys(argsObj).sort().join(",");

  let hasQueries: boolean | undefined;
  let queriesKind: string | undefined;
  let queryCount: number | undefined;
  let firstQueryKeyCount: number | undefined;

  if (actionType === "search_scope" && hasArgs) {
    const queries = argsObj.queries;
    hasQueries = queries !== undefined && queries !== null;
    if (hasQueries) {
      queriesKind = Array.isArray(queries) ? "array" : typeof queries;
      if (Array.isArray(queries)) {
        queryCount = queries.length;
        const first = queries[0];
        if (first !== null && typeof first === "object" && !Array.isArray(first)) {
          firstQueryKeyCount = Object.keys(first as Record<string, unknown>).length;
        }
      }
    }
  }

  let hasEvidenceMode: boolean | undefined;
  let missingEvidenceMode: boolean | undefined;
  if (actionType === "answer") {
    hasEvidenceMode = "evidenceMode" in argsObj;
    missingEvidenceMode = !hasEvidenceMode;
  }

  return {
    rawType,
    argsKeyCount,
    missingRequiredKeyCount,
    issueCodes,
    allowedActionTypeCount: opts?.allowedActionTypeCount ?? ALLOWED_PLANNER_ACTION_TYPES.size,
    zodIssueCount: opts?.zodIssueCount,
    firstIssueCode: opts?.firstIssueCode,
    firstIssuePath: opts?.firstIssuePath,
    canonicalizedArgKeyCount: opts?.canonicalizedArgKeyCount,
    actionType,
    argsShape,
    hasArgs,
    hasQueries,
    queriesKind,
    queryCount,
    firstQueryKeyCount,
    hasEvidenceMode,
    missingEvidenceMode,
    canonicalizedQueryCount: opts?.canonicalizedQueryCount,
    droppedUnknownQueryKeyCount: opts?.droppedUnknownQueryKeyCount,
    invalidModeDroppedCount: opts?.invalidModeDroppedCount,
    nestedQueryObjectFlattenedCount: opts?.nestedQueryObjectFlattenedCount,
    emptyQueryDroppedCount: opts?.emptyQueryDroppedCount,
  };
}

function logNormalizeFailureSafe(
  rawInput: unknown,
  reason: string,
  validationWarnings: string[],
  opts?: {
    allowedActionTypeCount?: number;
    zodIssueCount?: number;
    firstIssueCode?: string;
    firstIssuePath?: string;
    canonicalizedArgKeyCount?: number;
    canonicalizedQueryCount?: number;
    droppedUnknownQueryKeyCount?: number;
    invalidModeDroppedCount?: number;
    nestedQueryObjectFlattenedCount?: number;
    emptyQueryDroppedCount?: number;
    extraDiagnostics?: Record<string, unknown>;
  },
): void {
  const diag = computeNormalizeFailureDiagnostics(rawInput, opts);
  const extra = opts?.extraDiagnostics ?? {};
  console.info("[KB-AGENT | PLANNER_NORMALIZE_FAILURE_DIAGNOSTICS_SAFE]", {
    rawType: diag.rawType,
    argsKeyCount: diag.argsKeyCount,
    missingRequiredKeyCount: diag.missingRequiredKeyCount,
    issueCodes: diag.issueCodes,
    allowedActionTypeCount: diag.allowedActionTypeCount,
    zodIssueCount: diag.zodIssueCount,
    firstIssueCode: diag.firstIssueCode,
    firstIssuePath: diag.firstIssuePath,
    canonicalizedArgKeyCount: diag.canonicalizedArgKeyCount,
    actionType: diag.actionType,
    argsShape: diag.argsShape,
    hasArgs: diag.hasArgs,
    hasQueries: diag.hasQueries,
    queriesKind: diag.queriesKind,
    queryCount: diag.queryCount,
    firstQueryKeyCount: diag.firstQueryKeyCount,
    hasEvidenceMode: diag.hasEvidenceMode,
    missingEvidenceMode: diag.missingEvidenceMode,
    canonicalizedQueryCount: diag.canonicalizedQueryCount,
    droppedUnknownQueryKeyCount: diag.droppedUnknownQueryKeyCount,
    invalidModeDroppedCount: diag.invalidModeDroppedCount,
    nestedQueryObjectFlattenedCount: diag.nestedQueryObjectFlattenedCount,
    emptyQueryDroppedCount: diag.emptyQueryDroppedCount,
    reason,
    validationWarningCount: validationWarnings.length,
    hasHandles: extra.hasHandles ?? false,
    hasHandleAliases: extra.hasHandleAliases ?? false,
    invalidHandleValueCount: extra.invalidHandleValueCount ?? 0,
    supportedAliasHitCount: extra.supportedAliasHitCount ?? 0,
    hasEvidenceModeAlias: extra.hasEvidenceModeAlias ?? false,
    invalidEvidenceModeValueCount: extra.invalidEvidenceModeValueCount ?? 0,
  });
}

export function normalizePlannerAction(
  rawInput: unknown,
  _runtimeFacts?: {
    previousReferenceDocIds?: string[];
    candidateDocCount?: number;
    candidateBlockCount?: number;
    candidateUnreadCount?: number;
    /** 当前阶段动态允许的动作类型列表（PlannerActionType）；传入后替代全量 ALLOWED_PLANNER_ACTION_TYPES */
    allowedActionTypes?: string[];
    queryText?: string;
    primaryQuery?: string;
  }
): NormalizePlannerActionResult {
  const validationWarnings: string[] = [];

  const effectiveAllowedActionTypes = _runtimeFacts?.allowedActionTypes && _runtimeFacts.allowedActionTypes.length > 0
    ? new Set(_runtimeFacts.allowedActionTypes)
    : ALLOWED_PLANNER_ACTION_TYPES;
  const allowedActionTypeCount = _runtimeFacts?.allowedActionTypes && _runtimeFacts.allowedActionTypes.length > 0
    ? _runtimeFacts.allowedActionTypes.length
    : ALLOWED_PLANNER_ACTION_TYPES.size;

  const cleanedInput = deepRemoveForbiddenFields(rawInput, validationWarnings);

  const normalizedInput = normalizeRawPlannerInput(cleanedInput);

  // ─── Tolerant Adapter ───
  // 在严格 schema 校验前，对模型输出的非 canonical args 字段名做结构归一化。
  // 只做字段别名转换，不做语义推断。
  const canonicalizeResult = canonicalizePlannerActionInput(normalizedInput, {
    candidateUnreadCount: _runtimeFacts?.candidateUnreadCount,
  });
  if (canonicalizeResult.aliasCount > 0) {
    console.info("[KB-AGENT | PLANNER_ARGS_CANONICALIZED_SAFE]", {
      actionType: canonicalizeResult.actionType,
      changedKeyCount: canonicalizeResult.changedKeyCount,
      canonicalArgKeyCount: canonicalizeResult.canonicalArgKeyCount,
      aliasCount: canonicalizeResult.aliasCount,
      queryObjectExtraKeyCount: canonicalizeResult.queryObjectExtraKeyCount,
      droppedUnknownQueryKeyCount: canonicalizeResult.droppedUnknownQueryKeyCount,
      canonicalizedQueryCount: canonicalizeResult.canonicalizedQueryCount,
      invalidModeDroppedCount: canonicalizeResult.invalidModeDroppedCount,
      nestedQueryObjectFlattenedCount: canonicalizeResult.nestedQueryObjectFlattenedCount,
      emptyQueryDroppedCount: canonicalizeResult.emptyQueryDroppedCount,
      reason: "model output args field names normalized to canonical form",
    });
  }
  if ((canonicalizeResult.droppedUnknownQueryKeyCount ?? 0) > 0) {
    console.info("[KB-AGENT | PLANNER_ARGS_DROPPED_UNKNOWN_KEYS_SAFE]", {
      actionType: canonicalizeResult.actionType,
      droppedUnknownQueryKeyCount: canonicalizeResult.droppedUnknownQueryKeyCount,
      canonicalizedQueryCount: canonicalizeResult.canonicalizedQueryCount,
      invalidModeDroppedCount: canonicalizeResult.invalidModeDroppedCount,
      nestedQueryObjectFlattenedCount: canonicalizeResult.nestedQueryObjectFlattenedCount,
      emptyQueryDroppedCount: canonicalizeResult.emptyQueryDroppedCount,
      reason: "non-schema query object keys dropped",
    });
  }

  // 为 read_candidate_docs 补齐结构性默认 args：当 Planner 省略 args 或 args 缺少 selection 时，
  // 基于候选池未读数量自动填充，不依赖用户问题语义。
  applyReadCandidateDocsDefaultArgs(normalizedInput, _runtimeFacts?.candidateUnreadCount, validationWarnings);

  let parsedAction: PlannerActionBase;

  try {
    const parsed = PlannerActionSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      const zodIssues = parsed.error.issues ?? [];
      const failureReason = `结构校验失败：${zodIssues.slice(0, 3).map((i) => i.message).join("; ")}`;
      validationWarnings.push(`结构校验失败：${parsed.error.message}`);
      logNormalizeFailureSafe(rawInput, failureReason, validationWarnings, {
        allowedActionTypeCount,
        zodIssueCount: zodIssues.length,
        firstIssueCode: zodIssues[0]?.code,
        firstIssuePath: zodIssues[0]?.path?.join("."),
        canonicalizedArgKeyCount: canonicalizeResult.canonicalArgKeyCount,
        canonicalizedQueryCount: canonicalizeResult.canonicalizedQueryCount,
        droppedUnknownQueryKeyCount: canonicalizeResult.droppedUnknownQueryKeyCount,
        invalidModeDroppedCount: canonicalizeResult.invalidModeDroppedCount,
        nestedQueryObjectFlattenedCount: canonicalizeResult.nestedQueryObjectFlattenedCount,
        emptyQueryDroppedCount: canonicalizeResult.emptyQueryDroppedCount,
        extraDiagnostics: canonicalizeResult.extraDiagnostics,
      });
      return {
        normalizeFailed: true,
        normalizeFailureReason: failureReason,
        validationWarnings,
      };
    }

    parsedAction = parsed.data as PlannerActionBase;
  } catch (err) {
    const failureReason = `结构解析失败：${err instanceof Error ? err.message : String(err)}`;
    validationWarnings.push(failureReason);
    logNormalizeFailureSafe(rawInput, failureReason, validationWarnings, {
      allowedActionTypeCount,
      canonicalizedArgKeyCount: canonicalizeResult.canonicalArgKeyCount,
      canonicalizedQueryCount: canonicalizeResult.canonicalizedQueryCount,
      droppedUnknownQueryKeyCount: canonicalizeResult.droppedUnknownQueryKeyCount,
      invalidModeDroppedCount: canonicalizeResult.invalidModeDroppedCount,
      nestedQueryObjectFlattenedCount: canonicalizeResult.nestedQueryObjectFlattenedCount,
      emptyQueryDroppedCount: canonicalizeResult.emptyQueryDroppedCount,
      extraDiagnostics: canonicalizeResult.extraDiagnostics,
    });
    return {
      normalizeFailed: true,
      normalizeFailureReason: failureReason,
      validationWarnings,
    };
  }

  if (!effectiveAllowedActionTypes.has(parsedAction.type)) {
    const failureReason = `不允许的动作类型："${parsedAction.type}"（当前阶段允许: ${[...effectiveAllowedActionTypes].join(", ")}）`;
    validationWarnings.push(`不允许的动作类型："${parsedAction.type}" 不在当前阶段允许的动作集合中`);
    logNormalizeFailureSafe(rawInput, failureReason, validationWarnings, {
      allowedActionTypeCount,
      canonicalizedArgKeyCount: canonicalizeResult.canonicalArgKeyCount,
      canonicalizedQueryCount: canonicalizeResult.canonicalizedQueryCount,
      droppedUnknownQueryKeyCount: canonicalizeResult.droppedUnknownQueryKeyCount,
      invalidModeDroppedCount: canonicalizeResult.invalidModeDroppedCount,
      nestedQueryObjectFlattenedCount: canonicalizeResult.nestedQueryObjectFlattenedCount,
      emptyQueryDroppedCount: canonicalizeResult.emptyQueryDroppedCount,
      extraDiagnostics: canonicalizeResult.extraDiagnostics,
    });
    return {
      normalizeFailed: true,
      normalizeFailureReason: failureReason,
      validationWarnings,
    };
  }

  const sanitizedArgs = sanitizePlannerArgs(parsedAction.type, parsedAction.args, validationWarnings);
  const sanitizedConstraints = sanitizePlannerConstraints(parsedAction.constraints, validationWarnings);

  const normalized: PlannerAction = {
    type: parsedAction.type,
    reason: parsedAction.reason,
    args: sanitizedArgs,
    evidenceGoal: parsedAction.evidenceGoal,
    constraints: sanitizedConstraints,
    confidence: Math.min(1, Math.max(0, parsedAction.confidence)),
    validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
  };

  return { action: normalized, normalizeFailed: false, validationWarnings };
}

function normalizeRawPlannerInput(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input;

  const record = { ...(input as Record<string, unknown>) };

  if (!("reason" in record) || typeof record.reason !== "string") {
    record.reason = "AI 规划器未提供原因";
  }

  if (!("confidence" in record) || typeof record.confidence !== "number" || isNaN(record.confidence)) {
    record.confidence = 0.5;
  }

  if (!("args" in record) || record.args === null || typeof record.args !== "object") {
    record.args = {};
  }

  return record;
}

// ─── Planner Tolerant Adapter ───

interface CanonicalizeResult {
  actionType: string;
  changedKeyCount: number;
  canonicalArgKeyCount: number;
  aliasCount: number;
  queryObjectExtraKeyCount?: number;
  droppedUnknownQueryKeyCount?: number;
  canonicalizedQueryCount?: number;
  invalidModeDroppedCount?: number;
  nestedQueryObjectFlattenedCount?: number;
  emptyQueryDroppedCount?: number;
  extraDiagnostics?: Record<string, unknown>;
}

/**
 * Planner args canonicalizer（宽容适配器）。
 *
 * 外部模型可能输出非 canonical 的 args 字段名（别名）——如 search_scope 用
 * args.query 代替 args.queries[0].text，focus_doc_scope 用 args.handle 代替
 * args.handles[0]。本函数做纯结构字段归一化，不做语义推断。
 *
 * 内部执行强制使用 strict canonical schema。adapter 只做结构适配。
 */
function canonicalizePlannerActionInput(
  normalizedInput: unknown,
  _runtimeFacts?: { candidateUnreadCount?: number },
): CanonicalizeResult {
  const result: CanonicalizeResult = {
    actionType: "",
    changedKeyCount: 0,
    canonicalArgKeyCount: 0,
    aliasCount: 0,
  };

  if (normalizedInput === null || typeof normalizedInput !== "object") return result;
  const record = normalizedInput as Record<string, unknown>;
  const actionType = typeof record.type === "string" ? record.type : "";
  result.actionType = actionType;

  const rawArgs = (record.args !== null && typeof record.args === "object" && !Array.isArray(record.args))
    ? record.args as Record<string, unknown>
    : {};

  let canonicalArgs: Record<string, unknown> | null = null;

  switch (actionType) {
    case "search_scope":
      canonicalArgs = canonicalizeSearchScopeArgs(rawArgs, result);
      break;
    case "focus_doc_scope":
      canonicalArgs = canonicalizeFocusDocScopeArgs(rawArgs, result);
      break;
    case "answer":
      canonicalArgs = canonicalizeAnswerArgs(rawArgs, result);
      break;
  }

  if (canonicalArgs !== null) {
    result.canonicalArgKeyCount = Object.keys(canonicalArgs).length;
    record.args = canonicalArgs;
  } else {
    result.canonicalArgKeyCount = Object.keys(rawArgs).length;
  }

  return result;
}

/**
 * search_scope args 结构别名归一化。
 *
 * Canonical: args.queries: [{ text, keywordQuery?, fuzzyQuery?, mode? }]
 *
 * 允许别名：
 *   args.query / args.text / args.searchQuery  →  queries[0].text
 *   args.keyword / args.keywordQuery            →  queries[0].keywordQuery
 *   args.fuzzy   / args.fuzzyQuery              →  queries[0].fuzzyQuery
 *   args.queries 为 string[]                    →  [{text}]
 *
 * 不根据用户问题自动生成 query。
 */
function canonicalizeSearchScopeArgs(
  rawArgs: Record<string, unknown>,
  result: CanonicalizeResult,
): Record<string, unknown> {
  const aliases: string[] = [];
  let queries: Record<string, unknown>[] = [];
  let invalidModeDroppedCount = 0;
  let nestedQueryObjectFlattenedCount = 0;
  let emptyQueryDroppedCount = 0;

  if (Array.isArray(rawArgs.queries)) {
    const rawQueries = rawArgs.queries as unknown[];
    if (rawQueries.length > 0 && typeof rawQueries[0] === "string") {
      queries = rawQueries
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => ({ text: q.trim() }));
      aliases.push("queries:string[]→queries:object[]");
    } else {
      queries = rawQueries
        .filter((q): q is Record<string, unknown> => q !== null && typeof q === "object")
        .map((q) => ({ ...(q as Record<string, unknown>) })) as Record<string, unknown>[];
    }
  } else if (rawArgs.queries !== null && typeof rawArgs.queries === "object") {
    queries = [{ ...(rawArgs.queries as Record<string, unknown>) }];
    aliases.push("queries:object→queries:object[]");
  }

  // 顶层 query object 别名 → queries[0]
  if (queries.length === 0 && rawArgs.query !== null && typeof rawArgs.query === "object") {
    queries = [{ ...(rawArgs.query as Record<string, unknown>) }];
    aliases.push("query:object→queries[0]");
  }

  // 顶层 text 别名 → queries[0].text
  let textFromAlias: string | undefined;
  const textAliasKeys = ["query", "text", "searchQuery"];
  for (const key of textAliasKeys) {
    if (textFromAlias === undefined && typeof rawArgs[key] === "string" && (rawArgs[key] as string).trim().length > 0) {
      textFromAlias = (rawArgs[key] as string).trim();
      aliases.push(`${key}→queries[0].text`);
    }
  }

  if (textFromAlias !== undefined) {
    if (queries.length === 0) {
      queries = [{ text: textFromAlias }];
    } else {
      const q0 = queries[0];
      if (typeof q0.text !== "string" || q0.text.trim().length === 0) {
        q0.text = textFromAlias;
      }
    }
  }

  // 子查询别名 → queries[0] 对应字段
  if (queries.length > 0) {
    const q0 = queries[0];
    const subAliases: [string, string][] = [
      ["keyword", "keywordQuery"],
      ["keywords", "keywordQuery"],
      ["keywordQuery", "keywordQuery"],
      ["fuzzy", "fuzzyQuery"],
      ["fuzzyQuery", "fuzzyQuery"],
    ];
    for (const [aliasKey, targetKey] of subAliases) {
      if (typeof rawArgs[aliasKey] === "string" && (rawArgs[aliasKey] as string).trim().length > 0) {
        if (typeof q0[targetKey] !== "string" || (q0[targetKey] as string).trim().length === 0) {
          q0[targetKey] = (rawArgs[aliasKey] as string).trim();
          if (aliasKey !== targetKey) aliases.push(`${aliasKey}→queries[0].${targetKey}`);
        }
      }
    }
  }

  // 嵌套 query object 扁平化：{text:{text:"..."}} → {text:"..."}
  for (const q of queries) {
    if (q.text !== null && typeof q.text === "object") {
      const nested = q.text as Record<string, unknown>;
      const nestedText = nested.text ?? nested.query ?? nested.searchQuery;
      if (typeof nestedText === "string" && nestedText.trim().length > 0) {
        q.text = nestedText.trim();
        aliases.push("queries[].text:nested→text:string");
        nestedQueryObjectFlattenedCount++;
      }
    }
    if (q.query !== null && typeof q.query === "object") {
      const nested = q.query as Record<string, unknown>;
      const nestedText = nested.text ?? nested.query;
      if (typeof nestedText === "string" && nestedText.trim().length > 0) {
        if (typeof q.text !== "string" || q.text.trim().length === 0) {
          q.text = nestedText.trim();
          aliases.push("queries[].query:nested→text:string");
          nestedQueryObjectFlattenedCount++;
        }
      }
    }
  }

  // 每个 query object 内部结构别名归一化 + schema 清洗
  const ALLOWED_QUERY_KEYS = new Set(["text", "keywordQuery", "fuzzyQuery", "mode"]);
  let totalExtraKeyCount = 0;
  let totalDroppedKeyCount = 0;

  for (const q of queries) {
    const inObjTextAliases = ["query", "searchQuery"];
    for (const key of inObjTextAliases) {
      if (typeof q[key] === "string" && (q[key] as string).trim().length > 0) {
        if (typeof q.text !== "string" || q.text.trim().length === 0) {
          q.text = (q[key] as string).trim();
          aliases.push(`queries[].${key}→text`);
        }
        delete q[key];
      }
    }
    const inObjKwAliases = ["keyword", "keywords"];
    for (const key of inObjKwAliases) {
      if (typeof q[key] === "string" && (q[key] as string).trim().length > 0) {
        if (typeof q.keywordQuery !== "string" || q.keywordQuery.trim().length === 0) {
          q.keywordQuery = (q[key] as string).trim();
          aliases.push(`queries[].${key}→keywordQuery`);
        }
        delete q[key];
      }
    }
    if (typeof q.fuzzy === "string" && (q.fuzzy as string).trim().length > 0) {
      if (typeof q.fuzzyQuery !== "string" || q.fuzzyQuery.trim().length === 0) {
        q.fuzzyQuery = (q.fuzzy as string).trim();
        aliases.push("queries[].fuzzy→fuzzyQuery");
      }
      delete q.fuzzy;
    }

    // mode 校验：不是合法值则删除
    const VALID_MODES = new Set(["balanced", "keyword_first", "exact_only"]);
    if (typeof q.mode === "string") {
      if (!VALID_MODES.has(q.mode)) {
        delete q.mode;
        invalidModeDroppedCount++;
        aliases.push("queries[].mode:invalid→deleted");
      }
    } else if (q.mode !== undefined) {
      delete q.mode;
      invalidModeDroppedCount++;
    }

    // schema 清洗：删除非 schema 字段
    const queryKeys = Object.keys(q);
    const extraKeys = queryKeys.filter((k) => !ALLOWED_QUERY_KEYS.has(k));
    totalExtraKeyCount += extraKeys.length;
    for (const ek of extraKeys) {
      delete q[ek];
      totalDroppedKeyCount++;
    }
  }

  // 过滤空对象
  const originalQueryCount = queries.length;
  queries = queries.filter((q) => Object.keys(q).length > 0);
  emptyQueryDroppedCount = originalQueryCount - queries.length;

  result.queryObjectExtraKeyCount = totalExtraKeyCount;
  result.droppedUnknownQueryKeyCount = totalDroppedKeyCount;
  result.invalidModeDroppedCount = invalidModeDroppedCount;
  result.nestedQueryObjectFlattenedCount = nestedQueryObjectFlattenedCount;
  result.emptyQueryDroppedCount = emptyQueryDroppedCount;

  // 结构归一化：如果 query object 缺 text，但 keywordQuery 或 fuzzyQuery 是非空字符串，则复制到 text
  for (const q of queries) {
    if (typeof q.text !== "string" || q.text.trim().length === 0) {
      const kw = typeof q.keywordQuery === "string" ? q.keywordQuery.trim() : "";
      const fz = typeof q.fuzzyQuery === "string" ? q.fuzzyQuery.trim() : "";
      if (kw.length > 0) {
        q.text = kw;
        aliases.push("keywordQuery→text(structural)");
      } else if (fz.length > 0) {
        q.text = fz;
        aliases.push("fuzzyQuery→text(structural)");
      }
    }
  }
  queries = queries.filter((q) => typeof q.text === "string" && q.text.trim().length > 0);

  result.canonicalizedQueryCount = queries.length;

  const canonical: Record<string, unknown> = {};
  if (queries.length > 0) canonical.queries = queries;

  // limit 类型转换
  if (typeof rawArgs.limit === "number") {
    canonical.limit = rawArgs.limit;
  } else if (typeof rawArgs.limit === "string") {
    const parsed = Number(rawArgs.limit);
    if (!isNaN(parsed) && parsed > 0) {
      canonical.limit = parsed;
      aliases.push("limit:string→number");
    }
  }

  // excludeAlreadyRead 类型转换
  if (typeof rawArgs.excludeAlreadyRead === "boolean") {
    canonical.excludeAlreadyRead = rawArgs.excludeAlreadyRead;
  } else if (rawArgs.excludeAlreadyRead === "true") {
    canonical.excludeAlreadyRead = true;
    aliases.push("excludeAlreadyRead:string→boolean");
  } else if (rawArgs.excludeAlreadyRead === "false") {
    canonical.excludeAlreadyRead = false;
    aliases.push("excludeAlreadyRead:string→boolean");
  }

  if (aliases.length > 0) {
    result.aliasCount = aliases.length;
    result.changedKeyCount = Math.abs(Object.keys(rawArgs).length - Object.keys(canonical).length);
  }

  return canonical;
}

/**
 * focus_doc_scope args 结构别名归一化。
 *
 * Canonical: args.handles: string[]
 *
 * 允许别名：
 *   args.handle / args.rootHandle / args.targetHandle / args.anchorRef → handles[0]
 *   args.handles 为 string → [handles]
 *   args.anchorRefs 为 string[] → handles
 *
 * 不自动选择 handle；若无有效 handles 仍 normalize_failed。
 */
function canonicalizeFocusDocScopeArgs(
  rawArgs: Record<string, unknown>,
  result: CanonicalizeResult,
): Record<string, unknown> {
  const aliases: string[] = [];
  let handles: string[] = [];
  let supportedAliasHitCount = 0;
  let invalidHandleValueCount = 0;

  if (Array.isArray(rawArgs.handles)) {
    handles = rawArgs.handles
      .map((h) => {
        if (typeof h === "string" && h.length > 0) return h;
        if (h && typeof h === "object" && typeof (h as Record<string, unknown>).handle === "string") {
          aliases.push("handles[].handle→handles[]");
          supportedAliasHitCount++;
          return (h as Record<string, unknown>).handle as string;
        }
        if (h && typeof h === "object" && typeof (h as Record<string, unknown>).ref === "string") {
          aliases.push("handles[].ref→handles[]");
          supportedAliasHitCount++;
          return (h as Record<string, unknown>).ref as string;
        }
        invalidHandleValueCount++;
        return null;
      })
      .filter((h): h is string => h !== null && h.length > 0);
  }

  if (typeof rawArgs.handles === "string" && rawArgs.handles.trim().length > 0) {
    handles = [rawArgs.handles.trim()];
    aliases.push("handles:string→handles:string[]");
    supportedAliasHitCount++;
  }

  if (handles.length === 0) {
    const handleAliases = ["handle", "rootHandle", "targetHandle", "anchorRef"];
    for (const key of handleAliases) {
      if (typeof rawArgs[key] === "string" && (rawArgs[key] as string).trim().length > 0) {
        handles = [(rawArgs[key] as string).trim()];
        aliases.push(`${key}→handles[0]`);
        supportedAliasHitCount++;
        break;
      }
    }
  }

  if (handles.length === 0) {
    const arrayAliases = ["anchorRefs", "safeHandles", "handleRefs", "docHandles", "targetHandles", "rootHandles", "refs"];
    for (const key of arrayAliases) {
      if (Array.isArray(rawArgs[key])) {
        const arr = (rawArgs[key] as unknown[])
          .map((h) => {
            if (typeof h === "string" && h.length > 0) return h;
            if (h && typeof h === "object" && typeof (h as Record<string, unknown>).handle === "string") {
              aliases.push(`${key}[].handle→handles[]`);
              supportedAliasHitCount++;
              return (h as Record<string, unknown>).handle as string;
            }
            if (h && typeof h === "object" && typeof (h as Record<string, unknown>).ref === "string") {
              aliases.push(`${key}[].ref→handles[]`);
              supportedAliasHitCount++;
              return (h as Record<string, unknown>).ref as string;
            }
            invalidHandleValueCount++;
            return null;
          })
          .filter((h): h is string => h !== null && h.length > 0);
        if (arr.length > 0) {
          handles = arr;
          aliases.push(`${key}→handles`);
          supportedAliasHitCount++;
          break;
        }
      }
      if (typeof rawArgs[key] === "string" && (rawArgs[key] as string).trim().length > 0) {
        handles = [(rawArgs[key] as string).trim()];
        aliases.push(`${key}:string→handles[0]`);
        supportedAliasHitCount++;
        break;
      }
    }
  }

  const VALID_MODES = new Set(["exact", "subtree", "siblings", "notebook"]);
  let mode = rawArgs.mode;
  if (typeof mode === "string" && !VALID_MODES.has(mode)) {
    aliases.push(`mode:invalid(${mode})→dropped`);
    mode = undefined;
  }

  const canonical: Record<string, unknown> = {};
  if (handles.length > 0) canonical.handles = handles;
  if (typeof mode === "string") canonical.mode = mode;
  if (typeof rawArgs.reason === "string") canonical.reason = rawArgs.reason;
  if (typeof rawArgs.maxDocIds === "number") canonical.maxDocIds = rawArgs.maxDocIds;

  result.aliasCount = aliases.length;
  result.changedKeyCount = Math.abs(Object.keys(rawArgs).length - Object.keys(canonical).length);

  result.extraDiagnostics = {
    hasHandles: handles.length > 0,
    hasHandleAliases: supportedAliasHitCount > 0,
    invalidHandleValueCount,
    supportedAliasHitCount,
  };

  return canonical;
}

/**
 * answer args 结构归一化。
 *
 * Canonical: args: { evidenceMode: "with_evidence"|"insufficient_evidence"|"without_kb_evidence" }
 *
 * Planner 可能输出非 canonical 字段（如 args.summary/args.content/args.response），
 * 这些被静默移除。evidenceMode 缺失时不补默认值，让 PlannerAnswerArgsSchema 校验失败
 * 触发 normalize_failed 回 Planner 重试。
 *
 * 不根据用户问题生成业务内容（answer 文本由 compose 节点生成）。
 */
function canonicalizeAnswerArgs(
  rawArgs: Record<string, unknown>,
  result: CanonicalizeResult,
): Record<string, unknown> {
  const aliases: string[] = [];
  let hasEvidenceMode = false;
  let hasEvidenceModeAlias = false;
  let supportedAliasHitCount = 0;
  let invalidEvidenceModeValueCount = 0;

  const nonCanonicalFields = ["summary", "answer", "final", "response", "content", "text", "plan", "outputStyle", "answerPlan"];
  let hasDroppedStyle = false;
  for (const field of nonCanonicalFields) {
    if (field in rawArgs) {
      aliases.push(`${field}:removed`);
      if (field === "outputStyle" || field === "answerPlan") hasDroppedStyle = true;
    }
  }

  if (hasDroppedStyle) {
    console.info("[KB-AGENT | ANSWER_PLAN_STYLE_DROPPED_SAFE]", {
      droppedKeyCount: aliases.filter((a) => a.includes("outputStyle") || a.includes("answerPlan")).length,
      hasOutputStyle: "outputStyle" in rawArgs,
      actionType: "answer",
      reason: "planner outputStyle/answerPlan dropped; answer style is not planner-controlled",
    });
  }

  const validModes = ["with_evidence", "insufficient_evidence", "without_kb_evidence"];
  const canonical: Record<string, unknown> = {};

  if (typeof rawArgs.evidenceMode === "string" && validModes.includes(rawArgs.evidenceMode)) {
    canonical.evidenceMode = rawArgs.evidenceMode;
    hasEvidenceMode = true;
  } else {
    const modeAliases = ["evidence_mode", "mode", "answerMode", "kbEvidenceMode"];
    for (const key of modeAliases) {
      if (typeof rawArgs[key] === "string") {
        const val = rawArgs[key] as string;
        if (validModes.includes(val)) {
          canonical.evidenceMode = val;
          aliases.push(`${key}→evidenceMode`);
          hasEvidenceModeAlias = true;
          supportedAliasHitCount++;
          break;
        } else {
          invalidEvidenceModeValueCount++;
        }
      }
    }
  }

  if (!hasEvidenceMode && !hasEvidenceModeAlias) {
    const missingEvidenceMode = !("evidenceMode" in rawArgs)
      && !rawArgs.evidence_mode && !rawArgs.mode && !rawArgs.answerMode && !rawArgs.kbEvidenceMode;
    result.extraDiagnostics = {
      hasEvidenceMode: false,
      hasEvidenceModeAlias: false,
      supportedAliasHitCount: 0,
      invalidEvidenceModeValueCount,
      missingEvidenceMode,
    };
  } else {
    result.extraDiagnostics = {
      hasEvidenceMode,
      hasEvidenceModeAlias,
      supportedAliasHitCount,
      invalidEvidenceModeValueCount,
      missingEvidenceMode: false,
    };
  }

  if (aliases.length > 0) {
    result.aliasCount = aliases.length;
    result.changedKeyCount = Math.abs(Object.keys(rawArgs).length - Object.keys(canonical).length);
  }

  return canonical;
}

/**
 * 为 read_candidate_docs 补齐结构性默认 args。
 *
 * 触发条件：raw type 为 read_candidate_docs 且 args 缺少 selection 字段。
 * 默认值基于候选池结构事实（candidateUnreadCount），不依赖用户问题语义。
 * - selection 默认 "unread_top_k"
 * - k 默认 min(candidateUnreadCount, DEFAULT_READ_CANDIDATE_K)
 * - 若 candidateUnreadCount <= 0 且未提供 selection，不补齐（让 schema 校验自然失败）。
 */
function applyReadCandidateDocsDefaultArgs(
  normalizedInput: unknown,
  candidateUnreadCount: number | undefined,
  _warnings: string[],
): void {
  if (normalizedInput === null || typeof normalizedInput !== "object") return;
  const record = normalizedInput as Record<string, unknown>;
  if (record.type !== "read_candidate_docs") return;

  const args = (record.args !== null && typeof record.args === "object" && !Array.isArray(record.args))
    ? record.args as Record<string, unknown>
    : {};

  const hasSelection = "selection" in args && typeof args.selection === "string" && args.selection.length > 0;

  if (hasSelection) return; // Planner 已提供 selection，不覆盖

  if (candidateUnreadCount === undefined || candidateUnreadCount <= 0) {
    // 无未读候选时不能安全补齐，让 schema 校验自然失败
    return;
  }

  const k = Math.min(candidateUnreadCount, DEFAULT_READ_CANDIDATE_K);

  record.args = {
    selection: "unread_top_k",
    k,
  };

  console.info("[KB-AGENT | READ_CANDIDATE_DOCS_DEFAULT_ARGS_APPLIED_SAFE]", {
    candidateUnreadCount,
    defaultK: DEFAULT_READ_CANDIDATE_K,
    appliedK: k,
    reason: "planner omitted args for read_candidate_docs; structural defaults applied",
  });
}

const ALLOWED_PLANNER_ACTION_TYPES = new Set<PlannerActionType>([
  "list_scope_docs",
  "search_scope",
  "read_candidate_docs",
  "read_previous_evidence",
  "read_block_context",
  "get_conversation_used_references",
  "get_doc_tree_context",
  "answer",
  "list_knowledge_map",
  "focus_doc_scope",
]);

/** 执行层专用动作类型：Planner 不可见、不可输出，只能由 materializer 从 Planner 安全动作物化产生 */
const EXECUTION_ONLY_ACTION_TYPES = new Set<string>(["read_docs"]);

/** read_candidate_docs 默认读取数量：当 Planner 未指定 k 时的安全默认值 */
const DEFAULT_READ_CANDIDATE_K = 4;

export function deepRemoveForbiddenFields(input: unknown, warnings: string[]): unknown {
  if (input === null || typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((item) => deepRemoveForbiddenFields(item, warnings));
  }

  const record = { ...(input as Record<string, unknown>) };
  for (const field of FORBIDDEN_RUNTIME_ID_FIELDS) {
    if (field in record) {
      warnings.push(`已移除禁止的运行时 ID 字段："${field}"`);
      delete record[field];
    }
  }

  for (const key of Object.keys(record)) {
    record[key] = deepRemoveForbiddenFields(record[key], warnings);
  }

  return record;
}

export function countForbiddenFields(input: unknown): number {
  if (input === null || typeof input !== "object") return 0;

  if (Array.isArray(input)) {
    return input.reduce((sum, item) => sum + countForbiddenFields(item), 0);
  }

  let count = 0;
  const record = input as Record<string, unknown>;
  for (const field of FORBIDDEN_RUNTIME_ID_FIELDS) {
    if (field in record) {
      count++;
    }
  }

  for (const key of Object.keys(record)) {
    count += countForbiddenFields(record[key]);
  }

  return count;
}

export function sanitizeArgsForLog(args: unknown): unknown {
  if (args === null || typeof args !== "object") return args;

  if (Array.isArray(args)) {
    return args.map((item) => sanitizeArgsForLog(item));
  }

  const record = args as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (FORBIDDEN_RUNTIME_ID_FIELDS.includes(key)) {
      sanitized[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 100) {
      sanitized[key] = value.slice(0, 100) + "...";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeArgsForLog(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function sanitizePlannerConstraints(
  constraints: PlannerActionConstraints | undefined,
  _warnings: string[]
): PlannerActionConstraints | undefined {
  if (!constraints) return undefined;

  const sanitized: PlannerActionConstraints = {};

  if (typeof constraints.requireUnreadFromPreviousTurn === "boolean") {
    sanitized.requireUnreadFromPreviousTurn = constraints.requireUnreadFromPreviousTurn;
  }

  if (Object.keys(sanitized).length === 0) return undefined;
  return sanitized;
}

function sanitizePlannerArgs(
  actionType: PlannerActionType,
  args: unknown,
  warnings: string[]
): PlannerAction["args"] {
  if (args === null || typeof args !== "object") {
    warnings.push("plannerArgs_invalid_type: args 不是对象");
    return buildDefaultArgsForActionType(actionType);
  }

  const record = { ...(args as Record<string, unknown>) };

  for (const field of FORBIDDEN_RUNTIME_ID_FIELDS) {
    if (field in record) {
      warnings.push(`已移除规划器参数中的禁止字段："${field}"`);
      delete record[field];
    }
  }

  switch (actionType) {
    case "list_scope_docs":
      return {
        limit: typeof record.limit === "number" ? Math.max(1, Math.min(record.limit, 50)) : undefined,
        query: typeof record.query === "string" ? record.query : undefined,
      };

    case "search_scope": {
      const queries = Array.isArray(record.queries) ? record.queries : [];
      const sanitizedQueries = queries
        .filter((q) => q !== null && typeof q === "object" && "text" in q && typeof (q as Record<string, unknown>).text === "string")
        .map((q) => {
          const obj = q as Record<string, unknown>;
          const cleanObj = { ...obj };
          for (const field of FORBIDDEN_RUNTIME_ID_FIELDS) {
            if (field in cleanObj) {
              warnings.push(`已移除搜索查询中的禁止字段："${field}"`);
              delete cleanObj[field];
            }
          }
          return {
            text: cleanObj.text as string,
            keywordQuery: typeof cleanObj.keywordQuery === "string" ? cleanObj.keywordQuery : undefined,
            fuzzyQuery: typeof cleanObj.fuzzyQuery === "string" ? cleanObj.fuzzyQuery : undefined,
            mode: ["balanced", "keyword_first", "exact_only"].includes(cleanObj.mode as string) ? cleanObj.mode as SearchMode : undefined,
          };
        });

      if (sanitizedQueries.length === 0) {
        warnings.push("search_scope_no_valid_queries");
        return { queries: [{ text: "" }], limit: typeof record.limit === "number" ? record.limit : undefined };
      }

      return {
        queries: sanitizedQueries,
        limit: typeof record.limit === "number" ? Math.max(1, Math.min(record.limit, 50)) : undefined,
        excludeAlreadyRead: typeof record.excludeAlreadyRead === "boolean" ? record.excludeAlreadyRead : undefined,
      };
    }

    case "read_candidate_docs": {
      const selection = ["top_k", "representative", "unread_top_k"].includes(record.selection as string)
        ? record.selection as CandidateDocSelection
        : "top_k";
      return {
        selection,
        k: typeof record.k === "number" ? Math.max(1, Math.min(record.k, 20)) : undefined,
      };
    }

    case "read_previous_evidence":
      return {
        k: typeof record.k === "number" ? Math.max(1, Math.min(record.k, 10)) : undefined,
        previousAnswerItemIndexes: Array.isArray(record.previousAnswerItemIndexes)
          ? record.previousAnswerItemIndexes.filter((i) => typeof i === "number" && i >= 0).slice(0, 10)
          : undefined,
        evidenceHandles: Array.isArray(record.evidenceHandles)
          ? record.evidenceHandles.filter((h) => typeof h === "string" && h.length > 0 && h.length < 50).slice(0, 10)
          : undefined,
      };

    case "read_block_context": {
      const selection = ["top_blocks", "from_read_docs"].includes(record.selection as string)
        ? record.selection as BlockContextSelection
        : "top_blocks";
      return {
        selection,
        k: typeof record.k === "number" ? Math.max(1, Math.min(record.k, 10)) : undefined,
      };
    }

    case "get_conversation_used_references": {
      const turnScope = ["last", "recent", "all", "selected"].includes(record.turnScope as string)
        ? record.turnScope as ConversationUsedReferencesTurnScope
        : undefined;
      return {
        turnScope,
        turnIndexes: Array.isArray(record.turnIndexes)
          ? record.turnIndexes.filter((i) => typeof i === "number" && i >= 0).slice(0, 20)
          : undefined,
        maxTurns: typeof record.maxTurns === "number" ? Math.max(1, Math.min(record.maxTurns, 10)) : undefined,
        maxRefsPerTurn: typeof record.maxRefsPerTurn === "number" ? Math.max(1, Math.min(record.maxRefsPerTurn, 20)) : undefined,
        includeAnswerItemMapping: typeof record.includeAnswerItemMapping === "boolean" ? record.includeAnswerItemMapping : undefined,
      };
    }

    case "get_doc_tree_context":
      return {
        anchorRefs: Array.isArray(record.anchorRefs)
          ? record.anchorRefs.filter((h) => typeof h === "string" && h.length > 0 && h.length < 80).slice(0, 20)
          : undefined,
        anchorIndexes: Array.isArray(record.anchorIndexes)
          ? record.anchorIndexes.filter((i) => typeof i === "number" && i >= 0).slice(0, 20)
          : undefined,
        includeParent: typeof record.includeParent === "boolean" ? record.includeParent : undefined,
        includeSiblings: typeof record.includeSiblings === "boolean" ? record.includeSiblings : undefined,
        includeChildren: typeof record.includeChildren === "boolean" ? record.includeChildren : undefined,
        includeDescendants: typeof record.includeDescendants === "boolean" ? record.includeDescendants : undefined,
        maxDepth: typeof record.maxDepth === "number" ? Math.max(0, Math.min(record.maxDepth, 5)) : undefined,
        maxItems: typeof record.maxItems === "number" ? Math.max(1, Math.min(record.maxItems, 100)) : undefined,
      };

    case "answer": {
      const evidenceMode = ["with_evidence", "insufficient_evidence", "without_kb_evidence"].includes(record.evidenceMode as string)
        ? record.evidenceMode as EvidenceMode
        : "insufficient_evidence";
      return { evidenceMode };
    }

    case "list_knowledge_map":
      return {
        query: typeof record.query === "string" ? record.query.trim().slice(0, 120) || undefined : undefined,
        maxDepth: typeof record.maxDepth === "number" ? Math.max(1, Math.min(record.maxDepth, 6)) : undefined,
        maxNodes: typeof record.maxNodes === "number" ? Math.max(20, Math.min(record.maxNodes, 300)) : undefined,
        rootHandles: Array.isArray(record.rootHandles)
          ? record.rootHandles.filter((h) => typeof h === "string" && h.length > 0 && h.length < 80).slice(0, 20)
          : undefined,
        includeAncestors: typeof record.includeAncestors === "boolean" ? record.includeAncestors : undefined,
        includeChildrenPreview: typeof record.includeChildrenPreview === "boolean" ? record.includeChildrenPreview : undefined,
      };

    case "focus_doc_scope": {
      const handles = Array.isArray(record.handles)
        ? record.handles.filter((h) => typeof h === "string" && h.length > 0 && h.length < 80).slice(0, 20)
        : [];
      return {
        handles,
        mode: ["exact", "subtree", "siblings", "notebook"].includes(record.mode as string)
          ? record.mode as PlannerFocusScopeMode
          : undefined,
        reason: typeof record.reason === "string" ? record.reason.slice(0, 200) : undefined,
        maxDocIds: typeof record.maxDocIds === "number" ? Math.max(1, Math.min(record.maxDocIds, 200)) : undefined,
      };
    }

    default:
      warnings.push(`plannerArgs_unknown_actionType: ${actionType}`);
      return buildDefaultArgsForActionType(actionType);
  }
}

function buildDefaultArgsForActionType(actionType: PlannerActionType): PlannerAction["args"] {
  switch (actionType) {
    case "list_scope_docs":
      return { limit: 10 };
    case "search_scope":
      return { queries: [{ text: "" }] };
    case "read_candidate_docs":
      return { selection: "top_k", k: 5 };
    case "read_previous_evidence":
      return { k: 3 };
    case "read_block_context":
      return { selection: "top_blocks", k: 3 };
    case "get_conversation_used_references":
      return { turnScope: "recent", maxTurns: 3 };
    case "get_doc_tree_context":
      return { includeParent: true, includeSiblings: true, includeChildren: true, maxDepth: 2, maxItems: 50 };
    case "answer":
      return { evidenceMode: "insufficient_evidence" };
    case "list_knowledge_map":
      return { maxDepth: 4, maxNodes: 120 };
    case "focus_doc_scope":
      return { handles: [], mode: "subtree" };
  }
}


