import { z } from "zod";

const reviewFieldSchema = z.object({
  label: z.string().trim().min(1).max(100),
  content: z.string().max(10000),
}).strict();

export const manageDiaryReviewInputSchema = z.object({
  operation: z.enum(["save_content", "set_status"]),
  docId: z.string().trim().min(1),
  period: z.enum(["day", "week", "month", "year"]),
  fields: z.array(reviewFieldSchema).min(1).max(10).optional(),
  status: z.enum(["completed", "pending", "skipped"]).optional(),
}).strict().superRefine((value, ctx) => {
  switch (value.operation) {
    case "save_content":
      if (!value.fields || value.fields.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "save_content 操作必须提供至少 1 个 fields。", path: ["fields"] });
      }
      break;
    case "set_status":
      if (!value.status) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_status 操作必须提供 status。", path: ["status"] });
      }
      break;
  }
});

export type ManageDiaryReviewInput = z.infer<typeof manageDiaryReviewInputSchema>;

export const manageDiaryReviewOutputSchema = z.object({
  operation: z.string(),
  changed: z.boolean(),
  docId: z.string(),
  period: z.string(),
  updatedFieldCount: z.number().int().min(0).optional(),
  status: z.string().optional(),
  message: z.string(),
}).strict();

export type ManageDiaryReviewOutput = z.infer<typeof manageDiaryReviewOutputSchema>;
