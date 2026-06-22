import {
  addAttributeViewBlocksChecked,
  appendAttributeViewDetachedBlocksWithValuesChecked,
  getAttributeViewItemIDsByBoundIDs,
  performTransactionsChecked,
  setAttributeViewBlockAttrChecked,
} from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  AddAttributeViewRowsInput,
  AddAttributeViewRowsOutput,
} from "../contracts/add-attribute-view-rows.contract";
import type { NormalizedAttributeViewKey } from "../internal/attribute-view/attribute-view-normalizer";
import {
  findAttributeViewKeyById,
  findUniqueAttributeViewKeyByName,
} from "../internal/attribute-view/attribute-view-normalizer";
import { createAttributeViewValue, createSiyuanLikeId } from "../internal/attribute-view/attribute-view-value-codec";
import { readAttributeViewSafeOutput } from "./read-attribute-view.impl";
import { normalizeItemIdMap } from "../internal/attribute-view/attribute-view-id-map";

type ExecResult = { ok: boolean; safeOutput: AddAttributeViewRowsOutput; errorCode?: string };

function fail(args: AddAttributeViewRowsInput, message: string, errorCode: string): ExecResult {
  return {
    ok: false,
    errorCode,
    safeOutput: {
      status: "failed",
      databaseId: args.databaseId,
      addedCount: 0,
      message,
    },
  };
}

function resolveValueKey(schema: NormalizedAttributeViewKey[], rawKey: string): NormalizedAttributeViewKey | undefined {
  const byId = findAttributeViewKeyById(schema, rawKey);
  if (byId) return byId;
  const byName = findUniqueAttributeViewKeyByName(schema, rawKey);
  return byName.status === "found" ? byName.key : undefined;
}

function buildDetachedRowValues(
  schema: NormalizedAttributeViewKey[],
  row: NonNullable<AddAttributeViewRowsInput["detachedRows"]>[number],
  defaultValues?: Record<string, string>,
): { ok: true; values: any[] } | { ok: false; message: string } {
  const valueMap = { ...(defaultValues ?? {}), ...(row.values ?? {}) };
  const values: any[] = [];
  const primaryKey = schema.find((key) => key.type === "block") ?? schema[0];

  if (row.title && primaryKey && !valueMap[primaryKey.keyId] && !valueMap[primaryKey.name]) {
    valueMap[primaryKey.keyId] = row.title;
  }

  for (const [rawKey, valueText] of Object.entries(valueMap)) {
    const key = resolveValueKey(schema, rawKey);
    if (!key) {
      return { ok: false, message: `未找到字段「${rawKey}」，请使用 read_attribute_view 返回的真实 keyId。` };
    }
    const encoded = createAttributeViewValue(key, valueText, { includeKeyId: true });
    if (!encoded.ok || encoded.value === undefined) {
      return { ok: false, message: encoded.message || `字段「${key.name}」无法写入。` };
    }
    values.push(encoded.value);
  }

  return { ok: true, values };
}

async function applyDefaultValuesToRows(params: {
  databaseId: string;
  schema: NormalizedAttributeViewKey[];
  rowIds: string[]; // 真实条目 ID（itemID）列表
  defaultValues: Record<string, string>;
  warnings: string[];
}) {
  for (const [rawKey, valueText] of Object.entries(params.defaultValues)) {
    const key = resolveValueKey(params.schema, rawKey);
    if (!key) {
      params.warnings.push(`默认值字段「${rawKey}」不存在，已跳过。`);
      continue;
    }
    const encoded = createAttributeViewValue(key, valueText);
    if (!encoded.ok || encoded.value === undefined) {
      params.warnings.push(encoded.message || `默认值字段「${key.name}」不支持写入，已跳过。`);
      continue;
    }
    for (const rowId of params.rowIds) {
      await setAttributeViewBlockAttrChecked(params.databaseId, key.keyId, rowId, encoded.value);
    }
  }
}

export async function executeAddAttributeViewRows(
  _deps: SiyuanToolDeps,
  args: AddAttributeViewRowsInput,
): Promise<ExecResult> {
  const databaseId = args.databaseId.trim();
  const blockIds = [...new Set((args.blockIds ?? []).map((id) => id.trim()).filter(Boolean))];
  const detachedRows = args.detachedRows ?? [];
  const warnings: string[] = [];

  // 拒绝空 databaseId
  if (!databaseId) {
    return fail(args, "databaseId 不能为空。", "invalid_database_id");
  }

  if (blockIds.length === 0 && detachedRows.length === 0) {
    return fail(args, "必须提供 blockIds 或 detachedRows。", "invalid_input");
  }
  if (blockIds.length > 20 || detachedRows.length > 20) {
    return fail(args, "一次最多添加 20 行，请分批确认。", "batch_too_large");
  }

  try {
    const read = await readAttributeViewSafeOutput({
      databaseId,
      includeRows: false,
      includeRaw: false,
    });
    const schema = read.schema;
    let addedCount = 0;
    const affectedBlockIds: string[] = [];
    const rowIds: string[] = [];

    if (blockIds.length > 0) {
      // 尝试使用 addAttributeViewBlocksChecked
      let blocksAdded = false;
      try {
        await addAttributeViewBlocksChecked({
          avID: databaseId,
          blockID: args.databaseBlockId?.trim() || undefined,
          blockIDs: blockIds,
        });
        blocksAdded = true;
      } catch (error) {
        // addAttributeViewBlocks 失败，使用 transaction 兜底
        warnings.push(`addAttributeViewBlocks 失败（${error instanceof Error ? error.message : String(error)}），尝试使用 transaction 兜底。`);

        // 需要 databaseBlockId 来构造 transaction
        const databaseBlockId = args.databaseBlockId?.trim();
        if (!databaseBlockId) {
          // 尝试从 read 结果中解析 databaseBlockId
          const rawBlockId = (read.database as any)?.blockId ?? (read.raw as any)?.av?.blockID ?? "";
          if (!rawBlockId) {
            return fail(args, "addAttributeViewBlocks 失败且未提供 databaseBlockId，无法使用 transaction 兜底。请提供 databaseBlockId 参数。", "missing_database_block_id");
          }
          // 使用解析到的 blockId
          try {
            const txOp: any = {
              action: "insertAttrViewBlock",
              avID: databaseId,
              blockID: rawBlockId,
              srcs: blockIds.map((id) => ({ itemID: createSiyuanLikeId(), id, isDetached: false })),
              ignoreDefaultFill: args.ignoreDefaultFill ?? false,
            };
            if (args.viewID) txOp.viewID = args.viewID;
            if (args.groupID) txOp.groupID = args.groupID;
            if (args.previousID) txOp.previousID = args.previousID;
            await performTransactionsChecked([{
              doOperations: [txOp],
              undoOperations: [],
            }]);
            blocksAdded = true;
          } catch (txError) {
            return fail(args, `transaction 兜底也失败：${txError instanceof Error ? txError.message : String(txError)}`, "transaction_fallback_failed");
          }
        } else {
          try {
            const txOp: any = {
              action: "insertAttrViewBlock",
              avID: databaseId,
              blockID: databaseBlockId,
              srcs: blockIds.map((id) => ({ itemID: createSiyuanLikeId(), id, isDetached: false })),
              ignoreDefaultFill: args.ignoreDefaultFill ?? false,
            };
            if (args.viewID) txOp.viewID = args.viewID;
            if (args.groupID) txOp.groupID = args.groupID;
            if (args.previousID) txOp.previousID = args.previousID;
            await performTransactionsChecked([{
              doOperations: [txOp],
              undoOperations: [],
            }]);
            blocksAdded = true;
          } catch (txError) {
            return fail(args, `transaction 兜底也失败：${txError instanceof Error ? txError.message : String(txError)}`, "transaction_fallback_failed");
          }
        }
      }

      if (blocksAdded) {
        addedCount += blockIds.length;
        affectedBlockIds.push(...blockIds);

        try {
          const rawMap = await getAttributeViewItemIDsByBoundIDs(databaseId, blockIds);
          const mapped = normalizeItemIdMap(rawMap, blockIds);
          rowIds.push(...Object.values(mapped).filter(Boolean));
        } catch (error) {
          warnings.push(`已有块已尝试加入数据库，但条目 ID 映射失败：${error instanceof Error ? error.message : String(error)}`);
        }

        if (args.defaultValues && Object.keys(args.defaultValues).length > 0) {
          if (rowIds.length === 0) {
            warnings.push("未能取得新增条目的条目 ID（itemID），默认字段值未写入；请重新读取数据库确认。");
          } else {
            await applyDefaultValuesToRows({
              databaseId,
              schema,
              rowIds,
              defaultValues: args.defaultValues,
              warnings,
            });
          }
        }
      }
    }

    if (detachedRows.length > 0) {
      const blocksValues: any[][] = [];
      for (const row of detachedRows) {
        const built = buildDetachedRowValues(schema, row, args.defaultValues);
        if (built.ok === false) {
          return fail(args, built.message, "invalid_field_value");
        }
        blocksValues.push(built.values);
      }
      await appendAttributeViewDetachedBlocksWithValuesChecked(databaseId, blocksValues);
      addedCount += detachedRows.length;
      warnings.push("脱离块行接口未稳定返回 rowId；请重新读取数据库确认新增条目。");
    }

    return {
      ok: true,
      safeOutput: {
        status: "success",
        databaseId,
        addedCount,
        affectedBlockIds: affectedBlockIds.length > 0 ? affectedBlockIds : undefined,
        rowIds: rowIds.length > 0 ? rowIds : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `已向数据库「${read.database.name || databaseId}」添加 ${addedCount} 个条目。`,
      },
    };
  } catch (error) {
    return fail(args, `添加数据库条目失败：${error instanceof Error ? error.message : String(error)}`, "attribute_view_rows_add_failed");
  }
}
