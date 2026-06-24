import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

export const siyuanBlockStateInputSchema = z.object({
  action: z.enum(["fold", "unfold", "set_reminder", "update_task_marker", "batch_update_task_marker"]),
  id: z.string().trim().min(1).max(256).optional(),
  ids: stringArraySchema.max(50).optional(),
  marker: z.enum([" ", "x"]).optional(),
  reminder: z.string().trim().max(200).optional(),
}).strict();

export type SiyuanBlockStateInput = z.infer<typeof siyuanBlockStateInputSchema>;
