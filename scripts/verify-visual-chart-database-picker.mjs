import assert from "node:assert/strict";
// Reuse the verifier that executes the real Console AST handlers/effects and Svelte markup.
import { rt, settle, html } from "./verify-visual-chart-views.mjs";

const AV = "20261010150000-aaaaaaa", BLOCK = "20261010150001-bbbbbbb";
const OTHER = "20261010150002-ooooooo", OTHER_BLOCK = "20261010150003-ccccccc";
const TABLE = "20261010150004-ttttttt", LIST = "20261010150005-lllllll";
const columns = [{ id: "title", name: "标题", type: "block" }, { id: "amount", name: "数量", type: "number" }];
const views = [{ id: TABLE, name: "总览", type: "table" }, { id: LIST, name: "清单", type: "list" }];
function result(avID = AV, blockID = BLOCK) {
    return { avID, avName: "项目数据库", blockID, hPath: "/笔记本/项目", viewID: "", viewName: "", viewLayout: "",
        children: views.map((view) => ({ avID, avName: "项目数据库", blockID, hPath: "/笔记本/项目", viewID: view.id, viewName: view.name, viewLayout: view.type })) };
}
function config(id = AV) {
    const value = rt.createDefaultVisualChartConfig();
    value.source.type = "database"; value.source.databaseId = id; value.source.databaseViewId = LIST;
    return value;
}
let calls = [], renderCode = 0, reply = async () => ({ code: 0, data: { results: [result()] } });
rt.setSiyuanRuntimePort({ async post(path, payload) {
    calls.push({ path, payload });
    if (path === "/api/av/searchAttributeView") return reply(payload);
    if (path === "/api/query/sql") {
        const id = payload.stmt.includes(OTHER_BLOCK) ? OTHER_BLOCK : payload.stmt.includes(BLOCK) ? BLOCK : "";
        return { code: 0, data: id ? [{ markdown: `<div data-av-id="${id === BLOCK ? AV : OTHER}"></div>` }] : [] };
    }
    if (path === "/api/av/getAttributeView") return { code: 0, data: { av: { id: payload.id, name: "项目数据库", views, keyValues: columns.map((key) => ({ key })) } } };
    assert.equal(path, "/api/av/renderAttributeView", "picker and preview must only call read APIs");
    assert.equal(payload.createIfNotExist, false);
    if (renderCode) return { code: renderCode, msg: "preview permission denied" };
    return { code: 0, data: { viewID: payload.viewID || TABLE, viewType: payload.viewID === LIST ? "list" : "table", view: { columns, rowCount: 1,
        rows: [{ id: "record-1", cells: [
            { id: "unrelated-cell-id-1", value: { keyID: "amount", type: "number", number: { content: 23, isNotEmpty: true } } },
            { id: "unrelated-cell-id-2", value: { keyID: "title", type: "block", block: { content: "真实行关联" } } },
        ] }] } } };
} });
const searches = () => calls.filter(({ path }) => path.endsWith("searchAttributeView"));

// Actual checked API: input gating, the official parent + child contract, no ID guessing.
for (const keyword of ["", " ", "项", " 项 "]) assert.deepEqual(await rt.searchAttributeViewChecked(keyword), []);
assert.equal(calls.length, 0);
const valid = await rt.searchAttributeViewChecked(" 项目 ", { avID: AV, blockID: BLOCK });
assert.equal(valid[0].avID, AV); assert.equal(valid[0].children[1].viewID, LIST);
assert.deepEqual(searches()[0].payload, { keyword: "项目", avID: AV, blockID: BLOCK, includeViewMatches: false });
await assert.rejects(() => rt.searchAttributeViewChecked(12), /关键词/);
await assert.rejects(() => rt.searchAttributeViewChecked("项目", { blockID: "invalid" }), /ID 无效/);
reply = async () => ({ code: 0, data: { results: [] } });
assert.deepEqual(await rt.searchAttributeViewChecked("项目"), []);
for (const blockID of [undefined, null, ""]) {
    reply = async () => ({ code: 0, data: { results: [result(AV, blockID)] } });
    // The helper's default argument supplies BLOCK for undefined; simulate real omission instead.
    if (blockID === undefined) reply = async () => { const value = result(); delete value.blockID; value.children = []; return { code: 0, data: { results: [value] } }; };
    assert.equal((await rt.searchAttributeViewChecked("项目"))[0].blockID, "");
}
const twelve = Array.from({ length: 12 }, (_, i) => ({ ...result(`2026101016${String(i).padStart(4, "0")}-aaaaaaa`, ""), children: [] }));
reply = async () => ({ code: 0, data: { results: twelve } });
assert.equal((await rt.searchAttributeViewChecked("项目")).length, 12);
for (const data of [null, {}, { results: null }, { results: {} }, { results: [...twelve, result()] },
    { results: [null] }, { results: [result(), result()] },
    ...["avID", "blockID"].map((field) => ({ results: [{ ...result(), [field]: "invalid" }] })),
    ...["avName", "hPath"].map((field) => ({ results: [{ ...result(), [field]: undefined }] })),
    { results: [{ ...result(), viewID: TABLE, viewLayout: "future-layout" }] },
    { results: [{ ...result(), children: {} }] },
    { results: [{ ...result(), children: [{ ...result().children[0], avID: OTHER }] }] },
    { results: [{ ...result(), children: [{ ...result().children[0], viewID: "invalid" }] }] },
]) {
    reply = async () => ({ code: 0, data });
    await assert.rejects(() => rt.searchAttributeViewChecked("项目"), /响应结构异常/);
}
for (const code of [401, 403, -1]) {
    reply = async () => ({ code, msg: "permission denied / readonly", data: { results: [] } });
    await assert.rejects(() => rt.searchAttributeViewChecked("项目"), (error) => error instanceof rt.SiyuanApiError && error.siyuanCode === code);
}
reply = async () => { throw new Error("Kernel connection failed"); };
await assert.rejects(() => rt.searchAttributeViewChecked("项目"), /Kernel connection failed/);

// Drive the actual Console effects with the verifier's deterministic 450 ms timer queue.
reply = async () => ({ code: 0, data: { results: [result()] } }); calls = [];
const studio = rt.studio(config());
studio.syncSearch(); assert.equal(calls.length, 0); assert.deepEqual(studio.delays, []);
studio.openSearch(); studio.syncSearch(); assert.deepEqual(studio.delays, []);
studio.setKeyword("项"); studio.syncSearch(); assert.deepEqual(studio.delays, []);
studio.setKeyword("项目"); studio.syncSearch(); assert.deepEqual(studio.delays, [450]); assert.equal(calls.length, 0);
studio.setKeyword("项目数据库"); studio.syncSearch(); assert.deepEqual(studio.delays, [450]);
studio.flush(); await settle(); assert.equal(searches().length, 1); assert.equal(searches()[0].payload.keyword, "项目数据库");
assert.equal(studio.snapshot.searchResults.length, 1);
let release;
reply = () => new Promise((done) => release = () => done({ code: 0, data: { results: [result(OTHER, OTHER_BLOCK)] } }));
const stale = studio.searchDatabases("旧项目"); await settle();
studio.setKeyword("新项目"); studio.syncSearch(); release(); await stale;
assert.deepEqual(studio.snapshot.searchResults, [], "old result cannot appear during the next debounce window");
assert.equal(studio.snapshot.searchLoading, true);
reply = async () => ({ code: 0, data: { results: [] } }); studio.flush(); await settle();
assert.equal(studio.snapshot.searchHasSearched, true);
assert(html(studio.snapshot, studio.config).includes("当前可检索范围没有匹配"));
reply = async () => ({ code: 403, msg: "permission denied" });
await studio.searchDatabases("新项目"); assert.match(studio.snapshot.searchError, /code=403/);
assert.equal(studio.config.source.databaseId, AV);
assert(html(studio.snapshot, studio.config).includes("登录状态及只读权限"));
reply = async () => ({ code: -1, msg: "API unavailable" });
await studio.searchDatabases("新项目"); assert.match(studio.snapshot.searchError, /API unavailable/);
reply = async () => ({ code: 0, data: { results: twelve } }); await studio.searchDatabases("项目");
assert(html(studio.snapshot, studio.config).includes("已达到 12 个数据库的结果上限"));

// Selection events preserve the existing view for the same AV, but reset a different AV.
reply = async () => ({ code: 0, data: { results: [result()] } });
await studio.searchDatabases("项目"); studio.selectDatabase(studio.snapshot.searchResults[0]);
assert.equal(studio.config.source.databaseId, BLOCK, "prefer carrier block, never a child view ID");
assert.equal(studio.config.source.databaseViewId, LIST);
assert.equal(studio.snapshot.searchOpen, false);
studio.syncViews(); studio.syncSource(); studio.syncSearch(); studio.flush(); await settle();
assert.equal(studio.snapshot.databaseViews[1].id, LIST);
assert.deepEqual(studio.snapshot.dataset.rows, [{ 标题: "真实行关联", 数量: 23 }]);
const render = calls.filter(({ path }) => path.endsWith("renderAttributeView")).at(-1);
assert.equal(render.payload.id, AV); assert.equal(render.payload.blockID, BLOCK); assert.equal(render.payload.viewID, LIST);
studio.openSearch(); studio.setKeyword("项目"); await studio.searchDatabases("项目");
assert.deepEqual(searches().at(-1).payload, { keyword: "项目", avID: AV, blockID: BLOCK, includeViewMatches: false });
studio.selectDatabase(studio.snapshot.searchResults[0]); await settle();
assert.equal(studio.config.source.databaseViewId, LIST, "same carrier selection must retain its view");

// Another carrier of a previously resolved AV still refers to the same database.
reply = async () => ({ code: 0, data: { results: [result(AV, "20261010150006-ddddddd")] } });
studio.openSearch(); await studio.searchDatabases("项目"); studio.selectDatabase(studio.snapshot.searchResults[0]);
assert.equal(studio.config.source.databaseViewId, LIST);
// Identity from the view loader also survives a failed preview without another lookup.
const failedPreview = rt.studio(config(BLOCK)); renderCode = -1;
await failedPreview.reloadViews(BLOCK); await failedPreview.reload(); assert(failedPreview.snapshot.error);
failedPreview.openSearch(); await failedPreview.searchDatabases("项目");
assert.equal(searches().at(-1).payload.avID, AV);
failedPreview.selectDatabase(failedPreview.snapshot.searchResults[0]);
assert.equal(failedPreview.config.source.databaseViewId, LIST);
renderCode = 0;
reply = async () => ({ code: 0, data: { results: [result(OTHER, OTHER_BLOCK)] } });
studio.openSearch(); await studio.searchDatabases("项目"); studio.selectDatabase(studio.snapshot.searchResults[0]);
assert.equal(studio.config.source.databaseId, OTHER_BLOCK); assert.equal(studio.config.source.databaseViewId, "");
studio.syncViews(); studio.syncSource(); studio.syncSearch(); studio.flush(); await settle();
assert.equal(calls.filter(({ path }) => path.endsWith("renderAttributeView")).at(-1).payload.blockID, OTHER_BLOCK);
studio.config.source.databaseViewId = TABLE;
reply = async () => ({ code: 0, data: { results: [result(OTHER, "")] } });
studio.openSearch(); await studio.searchDatabases("项目"); studio.selectDatabase(studio.snapshot.searchResults[0]);
assert.equal(studio.config.source.databaseId, OTHER); assert.equal(studio.config.source.databaseViewId, TABLE);
await studio.save();
const saved = rt.writeVisualChartConfigToWidgetContent({ id: "widget", data: { unrelated: "preserved" } }, studio.snapshot.saved);
const reopened = rt.visualChartConfigFromWidgetContent(JSON.parse(JSON.stringify(saved)));
assert.equal(saved.data.unrelated, "preserved"); assert.deepEqual(reopened, studio.snapshot.saved);

// Cancel/source changes/destroy never alter saved IDs or accept late results.
const cancel = rt.studio(config(BLOCK)), original = structuredClone(cancel.config);
cancel.openSearch(); cancel.setKeyword("项目"); cancel.syncSearch(); cancel.closeSearch(); cancel.flush();
assert.deepEqual(cancel.config, original); assert.deepEqual(cancel.delays, []);
reply = () => new Promise((done) => release = () => done({ code: 0, data: { results: [result()] } }));
cancel.openSearch(); const cancelled = cancel.searchDatabases("项目"); await settle(); cancel.closeSearch(); release(); await cancelled;
assert.deepEqual(cancel.snapshot.searchResults, []); assert.deepEqual(cancel.config, original);
cancel.openSearch(); const leaving = cancel.searchDatabases("项目"); await settle();
cancel.config.source.type = "manual"; cancel.syncSearch(); release(); await leaving;
assert.deepEqual(cancel.snapshot.searchResults, []); assert.deepEqual(cancel.delays, []);
const disposed = rt.studio(config()); disposed.openSearch(); const pending = disposed.searchDatabases("项目"); await settle();
const before = structuredClone(disposed.snapshot); disposed.dispose(); release(); await pending;
assert.deepEqual(disposed.snapshot, before); assert.deepEqual(disposed.delays, []);
assert.deepEqual([...new Set(calls.map(({ path }) => path))].sort(), [
    "/api/av/getAttributeView", "/api/av/renderAttributeView", "/api/av/searchAttributeView", "/api/query/sql",
].sort(), "only official search plus existing scoped read APIs were called");
console.log("PASS database picker: checked official fixtures, input/debounce, stale/cancel/disposal, permissions/failures, 12 cap, block/AV identity, view collaboration, row mapping, config roundtrip, read-only calls, real Svelte status markup");
