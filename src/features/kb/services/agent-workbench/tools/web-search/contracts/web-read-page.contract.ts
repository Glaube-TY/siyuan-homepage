/**
 * Web read page contract — input/output schemas for web_fetch.read_page action.
 * Pure types and schemas. No side effects. No runtime logic.
 */
import { z } from "zod";

// ── Input ──

export const webReadPageInputSchema = z.object({
  url: z.string().trim().min(1).max(2048).refine(
    (v) => /^https?:\/\//.test(v),
    { message: "只支持 http/https URL。" },
  ),
  maxChars: z.number().int().min(2000).max(100000).optional(),
  chunkIndex: z.number().int().min(1).optional(),
  chunkChars: z.number().int().min(2000).max(30000).optional(),
  chunkCount: z.number().int().min(1).max(100).optional(),
}).strict();

export type WebReadPageInput = z.infer<typeof webReadPageInputSchema>;

// ── Output ──

export const webLinkSchema = z.object({
  text: z.string(),
  url: z.string(),
  source: z.literal("anchor"),
}).strict();

export type WebLink = z.infer<typeof webLinkSchema>;

export const webChunkMetaSchema = z.object({
  index: z.number().int().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  charCount: z.number().int().min(0),
}).strict();

export type WebChunkMeta = z.infer<typeof webChunkMetaSchema>;

export const webReadPageOutputSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  text: z.string(),
  markdownChars: z.number().int().min(0),
  textChars: z.number().int().min(0).optional(),
  truncated: z.boolean(),
  fetchedAt: z.string(),
  sourceName: z.string().optional(),
  links: z.array(webLinkSchema),
  fullMarkdownChars: z.number().int().min(0),
  returnedMarkdownChars: z.number().int().min(0),
  chunkIndex: z.number().int().min(1),
  chunkCount: z.number().int().min(1),
  chunkStart: z.number().int().min(0),
  chunkEnd: z.number().int().min(0),
  hasPrevChunk: z.boolean(),
  hasNextChunk: z.boolean(),
  chunks: z.array(webChunkMetaSchema),
}).strict();

export type WebReadPageOutput = z.infer<typeof webReadPageOutputSchema>;

// ── JSON Schema override (for Agent) ──

export const webReadPageInputJsonSchemaOverride = {
  type: "object" as const,
  properties: {
    url: {
      type: "string",
      minLength: 1,
      maxLength: 2048,
      description: "要读取的网页 URL（http/https）。必须是公开可访问地址；本机、内网、链路本地和云元数据地址会被拒绝。",
    },
    chunkIndex: {
      type: "integer",
      minimum: 1,
      description: "要返回的块序号，从 1 开始。默认 1。",
    },
    chunkChars: {
      type: "integer",
      minimum: 2000,
      maximum: 30000,
      description: "每块字符数，默认 12000。",
    },
    chunkCount: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description: "指定总块数。若提供，优先于 chunkChars。",
    },
  },
  required: ["url"],
  additionalProperties: false,
};
