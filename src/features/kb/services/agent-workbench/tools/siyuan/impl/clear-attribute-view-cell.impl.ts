import { setAttributeViewBlockAttrWithCellChecked } from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  ClearAttributeViewCellInput,
  ClearAttributeViewCellOutput,
} from "../contracts/clear-attribute-view-cell.contract";
import { findAttributeViewKeyById } from "../internal/attribute-view/attribute-view-normalizer";
import { createEmptyAttributeViewValue } from "../internal/attribute-view/attribute-view-value-codec";
import { readAttributeViewSafeOutput } from "./read-attribute-view.impl";

type ExecResult = { ok: boolean; safeOutput: ClearAttributeViewCellOutput; errorCode?: string };

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function fail(args: ClearAttributeViewCellInput, message: string, errorCode: string, fieldName = ""): ExecResult {
  return {
    ok: false,
    errorCode,
    safeOutput: {
      status: "failed",
      databaseId: args.databaseId,
      rowId: args.rowId,
      keyId: args.keyId,
      fieldName,
      message,
    },
  };
}

// 不支持清空的字段类型
const BLOCKED_CLEAR_TYPES = new Set(["relation", "rollup", "lineNumber"]);

export async function executeClearAttributeViewCell(
  _deps: SiyuanToolDeps,
  args: ClearAttributeViewCellInput,
): Promise<ExecResult> {
  try {
    const databaseId = args.databaseId.trim();
    const rowId = args.rowId.trim();
    const keyId = args.keyId.trim();

    if (!databaseId) {
      return fail(args, "databaseId 不能为空。", "invalid_database_id");
    }
    if (!rowId) {
      return fail(args, "条目 ID（itemID）不能为空。", "invalid_row_id");
    }

    const output = await readAttributeViewSafeOutput({
      databaseId,
      includeRows: true,
      rowLimit: 500,
      includeRaw: true,
    });

    const key = findAttributeViewKeyById(output.schema, keyId);
    if (!key) {
      return fail(args, `字段 keyId 不存在：${keyId}。请先 read_attribute_view 获取真实 keyId。`, "field_not_found");
    }

    // 校验 expectedFieldName
    if (args.expectedFieldName) {
      const expectedName = args.expectedFieldName.trim();
      if (key.name !== expectedName) {
        return fail(args, `字段名不匹配：期望「${expectedName}」，实际「${key.name}」。`, "field_name_mismatch", key.name);
      }
    }

    // 检查是否为不支持清空的字段类型
    if (BLOCKED_CLEAR_TYPES.has(key.type)) {
      return fail(args, `字段「${key.name}」（${key.type}）暂不支持清空。`, "unsupported_field_type", key.name);
    }

    // 获取真实 rowId 列表
    const rows = output.rows ?? [];
    const validRowIds = new Set(rows.map((item) => item.rowId));
    const totalRowCount = output.rowCount ?? rows.length;

    if (!validRowIds.has(rowId)) {
      // 检查是否是 boundBlockId 冒充
      const boundRow = rows.find((item) => item.boundBlockId === rowId);
      if (boundRow) {
        return fail(
          args,
          `传入的条目 ID「${rowId}」是 boundBlockId（绑定块 ID），不是真实条目 ID。请使用 read_attribute_view 返回的条目 ID：${boundRow.rowId}。`,
          "bound_block_id_misuse",
          key.name,
        );
      }
      // 如果数据库可能被截断，返回可恢复错误
      if (totalRowCount > rows.length) {
        return fail(
          args,
          `未在已读取的 ${rows.length} 行中找到条目 ID「${rowId}」，数据库总行数 ${totalRowCount}。请先用 find_attribute_view_rows 精确定位或缩小范围。`,
          "row_not_found_in_range",
          key.name,
        );
      }
      return fail(args, `条目 ID 不存在：${rowId}。请先通过读取工具确认真实条目 ID（itemID）。`, "row_not_found", key.name);
    }

    const row = (output.rows ?? []).find((item) => item.rowId === rowId);
    if (!row) {
      return fail(args, `条目 ID 不存在：${rowId}。`, "row_not_found", key.name);
    }

    const oldCell = row.cells[keyId];
    const oldValueText = oldCell?.text ?? "";

    // 创建空值
    const encoded = createEmptyAttributeViewValue(key);
    if (!encoded.ok || encoded.value === undefined) {
      return fail(args, encoded.message || "无法构造空值。", "unsupported_field_type", key.name);
    }

    // 只从 cellID/cellId 读取，不使用 raw.id
    const rawCell = oldCell?.raw as Record<string, unknown> | undefined;
    const cellID = safeString(rawCell?.cellID ?? rawCell?.cellId) || undefined;

    await setAttributeViewBlockAttrWithCellChecked({
      avID: databaseId,
      keyID: keyId,
      itemID: rowId,
      cellID,
      value: encoded.value,
    });

    return {
      ok: true,
      safeOutput: {
        status: "success",
        databaseId,
        rowId,
        keyId,
        fieldName: key.name,
        oldValueText,
        message: `已清空数据库「${output.database.name || databaseId}」中条目 ID=${rowId} 的字段「${key.name}」。`,
      },
    };
  } catch (error) {
    return fail(
      args,
      `清空数据库单元格失败：${error instanceof Error ? error.message : String(error)}`,
      "attribute_view_cell_clear_failed",
    );
  }
}
