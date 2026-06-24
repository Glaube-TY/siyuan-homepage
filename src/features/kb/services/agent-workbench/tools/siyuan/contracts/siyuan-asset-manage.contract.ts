import { z } from "zod";

export const siyuanAssetManageInputSchema = z.object({
  action: z.enum(["rename", "set_annotation", "set_image_ocr", "ocr", "remove_unused_one", "remove_unused_batch", "full_reindex_content"]),
  path: z.string().trim().max(1024).optional(),
  paths: z.array(z.string().trim().min(1).max(1024)).max(20).optional(),
  newName: z.string().trim().min(1).max(255).optional(),
  annotation: z.string().max(20000).optional(),
  text: z.string().max(20000).optional(),
}).strict();

export type SiyuanAssetManageInput = z.infer<typeof siyuanAssetManageInputSchema>;
