import { z } from "zod";

export const searchScopeInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional().default(20),
}).strict();

export type SearchScopeInput = z.infer<typeof searchScopeInputSchema>;

export const searchCandidateSchema = z.object({
  docId: z.string(),
  blockId: z.string().optional(),
  title: z.string(),
  location: z.string().optional(),
  preview: z.string().optional(),
  matchedText: z.string().optional(),
  rank: z.number().int().min(1),
  matchReason: z.enum(["title", "content"]).optional(),
}).strict();

export type SearchCandidate = z.infer<
  typeof searchCandidateSchema
>;

export const searchScopeOutputSchema = z.object({
  query: z.string(),
  candidates: z.array(searchCandidateSchema),
  hitCount: z.number().int().min(0).optional(),
  candidateDocCount: z.number().int().min(0).optional(),
  returnedCandidateCount: z.number().int().min(0).optional(),
  note: z.string().optional(),
  summary: z.string().optional(),
  warnings: z.array(z.string()).optional(),
}).strict();

export type SearchScopeOutput = z.infer<typeof searchScopeOutputSchema>;
