/**
 * Search Scope Tool Executor
 *
 * Agentic RAG 只读工具：在 scope 限定范围内检索候选块/候选文档。
 *
 * 职责：
 * - 复用现有 searchBlocksForAgent / keyword + fuzzy search 链路，不重写检索算法
 * - 只读，不导入写入 API，不直接 import api.ts
 * - 落实 keyword/fuzzy 两路 query 和 channels
 * - limit 来自 args.limit / settings.firstPassMaxHits，不用 maxBlockContexts
 * - 输出 candidateDocs、candidateBlocks、searchedQueryMetas、warnings
 * - 不直接修改 workspace
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import { mapSearchHitToCandidates } from "../tool-mappers";
import { searchBlocksForAgenticRag } from "../readers/search-blocks";
import { safeTextMeta, pushAgentDebugEvent } from "../../debug/agentic-rag-debug";
import type { SearchBlocksForAgenticRagParams, AgenticDocHit } from "../search-types";
import { getKbSettings } from "../../../settings/kb-settings-service";
import { canCallSearchScope } from "../../safety/budget-guard";
import { aggregateCandidateDocsFromBlocks } from "../../workspace/doc-candidate-aggregation";
import type { CandidateDoc } from "../../workspace/evidence-workspace";

// Consistency requirement: Schema fields and defaults must align with downstream retrieval strategy and searchBlocksForAgenticRag expectations.
// Keep this schema aligned with actions/action-schema.ts SearchScopeQuerySchema.
type RetrievalStrategy = NonNullable<SearchBlocksForAgenticRagParams["retrievalStrategy"]>;

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

const SearchScopeArgsSchema = z.object({
  queries: z.array(
    z.object({
      text: z.string().trim().min(1),
      keywordQuery: optionalTrimmedString(),
      fuzzyQuery: optionalTrimmedString(),
      channels: z.object({
        keyword: z.boolean().optional(),
        fuzzy: z.boolean().optional(),
      }).optional(),
      mode: optionalRetrievalMode(),
    })
  ).min(1),
  limit: z.number().optional(),
  excludeDocIds: z.array(z.string()).optional(),
  excludeAlreadyRead: z.boolean().optional(),
  includeDocIds: z.array(z.string()).optional(),
});

function mapDocHitToCandidateDoc(
  docHit: AgenticDocHit,
  queryText?: string
): CandidateDoc {
  const queryMeta = queryText ? safeTextMeta(queryText) : undefined;
  const provenanceMap: Record<string, CandidateDoc["provenance"]> = {
    kernel_search: "search_scope_kernel",
    title_catalog: "search_scope_title",
    hybrid_doc: "search_scope_hybrid_doc",
  };
  return {
    docId: docHit.docId,
    title: docHit.docTitle,
    box: docHit.box,
    path: docHit.path,
    score: docHit.score,
    source: docHit.source ?? "search_scope",
    provenance: provenanceMap[docHit.source ?? ""] ?? "search_scope",
    hasQuery: true,
    sourceQueryMeta: queryMeta,
    inventoryOnly: false,
    lifecycle: "candidate",
    relevanceScore: docHit.score,
  };
}

function mergeDocLevelCandidates(
  blockAggregatedDocs: CandidateDoc[],
  docLevelDocs: CandidateDoc[]
): CandidateDoc[] {
  const merged = new Map<string, CandidateDoc>();

  for (const doc of blockAggregatedDocs) {
    merged.set(doc.docId, { ...doc });
  }

  for (const doc of docLevelDocs) {
    const existing = merged.get(doc.docId);
    if (!existing) {
      merged.set(doc.docId, { ...doc });
    } else {
      const existingScore = existing.aggregateScore ?? existing.relevanceScore ?? existing.score ?? 0;
      const incomingScore = doc.relevanceScore ?? doc.score ?? 0;
      if (incomingScore > existingScore) {
        merged.set(doc.docId, {
          ...existing,
          score: incomingScore,
          relevanceScore: incomingScore,
          provenance: doc.provenance ?? existing.provenance,
          source: doc.source ?? existing.source,
        });
      }
    }
  }

  const result = Array.from(merged.values());
  result.sort((a, b) => {
    const scoreA = a.aggregateScore ?? a.relevanceScore ?? a.score ?? 0;
    const scoreB = b.aggregateScore ?? b.relevanceScore ?? b.score ?? 0;
    return scoreB - scoreA;
  });
  return result;
}

let selfCheckRan = false;
function validateSearchScopeSchemaSelfCheckForDebug(): void {
  if (selfCheckRan) return;
  selfCheckRan = true;
  try {
    const isDebug = (() => { try { return localStorage.getItem("KB_AGENTIC_RAG_DEBUG") === "1"; } catch { return false; } })();
    if (!isDebug) return;

    const case1 = SearchScopeArgsSchema.safeParse({ queries: [{ text: "abc", mode: "balanced" }], limit: 15 });
    if (!case1.success) {
      console.warn("[KB-AGENT | search_scope] 参数校验失败（案例 1）:", case1.error.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })));
    } else {
      console.info("[KB-AGENT | search_scope] 参数校验通过（案例 1）： {queries:[{text,mode}],limit}");
    }

    const case2 = SearchScopeArgsSchema.safeParse({ queries: [{ text: "abc", keywordQuery: "", fuzzyQuery: "" }], limit: 15 });
    if (!case2.success) {
      console.warn("[KB-AGENT | search_scope] 参数校验失败（案例 2）:", case2.error.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })));
    } else {
      console.info("[KB-AGENT | search_scope] 参数校验通过（案例 2）：空字符串被转换为 undefined");
    }

    const case3 = SearchScopeArgsSchema.safeParse({ queries: [{ text: "" }], limit: 15 });
    if (case3.success) {
      console.warn("[KB-AGENT | search_scope] 参数校验失败（案例 3）：text:'' 为空字符串，被拒绝");
    } else {
      console.info("[KB-AGENT | search_scope] 参数校验通过（案例 3）：text:'' 被正确拒绝");
    }
  } catch (e) {
    console.warn("[KB-AGENT | search_scope] 参数校验错误");
  }
}

function buildRetrievalStrategy(query: NonNullable<z.infer<typeof SearchScopeArgsSchema>["queries"]>[number]): RetrievalStrategy {
  const queries: RetrievalStrategy["queries"] = {};

  const keyword = query.keywordQuery || query.text;
  const fts = query.fuzzyQuery || query.text;

  if (keyword) queries.keyword = keyword;
  if (fts) queries.fts = fts;

  const channels: RetrievalStrategy["channels"] = {};
  if (query.channels) {
    if (typeof query.channels.keyword === "boolean") channels.keyword = query.channels.keyword;
    if (typeof query.channels.fuzzy === "boolean") channels.fts = query.channels.fuzzy;
  }

  const mode = query.mode;

  return {
    mode,
    queries: Object.keys(queries).length > 0 ? queries : undefined,
    channels: Object.keys(channels).length > 0 ? channels : undefined,
  };
}

function checkAvailability(context: AgentToolExecutionContext): AgentToolAvailability {
  const { scope, budget, workspace } = context;

  if (!scope) {
    return { available: false, reason: "未定义检索范围" };
  }

  if (scope.type === "current_doc" || scope.type === "custom_docs") {
    return { available: false, reason: "固定文档范围不开放 search_scope，应使用 read_docs/read_block_context" };
  }

  const budgetCheck = canCallSearchScope(budget, {
    counters: undefined,
    workspaceCoverage: workspace?.coverage,
  });
  if (!budgetCheck.allowed) {
    return { available: false, reason: budgetCheck.reason };
  }

  return { available: true };
}

function calcBudgetCost(context: AgentToolExecutionContext): AgentToolBudgetCost {
  const maxCalls = context.budget?.maxSearchCalls ?? 10;
  const used = context.workspace?.coverage.searchCallCount ?? 0;
  return {
    toolCallsUsed: 1,
    toolCallsRemaining: Math.max(0, maxCalls - used - 1),
  };
}

async function execute(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  validateSearchScopeSchemaSelfCheckForDebug();
  const { scope, budget, workspace, trace } = context;

  if (!scope) {
    return { success: false, error: "未定义检索范围", warning: "search_scope 需要检索范围" };
  }

  const parsed = SearchScopeArgsSchema.safeParse(args);
  if (!parsed.success) {
    const zodIssues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    })).slice(0, 5);
    const argKeys = typeof args === "object" && args !== null ? Object.keys(args) : [];
    const rawQueries = (args as Record<string, unknown>)?.queries;
    const queryCount = Array.isArray(rawQueries) ? rawQueries.length : 0;
    const firstQuery = queryCount > 0 ? (rawQueries as Array<Record<string, unknown>>)[0] : undefined;
    const firstQueryText = typeof firstQuery?.text === "string" ? firstQuery.text as string : undefined;
    const queryMeta = firstQueryText ? safeTextMeta(firstQueryText) : { hasText: false, chars: 0 };
    console.warn("[KB-AGENT | search_scope] 参数校验失败:", {
      hasArgs: typeof args === "object" && args !== null,
      argKeys,
      queryCount,
      hasQuery: queryMeta.hasText,
      queryChars: queryMeta.chars,
      queryHash: queryMeta.hash,
      zodIssues,
    });
    return { success: false, error: `search_scope 参数无效：${parsed.error.message}`, warning: `参数校验失败：${parsed.error.message}` };
  }

  const inputArgs = parsed.data;
  const maxQueries = budget?.maxQueriesPerSearch ?? 3;
  const queries = inputArgs.queries.slice(0, maxQueries);
  const warnings: string[] = [];

  const excludeDocIds: string[] = inputArgs.excludeDocIds ?? [];
  if (inputArgs.excludeAlreadyRead && workspace) {
    const readDocIds = workspace.readDocuments.map((d) => d.docId);
    for (const id of readDocIds) {
      if (!excludeDocIds.includes(id)) {
        excludeDocIds.push(id);
      }
    }
  }

  let includeDocIds: string[] | undefined;
  if (inputArgs.includeDocIds && inputArgs.includeDocIds.length > 0 && workspace) {
    const knownDocIds = new Set<string>();
    for (const d of workspace.candidateDocs) knownDocIds.add(d.docId);
    for (const b of workspace.candidateBlocks) { if (b.docId) knownDocIds.add(b.docId); }
    for (const d of workspace.readDocuments) knownDocIds.add(d.docId);
    for (const b of workspace.readBlockContexts) { if (b.docId) knownDocIds.add(b.docId); }
    for (const o of workspace.docOutlines) knownDocIds.add(o.docId);
    for (const e of workspace.recentEvidence) knownDocIds.add(e.docId);
    if (scope.type === "doc_tree" && scope.rootDocId) knownDocIds.add(scope.rootDocId);

    const filtered: string[] = [];
    const unknown: string[] = [];
    for (const id of inputArgs.includeDocIds) {
      if (knownDocIds.has(id)) {
        filtered.push(id);
      } else {
        unknown.push(id);
      }
    }
    if (unknown.length > 0) {
      warnings.push(`includeDocIds：${unknown.length} 个未知文档 ID 被忽略`);
    }
    if (filtered.length > 0) {
      includeDocIds = filtered;
    } else {
      warnings.push("includeDocIds 过滤后为空集");
      return {
        success: true,
        data: { candidateDocs: [], candidateBlocks: [], searchedQueryMetas: [], warnings },
        warning: warnings.join("; "),
      };
    }
  }

  const settings = await getKbSettings();
  const defaultLimit = Number.isFinite(settings.firstPassMaxHits) ? settings.firstPassMaxHits : 50;
  const effectiveLimit = inputArgs.limit ?? defaultLimit;

  // 检查是否存在 activeFocusScope，如果存在则优先在聚焦范围内检索
  let focusApplied = false;
  let focusDocCount = 0;
  let effectiveIncludeDocIds: string[] | undefined = includeDocIds;

  if (workspace?.activeFocusScope && workspace.activeFocusScope.docIds.length > 0) {
    focusApplied = true;
    focusDocCount = workspace.activeFocusScope.docIds.length;
    effectiveIncludeDocIds = workspace.activeFocusScope.docIds;

    console.info("[KB-AGENT | SEARCH_SCOPE_FOCUS_APPLIED_SAFE]", {
      focusDocCount,
      queryCount: queries.length,
      scopeType: scope.type,
    });
  }

  const candidateBlocks: ReturnType<typeof mapSearchHitToCandidates>["block"][] = [];
  const allDocHits: AgenticDocHit[] = [];
  const searchedQueryMetas: Array<{ hasText: boolean; chars: number; hash?: string }> = [];
  
  let anyLexicalSearched = false;
  let totalLexicalHits = 0;

  for (const query of queries) {
    const queryText = query.text || query.keywordQuery || query.fuzzyQuery || "";
    if (!queryText.trim()) continue;

    searchedQueryMetas.push(safeTextMeta(queryText));

    const retrievalStrategy = buildRetrievalStrategy(query);

    try {
      const result = await searchBlocksForAgenticRag({
        scope,
        query: queryText,
        limit: effectiveLimit,
        excludeDocIds: excludeDocIds.length > 0 ? excludeDocIds : undefined,
        includeDocIds: effectiveIncludeDocIds,
        retrievalStrategy,
        trace: trace ?? false,
      });

      if (result.lexicalSearched) {
        anyLexicalSearched = true;
      }
      totalLexicalHits += result.lexicalHitCount ?? 0;

      for (const hit of result.hits) {
        const mapped = mapSearchHitToCandidates(hit, queryText);
        if (!candidateBlocks.some((b) => b.blockId === mapped.block.blockId)) {
          candidateBlocks.push(mapped.block);
        }
      }

      for (const docHit of result.docHits ?? []) {
        const existingIdx = allDocHits.findIndex((d) => d.docId === docHit.docId);
        if (existingIdx < 0) {
          allDocHits.push(docHit);
        } else {
          const existing = allDocHits[existingIdx];
          if ((docHit.score ?? 0) > (existing.score ?? 0)) {
            allDocHits[existingIdx] = docHit;
          }
        }
      }

      for (const w of result.warnings) {
        if (!warnings.includes(w)) {
          warnings.push(w);
        }
      }
    } catch (e) {
      console.warn("[KB-AGENT | search_scope] 查询搜索失败");
      warnings.push("某个查询搜索失败");
    }
  }

  const blockAggregatedDocs = aggregateCandidateDocsFromBlocks({
    blocks: candidateBlocks,
    defaultSource: "search_scope",
    defaultProvenance: "search_scope",
  });

  const firstQueryText = queries.length > 0
    ? (queries[0].text || queries[0].keywordQuery || queries[0].fuzzyQuery || "")
    : undefined;

  const docLevelDocs = allDocHits.map((dh) => mapDocHitToCandidateDoc(dh, firstQueryText));

  const candidateDocs = mergeDocLevelCandidates(blockAggregatedDocs, docLevelDocs);

  const lexicalSearched = anyLexicalSearched;
  const noHits = candidateDocs.length === 0 && candidateBlocks.length === 0;

  const docLevelCandidateCount = docLevelDocs.length;
  const blockLevelCandidateCount = candidateBlocks.length;

  pushAgentDebugEvent("SEARCH_SCOPE_RESULT_SAFE", {
    candidateDocCount: candidateDocs.length,
    candidateBlockCount: candidateBlocks.length,
    docLevelCandidateCount,
    blockLevelCandidateCount,
  }, "info");

  return {
    success: true,
    data: {
      candidateDocs,
      candidateBlocks,
      searchedQueryMetas,
      warnings,
      focusApplied,
      focusDocCount,
      lexicalSearched,
      lexicalHitCount: totalLexicalHits,
      candidateDocCount: candidateDocs.length,
      candidateBlockCount: candidateBlocks.length,
      docLevelCandidateCount,
      blockLevelCandidateCount,
      noHits,
    },
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "search_scope 失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const candidateDocs = (data?.candidateDocs as unknown[])?.length ?? 0;
  const candidateBlocks = (data?.candidateBlocks as unknown[])?.length ?? 0;
  const docLevelCandidateCount = (data?.docLevelCandidateCount as number) ?? 0;

  return {
    summary: `search_scope 找到 ${candidateDocs} 个文档候选，${candidateBlocks} 个块候选`,
    counts: { candidateDocs, candidateBlocks, docLevelCandidateCount },
    warning: result.warning,
  };
}

export function createSearchScopeTool(): AgentToolDefinition {
  return {
    name: "search_scope",
    description: "根据 AI Planner 提供的检索词进行精确关键词和模糊检索，生成候选，不读取正文。",
    readOnly: true,
    inputSchema: SearchScopeArgsSchema,
    outputSchema: z.object({
      candidateDocs: z.array(z.unknown()),
      candidateBlocks: z.array(z.unknown()),
      searchedQueryMetas: z.array(z.object({ hasText: z.boolean(), chars: z.number(), hash: z.string().optional() })),
      warnings: z.array(z.string()),
      focusApplied: z.boolean().optional(),
      focusDocCount: z.number().optional(),
      lexicalSearched: z.boolean().optional(),
      lexicalHitCount: z.number().optional(),
      candidateDocCount: z.number().optional(),
      candidateBlockCount: z.number().optional(),
      docLevelCandidateCount: z.number().optional(),
      blockLevelCandidateCount: z.number().optional(),
      noHits: z.boolean().optional(),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}
