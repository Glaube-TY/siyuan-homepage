/**
 * Web search contract — input/output schemas for web_search tool.
 * Pure types and schemas. No side effects. No runtime logic.
 */
import { z } from "zod";

// ── Input ──

export const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).optional().default(5),
}).strict();

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

// ── Output ──

export const webSearchCandidateSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional(),
  sourceName: z.string().optional(),
  provider: z.enum(["anysearch", "custom_json", "tavily"]),
  contentPreview: z.string().optional(),
  contentChars: z.number().int().min(0).optional(),
  contentTruncated: z.boolean().optional(),
}).strict();

export type WebSearchCandidate = z.infer<typeof webSearchCandidateSchema>;

export const webSearchOutputSchema = z.object({
  results: z.array(webSearchCandidateSchema),
  totalReturned: z.number().int().min(0),
  fetchedAt: z.string(),
  note: z.string().optional(),
}).strict();

export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;

// ── JSON Schema override (for Planner) ──

export const webSearchInputJsonSchemaOverride = {
  type: "object" as const,
  properties: {
    query: { type: "string", minLength: 1, maxLength: 500 },
    limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
  },
  required: ["query"],
  additionalProperties: false,
};
