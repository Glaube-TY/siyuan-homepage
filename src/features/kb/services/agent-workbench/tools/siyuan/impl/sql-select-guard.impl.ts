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

  const limit = normalizeSqlMaxRows(maxRows);
  return {
    ok: true,
    normalized: `SELECT * FROM (${withoutTrailingSemicolon}) AS notebrain_readonly_query LIMIT ${limit}`,
    maxRows: limit,
  };
}
