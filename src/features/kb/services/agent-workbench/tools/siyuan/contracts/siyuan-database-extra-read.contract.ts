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
  itemIDs: stringArraySchema.optional(),
  boundIDs: stringArraySchema.optional(),
  maxItems: maxItemsSchema,
}).strict();

export type SiyuanDatabaseExtraReadInput = z.infer<typeof siyuanDatabaseExtraReadInputSchema>;
