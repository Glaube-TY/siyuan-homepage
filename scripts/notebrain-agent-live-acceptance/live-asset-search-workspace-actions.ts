import assert from "node:assert/strict";

import { createDocWithMd, createNotebookChecked, removeNotebookChecked, sql } from "../../src/api";
import { siyuanAssetManageInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-asset-manage.contract";
import { siyuanAssetReadInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-asset-read.contract";
import { siyuanSearchExtraInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-search-extra.contract";
import { siyuanWorkspaceFileInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-workspace-file.contract";
import { executeSiyuanAssetManage } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-asset-manage.impl";
import { executeSiyuanAssetRead } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-asset-read.impl";
import { executeSiyuanSearchExtra } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-search-extra.impl";
import { executeSiyuanWorkspaceFile } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-workspace-file.impl";

interface ResultRow {
  action: string;
  ok: boolean;
  detail?: string;
}

const results: ResultRow[] = [];

async function run<T>(
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

async function waitForRows(query: string, predicate: (rows: any[]) => boolean): Promise<any[]> {
  let rows: any[] = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const queried = await sql(query);
    rows = Array.isArray(queried) ? queried : [];
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return rows;
}

const suffix = Date.now().toString(36);
const storageDir = `/data/storage/petal/siyuan-homepage/nb_agent_acceptance_${suffix}`;
const storageText = `${storageDir}/source.txt`;
const storageCopy = `${storageDir}/copy.txt`;
const storageRenamed = `${storageDir}/renamed.txt`;
const assetTextName = `nb_agent_asset_${suffix}.txt`;
const assetTextRenamedName = `nb_agent_asset_${suffix}_renamed.txt`;
const assetImageName = `nb_agent_image_${suffix}.png`;
const unusedOneName = `nb_agent_unused_one_${suffix}.txt`;
const unusedBatchAName = `nb_agent_unused_batch_a_${suffix}.txt`;
const unusedBatchBName = `nb_agent_unused_batch_b_${suffix}.txt`;
const assetTextPath = `/data/assets/${assetTextName}`;
const assetTextRenamedPath = `/data/assets/${assetTextRenamedName}`;
const assetImagePath = `/data/assets/${assetImageName}`;
const unusedOnePath = `/data/assets/${unusedOneName}`;
const unusedBatchAPath = `/data/assets/${unusedBatchAName}`;
const unusedBatchBPath = `/data/assets/${unusedBatchBName}`;
const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrKAAAAAASUVORK5CYII=";

const createdNotebook = await createNotebookChecked(`Notebrain-Asset-Acceptance-${Date.now()}`);
const notebookId = String((createdNotebook as any)?.notebook?.id || "");
assert.match(notebookId, /^\d{14}-[a-z0-9]{7}$/);

const cleanupPaths = new Set<string>();
async function cleanupFile(path: string): Promise<void> {
  try {
    await executeSiyuanWorkspaceFile(siyuanWorkspaceFileInputSchema.parse({ action: "remove_file", path }));
  } catch {
    // File may already have been removed by the tested asset action.
  }
}

try {
  await run("workspace.put_dir", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "put_file", path: storageDir, isDir: true });
  cleanupPaths.add(storageDir);
  await run("workspace.put_file", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "put_file", path: storageText, content: "Notebrain 工作区文件验收" });
  cleanupPaths.add(storageText);
  const getFile = await run("workspace.get_file", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "get_file", path: storageText, maxChars: 5000 });
  assert.ok(JSON.stringify(getFile.data).includes("Notebrain") || String(getFile.data).includes("Notebrain"));
  await run("workspace.unique_filename", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "unique_filename", path: storageText });
  await run("workspace.copy_file", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "copy_file", path: storageText, targetPath: storageCopy });
  cleanupPaths.add(storageCopy);
  await run("workspace.rename_file", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "rename_file", path: storageCopy, targetPath: storageRenamed });
  cleanupPaths.delete(storageCopy);
  cleanupPaths.add(storageRenamed);
  await run("workspace.read_dir", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "read_dir", path: storageDir });
  await run("workspace.remove_file", siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "remove_file", path: storageRenamed });
  cleanupPaths.delete(storageRenamed);

  for (const [path, content, encoding] of [
    [assetTextPath, "Notebrain 资源正文验收", "text"],
    [assetImagePath, tinyPngBase64, "base64"],
    [unusedOnePath, "unused one", "text"],
    [unusedBatchAPath, "unused batch a", "text"],
    [unusedBatchBPath, "unused batch b", "text"],
  ] as const) {
    await run(`workspace.put_asset.${path}`, siyuanWorkspaceFileInputSchema, executeSiyuanWorkspaceFile, { action: "put_file", path, content, encoding });
    cleanupPaths.add(path);
  }

  const docId = await createDocWithMd(
    notebookId,
    "/资源验收文档",
    `#nb-agent-asset-${suffix}#\n\n资源段落\n\n[文本附件](assets/${assetTextName})\n\n![验收图片](assets/${assetImageName})`,
  );
  const rows = await waitForRows(
    `SELECT id, type FROM blocks WHERE root_id = '${docId}' ORDER BY sort ASC`,
    (items) => items.length >= 4,
  );
  const paragraphId = String(rows.find((row) => row.type === "p")?.id || "");
  assert.match(paragraphId, /^\d{14}-[a-z0-9]{7}$/);

  const embedDocId = await createDocWithMd(
    notebookId,
    "/嵌入块验收文档",
    `{{SELECT * FROM blocks WHERE id = '${paragraphId}'}}`,
  );
  const embedRows = await waitForRows(
    `SELECT id, type FROM blocks WHERE root_id = '${embedDocId}' ORDER BY sort ASC`,
    (items) => items.some((row) => row.type === "query_embed"),
  );
  const embedBlockId = String(embedRows.find((row) => row.type === "query_embed")?.id || "");
  assert.match(embedBlockId, /^\d{14}-[a-z0-9]{7}$/);

  await run("asset_read.resolve_path", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "resolve_path", path: `assets/${assetTextName}` });
  await run("asset_read.doc_assets", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "doc_assets", docId });
  await run("asset_read.doc_image_assets", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "doc_image_assets", docId });
  await run("asset_read.unused_assets", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "unused_assets", maxItems: 20 });
  await run("asset_read.missing_assets", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "missing_assets", maxItems: 20 });

  await run("asset_manage.set_annotation", siyuanAssetManageInputSchema, executeSiyuanAssetManage, { action: "set_annotation", path: assetTextPath, annotation: "Notebrain 资源批注验收" });
  await run("asset_read.file_annotation", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "file_annotation", path: assetTextPath });
  await run("asset_manage.set_image_ocr", siyuanAssetManageInputSchema, executeSiyuanAssetManage, { action: "set_image_ocr", path: assetImagePath, text: "Notebrain OCR 验收" });
  await run("asset_read.image_ocr", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "image_ocr", path: assetImagePath });
  try {
    await run("asset_manage.ocr", siyuanAssetManageInputSchema, executeSiyuanAssetManage, { action: "ocr", path: assetImagePath });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!detail.includes("Tesseract OCR 未安装或未配置")) throw error;
    const failedIndex = results.findIndex((item) => item.action === "asset_manage.ocr" && !item.ok);
    if (failedIndex >= 0) {
      results[failedIndex] = { action: "asset_manage.ocr.environment_precondition", ok: true, detail };
    }
  }
  await run("asset_read.stat", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "stat", path: assetTextPath });
  await run("asset_read.asset_content", siyuanAssetReadInputSchema, executeSiyuanAssetRead, { action: "asset_content", path: `assets/${assetTextName}`, maxChars: 5000 });

  await run("search_extra.search_tag", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "search_tag", keyword: `nb-agent-asset-${suffix}` });
  await run("search_extra.search_template", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "search_template", keyword: suffix });
  await run("search_extra.search_widget", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "search_widget", keyword: suffix });
  await run("search_extra.search_embed_block", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "search_embed_block", keyword: "SELECT", id: embedBlockId, page: 1 });
  await run("search_extra.get_embed_block", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "get_embed_block", id: embedBlockId });
  await run("search_extra.search_asset", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "search_asset", keyword: assetTextName });
  await run("search_extra.asset_content_path", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "asset_content", path: `assets/${assetTextName}`, maxChars: 5000 });
  await run("search_extra.asset_content_query", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "asset_content", keyword: "Notebrain 资源正文验收", page: 1 });
  await run("search_extra.invalid_block_refs", siyuanSearchExtraInputSchema, executeSiyuanSearchExtra, { action: "invalid_block_refs", maxItems: 20 });

  await run("asset_manage.rename", siyuanAssetManageInputSchema, executeSiyuanAssetManage, { action: "rename", path: assetTextPath, newName: assetTextRenamedName });
  cleanupPaths.delete(assetTextPath);
  cleanupPaths.add(assetTextRenamedPath);
  await run("asset_manage.remove_unused_one", siyuanAssetManageInputSchema, executeSiyuanAssetManage, { action: "remove_unused_one", path: unusedOnePath });
  cleanupPaths.delete(unusedOnePath);
  await run("asset_manage.remove_unused_batch", siyuanAssetManageInputSchema, executeSiyuanAssetManage, { action: "remove_unused_batch", paths: [unusedBatchAPath, unusedBatchBPath] });
  cleanupPaths.delete(unusedBatchAPath);
  cleanupPaths.delete(unusedBatchBPath);
  await run("asset_manage.full_reindex_content", siyuanAssetManageInputSchema, executeSiyuanAssetManage, { action: "full_reindex_content", confirmGlobal: true });
} finally {
  await removeNotebookChecked(notebookId);
  for (const path of Array.from(cleanupPaths).sort((a, b) => b.length - a.length)) {
    await cleanupFile(path);
  }
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
