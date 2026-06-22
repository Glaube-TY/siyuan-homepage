import { z } from "zod";
import {
  attributeViewIdSchema,
  attributeViewWriteStatusSchema,
} from "./attribute-view-common.contract";

export const removeAttributeViewKeyInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  keyId: attributeViewIdSchema,
  removeRelationDest: z.boolean().default(false),
  expectedKeyName: z.string().trim().max(50).optional(),
  summary: z.string().trim().max(300).optional(),
}).strict();

export type RemoveAttributeViewKeyInput = z.infer<typeof removeAttributeViewKeyInputSchema>;

export const removeAttributeViewKeyOutputSchema = z.object({
  status: attributeViewWriteStatusSchema,
  databaseId: z.string(),
  keyId: z.string(),
  keyName: z.string(),
  keyType: z.string(),
  message: z.string(),
}).strict();

export type RemoveAttributeViewKeyOutput = z.infer<typeof removeAttributeViewKeyOutputSchema>;
