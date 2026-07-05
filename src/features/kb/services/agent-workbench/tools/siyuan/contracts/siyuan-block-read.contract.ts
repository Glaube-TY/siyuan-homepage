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
}).strict().superRefine((value, ctx) => {
  const requireIdActions = new Set([
    "info",
    "dom",
    "dom_with_embed",
    "kramdown",
    "children",
    "tail_children",
    "breadcrumb",
    "index",
    "sibling",
    "relevant_ids",
    "check_exist",
  ]);
  const requireIdsActions = new Set(["doms", "kramdowns", "tree_infos"]);

  if (requireIdActions.has(value.action) && !value.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 id。`, path: ["id"] });
  }
  if (requireIdsActions.has(value.action) && (!value.ids || value.ids.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 ids。`, path: ["ids"] });
  }
  if (value.action === "word_count" && !value.id && (!value.ids || value.ids.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "word_count 需要 id 或 ids。", path: ["id"] });
  }
});

export type SiyuanBlockReadInput = z.infer<typeof siyuanBlockReadInputSchema>;
