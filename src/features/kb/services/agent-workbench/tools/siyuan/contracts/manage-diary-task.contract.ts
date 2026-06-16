import { z } from "zod";

const targetSchema = z.object({
  blockId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
}).strict();

const taskFieldsSchema = z.object({
  taskname: z.string().trim().min(1).max(200).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recurrence: z.string().trim().max(100).optional(),
  reminder: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
}).strict();

const clearableField = z.enum(["priority", "startDate", "deadline", "recurrence", "reminder", "location", "tags"]);

export const manageDiaryTaskInputSchema = z.object({
  operation: z.enum(["create", "migrate", "set_status", "update", "postpone", "delete"]),
  target: targetSchema.optional(),
  task: taskFieldsSchema.optional(),
  clearFields: z.array(clearableField).optional(),
  completed: z.boolean().optional(),
  postponeTo: z.enum(["tomorrow", "next_week"]).optional(),
  deleteMode: z.enum(["log", "delete"]).optional(),
}).strict().superRefine((value, ctx) => {
  switch (value.operation) {
    case "create":
      if (!value.task?.taskname) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "create 操作必须提供 task.taskname。", path: ["task", "taskname"] });
      }
      break;
    case "migrate":
      if (!value.target?.blockId && !value.target?.taskId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "migrate 操作必须提供 target.blockId 或 target.taskId。", path: ["target"] });
      }
      break;
    case "set_status":
      if (!value.target?.blockId && !value.target?.taskId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_status 操作必须提供 target.blockId 或 target.taskId。", path: ["target"] });
      }
      if (value.completed === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_status 操作必须提供 completed。", path: ["completed"] });
      }
      break;
    case "update":
      if (!value.target?.blockId && !value.target?.taskId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "update 操作必须提供 target.blockId 或 target.taskId。", path: ["target"] });
      }
      if ((!value.task || Object.keys(value.task).length === 0) && (!value.clearFields || value.clearFields.length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "update 操作必须提供至少一个 task 字段或 clearFields。", path: ["task"] });
      }
      break;
    case "postpone":
      if (!value.target?.blockId && !value.target?.taskId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "postpone 操作必须提供 target.blockId 或 target.taskId。", path: ["target"] });
      }
      if (!value.postponeTo) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "postpone 操作必须提供 postponeTo。", path: ["postponeTo"] });
      }
      break;
    case "delete":
      if (!value.target?.blockId && !value.target?.taskId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "delete 操作必须提供 target.blockId 或 target.taskId。", path: ["target"] });
      }
      break;
  }
});

export type ManageDiaryTaskInput = z.infer<typeof manageDiaryTaskInputSchema>;

export const manageDiaryTaskOutputSchema = z.object({
  operation: z.string(),
  changed: z.boolean(),
  taskId: z.string().optional(),
  blockId: z.string().optional(),
  taskname: z.string().optional(),
  docId: z.string().optional(),
  message: z.string(),
}).strict();

export type ManageDiaryTaskOutput = z.infer<typeof manageDiaryTaskOutputSchema>;
