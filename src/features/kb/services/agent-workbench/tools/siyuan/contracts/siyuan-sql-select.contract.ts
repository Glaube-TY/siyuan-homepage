import { z } from "zod";
import { maxCharsSchema } from "./siyuan-common.contract";

export const siyuanSqlSelectInputSchema = z.object({
  stmt: z.string().trim().min(1).max(20000),
  maxRows: z.number().int().min(1).max(100).optional(),
  maxChars: maxCharsSchema,
}).strict();

export type SiyuanSqlSelectInput = z.infer<typeof siyuanSqlSelectInputSchema>;
