import { z } from "zod";

export const renameDocInputSchema = z.object({
  docId: z.string().trim().min(1).max(256),
  title: z.string().trim().min(1).max(512),
}).strict();

export type RenameDocInput = z.infer<typeof renameDocInputSchema>;

export const renameDocOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    docId: z.string(),
    title: z.string().optional(),
    previousTitle: z.string().optional(),
  }).optional(),
}).strict();

export type RenameDocOutput = z.infer<typeof renameDocOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Planner 可见工具结果。
 * confirmation 是 Runtime/UI 内部安全闸门，对 Planner 透明。
 */
export interface PreparedRenameDocConfirmation {
  confirmationId: string;
  action: "rename_doc";
  target: {
    docId: string;
    title?: string;
    previousTitle?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const renameDocInputJsonSchemaOverride = {
  type: "object",
  properties: {
    docId: { type: "string", minLength: 1, maxLength: 256, description: "目标文档 ID" },
    title: { type: "string", minLength: 1, maxLength: 512, description: "新标题" },
  },
  additionalProperties: false,
  required: ["docId", "title"],
};
