import { performTransactionsChecked } from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  RemoveAttributeViewRowsInput,
  RemoveAttributeViewRowsOutput,
} from "../contracts/remove-attribute-view-rows.contract";
import { readAttributeViewSafeOutput } from "./read-attribute-view.impl";

type ExecResult = { ok: boolean; safeOutput: RemoveAttributeViewRowsOutput; errorCode?: string };

function fail(args: RemoveAttributeViewRowsInput, message: string, errorCode: string): ExecResult {
  return {
    ok: false,
    errorCode,
    safeOutput: {
      status: "failed",
      databaseId: args.databaseId,
      removedCount: 0,
      message,
    },
  };
}

/**
 * 获取行的显示标题（用于 expectedTitles 校验）
 */
function getRowTitle(row: { title?: string; cells: Record<string, { name: string; type: string; text: string }> }): string {
  // 优先使用 row.title
  if (row.title) return row.title;
  // 尝试找 block 类型字段的文本
  const blockCell = Object.values(row.cells).find((c) => c.type === "block");
  if (blockCell?.text) return blockCell.text;
  return "";
}

export async function executeRemoveAttributeViewRows(
  _deps: SiyuanToolDeps,
  args: RemoveAttributeViewRowsInput,
): Promise<ExecResult> {
  const databaseId = args.databaseId.trim();
  const rowIds = [...new Set(args.rowIds.map((id) => id.trim()).filter(Boolean))];
  const expectedTitles = args.expectedTitles;
  const warnings: string[] = [];

  // 拒绝空 databaseId
  if (!databaseId) {
    return fail(args, "databaseId 不能为空。", "invalid_database_id");
  }

  if (rowIds.length === 0) {
    return fail(args, "必须提供至少一个 rowId。", "invalid_input");
  }
  if (rowIds.length > 20) {
    return fail(args, "一次最多删除 20 行，请分批确认。", "batch_too_large");
  }

  // 校验 expectedTitles 数量
  if (expectedTitles && expectedTitles.length > 0 && expectedTitles.length !== rowIds.length) {
    return fail(args, `expectedTitles 数量（${expectedTitles.length}）与 rowIds 数量（${rowIds.length}）不一致。`, "titles_count_mismatch");
  }

  try {
    // 读取数据库 rows 来验证 rowId 存在
    const read = await readAttributeViewSafeOutput({
      databaseId,
      includeRows: true,
      rowLimit: 100,
      includeRaw: false,
    });

    const existingRows = read.rows ?? [];
    const existingRowMap = new Map(existingRows.map((r) => [r.rowId, r]));

    // 收集所有 keyId 用于检查冒充
    const allKeyIds = new Set(read.schema.map((k) => k.keyId));
    // 收集所有 boundBlockId 用于检查冒充
    const allBoundBlockIds = new Set(existingRows.map((r) => r.boundBlockId).filter(Boolean));

    // 验证每个 rowId 必须命中真实 rows
    const validRowIds: string[] = [];
    const srcIds: string[] = [];
    const invalidRowIds: string[] = [];

    for (let i = 0; i < rowIds.length; i++) {
      const rowId = rowIds[i];
      const row = existingRowMap.get(rowId);

      if (!row) {
        // 检查是否是 keyId 冒充
        if (allKeyIds.has(rowId)) {
          return fail(args, `「${rowId}」是字段 ID（keyId），不是条目 ID（rowId/itemID）。请使用 read_attribute_view 或 find_attribute_view_rows 返回的 rowId。`, "invalid_row_id");
        }
        // 检查是否是 boundBlockId 冒充
        if (allBoundBlockIds.has(rowId)) {
          return fail(args, `「${rowId}」是绑定块 ID（boundBlockId），不是条目 ID（rowId/itemID）。请使用 read_attribute_view 或 find_attribute_view_rows 返回的 rowId。`, "invalid_row_id");
        }
        invalidRowIds.push(rowId);
        continue;
      }

      // 校验 expectedTitles
      if (expectedTitles && expectedTitles.length > 0) {
        const expectedTitle = expectedTitles[i];
        if (expectedTitle) {
          const rowTitle = getRowTitle(row);
          if (!rowTitle.includes(expectedTitle) && rowTitle !== expectedTitle) {
            return fail(args, `条目「${rowId}」的标题「${rowTitle}」不匹配期望标题「${expectedTitle}」。`, "title_mismatch");
          }
        }
      }

      validRowIds.push(rowId);
      // 如果行有 boundBlockId，srcID 优先用 boundBlockId；否则使用 itemID/rowId
      srcIds.push(row.boundBlockId ?? rowId);
    }

    if (invalidRowIds.length > 0) {
      return fail(args, `以下 rowId 不存在于数据库中：${invalidRowIds.join("、")}。请使用 read_attribute_view 或 find_attribute_view_rows 返回的真实 rowId。`, "row_not_found");
    }

    if (validRowIds.length === 0) {
      return fail(args, "没有有效的 rowId 可删除。", "no_valid_rows");
    }

    // 使用 transaction 执行删除
    await performTransactionsChecked([{
      doOperations: [{
        action: "removeAttrViewBlock",
        srcIDs: srcIds,
        avID: databaseId,
      }],
      undoOperations: [],
    }]);

    return {
      ok: true,
      safeOutput: {
        status: "success",
        databaseId,
        removedCount: validRowIds.length,
        removedRowIds: validRowIds,
        srcIds,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `已从数据库「${read.database.name || databaseId}」删除 ${validRowIds.length} 个条目。`,
      },
    };
  } catch (error) {
    return fail(args, `删除数据库条目失败：${error instanceof Error ? error.message : String(error)}`, "attribute_view_rows_remove_failed");
  }
}
