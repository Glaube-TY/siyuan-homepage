import { z } from "zod";
import {
  agendaDiaryDocSchema,
  agendaIsoDateSchema,
} from "./agenda-common.contract";

export const findDiaryDocsInputSchema = z.object({
  period: z.enum(["day", "week", "month", "year"]).optional().default("day"),
  date: agendaIsoDateSchema.optional(),
  startDate: agendaIsoDateSchema.optional(),
  endDate: agendaIsoDateSchema.optional(),
  includeMarkdown: z.boolean().optional().default(false),
  maxChars: z.number().int().min(100).max(5000).optional().default(1000),
}).strict().refine(
  (value) => !(value.date && (value.startDate || value.endDate)),
  { message: "date 不能和 startDate/endDate 同时使用。" },
).refine(
  (value) => (!value.startDate && !value.endDate) || (!!value.startDate && !!value.endDate),
  { message: "startDate 和 endDate 必须同时提供。" },
).refine(
  (value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
  { message: "startDate 不能晚于 endDate。" },
);

export type FindDiaryDocsInput = z.infer<typeof findDiaryDocsInputSchema>;

export const findDiaryDocsOutputSchema = z.object({
  period: z.enum(["day", "week", "month", "year"]),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  docs: z.array(agendaDiaryDocSchema),
  returned: z.number().int().min(0),
  totalChecked: z.number().int().min(0),
  note: z.string(),
  warnings: z.array(z.string()).optional(),
}).strict();

export type FindDiaryDocsOutput = z.infer<typeof findDiaryDocsOutputSchema>;
