import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

export const siyuanBlockRefInputSchema = z.object({
  action: z.enum(["get_ref_ids", "get_ref_text", "get_def_ids_by_ref_text", "check_ref", "swap_ref", "transfer_ref"]),
  id: z.string().trim().min(1).max(256).optional(),
  refText: z.string().trim().min(1).max(500).optional(),
  fromID: z.string().trim().min(1).max(256).optional(),
  toID: z.string().trim().min(1).max(256).optional(),
  refIDs: stringArraySchema.max(50).optional(),
}).strict();

export type SiyuanBlockRefInput = z.infer<typeof siyuanBlockRefInputSchema>;
