import assert from "node:assert/strict";

import { siyuanNotebookManageInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-notebook-manage.contract";
import { executeSiyuanNotebookManage } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-notebook-manage.impl";

async function execute(raw: unknown) {
  const args = siyuanNotebookManageInputSchema.parse(raw);
  return (await executeSiyuanNotebookManage(args)).output;
}

const listed = await execute({ action: "list" });
assert.ok(Array.isArray((listed.data as any)?.notebooks));

const testName = `Notebrain-Agent-Acceptance-${Date.now()}`;
const created = await execute({ action: "create", name: testName });
const notebook = String((created.data as any)?.notebook?.id || "");
assert.match(notebook, /^\d{14}-[a-z0-9]{7}$/);

try {
  await execute({ action: "rename", notebook, name: `${testName}-Renamed` });
  const conf = await execute({ action: "get_conf", notebook });
  assert.ok(conf.data && typeof conf.data === "object");
  await execute({ action: "set_conf", notebook, conf: conf.data });
  await execute({ action: "set_icon", notebook, icon: "🧪" });
  await execute({ action: "close", notebook });
  await execute({ action: "open", notebook });
} finally {
  await execute({ action: "remove", notebook });
}

process.stdout.write(JSON.stringify({ ok: true, notebookActions: 9, removed: notebook }));
