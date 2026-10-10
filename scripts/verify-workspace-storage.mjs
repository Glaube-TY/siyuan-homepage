import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { parse, compile } from "svelte/compiler";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = "src/homepage/homepageSetting/tabs/WorkspaceStorageSettingsSection.svelte";
const source = await readFile(resolve(root, componentPath), "utf8");
const ast = parse(source, { modern: true });
const handler = ast.instance.content.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === "loadStorage");
const cleanup = ast.instance.content.body.find((node) => node.expression?.callee?.name === "onDestroy").expression.arguments[0];
assert(handler && cleanup);
const output = await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { getWorkspaceStorageChecked } from "./src/api";
        import { workspaceStorageFailure } from "./src/homepage/homepageSetting/tabs/workspaceStorage";
        export { getWorkspaceStorageChecked, parseWorkspaceStorageData, WorkspaceStorageReadError, SiyuanApiError, WORKSPACE_STORAGE_DIRECTORIES } from "./src/api";
        export { formatStorageSize, formatStorageTime, workspaceStorageFailure } from "./src/homepage/homepageSetting/tabs/workspaceStorage";
        export { render } from "svelte/server";
        export { default as Section } from "./${componentPath}";
        export function section() {
            let result = null, busy = false, failure = "", alive = true, controller = null;
            ${source.slice(handler.start, handler.end)}
            return { load: loadStorage, dispose: ${source.slice(cleanup.start, cleanup.end)},
                get snapshot() { return {result, busy, failure}; } };
        }
    ` }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "storage-fixture", setup(builder) {
        builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({ path: import.meta.resolve(path), external: true }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
            let component = await readFile(path, "utf8");
            if (path === resolve(root, componentPath)) {
                // Inject state into the real renderer, without substituting its markup or event handler.
                const edits = [], states = ["result", "busy", "failure"];
                for (const node of parse(component, { modern: true }).instance.content.body) {
                    if (node.type !== "VariableDeclaration") continue;
                    for (const declaration of node.declarations) if (states.includes(declaration.id.name)) {
                        const argument = declaration.init.arguments[0];
                        edits.push({ start: argument.start, end: argument.end, value: `globalThis.__storageRender.${declaration.id.name}` });
                    }
                }
                for (const edit of edits.sort((a,b) => b.start-a.start)) component = component.slice(0,edit.start)+edit.value+component.slice(edit.end);
            }
            return { contents: compile(component, { filename: path, generate: "server", css: "external" }).js.code, loader: "js", resolveDir: dirname(path) };
        });
    } }],
});
const rt = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const normal = { totalSize: 10240, assetsSize: 4096, calculatedAt: 1791561600000,
    directories: [6144,1024,1024,1024,512,512].map((size,index) => ({name:rt.WORKSPACE_STORAGE_DIRECTORIES[index],size})) };
const zero = {...normal,totalSize:0,assetsSize:0,directories:normal.directories.map((entry)=>({...entry,size:0}))};
assert.deepEqual(rt.parseWorkspaceStorageData(normal),normal);
assert.deepEqual(rt.parseWorkspaceStorageData(zero),zero);
assert.equal(rt.parseWorkspaceStorageData(normal).totalSize,10240,"assets must not be added to total");
for (const [bytes,expected] of [[0,"0 B"],[1023,"1023 B"],[1024,"1 KB"],[1536,"1.5 KB"],[1024**2,"1 MB"],[1024**3,"1 GB"],[5.25*1024**4,"5.25 TB"]]) {
    assert.equal(rt.formatStorageSize(bytes),expected);
}
assert(rt.formatStorageTime(normal.calculatedAt).includes("2026"));
for (const field of ["totalSize","assetsSize","calculatedAt","directories"]) {
    const missing = structuredClone(normal); delete missing[field];
    assert.throws(()=>rt.parseWorkspaceStorageData(missing),rt.WorkspaceStorageReadError);
}
for (const value of [null,undefined,{},[],
    {...normal,totalSize:-1},{...normal,assetsSize:-1},{...normal,calculatedAt:-1},
    {...normal,totalSize:NaN},{...normal,totalSize:Infinity},{...normal,totalSize:1.5},
    {...normal,totalSize:"10240"},{...normal,calculatedAt:Number.MAX_SAFE_INTEGER},
    {...normal,directories:null},{...normal,directories:[]},
    {...normal,directories:[null,...normal.directories.slice(1)]},
    {...normal,directories:normal.directories.map((entry)=>({...entry,name:"unknown"}))},
    {...normal,directories:normal.directories.map((entry)=>({...entry,size:-1}))},
    {...normal,totalSize:10241},{...normal,assetsSize:7000}]) {
    assert.throws(()=>rt.parseWorkspaceStorageData(value),rt.WorkspaceStorageReadError);
}

const calls=[];
const response = (data,status=200) => ({ok:status>=200&&status<300,status,json:async()=>data});
let reply = async()=>response({code:0,msg:"",data:normal});
globalThis.fetch = async (url,options) => {
    assert.equal(url,"/api/system/getWorkspaceStorage","only the official readonly API is permitted");
    assert.equal(options.method,"POST"); assert.equal(options.body,undefined);
    assert.equal(options.credentials,"same-origin");
    calls.push({url,options});
    return reply(options);
};
globalThis.window = {require(){assert.fail("must not depend on Electron or filesystem");}};
const section = rt.section();
globalThis.__storageRender = section.snapshot;
assert(rt.render(rt.Section).body.includes("点击获取工作空间存储统计"));
assert.equal(calls.length,0,"initial render/section creation must not scan");
await section.load(); assert.deepEqual(section.snapshot.result,normal); assert.equal(calls.length,1);
await section.load(); assert.equal(calls.length,2,"manual refresh must be allowed");
let release;
reply = ()=>new Promise((resolveResponse)=>release=resolveResponse);
const pending=section.load(); await section.load();
assert.equal(calls.length,3,"duplicate clicks must not send a second request");
assert.equal(section.snapshot.busy,true); release(response({code:0,data:zero})); await pending;
assert.deepEqual(section.snapshot.result,zero); assert.equal(section.snapshot.busy,false);

for (const bad of [null,undefined,{},{code:"0",data:normal},{code:0,data:null},{code:0,data:{...normal,totalSize:-2}}]) {
    reply=async()=>response(bad);
    await assert.rejects(rt.getWorkspaceStorageChecked(),(error)=>error.kind==="response");
}
reply=async()=>response({code:73,msg:"failure",data:null});
await assert.rejects(rt.getWorkspaceStorageChecked(),(error)=>error instanceof rt.SiyuanApiError&&error.siyuanCode===73);
reply=async()=>({ok:false,status:403,json:async()=>{throw new SyntaxError("empty official 403 body");}});
await assert.rejects(rt.getWorkspaceStorageChecked(),(error)=>error.kind==="permission"&&error.httpStatus===403);
await section.load(); assert(section.snapshot.failure.includes("管理员")); assert.deepEqual(section.snapshot.result,zero);
reply=async()=>response({code:-1,msg:"Auth failed [session]"},401);
await assert.rejects(rt.getWorkspaceStorageChecked(),(error)=>error.kind==="permission"&&error.siyuanCode===-1);
reply=async()=>{throw new TypeError("Failed to fetch");};
await section.load(); assert(section.snapshot.failure.includes("Kernel 连接失败")); assert.deepEqual(section.snapshot.result,zero);
reply=async()=>response({code:-1,msg:"failed to calculate workspace storage",data:null});
await section.load(); assert(section.snapshot.failure.includes("扫描失败")); assert.deepEqual(section.snapshot.result,zero);
globalThis.__storageRender=section.snapshot;
const failedHtml=rt.render(rt.Section).body;
assert(failedHtml.includes("刷新失败")); assert(failedHtml.includes("上一次成功结果")); assert(failedHtml.includes("统计时间"));
assert(failedHtml.includes("0 B"),"previous verified zero-byte result remains, not a failure converted to zero");
reply=async()=>response(null,404);
await assert.rejects(rt.getWorkspaceStorageChecked(),(error)=>error.kind==="unsupported");
reply=async()=>response(null,503);
await assert.rejects(rt.getWorkspaceStorageChecked(),(error)=>error.kind==="connection");

const originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
let fireTimeout,cleared=false;
try {
    globalThis.setTimeout=(callback,milliseconds)=>{assert.equal(milliseconds,150000);fireTimeout=callback;return 1;};
    globalThis.clearTimeout=()=>{cleared=true;};
    reply=({signal})=>new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("aborted","AbortError")),{once:true}));
    const timed=rt.getWorkspaceStorageChecked(); fireTimeout();
    await assert.rejects(timed,(error)=>error.kind==="timeout"&&rt.workspaceStorageFailure(error).includes("超时"));
    assert(cleared);
} finally {globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;}

reply=()=>new Promise((resolveResponse)=>release=resolveResponse);
const closed=rt.section(),closedPending=closed.load();
const beforeClose=structuredClone(closed.snapshot); closed.dispose();
assert(calls.at(-1).options.signal.aborted,"closing the section aborts the frontend request");
release(response({code:0,data:normal})); await closedPending;
assert.deepEqual(closed.snapshot,beforeClose,"late success must not update destroyed state");
reply=({signal})=>new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("aborted","AbortError")),{once:true}));
const closedError=rt.section(),closedErrorPending=closedError.load();
const beforeError=structuredClone(closedError.snapshot); closedError.dispose(); await closedErrorPending;
assert.deepEqual(closedError.snapshot,beforeError,"late failure must not update destroyed state");
const noCalls=calls.length; await closed.load(); assert.equal(calls.length,noCalls);
globalThis.__storageRender={result:normal,busy:false,failure:""};
const html=rt.render(rt.Section).body;
for(const name of rt.WORKSPACE_STORAGE_DIRECTORIES) assert(html.includes(`（${name}）`));
assert(html.includes("10 KB")); assert(html.includes("4 KB")); assert(html.includes("统计成功"));
assert(html.includes("已包含在 data 与总占用中")); assert(html.includes("远程 Kernel"));
console.log("PASS workspace storage: official readonly POST, actual parser/formatter/Svelte handler and renderer, zero/subset/large capacity, malformed payloads, HTTP permissions/network/API/scan/timeout, manual-only single-flight refresh, stale result and disposal protection; no writes or Electron");
