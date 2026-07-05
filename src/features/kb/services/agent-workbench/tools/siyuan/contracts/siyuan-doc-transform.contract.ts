import { z } from "zod";

export const siyuanDocTransformInputSchema = z.object({
  action: z.enum(["doc_to_heading", "heading_to_doc", "list_item_to_doc"]),
  id: z.string().trim().min(1).max(256).optional(),
  notebook: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  targetPath: z.string().trim().max(1024).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "doc_to_heading" && !value.path) {
    ctx.addIssue({
      code: "custom",
      message: "doc_to_heading 需要 path。",
      path: ["path"],
    });
  }
  if (value.action === "heading_to_doc" && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: "heading_to_doc 需要 id。",
      path: ["id"],
    });
  }
  if (value.action === "list_item_to_doc" && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: "list_item_to_doc 需要 id。",
      path: ["id"],
    });
  }
});

export type SiyuanDocTransformInput = z.infer<typeof siyuanDocTransformInputSchema>;
