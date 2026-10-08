import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundled = await build({
    stdin: { contents: `
        export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port";
        export { getAttributeView, renderAttributeViewReadonly, sqlChecked } from "./src/api";
        export { createDefaultVisualChartConfig, visualChartConfigFromWidgetContent } from "./src/features/visual-chart/visual-chart-config";
        export { loadVisualChartData, transformVisualChartData } from "./src/features/visual-chart/visual-chart-data";
    `, loader: "ts", resolveDir: root },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const AV = "20261008120000-aaaaaaa";
const BLOCK = "20261008120001-bbbbbbb";
const VIEW = "20261008120002-vvvvvvv";
const fields = [{ id: "title", name: "标题", type: "block" }, { id: "amount", name: "数量", type: "number" }];
function row(id, amount = 12) {
    return { id, cells: [
        { id: `title-cell-${id}`, value: { keyID: "title", blockID: id, type: "block", block: { id: `bound-${id}`, content: id } } },
        { id: `amount-cell-${id}`, value: { keyID: "amount", blockID: id, type: "number", number: { content: amount, isNotEmpty: true } } },
    ] };
}
function config(input = AV, limit = 200) {
    const result = runtime.createDefaultVisualChartConfig();
    result.source.type = "database";
    result.source.databaseId = input;
    result.transform.limit = limit;
    return result;
}
function fixture({ definition, rows = [row("item-1")], render, carrier, sqlRows, definitionCode = 0, sqlCode = 0, renderCode = 0 } = {}) {
    const calls = [];
    runtime.setSiyuanRuntimePort({ async post(path, payload) {
        calls.push({ path, payload });
        if (path === "/api/query/sql") return { code: sqlCode, data: sqlRows !== undefined ? sqlRows : payload.stmt.includes(BLOCK) ? [carrier || { markdown: `<div data-av-id="${AV}"></div>` }] : [] };
        if (path === "/api/av/getAttributeView") return { code: definitionCode, data: { av: definition === undefined ? {
            id: AV, name: "fixture", keyValues: fields.map((key) => ({ key, values: [] })),
        } : definition } };
        assert.equal(path, "/api/av/renderAttributeView", "database loading must only use read endpoints");
        assert.equal(payload.createIfNotExist, false);
        assert.equal(payload.persistView, false);
        assert(payload.pageSize > 0 && payload.pageSize <= 200);
        return { code: renderCode, data: typeof render === "function" ? render(payload) : render === undefined ? {
            viewID: VIEW, viewType: "table", view: { columns: fields, rows: rows.slice((payload.page - 1) * payload.pageSize, payload.page * payload.pageSize), rowCount: rows.length },
        } : render };
    } });
    return calls;
}

{
    fixture();
    assert.deepEqual((await runtime.loadVisualChartData(config())).rows, [{ 标题: "item-1", 数量: 12 }]);
    const calls = fixture();
    const carrierConfig = config(BLOCK);
    assert.equal((await runtime.loadVisualChartData(carrierConfig)).resolvedDatabaseId, AV);
    assert.equal(carrierConfig.source.databaseId, BLOCK, "keep the carrier context instead of replacing it with avID");
    assert.equal(calls.find((call) => call.path.endsWith("renderAttributeView")).payload.blockID, BLOCK);

    for (const values of [undefined, null, []]) {
        fixture({ definition: { id: AV, name: "", keyValues: fields.map((key) => ({ key, ...(values === undefined ? {} : { values }) })) }, rows: [] });
        const result = await runtime.loadVisualChartData(config());
        assert.deepEqual(result.columns, ["标题", "数量"]);
        assert.deepEqual(result.rows, [], "official omitempty empty fields are a legal zero-row database");
    }
    fixture({ definition: { id: AV, keyValues: fields.map((key) => ({ key })) } });
    assert.equal((await runtime.loadVisualChartData(config())).rows[0].数量, 12, "omitted raw values must not hide rendered row data");
    // Capture the reported failure with the pre-fix access pattern, then exercise the real loader.
    assert.throws(() => ({ keyValues: [{ key: fields[0] }] }).keyValues.forEach((column) => column.values.forEach(() => {})), /forEach/);
    for (const definition of [null, { id: AV, name: "invalid" }, { id: AV, keyValues: {} }, { id: AV, keyValues: [{ key: fields[0], values: {} }] },
        { id: AV, keyValues: [{ values: [] }] }, { id: AV, keyValues: [{ key: { id: "title", name: "标题" } }] }, "invalid"]) {
        fixture({ definition });
        await assert.rejects(runtime.loadVisualChartData(config()), /数据库.*(无效|响应|字段)/);
    }
    fixture({ definitionCode: 403 });
    await assert.rejects(runtime.loadVisualChartData(config()), /定义读取失败/);
    fixture({ sqlCode: 403 });
    await assert.rejects(runtime.loadVisualChartData(config(BLOCK)), /ID 解析时读取失败/);
    for (const sqlRows of [null, {}]) {
        fixture({ sqlRows });
        await assert.rejects(runtime.loadVisualChartData(config()), /ID 解析时读取失败/);
    }
    fixture({ renderCode: 403 });
    await assert.rejects(runtime.loadVisualChartData(config()), /行读取失败/);
    await assert.rejects(runtime.loadVisualChartData(config("invalid-id")), /ID 无效/);
    fixture({ carrier: { markdown: "", ial: `data-av-id="${AV}"` } });
    assert.equal((await runtime.loadVisualChartData(config(BLOCK))).resolvedDatabaseId, AV);
    fixture({ carrier: { markdown: "invalid carrier" } });
    await assert.rejects(runtime.loadVisualChartData(config(BLOCK)), /缺少属性视图 ID/);

    const first = row("item-1", 13);
    const second = row("item-2", 25);
    second.cells.reverse();
    fixture({ rows: [first, second] });
    assert.deepEqual((await runtime.loadVisualChartData(config())).rows, [{ 标题: "item-1", 数量: 13 }, { 标题: "item-2", 数量: 25 }], "cell IDs and bound block IDs must never be used as row IDs");
    first.cells[1].value = null;
    fixture({ rows: [first] });
    assert.equal((await runtime.loadVisualChartData(config())).rows[0].数量, null);
    fixture({ rows: [{ id: "item-1", cells: [row("item-1").cells[0], { id: "empty-cell" }] }] });
    assert.deepEqual((await runtime.loadVisualChartData(config())).rows, [{ 标题: "item-1", 数量: null }]);
    fixture({ rows: [{ id: "item-1", cells: [row("item-1").cells[0]] }] });
    assert.equal((await runtime.loadVisualChartData(config())).rows[0].数量, null, "a sparse column must stay empty on the correct row");
    fixture({ rows: [{ id: "item-1", cells: [{ value: { keyID: "amount", blockID: "other-item", number: { content: 9 } } }] }] });
    await assert.rejects(runtime.loadVisualChartData(config()), /无法关联/);
    for (const cells of [[{ value: { number: { content: 9 } } }], [row("item").cells[0], row("item").cells[0]]]) {
        fixture({ rows: [{ id: "item", cells }] });
        await assert.rejects(runtime.loadVisualChartData(config()), /无法关联/);
    }
    fixture({ rows: [{ id: "item", cells: [null] }] });
    await assert.rejects(runtime.loadVisualChartData(config()), /单元格结构无效/);

    fixture({ rows: Array.from({ length: 205 }, (_, index) => row(`item-${index}`)) });
    assert.equal((await runtime.loadVisualChartData(config(AV, 201))).rows.length, 201);
    fixture({ render: ({ page }) => ({ viewID: VIEW, viewType: "table", view: {
        columns: page === 1 ? fields : [fields[0], { ...fields[1], id: "changed-field" }],
        rows: Array.from({ length: page === 1 ? 200 : 1 }, (_, index) => row(`item-${page}-${index}`)), rowCount: 201,
    } }) });
    await assert.rejects(runtime.loadVisualChartData(config(AV, 201)), /视图在读取期间发生变化/);
    const limitedCalls = fixture({ rows: Array.from({ length: 10 }, (_, index) => row(`item-${index}`)) });
    assert.equal((await runtime.loadVisualChartData(config(AV, 3))).rows.length, 3);
    assert.equal(limitedCalls.filter((call) => call.path.endsWith("renderAttributeView")).length, 1);
    for (const render of [null, { viewType: "gallery", view: {} }, { viewType: "table", viewID: VIEW, view: { columns: fields, rows: null } },
        { viewType: "table", viewID: VIEW, view: { columns: fields, rows: [], group: { field: "title" } } }]) {
        fixture({ render });
        await assert.rejects(runtime.loadVisualChartData(config()), /响应不完整|结构暂不支持|布局暂不支持/);
    }
    fixture({ render: { viewType: "list", viewID: VIEW, view: { columns: fields, rows: [row("detached-item")], rowCount: 1 } } });
    assert.equal((await runtime.loadVisualChartData(config())).rows.length, 1);
    for (const view of [{ columns: fields, rows: [] }, { columns: fields, rows: [], rowCount: 3 }, { columns: fields, rows: [row("item")], rowCount: 3 }]) {
        fixture({ render: { viewType: "table", viewID: VIEW, view } });
        await assert.rejects(runtime.loadVisualChartData(config()), /分页响应不完整/);
    }
    fixture();
    await runtime.renderAttributeViewReadonly({ id: AV, createIfNotExist: true, persistView: true, pageSize: 1 });

    const typedValues = [
        ["text", { text: { content: "text" } }, "text"],
        ["number", { number: { content: 0, isNotEmpty: true } }, 0],
        ["number-empty", { number: { content: 0, isNotEmpty: false } }, null],
        ["date", { date: { content: 123, isNotEmpty: true } }, 123],
        ["created", { created: { content: 456 } }, 456],
        ["updated", { updated: { content: 789 } }, 789],
        ["select", { mSelect: [{ content: "A" }] }, "A"],
        ["mSelect", { mSelect: [{ content: "A" }, { content: "B" }] }, "A, B"],
        ["checkbox", { checkbox: { checked: false } }, false],
        ["url", { url: { content: "https://example.com" } }, "https://example.com"],
        ["email", { email: { content: "fixture@example.com" } }, "fixture@example.com"],
        ["phone", { phone: { content: "123" } }, "123"],
        ["template", { template: { content: "computed" } }, "computed"],
        ["mAsset", { mAsset: [{ name: "asset.png" }] }, "asset.png"],
        ["relation", { relation: { blockIDs: ["related-item"], contents: [{ block: { content: "related" } }] } }, "related"],
        ["relation-empty", { relation: { blockIDs: null, contents: null } }, null],
        ["rollup", { rollup: { contents: [{ number: { content: 17, isNotEmpty: true } }] } }, 17],
        ["rollup-empty", { rollup: { contents: [] } }, null],
    ];
    const typedColumns = typedValues.map(([id]) => ({ id, name: id, type: id.replace("-empty", "") }));
    fixture({ render: { viewType: "table", viewID: VIEW, view: { columns: typedColumns, rows: [{ id: "item", cells: typedValues.map(([id, value]) => ({ value: { keyID: id, blockID: "item", ...value } })) }], rowCount: 1 } } });
    assert.deepEqual((await runtime.loadVisualChartData(config())).rows[0], Object.fromEntries(typedValues.map(([id, , expected]) => [id, expected])));
    const typed = await runtime.loadVisualChartData(config());
    const mapped = config();
    mapped.mapping.category = "text";
    mapped.mapping.values = ["number", "rollup"];
    mapped.transform.aggregate = "sum";
    mapped.transform.emptyAsZero = false;
    assert.deepEqual(runtime.transformVisualChartData(typed, mapped).rows, [{ text: "text", number: 0, rollup: 17 }]);
    fixture({ rows: [{ id: "item", cells: [{ value: { keyID: "title", relation: {} } }] }] });
    await assert.rejects(runtime.loadVisualChartData(config()), /contents 数组/);

    const manual = runtime.createDefaultVisualChartConfig();
    manual.source.manualData = '[{"category":"A","value":7}]';
    assert.deepEqual((await runtime.loadVisualChartData(manual)).rows, [{ category: "A", value: 7 }]);
    manual.source.manualData = "category,value\nA,7";
    assert.deepEqual((await runtime.loadVisualChartData(manual)).rows, [{ category: "A", value: "7" }]);
    runtime.setSiyuanRuntimePort({ async post(path) { assert.equal(path, "/api/query/sql"); return { code: 0, data: [{ category: "SQL", value: 8 }] }; } });
    manual.source.type = "sql";
    assert.deepEqual((await runtime.loadVisualChartData(manual)).rows, [{ category: "SQL", value: 8 }]);
    const legacy = runtime.visualChartConfigFromWidgetContent({ data: { visualChartType: "progressBar", progressBars: [{ title: "old", progress: 3, target: 5 }] } });
    assert.equal(legacy.source.type, "manual");
    assert.equal((await runtime.loadVisualChartData(legacy)).rows[0].progress, 3);
    console.log("PASS visual charts: database IDs, empty/invalid responses, typed cells, row association, paging, read-only render, manual/SQL/legacy sources");
}
