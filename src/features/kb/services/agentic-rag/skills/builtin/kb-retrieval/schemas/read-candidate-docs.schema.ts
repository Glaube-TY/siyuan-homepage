import { z } from "zod";

/**
 * 宽松文档引用输入。sourceType 不做硬校验，有 docId/blockId 即可读取。
 */
export const looseDocRefInputSchema = z.object({
  docId: z.string().trim().min(1).max(256).optional(),
  blockId: z.string().trim().min(1).max(256).optional(),
  sourceType: z.string().optional(),
  title: z.string().optional(),
}).passthrough().refine(
  (v) => !!v.docId || !!v.blockId,
  { message: "docId 或 blockId 至少提供一个。" },
);

export type LooseDocRefInput = z.infer<typeof looseDocRefInputSchema>;

/**
 * read_candidate_docs 输入 schema。
 * 主推荐：docIds / blockIds。docs 是可选的宽松结构化形式。
 */
export const readCandidateDocsInputSchema = z.object({
  docs: z.array(looseDocRefInputSchema).min(1).max(20).optional(),
  docIds: z.array(z.string().trim().min(1).max(256)).min(1).max(20).optional(),
  blockIds: z.array(z.string().trim().min(1).max(256)).min(1).max(20).optional(),
  readMode: z.enum(["default", "full", "range", "next"]).optional().default("default"),
  cursor: z.string().trim().min(1).max(240).optional(),
  startOffset: z.number().int().min(0).optional(),
  maxCharsPerDoc: z.number().int().min(2000).max(100000).optional(),
}).strict().refine(
  (value) => {
    const hasResourceInput =
      (value.docs?.length ?? 0) > 0 ||
      (value.docIds?.length ?? 0) > 0 ||
      (value.blockIds?.length ?? 0) > 0;
    const isNextMode = value.readMode === "next" && !!value.cursor;
    return isNextMode || hasResourceInput;
  },
  { message: "需要提供 docs/docIds/blockIds 之一，或使用 next 模式 + cursor。" },
);

export type ReadCandidateDocsInput = z.infer<typeof readCandidateDocsInputSchema>;

export const plannerVisibleReadItemSchema = z.object({
  docId: z.string(),
  blockId: z.string().optional(),
  title: z.string(),
  content: z.string().optional(),
  snippet: z.string(),
  referenceIndex: z.number().int().min(1),
  truncated: z.boolean().optional(),
  originalContentChars: z.number().int().min(0).optional(),
  returnedContentChars: z.number().int().min(0).optional(),
  nextCursor: z.string().optional(),
  remainingChars: z.number().int().min(0).optional(),
  startOffset: z.number().int().min(0).optional(),
}).strict();

export type PlannerVisibleReadItem = z.infer<
  typeof plannerVisibleReadItemSchema
>;

export const readCandidateDocsErrorSchema = z.object({
  docId: z.string().optional(),
  blockId: z.string().optional(),
  cursor: z.string().optional(),
  code: z.enum([
    "resource_not_found",
    "empty_content",
    "container_without_content",
    "invalid_resource_id",
    "resource_mismatch",
    "wrong_source_type",
    "permission_denied",
    "tool_internal_error",
  ]),
  message: z.string(),
  hint: z.string(),
}).strict();

export type ReadCandidateDocsError = z.infer<typeof readCandidateDocsErrorSchema>;

export const readCandidateDocsOutputSchema = z.object({
  items: z.array(plannerVisibleReadItemSchema),
  readItems: z.array(plannerVisibleReadItemSchema).optional(),
  contentItems: z.array(plannerVisibleReadItemSchema).optional(),
  errors: z.array(readCandidateDocsErrorSchema).optional(),
  readItemCount: z.number().int().min(0).optional(),
  contentItemCount: z.number().int().min(0).optional(),
  readDocCount: z.number().int().min(0),
  requestedDocIdCount: z.number().int().min(0).optional(),
  requestedBlockIdCount: z.number().int().min(0).optional(),
  validDocIdCount: z.number().int().min(0).optional(),
  resolvedDocCount: z.number().int().min(0).optional(),
  resolvedBlockCount: z.number().int().min(0).optional(),
  resourceMismatchCount: z.number().int().min(0).optional(),
  emptyContentCount: z.number().int().min(0).optional(),
  containerCount: z.number().int().min(0).optional(),
  failedResourceCount: z.number().int().min(0).optional(),
  truncated: z.boolean(),
  readMode: z.enum(["default", "full", "range", "next"]).optional(),
}).strict();

export type ReadCandidateDocsOutput = z.infer<
  typeof readCandidateDocsOutputSchema
>;
