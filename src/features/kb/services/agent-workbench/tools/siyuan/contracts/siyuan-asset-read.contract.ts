import { z } from "zod";
import { maxCharsSchema, maxItemsSchema } from "./siyuan-common.contract";
import { isPdfAnnotationAssetPath } from "./siyuan-asset-manage.contract";

export const siyuanAssetReadInputSchema = z.object({
  action: z.enum([
    "resolve_path",
    "doc_assets",
    "doc_image_assets",
    "unused_assets",
    "missing_assets",
    "file_annotation",
    "image_ocr",
    "stat",
    "asset_content",
  ]),
  path: z.string().trim().max(1024).optional(),
  docId: z.string().trim().min(1).max(256).optional(),
  maxItems: maxItemsSchema,
  maxChars: maxCharsSchema,
}).strict().superRefine((value, ctx) => {
  if (["resolve_path", "file_annotation", "image_ocr", "stat", "asset_content"].includes(value.action) && !value.path) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要真实资源路径 path。`, path: ["path"] });
  }
  if (value.action === "file_annotation" && typeof value.path === "string" && value.path.trim().length > 0 && !isPdfAnnotationAssetPath(value.path)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "file_annotation 只支持 PDF 资源或对应的 .pdf.sya 标注文件。", path: ["path"] });
  }
  if (["doc_assets", "doc_image_assets"].includes(value.action) && !value.docId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要文档 ID docId。`, path: ["docId"] });
  }
});

export type SiyuanAssetReadInput = z.infer<typeof siyuanAssetReadInputSchema>;
