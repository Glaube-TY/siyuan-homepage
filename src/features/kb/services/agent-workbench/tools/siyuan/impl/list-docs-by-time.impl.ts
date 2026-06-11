/**
 * list_docs_by_time adapter.
 *
 * Returns a time-sorted flat list of documents within the current scope.
 * Supports optional startTime/endTime range filtering.
 * Uses direct SQL query with scope WHERE + time range + ORDER BY + LIMIT.
 * Does NOT read document body content.
 */

import { sqlSelectReadonly } from "../../../../siyuan/read-only-kernel";
import { escapeSqlString } from "../../../../siyuan/safe-sql";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { AgentScope } from "../../../scope/types";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";
import type {
  ListDocsByTimeInput,
  ListDocsByTimeOutput,
} from "../contracts/list-docs-by-time.contract";

const NOTE = "结果按时间排序，只是文档状态线索，不是正文证据。";

// ── time normalization ──

type TimeBoundary = "start" | "end";

/**
 * Normalize user-supplied time input to SiYuan timestamp format (YYYYMMDDHHmmss).
 * Supports: YYYYMMDDHHmmss, YYYYMMDD, YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, YYYY-MM-DDTHH:mm:ss.
 */
function normalizeSiyuanTimestampInput(value: string | undefined, boundary: TimeBoundary): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  const raw = value.trim();

  // YYYYMMDDHHmmss (14 digits)
  if (/^\d{14}$/.test(raw)) return raw;

  // YYYYMMDD (8 digits)
  if (/^\d{8}$/.test(raw)) {
    const datePart = raw; // already YYYYMMDD
    if (boundary === "start") return datePart + "000000";
    return datePart + "235959";
  }

  // YYYY-MM-DD
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const datePart = dateOnly[1] + dateOnly[2] + dateOnly[3];
    if (boundary === "start") return datePart + "000000";
    return datePart + "235959";
  }

  // YYYY-MM-DD HH:mm:ss or YYYY-MM-DDTHH:mm:ss
  const datetime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (datetime) {
    return datetime[1] + datetime[2] + datetime[3] + datetime[4] + datetime[5] + datetime[6];
  }

  throw new Error(`[invalid_args] 时间格式不支持（"${raw}"），请使用 YYYY-MM-DD 或 YYYYMMDDHHmmss。`);
}

// ── scope WHERE clause ──

function buildScopeWhere(scope: AgentScope): string {
  switch (scope.type) {
    case "current_doc": {
      const safeId = escapeSqlString(scope.docId.trim());
      return `id = '${safeId}'`;
    }
    case "custom_docs": {
      const ids = [...new Set(scope.docIds.map((id) => id.trim()).filter(Boolean))];
      if (ids.length === 0) return "1 = 0";
      const idList = ids.map((id) => `'${escapeSqlString(id)}'`).join(",");
      return `id IN (${idList})`;
    }
    case "doc_neighborhood": {
      const ids = [...new Set(scope.docIds.map((id) => id.trim()).filter(Boolean))];
      if (ids.length === 0) return "1 = 0";
      const idList = ids.map((id) => `'${escapeSqlString(id)}'`).join(",");
      return `id IN (${idList})`;
    }
    case "notebook": {
      const safeBox = escapeSqlString(scope.notebookId.trim());
      return `box = '${safeBox}'`;
    }
    case "doc_tree": {
      const safeBox = escapeSqlString(scope.box.trim());
      const safeRoot = escapeSqlString(scope.rootDocId.trim());
      return `box = '${safeBox}' AND (id = '${safeRoot}' OR path LIKE '%/${safeRoot}/%')`;
    }
    case "whole_kb":
    default:
      return "";
  }
}

// ── main executor ──

export async function executeListDocsByTime(
  deps: SiyuanToolDeps,
  args: ListDocsByTimeInput,
): Promise<{ safeOutput: ListDocsByTimeOutput }> {
  const scope = deps.getEffectiveScope();
  if (!scope) {
    throw new Error("Scope not available.");
  }

  const sortBy = args.sortBy ?? "updated";
  const order = args.order ?? "desc";
  const limit = Math.max(1, Math.min(args.limit ?? 20, 100));

  // Whitelist time field
  const timeField = sortBy === "created" ? "created" : "updated";

  // Whitelist direction
  const direction = order === "asc" ? "ASC" : "DESC";

  // Normalize time range
  const normalizedStart = normalizeSiyuanTimestampInput(args.startTime, "start");
  const normalizedEnd = normalizeSiyuanTimestampInput(args.endTime, "end");

  // Cross-validate time range
  if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
    throw new Error("[invalid_args] startTime 不能晚于 endTime。");
  }

  // Build SQL WHERE
  const scopeWhere = buildScopeWhere(scope);
  const conditions: string[] = ["type = 'd'"];
  if (scopeWhere) conditions.push(scopeWhere);
  if (normalizedStart) conditions.push(`${timeField} >= '${escapeSqlString(normalizedStart)}'`);
  if (normalizedEnd) conditions.push(`${timeField} <= '${escapeSqlString(normalizedEnd)}'`);

  const whereClause = conditions.join(" AND ");

  // Query limit+1 to detect truncation
  const sqlLimit = Math.min(limit + 1, 101);

  const sql = `SELECT id, content as title, ${timeField} as time_val FROM blocks WHERE ${whereClause} ORDER BY ${timeField} ${direction} LIMIT ${sqlLimit}`;

  pushAgentDebugEvent("LIST_DOCS_BY_TIME_SQL", {
    scopeType: scope.type,
    sortBy,
    order,
    limit,
    hasTimeRange: !!(normalizedStart || normalizedEnd),
  }, "debug");

  interface TimeRow {
    id: string;
    title?: string;
    time_val?: string;
  }

  const rows = await sqlSelectReadonly<TimeRow>(sql, {
    maxLimit: sqlLimit,
    allowedTables: ["blocks"],
  });

  const allRows = Array.isArray(rows) ? rows : [];
  const truncated = allRows.length > limit;
  const sliced = allRows.slice(0, limit);

  const docs = sliced.map((row) => ({
    docId: row.id ?? "",
    title: row.title ?? "",
    time: row.time_val ?? "",
  }));

  // Build timeRange if filtering was applied
  const timeRange = (normalizedStart != null || normalizedEnd != null) ? {
    field: timeField as "updated" | "created",
    ...(normalizedStart != null ? { startTime: normalizedStart } : {}),
    ...(normalizedEnd != null ? { endTime: normalizedEnd } : {}),
  } : undefined;

  const noteParts: string[] = [NOTE];
  if (docs.length === 0) {
    noteParts.push("当前范围内无匹配文档。");
  }

  return {
    safeOutput: {
      sortBy,
      order,
      docs,
      returnedCount: docs.length,
      truncated,
      note: noteParts.join(" "),
      timeRange,
    },
  };
}
