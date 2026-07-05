import { z } from "zod";

export const siyuanDocPathInputSchema = z.object({
  action: z.enum(["hpath_by_path", "hpaths_by_paths", "hpath_by_id", "path_by_id", "full_hpath_by_id", "ids_by_hpath"]),
  notebook: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  paths: z.array(z.string().trim().min(1).max(1024)).max(100).optional(),
  id: z.string().trim().min(1).max(256).optional(),
  hpath: z.string().trim().max(1024).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "hpath_by_path") {
    if (!value.notebook) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "hpath_by_path 需要 notebook。", path: ["notebook"] });
    }
    if (!value.path) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "hpath_by_path 需要 path。", path: ["path"] });
    }
  }
  if (value.action === "hpaths_by_paths") {
    if (!value.notebook) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "hpaths_by_paths 需要 notebook。", path: ["notebook"] });
    }
    if (!value.paths || value.paths.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "hpaths_by_paths 需要 paths。", path: ["paths"] });
    }
  }
  if (["hpath_by_id", "path_by_id", "full_hpath_by_id"].includes(value.action) && !value.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 id。`, path: ["id"] });
  }
  if (value.action === "ids_by_hpath") {
    if (!value.notebook) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ids_by_hpath 需要 notebook。", path: ["notebook"] });
    }
    if (!value.hpath) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ids_by_hpath 需要 hpath。", path: ["hpath"] });
    }
  }
});

export type SiyuanDocPathInput = z.infer<typeof siyuanDocPathInputSchema>;
