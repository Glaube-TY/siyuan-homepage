import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compile, parse } from "svelte/compiler";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const componentPath = resolve(root, "src/components/utils/widgetBlock/widget/visualChart/VisualChartConsole.svelte");
const source = await readFile(componentPath, "utf8");
const nodes = parse(source, { modern: true }).instance.content.body;
const functions = nodes.filter((node) => node.type === "FunctionDeclaration");
const effects = nodes.filter((node) => node.expression?.callee?.name === "$effect");
const destroy = nodes.find((node) => node.expression?.callee?.name === "onDestroy").expression.arguments[0];
const snippet = (node) => source.slice(node.start, node.end);
// Execute the actual Console handlers/effects with deterministic timers, not a second implementation.
const output = await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { autoMapVisualChartFields, normalizeVisualChartConfig } from "./src/features/visual-chart/visual-chart-config";
        import { loadVisualChartDatabaseViews, loadVisualChartData } from "./src/features/visual-chart/visual-chart-data";
        export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port";
        export { createDefaultVisualChartConfig } from "./src/features/visual-chart/visual-chart-config";
        export { render } from "svelte/server";
        export { default as Console } from "./src/components/utils/widgetBlock/widget/visualChart/VisualChartConsole.svelte";
        export function studio(initial) {
            let config = normalizeVisualChartConfig(initial), dataset = {columns:[],rows:[],sourceLabel:""};
            let loading = false, saving = false, error = "", destroyed = false;
            let reloadGeneration = 0, viewsGeneration = 0, reloadTimer = null, viewsTimer = null;
            let databaseViews = [], viewsLoading = false, viewsError = "", sourceSignature = "";
            let saved = null, closed = false, timerId = 0;
            const timers = new Map();
            const setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id,{callback,delay}); return id; };
            const clearTimeout = (id) => timers.delete(id);
            const onSave = async (value) => { saved = value; }, onClose = () => {closed = true;}, showMessage = () => {};
            ${functions.map(snippet).join("\n")}
            return {
                config, syncSource: ${snippet(effects[0].expression.arguments[0])}, syncViews: ${snippet(effects[1].expression.arguments[0])},
                reload, reloadViews, save, dispose: ${snippet(destroy)},
                flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(({callback}) => callback()); },
                get delays() { return [...timers.values()].map(({delay}) => delay); },
                get snapshot() { return {databaseViews,viewsLoading,viewsError,dataset,error,loading,saved,closed}; }
            };
        }
    ` }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "chart-view-console-fixture", setup(builder) {
        builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({ path: import.meta.resolve(path), external: true }));
        builder.onResolve({ filter: /^siyuan$/ }, () => ({ path: "siyuan", namespace: "chart-fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "chart-fixture" }, () => ({ contents: "export const showMessage = () => {};", loader: "js" }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
            let component = path === componentPath ? source : "<span></span>"; // Canvas/style/icon rendering is outside this verifier.
            if (path === componentPath) {
                const edits = [];
                for (const node of nodes) {
                    if (node.type !== "VariableDeclaration") continue;
                    for (const declaration of node.declarations) if (["databaseViews","viewsLoading","viewsError"].includes(declaration.id.name)) {
                        const argument = declaration.init.arguments[0];
                        edits.push({start:argument.start,end:argument.end,value:`globalThis.__chartViewRender.${declaration.id.name}`});
                    }
                }
                for (const edit of edits.sort((a,b) => b.start-a.start)) component = component.slice(0,edit.start)+edit.value+component.slice(edit.end);
            }
            return { contents: compile(component, {filename:path,generate:"server",css:"external"}).js.code, loader:"js",resolveDir:dirname(path) };
        });
    } }],
});
const rt = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const A = "20261010130000-aaaaaaa", B = "20261010130001-bbbbbbb";
const TABLE = "20261010130002-ttttttt", LIST = "20261010130003-lllllll", CALENDAR = "20261010130004-ccccccc";
const views = [{id:TABLE,name:"总览",type:"table"},{id:LIST,name:"任务清单",type:"list"},{id:CALENDAR,name:"本月安排",type:"calendar"}];
const columns = [{id:"title",name:"标题",type:"block"},{id:"value",name:"数值",type:"number"}];
const calls = [];
let definitionReply = async (id) => ({id,name:id,views,keyValues:columns.map((key) => ({key}))});
let renderReply = async ({viewID}) => ({viewID:viewID || TABLE,viewType:viewID === LIST ? "list" : "table",view:{columns,rows:null,rowCount:0}});
rt.setSiyuanRuntimePort({async post(path,payload) {
    calls.push({path,payload});
    if (path === "/api/query/sql") return {code:0,data:[]};
    if (path === "/api/av/getAttributeView") return {code:0,data:{av:await definitionReply(payload.id)}};
    assert.equal(path,"/api/av/renderAttributeView");
    assert.equal(payload.createIfNotExist,false); assert.equal(payload.persistView,false);
    return {code:0,data:await renderReply(payload)};
}});
const settle = async () => { for (let i=0;i<5;i++) await new Promise((done) => setImmediate(done)); };
const initial = rt.createDefaultVisualChartConfig(); initial.source.type = "database"; initial.source.databaseId = A;
const studio = rt.studio(initial);
studio.syncViews(); assert.deepEqual(studio.delays,[450]); assert.equal(calls.length,0,"debounce cannot issue an immediate request");
studio.config.source.databaseId = "2026"; studio.syncViews();
assert.deepEqual(studio.delays,[]); assert.match(studio.snapshot.viewsError,/ID 无效/);
studio.config.source.databaseId = B; studio.syncViews(); studio.flush(); await settle();
assert.equal(calls.filter((call) => call.path.endsWith("getAttributeView")).length,1);
assert.equal(calls.find((call) => call.path.endsWith("getAttributeView")).payload.id,B);
assert.equal(studio.snapshot.databaseViews[1].id,LIST);

let release;
definitionReply = (id) => new Promise((done) => release = () => done({id,name:id,views,keyValues:columns.map((key) => ({key}))}));
const stale = studio.reloadViews(B); await settle();
studio.config.source.databaseId = A; studio.syncViews(); release(); await stale;
assert.deepEqual(studio.snapshot.databaseViews,[],"previous database response cannot update the debounce window");
definitionReply = async (id) => ({id,name:id,views,keyValues:columns.map((key) => ({key}))});
studio.flush(); await settle();
assert.equal(studio.snapshot.databaseViews.length,3);
studio.config.source.databaseViewId = LIST; studio.syncSource(); studio.flush(); await settle();
assert.equal(calls.filter((call) => call.path.endsWith("renderAttributeView")).at(-1).payload.viewID,LIST);
assert.equal(studio.config.source.databaseViewId,LIST);
renderReply = () => new Promise((done) => release = () => done({viewID:LIST,viewType:"list",view:{columns,rows:null,rowCount:0}}));
const stalePreview = studio.reload(); await settle();
studio.config.source.databaseViewId = TABLE; studio.syncSource(); release(); await stalePreview;
assert.equal(studio.snapshot.error,"", "stale preview is isolated while changing view");
assert.equal(studio.config.source.databaseViewId,TABLE);
renderReply = async ({viewID}) => ({viewID,viewType:"table",view:{columns,rows:null,rowCount:0}});
studio.flush(); await settle();
studio.config.source.databaseViewId = "20261010130005-ddddddd";
await studio.reload(); assert.match(studio.snapshot.error,/不存在或已删除/);
await studio.save(); assert.equal(studio.snapshot.saved.source.databaseViewId,studio.config.source.databaseViewId);
assert.equal(studio.snapshot.closed,true);
definitionReply = async () => {throw new Error("permission denied");};
await studio.reloadViews(A); assert.match(studio.snapshot.viewsError,/定义读取失败/);
definitionReply = async (id) => ({id,name:id,views,keyValues:columns.map((key) => ({key}))});
await studio.reloadViews(A); assert.equal(studio.snapshot.viewsError,"");

const leaving = rt.studio(initial); leaving.syncViews(); leaving.config.source.type = "manual"; leaving.syncViews();
assert.deepEqual(leaving.delays,[]); assert.deepEqual(leaving.snapshot.databaseViews,[]);
definitionReply = (id) => new Promise((done) => release = () => done({id,views,keyValues:columns.map((key) => ({key}))}));
const disposed = rt.studio(initial), pending = disposed.reloadViews(A); await settle();
const before = structuredClone(disposed.snapshot); disposed.dispose(); release(); await pending;
assert.deepEqual(disposed.snapshot,before,"destroyed Console must not update async state");
assert.deepEqual(disposed.delays,[]);

function html(snapshot, config = initial) {
    globalThis.__chartViewRender = snapshot;
    return rt.render(rt.Console,{props:{initialConfig:config,onSave:async()=>{},onClose:()=>{}}}).body;
}
const available = studio.snapshot.databaseViews;
assert(html({databaseViews:available,viewsLoading:false,viewsError:""}).includes("任务清单 · 列表"));
assert(html({databaseViews:available,viewsLoading:false,viewsError:""}).includes("本月安排 · 日历（暂不支持）"));
assert(html({databaseViews:[],viewsLoading:true,viewsError:""}).includes("正在读取数据库视图"));
assert(html({databaseViews:[],viewsLoading:false,viewsError:"权限读取失败"}).includes("重试读取视图"));
const missing = structuredClone(initial); missing.source.databaseViewId = "20261010130005-ddddddd";
assert(html({databaseViews:available,viewsLoading:false,viewsError:""},missing).includes("原配置已保留"));
console.log("PASS chart views Console: actual debounce/handlers, invalid ID, old requests, view changes/preview, missing selection/save, retry, disposal, real selector/status markup");
