import { z } from "zod";

export const listRecentReferencesInputSchema = z.object({}).strict().default({});

export type ListRecentReferencesInput = z.infer<
  typeof listRecentReferencesInputSchema
>;

export const plannerVisibleRecentReferenceSchema = z.object({
  docId: z.string(),
  /** 块 ID（具体片段引用时可选，须与 docId 同时出现） */
  blockId: z.string().optional(),
  title: z.string(),
  sourceType: z.string().optional(),
  preview: z.string().optional(),
  usedCount: z.number().int().min(0).optional(),
  /** 最近出现时间（epoch ms） */
  lastSeenAt: z.number().optional(),
  /** 距当前轮的间隔轮数（0=最近一轮） */
  turnAge: z.number().int().min(0).optional(),
  /** 来源标记 */
  source: z.string().optional(),
  /** 最近已知状态：正常 / not_found / permission_denied / mismatch */
  lastKnownStatus: z.enum(["available", "not_found", "permission_denied", "mismatch"]).optional(),
}).strict();

export type PlannerVisibleRecentReference = z.infer<
  typeof plannerVisibleRecentReferenceSchema
>;

export const listRecentReferencesOutputSchema = z.object({
  references: z.array(plannerVisibleRecentReferenceSchema),
  referenceCount: z.number().int().min(0),
  returnedReferenceCount: z.number().int().min(0),
  totalTurnsAvailable: z.number().int().min(0),
  truncated: z.boolean(),
}).strict();

export type ListRecentReferencesOutput = z.infer<
  typeof listRecentReferencesOutputSchema
>;
