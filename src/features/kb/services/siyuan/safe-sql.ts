/**
 * Safe SQL
 *
 * 安全 SELECT 封装，为 Agent Workbench 工具层提供只读 SQL 边界。
 *
 * 职责：
 * - 只允许 SELECT 开头
 * - 禁止多语句
 * - 禁止写入/危险关键词（单词边界匹配，不误伤字段名）
 * - 禁止 SQL 注释片段
 * - 自动限制 LIMIT，不扩大已有 LIMIT
 * - 可选白名单表校验
 * - raw SQL 调用只封装在此文件内，不向外暴露
 * - 校验失败返回空数组并 console.warn，不抛致命错误
 */

import { sql } from "@/api";
import { escapeSqlString, escapeSqlLike, clampLimit } from "../siyuan-sql-retrieval/sql-utils";

export interface SafeSqlSelectOptions {
  limit?: number;
  maxLimit?: number;
  allowedTables?: string[];
}

export type SafeSqlValidationResult =
  | { ok: true; stmt: string }
  | { ok: false; reason: string };

const WRITE_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
  "CREATE", "REPLACE", "TRUNCATE", "ATTACH",
  "DETACH", "PRAGMA", "VACUUM", "REINDEX",
];

const COMMENT_PATTERNS = ["--", "/*", "*/"];

const DEFAULT_MAX_LIMIT = 500;

function hasWriteKeyword(stmt: string): string | null {
  for (const keyword of WRITE_KEYWORDS) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    if (re.test(stmt)) {
      return keyword;
    }
  }
  return null;
}

function extractTableNames(stmt: string): string[] {
  const tables: string[] = [];
  const fromMatch = stmt.match(/\bfrom\s+([a-zA-Z_]\w*)/gi);
  if (fromMatch) {
    for (const m of fromMatch) {
      const table = m.replace(/\bfrom\s+/i, "").trim();
      if (table) tables.push(table.toLowerCase());
    }
  }
  const joinMatch = stmt.match(/\bjoin\s+([a-zA-Z_]\w*)/gi);
  if (joinMatch) {
    for (const m of joinMatch) {
      const table = m.replace(/\bjoin\s+/i, "").trim();
      if (table) tables.push(table.toLowerCase());
    }
  }
  return [...new Set(tables)];
}

export function ensureSelectLimit(stmt: string, limit: number, maxLimit?: number): string {
  const effectiveMax = maxLimit ?? DEFAULT_MAX_LIMIT;
  const safeLimit = clampLimit(limit, effectiveMax, effectiveMax);

  const limitMatch = stmt.match(/\blimit\s+(\d+)\b/i);
  if (limitMatch) {
    const existingLimit = parseInt(limitMatch[1], 10);
    if (existingLimit <= effectiveMax && limit >= existingLimit) {
      return stmt;
    }
    const newLimit = Math.min(safeLimit, existingLimit);
    return stmt.replace(/\blimit\s+\d+\b/i, `LIMIT ${newLimit}`);
  }

  const trimmed = stmt.trim();
  if (trimmed.endsWith(";")) {
    return trimmed.slice(0, -1) + ` LIMIT ${safeLimit};`;
  }
  return trimmed + ` LIMIT ${safeLimit}`;
}

export function validateSafeSelectSql(
  stmt: string,
  options?: SafeSqlSelectOptions
): SafeSqlValidationResult {
  const trimmed = stmt.trim();

  if (!trimmed) {
    return { ok: false, reason: "SQL statement is empty" };
  }

  const upper = trimmed.toUpperCase();

  if (!upper.startsWith("SELECT")) {
    return { ok: false, reason: "Only SELECT statements are allowed" };
  }

  for (const pattern of COMMENT_PATTERNS) {
    if (trimmed.includes(pattern)) {
      return { ok: false, reason: `SQL comment pattern '${pattern}' is not allowed` };
    }
  }

  const badKeyword = hasWriteKeyword(trimmed);
  if (badKeyword) {
    return { ok: false, reason: `Keyword '${badKeyword}' is not allowed` };
  }

  if (trimmed.includes(";") && trimmed.split(";").filter((s) => s.trim()).length > 1) {
    return { ok: false, reason: "Multiple statements are not allowed" };
  }

  const maxLimit = options?.maxLimit ?? DEFAULT_MAX_LIMIT;
  const effectiveLimit = options?.limit ?? maxLimit;
  const limited = ensureSelectLimit(trimmed, effectiveLimit, maxLimit);

  if (options?.allowedTables && options.allowedTables.length > 0) {
    const allowedLower = options.allowedTables.map((t) => t.toLowerCase());
    const usedTables = extractTableNames(limited);
    for (const table of usedTables) {
      if (!allowedLower.includes(table)) {
        return { ok: false, reason: `Table '${table}' is not in the allowed list` };
      }
    }
  }

  return { ok: true, stmt: limited };
}

export async function safeSqlSelect<T = Record<string, unknown>>(
  stmt: string,
  options?: SafeSqlSelectOptions
): Promise<T[]> {
  const validation = validateSafeSelectSql(stmt, options);

  if (validation.ok === false) {
    console.warn("[safeSqlSelect] Validation failed:", (validation as { ok: false; reason: string }).reason);
    return [];
  }

  try {
    const rows = await sql(validation.stmt);
    if (!rows || !Array.isArray(rows)) {
      return [];
    }
    return rows as T[];
  } catch (e) {
    console.warn("[safeSqlSelect] SQL execution error:", e);
    return [];
  }
}

export interface SafeSqlPagedOptions extends SafeSqlSelectOptions {
  /** Rows per page. Default 64 (matches SiYuan default search result limit). */
  pageSize?: number;
  /** Maximum total rows to fetch across all pages. Default 1000. */
  maxRows?: number;
  /** Column name used for deduplication. Default "id". */
  dedupeKey?: string;
}

/**
 * Paged SELECT that bypasses SiYuan's default 64-row truncation.
 *
 * Strategy:
 * - Validate the statement as read-only (same as safeSqlSelect).
 * - If no ORDER BY clause exists, append `ORDER BY updated DESC, id DESC` for stable pagination.
 * - Strip any existing LIMIT/OFFSET from the validated statement.
 * - Loop: execute with `LIMIT pageSize OFFSET n`, collect rows, deduplicate by `dedupeKey`.
 * - Stop when a page returns fewer than `pageSize` rows or `maxRows` is reached.
 *
 * This does NOT modify the user's global SiYuan settings.
 * The caller is responsible for slicing the final result to the desired topN.
 */
export async function safeSqlSelectPaged<T = Record<string, unknown>>(
  stmt: string,
  options?: SafeSqlPagedOptions,
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 64;
  const maxRows = options?.maxRows ?? 1000;
  const dedupeKey = options?.dedupeKey ?? "id";

  // Validate as read-only, but we'll rebuild LIMIT/OFFSET ourselves.
  // First validate without adding a limit (maxLimit=Infinity equivalent).
  const validation = validateSafeSelectSql(stmt, { ...options, maxLimit: Number.MAX_SAFE_INTEGER, limit: Number.MAX_SAFE_INTEGER });
  if (!validation.ok) {
    console.warn("[safeSqlSelectPaged] Validation failed:", (validation as { ok: false; reason: string }).reason);
    return [];
  }

  // Work on the validated statement (already has LIMIT appended by validateSafeSelectSql).
  let baseSql = validation.stmt;

  // Strip existing LIMIT clause so we can add our own per-page.
  baseSql = baseSql.replace(/\bLIMIT\s+\d+\s*;?\s*$/i, "").trim();

  // Ensure stable ORDER BY for pagination.
  if (!/\border\s+by\b/i.test(baseSql)) {
    baseSql += " ORDER BY updated DESC, id DESC";
  }

  const seen = new Set<string>();
  const results: T[] = [];
  let offset = 0;

  while (results.length < maxRows) {
    const remaining = maxRows - results.length;
    const pageLimit = Math.min(pageSize, remaining);
    const pageSql = `${baseSql} LIMIT ${pageLimit} OFFSET ${offset}`;

    let rows: T[];
    try {
      rows = (await sql(pageLimit > 0 ? pageSql : baseSql)) as T[];
    } catch (e) {
      console.warn("[safeSqlSelectPaged] SQL execution error at offset", offset, ":", e);
      break;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }

    let addedThisPage = 0;
    for (const row of rows) {
      const key = (row as Record<string, unknown>)[dedupeKey];
      const keyStr = key != null ? String(key) : "";
      if (keyStr && seen.has(keyStr)) {
        continue;
      }
      if (keyStr) {
        seen.add(keyStr);
      }
      results.push(row);
      addedThisPage++;
      if (results.length >= maxRows) {
        break;
      }
    }

    // If we got fewer rows than requested or no new unique rows, we've exhausted the result set.
    if (rows.length < pageLimit || addedThisPage === 0) {
      break;
    }

    offset += rows.length;
  }

  return results;
}

export { escapeSqlString, escapeSqlLike, clampLimit };
