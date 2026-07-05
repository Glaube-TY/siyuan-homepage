import { z } from "zod";
import { attrsSchema, stringArraySchema } from "./siyuan-common.contract";

export const siyuanBlockAttrInputSchema = z.object({
  action: z.enum(["get", "batch_get", "set", "batch_set"]),
  id: z.string().trim().min(1).max(256).optional(),
  ids: stringArraySchema.max(20).optional(),
  attrs: attrsSchema.optional(),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(256),
    attrs: attrsSchema,
  }).strict()).max(20).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "get" && !value.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "get 需要 id。", path: ["id"] });
  }
  if (value.action === "batch_get" && (!value.ids || value.ids.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "batch_get 需要 ids。", path: ["ids"] });
  }
  if (value.action === "set") {
    if (!value.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set 需要 id。", path: ["id"] });
    }
    if (!value.attrs || Object.keys(value.attrs).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set 需要非空 attrs。", path: ["attrs"] });
    }
  }
  if (value.action === "batch_set" && (!value.items || value.items.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "batch_set 需要非空 items。", path: ["items"] });
  }
});

export type SiyuanBlockAttrInput = z.infer<typeof siyuanBlockAttrInputSchema>;
