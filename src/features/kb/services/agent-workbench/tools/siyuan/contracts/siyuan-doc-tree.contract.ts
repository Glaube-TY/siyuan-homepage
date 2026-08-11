import { z } from "zod";
import { stringArraySchema } from "./siyuan-common.contract";

function normalizeSiyuanDocTreeInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const raw = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...raw };
  if (normalized.notebook === undefined && typeof raw.notebookId === "string") {
    normalized.notebook = raw.notebookId;
  }
  delete normalized.notebookId;

  // 模型已明确给出笔记本 ID、但省略内部动作时，只能安全推断为只读的整树查看。
  // 写入动作不做任何默认推断，继续走原有严格校验与确认。
  if (normalized.action === undefined && typeof normalized.notebook === "string") {
    normalized.action = "list_tree";
  }
  return normalized;
}

export const siyuanDocTreeInputSchema = z.preprocess(normalizeSiyuanDocTreeInput, z.object({
  action: z.enum(["list_children", "list_tree", "move", "move_by_id", "duplicate", "sort"]),
  notebook: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  fromPaths: z.array(z.string().trim().min(1).max(1024)).max(50).optional(),
  toNotebook: z.string().trim().min(1).max(256).optional(),
  toPath: z.string().trim().max(1024).optional(),
  id: z.string().trim().min(1).max(256).optional(),
  ids: stringArraySchema.max(50).optional(),
  targetID: z.string().trim().min(1).max(256).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.action === "list_children" || value.action === "list_tree") && !value.notebook) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 notebook。`, path: ["notebook"] });
  }
  if (value.action === "move") {
    if (!value.fromPaths || value.fromPaths.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move 需要 fromPaths。", path: ["fromPaths"] });
    }
    if (!value.toNotebook) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move 需要 toNotebook。", path: ["toNotebook"] });
    }
    if (!value.toPath) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move 需要 toPath。", path: ["toPath"] });
    }
  }
  if (value.action === "move_by_id") {
    if (!value.ids || value.ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move_by_id 需要 ids。", path: ["ids"] });
    }
    if (!value.targetID) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "move_by_id 需要 targetID。", path: ["targetID"] });
    }
  }
  if (value.action === "duplicate") {
    if (!value.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate 需要源文档 docId（字段 id）。",
        path: ["id"],
      });
    }
  }
  if (value.action === "sort") {
    if (!value.notebook) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sort 需要 notebook。", path: ["notebook"] });
    }
    if (!value.fromPaths || value.fromPaths.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sort 需要文档存储路径数组 fromPaths，不接受文档 ID。", path: ["fromPaths"] });
    }
  }
}));

export type SiyuanDocTreeInput = z.infer<typeof siyuanDocTreeInputSchema>;
