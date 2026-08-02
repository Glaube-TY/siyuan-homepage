import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

export const siyuanBlockRefInputSchema = z.object({
  action: z.enum(["get_ref_ids", "get_ref_text", "get_def_ids_by_ref_text", "check_ref", "swap_ref", "transfer_ref"]),
  id: z.string().trim().min(1).max(256).optional(),
  anchor: z.string().trim().min(1).max(500).optional(),
  ids: stringArraySchema.max(50).optional(),
  refID: z.string().trim().min(1).max(256).optional(),
  defID: z.string().trim().min(1).max(256).optional(),
  includeChildren: z.boolean().optional(),
  fromID: z.string().trim().min(1).max(256).optional(),
  toID: z.string().trim().min(1).max(256).optional(),
  refIDs: stringArraySchema.max(50).optional(),
}).strict().superRefine((value, ctx) => {
  if (["get_ref_ids", "get_ref_text"].includes(value.action) && !value.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 id。`, path: ["id"] });
  }
  if (value.action === "get_def_ids_by_ref_text" && !value.anchor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "get_def_ids_by_ref_text 需要 anchor（引用锚文本）。", path: ["anchor"] });
  }
  if (value.action === "check_ref" && (!value.ids || value.ids.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "check_ref 需要 ids（待检查的块 ID 数组）。", path: ["ids"] });
  }
  if (value.action === "swap_ref") {
    if (!value.refID) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "swap_ref 需要 refID（引用所在块 ID）。", path: ["refID"] });
    if (!value.defID) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "swap_ref 需要 defID（新的定义块 ID）。", path: ["defID"] });
    if (value.includeChildren === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "swap_ref 需要 includeChildren。", path: ["includeChildren"] });
  }
  if (value.action === "transfer_ref") {
    if (!value.fromID) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "transfer_ref 需要 fromID。", path: ["fromID"] });
    }
    if (!value.toID) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "transfer_ref 需要 toID。", path: ["toID"] });
    }
    if (!value.refIDs || value.refIDs.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "transfer_ref 需要 refIDs。", path: ["refIDs"] });
    }
  }
});

export type SiyuanBlockRefInput = z.infer<typeof siyuanBlockRefInputSchema>;
