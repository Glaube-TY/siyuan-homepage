import { z } from "zod";

export const getConversationUsedReferencesInputSchema = z.object({}).strict();

export type GetConversationUsedReferencesInput = z.infer<
  typeof getConversationUsedReferencesInputSchema
>;

export const plannerVisibleConversationReferenceSchema = z.object({
  handle: z.string(),
  title: z.string(),
  preview: z.string().optional(),
  usedCount: z.number().int().min(0).optional(),
}).strict();

export type PlannerVisibleConversationReference = z.infer<
  typeof plannerVisibleConversationReferenceSchema
>;

export const getConversationUsedReferencesOutputSchema = z.object({
  references: z.array(plannerVisibleConversationReferenceSchema),
  referenceCount: z.number().int().min(0),
  returnedReferenceCount: z.number().int().min(0),
  totalTurnsAvailable: z.number().int().min(0),
  truncated: z.boolean(),
}).strict();

export type GetConversationUsedReferencesOutput = z.infer<
  typeof getConversationUsedReferencesOutputSchema
>;
