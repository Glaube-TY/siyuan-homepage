import { z } from "zod";

export const siyuanBookmarkManageInputSchema = z.object({
  action: z.enum(["list", "list_blocks", "rename", "remove"]),
  oldLabel: z.string().trim().min(1).max(200).optional(),
  newLabel: z.string().trim().min(1).max(200).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  keyword: z.string().trim().max(200).optional(),
  maxItems: z.number().int().min(1).max(200).optional(),
  maxChars: z.number().int().min(200).max(50000).optional(),
}).strict();

export type SiyuanBookmarkManageInput = z.infer<typeof siyuanBookmarkManageInputSchema>;
