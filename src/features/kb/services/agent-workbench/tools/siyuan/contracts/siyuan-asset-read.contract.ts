import { z } from "zod";
import { maxCharsSchema, maxItemsSchema } from "./siyuan-common.contract";

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
}).strict();

export type SiyuanAssetReadInput = z.infer<typeof siyuanAssetReadInputSchema>;
