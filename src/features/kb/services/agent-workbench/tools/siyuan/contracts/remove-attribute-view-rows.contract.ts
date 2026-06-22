import { z } from "zod";
import {
  attributeViewIdSchema,
  attributeViewWriteStatusSchema,
  warningsSchema,
} from "./attribute-view-common.contract";

export const removeAttributeViewRowsInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  rowIds: z.array(attributeViewIdSchema).min(1).max(20),
  databaseBlockId: attributeViewIdSchema.optional(),
  expectedTitles: z.array(z.string().trim().max(200)).optional(),
  summary: z.string().trim().max(300).optional(),
}).strict();

export type RemoveAttributeViewRowsInput = z.infer<typeof removeAttributeViewRowsInputSchema>;

export const removeAttributeViewRowsOutputSchema = z.object({
  status: attributeViewWriteStatusSchema,
  databaseId: z.string(),
  removedCount: z.number().int().min(0),
  removedRowIds: z.array(z.string()).optional(),
  srcIds: z.array(z.string()).optional(),
  warnings: warningsSchema,
  message: z.string(),
}).strict();

export type RemoveAttributeViewRowsOutput = z.infer<typeof removeAttributeViewRowsOutputSchema>;
