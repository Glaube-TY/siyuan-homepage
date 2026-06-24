import { z } from "zod";
import { maxCharsSchema, maxItemsSchema, stringArraySchema } from "./siyuan-common.contract";

export const siyuanBlockReadInputSchema = z.object({
  action: z.enum([
    "info",
    "dom",
    "doms",
    "dom_with_embed",
    "kramdown",
    "kramdowns",
    "children",
    "tail_children",
    "breadcrumb",
    "index",
    "sibling",
    "relevant_ids",
    "tree_infos",
    "word_count",
    "check_exist",
    "recent_updated",
  ]),
  id: z.string().trim().min(1).max(256).optional(),
  ids: stringArraySchema.optional(),
  maxItems: maxItemsSchema,
  maxChars: maxCharsSchema,
}).strict();

export type SiyuanBlockReadInput = z.infer<typeof siyuanBlockReadInputSchema>;
