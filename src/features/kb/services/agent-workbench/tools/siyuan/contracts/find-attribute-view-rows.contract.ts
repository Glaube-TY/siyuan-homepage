import { z } from "zod";
import {
  attributeViewIdSchema,
  attributeViewNullableIdSchema,
  attributeViewRowSchema,
  warningsSchema,
} from "./attribute-view-common.contract";

export const findAttributeViewRowsInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  viewId: attributeViewNullableIdSchema,
  query: z.string().trim().max(200).optional(),
  fieldName: z.string().trim().min(1).max(100).optional(),
  fieldValue: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
}).strict();

export type FindAttributeViewRowsInput = z.infer<typeof findAttributeViewRowsInputSchema>;

export const findAttributeViewRowsOutputSchema = z.object({
  databaseId: z.string(),
  viewId: z.string().nullable(),
  matches: z.array(z.object({
    rowId: z.string(),
    boundBlockId: z.string().optional(),
    title: z.string().optional(),
    matchedFields: z.array(z.string()),
    row: attributeViewRowSchema,
  }).strict()),
  count: z.number().int().min(0),
  truncated: z.boolean(),
  warnings: warningsSchema,
}).strict();

export type FindAttributeViewRowsOutput = z.infer<typeof findAttributeViewRowsOutputSchema>;
