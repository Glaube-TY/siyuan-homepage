import { z } from "zod";

export const siyuanDatabaseViewInputSchema = z.object({
  action: z.enum(["set_database_block_view", "sort_key", "sort_view_key", "change_layout", "set_group"]),
  avID: z.string().trim().min(1).max(256).optional(),
  blockID: z.string().trim().min(1).max(256).optional(),
  viewID: z.string().trim().min(1).max(256).optional(),
  keyID: z.string().trim().min(1).max(256).optional(),
  previousKeyID: z.string().trim().min(1).max(256).optional(),
  layoutType: z.enum(["table", "gallery", "kanban"]).optional(),
  group: z.object({
    field: z.string().trim().min(1).max(256),
    method: z.number().int().min(0).max(6),
    range: z.object({
      numStart: z.number(),
      numEnd: z.number(),
      numStep: z.number().positive(),
    }).strict().optional(),
    order: z.number().int().min(0).max(3),
    hideEmpty: z.boolean(),
  }).strict().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "set_database_block_view") {
    if (!value.avID) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_database_block_view 需要数据库 ID avID。", path: ["avID"] });
    if (!value.blockID) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_database_block_view 需要数据库块 ID blockID。", path: ["blockID"] });
    if (!value.viewID) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_database_block_view 需要视图 ID viewID。", path: ["viewID"] });
  }
  if (["sort_key", "sort_view_key", "change_layout", "set_group"].includes(value.action) && !value.avID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要数据库 ID avID。`, path: ["avID"] });
  }
  if (value.action === "sort_view_key" && !value.viewID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要视图 ID viewID。`, path: ["viewID"] });
  }
  if (["sort_key", "sort_view_key"].includes(value.action) && !value.keyID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要字段 ID keyID。`, path: ["keyID"] });
  }
  if (["change_layout", "set_group"].includes(value.action) && !value.blockID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要数据库块 ID blockID。`, path: ["blockID"] });
  }
  if (value.action === "change_layout" && !value.layoutType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "change_layout 需要 layoutType：table、gallery 或 kanban。", path: ["layoutType"] });
  }
  if (value.action === "set_group" && value.group === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_group 需要完整分组配置 group；传 null 表示清除分组。", path: ["group"] });
  }
});

export type SiyuanDatabaseViewInput = z.infer<typeof siyuanDatabaseViewInputSchema>;
