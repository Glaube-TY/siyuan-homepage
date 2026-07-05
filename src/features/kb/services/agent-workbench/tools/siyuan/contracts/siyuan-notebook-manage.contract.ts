import { z } from "zod";

export const siyuanNotebookManageInputSchema = z.object({
  action: z.enum(["list", "create", "open", "close", "rename", "get_conf", "set_conf", "set_icon", "remove"]),
  notebook: z.string().trim().min(1).max(256).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  icon: z.string().trim().max(100).optional(),
  conf: z.unknown().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "create" && !value.name) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "create 需要 name。", path: ["name"] });
  }
  if (["open", "close", "remove", "get_conf", "set_conf", "set_icon", "rename"].includes(value.action) && !value.notebook) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 notebook。`, path: ["notebook"] });
  }
  if (value.action === "rename" && !value.name) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rename 需要 notebook 和 name。", path: ["name"] });
  }
  if (value.action === "set_icon" && !value.icon) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_icon 需要 notebook 和 icon。", path: ["icon"] });
  }
  if (value.action === "set_conf" && value.conf === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_conf 需要 notebook 和 conf。", path: ["conf"] });
  }
});

export type SiyuanNotebookManageInput = z.infer<typeof siyuanNotebookManageInputSchema>;
