import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  FindAttributeViewRowsInput,
  FindAttributeViewRowsOutput,
} from "../contracts/find-attribute-view-rows.contract";
import { readAttributeViewSafeOutput } from "./read-attribute-view.impl";
import {
  findUniqueAttributeViewKeyByName,
  normalizeFieldName,
} from "../internal/attribute-view/attribute-view-normalizer";

function includesText(value: string | undefined, query: string): boolean {
  return String(value || "").toLowerCase().includes(query.toLowerCase());
}

export async function executeFindAttributeViewRows(
  _deps: SiyuanToolDeps,
  args: FindAttributeViewRowsInput,
): Promise<{ safeOutput: FindAttributeViewRowsOutput }> {
  const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
  const query = args.query?.trim() ?? "";
  const fieldValue = args.fieldValue?.trim() ?? "";
  const output = await readAttributeViewSafeOutput({
    databaseId: args.databaseId,
    viewId: args.viewId ?? null,
    includeRows: true,
    rowLimit: 100,
    includeRaw: false,
  });

  const warnings = [...(output.warnings ?? [])];
  if (output.rowCount >= 100) {
    warnings.push("find_attribute_view_rows 最多读取前 100 行做本地过滤；大数据库请先缩小视图或关键词。");
  }

  let selectedKeyId: string | undefined;
  if (args.fieldName) {
    const found = findUniqueAttributeViewKeyByName(output.schema, args.fieldName);
    if (found.status === "missing") {
      throw new Error(`[field_not_found] 未找到字段「${args.fieldName}」，请先 read_attribute_view 查看真实字段名和 keyId。`);
    }
    if (found.status === "ambiguous") {
      throw new Error(`[ambiguous_field] 字段名「${args.fieldName}」不唯一，请改用 read_attribute_view 返回的 keyId 判断。`);
    }
    selectedKeyId = found.key?.keyId;
  }

  const rows = output.rows ?? [];
  const matches = rows
    .map((row) => {
      const matchedFields: string[] = [];

      if (query) {
        if (includesText(row.title, query)) {
          matchedFields.push("title");
        }
        for (const cell of Object.values(row.cells)) {
          if (includesText(cell.text, query)) {
            matchedFields.push(cell.name || cell.keyId);
          }
        }
      }

      if (selectedKeyId && fieldValue) {
        const cell = row.cells[selectedKeyId];
        if (cell && includesText(cell.text, fieldValue)) {
          matchedFields.push(cell.name || selectedKeyId);
        } else {
          return null;
        }
      } else if (selectedKeyId && !fieldValue) {
        const cell = row.cells[selectedKeyId];
        if (cell && cell.text.trim()) {
          matchedFields.push(cell.name || selectedKeyId);
        } else {
          return null;
        }
      }

      if (query && matchedFields.length === 0) {
        return null;
      }

      const uniqueMatchedFields = [...new Set(matchedFields.map((name) => normalizeFieldName(name) || name))];
      return {
        rowId: row.rowId,
        boundBlockId: row.boundBlockId,
        title: row.title,
        matchedFields: uniqueMatchedFields.length > 0 ? uniqueMatchedFields : ["row"],
        row,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const sliced = matches.slice(0, limit);
  return {
    safeOutput: {
      databaseId: output.database.databaseId,
      viewId: output.viewId,
      matches: sliced,
      count: matches.length,
      truncated: matches.length > sliced.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  };
}
