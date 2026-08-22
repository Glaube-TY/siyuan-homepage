/**
 * 书签块查询与管理验收：验证 getBookmark 唯一权威性、删除无效 SQL 回退。
 * 合成 runtime port，不读取或修改用户测试空间。
 */
import assert from "node:assert/strict";
import { setSiyuanRuntimePort } from "../src/runtime/siyuan-runtime-port";
import { executeSiyuanBookmarkManage } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-bookmark-manage.impl";

type PostCall = { path: string; payload: unknown };

function installRuntime(handler: (path: string, payload: unknown) => { code: number; msg?: string; data?: unknown }) {
  const calls: PostCall[] = [];
  setSiyuanRuntimePort({
    post: async (path, payload) => {
      calls.push({ path, payload });
      return handler(path, payload);
    },
  });
  return calls;
}

async function main() {
  const sampleBookmarkData = [
    {
      id: "block-1",
      bookmark: "读书笔记",
      content: "这是一篇关于系统设计的长篇读书笔记内容描述",
      created: "20260101100000",
      updated: "20260102100000",
    },
    {
      id: "block-2",
      bookmark: "工作待办",
      content: "重构数据库视图与行合并逻辑",
      created: "20260101110000",
      updated: "20260102110000",
    },
    {
      id: "block-3",
      bookmark: "读书笔记",
      content: "第二篇读书笔记内容",
      created: "20260101120000",
      updated: "20260102120000",
    },
  ];

  // ── 1. 无关键词时，API 返回的多个书签块按当前合同列出并受 maxItems 限制 ──
  {
    const calls = installRuntime((path) => {
      if (path === "/api/bookmark/getBookmark") {
        return { code: 0, data: sampleBookmarkData };
      }
      return { code: 0, data: null };
    });

    const result = await executeSiyuanBookmarkManage({
      action: "list_blocks",
      maxItems: 2,
    });
    const output = (result.output as any).data;
    assert.equal(output.source, "getBookmark");
    assert.equal(output.total, 2);
    assert.equal(output.items.length, 2);
    assert.equal(output.items[0].id, "block-1");
    assert.equal(output.items[1].id, "block-2");
    assert.equal(calls.filter((c) => c.path === "/api/query/sql").length, 0, "严格不得调用 SQL");
  }

  // ── 2. 查询已存在书签名时，只返回匹配块，source === 'getBookmark'，摘要受 maxChars 限制 ──
  {
    const calls = installRuntime((path) => {
      if (path === "/api/bookmark/getBookmark") {
        return { code: 0, data: sampleBookmarkData };
      }
      return { code: 0, data: null };
    });

    const result = await executeSiyuanBookmarkManage({
      action: "list_blocks",
      keyword: "读书笔记",
      maxChars: 6,
    });
    const output = (result.output as any).data;
    assert.equal(output.source, "getBookmark");
    assert.equal(output.total, 2);
    assert.equal(output.items.length, 2);
    assert.equal(output.items[0].bookmark, "读书笔记");
    assert.equal(output.items[0].contentPreview, "这是一篇关于");
    assert.equal(output.items[1].bookmark, "读书笔记");
    assert.equal(output.items[1].contentPreview, "第二篇读书笔");
    assert.equal(calls.filter((c) => c.path === "/api/query/sql").length, 0, "严格不得调用 SQL");
  }

  // ── 3. 查询已重命名或删除的旧名称时，返回 total === 0、items 为空，且 /api/query/sql 调用次数严格为 0 ──
  {
    const calls = installRuntime((path) => {
      if (path === "/api/bookmark/getBookmark") {
        return { code: 0, data: sampleBookmarkData };
      }
      if (path === "/api/query/sql") {
        assert.fail("旧书名查询绝不得回退调用 SQL");
      }
      return { code: 0, data: null };
    });

    const result = await executeSiyuanBookmarkManage({
      action: "list_blocks",
      keyword: "已删除的旧书签名称",
    });
    const output = (result.output as any).data;
    assert.equal(output.source, "getBookmark");
    assert.equal(output.total, 0);
    assert.deepEqual(output.items, []);
    assert.equal(calls.filter((c) => c.path === "/api/query/sql").length, 0);
  }

  // ── 4. API 返回空集合时同样返回稳定空结果，不调用 SQL ──
  {
    const calls = installRuntime((path) => {
      if (path === "/api/bookmark/getBookmark") {
        return { code: 0, data: [] };
      }
      if (path === "/api/query/sql") {
        assert.fail("空书签集合绝不得回退调用 SQL");
      }
      return { code: 0, data: null };
    });

    const result = await executeSiyuanBookmarkManage({
      action: "list_blocks",
    });
    const output = (result.output as any).data;
    assert.equal(output.source, "getBookmark");
    assert.equal(output.total, 0);
    assert.deepEqual(output.items, []);
    assert.equal(calls.filter((c) => c.path === "/api/query/sql").length, 0);
  }

  // ── 5. /api/bookmark/getBookmark 返回非零错误码时，生产 Tool 明确失败，且不调用 SQL、不重试 ──
  {
    const calls = installRuntime((path) => {
      if (path === "/api/bookmark/getBookmark") {
        return { code: -1, msg: "思源内核未启动或网络故障" };
      }
      if (path === "/api/query/sql") {
        assert.fail("API 失败时绝不得尝试 SQL fallback");
      }
      return { code: 0, data: null };
    });

    await assert.rejects(
      async () => {
        await executeSiyuanBookmarkManage({
          action: "list_blocks",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("getBookmark"));
        return true;
      },
      "API 失败时必须向外抛出错误",
    );
    assert.equal(calls.filter((c) => c.path === "/api/query/sql").length, 0);
  }

  // ── 6. 现有书签结构解析、去重与树状分组解析 ──
  {
    const nestedData = {
      学习分类: [
        {
          id: "block-nested-1",
          content: "嵌套书签内容1",
        },
        // 重复项用于测试去重
        {
          id: "block-nested-1",
          content: "嵌套书签内容1重复",
        },
      ],
    };
    installRuntime((path) => {
      if (path === "/api/bookmark/getBookmark") {
        return { code: 0, data: nestedData };
      }
      return { code: 0, data: null };
    });

    const result = await executeSiyuanBookmarkManage({
      action: "list_blocks",
      keyword: "学习",
    });
    const output = (result.output as any).data;
    assert.equal(output.source, "getBookmark");
    assert.equal(output.total, 1, "重复项目必须去重");
    assert.equal(output.items[0].id, "block-nested-1");
    assert.equal(output.items[0].bookmark, "学习分类");
  }

  // ── 7. rename / remove / list 行为保持一致 ──
  {
    const setAttrCalls: Array<{ blockId: string; attrs: Record<string, string> }> = [];
    installRuntime((path, payload) => {
      if (path === "/api/bookmark/getBookmark") {
        return { code: 0, data: ["bookmark-1", "bookmark-2"] };
      }
      if (path === "/api/attr/setBlockAttrs") {
        const p = payload as { id: string; attrs: Record<string, string> };
        setAttrCalls.push({ blockId: p.id, attrs: p.attrs });
        return { code: 0, data: null };
      }
      return { code: 0, data: null };
    });

    // list action
    const listRes = await executeSiyuanBookmarkManage({ action: "list" });
    assert.deepEqual((listRes.output as any).data, ["bookmark-1", "bookmark-2"]);

    // rename action
    const renameRes = await executeSiyuanBookmarkManage({
      action: "rename",
      oldBookmark: "旧书签",
      newBookmark: "新书签",
      blockIds: ["block-1", "block-2"],
    });
    assert.equal((renameRes.output.data as any).affectedBlocks, 2);
    assert.equal(setAttrCalls.length, 2);
    assert.deepEqual(setAttrCalls[0], { blockId: "block-1", attrs: { bookmark: "新书签" } });
    assert.deepEqual(setAttrCalls[1], { blockId: "block-2", attrs: { bookmark: "新书签" } });

    // remove action
    const removeRes = await executeSiyuanBookmarkManage({
      action: "remove",
      bookmark: "要删除的书签",
      blockIds: ["block-1"],
    });
    assert.equal((removeRes.output.data as any).affectedBlocks, 1);
    assert.deepEqual(setAttrCalls[2], { blockId: "block-1", attrs: { bookmark: "" } });
  }

  console.log("书签块查询与管理验证通过。");
}

main();
