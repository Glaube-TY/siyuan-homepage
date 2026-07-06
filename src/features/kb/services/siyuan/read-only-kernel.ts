/**
 * Read-Only Kernel
 *
 * 只读 API facade，为 Agent Workbench 工具层提供思源只读能力边界。
 *
 * 职责：
 * - 只导出只读函数，命名加 Readonly 后缀
 * - 不导出、不包装、不引用任何写入 API
 * - getBlockByIdReadonly 通过 safeSqlSelect 查询，不使用 api.ts 的不安全 getBlockByID
 * - 只包装少量只读块/路径 API，用于检索结果补全
 * - raw SQL 调用通过 safe-sql.ts 封装
 */

import {
  exportMdContent,
  getBlockInfo,
  getBlockKramdown,
  getBlockAttrs,
  getNotebookConf,
  lsNotebooks,
  renderSprig,
  listDocsByPath,
  getChildBlocks,
  fullTextSearchBlock,
  getHPathByIDChecked,
  getPathByID,
  getBacklink,
  getTag,
  searchTag,
  type GetBacklinkPayload,
  type GetTagPayload,
  type Tag,
  type FullTextSearchBlockOptions,
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

export async function getBlockInfoReadonly(id: BlockId) {
  return getBlockInfo(id);
}

export async function getHPathByIDReadonly(id: BlockId) {
  return getHPathByIDChecked(id);
}

export async function getPathByIDReadonly(id: BlockId) {
  return getPathByID(id);
}

export async function getBlockByIdReadonly(blockId: string): Promise<Record<string, unknown> | undefined> {
  const safeId = escapeSqlString(blockId);
  const rows = await safeSqlSelect(
    `select id, root_id, parent_id, box, path, type, subtype, content, tag, created, updated, hash from blocks where id = '${safeId}'`,
    { maxLimit: 1, allowedTables: ["blocks"] }
  );
  return rows.length > 0 ? rows[0] : undefined;
}

const KERNEL_SEARCH_DEFAULT_PAGE_SIZE = 64;
const KERNEL_SEARCH_MAX_PAGE_SIZE = 64;
const KERNEL_SEARCH_DEFAULT_MAX_PAGES = 3;
const KERNEL_SEARCH_MAX_PAGES = 3;
const KERNEL_SEARCH_DEFAULT_MAX_ROWS = 150;
const KERNEL_SEARCH_MAX_ROWS = 150;

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value as number), max);
}

export interface KernelSearchReadonlyOptions extends FullTextSearchBlockOptions {
  query: string;
}

export async function kernelSearchReadonly(options: KernelSearchReadonlyOptions) {
  const method = options.method ?? 0;
  if (method === 2) {
    throw new Error("kernelSearchReadonly 禁止使用 method=2 SQL 模式");
  }

  const page = clampPositiveInteger(options.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInteger(
    options.pageSize,
    KERNEL_SEARCH_DEFAULT_PAGE_SIZE,
    KERNEL_SEARCH_MAX_PAGE_SIZE,
  );

  const searchOptions: FullTextSearchBlockOptions = {
    page,
    pageSize,
    method,
    orderBy: options.orderBy ?? 7,
    groupBy: options.groupBy ?? 0,
    types: options.types,
    subTypes: options.subTypes,
    paths: options.paths,
  };

  const result = await fullTextSearchBlock(options.query, searchOptions);
  if (result === null && options.orderBy === undefined && searchOptions.orderBy === 7) {
    const fallbackOptions: FullTextSearchBlockOptions = {
      ...searchOptions,
      orderBy: undefined,
    };
    return fullTextSearchBlock(options.query, fallbackOptions);
  }
  return result;
}

export async function fullTextSearchBlockReadonly(
  query: string,
  pageOrOptions: number | Omit<KernelSearchReadonlyOptions, "query"> = 1,
) {
  if (typeof pageOrOptions === "number") {
    return kernelSearchReadonly({ query, page: pageOrOptions });
  }
  return kernelSearchReadonly({ query, ...pageOrOptions });
}

export interface FullTextSearchPagedOptions extends Omit<KernelSearchReadonlyOptions, "query" | "page"> {
  /** Maximum number of pages to fetch. Default 3, hard-capped at 3. */
  maxPages?: number;
  /** Maximum total block results to collect. Default 150, hard-capped at 150. */
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
  const maxPages = clampPositiveInteger(
    options?.maxPages,
    KERNEL_SEARCH_DEFAULT_MAX_PAGES,
    KERNEL_SEARCH_MAX_PAGES,
  );
  const maxRows = clampPositiveInteger(
    options?.maxRows,
    KERNEL_SEARCH_DEFAULT_MAX_ROWS,
    KERNEL_SEARCH_MAX_ROWS,
  );
  const pageSize = clampPositiveInteger(
    options?.pageSize,
    KERNEL_SEARCH_DEFAULT_PAGE_SIZE,
    KERNEL_SEARCH_MAX_PAGE_SIZE,
  );

  const seen = new Set<string>();
  const allBlocks: NonNullable<Awaited<ReturnType<typeof fullTextSearchBlock>>["blocks"]> = [];
  let totalMatchCount = 0;
  let totalDocCount = 0;
  let totalPageCount = 0;

  for (let page = 1; page <= maxPages; page++) {
    const result = await kernelSearchReadonly({
      query,
      page,
      pageSize,
      method: options?.method ?? 0,
      orderBy: options?.orderBy ?? 7,
      groupBy: options?.groupBy ?? 0,
      types: options?.types,
      subTypes: options?.subTypes,
      paths: options?.paths,
    });
    if (!result || !result.blocks || result.blocks.length === 0) {
      break;
    }

    if (page === 1) {
      totalMatchCount = result.matchedBlockCount ?? result.matchCount ?? 0;
      totalDocCount = result.matchedRootCount ?? result.docCount ?? 0;
      totalPageCount = result.pageCount ?? 0;
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

    if (result.pageCount && page >= result.pageCount) {
      break;
    }

    if (result.blocks.length < pageSize) {
      break;
    }
  }

  return {
    blocks: allBlocks,
    matchCount: totalMatchCount,
    docCount: totalDocCount,
    matchedBlockCount: totalMatchCount,
    matchedRootCount: totalDocCount,
    pageCount: totalPageCount,
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
