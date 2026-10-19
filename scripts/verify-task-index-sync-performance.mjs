import assert from "node:assert/strict";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parse } from "svelte/compiler";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PATH = "/data/storage/petal/siyuan-homepage/task-index.json";
const baseline = process.argv.includes("--baseline");
async function schedulingMethods(path, names) {
    const source = await readFile(resolve(root, path), "utf8");
    const ast = parse(source.slice(0,source.lastIndexOf("<style")), {modern:true});
    return names.map(name=>{const node=ast.instance.content.body.find(node=>node.type==="FunctionDeclaration"&&node.id.name===name);assert(node);return source.slice(node.start,node.end);}).join("\n");
}
const workspaceMethods = await schedulingMethods("src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspacePage.svelte",["scheduleExternalWorkspaceRefresh","handleTaskDataUpdated"]);
const homepageMethods = await schedulingMethods("src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiary.svelte",["scheduleHomepageSnapshotRefresh","handleTaskDataUpdated"]);
const stubs = {
    "favorites-store": ["addFavoriteItem", "removeFavoriteItem", "removeFavoriteItemsByIds", "reorderFavoriteItems", "readFavoritesIndexStrict", "doesFavoritesIndexExist"],
    "notification-center-mobile-plan-manager": ["requestMobilePlanRefresh"],
    "notification-center-locks": ["withNotificationLock"],
    "enhancedDiaryIndex": ["getDiaryIndexEntriesForDisplay", "resolveEnhancedDiaryDateFromMetadata"],
};
const bundle = await build({
    stdin: { contents: `export * from "./src/components/tools/siyuanComponentDataApi";
        export * from "./src/features/task-data/task-data-runtime";
        export {loadTaskData} from "./src/features/task-data/task-data-service";
        export {loadEnhancedDiaryHomepageSnapshot} from "./src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryHomepageSnapshot";
        export {normalizeEnhancedDiaryConfig} from "./src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
        export * from "./src/runtime/siyuan-runtime-port";
        export * from "./src/utils/performance/runtimePerformance";
        ${baseline ? "const recordTaskIndexMetric=()=>{};" : 'import {recordTaskIndexMetric} from "./src/utils/performance/runtimePerformance";'}
        export function workspaceScheduler() {
            let advancedEnabled=true,actionBusy=false,externalWorkspaceRefreshPending=false,taskIndexRefreshPending=false,refreshTimer=null,indexRefreshTimer=null,refreshFlight=null,runs=0;
            const window=globalThis.window,refresh=async()=>{runs++;};
            ${workspaceMethods}
            return {event:handleTaskDataUpdated,get runs(){return runs;}};
        }
        export function homepageScheduler() {
            let advancedEnabled=true,config={},snapshotRefreshFrame=null,taskIndexRefreshPending=false,runs=0;
            const window=globalThis.window,loadHomepageSnapshot=async()=>{runs++;};
            ${homepageMethods}
            return {event:handleTaskDataUpdated,get runs(){return runs;}};
        }`, loader: "ts", resolveDir: root },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "unrelated-side-effects", setup(api) {
        if (baseline) api.onLoad({filter:/[\\/]siyuanComponentDataApi\.ts$|[\\/]task-data-runtime\.ts$|[\\/]runtimePerformance\.ts$/}, ({path}) => ({
            contents: execFileSync("git", ["show", `6c8868c4efb4ea04b55161cc7121b00b951617d7:${path.slice(root.length+1).replaceAll("\\", "/")}`], {cwd:root,encoding:"utf8"}), loader:"ts", resolveDir:resolve(path,".."),
        }));
        api.onResolve({ filter: /favorites-store$|notification-center-mobile-plan-manager$|notification-center-locks$|enhancedDiaryIndex$/ }, ({path}) => ({ path: path.split("/").at(-1), namespace: "fixture" }));
        api.onResolve({filter:/enhancedDiaryDoc$/},()=>({path:"diary-read",namespace:"fixture"}));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, ({path}) => ({ contents: path==="diary-read"
            ? 'export const lookupDiaryDocumentForDate=async()=>({status:"missing",docId:""});'
            : stubs[path].map((name) => `export const ${name}=()=>{};`).join("\n"), loader: "js" }));
    } }],
});
let sequence = 0;
async function fixture(items = [task(1)]) {
    const app = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${sequence++}`);
    const state = { text: JSON.stringify({ version: 1, updatedAt: "20261001000000", items }, null, 2), reads: 0, writes: 0, bytes: 0, sql: [], blockChecks: [], blocks: new Map(items.map(t => [t.id, t])), readError: false, sqlError: false };
    app.setSiyuanRuntimePort({
        async getFile(path) {
            assert.equal(path, PATH);
            state.reads++;
            if (state.readError) throw Error("synthetic file unavailable");
            if (state.readResponse !== undefined) return state.readResponse;
            return state.text === null ? { code: 404 } : state.text;
        },
        async putFile(path, dir, blob) {
            if (dir) return { code: 0 };
            assert.equal(path, PATH, "no other data domain may be written");
            if (state.writeError) return {code:-1,msg:"synthetic write error"};
            state.activeWrites = (state.activeWrites || 0) + 1;
            assert.equal(state.activeWrites, 1, "writes must be serialized");
            state.writes++; state.bytes += blob.size;
            if (state.writeGate) await state.writeGate;
            if (!state.dropWrite) state.text = await blob.text();
            state.activeWrites--;
            return { code: 0 };
        },
        async post(path, data) {
            if (path === "/api/query/sql") {
                state.sql.push(data.stmt);
                const sqlItems=[...state.blocks.values()];
                if (state.sqlGate) await state.sqlGate;
                if (state.sqlError) return { code: -1, msg: "synthetic SQL unavailable" };
                if ("sqlResponse" in state) return {code:0,data:state.sqlResponse};
                const roots = /root_id IN \(([^)]+)\)/.exec(data.stmt)?.[1].match(/'([^']+)'/g)?.map(s => s.slice(1,-1));
                const offset = Number(/OFFSET (\d+)/i.exec(data.stmt)?.[1] || 0);
                const limit = Number(/LIMIT (\d+)/i.exec(data.stmt)?.[1] || 2000);
                return { code: 0, data: sqlItems.filter(t => !roots || roots.includes(t.root_id)).slice(offset, offset+limit) };
            }
            if (path === "/api/block/checkBlockExist") {
                state.blockChecks.push(data.id);
                if (state.blockError) return {code:-1,msg:"synthetic block API error"};
                if ("blockCheckResponse" in state) return {code:0,data:state.blockCheckResponse};
                return { code: 0, data: state.blocks.has(data.id) };
            }
            if (state.blockError) return {code:-1,msg:"synthetic block API error"};
            if (path === "/api/block/getBlockInfo") return { code: 0, data: { rootID: state.blocks.get(data.id)?.root_id } };
            if (path === "/api/block/getBlockTreeInfos") return { code: 0, data: Object.fromEntries(data.ids.map(id => [id, {type: "NodeListItem"}])) };
            if (path === "/api/block/getBlockKramdowns") return { code: 0, data: Object.fromEntries(data.ids.map(id => [id, state.blocks.get(id)?.markdown])) };
            throw Error(`unexpected endpoint: ${path}`);
        },
    });
    return { app, state };
}
function task(n, extra = {}) {
    return { id: `20261001000000-${String(n).padStart(7,"0")}`, root_id: "20261001000000-root001", rootID: "20261001000000-root001", parent_id: "20261001000000-parent1", parentID: "20261001000000-parent1", box: "20261001000000-box0001", path: "/fixture.sy", hpath: "/fixture", type: "i", subtype: "t", markdown: "- [ ] fixture", content: "fixture", checked: false, created: "20261001000000", updated: "20261001000000", indexedAt: "2026-01-01T00:00:00.000Z", ...extra };
}
const measurements = [];
for (const kind of ["targeted-noop", "broad-noop", "targeted+broad-change"]) {
    const items = Array.from({length: 4500}, (_, i) => task(i+1, {markdown: `- [ ] ${"fixture ".repeat(20)}${i}`, content: "fixture ".repeat(20).trim()}));
    const {app,state} = await fixture(items);
    const inputBytes = Buffer.byteLength(state.text);
    assert(inputBytes >= 3_000_000);
    if (kind.endsWith("change")) state.blocks.set(items[0].id, {...items[0], checked: true, markdown: items[0].markdown.replace("[ ]", "[x]")});
    const start = performance.now();
    if (!baseline && kind.includes("+")) assert.equal((await app.refreshTaskIndexAfterDatabaseCommit([items[0].root_id], {broad:true})).lastStatus,"success");
    else {
        if (kind.startsWith("targeted")) assert.equal((await app.refreshTaskIndexByRootIds([items[0].root_id])).lastStatus, "success");
        if (kind.includes("broad")) assert.equal((await app.refreshTaskIndexAfterBroadCommit()).lastStatus, "success");
    }
    if (!baseline) {
        assert.equal(state.writes, kind.endsWith("change") ? 1 : 0);
        assert.equal(state.reads, kind.endsWith("change") ? 2 : 1, "includes required write verification");
    }
    measurements.push({ kind, inputBytes, reads: state.reads, writes: state.writes, writeBytes: state.bytes, elapsedMs: +(performance.now()-start).toFixed(1) });
}
console.log(JSON.stringify({mode:baseline?"baseline":"optimized", measurements}, null, 2));
if (baseline) process.exit(0);

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
function rows(state) { return JSON.parse(state.text).items; }
function gate() { let release; const promise = new Promise(resolve => {release=resolve;}); return {promise, release}; }
async function settle() { for (let n=0;n<80;n++) await new Promise(resolve=>setImmediate(resolve)); }
function runtime(app) {
    const timers = new Map(), listeners = new Set(), events = [], delays = [];
    let id=0;
    globalThis.window = {setTimeout(callback,delay) {delays.push(delay);timers.set(++id,callback);return id;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(callback){timers.set(++id,callback);return id;},dispatchEvent(event){events.push(event);}};
    const plugin={eventBus:{on(name,callback){assert.equal(name,"ws-main");listeners.add(callback);},off(name,callback){listeners.delete(callback);}}};
    app.startTaskDataRuntime(plugin);
    app.taskIndexDiagnostics.reset(); app.taskIndexDiagnostics.enable();
    return {plugin,timers,events,delays,
        emit(roots, broad=false) {for(const callback of listeners) callback({detail:{cmd:"databaseIndexCommit",data:{rootIDs:roots,backlinkFull:broad}}});},
        raw(detail) {for(const callback of listeners) callback({detail});},
        async tick(){const pending=[...timers.values()];timers.clear();for(const callback of pending)callback();await settle();},
        stop(){app.destroyTaskDataRuntime();assert.equal(timers.size,0);assert.equal(listeners.size,0);},
    };
}

await test("A: 20 identical commits coalesce; no-op does not write", async()=>{
    const {app,state}=await fixture(), rt=runtime(app);
    for(let n=0;n<20;n++)rt.emit([task(1).root_id]);
    await rt.tick();
    assert.equal(state.sql.length,1);assert.equal(state.reads,1);assert.equal(state.writes,0);
    const metrics=app.taskIndexDiagnostics.snapshot();assert.equal(metrics.databaseCommits,20);assert.equal(metrics.rootsReceived,20);assert.equal(metrics.rootsProcessed,1);
    assert.equal(rt.events.length,0);rt.stop();assert.equal(rt.plugin.taskIndexDiagnostics,undefined);
});
await test("B: distinct root IDs are retained and deduplicated", async()=>{
    const second=task(2,{root_id:"20261001000000-root002",rootID:"20261001000000-root002"});
    const {app,state}=await fixture([task(1),second]),rt=runtime(app);
    rt.emit([task(1).root_id,task(1).root_id]);rt.emit([second.root_id]);await rt.tick();
    assert.equal(state.sql.length,1);assert(state.sql[0].includes(second.root_id));assert(state.sql[0].includes(task(1).root_id));rt.stop();
});
await test("continuous commits cannot postpone persistence indefinitely",async()=>{
    const {app}=await fixture(),rt=runtime(app),original=Date.now;let now=original();Date.now=()=>now;
    try {rt.emit([task(1).root_id]);for(let n=0;n<11;n++){now+=100;rt.emit([task(1).root_id]);}assert.equal(rt.delays.at(-1),0);await rt.tick();}
    finally {Date.now=original;rt.stop();}
});
await test("C: a commit during an in-flight refresh receives a trailing batch",async()=>{
    const {app,state}=await fixture(),rt=runtime(app),hold=gate();state.sqlGate=hold.promise;
    rt.emit([task(1).root_id]);await rt.tick();assert.equal(state.sql.length,1);
    state.blocks.set(task(1).id,task(1,{markdown:"- [x] trailing",checked:true}));
    rt.emit([task(1).root_id]);await rt.tick();assert.equal(state.sql.length,1);
    state.sqlGate=null;hold.release();await settle();await rt.tick();assert.equal(state.sql.length,2);assert.equal(rows(state)[0].markdown,"- [x] trailing");assert.equal(state.writes,1);rt.stop();
});
await test("D/F: duplicate input and metadata-only changes skip full writes",async()=>{
    const {app,state}=await fixture();await app.mergeTaskIndexItems([task(1),task(1)]);
    await app.mergeTaskIndexItems([{...task(1),source:"other",indexedAt:new Date().toISOString()}]);
    assert.equal(state.writes,0);
    await app.mergeTaskIndexItems([{id:task(1).id,checked:true},{id:task(1).id,markdown:"- [x] combined"}]);
    assert.equal(rows(state)[0].checked,true);assert.equal(rows(state)[0].markdown,"- [x] combined");state.writes=0;
    const empty=task(1,{updated:""});state.text=JSON.stringify({version:1,items:[empty]});await app.mergeTaskIndexItems([empty]);assert.equal(state.writes,0,"missing updated must not become current time on every refresh");
});
await test("E/Q: one-task changes preserve all other rows and every semantic field",async()=>{
    const {app,state}=await fixture([task(1),task(2)]);
    const changes=[{checked:true},{markdown:"- [x] changed"},{content:"changed"},{created:"20260102000000"},{updated:"20261002000000"},{hpath:"/other"},{path:"/other.sy"},{box:"20261001000000-box0002"},{parent_id:"20261001000000-other01",parentID:"20261001000000-other01"},{ial:'custom-deadline="2026-10-20"'},{projectTargetId:"20261001000000-proj001"},{hiddenProjectTargetId:"20261001000000-proj002"},{visibleProjectTargetId:"20261001000000-proj003"},{rootProjectId:"20261001000000-proj004"},{projectPath:["20261001000000-proj004"]},{projectRelationStatus:"normal"}];
    for(const change of changes){const previous=rows(state),writes=state.writes;await app.updateTaskIndexItem({id:task(1).id,...change});const next=rows(state);assert.equal(state.writes,writes+1);assert.deepEqual(next.find(t=>t.id===task(2).id),previous.find(t=>t.id===task(2).id));for(const [key,value]of Object.entries(change))assert.deepEqual(next.find(t=>t.id===task(1).id)[key],value);}
});
await test("G/H: targeted+broad share reads/verification and delete only confirmed invalid tasks",async()=>{
    const removed=task(2,{root_id:"20261001000000-root002",rootID:"20261001000000-root002"});
    const {app,state}=await fixture([task(1),removed]);state.blocks.delete(removed.id);state.blocks.set(task(1).id,task(1,{markdown:"- [x] fixture",checked:true}));
    const result=await app.refreshTaskIndexAfterDatabaseCommit([task(1).root_id],{broad:true});
    assert.equal(result.lastStatus,"success");assert.equal(result.removedCount,1);assert.equal(state.reads,2);assert.equal(state.writes,1);assert.deepEqual(rows(state).map(t=>t.id),[task(1).id]);assert(!state.blockChecks.includes(task(1).id),"SQL-confirmed rows must not repeat block verification");
    assert.equal(rows(state)[0].indexedAt,task(1).indexedAt,"SQL refresh must preserve first-indexed time");
});
await test("I/T: SQL and block API failures never become deletion evidence",async()=>{
    const {app,state}=await fixture();const original=state.text;state.sqlError=true;
    assert.equal((await app.refreshTaskIndexByRootIds([task(1).root_id])).lastStatus,"error");assert.equal(state.text,original);assert.equal(state.writes,0);
    state.sqlError=false;state.blockError=true;state.blocks.clear();
    await app.refreshTaskIndexAfterDatabaseCommit([task(1).root_id],{broad:true});assert.equal(state.writes,0);assert.equal(rows(state).length,1);
    assert.equal(state.blockChecks.length,3,"targeted and broad must share failed block verification");
    state.blocks.set(task(1).id,task(1));state.blockError=false;
    assert.equal((await app.refreshTaskIndexByRootIds([task(1).root_id])).lastStatus,"success");assert.equal(state.writes,0);
});
await test("malformed SQL/block success data is unknown, never confirmed absence",async()=>{
    for(const value of [null,{},"bad"]){const {app,state}=await fixture();state.sqlResponse=value;
        assert.equal((await app.refreshTaskIndexByRootIds([task(1).root_id])).lastStatus,"error");assert.equal(state.writes,0);
        delete state.sqlResponse;state.blocks.clear();state.blockCheckResponse=value;
        await app.refreshTaskIndexAfterBroadCommit();assert.equal(state.writes,0);assert.equal(rows(state).length,1);
    }
});
await test("J/T: read failures, permissions, malformed payloads and versions reject without writes",async()=>{
    for(const invalid of [null,undefined,"", "{broken", "null", "{}", JSON.stringify({version:2,items:[]}),JSON.stringify({version:1,items:[null]}),JSON.stringify({version:1,items:[{id:task(1).id,markdown:4}]}),{code:-1,msg:"unavailable"},{code:403,msg:"forbidden"}]){
        const {app,state}=await fixture();const original=state.text;
        if(invalid===undefined)state.readError=true;else state.readResponse=invalid;
        await assert.rejects(app.mergeTaskIndexItems([task(2)]));await assert.rejects(app.removeTaskIndexItem(task(1).id));await assert.rejects(app.ensureTaskIndexInitialized({}));
        assert.equal(state.writes,0);assert.equal(state.text,original);
    }
});
await test("K: unload cancels before writes; a new runtime cannot revive old work",async()=>{
    const {app,state}=await fixture(),rt=runtime(app),hold=gate();state.sqlGate=hold.promise;
    state.blocks.set(task(1).id,task(1,{checked:true,markdown:"- [x] fixture"}));rt.emit([task(1).root_id]);await rt.tick();rt.stop();
    const fresh=runtime(app);state.sqlGate=null;hold.release();await settle();assert.equal(state.writes,0);assert.equal(rt.events.length,0);
    fresh.emit([task(1).root_id]);await fresh.tick();assert.equal(state.writes,1);assert.equal(fresh.events.length,1);fresh.stop();
});
await test("L: queued mutations preserve both updates; stale query cannot overtake a business write",async()=>{
    const {app,state}=await fixture([task(1),task(2)]),hold=gate();state.sqlGate=hold.promise;
    const refresh=app.refreshTaskIndexByRootIds([task(1).root_id]);await settle();
    const first=app.updateTaskIndexItem({id:task(1).id,checked:true}),second=app.updateTaskIndexItem({id:task(2).id,markdown:"- [ ] final"});
    state.sqlGate=null;hold.release();await Promise.all([refresh,first,second]);assert.equal(rows(state)[0].checked,true);assert.equal(rows(state)[1].markdown,"- [ ] final");
});
await test("unload preserves already-issued and queued business writes",async()=>{
    const {app,state}=await fixture([task(1),task(2)]),rt=runtime(app),hold=gate();state.writeGate=hold.promise;
    const first=app.updateTaskIndexItem({id:task(1).id,checked:true});await settle();assert.equal(state.activeWrites,1);
    const second=app.updateTaskIndexItem({id:task(2).id,markdown:"- [ ] retained"});rt.stop();hold.release();await Promise.all([first,second]);
    assert.equal(rows(state)[0].checked,true);assert.equal(rows(state)[1].markdown,"- [ ] retained");
});
await test("task files accept official parsed JSON and binary/text transport forms",async()=>{
    const {app,state}=await fixture();
    for(const response of [JSON.parse(state.text),new Blob([state.text]),new TextEncoder().encode(state.text).buffer]){
        state.readResponse=response;const snapshot=await app.readTaskIndexSnapshot();assert(snapshot.fileExists);assert.equal(snapshot.items[0].id,task(1).id);
    }assert.equal(state.writes,0);
});
await test("N/O: unrelated roots and sync/plugin data notifications cannot create a write loop",async()=>{
    const {app,state}=await fixture(),rt=runtime(app);rt.emit(["20261001000000-normal1"]);await rt.tick();assert.equal(state.writes,0);
    const reads=state.reads;for(let n=0;n<20;n++)rt.raw({cmd:"reloadPlugin",data:{dataChangePlugins:["siyuan-homepage"],dataChangeReason:"sync"}});
    await rt.tick();assert.equal(state.reads,reads);assert.equal(state.writes,0);rt.stop();
});
await test("P: real task-data provider and homepage snapshot reads preserve the index",async()=>{
    const {app,state}=await fixture([task(1),task(2)]);
    const result=await app.loadTaskData({}, {refresh:false});assert.equal(result.status,"ok");assert.equal(result.items.length,2);assert.equal(state.reads,1);assert.equal(state.writes,0);
    const snapshot=await app.readTaskIndexSnapshot();assert(snapshot.fileExists);assert.equal(snapshot.items.length,2);assert.equal(state.writes,0);
    const homepage=await app.loadEnhancedDiaryHomepageSnapshot(app.normalizeEnhancedDiaryConfig({}),new Date(2026,9,19));
    assert.equal(homepage.taskIndexAvailable,true);assert.equal(state.writes,0);
});
await test("S: confirmed 404 initializes; manual rebuild still works without false SQL-empty success",async()=>{
    const {app,state}=await fixture();state.text=null;
    const initialized=await app.ensureTaskIndexInitialized({});assert(initialized.initialized);assert.equal(rows(state).length,1);
    const writes=state.writes;await app.rebuildTaskIndexFromGlobalSql({});assert.equal(state.writes,writes);
    state.sqlError=true;assert.equal((await app.rebuildTaskIndexFromGlobalSql({})).lastStatus,"error");assert.equal(state.writes,writes);
});
await test("checked writes and write verification surface failures",async()=>{
    for(const key of ["writeError","dropWrite"]){const {app,state}=await fixture();state[key]=true;await assert.rejects(app.updateTaskIndexItem({id:task(1).id,checked:true}));assert.equal(rows(state)[0].checked,false);}
});
await test("runtime combined intent emits once; diagnostics are bounded and opt-in",async()=>{
    const {app,state}=await fixture();assert.equal(app.taskIndexDiagnostics.snapshot().enabled,false);const rt=runtime(app);
    state.blocks.set(task(1).id,task(1,{checked:true,markdown:"- [x] fixture"}));rt.emit([task(1).root_id],true);await rt.tick();
    const metrics=app.taskIndexDiagnostics.snapshot();assert.equal(metrics.indexWrites,1);assert.equal(metrics.indexReads,2);assert.equal(metrics.targetedRefreshes,1);assert.equal(metrics.broadCleanups,1);assert.equal(metrics.dataUpdatedEvents,1);assert.equal(rt.events.length,1);assert.equal(metrics.writeBytes,state.bytes);
    assert(Object.values(metrics).every(v=>typeof v==="number"||typeof v==="boolean"));app.taskIndexDiagnostics.enable(false);app.recordTaskIndexMetric("databaseCommits");assert.equal(app.taskIndexDiagnostics.snapshot().databaseCommits,metrics.databaseCommits);rt.stop();
});
await test("production foreground event handlers coalesce refreshes and count actual executions",async()=>{
    const {app}=await fixture(),rt=runtime(app);
    for(const create of [app.workspaceScheduler,app.homepageScheduler]){
        app.taskIndexDiagnostics.reset();const scheduler=create();for(let n=0;n<20;n++)scheduler.event();
        assert.equal(app.taskIndexDiagnostics.snapshot().workspaceRefreshes,0);await rt.tick();
        assert.equal(scheduler.runs,1);assert.equal(app.taskIndexDiagnostics.snapshot().workspaceRefreshes,1);
    }rt.stop();
});

const operations=[];
for(const operation of ["complete-one","edit-one","change-project","complete-ten-burst","complete-ten-separate","ordinary-document","runtime-start","plugin-sync-notice","diary-record-only"]){
    const items=Array.from({length:4500},(_,n)=>task(n+1,{markdown:`- [ ] ${"fixture ".repeat(20)}${n}`,content:"fixture ".repeat(20).trim()}));
    const {app,state}=await fixture(items),rt=runtime(app);
    if(operation==="complete-one"||operation.startsWith("complete-ten")){
        const count=operation.startsWith("complete-ten")?10:1;
        for(let n=0;n<count;n++){state.blocks.set(items[n].id,{...items[n],markdown:items[n].markdown.replace("[ ]","[x]")});rt.emit([items[n].root_id]);if(operation.endsWith("separate"))await rt.tick();}
    }else if(operation==="edit-one"||operation==="change-project"){
        state.blocks.set(items[0].id,{...items[0],...(operation==="edit-one"?{markdown:items[0].markdown+"字"}:{ial:'custom-homepage-enhanced-diary-project-target="20261001000000-proj001"'})});rt.emit([items[0].root_id]);
    }else if(operation==="ordinary-document")rt.emit(["20261001000000-normal1"]);
    else if(operation==="diary-record-only")rt.emit([items[0].root_id]);
    else if(operation==="plugin-sync-notice")rt.raw({cmd:"reloadPlugin",data:{dataChangePlugins:["siyuan-homepage"],dataChangeReason:"sync"}});
    await rt.tick();const metrics=app.taskIndexDiagnostics.snapshot();
    const changes=["complete-one","edit-one","change-project","complete-ten-burst"].includes(operation)?1:operation==="complete-ten-separate"?10:0;
    assert.equal(state.writes,changes);
    operations.push({operation,commits:metrics.databaseCommits,targeted:metrics.targetedRefreshes,broad:metrics.broadCleanups,reads:state.reads,writes:state.writes,bytes:state.bytes,events:rt.events.length});rt.stop();
}
console.log(JSON.stringify({syntheticOperations:operations},null,2));
console.log(`${passed} task-index production scenarios passed; M: multi-MB measurements above; R: every write is restricted to task-index.json, Notebrain remains read-only.`);
