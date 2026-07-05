import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

export const siyuanDocTreeInputSchema = z.object({
  action: z.enum(["list_children", "list_tree", "move", "move_by_id", "duplicate", "sort"]),
  notebook: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  fromPaths: z.array(z.string().trim().min(1).max(1024)).max(50).optional(),
  toNotebook: z.string().trim().min(1).max(256).optional(),
  toPath: z.string().trim().max(1024).optional(),
  id: z.string().trim().min(1).max(256).optional(),
  ids: stringArraySchema.max(50).optional(),
  targetID: z.string().trim().min(1).max(256).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.action === "list_children" || value.action === "list_tree") && !value.notebook) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 notebook。`, path: ["notebook"] });
  }
  if (value.action === "move") {
    if (!value.fromPaths || value.fromPaths.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move 需要 fromPaths。", path: ["fromPaths"] });
    }
    if (!value.toNotebook) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move 需要 toNotebook。", path: ["toNotebook"] });
    }
    if (!value.toPath) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move 需要 toPath。", path: ["toPath"] });
    }
  }
  if (value.action === "move_by_id") {
    if (!value.ids || value.ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move_by_id 需要 ids。", path: ["ids"] });
    }
    if (!value.targetID) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move_by_id 需要 targetID。", path: ["targetID"] });
    }
  }
  if (value.action === "duplicate") {
    if ((!value.id && (!value.ids || value.ids.length === 0)) || !value.notebook || !value.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate 需要 id（或 ids[0]）+ notebook + path。",
        path: ["id"],
      });
    }
  }
  if (value.action === "sort") {
    if (!value.notebook) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sort 需要 notebook。", path: ["notebook"] });
    }
    if ((!value.ids || value.ids.length === 0) && (!value.fromPaths || value.fromPaths.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sort 需要 ids 或 fromPaths。", path: ["ids"] });
    }
    if (!value.targetID) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sort 需要 targetID。", path: ["targetID"] });
    }
  }
});

export type SiyuanDocTreeInput = z.infer<typeof siyuanDocTreeInputSchema>;
