import { z } from "zod";
import { maxItemsSchema, stringArraySchema } from "./siyuan-common.contract";

export const siyuanDatabaseExtraReadInputSchema = z.object({
  action: z.enum([
    "filter_sort",
    "primary_key_values",
    "mirror_blocks",
    "keys_by_av_id",
    "keys_by_block_id",
    "bound_ids_by_item_ids",
    "item_ids_by_bound_ids",
    "current_images",
    "unused_attribute_views",
  ]),
  avID: z.string().trim().min(1).max(256).optional(),
  blockID: z.string().trim().min(1).max(256).optional(),
  viewID: z.string().trim().min(1).max(256).optional(),
  keyword: z.string().trim().max(200).optional(),
  query: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).max(1000).optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
  itemIDs: stringArraySchema.optional(),
  boundIDs: stringArraySchema.optional(),
  maxItems: maxItemsSchema,
}).strict().superRefine((value, ctx) => {
  if (["filter_sort", "primary_key_values", "mirror_blocks", "keys_by_av_id", "bound_ids_by_item_ids", "item_ids_by_bound_ids", "current_images"].includes(value.action) && !value.avID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要数据库 ID avID。`, path: ["avID"] });
  }
  if (value.action === "keys_by_block_id" && !value.blockID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "keys_by_block_id 需要数据库块 ID blockID。", path: ["blockID"] });
  }
  if (value.action === "filter_sort" && !value.blockID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "filter_sort 需要数据库块 ID blockID，不能用 viewID 代替。", path: ["blockID"] });
  }
  if (value.action === "bound_ids_by_item_ids" && (!value.itemIDs || value.itemIDs.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bound_ids_by_item_ids 需要数据库条目 ID 数组 itemIDs。", path: ["itemIDs"] });
  }
  if (value.action === "item_ids_by_bound_ids" && (!value.boundIDs || value.boundIDs.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "item_ids_by_bound_ids 需要绑定块 ID 数组 boundIDs。", path: ["boundIDs"] });
  }
});

export type SiyuanDatabaseExtraReadInput = z.infer<typeof siyuanDatabaseExtraReadInputSchema>;
