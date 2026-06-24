import { z } from "zod";
import { attrsSchema, stringArraySchema } from "./siyuan-common.contract";

export const siyuanBlockAttrInputSchema = z.object({
  action: z.enum(["get", "batch_get", "set", "batch_set"]),
  id: z.string().trim().min(1).max(256).optional(),
  ids: stringArraySchema.max(20).optional(),
  attrs: attrsSchema.optional(),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(256),
    attrs: attrsSchema,
  }).strict()).max(20).optional(),
}).strict();

export type SiyuanBlockAttrInput = z.infer<typeof siyuanBlockAttrInputSchema>;
