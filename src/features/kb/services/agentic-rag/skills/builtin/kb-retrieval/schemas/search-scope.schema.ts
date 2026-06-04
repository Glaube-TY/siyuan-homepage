import { z } from "zod";

export const searchScopeInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional().default(20),
}).strict();

export type SearchScopeInput = z.infer<typeof searchScopeInputSchema>;

/**
 * 搜索候选：直接返回 docId + 标题 + 预览，不再使用 opaque identifier。
 */
export const plannerVisibleSearchCandidateSchema = z.object({
  /** 思源文档 ID（主线标识） */
  docId: z.string(),
  /** 思源块 ID（可选） */
  blockId: z.string().optional(),
  /** 资源类型 */
  sourceType: z.literal("siyuan_doc").default("siyuan_doc"),
  title: z.string(),
  preview: z.string().optional(),
  rank: z.number().int().min(1),
  score: z.number().optional(),
  hitType: z.enum(["titleHit", "contentHit", "structureHit"]).optional(),
  canReadContent: z.enum(["true", "false", "unknown"]).optional(),
  notebookId: z.string().optional(),
  hpath: z.string().optional(),
  tags: z.string().optional(),
  matchReason: z.enum(["title", "content", "tag", "hpath", "backlink", "fts", "hybrid"]).optional(),
  matchedFields: z.array(z.string()).optional(),
  queryTerms: z.array(z.string()).optional(),
  exactTitleMatch: z.boolean().optional(),
}).strict();

export type PlannerVisibleSearchCandidate = z.infer<
  typeof plannerVisibleSearchCandidateSchema
>;

export const searchScopeOutputSchema = z.object({
  candidates: z.array(plannerVisibleSearchCandidateSchema),
  hitCount: z.number().int().min(0),
  candidateDocCount: z.number().int().min(0),
  returnedCandidateCount: z.number().int().min(0),
  truncated: z.boolean(),
  /** 摘要说明，如"这是标题/结构候选，不代表正文命中" */
  summary: z.string().optional(),
}).strict();

export type SearchScopeOutput = z.infer<typeof searchScopeOutputSchema>;
