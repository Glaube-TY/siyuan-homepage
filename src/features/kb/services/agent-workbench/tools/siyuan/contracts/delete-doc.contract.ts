import { z } from "zod";

export const deleteDocInputSchema = z.object({
  docId: z.string().trim().min(1).max(256),
}).strict();

export type DeleteDocInput = z.infer<typeof deleteDocInputSchema>;

export const deleteDocOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    docId: z.string(),
    title: z.string().optional(),
  }).optional(),
}).strict();

export type DeleteDocOutput = z.infer<typeof deleteDocOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Agent 可见工具结果。
 * confirmation 是 Runtime/UI 内部安全闸门，对 Agent 透明。
 */
export interface PreparedDeleteDocConfirmation {
  confirmationId: string;
  action: "delete_doc";
  target: {
    docId: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const deleteDocInputJsonSchemaOverride = {
  type: "object",
  properties: {
    docId: { type: "string", minLength: 1, maxLength: 256, description: "目标文档 ID" },
  },
  additionalProperties: false,
  required: ["docId"],
};
