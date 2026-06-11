import { z } from "zod";

export const deleteBlockInputSchema = z.object({
  blockId: z.string().trim().min(1).max(256),
}).strict();

export type DeleteBlockInput = z.infer<typeof deleteBlockInputSchema>;

export const deleteBlockOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    blockId: z.string(),
    docId: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
}).strict();

export type DeleteBlockOutput = z.infer<typeof deleteBlockOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Planner 可见工具结果。
 */
export interface PreparedDeleteBlockConfirmation {
  confirmationId: string;
  action: "delete_block";
  target: {
    blockId: string;
    docId?: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const deleteBlockInputJsonSchemaOverride = {
  type: "object",
  properties: {
    blockId: { type: "string", minLength: 1, maxLength: 256, description: "目标块 ID" },
  },
  additionalProperties: false,
  required: ["blockId"],
};
