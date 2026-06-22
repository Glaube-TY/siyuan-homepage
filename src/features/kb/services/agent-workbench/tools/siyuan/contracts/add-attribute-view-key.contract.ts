import { z } from "zod";
import {
  attributeViewIdSchema,
  attributeViewWriteStatusSchema,
} from "./attribute-view-common.contract";

export const ATTRIBUTE_VIEW_KEY_TYPE_VALUES = [
  "text",
  "number",
  "date",
  "select",
  "mSelect",
  "checkbox",
  "url",
  "email",
  "phone",
  "template",
] as const;

export const addAttributeViewKeyInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  keyName: z.string().trim().min(1).max(50),
  keyType: z.enum(ATTRIBUTE_VIEW_KEY_TYPE_VALUES),
  keyIcon: z.string().trim().max(20).optional(),
  previousKeyId: z.string().trim().max(256).optional(),
  summary: z.string().trim().max(300).optional(),
}).strict();

export type AddAttributeViewKeyInput = z.infer<typeof addAttributeViewKeyInputSchema>;

export const addAttributeViewKeyOutputSchema = z.object({
  status: attributeViewWriteStatusSchema,
  databaseId: z.string(),
  keyId: z.string(),
  keyName: z.string(),
  keyType: z.string(),
  message: z.string(),
}).strict();

export type AddAttributeViewKeyOutput = z.infer<typeof addAttributeViewKeyOutputSchema>;
