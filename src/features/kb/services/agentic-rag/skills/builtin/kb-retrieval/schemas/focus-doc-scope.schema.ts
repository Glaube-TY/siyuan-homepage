import { z } from "zod";

export const plannerVisibleScopeDocSchema = z.object({
  docId: z.string(),
  title: z.string(),
  depth: z.number().int().min(0).optional(),
  childCount: z.number().int().min(0).optional(),
}).strict();

export type PlannerVisibleScopeDoc = z.infer<typeof plannerVisibleScopeDocSchema>;

export const focusDocScopeModeSchema = z.enum(["exact", "subtree", "siblings", "notebook"]);

export const focusDocScopeInputSchema = z.object({
  docIds: z.array(z.string().trim().min(1).max(256)).min(1).max(20),
  mode: focusDocScopeModeSchema.optional().default("subtree"),
  maxDocIds: z.number().int().min(1).max(200).optional().default(80),
}).strict();

export type FocusDocScopeInput = z.infer<typeof focusDocScopeInputSchema>;

export const focusDocScopeOutputSchema = z.object({
  docs: z.array(plannerVisibleScopeDocSchema),
  focusedDocCount: z.number().int().min(0),
  mode: focusDocScopeModeSchema,
  truncated: z.boolean(),
}).strict();

export type FocusDocScopeOutput = z.infer<typeof focusDocScopeOutputSchema>;
