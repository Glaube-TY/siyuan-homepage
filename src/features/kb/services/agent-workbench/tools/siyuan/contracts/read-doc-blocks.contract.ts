import { z } from "zod";

export const readDocBlocksInputSchema = z.object({
  targetId: z.string().trim().min(1).max(256),
  scope: z.enum(["self", "children", "siblings_window", "document_top"]),
  before: z.number().int().min(0).max(20).optional(),
  after: z.number().int().min(0).max(20).optional(),
  maxBlocks: z.number().int().min(1).max(50).optional(),
  maxChars: z.number().int().min(1).max(30000).optional(),
}).strict();

export type ReadDocBlocksInput = z.infer<typeof readDocBlocksInputSchema>;

export const readDocBlocksItemSchema = z.object({
  id: z.string(),
  rootId: z.string().optional(),
  parentId: z.string().optional(),
  previousId: z.string().optional(),
  nextId: z.string().optional(),
  type: z.string(),
  subType: z.string().optional(),
  markdown: z.string().optional(),
  kramdown: z.string().optional(),
  content: z.string().optional(),
  index: z.number().int().optional(),
}).strict();

export const readDocBlocksOutputSchema = z.object({
  targetId: z.string(),
  scope: z.string(),
  items: z.array(readDocBlocksItemSchema),
  truncated: z.boolean(),
}).strict();

export type ReadDocBlocksOutput = z.infer<typeof readDocBlocksOutputSchema>;

export const readDocBlocksInputJsonSchemaOverride = {
  type: "object",
  properties: {
    targetId: { type: "string", minLength: 1, maxLength: 256, description: "目标块或文档 ID" },
    scope: { type: "string", enum: ["self", "children", "siblings_window", "document_top"], description: "读取范围：self（自身）、children（直接子块）、siblings_window（同层邻近块）、document_top（文档顶层块）" },
    before: { type: "integer", minimum: 0, maximum: 20, description: "siblings_window 时，目标块前取多少条，默认 2" },
    after: { type: "integer", minimum: 0, maximum: 20, description: "siblings_window 时，目标块后取多少条，默认 2" },
    maxBlocks: { type: "integer", minimum: 1, maximum: 50, description: "最大返回块数，默认 20" },
    maxChars: { type: "integer", minimum: 1, maximum: 30000, description: "最大返回字符数，默认 8000" },
  },
  additionalProperties: false,
  required: ["targetId", "scope"],
};
