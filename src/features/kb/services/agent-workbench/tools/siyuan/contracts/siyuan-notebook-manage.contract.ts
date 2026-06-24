import { z } from "zod";

export const siyuanNotebookManageInputSchema = z.object({
  action: z.enum(["list", "create", "open", "close", "rename", "get_conf", "set_conf", "set_icon", "remove"]),
  notebook: z.string().trim().min(1).max(256).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  icon: z.string().trim().max(100).optional(),
  conf: z.unknown().optional(),
}).strict();

export type SiyuanNotebookManageInput = z.infer<typeof siyuanNotebookManageInputSchema>;
