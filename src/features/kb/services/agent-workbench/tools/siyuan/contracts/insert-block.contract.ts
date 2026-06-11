import { z } from "zod";

export const insertBlockInputSchema = z.object({
  referenceBlockId: z.string().trim().min(1).max(256),
  position: z.enum(["before", "after", "child"]),
  markdown: z.string().trim().min(1),
}).strict();

export type InsertBlockInput = z.infer<typeof insertBlockInputSchema>;

export const insertBlockOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    referenceBlockId: z.string(),
    position: z.enum(["before", "after", "child"]),
    insertedBlockId: z.string().optional(),
    docId: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
}).strict();

export type InsertBlockOutput = z.infer<typeof insertBlockOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Planner 可见工具结果。
 */
export interface PreparedInsertBlockConfirmation {
  confirmationId: string;
  action: "insert_block";
  target: {
    referenceBlockId: string;
    position: "before" | "after" | "child";
    docId?: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const insertBlockInputJsonSchemaOverride = {
  type: "object",
  properties: {
    referenceBlockId: { type: "string", minLength: 1, maxLength: 256, description: "参考块 ID，新内容将插入到该块附近" },
    position: { type: "string", enum: ["before", "after", "child"], description: "插入位置：before（之前）、after（之后）、child（子块）" },
    markdown: { type: "string", description: "要插入的 Markdown 内容" },
  },
  additionalProperties: false,
  required: ["referenceBlockId", "position", "markdown"],
};
