export type ReadonlySqlValidation =
  | { ok: true; normalized: string; maxRows: number }
  | { ok: false; reason: string };

const FORBIDDEN_SQL_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "replace",
  "vacuum",
  "attach",
  "detach",
  "pragma",
  "reindex",
];

function maskSqlStringLiterals(stmt: string): string {
  let out = "";
  let quote: "'" | "\"" | "`" | null = null;
  for (let i = 0; i < stmt.length; i++) {
    const ch = stmt[i];
    if (!quote && (ch === "'" || ch === "\"" || ch === "`")) {
      quote = ch;
      out += " ";
      continue;
    }
    if (quote) {
      if (ch === quote) {
        const next = stmt[i + 1];
        if ((quote === "'" || quote === "\"") && next === quote) {
          i++;
          out += "  ";
          continue;
        }
        quote = null;
      }
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 只 mask 单引号字符串字面量；保留双引号/反引号/方括号标识符，供危险字段 LIKE 检测。
 */
function maskSqlSingleQuotedStringLiterals(stmt: string): string {
  let out = "";
  let inside = false;
  for (let i = 0; i < stmt.length; i++) {
    const ch = stmt[i];
    if (!inside && ch === "'") {
      inside = true;
      out += " ";
      continue;
    }
    if (inside) {
      if (ch === "'") {
        const next = stmt[i + 1];
        if (next === "'") {
          i++;
          out += "  ";
          continue;
        }
        inside = false;
      }
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

function stripSqlComments(stmt: string): string {
  return stmt
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

export function normalizeSqlMaxRows(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 50;
  return Math.min(100, Math.max(1, n));
}

export function validateReadonlySql(stmt: string, maxRows?: unknown): ReadonlySqlValidation {
  const trimmed = String(stmt ?? "").trim();
  if (!trimmed) return { ok: false, reason: "SQL 不能为空。" };

  const uncommented = stripSqlComments(trimmed);
  const masked = maskSqlStringLiterals(uncommented);
  const semicolonMatches = masked.match(/;/g) ?? [];
  const withoutTrailingSemicolon = uncommented.replace(/;\s*$/, "").trim();
  const maskedWithoutTrailing = maskSqlStringLiterals(withoutTrailingSemicolon);
  const maskedSingleWithoutTrailing = maskSqlSingleQuotedStringLiterals(withoutTrailingSemicolon);
  if (semicolonMatches.length > (trimmed.endsWith(";") ? 1 : 0)) {
    return { ok: false, reason: "只允许单条 SELECT 语句，不能包含多语句。" };
  }

  if (!/^\s*(select|with)\b/i.test(maskedWithoutTrailing)) {
    return { ok: false, reason: "本工具只允许 SELECT 或 WITH ... SELECT 只读查询。" };
  }

  for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    if (re.test(maskedWithoutTrailing)) {
      return { ok: false, reason: `只读 SQL 禁止包含关键字：${keyword}。` };
    }
  }

  // 禁止对正文字段使用 LIKE 全表扫描（path/ial/tag/bookmark 等元数据 LIKE 不受此限制）
  const dangerousLikePattern = /(?:^|[^A-Za-z0-9_])(?:[A-Za-z_][\w]*\.)?(?:["'`\[])?(content|markdown|fcontent)(?:["'`\]])?\s+(?:COLLATE\s+\w+\s+)?(?:NOT\s+)?LIKE\b/i;
  if (dangerousLikePattern.test(maskedSingleWithoutTrailing)) {
    return {
      ok: false,
      reason: "只读 SQL 禁止对 content/markdown/fcontent 使用 LIKE 搜索，请改用 blocks_fts MATCH 或更窄的结构化条件。",
    };
  }

  const limit = normalizeSqlMaxRows(maxRows);
  return {
    ok: true,
    normalized: `SELECT * FROM (${withoutTrailingSemicolon}) AS notebrain_readonly_query LIMIT ${limit}`,
    maxRows: limit,
  };
}
