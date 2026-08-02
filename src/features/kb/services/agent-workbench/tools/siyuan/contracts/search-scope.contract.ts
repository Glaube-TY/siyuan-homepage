import { z } from "zod";

const rawSearchScopeInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional().default(20),
  // 旧提示和部分模型会主动附带 scope。真实范围始终由聊天模式注入，
  // 因此兼容接收但不允许它覆盖运行时 AgentScope。
  scope: z.string().trim().max(64).optional(),
}).strict();

export const searchScopeInputSchema = rawSearchScopeInputSchema.transform(({ scope: _scope, ...input }) => input);

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
