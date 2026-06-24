import { z } from "zod";

export const siyuanDocTransformInputSchema = z.object({
  action: z.enum(["doc_to_heading", "heading_to_doc", "list_item_to_doc"]),
  id: z.string().trim().min(1).max(256).optional(),
  notebook: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  targetPath: z.string().trim().max(1024).optional(),
}).strict();

export type SiyuanDocTransformInput = z.infer<typeof siyuanDocTransformInputSchema>;
