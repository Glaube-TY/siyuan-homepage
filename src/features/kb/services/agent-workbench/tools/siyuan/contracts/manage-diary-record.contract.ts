import { z } from "zod";

const targetSchema = z.object({
  recordId: z.string().trim().min(1).optional(),
  headingBlockId: z.string().trim().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export const manageDiaryRecordInputSchema = z.object({
  operation: z.enum(["add", "update", "delete"]),
  target: targetSchema.optional(),
  categoryTitle: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1).max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  projectTargetId: z.string().trim().min(1).optional(),
  isKeyRecord: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  switch (value.operation) {
    case "add":
      if (!value.categoryTitle) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "add 操作必须提供 categoryTitle。", path: ["categoryTitle"] });
      }
      if (!value.content) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "add 操作必须提供 content。", path: ["content"] });
      }
      break;
    case "update":
      if (!value.content && value.tags === undefined && value.projectTargetId === undefined && value.isKeyRecord === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "update 操作必须提供 content、tags、projectTargetId 或 isKeyRecord。", path: ["content"] });
      }
      if (!value.target?.recordId && !value.target?.headingBlockId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "update 操作必须提供 target.recordId 或 target.headingBlockId。", path: ["target"] });
      }
      break;
    case "delete":
      if (!value.target?.recordId && !value.target?.headingBlockId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "delete 操作必须提供 target.recordId 或 target.headingBlockId。", path: ["target"] });
      }
      break;
  }
});

export type ManageDiaryRecordInput = z.infer<typeof manageDiaryRecordInputSchema>;

export const manageDiaryRecordOutputSchema = z.object({
  operation: z.string(),
  changed: z.boolean(),
  recordId: z.string().optional(),
  headingBlockId: z.string().optional(),
  categoryTitle: z.string().optional(),
  date: z.string().optional(),
  message: z.string(),
  tags: z.array(z.string()).optional(),
  projectTargetId: z.string().optional(),
  projectName: z.string().optional(),
  projectPath: z.array(z.string()).optional(),
  isKeyRecord: z.boolean().optional(),
}).strict();

export type ManageDiaryRecordOutput = z.infer<typeof manageDiaryRecordOutputSchema>;
