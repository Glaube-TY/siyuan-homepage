import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

export const siyuanBlockRefInputSchema = z.object({
  action: z.enum(["get_ref_ids", "get_ref_text", "get_def_ids_by_ref_text", "check_ref", "swap_ref", "transfer_ref"]),
  id: z.string().trim().min(1).max(256).optional(),
  refText: z.string().trim().min(1).max(500).optional(),
  fromID: z.string().trim().min(1).max(256).optional(),
  toID: z.string().trim().min(1).max(256).optional(),
  refIDs: stringArraySchema.max(50).optional(),
}).strict().superRefine((value, ctx) => {
  if (["get_ref_ids", "get_ref_text", "check_ref", "swap_ref"].includes(value.action) && !value.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 id。`, path: ["id"] });
  }
  if (value.action === "get_def_ids_by_ref_text" && !value.refText) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "get_def_ids_by_ref_text 需要 refText。", path: ["refText"] });
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
