import { z } from "zod";
import { maxCharsSchema, maxItemsSchema } from "./siyuan-common.contract";

export const siyuanSearchExtraInputSchema = z.object({
  action: z.enum([
    "search_tag",
    "search_template",
    "search_widget",
    "search_embed_block",
    "get_embed_block",
    "search_asset",
    "asset_content",
    "invalid_block_refs",
  ]),
  keyword: z.string().trim().max(200).optional(),
  id: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  page: z.number().int().min(0).max(1000).optional(),
  maxItems: maxItemsSchema,
  maxChars: maxCharsSchema,
}).strict();

export type SiyuanSearchExtraInput = z.infer<typeof siyuanSearchExtraInputSchema>;
