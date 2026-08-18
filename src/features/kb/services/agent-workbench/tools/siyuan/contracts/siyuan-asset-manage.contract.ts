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

/** 内核资源 API 使用 assets/... 逻辑路径；工作区文件 API 才使用 /data/assets/...。 */
export function toSiyuanAssetApiPath(raw: string): string {
  const path = raw.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (path.startsWith("/data/assets/")) return path.slice("/data/".length);
  if (path.startsWith("/assets/")) return path.slice(1);
  return path;
}

/** 工作区文件 API 使用 /data/assets/...；只允许读取资源目录。 */
export function toSiyuanAssetWorkspaceFilePath(raw: string): string {
  const path = toSiyuanAssetApiPath(raw);
  if (!path.startsWith("assets/") || path.includes("..")) {
    throw new Error("[invalid_args] 资源路径必须位于 assets/ 目录。");
  }
  return `/data/${path}`;
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

function getAssetPathWithoutQuery(raw: string): string {
  return raw.trim().replace(/\\/g, "/").split("?", 1)[0];
}

export function getSiyuanAssetExtension(raw: string): string {
  const path = getAssetPathWithoutQuery(raw);
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex > 0 ? basename.slice(dotIndex) : "";
}

export function getSiyuanAssetDisplayName(raw: string): string {
  const path = getAssetPathWithoutQuery(raw);
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const extension = getSiyuanAssetExtension(raw);
  const basenameWithoutExtension = extension ? basename.slice(0, -extension.length) : basename;
  return basenameWithoutExtension.replace(/-\d{14}-\w{7}/, "");
}

export function getSiyuanAssetRenameNameError(path: string, rawName: string): string | undefined {
  const newName = rawName.trim();
  const extension = getSiyuanAssetExtension(path);
  if (/[\\/]/.test(newName)) {
    return "newName 只能填写资源显示名称，不能包含目录路径。";
  }
  if (extension && newName.toLowerCase().endsWith(extension.toLowerCase())) {
    const displayName = newName.slice(0, -extension.length);
    return `newName 应为资源显示名称 ${displayName}，不要包含原扩展名 ${extension}；扩展名由思源自动保留。`;
  }
  if (/-\d{14}-\w{7}$/.test(newName)) {
    return "newName 不应包含思源内部资源唯一后缀 -YYYYMMDDHHMMSS-xxxxxxx；请只填写资源显示名称。";
  }
}

export function isPdfAnnotationAssetPath(raw: string): boolean {
  const path = toSiyuanAssetApiPath(raw).split("?", 1)[0].replace(/\.sya$/i, "");
  return path.toLowerCase().endsWith(".pdf");
}

export const SIYUAN_FILE_ANNOTATION_LIMITS = {
  maxAnnotations: 500,
  maxPagesPerAnnotation: 200,
  maxPositionsPerPage: 2000,
  maxCoordinatesPerPosition: 32,
  maxContentChars: 50000,
  maxStyleChars: 128,
  maxIdsPerAnnotation: 100,
  maxIdChars: 256,
  maxAnnotationIdChars: 256,
} as const;

const siyuanFileAnnotationPageSchema = z.object({
  index: z.number().int().nonnegative(),
  positions: z.array(z.array(z.number().finite()).max(SIYUAN_FILE_ANNOTATION_LIMITS.maxCoordinatesPerPosition)).max(SIYUAN_FILE_ANNOTATION_LIMITS.maxPositionsPerPage),
}).strict();

const siyuanFileAnnotationSchema = z.object({
  pages: z.array(siyuanFileAnnotationPageSchema).max(SIYUAN_FILE_ANNOTATION_LIMITS.maxPagesPerAnnotation),
  color: z.string().max(SIYUAN_FILE_ANNOTATION_LIMITS.maxStyleChars),
  type: z.string().max(SIYUAN_FILE_ANNOTATION_LIMITS.maxStyleChars),
  content: z.string().max(SIYUAN_FILE_ANNOTATION_LIMITS.maxContentChars),
  mode: z.string().max(SIYUAN_FILE_ANNOTATION_LIMITS.maxStyleChars),
  ids: z.array(z.string().max(SIYUAN_FILE_ANNOTATION_LIMITS.maxIdChars)).max(SIYUAN_FILE_ANNOTATION_LIMITS.maxIdsPerAnnotation).optional(),
}).strict();

export const siyuanFileAnnotationMapSchema = z.record(z.string().min(1).max(SIYUAN_FILE_ANNOTATION_LIMITS.maxAnnotationIdChars), siyuanFileAnnotationSchema)
  .refine((value) => Object.keys(value).length <= SIYUAN_FILE_ANNOTATION_LIMITS.maxAnnotations, {
    message: `单次最多设置 ${SIYUAN_FILE_ANNOTATION_LIMITS.maxAnnotations} 条 PDF 标注。`,
  });

export const siyuanAssetManageInputSchema = z.object({
  action: z.enum(["rename", "set_annotation", "set_image_ocr", "ocr", "remove_unused_one", "remove_unused_batch", "full_reindex_content"]),
  path: z.string().trim().max(1024).optional(),
  paths: z.array(z.string().trim().min(1).max(1024)).max(20).optional(),
  newName: z.string().trim().min(1).max(255).describe("资源显示名称/基础名称；不含目录、原扩展名或思源内部唯一后缀，扩展名由 Kernel 自动保留。" ).optional(),
  annotation: siyuanFileAnnotationMapSchema.optional(),
  clear: z.boolean().optional(),
  text: z.string().max(20000).optional(),
  confirmGlobal: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  switch (value.action) {
    case "rename":
      if (typeof value.path !== "string" || value.path.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rename 需要资源路径 path。", path: ["path"] });
      }
      if (typeof value.newName !== "string" || value.newName.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rename 需要不含目录的新文件名 newName。", path: ["newName"] });
      } else if (typeof value.path === "string" && value.path.trim().length > 0) {
        const nameError = getSiyuanAssetRenameNameError(value.path, value.newName);
        if (nameError) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: nameError, path: ["newName"] });
        }
      }
      break;
    case "set_annotation":
      if (typeof value.path !== "string" || value.path.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_annotation 需要 path。", path: ["path"] });
      } else if (!isPdfAnnotationAssetPath(value.path)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_annotation 只支持 PDF 资源或对应的 .pdf.sya 标注文件。", path: ["path"] });
      }
      if (value.clear === true && value.annotation !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_annotation 不能同时传 annotation 和 clear:true。", path: ["clear"] });
      } else if (value.clear !== true && value.annotation === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_annotation 需要 annotation 对象，或传 clear:true 清除全部 PDF 标注。", path: ["annotation"] });
      } else if (value.clear !== true && value.annotation !== undefined && Object.keys(value.annotation).length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "annotation 不能为空对象；清除全部 PDF 标注请使用 clear:true。", path: ["annotation"] });
      }
      break;
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
