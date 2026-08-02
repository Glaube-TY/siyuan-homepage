import assert from "node:assert/strict";

import {
  createDocWithMd,
  createNotebookChecked,
  getPathByID,
  listDocsByPathChecked,
  removeNotebookChecked,
  sql,
} from "../../src/api";
import { siyuanDocTransformInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-doc-transform.contract";
import { siyuanDocTreeInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-doc-tree.contract";
import { executeSiyuanDocTransform } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-doc-transform.impl";
import { executeSiyuanDocTree } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-doc-tree.impl";

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

function pathString(value: unknown): string {
  return String((value as any)?.path ?? value ?? "");
}

const createdNotebook = await createNotebookChecked(`Notebrain-Write-Acceptance-${Date.now()}`);
const notebookId = String((createdNotebook as any)?.notebook?.id || "");
assert.match(notebookId, /^\d{14}-[a-z0-9]{7}$/);

try {
  const parentAId = await createDocWithMd(notebookId, "/树操作/父文档甲", "父文档甲");
  const parentBId = await createDocWithMd(notebookId, "/树操作/父文档乙", "父文档乙");
  const movePathId = await createDocWithMd(notebookId, "/树操作/路径移动源", "路径移动源");
  const moveIdId = await createDocWithMd(notebookId, "/树操作/ID移动源", "ID移动源");
  const sortAId = await createDocWithMd(notebookId, "/排序甲", "排序甲");
  const sortBId = await createDocWithMd(notebookId, "/排序乙", "排序乙");
  const duplicateId = await createDocWithMd(notebookId, "/复制源", "复制源内容");

  const parentAPath = pathString(await getPathByID(parentAId));
  const movePathBefore = pathString(await getPathByID(movePathId));
  const moveIdBefore = pathString(await getPathByID(moveIdId));
  const sortAPath = pathString(await getPathByID(sortAId));
  const sortBPath = pathString(await getPathByID(sortBId));

  await run("doc_tree.sort", siyuanDocTreeInputSchema, executeSiyuanDocTree, {
    action: "sort",
    notebook: notebookId,
    fromPaths: [sortBPath, sortAPath],
  });

  const beforeDuplicate = await listDocsByPathChecked(notebookId, "/");
  const beforeDuplicateCount = Array.isArray((beforeDuplicate as any)?.files) ? (beforeDuplicate as any).files.length : 0;
  await run("doc_tree.duplicate", siyuanDocTreeInputSchema, executeSiyuanDocTree, {
    action: "duplicate",
    id: duplicateId,
  });
  const afterDuplicate = await listDocsByPathChecked(notebookId, "/");
  const afterDuplicateCount = Array.isArray((afterDuplicate as any)?.files) ? (afterDuplicate as any).files.length : 0;
  assert.equal(afterDuplicateCount, beforeDuplicateCount + 1);

  await run("doc_tree.move", siyuanDocTreeInputSchema, executeSiyuanDocTree, {
    action: "move",
    fromPaths: [movePathBefore],
    toNotebook: notebookId,
    toPath: parentAPath,
  });
  const movePathAfter = pathString(await getPathByID(movePathId));
  assert.notEqual(movePathAfter, movePathBefore);
  assert.ok(movePathAfter.includes(parentAId), movePathAfter);

  await run("doc_tree.move_by_id", siyuanDocTreeInputSchema, executeSiyuanDocTree, {
    action: "move_by_id",
    ids: [moveIdId],
    targetID: parentBId,
  });
  const moveIdAfter = pathString(await getPathByID(moveIdId));
  assert.notEqual(moveIdAfter, moveIdBefore);
  assert.ok(moveIdAfter.includes(parentBId), moveIdAfter);

  const transformTargetDocId = await createDocWithMd(notebookId, "/转换/文档转标题目标", "目标段落");
  const sourceDocId = await createDocWithMd(notebookId, "/转换/文档转标题源", "源文档正文");
  const targetRows = await waitForRows(
    `SELECT id, type FROM blocks WHERE root_id = '${transformTargetDocId}' ORDER BY sort ASC`,
    (rows) => rows.some((row) => row.type === "p"),
  );
  const targetBlockId = String(targetRows.find((row) => row.type === "p")?.id || "");
  assert.match(targetBlockId, /^\d{14}-[a-z0-9]{7}$/);

  await run("doc_transform.doc_to_heading", siyuanDocTransformInputSchema, executeSiyuanDocTransform, {
    action: "doc_to_heading",
    sourceDocId,
    targetBlockId,
    after: true,
  });
  const convertedDocRows = await waitForRows(
    `SELECT id, root_id, type FROM blocks WHERE id = '${sourceDocId}'`,
    (rows) => rows.some((row) => row.id === sourceDocId && row.type === "h"),
  );
  assert.equal(convertedDocRows[0]?.root_id, transformTargetDocId);

  const headingContainerId = await createDocWithMd(notebookId, "/转换/标题转文档容器", "# 独立标题验收\n\n标题下正文");
  const headingRows = await waitForRows(
    `SELECT id, type, content FROM blocks WHERE root_id = '${headingContainerId}' ORDER BY sort ASC`,
    (rows) => rows.some((row) => row.type === "h" && row.content === "独立标题验收"),
  );
  const sourceHeadingId = String(headingRows.find((row) => row.type === "h" && row.content === "独立标题验收")?.id || "");
  assert.match(sourceHeadingId, /^\d{14}-[a-z0-9]{7}$/);
  await run("doc_transform.heading_to_doc", siyuanDocTransformInputSchema, executeSiyuanDocTransform, {
    action: "heading_to_doc",
    sourceHeadingId,
    targetNotebookId: notebookId,
    targetPath: "/",
    toTop: true,
  });
  const headingDocRows = await waitForRows(
    `SELECT id, type, content, box FROM blocks WHERE id = '${sourceHeadingId}'`,
    (rows) => rows.some((row) => row.id === sourceHeadingId && row.type === "d"),
  );
  assert.equal(headingDocRows[0]?.box, notebookId);

  const listContainerId = await createDocWithMd(notebookId, "/转换/列表项转文档容器", "* 独立列表项验收\n  * 子项正文");
  const listRows = await waitForRows(
    `SELECT id, type, content FROM blocks WHERE root_id = '${listContainerId}' ORDER BY sort ASC`,
    (rows) => rows.some((row) => row.type === "i"),
  );
  const sourceListItemId = String(listRows.find((row) => row.type === "i")?.id || "");
  assert.match(sourceListItemId, /^\d{14}-[a-z0-9]{7}$/);
  await run("doc_transform.list_item_to_doc", siyuanDocTransformInputSchema, executeSiyuanDocTransform, {
    action: "list_item_to_doc",
    sourceListItemId,
    targetNotebookId: notebookId,
    targetPath: "/",
    toTop: true,
  });
  const listDocRows = await waitForRows(
    `SELECT id, type, box FROM blocks WHERE id = '${sourceListItemId}'`,
    (rows) => rows.some((row) => row.id === sourceListItemId && row.type === "d"),
  );
  assert.equal(listDocRows[0]?.box, notebookId);
} finally {
  await removeNotebookChecked(notebookId);
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
