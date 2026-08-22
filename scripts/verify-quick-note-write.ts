/**
 * 快速笔记写后确认验收：经真实 ToolContract.execute 验证
 * "SQL 未同步、内核确认存在"不再产生 quick_note_write_unverified 假失败，
 * 且真正缺失/未知/无块 ID 时失败关闭，写入每条路径恰好一次。
 */
import assert from "node:assert/strict";
import { createHomepageQuickNoteActionTools, type QuickNoteActionToolDeps } from "../src/features/kb/services/agent-workbench/tools/homepage-components/homepage-quick-note.tool";
import type { DocEditBlockResolution } from "../src/features/kb/services/doc-content-edit/doc-content-edit-block-resolver";
import type { QuickNoteWriteResult } from "../src/features/quick-note/quick-note-write-service";

const ctx = { question: "", callCounts: {} } as never;
const BLOCK_ID = "20260822073453-jmm8qhb";

function buildDeps(
  writeImpl: () => Promise<QuickNoteWriteResult>,
  resolveImpl?: () => Promise<DocEditBlockResolution>,
): { deps: QuickNoteActionToolDeps; writeCalls: () => number } {
  let writeCalls = 0;
  const deps: QuickNoteActionToolDeps = {
    status: async () => ({ configured: true, addPosition: "bottom", timestampEnabled: true }),
    write: async () => { writeCalls += 1; return writeImpl(); },
    resolveBlock: resolveImpl ?? (async () => { throw new Error("resolveBlock 不应被调用"); }),
  };
  return { deps, writeCalls: () => writeCalls };
}

function writeTool(deps: QuickNoteActionToolDeps) {
  return createHomepageQuickNoteActionTools(deps).find((entry) => entry.action === "write")!.tool;
}

// 1. SQL miss 后内核确认存在：工具成功，写入恰好一次（真实故障形态）
{
  const { deps, writeCalls } = buildDeps(
    async () => ({ ok: true, changed: true, blockId: BLOCK_ID, message: "已记录到快速笔记。" }),
    async () => ({ status: "exists", block: { id: BLOCK_ID, source: "kernel" } }),
  );
  const result = await writeTool(deps).execute(ctx, { content: "验证快速记录" });
  assert.equal(result.ok, true, "内核确认存在时必须成功");
  assert.equal((result.data as { blockId?: string }).blockId, BLOCK_ID);
  assert.equal(writeCalls(), 1, "写入必须恰好一次");
}

// 2. resolver 返回 missing：结构化不可恢复失败，绝不重写
{
  const { deps, writeCalls } = buildDeps(
    async () => ({ ok: true, changed: true, blockId: BLOCK_ID, message: "已记录到快速笔记。" }),
    async () => ({ status: "missing" }),
  );
  const result = await writeTool(deps).execute(ctx, { content: "验证快速记录" });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "quick_note_write_unverified");
  assert.equal(result.error?.recoverable, false);
  assert.deepEqual(result.error?.details, { blockId: BLOCK_ID });
  assert.equal(writeCalls(), 1);
}

// 3. resolver 返回 unknown：同样不确定失败，绝不重写
{
  const { deps, writeCalls } = buildDeps(
    async () => ({ ok: true, changed: true, blockId: BLOCK_ID, message: "已记录到快速笔记。" }),
    async () => ({ status: "unknown" }),
  );
  const result = await writeTool(deps).execute(ctx, { content: "验证快速记录" });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "quick_note_write_unverified");
  assert.equal(result.error?.recoverable, false);
  assert.equal(writeCalls(), 1);
}

// 4. 写入成功但未返回块 ID：不得未经验证返回成功
{
  const { deps, writeCalls } = buildDeps(async () => ({ ok: true, changed: true, message: "已记录到快速笔记。" }));
  const result = await writeTool(deps).execute(ctx, { content: "验证快速记录" });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "quick_note_write_unverified");
  assert.equal(result.error?.recoverable, false);
  assert.equal(result.error?.details, undefined);
  assert.equal(writeCalls(), 1);
}

// 5. 写服务失败：透传既有错误码
{
  const { deps, writeCalls } = buildDeps(async () => ({ ok: false, changed: false, message: "写入失败：快速笔记目标文档未配置。", errorCode: "quick_note_target_missing" }));
  const result = await writeTool(deps).execute(ctx, { content: "验证快速记录" });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "quick_note_target_missing");
  assert.equal(result.error?.recoverable, true);
  assert.equal(writeCalls(), 1);
}

// 6. 注入依赖下 status action 正常工作
{
  const { deps } = buildDeps(async () => ({ ok: true, changed: true, blockId: BLOCK_ID, message: "x" }));
  const status = createHomepageQuickNoteActionTools(deps).find((entry) => entry.action === "status")!.tool;
  const result = await status.execute(ctx, {});
  assert.equal(result.ok, true);
  assert.equal((result.data as { configured?: boolean }).configured, true);
}

console.log("快速笔记写后确认验收通过。");
