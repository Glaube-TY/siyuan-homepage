import { z } from "zod";
import { warningsSchema } from "./attribute-view-common.contract";

export const listAttributeViewsInputSchema = z.object({
  keyword: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
}).strict();

export type ListAttributeViewsInput = z.infer<typeof listAttributeViewsInputSchema>;

export const listAttributeViewsOutputSchema = z.object({
  items: z.array(z.object({
    databaseId: z.string(),
    name: z.string(),
    blockId: z.string().optional(),
    hPath: z.string().optional(),
    viewIds: z.array(z.string()).optional(),
    viewCount: z.number().int().min(0).optional(),
    source: z.string(),
    candidateOnly: z.boolean(),
    usableForRead: z.boolean(),
    idSource: z.string().optional(),
  }).strict()),
  count: z.number().int().min(0),
  truncated: z.boolean(),
  warnings: warningsSchema,
}).strict();

export type ListAttributeViewsOutput = z.infer<typeof listAttributeViewsOutputSchema>;
