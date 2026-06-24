import { z } from "zod";

export const siyuanTagManageInputSchema = z.object({
  action: z.enum(["list", "search", "rename", "remove"]),
  keyword: z.string().trim().max(200).optional(),
  oldLabel: z.string().trim().min(1).max(200).optional(),
  newLabel: z.string().trim().min(1).max(200).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  sort: z.number().int().min(0).max(10).optional(),
  ignoreMaxListHint: z.boolean().optional(),
}).strict();

export type SiyuanTagManageInput = z.infer<typeof siyuanTagManageInputSchema>;
