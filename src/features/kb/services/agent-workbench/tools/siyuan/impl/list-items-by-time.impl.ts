/**
 * list_items_by_time adapter.
 *
 * Lists documents or content blocks within the current scope, sorted by created/updated time.
 * Supports optional startTime/endTime range filtering and blockType filtering for block mode.
 * Uses direct SQL query with scope WHERE + time range + ORDER BY + LIMIT.
 * Does NOT read full document body content.
 */

import { sqlSelectReadonlyPaged } from "../../../../siyuan/read-only-kernel";
import { escapeSqlString } from "../../../../siyuan/safe-sql";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { AgentScope } from "../../../scope/types";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";
import type {
  ListItemsByTimeInput,
  ListItemsByTimeOutput,
} from "../contracts/list-items-by-time.contract";

const NOTE = "结果按时间排序，只是状态线索，不是正文证据。如需正文证据，请使用 read_doc_blocks 或 read_docs。";

// ── time normalization ──

type TimeBoundary = "start" | "end";

function normalizeSiyuanTimestampInput(value: string | undefined, boundary: TimeBoundary): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  const raw = value.trim();

  if (/^\d{14}$/.test(raw)) return raw;

  if (/^\d{8}$/.test(raw)) {
    return boundary === "start" ? raw + "000000" : raw + "235959";
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const datePart = dateOnly[1] + dateOnly[2] + dateOnly[3];
    return boundary === "start" ? datePart + "000000" : datePart + "235959";
  }

  const datetime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (datetime) {
    return datetime[1] + datetime[2] + datetime[3] + datetime[4] + datetime[5] + datetime[6];
  }

  throw new Error(`[invalid_args] 时间格式不支持（"${raw}"），请使用 YYYY-MM-DD 或 YYYYMMDDHHmmss。`);
}

// ── scope WHERE clause ──

function buildDocScopeWhere(scope: AgentScope): string {
  switch (scope.type) {
    case "current_doc": {
      const safeId = escapeSqlString(scope.docId.trim());
      return `id = '${safeId}'`;
    }
    case "custom_docs":
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

function buildBlockScopeWhere(scope: AgentScope): string {
  switch (scope.type) {
    case "current_doc": {
      const safeId = escapeSqlString(scope.docId.trim());
      return `b.root_id = '${safeId}'`;
    }
    case "custom_docs":
    case "doc_neighborhood": {
      const ids = [...new Set(scope.docIds.map((id) => id.trim()).filter(Boolean))];
      if (ids.length === 0) return "1 = 0";
      const idList = ids.map((id) => `'${escapeSqlString(id)}'`).join(",");
      return `b.root_id IN (${idList})`;
    }
    case "notebook": {
      const safeBox = escapeSqlString(scope.notebookId.trim());
      return `b.box = '${safeBox}'`;
    }
    case "doc_tree": {
      const safeBox = escapeSqlString(scope.box.trim());
      const safeRoot = escapeSqlString(scope.rootDocId.trim());
      return `b.box = '${safeBox}' AND (b.root_id = '${safeRoot}' OR b.path LIKE '%/${safeRoot}/%')`;
    }
    case "whole_kb":
    default:
      return "";
  }
}

// ── content preview ──

function truncatePreview(text: string | undefined, maxLen: number): string {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "...";
}

// ── main executor ──

export async function executeListItemsByTime(
  deps: SiyuanToolDeps,
  args: ListItemsByTimeInput,
): Promise<{ safeOutput: ListItemsByTimeOutput }> {
  const scope = deps.getEffectiveScope();
  if (!scope) {
    throw new Error("Scope not available.");
  }

  const itemType = args.itemType;
  const sortBy = args.sortBy ?? "updated";
  const order = args.order ?? "desc";
  const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
  const timeField = sortBy === "created" ? "created" : "updated";
  const direction = order === "asc" ? "ASC" : "DESC";

  const normalizedStart = normalizeSiyuanTimestampInput(args.startTime, "start");
  const normalizedEnd = normalizeSiyuanTimestampInput(args.endTime, "end");

  if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
    throw new Error("[invalid_args] startTime 不能晚于 endTime。");
  }

  const sqlLimit = Math.min(limit + 1, 101);
  let sql: string;

  if (itemType === "doc") {
    const scopeWhere = buildDocScopeWhere(scope);
    const conditions: string[] = ["type = 'd'"];
    if (scopeWhere) conditions.push(scopeWhere);
    if (normalizedStart) conditions.push(`${timeField} >= '${escapeSqlString(normalizedStart)}'`);
    if (normalizedEnd) conditions.push(`${timeField} <= '${escapeSqlString(normalizedEnd)}'`);
    const whereClause = conditions.join(" AND ");
    sql = `SELECT id, content as title, ${timeField} as time_val FROM blocks WHERE ${whereClause} ORDER BY ${timeField} ${direction} LIMIT ${sqlLimit}`;
  } else {
    const scopeWhere = buildBlockScopeWhere(scope);
    const conditions: string[] = ["b.type <> 'd'"];
    if (scopeWhere) conditions.push(scopeWhere);
    if (normalizedStart) conditions.push(`b.${timeField} >= '${escapeSqlString(normalizedStart)}'`);
    if (normalizedEnd) conditions.push(`b.${timeField} <= '${escapeSqlString(normalizedEnd)}'`);

    if (args.blockTypes && args.blockTypes.length > 0) {
      const typeList = args.blockTypes.map((t) => `'${escapeSqlString(t)}'`).join(",");
      conditions.push(`b.type IN (${typeList})`);
    }

    const whereClause = conditions.join(" AND ");
    sql = `SELECT b.id as block_id, b.root_id as doc_id, b.type as block_type, b.subtype as block_subtype, b.content as block_content, b.${timeField} as time_val, d.content as doc_title FROM blocks b LEFT JOIN blocks d ON d.id = b.root_id AND d.type = 'd' WHERE ${whereClause} ORDER BY b.${timeField} ${direction} LIMIT ${sqlLimit}`;
  }

  pushAgentDebugEvent("LIST_ITEMS_BY_TIME_SQL", {
    itemType,
    scopeType: scope.type,
    sortBy,
    order,
    limit,
    hasTimeRange: !!(normalizedStart || normalizedEnd),
    hasBlockTypes: !!(args.blockTypes && args.blockTypes.length > 0),
  }, "debug");

  const rows = await sqlSelectReadonlyPaged<Record<string, string | undefined>>(sql, {
    maxRows: sqlLimit,
    pageSize: 64,
    allowedTables: ["blocks"],
  });

  const allRows = Array.isArray(rows) ? rows : [];
  const truncated = allRows.length > limit;
  const sliced = allRows.slice(0, limit);

  const items = itemType === "doc"
    ? sliced.map((row) => ({
        itemType: "doc" as const,
        time: row.time_val ?? "",
        docId: row.id ?? "",
        docTitle: row.title ?? "",
      }))
    : sliced.map((row) => ({
        itemType: "block" as const,
        time: row.time_val ?? "",
        docId: row.doc_id ?? "",
        docTitle: row.doc_title ?? "",
        blockId: row.block_id ?? "",
        blockType: row.block_type ?? "",
        blockSubType: row.block_subtype ?? "",
        contentPreview: truncatePreview(row.block_content, 200),
      }));

  const timeRange = (normalizedStart != null || normalizedEnd != null) ? {
    field: timeField as "updated" | "created",
    ...(normalizedStart != null ? { startTime: normalizedStart } : {}),
    ...(normalizedEnd != null ? { endTime: normalizedEnd } : {}),
  } : undefined;

  const noteParts: string[] = [NOTE];
  if (items.length === 0) {
    noteParts.push(`当前范围内无匹配${itemType === "doc" ? "文档" : "内容块"}。`);
  }

  return {
    safeOutput: {
      itemType,
      sortBy,
      order,
      returnedCount: items.length,
      truncated,
      timeRange,
      items,
      note: noteParts.join(" "),
    },
  };
}
