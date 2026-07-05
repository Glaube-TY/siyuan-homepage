import { z } from "zod";

const DISPOSABLE_MARKERS = ["nb_agent", "notebrain_agent", "notebrain_test", "notebrain-agent-test"];

function normalizeAssetPath(raw: string): string {
  let path = raw.trim().replace(/\\/g, "/");
  if (path.startsWith("/assets/")) {
    path = `/data${path}`;
  } else if (path.startsWith("assets/")) {
    path = `/data/${path}`;
  }
  return path.replace(/\/+/g, "/");
}

export function isDisposableAssetPath(raw: string): boolean {
  const path = normalizeAssetPath(raw);
  if (path.includes("..") || path.includes("/..") || path.includes("../")) {
    return false;
  }
  if (/^[a-zA-Z]:\//.test(path) || path.startsWith("//")) {
    return false;
  }
  if (!path.startsWith("/data/assets/")) {
    return false;
  }
  const lower = path.toLowerCase();
  return DISPOSABLE_MARKERS.some((marker) => lower.includes(marker));
}

export const siyuanAssetManageInputSchema = z.object({
  action: z.enum(["rename", "set_annotation", "set_image_ocr", "ocr", "remove_unused_one", "remove_unused_batch", "full_reindex_content"]),
  path: z.string().trim().max(1024).optional(),
  paths: z.array(z.string().trim().min(1).max(1024)).max(20).optional(),
  newName: z.string().trim().min(1).max(255).optional(),
  annotation: z.string().max(20000).optional(),
  text: z.string().max(20000).optional(),
  confirmGlobal: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  switch (value.action) {
    case "rename":
    case "set_annotation":
    case "set_image_ocr":
    case "ocr":
      if (typeof value.path !== "string" || value.path.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${value.action} 需要 path。`, path: ["path"] });
      }
      break;
    case "remove_unused_one": {
      if (typeof value.path !== "string" || value.path.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "remove_unused_one 需要 path。", path: ["path"] });
      } else if (!isDisposableAssetPath(value.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "remove_unused_one 只能删除本轮 disposable 测试资源（路径需包含 nb_agent / notebrain_agent / notebrain_test / notebrain-agent-test）。",
          path: ["path"],
        });
      }
      break;
    }
    case "remove_unused_batch": {
      if (!Array.isArray(value.paths) || value.paths.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "remove_unused_batch 需要非空 paths。", path: ["paths"] });
      } else {
        const invalid = value.paths.filter((p) => !isDisposableAssetPath(p));
        if (invalid.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `remove_unused_batch 只能删除本轮 disposable 测试资源；以下路径不满足规则：${invalid.join(", ")}`,
            path: ["paths"],
          });
        }
      }
      break;
    }
    case "full_reindex_content": {
      if (value.confirmGlobal !== true) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "full_reindex_content 是全局索引重建，必须传 confirmGlobal:true。", path: ["confirmGlobal"] });
      }
      break;
    }
  }
});

export type SiyuanAssetManageInput = z.infer<typeof siyuanAssetManageInputSchema>;
