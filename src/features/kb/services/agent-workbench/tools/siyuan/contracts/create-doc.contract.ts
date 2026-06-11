import { z } from "zod";

export const createDocInputSchema = z.object({
  notebookId: z.string().trim().min(1).max(256),
  path: z.string().trim().min(1).max(1024).refine((val) => val.startsWith("/"), {
    message: "path 必须以 / 开头",
  }),
  markdown: z.string().optional(),
}).strict();

export type CreateDocInput = z.infer<typeof createDocInputSchema>;

export const createDocOutputSchema = z.object({
  status: z.enum(["success", "rejected", "failed"]),
  message: z.string(),
  target: z.object({
    notebookId: z.string(),
    path: z.string(),
    docId: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
}).strict();

export type CreateDocOutput = z.infer<typeof createDocOutputSchema>;

/**
 * 内部 confirmation 准备结果，不是 Planner 可见工具结果。
 * confirmation 是 Runtime/UI 内部安全闸门，对 Planner 透明。
 */
export interface PreparedCreateDocConfirmation {
  confirmationId: string;
  action: "create_doc";
  target: {
    notebookId: string;
    path: string;
    docId?: string;
    title?: string;
  };
  riskLevel: "low" | "medium" | "high";
  warnings?: string[];
  message: string;
}

export const createDocInputJsonSchemaOverride = {
  type: "object",
  properties: {
    notebookId: { type: "string", minLength: 1, maxLength: 256, description: "目标笔记本 ID" },
    path: { type: "string", minLength: 1, maxLength: 1024, pattern: "^/", description: "文档路径，必须以 / 开头，例如 \"/folder/doc\"" },
    markdown: { type: "string", description: "文档初始 Markdown 内容，可选；不传或空字符串则创建空文档" },
  },
  additionalProperties: false,
  required: ["notebookId", "path"],
};
