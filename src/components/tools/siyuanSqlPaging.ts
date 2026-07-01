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
