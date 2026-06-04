/**
 * list_knowledge_map schema: Zod schema 和输入输出类型。
 * 主线：直接返回 docId/blockId，不再使用 opaque identifier。
 */

import { z } from "zod";

/**
 * 可选 ID 参数：将 null、undefined、空字符串、纯空白统一归一化为 undefined。
 * 避免因 null 或 "" 触发 validation_failed。
 */
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
  mode: z.enum(["tree", "list"]).optional().default("tree"),
  view: z.enum(["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"]).optional(),
  rootDocId: optionalIdParam,
  centerDocId: optionalIdParam,
  notebookId: optionalIdParam,
  cursor: optionalIdParam,
  maxDepth: z.number().int().min(1).max(10).optional().default(2),
  maxNodes: z.number().int().min(10).max(500).optional().default(120),
  limit: z.number().int().min(1).max(500).optional().default(50),
  includeLinkedDocs: z.boolean().optional().default(false),
  relationLimit: z.number().int().min(0).max(20).optional().default(5),
  includeClosedNotebooks: z.boolean().optional().default(false),
  includeTags: z.boolean().optional().default(false),
}).strict();

export type ListKnowledgeMapInput = z.infer<typeof listKnowledgeMapInputSchema>;

export const plannerVisibleLinkedDocSchema = z.object({
  docId: z.string(),
  title: z.string(),
  relation: z.enum(["backlink", "mention"]),
  count: z.number().int().min(0),
  sampleBlockId: z.string().optional(),
  source: z.literal("getBacklink"),
}).strict();

export type PlannerVisibleLinkedDoc = z.infer<typeof plannerVisibleLinkedDocSchema>;

/**
 * 知识图谱节点：文档级，只携带 docId，不返回 blockId。
 * sourceType/nodeKind/hasChildren/canReadContent 提供结构信息。
 */
export const plannerVisibleKnowledgeMapNodeSchema = z.object({
  docId: z.string(),
  sourceType: z.string().optional().default("siyuan_doc"),
  title: z.string(),
  depth: z.number().int(),
  childCount: z.number().int(),
  parentDocId: z.string().optional(),
  siblingCount: z.number().int().min(0).optional(),
  hasChildren: z.boolean().optional(),
  nodeKind: z.enum(["document", "container", "unknown"]).optional(),
  canReadContent: z.boolean().optional(),
  linkedDocs: z.array(plannerVisibleLinkedDocSchema).optional(),
  linkRefsCount: z.number().int().min(0).optional(),
  mentionsCount: z.number().int().min(0).optional(),
  linkedDocsStatus: z.enum(["not_requested", "available", "unavailable", "error"]).optional(),
  nodeStatus: z.enum(["available", "unavailable"]).optional(),
  children: z.lazy(() => z.array(plannerVisibleKnowledgeMapNodeSchema)).optional(),
  truncatedChildren: z.boolean().optional(),
}).strict();

export type PlannerVisibleKnowledgeMapNode = z.infer<typeof plannerVisibleKnowledgeMapNodeSchema>;

export const plannerVisibleKnowledgeMapNotebookSchema = z.object({
  /** 笔记本 ID */
  notebookId: z.string(),
  title: z.string(),
  notebookName: z.string().optional(),
  notebookNameStatus: z.enum(["available", "unavailable"]).optional(),
  icon: z.string().optional(),
  sort: z.number().optional(),
  sortMode: z.number().optional(),
  closed: z.boolean().optional(),
  docCount: z.number().int(),
  roots: z.array(plannerVisibleKnowledgeMapNodeSchema),
  truncated: z.boolean().optional(),
}).strict();

export type PlannerVisibleKnowledgeMapNotebook = z.infer<typeof plannerVisibleKnowledgeMapNotebookSchema>;

export const listKnowledgeMapOutputSchema = z.object({
  mode: z.enum(["tree", "list"]).optional(),
  view: z.enum(["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"]).optional(),
  resultScope: z.enum(["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"]),
  notebooks: z.array(plannerVisibleKnowledgeMapNotebookSchema),
  docs: z.array(plannerVisibleKnowledgeMapNodeSchema).optional(),
  totalNodeCount: z.number().int(),
  returnedNodeCount: z.number().int(),
  returnedDocCount: z.number().int().min(0).optional(),
  truncated: z.boolean(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
  notebookApiLoaded: z.boolean().optional(),
  notebookCount: z.number().int().min(0).optional(),
  missingNotebookNameCount: z.number().int().min(0).optional(),
  linkedDocsRequested: z.boolean().optional(),
  linkedDocsErrorCount: z.number().int().min(0).optional(),
  tagStatus: z.enum(["not_requested", "not_available"]).optional(),
  error: z.object({
    code: z.enum(["resource_not_found", "invalid_args"]),
    message: z.string(),
    hint: z.string(),
  }).optional(),
}).strict();

export type ListKnowledgeMapOutput = z.infer<typeof listKnowledgeMapOutputSchema>;
