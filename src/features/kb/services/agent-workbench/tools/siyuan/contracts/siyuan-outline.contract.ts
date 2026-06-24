import { z } from "zod";
import { maxItemsSchema } from "./siyuan-common.contract";

export const siyuanOutlineInputSchema = z.object({
  docId: z.string().trim().min(1).max(256),
  maxDepth: z.number().int().min(1).max(20).optional(),
  maxItems: maxItemsSchema,
}).strict();

export type SiyuanOutlineInput = z.infer<typeof siyuanOutlineInputSchema>;
