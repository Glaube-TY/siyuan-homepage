import assert from "node:assert/strict";

import { createDocWithMd, createNotebookChecked, removeNotebookChecked, sql } from "../../src/api";
import { siyuanBlockRefInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-block-ref.contract";
import { executeSiyuanBlockRef } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-block-ref.impl";

interface ResultRow { action: string; ok: boolean; detail?: string }
const results: ResultRow[] = [];

async function run(name: string, raw: unknown) {
  try {
    const args = siyuanBlockRefInputSchema.parse(raw);
    const output = (await executeSiyuanBlockRef(args)).output;
    assert.equal(output.action, args.action);
    results.push({ action: name, ok: true });
    return output;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

async function rowsForRoot(rootId: string): Promise<any[]> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const rows = await sql(`SELECT id, type, content, markdown FROM blocks WHERE root_id = '${rootId}' ORDER BY sort ASC`);
    if (Array.isArray(rows) && rows.length > 1) return rows;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return [];
}

const suffix = Date.now().toString(36);
const createdNotebook = await createNotebookChecked(`Notebrain-BlockRef-Acceptance-${Date.now()}`);
const notebookId = String((createdNotebook as any)?.notebook?.id || "");
assert.match(notebookId, /^\d{14}-[a-z0-9]{7}$/);

try {
  const sourceDocId = await createDocWithMd(
    notebookId,
    "/块引用验收/定义文档",
    `定义块甲-${suffix}\n\n定义块乙-${suffix}`,
  );
  const sourceRows = await rowsForRoot(sourceDocId);
  const sourceA = String(sourceRows.find((row) => row.content === `定义块甲-${suffix}`)?.id || "");
  const sourceB = String(sourceRows.find((row) => row.content === `定义块乙-${suffix}`)?.id || "");
  assert.match(sourceA, /^\d{14}-[a-z0-9]{7}$/);
  assert.match(sourceB, /^\d{14}-[a-z0-9]{7}$/);

  const refDocId = await createDocWithMd(
    notebookId,
    "/块引用验收/引用文档",
    `引用内容 ((${sourceA} \"验收引用-${suffix}\"))`,
  );
  const refRows = await rowsForRoot(refDocId);
  const refBlockId = String(refRows.find((row) => row.type === "p")?.id || "");
  assert.match(refBlockId, /^\d{14}-[a-z0-9]{7}$/);

  const idsOutput = await run("block_ref.get_ref_ids", { action: "get_ref_ids", id: refDocId });
  assert.ok(idsOutput.data && typeof idsOutput.data === "object");
  await run("block_ref.get_ref_text", { action: "get_ref_text", id: sourceA });
  await run("block_ref.get_def_ids_by_ref_text", { action: "get_def_ids_by_ref_text", anchor: `定义块甲-${suffix}` });
  await run("block_ref.check_ref", { action: "check_ref", ids: [sourceA, sourceB, refBlockId] });

  await run("block_ref.swap_ref", {
    action: "swap_ref",
    refID: refBlockId,
    defID: sourceB,
    includeChildren: false,
  });
  await run("block_ref.transfer_ref", {
    action: "transfer_ref",
    fromID: sourceB,
    toID: sourceA,
    refIDs: [refBlockId],
  });
} finally {
  await removeNotebookChecked(notebookId);
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
