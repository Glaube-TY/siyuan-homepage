/**
 * 思源 SQL 块级召回工具
 *
 * 提供思源 blocks 表的块级召回能力，供 Agent Core 检索工具和 hybrid search 使用。
 *
 * 核心原则：
 * - content 是检索主字段
 * - tag 可参与检索
 * - 不查询 markdown / name / alias / hpath
 * - path 只用于内部结构判断
 * - 返回 BlockSearchHit[]，供上层聚合为文档候选
 */

import { sql } from "@/api";
import type { BlockSearchHit, SearchScope, SearchExclude } from "./types";
import {
  clampLimit,
  normalizeSearchQuery,
  normalizeSearchTerms,
  escapeSqlLike,
  buildScopeWhere,
  buildExcludeWhere,
} from "./sql-utils";

export interface SearchBlocksParams {
  query: string;
  scope?: SearchScope;
  exclude?: SearchExclude;
  limit?: number;
}

/**
 * 关键词检索：多 term AND 组合，每个 term 内部 content/tag OR
 */
export async function searchBlocksKeyword(params: SearchBlocksParams): Promise<BlockSearchHit[]> {
  const { query, scope, exclude, limit } = params;

  const terms = normalizeSearchTerms(query);
  if (terms.length === 0) {
    return [];
  }

  const safeLimit = clampLimit(limit);

  const whereParts: string[] = [
    "content is not null",
    "trim(content) != ''",
  ];

  whereParts.push(...buildScopeWhere(scope));
  whereParts.push(...buildExcludeWhere(exclude));

  const termClauses = terms.map((term) => {
    const safeTerm = escapeSqlLike(term);
    return `(content LIKE '%${safeTerm}%' ESCAPE '\\' OR tag LIKE '%${safeTerm}%' ESCAPE '\\')`;
  });

  whereParts.push(`(${termClauses.join(" AND ")})`);

  const sqlStmt = `
    select id, root_id, parent_id, box, path, type, subtype, content, tag, created, updated, hash
    from blocks
    where ${whereParts.join(" AND ")}
    order by updated desc
    limit ${safeLimit}
  `;

  try {
    const rows = await sql(sqlStmt);
    return mapRowsToHits(rows, "keyword");
  } catch (e) {
    console.error("[searchBlocksKeyword] SQL error:", e);
    return [];
  }
}

/**
 * 模糊检索：完整 query 在 content 或 tag 中 LIKE
 */
export async function searchBlocksFuzzy(params: SearchBlocksParams): Promise<BlockSearchHit[]> {
  const { query, scope, exclude, limit } = params;

  const cleaned = normalizeSearchQuery(query);
  if (!cleaned) {
    return [];
  }

  const safeLimit = clampLimit(limit);

  const whereParts: string[] = [
    "content is not null",
    "trim(content) != ''",
  ];

  whereParts.push(...buildScopeWhere(scope));
  whereParts.push(...buildExcludeWhere(exclude));

  const safeQuery = escapeSqlLike(cleaned);
  whereParts.push(`(content LIKE '%${safeQuery}%' ESCAPE '\\' OR tag LIKE '%${safeQuery}%' ESCAPE '\\')`);

  const sqlStmt = `
    select id, root_id, parent_id, box, path, type, subtype, content, tag, created, updated, hash
    from blocks
    where ${whereParts.join(" AND ")}
    order by updated desc
    limit ${safeLimit}
  `;

  try {
    const rows = await sql(sqlStmt);
    return mapRowsToHits(rows, "fuzzy");
  } catch (e) {
    console.error("[searchBlocksFuzzy] SQL error:", e);
    return [];
  }
}

/**
 * 文档标题检索：查询 type=d 的块，content LIKE 匹配
 */
export async function searchDocsByTitle(params: SearchBlocksParams): Promise<BlockSearchHit[]> {
  const { query, scope, exclude, limit } = params;

  const cleaned = normalizeSearchQuery(query);
  if (!cleaned) {
    return [];
  }

  const safeLimit = clampLimit(limit);

  const whereParts: string[] = [
    "type = 'd'",
    "content is not null",
    "trim(content) != ''",
  ];

  whereParts.push(...buildScopeWhere(scope));
  whereParts.push(...buildExcludeWhere(exclude));

  const safeQuery = escapeSqlLike(cleaned);
  whereParts.push(`content LIKE '%${safeQuery}%' ESCAPE '\\'`);

  const sqlStmt = `
    select id, root_id, parent_id, box, path, type, subtype, content, tag, created, updated, hash
    from blocks
    where ${whereParts.join(" AND ")}
    order by updated desc
    limit ${safeLimit}
  `;

  try {
    const rows = await sql(sqlStmt);
    return mapRowsToHits(rows, "keyword");
  } catch (e) {
    console.error("[searchDocsByTitle] SQL error:", e);
    return [];
  }
}

/**
 * 标签检索：tag LIKE 匹配，不强制 content 非空
 */
export async function searchBlocksByTag(params: SearchBlocksParams): Promise<BlockSearchHit[]> {
  const { query, scope, exclude, limit } = params;

  const cleaned = normalizeSearchQuery(query);
  if (!cleaned) {
    return [];
  }

  const safeLimit = clampLimit(limit);

  const whereParts: string[] = [
    "tag is not null",
    "trim(tag) != ''",
  ];

  whereParts.push(...buildScopeWhere(scope));
  whereParts.push(...buildExcludeWhere(exclude));

  const safeQuery = escapeSqlLike(cleaned);
  whereParts.push(`tag LIKE '%${safeQuery}%' ESCAPE '\\'`);

  const sqlStmt = `
    select id, root_id, parent_id, box, path, type, subtype, content, tag, created, updated, hash
    from blocks
    where ${whereParts.join(" AND ")}
    order by updated desc
    limit ${safeLimit}
  `;

  try {
    const rows = await sql(sqlStmt);
    return mapRowsToHits(rows, "keyword");
  } catch (e) {
    console.error("[searchBlocksByTag] SQL error:", e);
    return [];
  }
}

function mapRowsToHits(rows: unknown[], mode: "keyword" | "fuzzy"): BlockSearchHit[] {
  if (!rows || !Array.isArray(rows)) {
    return [];
  }

  return rows.map((row: any) => ({
    blockId: row.id || "",
    docId: row.root_id || row.id || "",
    box: row.box || "",
    path: row.path || "",
    parentId: row.parent_id || undefined,
    type: row.type || "",
    subtype: row.subtype || undefined,
    content: row.content || "",
    tag: row.tag || undefined,
    created: row.created || undefined,
    updated: row.updated || undefined,
    hash: row.hash || undefined,
    searchMode: mode,
    blockScore: 0,
    scoreParts: {},
  }));
}
