import { z } from "zod";

export const moveBlockInputSchema = z.object({
  blockId: z.string().trim().min(1).max(256),
  previousID: z.string().trim().min(1).max(256).optional(),
  parentID: z.string().trim().min(1).max(256).optional(),
}).strict().refine((data) => {
  const hasPrevious = typeof data.previousID === "string" && data.previousID.trim() !== "";
  const hasParent = typeof data.parentID === "string" && data.parentID.trim() !== "";
  return hasPrevious || hasParent;
}, {
  message: "previousID 和 parentID 至少提供一个。",
}).refine((data) => {
  if (data.previousID && data.previousID.trim() === data.blockId.trim()) return false;
  if (data.parentID && data.parentID.trim() === data.blockId.trim()) return false;
  return true;
}, {
  message: "previousID 和 parentID 不能与 blockId 相同。",
});

export type MoveBlockInput = z.infer<typeof moveBlockInputSchema>;

export const moveBlockOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    blockId: z.string(),
    previousID: z.string().optional(),
    parentID: z.string().optional(),
    docId: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
}).strict();

export type MoveBlockOutput = z.infer<typeof moveBlockOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Agent 可见工具结果。
 */
export interface PreparedMoveBlockConfirmation {
  confirmationId: string;
  action: "move_block";
  target: {
    blockId: string;
    previousID?: string;
    parentID?: string;
    docId?: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const moveBlockInputJsonSchemaOverride = {
  type: "object",
  properties: {
    blockId: { type: "string", minLength: 1, maxLength: 256, description: "目标块 ID" },
    previousID: { type: "string", minLength: 1, maxLength: 256, description: "目标 previousID（移动到该块之后），与 parentID 至少提供一个" },
    parentID: { type: "string", minLength: 1, maxLength: 256, description: "目标 parentID（移动到该块之下），与 previousID 至少提供一个" },
  },
  additionalProperties: false,
  required: ["blockId"],
  anyOf: [
    { required: ["blockId", "previousID"] },
    { required: ["blockId", "parentID"] },
  ],
};
