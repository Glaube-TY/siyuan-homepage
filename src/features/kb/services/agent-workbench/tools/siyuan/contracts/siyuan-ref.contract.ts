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
}).strict().superRefine((value, ctx) => {
  if (value.action === "refresh_backlink") return;
  if (value.action === "backlink" && !value.id && !value.docId) {
    ctx.addIssue({
      code: "custom",
      message: "refs.backlink 需要 id 或 docId；id 可以是真实 blockId 或 docId。",
      path: ["id"],
    });
  }
  if ((value.action === "backlink_doc" || value.action === "backmention_doc") && !value.docId && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: "refs.backlink_doc/backmention_doc 需要 docId 或 id，建议优先使用真实 docId。",
      path: ["docId"],
    });
  }
  if (value.action === "search_ref_block" && !value.keyword && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: "refs.search_ref_block 需要 keyword 或 id，避免无关键词且无范围的空查。",
      path: ["keyword"],
    });
  }
});

export type SiyuanRefInput = z.infer<typeof siyuanRefInputSchema>;
