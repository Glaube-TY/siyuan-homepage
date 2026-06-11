import { z } from "zod";

export const readDocsInputSchema = z.object({
  docIds: z.array(z.string().trim().min(1).max(256)).min(1).max(20).optional(),
  blockIds: z.array(z.string().trim().min(1).max(256)).min(1).max(20).optional(),
  cursor: z.string().trim().min(1).max(240).optional(),
  maxChars: z.number().int().min(2000).max(100000).optional(),
  chunkIndex: z.number().int().min(1).optional(),
  chunkChars: z.number().int().min(2000).max(30000).optional(),
  chunkCount: z.number().int().min(1).max(100).optional(),
}).strict().refine(
  (value) => {
    const hasResourceInput =
      (value.docIds?.length ?? 0) > 0 ||
      (value.blockIds?.length ?? 0) > 0;
    const hasCursor = !!value.cursor;
    // Cursor and new IDs are mutually exclusive:
    // - cursor means "continue reading the same docId"
    // - docIds/blockIds means "read these specific resources"
    if (hasCursor && hasResourceInput) return false;
    return hasCursor || hasResourceInput;
  },
  { message: "需要提供 docIds/blockIds 之一或 cursor，但不能同时提供 cursor 和 docIds/blockIds。" },
);

export type ReadDocsInput = z.infer<typeof readDocsInputSchema>;

export const readChunkMetaSchema = z.object({
  index: z.number().int().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  charCount: z.number().int().min(0),
}).strict();

export type ReadDocsChunkMeta = z.infer<typeof readChunkMetaSchema>;

export const readItemSchema = z.object({
  docId: z.string(),
  blockId: z.string().optional(),
  title: z.string(),
  content: z.string(),
  truncated: z.boolean().optional(),
  nextCursor: z.string().optional(),
  contentChars: z.number().int().min(0),
  // Chunk metadata (optional for backward compatibility)
  fullContentChars: z.number().int().min(0).optional(),
  returnedContentChars: z.number().int().min(0).optional(),
  chunkIndex: z.number().int().min(1).optional(),
  chunkCount: z.number().int().min(1).optional(),
  chunkStart: z.number().int().min(0).optional(),
  chunkEnd: z.number().int().min(0).optional(),
  hasPrevChunk: z.boolean().optional(),
  hasNextChunk: z.boolean().optional(),
  chunks: z.array(readChunkMetaSchema).optional(),
}).strict();

export type ReadDocsItem = z.infer<
  typeof readItemSchema
>;

export const readDocsErrorSchema = z.object({
  docId: z.string().optional(),
  blockId: z.string().optional(),
  cursor: z.string().optional(),
  code: z.enum([
    "resource_not_found",
    "empty_content",
    "container_without_content",
    "invalid_resource_id",
    "invalid_cursor",
    "chunk_index_out_of_range",
    "permission_denied",
    "tool_internal_error",
  ]),
  message: z.string(),
  hint: z.string(),
}).strict();

export type ReadDocsError = z.infer<typeof readDocsErrorSchema>;

export const readDocsOutputSchema = z.object({
  items: z.array(readItemSchema),
  errors: z.array(readDocsErrorSchema).optional(),
  note: z.string(),
}).strict();

export type ReadDocsOutput = z.infer<
  typeof readDocsOutputSchema
>;

export const readDocsInputJsonSchemaOverride = {
  type: "object",
  properties: {
    docIds: { type: "array", items: { type: "string", minLength: 1, maxLength: 256 }, minItems: 1, maxItems: 20, description: "思源文档 ID 列表" },
    blockIds: { type: "array", items: { type: "string", minLength: 1, maxLength: 256 }, minItems: 1, maxItems: 20, description: "思源块 ID 列表" },
    cursor: { type: "string", minLength: 1, maxLength: 240, description: "上次返回的 nextCursor，用于继续读取同一文档" },
    chunkIndex: { type: "integer", minimum: 1, description: "要读取的块索引，从 1 开始，默认 1" },
    chunkChars: { type: "integer", minimum: 2000, maximum: 30000, description: "每块字符数，默认 12000，范围 2000-30000" },
    chunkCount: { type: "integer", minimum: 1, maximum: 100, description: "若提供，则优先于 chunkChars，按固定数量分块" },
  },
  additionalProperties: false,
  required: [],
  oneOf: [
    {
      required: ["cursor"],
      not: {
        anyOf: [
          { required: ["docIds"] },
          { required: ["blockIds"] },
        ],
      },
    },
    {
      anyOf: [
        { required: ["docIds"] },
        { required: ["blockIds"] },
      ],
      not: {
        required: ["cursor"],
      },
    },
  ],
};
