import assert from "node:assert/strict";

import {
  createDocWithMd,
  createNotebookChecked,
  getChildBlocksChecked,
  removeNotebookChecked,
  sql,
} from "../../src/api";
import { siyuanBlockAttrInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-block-attr.contract";
import { siyuanBlockReadInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-block-read.contract";
import { siyuanBlockStateInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-block-state.contract";
import { siyuanDocPathInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-doc-path.contract";
import { siyuanDocTreeInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-doc-tree.contract";
import { siyuanOutlineInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-outline.contract";
import { siyuanRefInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-ref.contract";
import { executeSiyuanBlockAttr } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-block-attr.impl";
import { executeSiyuanBlockRead } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-block-read.impl";
import { executeSiyuanBlockState } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-block-state.impl";
import { executeSiyuanDocPath } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-doc-path.impl";
import { executeSiyuanDocTree } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-doc-tree.impl";
import { executeSiyuanOutline } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-outline.impl";
import { executeSiyuanRef } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-ref.impl";

interface ResultRow {
  action: string;
  ok: boolean;
  detail?: string;
}

const results: ResultRow[] = [];

async function run<T>(name: string, schema: { parse(value: unknown): T }, execute: (args: T) => Promise<{ output: any }>, raw: unknown) {
  try {
    const args = schema.parse(raw);
    const output = (await execute(args)).output;
    assert.equal(output.action, (args as any).action ?? name);
    results.push({ action: name, ok: true });
    return output;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

const createdNotebook = await createNotebookChecked(`Notebrain-Core-Acceptance-${Date.now()}`);
const notebookId = String((createdNotebook as any)?.notebook?.id || "");
assert.match(notebookId, /^\d{14}-[a-z0-9]{7}$/);

try {
  const docId = await createDocWithMd(
    notebookId,
    "/Agent验收/主文档",
    "# 验收标题\n\n验收段落 Alpha\n\n* [ ] 验收待办\n* 验收列表项",
  );
  assert.match(docId, /^\d{14}-[a-z0-9]{7}$/);
  let rows: any[] = [];
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const queried = await sql(`SELECT id, type, subtype, markdown, path, hpath FROM blocks WHERE root_id = '${docId}' ORDER BY sort ASC`);
    rows = Array.isArray(queried) ? queried : [];
    if (rows.length >= 4) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(rows.length >= 4, JSON.stringify(rows));
  const headingId = String(rows.find((row: any) => row.type === "h")?.id || "");
  const paragraphId = String(rows.find((row: any) => row.type === "p")?.id || "");
  const taskId = String(rows.find((row: any) => row.type === "i" && row.subtype === "t")?.id || "");
  assert.match(headingId, /^\d{14}-[a-z0-9]{7}$/);
  assert.match(paragraphId, /^\d{14}-[a-z0-9]{7}$/);
  assert.match(taskId, /^\d{14}-[a-z0-9]{7}$/);

  const refDocId = await createDocWithMd(notebookId, "/Agent验收/引用文档", `引用内容 ((${paragraphId} "验收引用"))`);
  assert.match(refDocId, /^\d{14}-[a-z0-9]{7}$/);

  const pathOutput = await run("doc_path.path_by_id", siyuanDocPathInputSchema, executeSiyuanDocPath, { action: "path_by_id", id: docId });
  const kernelPath = String((pathOutput.data as any)?.path ?? pathOutput.data ?? "");
  assert.ok(kernelPath.endsWith(".sy"), JSON.stringify(pathOutput.data));
  const hpathOutput = await run("doc_path.hpath_by_id", siyuanDocPathInputSchema, executeSiyuanDocPath, { action: "hpath_by_id", id: docId });
  const hpath = String((hpathOutput.data as any)?.hPath ?? (hpathOutput.data as any)?.hpath ?? hpathOutput.data ?? "");
  assert.ok(hpath.includes("主文档"));
  await run("doc_path.full_hpath_by_id", siyuanDocPathInputSchema, executeSiyuanDocPath, { action: "full_hpath_by_id", id: paragraphId });
  await run("doc_path.hpath_by_path", siyuanDocPathInputSchema, executeSiyuanDocPath, { action: "hpath_by_path", notebook: notebookId, path: kernelPath });
  await run("doc_path.hpaths_by_paths", siyuanDocPathInputSchema, executeSiyuanDocPath, { action: "hpaths_by_paths", paths: [kernelPath] });
  await run("doc_path.ids_by_hpath", siyuanDocPathInputSchema, executeSiyuanDocPath, { action: "ids_by_hpath", notebook: notebookId, hpath });

  await run("doc_tree.list_children", siyuanDocTreeInputSchema, executeSiyuanDocTree, { action: "list_children", notebook: notebookId, path: "/" });
  await run("doc_tree.list_tree", siyuanDocTreeInputSchema, executeSiyuanDocTree, { action: "list_tree", notebook: notebookId, path: "/" });

  const childBlocks = await getChildBlocksChecked(docId);
  assert.ok(Array.isArray(childBlocks) && childBlocks.length > 0);
  const blockReadCases = [
    ["info", { id: paragraphId }],
    ["dom", { id: paragraphId }],
    ["doms", { ids: [paragraphId, headingId] }],
    ["dom_with_embed", { id: paragraphId }],
    ["kramdown", { id: paragraphId }],
    ["kramdowns", { ids: [paragraphId, headingId] }],
    ["children", { id: docId }],
    ["tail_children", { id: docId }],
    ["breadcrumb", { id: paragraphId }],
    ["index", { id: paragraphId }],
    ["sibling", { id: paragraphId }],
    ["relevant_ids", { id: paragraphId }],
    ["tree_infos", { ids: [paragraphId, headingId] }],
    ["word_count", { ids: [docId] }],
    ["check_exist", { id: paragraphId }],
    ["recent_updated", { id: docId, maxItems: 10 }],
  ] as const;
  for (const [action, args] of blockReadCases) {
    await run(`block_read.${action}`, siyuanBlockReadInputSchema, executeSiyuanBlockRead, { action, ...args });
  }

  await run("block_attr.get", siyuanBlockAttrInputSchema, executeSiyuanBlockAttr, { action: "get", id: paragraphId });
  await run("block_attr.batch_get", siyuanBlockAttrInputSchema, executeSiyuanBlockAttr, { action: "batch_get", ids: [paragraphId, headingId] });
  await run("block_attr.set", siyuanBlockAttrInputSchema, executeSiyuanBlockAttr, { action: "set", id: paragraphId, attrs: { "custom-notebrain-acceptance": "单项" } });
  await run("block_attr.batch_set", siyuanBlockAttrInputSchema, executeSiyuanBlockAttr, { action: "batch_set", items: [{ id: paragraphId, attrs: { "custom-notebrain-acceptance-batch": "批量" } }] });

  await run("block_state.fold", siyuanBlockStateInputSchema, executeSiyuanBlockState, { action: "fold", id: headingId });
  await run("block_state.unfold", siyuanBlockStateInputSchema, executeSiyuanBlockState, { action: "unfold", id: headingId });
  await run("block_state.set_reminder", siyuanBlockStateInputSchema, executeSiyuanBlockState, { action: "set_reminder", id: paragraphId, reminder: "20260803090000" });
  await run("block_state.update_task_marker", siyuanBlockStateInputSchema, executeSiyuanBlockState, { action: "update_task_marker", id: taskId, marker: "x" });
  await run("block_state.batch_update_task_marker", siyuanBlockStateInputSchema, executeSiyuanBlockState, { action: "batch_update_task_marker", items: [{ id: taskId, marker: " " }] });

  const outlineArgs = siyuanOutlineInputSchema.parse({ docId, maxDepth: 6, maxItems: 50 });
  const outline = (await executeSiyuanOutline(outlineArgs)).output;
  assert.equal(outline.action, "outline");
  results.push({ action: "outline", ok: true });

  const refCases = [
    ["backlink", { docId }],
    ["backlink_doc", { docId }],
    ["backmention_doc", { docId }],
    ["search_ref_block", { keyword: "验收引用", id: docId }],
    ["refresh_backlink", {}],
  ] as const;
  for (const [action, args] of refCases) {
    await run(`refs.${action}`, siyuanRefInputSchema, executeSiyuanRef, { action, ...args });
  }
} finally {
  await removeNotebookChecked(notebookId);
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
