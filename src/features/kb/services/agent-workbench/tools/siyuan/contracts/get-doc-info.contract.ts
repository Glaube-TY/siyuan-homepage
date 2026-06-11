import { z } from "zod";

export const getDocInfoInputSchema = z.object({
  docId: z.string().trim().min(1).max(256),
}).strict();

export type GetDocInfoInput = z.infer<typeof getDocInfoInputSchema>;

export const getDocInfoOutputSchema = z.object({
  docId: z.string(),
  title: z.string(),
  notebookId: z.string().optional(),
  notebookName: z.string().optional(),
  path: z.string().optional(),
  titlePath: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).strict();

export type GetDocInfoOutput = z.infer<typeof getDocInfoOutputSchema>;
