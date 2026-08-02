import { z } from "zod";

export const siyuanTagManageInputSchema = z.object({
  action: z.enum(["list", "search", "rename", "remove"]),
  keyword: z.string().trim().max(200).optional(),
  oldLabel: z.string().trim().min(1).max(200).optional(),
  newLabel: z.string().trim().min(1).max(200).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  sort: z.number().int().min(0).max(10).optional(),
  ignoreMaxListHint: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "rename") {
    if (!value.oldLabel) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rename 需要旧标签名 oldLabel。", path: ["oldLabel"] });
    }
    if (!value.newLabel) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rename 需要新标签名 newLabel。", path: ["newLabel"] });
    }
  }
  if (value.action === "remove" && !value.label) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "remove 需要标签名 label。", path: ["label"] });
  }
});

export type SiyuanTagManageInput = z.infer<typeof siyuanTagManageInputSchema>;
