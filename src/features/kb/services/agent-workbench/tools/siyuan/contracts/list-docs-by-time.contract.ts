import { z } from "zod";

export const listDocsByTimeInputSchema = z.object({
  sortBy: z.enum(["updated", "created"]).optional().default("updated"),
  order: z.enum(["desc", "asc"]).optional().default("desc"),
  limit: z.number().int().min(1).max(100).optional().default(20),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
}).strict();

export type ListDocsByTimeInput = z.infer<typeof listDocsByTimeInputSchema>;

export const docTimeItemSchema = z.object({
  docId: z.string(),
  title: z.string(),
  time: z.string(),
}).strict();

export type DocTimeItem = z.infer<typeof docTimeItemSchema>;

export const listDocsByTimeOutputSchema = z.object({
  sortBy: z.enum(["updated", "created"]),
  order: z.enum(["desc", "asc"]),
  docs: z.array(docTimeItemSchema),
  returnedCount: z.number().int().min(0),
  truncated: z.boolean(),
  note: z.string().optional(),
  timeRange: z.object({
    field: z.enum(["updated", "created"]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  }).optional(),
}).strict();

export type ListDocsByTimeOutput = z.infer<typeof listDocsByTimeOutputSchema>;
