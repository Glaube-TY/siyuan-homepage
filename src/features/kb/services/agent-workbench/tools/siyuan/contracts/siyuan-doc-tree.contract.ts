import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

export const siyuanDocTreeInputSchema = z.object({
  action: z.enum(["list_children", "list_tree", "move", "move_by_id", "duplicate", "sort"]),
  notebook: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  fromPaths: z.array(z.string().trim().min(1).max(1024)).max(50).optional(),
  toNotebook: z.string().trim().min(1).max(256).optional(),
  toPath: z.string().trim().max(1024).optional(),
  ids: stringArraySchema.max(50).optional(),
  targetID: z.string().trim().min(1).max(256).optional(),
}).strict();

export type SiyuanDocTreeInput = z.infer<typeof siyuanDocTreeInputSchema>;
