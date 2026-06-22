import { z } from "zod";

export const attributeViewIdSchema = z.string().trim().min(1).max(256);
export const attributeViewNullableIdSchema = z.string().trim().min(1).max(256).nullable().optional();

export const attributeViewViewSchema = z.object({
  viewId: z.string().nullable(),
  name: z.string().optional(),
  type: z.string().optional(),
}).strict();

export const attributeViewKeySchema = z.object({
  keyId: z.string(),
  name: z.string(),
  type: z.string(),
  icon: z.string().optional(),
}).strict();

export const attributeViewCellSchema = z.object({
  keyId: z.string(),
  name: z.string(),
  type: z.string(),
  text: z.string(),
  raw: z.unknown().optional(),
}).strict();

export const attributeViewRowSchema = z.object({
  rowId: z.string(),
  boundBlockId: z.string().optional(),
  title: z.string().optional(),
  cells: z.record(z.string(), attributeViewCellSchema),
}).strict();

export const attributeViewDatabaseSchema = z.object({
  databaseId: z.string(),
  name: z.string(),
  views: z.array(attributeViewViewSchema),
}).strict();

export const attributeViewWriteStatusSchema = z.enum(["success", "rejected", "failed", "partial"]);

export const warningsSchema = z.array(z.string()).optional();
