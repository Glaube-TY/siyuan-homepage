import {
  addAttributeViewBlocksChecked,
  appendAttributeViewDetachedBlocksWithValuesChecked,
  getAttributeView,
  getAttributeViewItemIDsByBoundIDs,
  setAttributeViewBlockAttrChecked,
} from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  AddAttributeViewRowsInput,
  AddAttributeViewRowsOutput,
} from "../contracts/add-attribute-view-rows.contract";
import type { NormalizedAttributeViewKey } from "../internal/attribute-view/attribute-view-normalizer";
import {
  collectAttributeViewRowIds,
  findAttributeViewKeyById,
  findUniqueAttributeViewKeyByName,
} from "../internal/attribute-view/attribute-view-normalizer";
import { createAttributeViewValue } from "../internal/attribute-view/attribute-view-value-codec";
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

/** 从原始 AV 结构收集所有真实 rowId/itemId（共享权威 helper，与 groupRows 同一规则）。 */
async function readRawRowIdSet(databaseId: string): Promise<Set<string>> {
  const av = await getAttributeView(databaseId);
  if (!av) return new Set<string>();
  return collectAttributeViewRowIds(av);
}

/** 写入已开始后的异常：不可恢复、不可重放。 */
function failWriteUncertain(args: AddAttributeViewRowsInput, detail: string): ExecResult {
  return {
    ok: false,
    errorCode: "attribute_view_rows_add_verification_failed",
    safeOutput: {
      status: "failed",
      databaseId: args.databaseId,
      addedCount: 0,
      message: `写入已开始，${detail}，结果不确定。禁止重放写入，请仅重新读取确认。`,
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
}) {
  for (const [rawKey, valueText] of Object.entries(params.defaultValues)) {
    const key = resolveValueKey(params.schema, rawKey);
    if (!key) {
      throw new Error(`默认值字段「${rawKey}」不存在。`);
    }
    const encoded = createAttributeViewValue(key, valueText);
    if (!encoded.ok || encoded.value === undefined) {
      throw new Error(encoded.message || `默认值字段「${key.name}」不支持写入。`);
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

  let writeAttempted = false;
  try {
    const read = await readAttributeViewSafeOutput({
      databaseId,
      includeRows: false,
      includeRaw: false,
    });
    const schema = read.schema;

    // 写前采集当前真实 rowId 集合（不依赖 Render 行数）
    const beforeRowIds = await readRawRowIdSet(databaseId);

    // ── 写前纯校验：所有 detachedRows 编码与 defaultValues 编码不涉及任何写 API 调用 ──
    if (args.defaultValues && Object.keys(args.defaultValues).length > 0) {
      for (const [rawKey, valueText] of Object.entries(args.defaultValues)) {
        const key = resolveValueKey(schema, rawKey);
        if (!key) {
          return fail(args, `默认值字段「${rawKey}」不存在，请使用 read_attribute_view 返回的真实 keyId。`, "invalid_field_value");
        }
        const encoded = createAttributeViewValue(key, valueText);
        if (!encoded.ok || encoded.value === undefined) {
          return fail(args, encoded.message || `默认值字段「${key.name}」不支持写入。`, "invalid_field_value");
        }
      }
    }

    const blocksValues: any[][] = [];
    for (const row of detachedRows) {
      const built = buildDetachedRowValues(schema, row, args.defaultValues);
      if (built.ok === false) return fail(args, built.message, "invalid_field_value");
      blocksValues.push(built.values);
    }

    const addedCount = blockIds.length + detachedRows.length;
    const affectedBlockIds: string[] = [];
    const rowIds: string[] = [];

    // ── 执行写入（writeAttempted 在 API 调用前设置，任何后续异常均不可重放）──
    if (blockIds.length > 0) {
      writeAttempted = true;
      await addAttributeViewBlocksChecked({
        avID: databaseId,
        blockID: args.databaseBlockId?.trim() || undefined,
        blockIDs: blockIds,
      });
      affectedBlockIds.push(...blockIds);

      if (args.defaultValues && Object.keys(args.defaultValues).length > 0) {
        const rawMap = await getAttributeViewItemIDsByBoundIDs(databaseId, blockIds);
        const mapped = normalizeItemIdMap(rawMap, blockIds);
        const mappedRowIds = Object.values(mapped).filter(Boolean);
        if (mappedRowIds.length !== blockIds.length) {
          throw new Error("未能取得全部新增条目的条目 ID，默认字段值写入不完整。");
        }
        await applyDefaultValuesToRows({ databaseId, schema, rowIds: mappedRowIds, defaultValues: args.defaultValues });
      }
    }

    if (detachedRows.length > 0) {
      writeAttempted = true;
      await appendAttributeViewDetachedBlocksWithValuesChecked(databaseId, blocksValues);
    }


    // ── 写后回读验证：旧 ID 全保留 + 新增数量精确匹配 + 返回真实新 rowIds ──
    const afterRowIds = await readRawRowIdSet(databaseId);
    const disappeared = [...beforeRowIds].filter((id) => !afterRowIds.has(id));
    if (disappeared.length > 0) {
      return failWriteUncertain(args, `写后回读发现 ${disappeared.length} 个原有条目消失`);
    }
    const actualNewIds = [...afterRowIds].filter((id) => !beforeRowIds.has(id));
    const expectedTotal = blockIds.length + detachedRows.length;
    if (expectedTotal > 0 && actualNewIds.length !== expectedTotal) {
      return failWriteUncertain(args, `写后回读新增 ${actualNewIds.length} 条，预期 ${expectedTotal} 条`);
    }
    rowIds.length = 0;
    rowIds.push(...actualNewIds);

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
    if (writeAttempted) {
      return failWriteUncertain(args, `写入过程中发生异常：${error instanceof Error ? error.message : String(error)}`);
    }
    return fail(args, `添加数据库条目失败：${error instanceof Error ? error.message : String(error)}`, "attribute_view_rows_add_failed");
  }
}
