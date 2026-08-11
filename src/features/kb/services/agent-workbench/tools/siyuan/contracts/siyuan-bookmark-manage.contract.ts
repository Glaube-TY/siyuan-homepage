import { z } from "zod";

export const siyuanBookmarkManageInputSchema = z.object({
  action: z.enum(["list", "list_blocks", "rename", "remove"]),
  oldBookmark: z.string().trim().min(1).max(200).optional(),
  newBookmark: z.string().trim().min(1).max(200).optional(),
  bookmark: z.string().trim().min(1).max(200).optional(),
  keyword: z.string().trim().max(200).optional(),
  maxItems: z.number().int().min(1).max(200).optional(),
  maxChars: z.number().int().min(200).max(50000).optional(),
  /** rename/remove 操作的 block ID 列表。rename/remove 必须提供真实 blockIds，通过 setBlockAttrs 按块操作；不再调用全局 renameBookmark/removeBookmark。 */
  blockIds: z.array(z.string().trim().min(1).max(256)).min(1).max(50).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "rename") {
    const hasOld = Boolean(value.oldBookmark);
    const hasNew = Boolean(value.newBookmark);
    if (!hasOld || !hasNew) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rename 需要 oldBookmark/newBookmark + blockIds。",
        path: ["oldBookmark"],
      });
    }
    if (!value.blockIds || value.blockIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rename 必须提供 blockIds；请先调用 list_blocks 定位真实块 ID。",
        path: ["blockIds"],
      });
    }
  }

  if (value.action === "remove") {
    const hasBookmark = Boolean(value.bookmark);
    if (!hasBookmark) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "remove 需要 bookmark + blockIds。",
        path: ["bookmark"],
      });
    }
    if (!value.blockIds || value.blockIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "remove 必须提供 blockIds；请先调用 list_blocks 定位真实块 ID。",
        path: ["blockIds"],
      });
    }
  }
});

export type SiyuanBookmarkManageInput = z.infer<typeof siyuanBookmarkManageInputSchema>;
