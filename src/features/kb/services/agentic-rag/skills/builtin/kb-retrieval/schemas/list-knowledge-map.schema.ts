/**
 * list_knowledge_map schema: Zod schema 和输入输出类型。
 */

import { z } from "zod";

export const listKnowledgeMapInputSchema = z.object({
  maxDepth: z.number().int().min(1).max(10).optional().default(3).describe("Maximum tree depth."),
  maxNodes: z.number().int().min(10).max(500).optional().default(120).describe("Maximum nodes to return."),
}).strict();

export type ListKnowledgeMapInput = z.infer<typeof listKnowledgeMapInputSchema>;

export const plannerVisibleKnowledgeMapNodeSchema = z.object({
  handle: z.string(),
  title: z.string(),
  depth: z.number().int(),
  childCount: z.number().int(),
  children: z.lazy(() => z.array(plannerVisibleKnowledgeMapNodeSchema)).optional(),
  truncatedChildren: z.boolean().optional(),
}).strict();

export type PlannerVisibleKnowledgeMapNode = z.infer<typeof plannerVisibleKnowledgeMapNodeSchema>;

export const plannerVisibleKnowledgeMapNotebookSchema = z.object({
  handle: z.string(),
  title: z.string(),
  docCount: z.number().int(),
  roots: z.array(plannerVisibleKnowledgeMapNodeSchema),
  truncated: z.boolean().optional(),
}).strict();

export type PlannerVisibleKnowledgeMapNotebook = z.infer<typeof plannerVisibleKnowledgeMapNotebookSchema>;

export const listKnowledgeMapOutputSchema = z.object({
  notebooks: z.array(plannerVisibleKnowledgeMapNotebookSchema),
  totalNodeCount: z.number().int(),
  returnedNodeCount: z.number().int(),
  truncated: z.boolean(),
}).strict();

export type ListKnowledgeMapOutput = z.infer<typeof listKnowledgeMapOutputSchema>;
