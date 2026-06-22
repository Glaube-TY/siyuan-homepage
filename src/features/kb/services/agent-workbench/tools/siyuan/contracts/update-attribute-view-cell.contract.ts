import { z } from "zod";
import {
  attributeViewIdSchema,
  attributeViewWriteStatusSchema,
} from "./attribute-view-common.contract";

const cellUpdateSchema = z.object({
  rowId: attributeViewIdSchema,
  keyId: attributeViewIdSchema,
  valueText: z.string().max(1000),
  valueTypeHint: z.string().trim().max(50).optional(),
  expectedFieldName: z.string().trim().max(50).optional(),
}).strict();

export const updateAttributeViewCellInputSchema = z.object({
  databaseId: attributeViewIdSchema,
  /** 条目 ID（itemID）。字段名 rowId 为历史兼容别名。 */
  rowId: attributeViewIdSchema.optional(),
  keyId: attributeViewIdSchema.optional(),
  valueText: z.string().max(1000).optional(),
  valueTypeHint: z.string().trim().max(50).optional(),
  /** 单个模式下的字段名防误写校验（可选） */
  expectedFieldName: z.string().trim().max(50).optional(),
  /** 批量更新项，最多 20 项 */
  updates: z.array(cellUpdateSchema).min(1).max(20).optional(),
  summary: z.string().trim().max(300).optional(),
}).strict().refine(
  (data) => {
    // 有 updates 时按批量模式；无 updates 时 rowId/keyId/valueText 必填
    if (data.updates && data.updates.length > 0) return true;
    return !!data.rowId && !!data.keyId && data.valueText !== undefined;
  },
  { message: "批量模式需要 updates；单个模式需要 rowId、keyId 和 valueText。" }
);

export type UpdateAttributeViewCellInput = z.infer<typeof updateAttributeViewCellInputSchema>;

const cellUpdateResultSchema = z.object({
  rowId: z.string(),
  keyId: z.string(),
  fieldName: z.string(),
  status: z.enum(["success", "failed"]),
  oldValueText: z.string().optional(),
  newValueText: z.string(),
  message: z.string(),
}).strict();

export const updateAttributeViewCellOutputSchema = z.object({
  status: attributeViewWriteStatusSchema,
  databaseId: z.string(),
  total: z.number().int().min(0),
  successCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  results: z.array(cellUpdateResultSchema),
  message: z.string(),
}).strict();

export type UpdateAttributeViewCellOutput = z.infer<typeof updateAttributeViewCellOutputSchema>;
