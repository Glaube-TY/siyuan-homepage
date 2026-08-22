/**
 * 数据库行合并与新增回读验收：部分 Render 不遮蔽 fallback、add_rows 写后验证、零重放保证。
 * 合成 fixture，不读取或修改用户测试空间。
 */
import assert from "node:assert/strict";
import {
  collectAttributeViewRowIds,
  hasEffectiveViewConstraints,
  normalizeAttributeViewRead,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/internal/attribute-view/attribute-view-normalizer";
import { setSiyuanRuntimePort } from "../src/runtime/siyuan-runtime-port";
import { executeAddAttributeViewRows } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/add-attribute-view-rows.impl";
import { createAddAttributeViewRowsTool } from "../src/features/kb/services/agent-workbench/tools/siyuan/add-attribute-view-rows.tool";

// ── 合成 fixture 工具 ──

const DB_ID = "20260801-test-av";
const VIEW_ID = "view-1";
const KEYS = [
  { keyId: "key-title", name: "书名", type: "block" },
  { keyId: "key-author", name: "作者", type: "text" },
  { keyId: "key-rating", name: "评分", type: "number" },
] as const;

function makeRowId(index: number): string {
  return `row-${String(index + 1).padStart(2, "0")}`;
}

/** 构造原始 AV：rowCount 行，主字段（block 类型）使用真实的 { block: { content } }，仅对 blockValuesOnlyFor 中的行有值。 */
function buildAv(rowCount: number, opts?: { blockValuesOnlyFor?: Set<string> }): any {
  const blockOnly = opts?.blockValuesOnlyFor;
  const keyValues = KEYS.map((k) => ({
    key: { id: k.keyId, name: k.name, type: k.type },
    values: Array.from({ length: rowCount }, (_, i) => {
      const rowId = makeRowId(i);
      if (k.type === "block" && (!blockOnly || !blockOnly.has(rowId))) return null;
      if (k.type === "block") {
        return {
          itemID: rowId,
          block: { content: `${k.name}-${i + 1}` },
        };
      }
      return {
        itemID: rowId,
        [k.type === "number" ? "number" : "text"]: { content: `${k.name}-${i + 1}` },
      };
    }).filter(Boolean),
  }));
  return {
    id: DB_ID,
    name: "测试数据库",
    keyValues,
    views: [{ id: VIEW_ID, itemIds: Array.from({ length: rowCount }, (_, i) => makeRowId(i)) }],
  };
}

function buildRenderRow(rowId: string, title: string): Record<string, unknown> {
  return {
    id: rowId,
    cells: [{
      value: {
        keyID: "key-title",
        type: "block",
        block: { content: title },
      },
    }],
  };
}

// ── 场景 1–3：normalizeAttributeViewRead 合并逻辑与真实约束（纯函数测试）──
{
  // 原始 AV：8 行，主字段仅有 row-08 的值（真实的 block: { content } 结构）
  const av8 = buildAv(8, { blockValuesOnlyFor: new Set(["row-08"]) });
  const baseParams = {
    databaseId: DB_ID,
    av: av8,
    viewId: VIEW_ID as string | null,
    includeRows: true,
    rowLimit: 100,
    includeRaw: false,
  };

  // 场景 1：部分 Render（仅 row-08）→ 输出 8 行，Render 行字段优先，其余保留
  const partialRender = { view: { id: VIEW_ID, rows: [buildRenderRow("row-08", "新书名")] } };
  const partial = normalizeAttributeViewRead({ ...baseParams, renderResult: partialRender });
  assert.equal(partial.rows?.length, 8, `部分 Render 应输出 8 行，实际 ${partial.rows?.length}`);
  assert.equal(partial.rowCount, 8);
  assert.equal(partial.truncated, false);
  const r08 = partial.rows!.find((r) => r.rowId === "row-08");
  assert.ok(r08, "row-08 必须存在");
  assert.equal(r08.cells["key-title"]?.text, "新书名", "Render 行字段优先");
  for (let i = 0; i < 7; i++) {
    const rid = makeRowId(i);
    const r = partial.rows!.find((item) => item.rowId === rid);
    assert.ok(r, `${rid} 必须存在`);
    assert.equal(r.cells["key-author"]?.text, `作者-${i + 1}`, `${rid} 作者字段必须从 fallback 保留`);
    assert.equal(r.cells["key-rating"]?.text, `评分-${i + 1}`, `${rid} 评分字段必须从 fallback 保留`);
  }
  const ids1 = partial.rows!.map((r) => r.rowId);
  assert.equal(new Set(ids1).size, 8, "不得出现重复 rowId");
  assert.ok(partial.warnings?.some((w) => w.includes("部分渲染")), "必须有部分渲染 warning");

  // 场景 2：完整 Render → 无重复、不改变优先级与顺序
  const fullRender = {
    view: {
      id: VIEW_ID,
      rows: Array.from({ length: 8 }, (_, i) => buildRenderRow(makeRowId(i), `标题-${i + 1}`)),
    },
  };
  const full = normalizeAttributeViewRead({ ...baseParams, renderResult: fullRender });
  assert.equal(full.rows?.length, 8);
  assert.equal(full.rows!.every((r) => r.cells["key-title"]?.text), true);
  const ids2 = full.rows!.map((r) => r.rowId);
  assert.deepEqual(ids2, Array.from({ length: 8 }, (_, i) => makeRowId(i)), "完整 Render 行序必须遵守视图 itemIds");
  assert.equal(full.warnings?.some((w) => w.includes("部分渲染")), false, "完整 Render 不应产生部分渲染 warning");

  // 场景 3：无 Render → 纯 fallback
  const noRender = normalizeAttributeViewRead({ ...baseParams, renderResult: undefined });
  assert.equal(noRender.rows?.length, 8, "无 Render 时必须走 fallback");
  assert.ok(
    noRender.rows!.some((r) => r.cells["key-author"]?.text === "作者-1"),
    "fallback 必须包含作者-1",
  );

  // ── 场景 3b–3f：思源顶层真实约束结构（顶层 filters/sorts 数组、group）──
  const avWithConstraints = (constraints: Record<string, unknown>): any => ({
    ...av8,
    views: [{ id: VIEW_ID, itemIds: Array.from({ length: 8 }, (_, i) => makeRowId(i)), ...constraints }],
  });

  // 3b: 顶层数组 filters: [{ column, operator, value }] 命中 1 行 → Render 是权威，不补回其余 7 行
  const topArrayFilteredAv = avWithConstraints({
    filters: [{ column: "key-title", operator: "contains", value: "新书名" }],
  });
  assert.equal(hasEffectiveViewConstraints(topArrayFilteredAv.views[0]), true, "顶层数组 filters 必须判定为有效约束");
  const filteredTop = normalizeAttributeViewRead({
    databaseId: DB_ID, av: topArrayFilteredAv, renderResult: partialRender,
    viewId: VIEW_ID as string | null, includeRows: true, rowLimit: 100, includeRaw: false,
  });
  assert.equal(filteredTop.rows?.length, 1, "顶层 filters 命中 1 行时只输出该行");
  assert.equal(filteredTop.rows![0].rowId, "row-08");
  assert.ok(filteredTop.warnings?.some((w) => w.includes("约束") || w.includes("权威")), "必须有约束 warning");

  // 3c: 顶层数组 filters 命中 0 行（空渲染）→ 返回 0 行，绝不补回 raw 8 行
  const emptyFilteredTop = normalizeAttributeViewRead({
    databaseId: DB_ID, av: topArrayFilteredAv,
    renderResult: { view: { id: VIEW_ID, rows: [] } },
    viewId: VIEW_ID as string | null, includeRows: true, rowLimit: 100, includeRaw: false,
  });
  assert.equal(emptyFilteredTop.rows?.length, 0, "有效筛选命中 0 行时必须严格返回 0 行");

  // 3d: 顶层数组 sorts: [{ column, direction }] → 严格遵守 Render 成员和顺序
  const topArraySortedAv = avWithConstraints({
    sorts: [{ column: "key-rating", direction: "desc" }],
  });
  assert.equal(hasEffectiveViewConstraints(topArraySortedAv.views[0]), true, "顶层数组 sorts 必须判定为有效约束");
  const sortedRender = {
    view: {
      id: VIEW_ID,
      rows: [buildRenderRow(makeRowId(7), "排第一"), buildRenderRow(makeRowId(0), "排第二")],
    },
  };
  const sorted = normalizeAttributeViewRead({
    databaseId: DB_ID, av: topArraySortedAv, renderResult: sortedRender,
    viewId: VIEW_ID as string | null, includeRows: true, rowLimit: 100, includeRaw: false,
  });
  assert.deepEqual(sorted.rows!.map((r) => r.rowId), [makeRowId(7), makeRowId(0)], "排序约束必须严格保持 Render 成员与顺序");

  // 3e: 嵌套 filters/sorts 兼容
  const nestedAv = avWithConstraints({
    filters: { filters: [{ column: "key-title", operator: "is-not-empty" }] },
    sorts: { sorts: [{ column: "key-rating", direction: "asc" }] },
  });
  assert.equal(hasEffectiveViewConstraints(nestedAv.views[0]), true, "嵌套 filters/sorts 兼容对象必须判定为有效约束");

  // 3f: group 约束（非空即为权威，空对象不得误判）
  const groupedAv = avWithConstraints({ group: { column: "key-rating" } });
  assert.equal(hasEffectiveViewConstraints(groupedAv.views[0]), true, "非空 group 必须判定为有效约束");
  const emptyGroupAv = avWithConstraints({ group: {} });
  assert.equal(hasEffectiveViewConstraints(emptyGroupAv.views[0]), false, "空 group 对象不得误判为约束");
}

// ── 场景 4：collectAttributeViewRowIds 与孤立 blockID 隔离验证 ──
{
  const testAv = {
    id: DB_ID,
    name: "测试快照隔离",
    views: [{ id: VIEW_ID, itemIds: ["row-01", "row-02"] }],
    keyValues: [
      {
        key: { id: "key-title", name: "书名", type: "block" },
        values: [
          { itemID: "row-01", block: { content: "第一行" } },
          { itemID: "row-02", block: { content: "第二行" } },
          // 伪造孤立的 blockID（未出现在 view.itemIds 中）
          { blockID: "unbound-block-99", text: { content: "孤立值" } },
        ],
      },
    ],
  };
  const ids = collectAttributeViewRowIds(testAv as any);
  assert.equal(ids.has("row-01"), true);
  assert.equal(ids.has("row-02"), true);
  assert.equal(ids.has("unbound-block-99"), false, "未在 view itemIds 快照中的 blockID 不得进入真实 rowId 集合");

  const readResult = normalizeAttributeViewRead({
    databaseId: DB_ID,
    av: testAv as any,
    includeRows: true,
    rowLimit: 100,
    includeRaw: false,
  });
  assert.equal(readResult.rows?.some((r) => r.rowId === "unbound-block-99"), false, "孤立 blockID 不得作为可写行输出");
}

// ── 场景 5：add_rows 写后全链路安全与零重放保证（Mock Runtime Port）──
{
  const INITIAL_IDS = ["row-01", "row-02", "row-03"];
  const NEW_ROW_ID = "row-04-new";

  // 场景 5a: addAttributeViewBlocks 在改变服务端状态后抛错 → 仅调 1 次，零 fallback，最终 verification_failed
  {
    let addBlocksCalls = 0;
    const serverRowIds = [...INITIAL_IDS];

    setSiyuanRuntimePort({
      async post(path: string) {
        if (path === "/api/av/getAttributeView") {
          return {
            code: 0,
            data: {
              av: {
                id: DB_ID,
                name: "测试",
                keyValues: KEYS.map((k) => ({
                  key: { id: k.keyId, name: k.name, type: k.type },
                  values: serverRowIds.map((rid) => ({ itemID: rid })),
                })),
                views: [{ id: VIEW_ID, itemIds: [...serverRowIds] }],
              },
            },
          };
        }
        if (path === "/api/av/getAttributeViewKeysByAvID") return { code: 0, data: {} };
        if (path === "/api/av/renderAttributeView") {
          return { code: 0, data: { view: { id: VIEW_ID, rows: serverRowIds.map((id) => ({ id, cells: [] })) } } };
        }
        if (path === "/api/av/addAttributeViewBlocks") {
          addBlocksCalls += 1;
          serverRowIds.push("block-row-1");
          throw new Error("NETWORK_INTERRUPT_AFTER_ADD");
        }
        if (path === "/api/av/appendAttributeViewDetachedBlocksWithValues") {
          assert.fail("不得尝试 appendAttributeViewDetachedBlocksWithValues 作为 fallback");
        }
        return { code: 0, data: null };
      },
      async getFile() { return undefined; },
    });

    const result = await executeAddAttributeViewRows(
      {} as never,
      { databaseId: DB_ID, blockIds: ["block-1"] },
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "attribute_view_rows_add_verification_failed", "已有块写入异常必须返回 verification_failed");
    assert.equal(addBlocksCalls, 1, "addAttributeViewBlocks 只能调用一次，零重放零 fallback");
  }

  // 场景 5b: blockIds 成功后，默认值写入在改变状态后抛错 → 原 add 调 1 次，set 调至失败步骤，零重放，最终 verification_failed
  {
    let addBlocksCalls = 0;
    let setAttrCalls = 0;
    const serverRowIds = [...INITIAL_IDS];

    setSiyuanRuntimePort({
      async post(path: string) {
        if (path === "/api/av/getAttributeView") {
          return {
            code: 0,
            data: {
              av: {
                id: DB_ID,
                name: "测试",
                keyValues: KEYS.map((k) => ({
                  key: { id: k.keyId, name: k.name, type: k.type },
                  values: serverRowIds.map((rid) => ({ itemID: rid })),
                })),
                views: [{ id: VIEW_ID, itemIds: [...serverRowIds] }],
              },
            },
          };
        }
        if (path === "/api/av/getAttributeViewKeysByAvID") return { code: 0, data: {} };
        if (path === "/api/av/renderAttributeView") {
          return { code: 0, data: { view: { id: VIEW_ID, rows: serverRowIds.map((id) => ({ id, cells: [] })) } } };
        }
        if (path === "/api/av/addAttributeViewBlocks") {
          addBlocksCalls += 1;
          serverRowIds.push("block-row-1");
          return { code: 0, data: null };
        }
        if (path === "/api/av/getAttributeViewItemIDsByBoundIDs") {
          return { code: 0, data: { "block-1": "block-row-1" } };
        }
        if (path === "/api/av/setAttributeViewBlockAttr") {
          setAttrCalls += 1;
          throw new Error("SET_ATTR_TIMEOUT");
        }
        return { code: 0, data: null };
      },
      async getFile() { return undefined; },
    });

    const result = await executeAddAttributeViewRows(
      {} as never,
      { databaseId: DB_ID, blockIds: ["block-1"], defaultValues: { 作者: "默认作者" } },
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "attribute_view_rows_add_verification_failed", "默认值写入失败不得被吞成 warning，必须返回 verification_failed");
    assert.equal(addBlocksCalls, 1, "addBlocks 只调用 1 次");
    assert.equal(setAttrCalls, 1, "setAttr 尝试 1 次后抛错，不重放");
  }

  // 场景 5c: blockIds 成功后，后续 detached append 改变状态后抛错 → 总调用数等于两步，零重放，最终 verification_failed
  {
    let addBlocksCalls = 0;
    let appendCalls = 0;
    const serverRowIds = [...INITIAL_IDS];

    setSiyuanRuntimePort({
      async post(path: string) {
        if (path === "/api/av/getAttributeView") {
          return {
            code: 0,
            data: {
              av: {
                id: DB_ID,
                name: "测试",
                keyValues: KEYS.map((k) => ({
                  key: { id: k.keyId, name: k.name, type: k.type },
                  values: serverRowIds.map((rid) => ({ itemID: rid })),
                })),
                views: [{ id: VIEW_ID, itemIds: [...serverRowIds] }],
              },
            },
          };
        }
        if (path === "/api/av/getAttributeViewKeysByAvID") return { code: 0, data: {} };
        if (path === "/api/av/renderAttributeView") {
          return { code: 0, data: { view: { id: VIEW_ID, rows: serverRowIds.map((id) => ({ id, cells: [] })) } } };
        }
        if (path === "/api/av/addAttributeViewBlocks") {
          addBlocksCalls += 1;
          serverRowIds.push("block-row-1");
          return { code: 0, data: null };
        }
        if (path === "/api/av/appendAttributeViewDetachedBlocksWithValues") {
          appendCalls += 1;
          serverRowIds.push("detached-row-1");
          throw new Error("APPEND_FAILED_AFTER_STATE_CHANGE");
        }
        return { code: 0, data: null };
      },
      async getFile() { return undefined; },
    });

    const result = await executeAddAttributeViewRows(
      {} as never,
      {
        databaseId: DB_ID,
        blockIds: ["block-1"],
        detachedRows: [{ title: "脱离行", values: { 作者: "作者" } }],
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "attribute_view_rows_add_verification_failed");
    assert.equal(addBlocksCalls, 1, "前一步 addBlocks 只能调用 1 次，不重放");
    assert.equal(appendCalls, 1, "后一步 append 只能调用 1 次，不重放");
  }

  // 场景 5d: detachedRows 首个写请求改变状态后抛错 → 仅调 1 次，零重放，最终 verification_failed
  {
    let appendCalls = 0;
    const serverRowIds = [...INITIAL_IDS];

    setSiyuanRuntimePort({
      async post(path: string) {
        if (path === "/api/av/getAttributeView") {
          return {
            code: 0,
            data: {
              av: {
                id: DB_ID,
                name: "测试",
                keyValues: KEYS.map((k) => ({
                  key: { id: k.keyId, name: k.name, type: k.type },
                  values: serverRowIds.map((rid) => ({ itemID: rid })),
                })),
                views: [{ id: VIEW_ID, itemIds: [...serverRowIds] }],
              },
            },
          };
        }
        if (path === "/api/av/getAttributeViewKeysByAvID") return { code: 0, data: {} };
        if (path === "/api/av/renderAttributeView") {
          return { code: 0, data: { view: { id: VIEW_ID, rows: serverRowIds.map((id) => ({ id, cells: [] })) } } };
        }
        if (path === "/api/av/appendAttributeViewDetachedBlocksWithValues") {
          appendCalls += 1;
          serverRowIds.push(NEW_ROW_ID);
          throw new Error("ETIMEDOUT");
        }
        return { code: 0, data: null };
      },
      async getFile() { return undefined; },
    });

    const result = await executeAddAttributeViewRows(
      {} as never,
      { databaseId: DB_ID, detachedRows: [{ title: "超时条目", values: { 作者: "作者" } }] },
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "attribute_view_rows_add_verification_failed");
    assert.equal(appendCalls, 1);
  }

  // 场景 5e: 写后回读旧 ID 消失或新增数量不符 → 结构化失败且零重放
  {
    let writeCalls = 0;
    let currentRowIds = [...INITIAL_IDS];
    setSiyuanRuntimePort({
      async post(path: string) {
        if (path === "/api/av/getAttributeView") {
          return {
            code: 0,
            data: {
              av: {
                id: DB_ID,
                name: "测试",
                keyValues: KEYS.map((k) => ({
                  key: { id: k.keyId, name: k.name, type: k.type },
                  values: currentRowIds.map((rid) => ({ itemID: rid })),
                })),
                views: [{ id: VIEW_ID, itemIds: [...currentRowIds] }],
              },
            },
          };
        }
        if (path === "/api/av/getAttributeViewKeysByAvID") return { code: 0, data: {} };
        if (path === "/api/av/renderAttributeView") {
          return { code: 0, data: { view: { id: VIEW_ID, rows: currentRowIds.map((id) => ({ id, cells: [] })) } } };
        }
        if (path === "/api/av/appendAttributeViewDetachedBlocksWithValues") {
          writeCalls += 1;
          // 模拟旧条目消失
          currentRowIds.shift();
          currentRowIds.push(NEW_ROW_ID);
          return { code: 0, data: null };
        }
        return { code: 0, data: null };
      },
      async getFile() { return undefined; },
    });

    const result = await executeAddAttributeViewRows(
      {} as never,
      { databaseId: DB_ID, detachedRows: [{ title: "丢失旧项", values: { 作者: "作者" } }] },
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "attribute_view_rows_add_verification_failed");
    assert.equal(writeCalls, 1);
  }

  // 场景 5f: 正常成功流程与真实新 rowId 提取
  {
    let writeCalls = 0;
    const serverRowIds = [...INITIAL_IDS];
    setSiyuanRuntimePort({
      async post(path: string) {
        if (path === "/api/av/getAttributeView") {
          return {
            code: 0,
            data: {
              av: {
                id: DB_ID,
                name: "测试",
                keyValues: KEYS.map((k) => ({
                  key: { id: k.keyId, name: k.name, type: k.type },
                  values: serverRowIds.map((rid) => ({ itemID: rid })),
                })),
                views: [{ id: VIEW_ID, itemIds: [...serverRowIds] }],
              },
            },
          };
        }
        if (path === "/api/av/getAttributeViewKeysByAvID") return { code: 0, data: {} };
        if (path === "/api/av/renderAttributeView") {
          return { code: 0, data: { view: { id: VIEW_ID, rows: serverRowIds.map((id) => ({ id, cells: [] })) } } };
        }
        if (path === "/api/av/appendAttributeViewDetachedBlocksWithValues") {
          writeCalls += 1;
          serverRowIds.push(NEW_ROW_ID);
          return { code: 0, data: null };
        }
        return { code: 0, data: null };
      },
      async getFile() { return undefined; },
    });

    const result = await executeAddAttributeViewRows(
      {} as never,
      { databaseId: DB_ID, detachedRows: [{ title: "正常条目", values: { 作者: "作者" } }] },
    );
    assert.equal(result.ok, true);
    assert.equal(result.safeOutput.status, "success");
    assert.deepEqual(result.safeOutput.rowIds, [NEW_ROW_ID], "返回的 rowIds 必须为写后新增项");
    assert.equal(writeCalls, 1);
  }

  // 场景 5g: 生产 Tool 入口安全属性断言（recoverable:false 与写前错误 recoverable:true）
  {
    let toolWriteCalls = 0;
    const toolRowIds = ["row-01"];
    setSiyuanRuntimePort({
      async post(path: string) {
        if (path === "/api/av/getAttributeView") {
          return {
            code: 0,
            data: {
              av: {
                id: DB_ID,
                name: "测试",
                keyValues: KEYS.map((k) => ({
                  key: { id: k.keyId, name: k.name, type: k.type },
                  values: toolRowIds.map((rid) => ({ itemID: rid })),
                })),
                views: [{ id: VIEW_ID, itemIds: [...toolRowIds] }],
              },
            },
          };
        }
        if (path === "/api/av/getAttributeViewKeysByAvID") return { code: 0, data: {} };
        if (path === "/api/av/appendAttributeViewDetachedBlocksWithValues") {
          toolWriteCalls += 1;
          throw new Error("ECONNRESET");
        }
        return { code: 0, data: null };
      },
      async getFile() { return undefined; },
    });
    const tool = createAddAttributeViewRowsTool({
      executeAddAttributeViewRows: async (args) => await executeAddAttributeViewRows({} as never, args),
    });

    // 1. 写后异常：recoverable 必须为 false
    const failedResult = await tool.execute(
      { question: "", callCounts: {} } as never,
      { databaseId: DB_ID, detachedRows: [{ title: "Tool 入口验证" }] } as never,
    );
    assert.equal(failedResult.ok, false);
    assert.equal(failedResult.error?.code, "attribute_view_rows_add_verification_failed");
    assert.equal(failedResult.error?.recoverable, false, "生产 Tool 写后异常必须设置 recoverable:false");
    assert.equal(toolWriteCalls, 1);

    // 2. 写前纯字段校验失败：recoverable 必须为 true，且零写调用
    const preCheckResult = await tool.execute(
      { question: "", callCounts: {} } as never,
      { databaseId: DB_ID, detachedRows: [{ title: "字段不存在", values: { 不存在的字段: "值" } }] } as never,
    );
    assert.equal(preCheckResult.ok, false);
    assert.equal(preCheckResult.error?.code, "invalid_field_value");
    assert.equal(preCheckResult.error?.recoverable, true, "写前校验失败必须设置 recoverable:true");
    assert.equal(toolWriteCalls, 1, "写前校验失败不得产生任何写调用");
  }
}

console.log("数据库行合并与新增回读验证通过。");
