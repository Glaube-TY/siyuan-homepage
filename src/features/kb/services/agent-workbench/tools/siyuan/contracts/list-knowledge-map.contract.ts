import { z } from "zod";

const optionalIdParam = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  },
  z.string().trim().min(1).max(256).optional(),
);

export const listKnowledgeMapInputSchema = z.object({
  view: z.enum(["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"]).optional().default("notebook_roots"),
  rootDocId: optionalIdParam,
  centerDocId: optionalIdParam,
  notebookId: optionalIdParam,
  cursor: optionalIdParam,
  maxDepth: z.number().int().min(1).max(10).optional().default(2),
  limit: z.number().int().min(1).max(500).optional().default(50),
  includeLinkedDocs: z.boolean().optional().default(false),
  includeTags: z.boolean().optional().default(false),
}).strict();

export type ListKnowledgeMapInput = z.infer<typeof listKnowledgeMapInputSchema>;

export const knowledgeLinkedDocSchema = z.object({
  docId: z.string(),
  title: z.string(),
  relation: z.enum(["backlink", "mention"]),
}).strict();

export type KnowledgeLinkedDoc = z.infer<typeof knowledgeLinkedDocSchema>;

export const knowledgeMapNodeSchema = z.object({
  docId: z.string(),
  title: z.string(),
  notebookId: z.string().optional(),
  notebookName: z.string().optional(),
  depth: z.number().int(),
  childCount: z.number().int(),
  parentDocId: z.string().optional(),
  hasChildren: z.boolean().optional(),
  linkedDocs: z.array(knowledgeLinkedDocSchema).optional(),
  tags: z.array(z.string()).optional(),
  children: z.lazy(() => z.array(knowledgeMapNodeSchema)).optional(),
}).strict();

export type KnowledgeMapNode = z.infer<typeof knowledgeMapNodeSchema>;

export const knowledgeMapNotebookSchema = z.object({
  notebookId: z.string(),
  title: z.string(),
  notebookName: z.string().optional(),
  docCount: z.number().int(),
  roots: z.array(knowledgeMapNodeSchema),
  truncated: z.boolean().optional(),
}).strict();

export type KnowledgeMapNotebook = z.infer<typeof knowledgeMapNotebookSchema>;

export const listKnowledgeMapOutputSchema = z.object({
  view: z.enum(["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"]).optional(),
  resultScope: z.enum(["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"]),
  notebooks: z.array(knowledgeMapNotebookSchema),
  docs: z.array(knowledgeMapNodeSchema).optional(),
  totalNodeCount: z.number().int(),
  returnedNodeCount: z.number().int(),
  returnedDocCount: z.number().int().min(0).optional(),
  truncated: z.boolean(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
  note: z.string().optional(),
  notebookApiLoaded: z.boolean().optional(),
  notebookCount: z.number().int().min(0).optional(),
  missingNotebookNameCount: z.number().int().min(0).optional(),
  linkedDocsRequested: z.boolean().optional(),
  linkedDocsErrorCount: z.number().int().min(0).optional(),
  error: z.object({
    code: z.enum(["resource_not_found", "invalid_args", "empty_children", "empty_scope"]),
    message: z.string(),
    hint: z.string(),
  }).optional(),
}).strict();

export type ListKnowledgeMapOutput = z.infer<typeof listKnowledgeMapOutputSchema>;
