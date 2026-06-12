import { z } from "zod";

export const deleteBlocksInputSchema = z.object({
  blockIds: z.array(
    z.string().trim().min(1).max(256)
  ).min(1).max(50),
}).strict();

export type DeleteBlocksInput = z.infer<typeof deleteBlocksInputSchema>;

export const deleteBlocksOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    blockIds: z.array(z.string()),
    docId: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
  requestedCount: z.number().int().optional(),
  deletedCount: z.number().int().optional(),
  reasonCode: z.enum([
    "precondition_changed",
    "target_not_found",
    "cross_document_blocks",
    "confirmation_expired",
    "user_rejected",
    "delete_failed",
    "partial_delete_failed",
    "unknown_error",
  ]).optional(),
}).strict();

export type DeleteBlocksOutput = z.infer<typeof deleteBlocksOutputSchema>;

export interface PreparedDeleteBlocksConfirmation {
  confirmationId: string;
  action: "delete_blocks";
  target: {
    blockIds: string[];
    docId?: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const deleteBlocksInputJsonSchemaOverride = {
  type: "object",
  properties: {
    blockIds: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 256 },
      minItems: 1,
      maxItems: 50,
      description: "要删除的思源块 ID 列表。删除单个块时也传入单元素数组。必须属于同一文档。",
    },
  },
  additionalProperties: false,
  required: ["blockIds"],
};
