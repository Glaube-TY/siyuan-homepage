import { z } from "zod";
import {
  attributeViewDatabaseSchema,
  attributeViewIdSchema,
  attributeViewKeySchema,
  attributeViewRowSchema,
  attributeViewNullableIdSchema,
  warningsSchema,
} from "./attribute-view-common.contract";

export const readAttributeViewInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  viewId: attributeViewNullableIdSchema,
  includeRows: z.boolean().optional().default(true),
  rowLimit: z.number().int().min(1).max(100).optional().default(30),
  includeRaw: z.boolean().optional().default(false),
}).strict();

export type ReadAttributeViewInput = z.infer<typeof readAttributeViewInputSchema>;

export const readAttributeViewOutputSchema = z.object({
  database: attributeViewDatabaseSchema,
  viewId: z.string().nullable(),
  schema: z.array(attributeViewKeySchema),
  rows: z.array(attributeViewRowSchema).optional(),
  rowCount: z.number().int().min(0),
  truncated: z.boolean(),
  warnings: warningsSchema,
  raw: z.unknown().optional(),
}).strict();

export type ReadAttributeViewOutput = z.infer<typeof readAttributeViewOutputSchema>;
