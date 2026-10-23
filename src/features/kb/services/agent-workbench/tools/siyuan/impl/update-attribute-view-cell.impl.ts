import { getAttributeViewItemIDsByBoundIDsChecked, setAttributeViewBlockAttrWithCellChecked } from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  UpdateAttributeViewCellInput,
  UpdateAttributeViewCellOutput,
} from "../contracts/update-attribute-view-cell.contract";
import {
  findAttributeViewKeyById,
} from "../internal/attribute-view/attribute-view-normalizer";
import { createAttributeViewValue } from "../internal/attribute-view/attribute-view-value-codec";
import { normalizeItemIdMap } from "../internal/attribute-view/attribute-view-id-map";
import { readAttributeViewSafeOutput } from "./read-attribute-view.impl";

type ExecResult = { ok: boolean; safeOutput: UpdateAttributeViewCellOutput; errorCode?: string };

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

// 不支持更新的字段类型
const BLOCKED_UPDATE_TYPES = new Set(["relation", "rollup", "lineNumber"]);

interface PlannedUpdate {
  rowId: string;
  keyId: string;
  key: any;
  row: any | null;
  encoded: { ok: true; value: any };
  cellID: string | undefined;
  oldValueText: string;
  valueText: string;
  valueTypeHint?: string;
  expectedFieldName?: string;
  warnings: string[];
}

function fail(args: UpdateAttributeViewCellInput, message: string, errorCode: string): ExecResult {
  const updates = args.updates ?? [{ rowId: args.rowId ?? "", keyId: args.keyId ?? "", valueText: args.valueText ?? "" }];
  return {
    ok: false,
    errorCode,
    safeOutput: {
      status: "failed",
      databaseId: args.databaseId,
      total: updates.length,
      successCount: 0,
      failedCount: updates.length,
      results: updates.map((u) => ({
        rowId: u.rowId,
        keyId: u.keyId,
        fieldName: "",
        status: "failed" as const,
        newValueText: u.valueText,
        message,
      })),
      message,
    },
  };
}

/**
 * 尝试将 boundBlockId 转换为 itemID。
 * 返回：
 * - resolved: 最终使用的 rowId
 * - isMappedFromBound: 是否从 boundBlockId 映射而来（此时 row 可能不在已读取范围）
 * - warnings: 映射警告
 */
async function tryResolveBoundBlockId(
  databaseId: string,
  rowId: string,
  rows: any[],
): Promise<{ resolved: string; isMappedFromBound: boolean; warnings: string[] }> {
  const warnings: string[] = [];

  // 先检查是否直接命中 rowId
  const directRow = rows.find((r) => r.rowId === rowId);
  if (directRow) {
    return { resolved: rowId, isMappedFromBound: false, warnings };
  }

  // 检查是否命中 boundBlockId
  const boundRow = rows.find((r) => r.boundBlockId === rowId);
  if (boundRow) {
    warnings.push(`已将 boundBlockId「${rowId}」转为 itemID「${boundRow.rowId}」。`);
    return { resolved: boundRow.rowId, isMappedFromBound: false, warnings };
  }

  // 尝试内部调用 API 转换，复用 normalizeItemIdMap
  try {
    const rawResult = await getAttributeViewItemIDsByBoundIDsChecked(databaseId, [rowId]);
    const mapped = normalizeItemIdMap(rawResult, [rowId]);
    const itemId = mapped[rowId];
    if (itemId) {
      warnings.push(`已通过 API 将 boundBlockId「${rowId}」转为 itemID「${itemId}」。旧值未在当前读取范围中取得。`);
      return { resolved: itemId, isMappedFromBound: true, warnings };
    }
  } catch {
    // 转换失败，继续
  }

  return { resolved: rowId, isMappedFromBound: false, warnings };
}

/**
 * 从已读取 rows 中收集所有 cellID，用于检测 cellID 冒充 rowId。
 * 只读取 raw.cellID / raw.cellId，不使用 raw.id。
 */
function collectCellIds(rows: any[]): Set<string> {
  const cellIds = new Set<string>();
  for (const row of rows) {
    if (!row?.cells) continue;
    for (const cell of Object.values(row.cells)) {
      const raw = (cell as any)?.raw;
      if (!raw || typeof raw !== "object") continue;
      const cid = safeString((raw as any).cellID ?? (raw as any).cellId);
      if (cid) cellIds.add(cid);
    }
  }
  return cellIds;
}

export async function executeUpdateAttributeViewCell(
  _deps: SiyuanToolDeps,
  args: UpdateAttributeViewCellInput,
): Promise<ExecResult> {
  try {
    const databaseId = args.databaseId.trim();
    if (!databaseId) {
      return fail(args, "databaseId 不能为空。", "invalid_database_id");
    }

    // 构造更新列表：单个模式或批量模式
    const updates = args.updates && args.updates.length > 0
      ? args.updates
      : [{
          rowId: args.rowId!,
          keyId: args.keyId!,
          valueText: args.valueText!,
          valueTypeHint: args.valueTypeHint,
          expectedFieldName: args.expectedFieldName,
        }];

    const output = await readAttributeViewSafeOutput({
      databaseId,
      includeRows: true,
      rowLimit: 500,
      includeRaw: true,
    });

    const rows = output.rows ?? [];
    const totalRowCount = output.rowCount ?? rows.length;
    const results: UpdateAttributeViewCellOutput["results"] = [];
    const plannedUpdates: PlannedUpdate[] = [];
    let validationFailed = false;
    const allWarnings: string[] = [];

    // 收集所有 cellID，用于检测 cellID 冒充 rowId
    const allCellIds = collectCellIds(rows);

    // 预校验阶段：校验所有更新项并预先编码
    for (const update of updates) {
      const rowIdRaw = update.rowId.trim();
      const keyId = update.keyId.trim();

      const key = findAttributeViewKeyById(output.schema, keyId);
      if (!key) {
        results.push({
          rowId: rowIdRaw,
          keyId,
          fieldName: "",
          status: "failed",
          newValueText: update.valueText,
          message: `字段 keyId 不存在：${keyId}。`,
        });
        validationFailed = true;
        continue;
      }

      // 校验 expectedFieldName
      if (update.expectedFieldName) {
        const expectedName = update.expectedFieldName.trim();
        if (key.name !== expectedName) {
          results.push({
            rowId: rowIdRaw,
            keyId,
            fieldName: key.name,
            status: "failed",
            newValueText: update.valueText,
            message: `字段名不匹配：期望「${expectedName}」，实际「${key.name}」。`,
          });
          validationFailed = true;
          continue;
        }
      }

      // 检查是否为不支持更新的字段类型
      if (BLOCKED_UPDATE_TYPES.has(key.type)) {
        results.push({
          rowId: rowIdRaw,
          keyId,
          fieldName: key.name,
          status: "failed",
          newValueText: update.valueText,
          message: `字段「${key.name}」（${key.type}）暂不支持更新。`,
        });
        validationFailed = true;
        continue;
      }

      // 检查是否是 keyId 冒充 rowId
      const allKeyIds = new Set(output.schema.map((k) => k.keyId));
      if (allKeyIds.has(rowIdRaw)) {
        results.push({
          rowId: rowIdRaw,
          keyId,
          fieldName: key.name,
          status: "failed",
          newValueText: update.valueText,
          message: `「${rowIdRaw}」是字段 ID（keyId），不是条目 ID（rowId/itemID）。`,
        });
        validationFailed = true;
        continue;
      }

      // 检查是否是 cellID 冒充 rowId
      if (allCellIds.has(rowIdRaw)) {
        results.push({
          rowId: rowIdRaw,
          keyId,
          fieldName: key.name,
          status: "failed",
          newValueText: update.valueText,
          message: `「${rowIdRaw}」是单元格 ID（cellID），不是条目 ID（rowId/itemID）。`,
        });
        validationFailed = true;
        continue;
      }

      // 尝试解析 boundBlockId → itemID
      const { resolved: rowId, isMappedFromBound, warnings: resolveWarnings } =
        await tryResolveBoundBlockId(databaseId, rowIdRaw, rows);
      allWarnings.push(...resolveWarnings);

      // 检查 rowId 是否存在于已读取 rows 中
      const row = rows.find((r) => r.rowId === rowId);
      if (!row) {
        // 如果是从 boundBlockId 映射来的 itemID，允许写入（cellID 为空，oldValueText 为空）
        if (isMappedFromBound) {
          const encoded = createAttributeViewValue(key, update.valueText, { valueTypeHint: update.valueTypeHint });
          if (!encoded.ok || encoded.value === undefined) {
            results.push({
              rowId: rowIdRaw,
              keyId,
              fieldName: key.name,
              status: "failed",
              newValueText: update.valueText,
              message: encoded.message || "无法构造字段值。",
            });
            validationFailed = true;
            continue;
          }
          plannedUpdates.push({
            rowId,
            keyId,
            key,
            row: null,
            encoded: { ok: true, value: encoded.value },
            cellID: undefined,
            oldValueText: "",
            valueText: update.valueText,
            valueTypeHint: update.valueTypeHint,
            expectedFieldName: update.expectedFieldName,
            warnings: resolveWarnings,
          });
          continue;
        }

        // 普通 rowId 不在已读取 rows 中
        if (totalRowCount > rows.length) {
          results.push({
            rowId: rowIdRaw,
            keyId,
            fieldName: key.name,
            status: "failed",
            newValueText: update.valueText,
            message: `未在已读取的 ${rows.length} 行中找到条目 ID「${rowIdRaw}」，数据库总行数 ${totalRowCount}。请先用 find_attribute_view_rows 精确定位。`,
          });
        } else {
          results.push({
            rowId: rowIdRaw,
            keyId,
            fieldName: key.name,
            status: "failed",
            newValueText: update.valueText,
            message: `条目 ID 不存在：${rowIdRaw}。`,
          });
        }
        validationFailed = true;
        continue;
      }

      // 预先编码值
      const encoded = createAttributeViewValue(key, update.valueText, { valueTypeHint: update.valueTypeHint });
      if (!encoded.ok || encoded.value === undefined) {
        results.push({
          rowId: rowIdRaw,
          keyId,
          fieldName: key.name,
          status: "failed",
          newValueText: update.valueText,
          message: encoded.message || "无法构造字段值。",
        });
        validationFailed = true;
        continue;
      }

      // 只从 cellID/cellId 读取，不使用 raw.id
      const oldCell = row.cells[keyId];
      const rawCell = oldCell?.raw as Record<string, unknown> | undefined;
      const cellID = safeString(rawCell?.cellID ?? rawCell?.cellId) || undefined;
      const oldValueText = oldCell?.text ?? "";

      plannedUpdates.push({
        rowId,
        keyId,
        key,
        row,
        encoded: { ok: true, value: encoded.value },
        cellID,
        oldValueText,
        valueText: update.valueText,
        valueTypeHint: update.valueTypeHint,
        expectedFieldName: update.expectedFieldName,
        warnings: resolveWarnings,
      });
    }

    // 如果有预校验失败，整体拒绝，不执行任何写入
    if (validationFailed) {
      return {
        ok: false,
        errorCode: "validation_failed",
        safeOutput: {
          status: "failed",
          databaseId,
          total: updates.length,
          successCount: 0,
          failedCount: results.filter((r) => r.status === "failed").length,
          results,
          message: "预校验失败，未执行任何写入。请修正后重试。",
        },
      };
    }

    // 执行阶段：使用 plannedUpdates 执行写入
    let successCount = 0;
    let failedCount = 0;
    const executionWarnings: string[] = [];

    for (const planned of plannedUpdates) {
      try {
        await setAttributeViewBlockAttrWithCellChecked({
          avID: databaseId,
          keyID: planned.keyId,
          itemID: planned.rowId,
          cellID: planned.cellID,
          value: planned.encoded.value,
        });
        const msgSuffix = planned.oldValueText ? "" : "（旧值未在当前读取范围中取得）";
        results.push({
          rowId: planned.rowId,
          keyId: planned.keyId,
          fieldName: planned.key.name,
          status: "success",
          oldValueText: planned.oldValueText || undefined,
          newValueText: planned.valueText,
          message: `已更新字段「${planned.key.name}」。${msgSuffix}`,
        });
        successCount++;
        executionWarnings.push(...planned.warnings);
      } catch (error) {
        results.push({
          rowId: planned.rowId,
          keyId: planned.keyId,
          fieldName: planned.key.name,
          status: "failed",
          oldValueText: planned.oldValueText || undefined,
          newValueText: planned.valueText,
          message: `更新失败：${error instanceof Error ? error.message : String(error)}`,
        });
        failedCount++;
      }
    }

    // 部分成功时返回 partial 状态
    const status = failedCount === 0 ? "success" : successCount > 0 ? "partial" : "failed";
    const message = failedCount === 0
      ? successCount === 1
        ? `已更新数据库「${output.database.name || databaseId}」中条目 ID=${plannedUpdates[0].rowId} 的字段「${plannedUpdates[0].key.name}」。`
        : `已批量更新 ${successCount} 个单元格。`
      : successCount > 0
        ? `执行阶段部分失败：${successCount} 成功，${failedCount} 失败。`
        : `更新全部失败：${failedCount} 项。`;

    // 合并所有警告
    const allCombinedWarnings = [...allWarnings, ...executionWarnings];

    return {
      ok: failedCount === 0 || successCount > 0,
      safeOutput: {
        status,
        databaseId,
        total: updates.length,
        successCount,
        failedCount,
        results,
        message: allCombinedWarnings.length > 0 ? `${message}（${allCombinedWarnings.join("；")}）` : message,
      },
    };
  } catch (error) {
    return fail(args, `更新数据库单元格失败：${error instanceof Error ? error.message : String(error)}`, "attribute_view_cell_update_failed");
  }
}
