import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundled = await build({
    stdin: { contents: `
        export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port";
        export { getAttributeView, renderAttributeViewReadonly, sqlChecked } from "./src/api";
        export { createDefaultVisualChartConfig, normalizeVisualChartConfig, autoMapVisualChartFields, visualChartConfigFromWidgetContent, writeVisualChartConfigToWidgetContent } from "./src/features/visual-chart/visual-chart-config";
        export { loadVisualChartData, loadVisualChartDatabaseViews, transformVisualChartData } from "./src/features/visual-chart/visual-chart-data";
    `, loader: "ts", resolveDir: root },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const AV = "20261008120000-aaaaaaa";
const BLOCK = "20261008120001-bbbbbbb";
const VIEW = "20261008120002-vvvvvvv";
const LIST = "20261010120000-lllllll";
const CALENDAR = "20261010120001-ccccccc";
const GALLERY = "20261010120002-ggggggg";
const KANBAN = "20261010120003-kkkkkkk";
const defaultViews = [{ id: VIEW, name: "总览", type: "table", table: { columns: [{ id: "title" }, { id: "amount" }], rowIDs: [] } }];
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
function fixture({ definition, rows = [row("item-1")], render, carrier, sqlRows, definitionCode = 0, sqlCode = 0, renderCode = 0, renderMsg = "" } = {}) {
    const calls = [];
    runtime.setSiyuanRuntimePort({ async post(path, payload) {
        calls.push({ path, payload });
        if (path === "/api/query/sql") return { code: sqlCode, data: sqlRows !== undefined ? sqlRows : payload.stmt.includes(BLOCK) ? [carrier || { markdown: `<div data-av-id="${AV}"></div>` }] : [] };
        if (path === "/api/av/getAttributeView") return { code: definitionCode, data: { av: definition === undefined ? {
            id: AV, name: "fixture", viewID: VIEW, views: defaultViews.map((view) => ({ ...view, type: render?.viewType || "table" })), keyValues: fields.map((key) => ({ key, values: [] })),
        } : definition } };
        assert.equal(path, "/api/av/renderAttributeView", "database loading must only use read endpoints");
        assert.equal(payload.createIfNotExist, false);
        assert.equal(payload.persistView, false);
        assert(payload.pageSize > 0 && payload.pageSize <= 200);
        return { code: renderCode, msg: renderMsg, data: typeof render === "function" ? render(payload) : render === undefined ? {
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
        fixture({ definition: { id: AV, name: "", views: defaultViews, keyValues: fields.map((key) => ({ key, ...(values === undefined ? {} : { values }) })) }, rows: [] });
        const result = await runtime.loadVisualChartData(config());
        assert.deepEqual(result.columns, ["标题", "数量"]);
        assert.deepEqual(result.rows, [], "official omitempty empty fields are a legal zero-row database");
    }
    for (const rows of [[], null]) {
        const calls = fixture({ render: { viewType: "table", viewID: VIEW, view: { columns: fields, rows, rowCount: 0 } } });
        const emptyConfig = config(BLOCK);
        const result = await runtime.loadVisualChartData(emptyConfig);
        assert.deepEqual(result.columns, ["标题", "数量"]);
        assert.deepEqual(result.rows, [], "nil rows are legal only in a proven zero-row table");
        assert.equal(emptyConfig.source.databaseId, BLOCK);
        const renders = calls.filter((call) => call.path.endsWith("renderAttributeView"));
        assert.equal(renders.length, 1);
        assert.equal(renders[0].payload.blockID, BLOCK);
        assert.equal(renders[0].payload.createIfNotExist, false);
    }
    for (const view of [
        { columns: fields, rows: null, rowCount: 1 },
        { columns: fields, rows: {}, rowCount: 0 },
        { columns: fields, rows: "invalid", rowCount: 0 },
        { columns: fields, rows: 0, rowCount: 0 },
        { columns: fields, rows: false, rowCount: 0 },
        { columns: fields, rowCount: 0 },
        { rows: null, rowCount: 0 },
        { columns: fields, rows: null, rowCount: -1 },
        { columns: fields, rows: null, rowCount: 0.5 },
    ]) {
        fixture({ render: { viewType: "table", viewID: VIEW, view } });
        await assert.rejects(runtime.loadVisualChartData(config()), /响应不完整/);
    }
    fixture({ definition: { id: AV, views: defaultViews, keyValues: fields.map((key) => ({ key })) } });
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
    // Official v3.8.6 AVView and rendered table/list fixtures; no master-only APIs.
    const views = [
        ...defaultViews,
        { id: LIST, name: "任务清单", type: "list", list: { columns: [{ id: "title" }, { id: "score" }], rowIDs: [] } },
        { id: CALENDAR, name: "本月安排", type: "calendar", calendar: { settings: { dateKeyID: "date", weekStart: 1 }, columns: [{ id: "title" }, { id: "date" }] } },
        { id: GALLERY, name: "图片", type: "gallery", gallery: { fields: [] } },
        { id: KANBAN, name: "状态", type: "kanban", kanban: { fields: [] } },
    ];
    const definition = { id: AV, name: "多视图", viewID: VIEW, views, keyValues: [...fields,
        { id: "score", name: "评分", type: "number" }, { id: "date", name: "日期", type: "date" },
    ].map((key) => ({ key })) };
    for (const input of [AV, BLOCK]) {
        const calls = fixture({ definition });
        const available = await runtime.loadVisualChartDatabaseViews(input);
        assert.deepEqual(available.map((view) => [view.id, view.name, view.typeLabel]), [
            [VIEW, "总览", "表格"], [LIST, "任务清单", "列表"], [CALENDAR, "本月安排", "日历"], [GALLERY, "图片", "画廊"], [KANBAN, "状态", "看板"],
        ]);
        assert(available.slice(0, 2).every((view) => !view.unsupportedReason));
        assert.match(available[2].unsupportedReason, /日期范围.*无日期.*分页/);
        assert(available.slice(3).every((view) => view.unsupportedReason));
        assert.deepEqual(calls.map((call) => call.path), ["/api/query/sql", "/api/av/getAttributeView"], "listing only reads the specified database");
        assert.equal(calls[1].payload.id, AV);
    }
    for (const invalidViews of [undefined, null, [], {}, [null], [{ id: "bad", name: "bad", type: "table" }],
        [{ id: VIEW, type: "table" }], [defaultViews[0], defaultViews[0]]]) {
        fixture({ definition: { ...definition, views: invalidViews } });
        await assert.rejects(runtime.loadVisualChartDatabaseViews(AV), /没有可用视图|视图响应不完整/);
    }
    fixture({ definitionCode: 403 });
    await assert.rejects(runtime.loadVisualChartDatabaseViews(AV), /定义读取失败/);
    fixture({ definition: null });
    await assert.rejects(runtime.loadVisualChartDatabaseViews(AV), /不存在/);

    const listFields = [fields[0], { id: "score", name: "评分", type: "number" }];
    for (const [viewID, viewType, columns] of [[VIEW, "table", fields], [LIST, "list", listFields]]) {
        for (const input of [AV, BLOCK]) {
            const calls = fixture({ definition, render: () => ({ viewID, viewType, view: {
                columns, filters: [{ column: "title", operator: "Is not empty" }], sorts: [{ column: columns[1].id, order: "DESC" }],
                rows: [{ id: "item-selected", cells: [
                    { value: { keyID: columns[1].id, blockID: "item-selected", number: { content: 21, isNotEmpty: true } } },
                    row("item-selected").cells[0],
                ] }], rowCount: 1,
            }, contextFilter: input === BLOCK ? { spec: 1, keyID: "relation" } : null }) });
            const chosen = config(input); chosen.source.databaseViewId = viewID;
            const loaded = await runtime.loadVisualChartData(chosen);
            assert.deepEqual(loaded.rows, [{ 标题: "item-selected", [columns[1].name]: 21 }]);
            const request = calls.find((call) => call.path.endsWith("renderAttributeView")).payload;
            assert.equal(request.viewID, viewID);
            assert.equal(request.blockID, input === BLOCK ? BLOCK : undefined);
            assert.equal(request.id, AV);
            assert.equal(request.query, undefined, "retain Kernel filters/sorts instead of substituting queries");
            assert.equal(chosen.source.databaseId, input);
            assert.deepEqual(loaded.columns, columns.map((field) => field.name));
        }
    }
    const chosen = config(BLOCK); chosen.source.databaseViewId = LIST;
    const oldMapping = { category: "标题", name: "标题", value: "数量", secondaryValue: "", values: ["数量", "评分"] };
    chosen.mapping = structuredClone(oldMapping);
    runtime.autoMapVisualChartFields(chosen, { columns: ["标题", "评分"], rows: [{ 标题: "A", 评分: 3 }], sourceLabel: "" });
    assert.equal(chosen.mapping.category, "标题");
    assert.deepEqual(chosen.mapping.values, ["评分"], "keep the still-valid custom subset");
    assert.equal(chosen.mapping.value, "评分");
    const preservedMapping = structuredClone(chosen.mapping);
    runtime.autoMapVisualChartFields(chosen, { columns: ["标题", "已改名字段"], rows: [], sourceLabel: "" });
    assert.deepEqual(chosen.mapping, preservedMapping, "zero rows cannot clear saved mapping");
    runtime.autoMapVisualChartFields(chosen, { columns: ["标题", "已改名字段"], rows: [{ 标题: "A", 已改名字段: 5 }], sourceLabel: "" });
    assert.deepEqual(chosen.mapping.values, ["已改名字段"], "deleted/renamed fields are mapped to valid columns");
    const sparseMapping = config();
    runtime.autoMapVisualChartFields(sparseMapping, { columns: ["标题", "评分"], rows: [{ 标题: null, 评分: 3 }], sourceLabel: "" });
    assert.equal(sparseMapping.mapping.category, "标题");
    assert.deepEqual(sparseMapping.mapping.values, ["评分"], "null text cells must not be classified as numerical fields");
    const stored = runtime.writeVisualChartConfigToWidgetContent({ id: "widget", data: { unrelated: "keep" } }, chosen);
    const reopened = runtime.visualChartConfigFromWidgetContent(JSON.parse(JSON.stringify(stored)));
    assert.deepEqual(reopened, runtime.normalizeVisualChartConfig(chosen));
    assert.equal(stored.data.unrelated, "keep");
    assert.equal(reopened.version, 3); assert.equal(reopened.source.databaseId, BLOCK); assert.equal(reopened.source.databaseViewId, LIST);
    const old = structuredClone(stored); delete old.data.visualChart.source.databaseViewId;
    assert.equal(runtime.visualChartConfigFromWidgetContent(old).source.databaseViewId, "");
    const legacyCalls = fixture({ definition });
    await runtime.loadVisualChartData(runtime.visualChartConfigFromWidgetContent(old));
    assert.equal(legacyCalls.find((call) => call.path.endsWith("renderAttributeView")).payload.viewID, undefined, "legacy first request still uses the carrier's active view");

    fixture({ definition: { ...definition, views: views.map((view) => ({ ...view, name: "已重命名" })) }, render: { viewID: LIST, viewType: "list", view: { columns: fields, rows: null, rowCount: 0 } } });
    assert.deepEqual((await runtime.loadVisualChartData(chosen)).rows, [], "names are not view identity; a proven empty selected view remains empty");
    fixture({ definition: { ...definition, views: defaultViews } });
    await assert.rejects(runtime.loadVisualChartData(chosen), /不存在或已删除/);
    assert.equal(chosen.source.databaseViewId, LIST, "missing view never silently overwrites config");
    fixture({ definition, renderCode: -1, renderMsg: "view not found" });
    await assert.rejects(runtime.loadVisualChartData(chosen), /不存在或已删除/);
    fixture({ definition, renderCode: -1, renderMsg: "attribute view not found" });
    await assert.rejects(runtime.loadVisualChartData(chosen), /数据库 ID.*不存在/);
    fixture({ definition, render: { viewID: VIEW, viewType: "table", view: { columns: fields, rows: [], rowCount: 0 } } });
    await assert.rejects(runtime.loadVisualChartData(chosen), /viewID.*不一致/);
    for (const viewID of [CALENDAR, GALLERY, KANBAN]) {
        const calls = fixture({ definition }); chosen.source.databaseViewId = viewID;
        await assert.rejects(runtime.loadVisualChartData(chosen), /暂不支持/);
        assert(!calls.some((call) => call.path.endsWith("renderAttributeView")), "unsupported layouts are rejected before reading rows");
    }
    fixture({ definition: { ...definition, views: [{ ...defaultViews[0], group: { field: "title" } }] } });
    chosen.source.databaseViewId = VIEW;
    await assert.rejects(runtime.loadVisualChartData(chosen), /分组视图暂不支持/);
    for (const type of ["calendar", "gallery", "kanban"]) {
        fixture({ definition, render: { viewID: VIEW, viewType: type, view: { columns: fields, rows: [row("item")], cards: [row("item")], rowCount: 1 } } });
        await assert.rejects(runtime.loadVisualChartData(chosen), /布局暂不支持/);
    }
    for (const change of ["id", "count", "sort", "filter", "context", "duplicate"]) {
        fixture({ definition, render: ({ page }) => ({ viewID: page > 1 && change === "id" ? LIST : VIEW, viewType: "table", contextFilter: { keyID: page > 1 && change === "context" ? "new" : "original" }, view: {
            columns: fields, rows: Array.from({ length: page === 1 ? 200 : 1 }, (_, index) => row(`item-${page > 1 && change === "duplicate" ? 1 : page}-${index}`)),
            rowCount: page > 1 && change === "count" ? 202 : 201,
            sorts: [{ column: "amount", order: page > 1 && change === "sort" ? "ASC" : "DESC" }],
            filters: [{ column: "amount", operator: ">", value: { type: "number", number: { content: page > 1 && change === "filter" ? 2 : 1, isNotEmpty: true } } }],
        } }) });
        const paged = config(AV, 201); paged.source.databaseViewId = VIEW;
        await assert.rejects(runtime.loadVisualChartData(paged), /发生变化|条目 ID/);
    }
    const maxCalls = fixture({ definition, rows: Array.from({ length: 5100 }, (_, index) => row(`max-${index}`)) });
    assert.equal((await runtime.loadVisualChartData(config(AV, 9000))).rows.length, 5000);
    assert.equal(maxCalls.filter((call) => call.path.endsWith("renderAttributeView")).length, 25);
    assert(maxCalls.filter((call) => call.path.endsWith("renderAttributeView")).slice(1).every((call) => call.payload.viewID === VIEW));
    runtime.setSiyuanRuntimePort({ async post(path) {
        if (path === "/api/query/sql") return { code: 0, data: [{ title: "文档", updated: "20261010" }] };
        assert.equal(path, "/api/tag/getTag"); return { code: 0, data: [{ label: "标签", count: 2 }] };
    } });
    manual.source.type = "documents";
    assert.equal((await runtime.loadVisualChartData(manual)).rows[0].title, "文档");
    manual.source.type = "tags";
    assert.deepEqual((await runtime.loadVisualChartData(manual)).rows, [{ name: "标签", count: 2 }]);
    console.log("PASS visual charts: official view metadata, explicit table/list selection, layouts/group rejection, context/read-only, stable IDs, mapping/config round-trip, nullable rows, changed paging, 5000-row cap, all legacy sources");
}
