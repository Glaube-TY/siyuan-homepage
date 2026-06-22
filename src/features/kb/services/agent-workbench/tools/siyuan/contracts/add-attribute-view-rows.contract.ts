import { z } from "zod";
import {
  attributeViewIdSchema,
  attributeViewWriteStatusSchema,
  warningsSchema,
} from "./attribute-view-common.contract";

const detachedRowSchema = z.object({
  title: z.string().trim().max(200).optional(),
  values: z.record(z.string(), z.string().max(1000)).optional(),
}).strict();

export const addAttributeViewRowsInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  databaseBlockId: attributeViewIdSchema.optional(),
  blockIds: z.array(attributeViewIdSchema).max(20).optional(),
  detachedRows: z.array(detachedRowSchema).max(20).optional(),
  defaultValues: z.record(z.string(), z.string().max(1000)).optional(),
  viewID: attributeViewIdSchema.optional(),
  groupID: attributeViewIdSchema.optional(),
  previousID: attributeViewIdSchema.optional(),
  ignoreDefaultFill: z.boolean().optional(),
  summary: z.string().trim().max(300).optional(),
}).strict().superRefine((value, ctx) => {
  const blockCount = value.blockIds?.length ?? 0;
  const detachedCount = value.detachedRows?.length ?? 0;
  if (blockCount === 0 && detachedCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "必须提供 blockIds 或 detachedRows。",
      path: ["blockIds"],
    });
  }
});

export type AddAttributeViewRowsInput = z.infer<typeof addAttributeViewRowsInputSchema>;

export const addAttributeViewRowsOutputSchema = z.object({
  status: attributeViewWriteStatusSchema,
  databaseId: z.string(),
  addedCount: z.number().int().min(0),
  affectedBlockIds: z.array(z.string()).optional(),
  rowIds: z.array(z.string()).optional(),
  warnings: warningsSchema,
  message: z.string(),
}).strict();

export type AddAttributeViewRowsOutput = z.infer<typeof addAttributeViewRowsOutputSchema>;
