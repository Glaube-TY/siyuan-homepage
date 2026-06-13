/**
 * Read-Only Kernel
 *
 * 只读 API facade，为 Agent Workbench 工具层提供思源只读能力边界。
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
  getBacklink,
  getTag,
  searchTag,
  type GetBacklinkPayload,
  type GetTagPayload,
  type Tag,
} from "@/api";
import { safeSqlSelect, safeSqlSelectPaged, escapeSqlString, type SafeSqlSelectOptions, type SafeSqlPagedOptions } from "./safe-sql";

export async function sqlSelectReadonly<T = Record<string, unknown>>(
  stmt: string,
  options?: SafeSqlSelectOptions
): Promise<T[]> {
  return safeSqlSelect<T>(stmt, options);
}

/**
 * Paged read-only SQL query that bypasses SiYuan's default 64-row truncation.
 * See safeSqlSelectPaged for pagination strategy.
 */
export async function sqlSelectReadonlyPaged<T = Record<string, unknown>>(
  stmt: string,
  options?: SafeSqlPagedOptions
): Promise<T[]> {
  return safeSqlSelectPaged<T>(stmt, options);
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

export interface FullTextSearchPagedOptions {
  /** Maximum number of pages to fetch. Default 5. */
  maxPages?: number;
  /** Maximum total block results to collect. Default 200. */
  maxRows?: number;
}

/**
 * Paged full-text search that fetches multiple pages from SiYuan's kernel API.
 * Bypasses the default single-page (64 results) limit.
 * Returns all unique blocks across pages, deduplicated by block id.
 */
export async function fullTextSearchBlockAllPagesReadonly(
  query: string,
  options?: FullTextSearchPagedOptions,
) {
  const maxPages = options?.maxPages ?? 5;
  const maxRows = options?.maxRows ?? 200;

  const seen = new Set<string>();
  const allBlocks: NonNullable<Awaited<ReturnType<typeof fullTextSearchBlock>>["blocks"]> = [];
  let totalMatchCount = 0;
  let totalDocCount = 0;

  for (let page = 0; page < maxPages; page++) {
    const result = await fullTextSearchBlock(query, page);
    if (!result || !result.blocks || result.blocks.length === 0) {
      break;
    }

    if (page === 0) {
      totalMatchCount = result.matchCount ?? 0;
      totalDocCount = result.docCount ?? 0;
    }

    let addedThisPage = 0;
    for (const block of result.blocks) {
      if (seen.has(block.id)) continue;
      seen.add(block.id);
      allBlocks.push(block);
      addedThisPage++;
      if (allBlocks.length >= maxRows) break;
    }

    // Stop if we've collected enough or this page had no new unique blocks.
    if (allBlocks.length >= maxRows || addedThisPage === 0) {
      break;
    }

    // If the page returned fewer than a full page (64), no more results likely.
    if (result.blocks.length < 64) {
      break;
    }
  }

  return {
    blocks: allBlocks,
    matchCount: totalMatchCount,
    docCount: totalDocCount,
  };
}

export async function getBacklinkReadonly(payload: GetBacklinkPayload) {
  return getBacklink(payload);
}

export type ReadonlyTag = Tag;

export interface ReadonlySearchTagItem {
  rawLabel: string;
  displayLabel: string;
  canonicalName: string;
}

export async function getTagsReadonly(payload: GetTagPayload = { ignoreMaxListHint: true }): Promise<ReadonlyTag[]> {
  return getTag(payload);
}

function stripSearchTagHighlight(value: string): string {
  return value
    .replace(/<\/?mark>/gi, "")
    .replace(/&lt;\/?mark&gt;/gi, "")
    .trim();
}

export async function searchTagsReadonly(k: string = ""): Promise<{ k: string; tags: ReadonlySearchTagItem[] }> {
  const result = await searchTag(k);
  return {
    k: result.k,
    tags: result.tags
      .map((rawLabel) => {
        const displayLabel = stripSearchTagHighlight(rawLabel);
        return {
          rawLabel,
          displayLabel,
          canonicalName: displayLabel.trim(),
        };
      })
      .filter((item) => item.canonicalName.length > 0),
  };
}
