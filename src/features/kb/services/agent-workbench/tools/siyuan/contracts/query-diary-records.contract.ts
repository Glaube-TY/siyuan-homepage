import { z } from "zod";
import {
  agendaDiaryRecordSchema,
  agendaIsoDateSchema,
} from "./agenda-common.contract";

export const queryDiaryRecordsInputSchema = z.object({
  date: agendaIsoDateSchema.optional(),
  startDate: agendaIsoDateSchema.optional(),
  endDate: agendaIsoDateSchema.optional(),
  category: z.string().trim().min(1).max(60).optional(),
  keyword: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(50).optional().default(30),
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

export type QueryDiaryRecordsInput = z.infer<typeof queryDiaryRecordsInputSchema>;

export const queryDiaryRecordsOutputSchema = z.object({
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  records: z.array(agendaDiaryRecordSchema),
  totalMatched: z.number().int().min(0),
  returned: z.number().int().min(0),
  note: z.string(),
}).strict();

export type QueryDiaryRecordsOutput = z.infer<typeof queryDiaryRecordsOutputSchema>;
