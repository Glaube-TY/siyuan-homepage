import { getHPathByID, lsNotebooks } from "@/api";
import type { DocContentEditDisplayItem } from "./doc-content-edit-types";

const SIYUAN_TIMESTAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

export function formatSiyuanTimestamp(value: string | undefined): string | undefined {
  const matched = value?.match(SIYUAN_TIMESTAMP);
  if (!matched) return undefined;
  const [, year, month, day, hour, minute] = matched;
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export async function resolveDisplayPath(blockId: string, fallback?: string): Promise<string | undefined> {
  try {
    const path = await getHPathByID(blockId);
    if (typeof path === "string" && path.trim()) return path.trim();
  } catch {
    // 展示信息解析失败不能阻断原写入链路。
  }
  return fallback?.trim() || undefined;
}

export async function resolveNotebookName(notebookId: string): Promise<string | undefined> {
  try {
    const result = await lsNotebooks();
    return result.notebooks.find((notebook) => notebook.id === notebookId)?.name;
  } catch {
    return undefined;
  }
}

export function blockDisplayItem(
  block: Pick<Block, "type" | "content" | "markdown" | "created" | "updated">,
  path?: string,
  notebookName?: string,
): DocContentEditDisplayItem {
  const content = (block.content || block.markdown || "").trim();
  const title = content.split("\n")[0]?.slice(0, 100) || "未命名内容";
  const kind: DocContentEditDisplayItem["kind"] = block.type === "d"
    ? "文档"
    : block.type === "av"
      ? "数据库"
      : "内容块";
  return {
    kind,
    title,
    notebookName,
    path,
    excerpt: block.type === "d" ? undefined : content.slice(0, 240),
    createdAt: formatSiyuanTimestamp(block.created),
    updatedAt: formatSiyuanTimestamp(block.updated),
  };
}
