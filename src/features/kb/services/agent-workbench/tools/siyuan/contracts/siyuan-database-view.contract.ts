import { z } from "zod";

export const siyuanDatabaseViewInputSchema = z.object({
  action: z.enum(["set_database_block_view", "sort_key", "sort_view_key", "change_layout", "set_group"]),
  avID: z.string().trim().min(1).max(256).optional(),
  blockID: z.string().trim().min(1).max(256).optional(),
  viewID: z.string().trim().min(1).max(256).optional(),
  keyID: z.string().trim().min(1).max(256).optional(),
  previousKeyID: z.string().trim().min(1).max(256).optional(),
  layout: z.string().trim().min(1).max(100).optional(),
  group: z.unknown().optional(),
}).strict();

export type SiyuanDatabaseViewInput = z.infer<typeof siyuanDatabaseViewInputSchema>;
