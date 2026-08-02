import assert from "node:assert/strict";

import { addAttributeViewKeyInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/add-attribute-view-key.contract";
import { addAttributeViewRowsInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/add-attribute-view-rows.contract";
import { clearAttributeViewCellInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/clear-attribute-view-cell.contract";
import { findAttributeViewRowsInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/find-attribute-view-rows.contract";
import { listAttributeViewsInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/list-attribute-views.contract";
import { readAttributeViewInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/read-attribute-view.contract";
import { removeAttributeViewKeyInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/remove-attribute-view-key.contract";
import { removeAttributeViewRowsInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/remove-attribute-view-rows.contract";
import { siyuanDatabaseExtraReadInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-database-extra-read.contract";
import { siyuanDatabaseViewInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-database-view.contract";
import { updateAttributeViewCellInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/update-attribute-view-cell.contract";
import { executeAddAttributeViewKey } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/add-attribute-view-key.impl";
import { executeAddAttributeViewRows } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/add-attribute-view-rows.impl";
import { executeClearAttributeViewCell } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/clear-attribute-view-cell.impl";
import { executeFindAttributeViewRows } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/find-attribute-view-rows.impl";
import { executeListAttributeViews } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/list-attribute-views.impl";
import { executeReadAttributeView } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/read-attribute-view.impl";
import { executeRemoveAttributeViewKey } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/remove-attribute-view-key.impl";
import { executeRemoveAttributeViewRows } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/remove-attribute-view-rows.impl";
import { executeSiyuanDatabaseExtraRead } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-database-extra-read.impl";
import { executeSiyuanDatabaseView } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-database-view.impl";
import { executeUpdateAttributeViewCell } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/update-attribute-view-cell.impl";

interface ResultRow {
  action: string;
  ok: boolean;
  detail?: string;
}

const results: ResultRow[] = [];
const deps = {} as never;

async function runSafe<T>(
  name: string,
  schema: { parse(value: unknown): T },
  execute: (deps: never, args: T) => Promise<{ safeOutput: any }>,
  raw: unknown,
) {
  try {
    const args = schema.parse(raw);
    const safeOutput = (await execute(deps, args)).safeOutput;
    if (typeof safeOutput?.status === "string") {
      assert.notEqual(safeOutput.status, "failed", JSON.stringify(safeOutput));
    }
    results.push({ action: name, ok: true });
    return safeOutput;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

async function runGeneric<T>(
  name: string,
  schema: { parse(value: unknown): T },
  execute: (args: T) => Promise<{ output: any }>,
  raw: unknown,
) {
  try {
    const args = schema.parse(raw);
    const output = (await execute(args)).output;
    assert.equal(output.action, (args as any).action);
    results.push({ action: name, ok: true });
    return output;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

// 用户测试空间中专门用于数据库 API 验收的数据库，不触碰生产笔记本。
const databaseId = "20260622132241-j8l8xmp";
const databaseBlockId = "20260622132228-g8cuirh";
const suffix = Date.now().toString(36);
const keyName = `NB验收字段-${suffix}`;
const rowTitle = `NB验收条目-${suffix}`;
const cellValue = `NB验收值-${suffix}`;
let keyId = "";
let rowId = "";

try {
  const listed = await runSafe("database.list", listAttributeViewsInputSchema, executeListAttributeViews, { keyword: "数据库测试", limit: 20 });
  const listedDatabase = listed.items.find((item: any) => item.databaseId === databaseId);
  assert.ok(listedDatabase);

  const initial = await runSafe("database.read", readAttributeViewInputSchema, executeReadAttributeView, {
    databaseId,
    includeRows: true,
    rowLimit: 50,
  });
  const viewId = String(initial.viewId || listedDatabase.viewIds?.[0] || (initial.database as any)?.viewIds?.[0] || "");
  const primaryKeyId = String(initial.schema.find((key: any) => key.type === "block")?.keyId || initial.schema[0]?.keyId || "");
  assert.match(viewId, /^\d{14}-[a-z0-9]{7}$/);
  assert.match(primaryKeyId, /^\d{14}-[a-z0-9]{7}$/);

  const addedKey = await runSafe("database.add_key", addAttributeViewKeyInputSchema, executeAddAttributeViewKey, {
    databaseId,
    keyName,
    keyType: "text",
    previousKeyId: primaryKeyId,
    summary: "隔离验收字段",
  });
  keyId = String(addedKey.keyId || "");
  assert.match(keyId, /^\d{14}-[a-z0-9]{7}$/);

  const addedRows = await runSafe("database.add_rows", addAttributeViewRowsInputSchema, executeAddAttributeViewRows, {
    databaseId,
    databaseBlockId,
    detachedRows: [{ title: rowTitle, values: { [keyId]: cellValue } }],
    viewID: viewId,
    summary: "隔离验收条目",
  });
  rowId = String(addedRows.rowIds?.[0] || "");

  const refreshed = await runSafe("database.read_after_add", readAttributeViewInputSchema, executeReadAttributeView, {
    databaseId,
    viewId,
    includeRows: true,
    rowLimit: 100,
  });
  const addedRow = refreshed.rows?.find((row: any) => row.rowId === rowId || row.boundBlockId === rowId || row.title === rowTitle);
  assert.ok(addedRow, JSON.stringify(refreshed.rows));
  rowId = String(addedRow.rowId || rowId);
  assert.match(rowId, /^\d{14}-[a-z0-9]{7}$/);
  const boundBlockId = String(addedRow.boundBlockId || rowId);

  await runSafe("database.find_rows", findAttributeViewRowsInputSchema, executeFindAttributeViewRows, {
    databaseId,
    viewId,
    query: rowTitle,
    limit: 20,
  });
  await runSafe("database.update_cell", updateAttributeViewCellInputSchema, executeUpdateAttributeViewCell, {
    databaseId,
    rowId,
    keyId,
    valueText: `${cellValue}-更新`,
    expectedFieldName: keyName,
    summary: "验收更新单元格",
  });
  await runSafe("database.clear_cell", clearAttributeViewCellInputSchema, executeClearAttributeViewCell, {
    databaseId,
    rowId,
    keyId,
    expectedFieldName: keyName,
    summary: "验收清空单元格",
  });

  await runGeneric("database.extra_read.filter_sort", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "filter_sort", avID: databaseId, blockID: databaseBlockId });
  await runGeneric("database.extra_read.primary_key_values", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "primary_key_values", avID: databaseId, keyword: rowTitle, page: 1, pageSize: 20 });
  await runGeneric("database.extra_read.mirror_blocks", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "mirror_blocks", avID: databaseId });
  await runGeneric("database.extra_read.keys_by_av_id", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "keys_by_av_id", avID: databaseId });
  await runGeneric("database.extra_read.keys_by_block_id", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "keys_by_block_id", blockID: databaseBlockId });
  await runGeneric("database.extra_read.bound_ids_by_item_ids", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "bound_ids_by_item_ids", avID: databaseId, itemIDs: [rowId] });
  await runGeneric("database.extra_read.item_ids_by_bound_ids", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "item_ids_by_bound_ids", avID: databaseId, boundIDs: [boundBlockId] });
  await runGeneric("database.extra_read.current_images", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "current_images", avID: databaseId, viewID: viewId });
  await runGeneric("database.extra_read.unused_attribute_views", siyuanDatabaseExtraReadInputSchema, executeSiyuanDatabaseExtraRead, { action: "unused_attribute_views", maxItems: 20 });

  await runGeneric("database.view.set_database_block_view", siyuanDatabaseViewInputSchema, executeSiyuanDatabaseView, { action: "set_database_block_view", avID: databaseId, blockID: databaseBlockId, viewID: viewId });
  await runGeneric("database.view.sort_key", siyuanDatabaseViewInputSchema, executeSiyuanDatabaseView, { action: "sort_key", avID: databaseId, keyID: keyId, previousKeyID: primaryKeyId });
  await runGeneric("database.view.sort_view_key", siyuanDatabaseViewInputSchema, executeSiyuanDatabaseView, { action: "sort_view_key", avID: databaseId, viewID: viewId, keyID: keyId, previousKeyID: primaryKeyId });
  await runGeneric("database.view.change_layout", siyuanDatabaseViewInputSchema, executeSiyuanDatabaseView, { action: "change_layout", avID: databaseId, blockID: databaseBlockId, layoutType: "table" });
  await runGeneric("database.view.set_group", siyuanDatabaseViewInputSchema, executeSiyuanDatabaseView, {
    action: "set_group",
    avID: databaseId,
    blockID: databaseBlockId,
    group: { field: keyId, method: 0, order: 0, hideEmpty: false },
  });
  await runGeneric("database.view.clear_group", siyuanDatabaseViewInputSchema, executeSiyuanDatabaseView, {
    action: "set_group",
    avID: databaseId,
    blockID: databaseBlockId,
    group: null,
  });
} finally {
  if (rowId) {
    try {
      await runSafe("database.remove_rows", removeAttributeViewRowsInputSchema, executeRemoveAttributeViewRows, {
        databaseId,
        databaseBlockId,
        rowIds: [rowId],
        expectedTitles: [rowTitle],
        summary: "清理隔离验收条目",
      });
    } catch {
      // The final report keeps the failed cleanup action.
    }
  }
  if (keyId) {
    try {
      await runSafe("database.remove_key", removeAttributeViewKeyInputSchema, executeRemoveAttributeViewKey, {
        databaseId,
        keyId,
        expectedKeyName: keyName,
        removeRelationDest: false,
        summary: "清理隔离验收字段",
      });
    } catch {
      // The final report keeps the failed cleanup action.
    }
  }
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
