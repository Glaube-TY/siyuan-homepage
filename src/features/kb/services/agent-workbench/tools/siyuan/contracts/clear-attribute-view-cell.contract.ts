import { z } from "zod";
import {
  attributeViewIdSchema,
  attributeViewWriteStatusSchema,
} from "./attribute-view-common.contract";

export const clearAttributeViewCellInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  rowId: attributeViewIdSchema,
  keyId: attributeViewIdSchema,
  expectedFieldName: z.string().trim().max(50).optional(),
  summary: z.string().trim().max(300).optional(),
}).strict();

export type ClearAttributeViewCellInput = z.infer<typeof clearAttributeViewCellInputSchema>;

export const clearAttributeViewCellOutputSchema = z.object({
  status: attributeViewWriteStatusSchema,
  databaseId: z.string(),
  rowId: z.string(),
  keyId: z.string(),
  fieldName: z.string(),
  oldValueText: z.string().optional(),
  message: z.string(),
}).strict();

export type ClearAttributeViewCellOutput = z.infer<typeof clearAttributeViewCellOutputSchema>;
