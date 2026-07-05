import { z } from "zod";
import { maxCharsSchema } from "./siyuan-common.contract";

function requirePath(value: unknown, field: string, ctx: z.RefinementCtx) {
  if (typeof value !== "string" || value.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field} 不能为空。`,
      path: [field],
    });
  }
}

export const siyuanWorkspaceFileInputSchema = z.object({
  action: z.enum(["read_dir", "get_file", "put_file", "copy_file", "rename_file", "remove_file", "unique_filename"]),
  path: z.string().trim().max(1024).optional(),
  targetPath: z.string().trim().max(1024).optional(),
  isDir: z.boolean().optional(),
  content: z.string().max(100000).optional(),
  encoding: z.enum(["text", "base64"]).optional(),
  maxChars: maxCharsSchema,
}).strict().superRefine((value, ctx) => {
  switch (value.action) {
    case "read_dir":
    case "get_file":
    case "remove_file":
    case "unique_filename":
      requirePath(value.path, "path", ctx);
      break;
    case "put_file":
      requirePath(value.path, "path", ctx);
      break;
    case "copy_file":
    case "rename_file":
      requirePath(value.path, "path", ctx);
      requirePath(value.targetPath, "targetPath", ctx);
      break;
  }
});

export type SiyuanWorkspaceFileInput = z.infer<typeof siyuanWorkspaceFileInputSchema>;
