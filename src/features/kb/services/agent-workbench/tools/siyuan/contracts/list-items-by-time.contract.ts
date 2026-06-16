import { z } from "zod";

const blockTypeValues = [
  "p", "h", "l", "i", "b", "c", "m", "t", "s", "html", "tb", "widget", "iframe", "query_embed", "super",
] as const;

export const listItemsByTimeInputSchema = z.object({
  itemType: z.enum(["doc", "block"]),
  sortBy: z.enum(["updated", "created"]).optional().default("updated"),
  order: z.enum(["desc", "asc"]).optional().default("desc"),
  limit: z.number().int().min(1).max(100).optional().default(20),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  blockTypes: z.array(z.enum(blockTypeValues)).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.itemType === "doc" && value.blockTypes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "itemType=\"doc\" 时不支持 blockTypes 参数，请去掉。", path: ["blockTypes"] });
  }
});

export type ListItemsByTimeInput = z.infer<typeof listItemsByTimeInputSchema>;

export const listTimeItemSchema = z.object({
  itemType: z.enum(["doc", "block"]),
  time: z.string(),
  docId: z.string(),
  docTitle: z.string(),
  blockId: z.string().optional(),
  blockType: z.string().optional(),
  blockSubType: z.string().optional(),
  contentPreview: z.string().optional(),
}).strict();

export type ListTimeItem = z.infer<typeof listTimeItemSchema>;

export const listItemsByTimeOutputSchema = z.object({
  itemType: z.enum(["doc", "block"]),
  sortBy: z.enum(["updated", "created"]),
  order: z.enum(["desc", "asc"]),
  returnedCount: z.number().int().min(0),
  truncated: z.boolean(),
  timeRange: z.object({
    field: z.enum(["updated", "created"]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  }).optional(),
  items: z.array(listTimeItemSchema),
  note: z.string().optional(),
}).strict();

export type ListItemsByTimeOutput = z.infer<typeof listItemsByTimeOutputSchema>;
