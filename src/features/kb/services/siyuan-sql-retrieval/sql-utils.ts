/**
 * SQL 工具函数
 *
 * 用于安全拼接思源 SQL 查询条件，不暴露裸 SQL 给上层业务。
 */

import type { SearchScope, SearchExclude } from "./types";
import { toDocTreeSqlPathPrefix } from "../doc-graph/path-utils";

/**
 * 转义 SQL 字符串中的单引号
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * 转义 SQL LIKE 表达式中的 % 和 _
 * 配合 ESCAPE '\\' 使用
 */
export function escapeSqlLike(value: string): string {
  const escaped = escapeSqlString(value);
  return escaped.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * 限制条数：无效值用默认值，最大不超过 maxLimit
 */
export function clampLimit(limit?: number, defaultLimit = 80, maxLimit = 300): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return defaultLimit;
  }
  return Math.min(limit, maxLimit);
}

/**
 * 清理搜索查询：trim + 合并多余空白
 */
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

/**
 * 将查询切分为搜索词数组
 * - 按空白切词
 * - 无空白则返回整个 query
 * - 过滤空字符串
 * - 最多 8 个 term
 */
export function normalizeSearchTerms(query: string): string[] {
  const cleaned = normalizeSearchQuery(query);
  if (!cleaned) {
    return [];
  }
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  return terms.slice(0, 8);
}

/**
 * 根据 scope 构建 SQL where 条件片段数组
 */
export function buildScopeWhere(scope?: SearchScope): string[] {
  const conditions: string[] = [];

  if (!scope) {
    return conditions;
  }

  switch (scope.mode) {
    case "notebook":
      if (scope.box) {
        conditions.push(`box = '${escapeSqlString(scope.box)}'`);
      }
      break;

    case "doc":
      if (scope.docId) {
        conditions.push(`root_id = '${escapeSqlString(scope.docId)}'`);
      }
      break;

    case "doc_tree": {
      // 优先使用 docId 构建范围条件，更稳定
      if (scope.docId) {
        // 限制 box（如果提供）
        if (scope.box) {
          conditions.push(`box = '${escapeSqlString(scope.box)}'`);
        }
        // 限制文档树：根文档本身或其子文档
        const escapedDocId = escapeSqlString(scope.docId);
        conditions.push(`(root_id = '${escapedDocId}' OR path LIKE '%/${escapedDocId}/%')`);
      } else if (scope.pathPrefix) {
        // 当 docId 无法解析到 box/path 时，使用 pathPrefix 作为范围约束兜底
        const treePrefix = toDocTreeSqlPathPrefix(scope.pathPrefix);
        if (treePrefix) {
          conditions.push(`path LIKE '${escapeSqlLike(treePrefix)}%' ESCAPE '\\'`);
        }
      }
      break;
    }

    case "whole_kb":
    default:
      break;
  }

  return conditions;
}

/**
 * 根据 exclude 构建 SQL where 排除条件片段数组
 */
export function buildExcludeWhere(exclude?: SearchExclude): string[] {
  const conditions: string[] = [];

  if (!exclude) {
    return conditions;
  }

  if (exclude.blockIds && exclude.blockIds.length > 0) {
    const ids = exclude.blockIds.map((id) => `'${escapeSqlString(id)}'`).join(", ");
    conditions.push(`id not in (${ids})`);
  }

  if (exclude.docIds && exclude.docIds.length > 0) {
    const ids = exclude.docIds.map((id) => `'${escapeSqlString(id)}'`).join(", ");
    conditions.push(`root_id not in (${ids})`);
  }

  if (exclude.pathPrefixes && exclude.pathPrefixes.length > 0) {
    for (const prefix of exclude.pathPrefixes) {
      const treePrefix = toDocTreeSqlPathPrefix(prefix);
      if (treePrefix) {
        conditions.push(`path NOT LIKE '${escapeSqlLike(treePrefix)}%' ESCAPE '\\'`);
      }
    }
  }

  return conditions;
}
