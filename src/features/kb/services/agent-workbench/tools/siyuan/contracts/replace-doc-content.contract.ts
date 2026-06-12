import { z } from "zod";

export const replaceDocContentInputSchema = z.object({
  docId: z.string().trim().min(1).max(256),
  markdown: z.string(),
}).strict();

export type ReplaceDocContentInput = z.infer<typeof replaceDocContentInputSchema>;

export const replaceDocContentOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    docId: z.string(),
    title: z.string().optional(),
  }).optional(),
}).strict();

export type ReplaceDocContentOutput = z.infer<typeof replaceDocContentOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Agent 可见工具结果。
 */
export interface PreparedReplaceDocContentConfirmation {
  confirmationId: string;
  action: "replace_doc_content";
  target: {
    docId: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const replaceDocContentInputJsonSchemaOverride = {
  type: "object",
  properties: {
    docId: { type: "string", minLength: 1, maxLength: 256, description: "目标文档 ID" },
    markdown: { type: "string", description: "替换后的 Markdown 正文，允许空字符串用于清空" },
  },
  additionalProperties: false,
  required: ["docId", "markdown"],
};
