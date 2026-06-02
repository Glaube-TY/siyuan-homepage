/**
 * Block Structure
 *
 * 只读 blocks 表操作函数，为 Agentic RAG 工具层提供块结构查询能力。
 *
 * 职责：
 * - 通过 safeSqlSelect / escapeSqlString 读取 blocks 表，不直接 import api.ts
 * - 定义只读 BlockLite 类型
 * - 提供块级上下文查询函数
 * - 不使用 hpath，不使用 name/alias
 */

import { safeSqlSelect, escapeSqlString } from "./safe-sql";

export interface BlockLite {
  id: string;
  root_id: string;
  parent_id: string;
  box: string;
  path: string;
  type: string;
  subtype: string;
  content: string;
  sort: number;
  created: string;
  updated: string;
}

const BLOCK_COLUMNS =
  "id, root_id, parent_id, box, path, type, subtype, content, sort, created, updated";

export async function getBlocksByIdsReadonly(blockIds: string[]): Promise<BlockLite[]> {
  if (blockIds.length === 0) return [];

  const uniqueIds = [...new Set(blockIds)];
  const idList = uniqueIds.map((id) => `'${escapeSqlString(id)}'`).join(",");

  return safeSqlSelect<BlockLite>(
    `select ${BLOCK_COLUMNS} from blocks where id in (${idList})`,
    { maxLimit: 200, allowedTables: ["blocks"] }
  );
}

export async function getDocTitleBlockReadonly(docId: string): Promise<BlockLite | undefined> {
  const safeId = escapeSqlString(docId);
  const rows = await safeSqlSelect<BlockLite>(
    `select ${BLOCK_COLUMNS} from blocks where id = '${safeId}' and type = 'd'`,
    { maxLimit: 1, allowedTables: ["blocks"] }
  );
  return rows.length > 0 ? rows[0] : undefined;
}

export async function getSiblingBlocksReadonly(
  rootId: string,
  sort: number,
  before: number,
  after: number
): Promise<BlockLite[]> {
  const safeRoot = escapeSqlString(rootId);
  const clampedBefore = Math.min(Math.max(0, before), 20);
  const clampedAfter = Math.min(Math.max(0, after), 20);

  if (clampedBefore === 0 && clampedAfter === 0) return [];

  const previous = clampedBefore > 0
    ? await safeSqlSelect<BlockLite>(
        `select ${BLOCK_COLUMNS} from blocks where root_id = '${safeRoot}' and sort < ${sort} order by sort desc limit ${clampedBefore}`,
        { maxLimit: clampedBefore, allowedTables: ["blocks"] }
      )
    : [];

  const next = clampedAfter > 0
    ? await safeSqlSelect<BlockLite>(
        `select ${BLOCK_COLUMNS} from blocks where root_id = '${safeRoot}' and sort > ${sort} order by sort asc limit ${clampedAfter}`,
        { maxLimit: clampedAfter, allowedTables: ["blocks"] }
      )
    : [];

  return [...previous.reverse(), ...next];
}

export async function getChildBlocksByParentReadonly(
  parentId: string,
  limit: number
): Promise<BlockLite[]> {
  const safeParent = escapeSqlString(parentId);
  return safeSqlSelect<BlockLite>(
    `select ${BLOCK_COLUMNS} from blocks where parent_id = '${safeParent}' order by sort asc limit ${limit}`,
    { maxLimit: limit, allowedTables: ["blocks"] }
  );
}

export async function getParentBlockReadonly(parentId: string): Promise<BlockLite | undefined> {
  if (!parentId) return undefined;
  const safeParent = escapeSqlString(parentId);
  const rows = await safeSqlSelect<BlockLite>(
    `select ${BLOCK_COLUMNS} from blocks where id = '${safeParent}'`,
    { maxLimit: 1, allowedTables: ["blocks"] }
  );
  return rows.length > 0 ? rows[0] : undefined;
}

export async function getNearestHeadingBlocksReadonly(
  rootId: string,
  sort: number,
  limit: number
): Promise<BlockLite[]> {
  const safeRoot = escapeSqlString(rootId);
  const rows = await safeSqlSelect<BlockLite>(
    `select ${BLOCK_COLUMNS} from blocks where root_id = '${safeRoot}' and type = 'h' and sort <= ${sort} order by sort desc limit ${limit}`,
    { maxLimit: limit, allowedTables: ["blocks"] }
  );
  return rows.reverse();
}

export async function getDocOutlineBlocksReadonly(
  docId: string,
  maxHeadings: number
): Promise<BlockLite[]> {
  const safeDocId = escapeSqlString(docId);
  return safeSqlSelect<BlockLite>(
    `select ${BLOCK_COLUMNS} from blocks where root_id = '${safeDocId}' and type = 'h' order by sort asc limit ${maxHeadings}`,
    { maxLimit: maxHeadings, allowedTables: ["blocks"] }
  );
}
