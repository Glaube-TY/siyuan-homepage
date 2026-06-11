import { z } from "zod";

export const updateBlockInputSchema = z.object({
  blockId: z.string().trim().min(1).max(256),
  markdown: z.string(),
}).strict();

export type UpdateBlockInput = z.infer<typeof updateBlockInputSchema>;

export const updateBlockOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    blockId: z.string(),
    docId: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
}).strict();

export type UpdateBlockOutput = z.infer<typeof updateBlockOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Planner 可见工具结果。
 * confirmation 是 Runtime/UI 内部安全闸门，对 Planner 透明。
 */
export interface PreparedUpdateBlockConfirmation {
  confirmationId: string;
  action: "update_block";
  target: {
    blockId: string;
    docId?: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const updateBlockInputJsonSchemaOverride = {
  type: "object",
  properties: {
    blockId: { type: "string", minLength: 1, maxLength: 256, description: "目标块 ID" },
    markdown: { type: "string", description: "更新后的 Markdown 内容" },
  },
  additionalProperties: false,
  required: ["blockId", "markdown"],
};
