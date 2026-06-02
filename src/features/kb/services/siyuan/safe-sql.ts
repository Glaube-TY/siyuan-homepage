/**
 * Safe SQL
 *
 * 安全 SELECT 封装，为 Agentic RAG 工具层提供只读 SQL 边界。
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

export { escapeSqlString, escapeSqlLike, clampLimit };
