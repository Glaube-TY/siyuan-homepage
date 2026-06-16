import { z } from "zod";

const ensureTodaySchema = z.object({
  operation: z.literal("ensure_today"),
}).strict();

const appendTemplateSchema = z.object({
  operation: z.literal("append_template"),
  period: z.enum(["day", "week", "month", "year"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  docId: z.string().trim().min(1).optional(),
}).strict();

export const manageDiaryStructureInputSchema = z.discriminatedUnion("operation", [
  ensureTodaySchema,
  appendTemplateSchema,
]);

export type ManageDiaryStructureInput = z.infer<typeof manageDiaryStructureInputSchema>;

export const manageDiaryStructureOutputSchema = z.object({
  operation: z.string(),
  changed: z.boolean(),
  docId: z.string().optional(),
  period: z.string().optional(),
  skipped: z.boolean().optional(),
  reason: z.string().optional(),
  message: z.string(),
}).strict();

export type ManageDiaryStructureOutput = z.infer<typeof manageDiaryStructureOutputSchema>;
