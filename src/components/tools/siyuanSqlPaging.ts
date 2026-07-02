/**
 * 思源 SQL 分页/分批 helper
 *
 * 职责：
 * - 提供字符串/LIKE 转义，避免 SQL 注入。
 * - 提供 LIMIT 钳制与排序字段白名单。
 * - 提供稳定分页 selectPaged，绕过思源默认 64 条截断。
 * - 提供分批 id IN 查询 selectByIdsBatched，避免超长 SQL。
 *
 * 限制：
 * - 本文件只处理 SELECT；不验证表名，调用方自行保证只读。
 * - 不输出任何 console.*；失败时静默返回已收集结果或空数组。
 */

import { sql } from "@/api";

export function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

export function escapeSqlLike(value: string): string {
    return escapeSqlString(value)
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
}

/**
 * 转义 FTS5 MATCH 短语中的双引号。
 * 返回值会被包裹在双引号内使用。
 */
export function escapeFts5Term(term: string): string {
    return term.replace(/"/g, '""');
}


export interface BuildFtsMatchClauseOptions {
    /** 是否启用前缀匹配（term*） */
    prefix?: boolean;
    /** FTS 子查询返回的最大 id 数，避免无限展开 */
    limit?: number;
    /**
     * 保留参数兼容。SiYuan 的 blocks_fts 已使用 tokenize='siyuan_case_insensitive'，
     * 因此不再切换表名，统一使用 blocks_fts。
     */
    caseInsensitive?: boolean;
    /**
     * 是否生成列限定表达式（如 content:term）。默认 false，保持最兼容的 MATCH 'term' 形式。
     */
    columnQualified?: boolean;
}

/**
 * 判断 FTS 关键词是否需要双引号包裹。
 * 仅包含字母、数字、下划线、CJK 字符且不含空格/特殊字符时使用裸词。
 */
function ftsTermNeedsQuoting(term: string): boolean {
    return !/^[A-Za-z0-9_\u4e00-\u9fa5]+$/.test(term);
}

function buildFtsTerm(term: string, prefix: boolean): string {
    const suffix = prefix ? "*" : "";
    if (ftsTermNeedsQuoting(term)) {
        return `"${escapeFts5Term(term)}"${suffix}`;
    }
    return `${term}${suffix}`;
}

/**
 * 生成 blocks_fts MATCH 子查询片段。
 * 返回形式：id IN (SELECT id FROM blocks_fts WHERE blocks_fts MATCH '...' LIMIT n)
 * - 多 term 使用 FTS5 隐式 AND
 * - 默认不列限定；columnQualified=true 时按 columns 生成 OR 组合
 */
export function buildFtsMatchClause(
    terms: string[],
    columns: string[],
    options: BuildFtsMatchClauseOptions = {},
): string {
    const table = "blocks_fts";
    const normalizedTerms = terms
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, 8);
    if (normalizedTerms.length === 0) {
        return "1=0";
    }

    const columnQualified = options.columnQualified === true && columns.length > 0;
    const matchParts = normalizedTerms.map((term) => {
        const bareTerm = buildFtsTerm(term, !!options.prefix);
        if (!columnQualified) {
            return bareTerm;
        }
        if (columns.length === 1) {
            return `${columns[0]}:${bareTerm}`;
        }
        return `(${columns.map((col) => `${col}:${bareTerm}`).join(" OR ")})`;
    });

    const matchExpr = matchParts.join(" ");
    const limitClause = options.limit && options.limit > 0 ? ` LIMIT ${options.limit}` : "";
    return `id IN (SELECT id FROM ${table} WHERE ${table} MATCH '${escapeSqlString(matchExpr)}'${limitClause})`;
}

export function clampSqlLimit(
    value: number | null | undefined,
    defaultLimit: number,
    maxLimit: number,
): number {
    if (value == null || !Number.isFinite(value) || value <= 0) {
        return defaultLimit;
    }
    return Math.min(value, maxLimit);
}

export function normalizeSortField(
    value: string,
    allowed: string[],
    fallback: string,
): string {
    const normalized = String(value || "").trim();
    return allowed.includes(normalized) ? normalized : fallback;
}

export interface SelectPagedOptions {
    pageSize?: number;
    maxRows?: number;
    dedupeKey?: string;
}

export async function selectPaged<T = any>(
    stmt: string,
    options: SelectPagedOptions = {},
): Promise<T[]> {
    const pageSize = clampSqlLimit(options.pageSize, 64, 256);
    const maxRows = clampSqlLimit(options.maxRows, 1000, 100000);
    const dedupeKey = options.dedupeKey ?? "id";

    const baseSql = stripTrailingLimitOffset(stmt.trim().replace(/;+\s*$/, ""));

    const seen = new Set<string>();
    const results: T[] = [];
    let offset = 0;

    while (results.length < maxRows) {
        const remaining = maxRows - results.length;
        const limit = Math.min(pageSize, remaining);
        const pageSql = `${baseSql} LIMIT ${limit} OFFSET ${offset}`;

        let rows: T[];
        try {
            rows = (await sql(pageSql)) as T[];
        } catch {
            break;
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            break;
        }

        let added = 0;
        for (const row of rows) {
            const key = (row as Record<string, unknown>)?.[dedupeKey];
            const keyStr = key != null ? String(key) : "";
            if (keyStr && seen.has(keyStr)) {
                continue;
            }
            if (keyStr) {
                seen.add(keyStr);
            }
            results.push(row);
            added++;
            if (results.length >= maxRows) {
                break;
            }
        }

        if (rows.length < limit || added === 0) {
            break;
        }

        offset += rows.length;
    }

    return results;
}

function stripTrailingLimitOffset(stmt: string): string {
    return stmt
        .replace(/\s*\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i, "")
        .replace(/\s*\bOFFSET\s+\d+\s*$/i, "")
        .trim();
}

export async function selectByIdsBatched<T = any>(
    ids: string[],
    buildSql: (escapedIdList: string) => string,
    batchSize = 64,
): Promise<T[]> {
    const cleaned = ids
        .map((id) => String(id || "").trim())
        .filter(Boolean);

    if (cleaned.length === 0) {
        return [];
    }

    const size = clampSqlLimit(batchSize, 64, 256);
    const results: T[] = [];

    for (let i = 0; i < cleaned.length; i += size) {
        const batch = cleaned.slice(i, i + size);
        const escapedList = batch.map((id) => `'${escapeSqlString(id)}'`).join(", ");
        const stmt = buildSql(escapedList);

        try {
            const rows = (await sql(stmt)) as T[];
            if (Array.isArray(rows)) {
                results.push(...rows);
            }
        } catch {
            // 静默继续，返回已收集结果
        }
    }

    return results;
}
