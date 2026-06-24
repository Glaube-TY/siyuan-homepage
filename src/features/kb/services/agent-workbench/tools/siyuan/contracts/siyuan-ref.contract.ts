import { z } from "zod";
import { maxItemsSchema } from "./siyuan-common.contract";

export const siyuanRefInputSchema = z.object({
  action: z.enum(["backlink", "backlink_doc", "backmention_doc", "search_ref_block", "refresh_backlink"]),
  id: z.string().trim().min(1).max(256).optional(),
  docId: z.string().trim().min(1).max(256).optional(),
  keyword: z.string().trim().max(200).optional(),
  beforeLen: z.number().int().min(0).max(2000).optional(),
  containChildren: z.boolean().optional(),
  maxItems: maxItemsSchema,
}).strict();

export type SiyuanRefInput = z.infer<typeof siyuanRefInputSchema>;
