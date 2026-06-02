/**
 * Read-Only Kernel
 *
 * 只读 API facade，为 Agentic RAG 工具层提供思源只读能力边界。
 *
 * 职责：
 * - 只导出只读函数，命名加 Readonly 后缀
 * - 不导出、不包装、不引用任何写入 API
 * - getBlockByIdReadonly 通过 safeSqlSelect 查询，不使用 api.ts 的不安全 getBlockByID
 * - 不使用 hpath 相关 API
 * - raw SQL 调用通过 safe-sql.ts 封装
 */

import {
  exportMdContent,
  getBlockKramdown,
  getBlockAttrs,
  getNotebookConf,
  lsNotebooks,
  renderSprig,
  listDocsByPath,
  getChildBlocks,
  fullTextSearchBlock,
} from "@/api";
import { safeSqlSelect, escapeSqlString, type SafeSqlSelectOptions } from "./safe-sql";

export async function sqlSelectReadonly<T = Record<string, unknown>>(
  stmt: string,
  options?: SafeSqlSelectOptions
): Promise<T[]> {
  return safeSqlSelect<T>(stmt, options);
}

export async function exportMdContentReadonly(id: DocumentId) {
  return exportMdContent(id);
}

export async function getBlockKramdownReadonly(id: BlockId) {
  return getBlockKramdown(id);
}

export async function getBlockAttrsReadonly(id: BlockId) {
  return getBlockAttrs(id);
}

export async function getNotebookConfReadonly(notebook: NotebookId) {
  return getNotebookConf(notebook);
}

export async function lsNotebooksReadonly() {
  return lsNotebooks();
}

export async function renderSprigReadonly(template: string) {
  return renderSprig(template);
}

export async function listDocsByPathReadonly(notebook: NotebookId, path: string) {
  return listDocsByPath(notebook, path);
}

export async function getChildBlocksReadonly(id: BlockId) {
  return getChildBlocks(id);
}

export async function getBlockByIdReadonly(blockId: string): Promise<Record<string, unknown> | undefined> {
  const safeId = escapeSqlString(blockId);
  const rows = await safeSqlSelect(
    `select id, root_id, parent_id, box, path, type, subtype, content, tag, created, updated, hash from blocks where id = '${safeId}'`,
    { maxLimit: 1, allowedTables: ["blocks"] }
  );
  return rows.length > 0 ? rows[0] : undefined;
}

export async function fullTextSearchBlockReadonly(query: string, page: number = 0) {
  return fullTextSearchBlock(query, page);
}
