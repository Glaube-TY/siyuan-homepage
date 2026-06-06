import { z } from "zod";
import {
  agendaIsoDateSchema,
  agendaTaskSchema,
} from "./agenda-common.contract";

export const queryTasksInputSchema = z.object({
  scope: z.enum(["all", "today", "overdue", "upcoming", "completed", "open"]).optional().default("all"),
  date: agendaIsoDateSchema.optional(),
  startDate: agendaIsoDateSchema.optional(),
  endDate: agendaIsoDateSchema.optional(),
  status: z.enum(["done", "not_done", "any"]).optional().default("any"),
  keyword: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  priority: z.array(z.number().int().min(1).max(9)).max(9).optional(),
  limit: z.number().int().min(1).max(50).optional().default(30),
}).strict().refine(
  (value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
  { message: "startDate 不能晚于 endDate。" },
);

export type QueryTasksInput = z.infer<typeof queryTasksInputSchema>;

export const queryTasksOutputSchema = z.object({
  date: z.string(),
  tasks: z.array(agendaTaskSchema),
  totalMatched: z.number().int().min(0),
  returned: z.number().int().min(0),
  note: z.string(),
}).strict();

export type QueryTasksOutput = z.infer<typeof queryTasksOutputSchema>;
