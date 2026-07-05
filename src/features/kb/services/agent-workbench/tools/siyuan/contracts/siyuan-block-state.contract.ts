import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

export const taskMarkerItemSchema = z.object({
  id: z.string().trim().min(1).max(256),
  marker: z.enum([" ", "x"]).optional(),
}).strict();

export const siyuanBlockStateInputSchema = z.object({
  action: z.enum(["fold", "unfold", "set_reminder", "update_task_marker", "batch_update_task_marker"]),
  id: z.string().trim().min(1).max(256).optional(),
  ids: stringArraySchema.max(50).optional(),
  items: z.array(taskMarkerItemSchema).min(1).max(50).optional(),
  marker: z.enum([" ", "x"]).optional(),
  reminder: z.string().trim().max(200).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.action === "fold" || value.action === "unfold" || value.action === "set_reminder" || value.action === "update_task_marker") && !value.id) {
    ctx.addIssue({
      code: "custom",
      message: `${value.action} 需要 id。`,
      path: ["id"],
    });
  }
  if (value.action === "set_reminder" && !value.reminder) {
    ctx.addIssue({
      code: "custom",
      message: "set_reminder 需要 reminder。",
      path: ["reminder"],
    });
  }
  if (value.action === "batch_update_task_marker" && !(value.ids?.length) && !(value.items?.length)) {
    ctx.addIssue({
      code: "custom",
      message: "batch_update_task_marker 需要 ids 或 items。",
      path: ["ids"],
    });
  }
});

export type SiyuanBlockStateInput = z.infer<typeof siyuanBlockStateInputSchema>;
export type TaskMarkerItemInput = z.infer<typeof taskMarkerItemSchema>;
