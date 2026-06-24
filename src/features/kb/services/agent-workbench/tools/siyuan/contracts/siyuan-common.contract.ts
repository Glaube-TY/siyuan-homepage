import { z } from "zod";

export const siyuanToolOutputSchema = z.object({
  action: z.string(),
  data: z.unknown().nullable(),
  truncated: z.boolean().optional(),
  hasMore: z.boolean().optional(),
  nextCursor: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type SiyuanToolOutput = z.infer<typeof siyuanToolOutputSchema>;

export const maxItemsSchema = z.number().int().min(1).max(500).optional();
export const maxCharsSchema = z.number().int().min(100).max(100000).optional();
export const stringArraySchema = z.array(z.string().trim().min(1).max(256)).max(100);
export const attrsSchema = z.record(z.string().min(1).max(128), z.string().max(20000));
