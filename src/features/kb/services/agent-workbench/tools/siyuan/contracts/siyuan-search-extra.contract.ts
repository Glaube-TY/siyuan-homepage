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
}).strict().superRefine((value, ctx) => {
  if (value.action === "get_embed_block" && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: "extra_search.get_embed_block 必须提供真实 id。",
      path: ["id"],
    });
  }
  if (value.action === "asset_content" && !value.path && !value.keyword) {
    ctx.addIssue({
      code: "custom",
      message: "extra_search.asset_content 需要 path 或 keyword；优先使用 search_asset 返回的真实 path。",
      path: ["path"],
    });
  }
  if (value.action === "search_embed_block" && !value.keyword && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: "extra_search.search_embed_block 建议至少提供 keyword 或 id，避免无范围空查。",
      path: ["keyword"],
    });
  }
});

export type SiyuanSearchExtraInput = z.infer<typeof siyuanSearchExtraInputSchema>;
