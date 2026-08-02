import assert from "node:assert/strict";

import { createDocWithMd, createNotebookChecked, removeNotebookChecked, sql } from "../../src/api";
import { registerDocContentEditConfirmationHandler } from "../../src/features/kb/services/doc-content-edit/doc-content-edit-confirmation-bridge";
import { setNotebrainPlugin } from "../../src/features/kb/services/agent-workbench/storage";
import { createDocInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/create-doc.contract";
import { deleteBlocksInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/delete-blocks.contract";
import { deleteDocInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/delete-doc.contract";
import { getDocInfoInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/get-doc-info.contract";
import { insertBlockInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/insert-block.contract";
import { listItemsByTimeInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/list-items-by-time.contract";
import { listKnowledgeMapInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/list-knowledge-map.contract";
import { moveBlockInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/move-block.contract";
import { readDocBlocksInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/read-doc-blocks.contract";
import { readDocsInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/read-docs.contract";
import { readEvidenceInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/read-evidence.contract";
import { renameDocInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/rename-doc.contract";
import { replaceDocContentInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/replace-doc-content.contract";
import { searchScopeInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/search-scope.contract";
import { updateBlockInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/update-block.contract";
import { executeCreateDoc } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/create-doc.impl";
import { executeDeleteBlocks } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/delete-blocks.impl";
import { executeDeleteDoc } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/delete-doc.impl";
import { executeGetDocInfo } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/get-doc-info.impl";
import { executeInsertBlock } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/insert-block.impl";
import { executeListItemsByTime } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/list-items-by-time.impl";
import { executeListKnowledgeMap } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/list-knowledge-map.impl";
import { executeMoveBlock } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/move-block.impl";
import { executeReadDocBlocks } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/read-doc-blocks.impl";
import { executeReadDocs } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/read-docs.impl";
import { executeReadEvidence } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/read-evidence.impl";
import { executeRenameDoc } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/rename-doc.impl";
import { executeReplaceDocContent } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/replace-doc-content.impl";
import { executeSearchScope } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/search-scope.impl";
import { executeUpdateBlock } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/update-block.impl";
import type { SiyuanToolDeps } from "../../src/features/kb/services/agent-workbench/tools/siyuan/siyuan-tool-deps";

interface ResultRow { action: string; ok: boolean; detail?: string }
const results: ResultRow[] = [];
const pluginFiles = new Map<string, unknown>();
setNotebrainPlugin({
  async loadData(key: string) {
    return structuredClone(pluginFiles.get(key) ?? null);
  },
  async saveData(key: string, value: unknown) {
    pluginFiles.set(key, structuredClone(value));
  },
  async removeData(key: string) {
    pluginFiles.delete(key);
  },
} as never);

async function waitForRows(query: string, predicate: (rows: any[]) => boolean): Promise<any[]> {
  let rows: any[] = [];
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const queried = await sql(query);
    rows = Array.isArray(queried) ? queried : [];
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return rows;
}

async function runSafe<T>(name: string, schema: { parse(value: unknown): T }, execute: (deps: any, args: T) => Promise<{ safeOutput: any }>, deps: any, raw: unknown) {
  try {
    const args = schema.parse(raw);
    const safeOutput = (await execute(deps, args)).safeOutput;
    results.push({ action: name, ok: true });
    return safeOutput;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

async function runWrite<T>(name: string, schema: { parse(value: unknown): T }, execute: (deps: any, args: T) => Promise<{ output: any }>, deps: any, raw: unknown) {
  try {
    const args = schema.parse(raw);
    const output = (await execute(deps, args)).output;
    assert.equal(output.status, "success", JSON.stringify(output));
    results.push({ action: name, ok: true });
    return output;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

const suffix = Date.now().toString(36);
const uniqueKeyword = `NotebrainKbEdit${suffix}`;
const panelInstanceId = `panel-${suffix}`;
const conversationId = `conversation-${suffix}`;
const turnId = `turn-${suffix}`;
const createdNotebook = await createNotebookChecked(`Notebrain-KB-Edit-Acceptance-${Date.now()}`);
const notebookId = String((createdNotebook as any)?.notebook?.id || "");
assert.match(notebookId, /^\d{14}-[a-z0-9]{7}$/);

const scope = { type: "notebook", notebookId, notebookName: "Notebrain 验收" } as const;
const deps: SiyuanToolDeps & { conversationId: string } = {
  conversationId,
  getScope: () => scope,
  getEffectiveScope: () => scope,
  getSettings: () => ({}),
  confirmationRoute: { panelInstanceId, conversationId, turnId },
};
const disposeConfirmation = registerDocContentEditConfirmationHandler(panelInstanceId, async () => ({
  status: "confirmed",
  message: "隔离测试自动确认",
}));

try {
  const created = await runWrite("doc_edit.create_doc", createDocInputSchema, executeCreateDoc, deps, {
    notebookId,
    path: "/Agent验收/主文档",
    markdown: `${uniqueKeyword}\n\n原始段落甲\n\n原始段落乙`,
  });
  const docId = String(created.target?.docId || "");
  assert.match(docId, /^\d{14}-[a-z0-9]{7}$/);
  const childDocId = await createDocWithMd(notebookId, "/Agent验收/主文档/子文档", `${uniqueKeyword} 子文档`);
  const sacrifice = await runWrite("doc_edit.create_doc_sacrifice", createDocInputSchema, executeCreateDoc, deps, {
    notebookId,
    path: "/Agent验收/待删除文档",
    markdown: "待删除内容",
  });
  const sacrificeDocId = String(sacrifice.target?.docId || "");
  assert.match(sacrificeDocId, /^\d{14}-[a-z0-9]{7}$/);

  let rows = await waitForRows(
    `SELECT id, type, content FROM blocks WHERE root_id = '${docId}' ORDER BY sort ASC`,
    (items) => items.filter((item) => item.type === "p").length >= 3,
  );
  const paragraphIds = rows.filter((row) => row.type === "p").map((row) => String(row.id));
  assert.ok(paragraphIds.length >= 3);

  await runSafe("kb.search", searchScopeInputSchema, executeSearchScope, deps, { query: uniqueKeyword, limit: 20 });
  const readDoc = await runSafe("kb.read_docs", readDocsInputSchema, executeReadDocs, deps, { docIds: [docId], chunkChars: 2000 });
  assert.ok(readDoc.items.length >= 1);
  await runSafe("kb.read_docs_block", readDocsInputSchema, executeReadDocs, deps, { blockIds: [paragraphIds[1]], maxChars: 5000 });
  await runSafe("kb.read_evidence", readEvidenceInputSchema, executeReadEvidence, deps, { blockIds: [paragraphIds[1]], maxCharsPerBlock: 1000 });
  await runSafe("kb.get_doc_info", getDocInfoInputSchema, executeGetDocInfo, deps, { docId });

  for (const raw of [
    { view: "notebooks", limit: 20 },
    { view: "notebook_roots", notebookId, limit: 20 },
    { view: "children", rootDocId: docId, limit: 20 },
    { view: "subtree", rootDocId: docId, maxDepth: 3, limit: 20 },
    { view: "neighborhood", centerDocId: docId, limit: 20 },
    { view: "list", notebookId, limit: 20 },
  ]) {
    await runSafe(`kb.list_map.${raw.view}`, listKnowledgeMapInputSchema, executeListKnowledgeMap, deps, raw);
  }
  await runSafe("kb.list_by_time.docs", listItemsByTimeInputSchema, executeListItemsByTime, deps, { itemType: "doc", sortBy: "updated", limit: 20 });
  await runSafe("kb.list_by_time.blocks", listItemsByTimeInputSchema, executeListItemsByTime, deps, { itemType: "block", blockTypes: ["p"], limit: 20 });

  for (const raw of [
    { targetId: paragraphIds[1], scope: "self" },
    { targetId: docId, scope: "children", maxBlocks: 20 },
    { targetId: paragraphIds[1], scope: "siblings_window", before: 2, after: 2 },
    { targetId: paragraphIds[1], scope: "document_top", maxBlocks: 20 },
  ]) {
    await runSafe(`doc_edit.read_blocks.${raw.scope}`, readDocBlocksInputSchema, executeReadDocBlocks, deps, raw);
  }

  await runWrite("doc_edit.update_block", updateBlockInputSchema, executeUpdateBlock, deps, {
    blockId: paragraphIds[1],
    markdown: `已更新段落-${suffix}`,
  });
  const inserted = await runWrite("doc_edit.insert_block", insertBlockInputSchema, executeInsertBlock, deps, {
    referenceBlockId: paragraphIds[1],
    position: "after",
    markdown: `插入段落-${suffix}`,
  });
  let insertedBlockId = String(inserted.target?.insertedBlockId || "");
  if (insertedBlockId) {
    const insertedRows = await waitForRows(
      `SELECT id FROM blocks WHERE id = '${insertedBlockId}'`,
      (items) => items.some((item) => item.id === insertedBlockId),
    );
    if (!insertedRows.some((item) => item.id === insertedBlockId)) insertedBlockId = "";
  }
  if (!insertedBlockId) {
    rows = await waitForRows(
      `SELECT id, type, content FROM blocks WHERE root_id = '${docId}' ORDER BY sort ASC`,
      (items) => items.some((item) => item.content === `插入段落-${suffix}`),
    );
    insertedBlockId = String(rows.find((row) => row.content === `插入段落-${suffix}`)?.id || "");
  }
  assert.match(insertedBlockId, /^\d{14}-[a-z0-9]{7}$/);
  await runWrite("doc_edit.move_block", moveBlockInputSchema, executeMoveBlock, deps, {
    blockId: insertedBlockId,
    previousID: paragraphIds[2],
  });
  await runWrite("doc_edit.delete_blocks", deleteBlocksInputSchema, executeDeleteBlocks, deps, { blockIds: [insertedBlockId] });

  const longMarkdown = `${uniqueKeyword} 替换后\n\n${"长文本验收。".repeat(900)}`;
  await runWrite("doc_edit.replace_doc_content", replaceDocContentInputSchema, executeReplaceDocContent, deps, { docId, markdown: longMarkdown });
  const chunked = await runSafe("kb.read_docs_chunked", readDocsInputSchema, executeReadDocs, deps, { docIds: [docId], chunkChars: 2000 });
  const cursor = chunked.items[0]?.nextCursor;
  if (cursor) {
    await runSafe("kb.read_docs_cursor", readDocsInputSchema, executeReadDocs, deps, { cursor });
  }
  await runWrite("doc_edit.rename_doc", renameDocInputSchema, executeRenameDoc, deps, { docId, title: `主文档已验收-${suffix}` });
  await runWrite("doc_edit.delete_doc", deleteDocInputSchema, executeDeleteDoc, deps, { docId: sacrificeDocId });

  assert.match(childDocId, /^\d{14}-[a-z0-9]{7}$/);
} finally {
  disposeConfirmation();
  await removeNotebookChecked(notebookId);
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
