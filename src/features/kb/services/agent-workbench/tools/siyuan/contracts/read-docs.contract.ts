import { z } from "zod";

export const readDocsInputSchema = z.object({
  docIds: z.array(z.string().trim().min(1).max(256)).min(1).max(20).optional(),
  blockIds: z.array(z.string().trim().min(1).max(256)).min(1).max(20).optional(),
  cursor: z.string().trim().min(1).max(240).optional(),
  maxChars: z.number().int().min(2000).max(100000).optional(),
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

export const readItemSchema = z.object({
  docId: z.string(),
  blockId: z.string().optional(),
  title: z.string(),
  content: z.string(),
  truncated: z.boolean().optional(),
  nextCursor: z.string().optional(),
  contentChars: z.number().int().min(0),
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
    "out_of_scope",
    "invalid_resource_id",
    "invalid_cursor",
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
