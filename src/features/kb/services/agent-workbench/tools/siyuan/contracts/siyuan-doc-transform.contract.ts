import { z } from "zod";

export const siyuanDocTransformInputSchema = z.object({
  action: z.enum(["doc_to_heading", "heading_to_doc", "list_item_to_doc"]),
  sourceDocId: z.string().trim().min(1).max(256).optional(),
  targetBlockId: z.string().trim().min(1).max(256).optional(),
  after: z.boolean().optional(),
  sourceHeadingId: z.string().trim().min(1).max(256).optional(),
  sourceListItemId: z.string().trim().min(1).max(256).optional(),
  targetNotebookId: z.string().trim().min(1).max(256).optional(),
  targetPath: z.string().trim().max(1024).optional(),
  previousPath: z.string().trim().max(1024).optional(),
  toTop: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "doc_to_heading") {
    if (!value.sourceDocId) {
      ctx.addIssue({ code: "custom", message: "doc_to_heading 需要源文档 ID sourceDocId。", path: ["sourceDocId"] });
    }
    if (!value.targetBlockId) {
      ctx.addIssue({ code: "custom", message: "doc_to_heading 需要目标块 ID targetBlockId。", path: ["targetBlockId"] });
    }
    if (value.after === undefined) {
      ctx.addIssue({ code: "custom", message: "doc_to_heading 需要 after，明确插入目标块之前或之后。", path: ["after"] });
    }
  }
  if (value.action === "heading_to_doc") {
    if (!value.sourceHeadingId) {
      ctx.addIssue({ code: "custom", message: "heading_to_doc 需要标题块 ID sourceHeadingId。", path: ["sourceHeadingId"] });
    }
    if (!value.targetNotebookId) {
      ctx.addIssue({ code: "custom", message: "heading_to_doc 需要目标笔记本 ID targetNotebookId。", path: ["targetNotebookId"] });
    }
    if (!value.targetPath) {
      ctx.addIssue({ code: "custom", message: "heading_to_doc 需要目标存储路径 targetPath；笔记本根目录使用 /。", path: ["targetPath"] });
    }
  }
  if (value.action === "list_item_to_doc") {
    if (!value.sourceListItemId) {
      ctx.addIssue({ code: "custom", message: "list_item_to_doc 需要列表项块 ID sourceListItemId。", path: ["sourceListItemId"] });
    }
    if (!value.targetNotebookId) {
      ctx.addIssue({ code: "custom", message: "list_item_to_doc 需要目标笔记本 ID targetNotebookId。", path: ["targetNotebookId"] });
    }
    if (!value.targetPath) {
      ctx.addIssue({ code: "custom", message: "list_item_to_doc 需要目标存储路径 targetPath；笔记本根目录使用 /。", path: ["targetPath"] });
    }
  }
});

export type SiyuanDocTransformInput = z.infer<typeof siyuanDocTransformInputSchema>;
