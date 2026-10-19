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
const readBaseline = process.argv.includes("--read-baseline");
const baselineRef = readBaseline ? "c3e446c57d8fd49d90637d173eb3fd3dd83e3983" : baseline ? "6c8868c4efb4ea04b55161cc7121b00b951617d7" : null;
async function schedulingMethods(path, names) {
    const source = await readFile(resolve(root, path), "utf8");
    const ast = parse(source.slice(0,source.lastIndexOf("<style")), {modern:true});
    return names.map(name=>{const node=ast.instance.content.body.find(node=>node.type==="FunctionDeclaration"&&node.id.name===name);assert(node);return source.slice(node.start,node.end);}).join("\n");
}
const workspaceMethods = await schedulingMethods("src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspacePage.svelte",["scheduleExternalWorkspaceRefresh","handleTaskDataUpdated","drainWorkspaceRefresh"]);
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
        export {queryWorkspaceTasks} from "./src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
        export {generateTaskLine} from "./src/features/task-data/task-parser";
        export * from "./src/runtime/siyuan-runtime-port";
        export * from "./src/utils/performance/runtimePerformance";
        ${baseline ? "const recordTaskIndexMetric=()=>{};" : 'import {recordTaskIndexMetric} from "./src/utils/performance/runtimePerformance";'}
        export function workspaceScheduler() {
            let advancedEnabled=true,componentAlive=true,actionBusy=false,externalWorkspaceRefreshPending=false,taskIndexRefreshPending=false,indexRefreshTimer=null,refreshFlight=null,runs=0;
            let workspaceRefreshVersion=0,workspaceLifetime=0,failedRefreshVersion=-1,refreshMutationQueued=false,refreshMutationTail=Promise.resolve();
            const window=globalThis.window,refresh=async()=>{runs++;externalWorkspaceRefreshPending=false;taskIndexRefreshPending=false;return true;};
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
        if (baselineRef) api.onLoad({filter:/[\\/]siyuanComponentDataApi\.ts$|[\\/]task-data-runtime\.ts$|[\\/]runtimePerformance\.ts$/}, ({path}) => ({
            contents: execFileSync("git", ["show", `${baselineRef}:${path.slice(root.length+1).replaceAll("\\", "/")}`], {cwd:root,encoding:"utf8"}), loader:"ts", resolveDir:resolve(path,".."),
        }));
        api.onResolve({ filter: /favorites-store$|notification-center-mobile-plan-manager$|notification-center-locks$|enhancedDiaryIndex$/ }, ({path}) => ({ path: path.split("/").at(-1), namespace: "fixture" }));
        api.onResolve({filter:/enhancedDiaryDoc$/},()=>({path:"diary-read",namespace:"fixture"}));
        api.onResolve({filter:/enhancedDiaryActions$/},()=>({path:"unused-diary-write",namespace:"fixture"}));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, ({path}) => ({ contents: path==="diary-read"
            ? 'export const lookupDiaryDocumentForDate=async()=>({status:"missing",docId:""}),readDiaryMarkdownResult=async()=>({ok:true,content:""});'
            : path==="unused-diary-write" ? 'export const getOrCreateTodayDiaryDocument=()=>{throw Error("unexpected diary write");};'
            : stubs[path].map((name) => `export const ${name}=()=>{};`).join("\n"), loader: "js" }));
    } }],
});
let sequence = 0;
async function fixture(items = [task(1)]) {
    const app = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${sequence++}`);
    const state = { text: JSON.stringify({ version: 1, updatedAt: "20261001000000", items }, null, 2), reads: 0, writes: 0, bytes: 0, sql: [], blockChecks: [], apiCalls: {}, blocks: new Map(items.map(t => [t.id, t])), readError: false, sqlError: false };
    const recentSnapshotPath="/data/storage/petal/siyuan-homepage/recent-doc-snapshot.json";
    app.setSiyuanRuntimePort({
        async getFile(path) {
            if(state.workspaceRead&&path===recentSnapshotPath)return {code:404};
            assert.equal(path, PATH);
            state.reads++;
            if(state.readGate)await state.readGate;
            if (state.readError) throw Error("synthetic file unavailable");
            if (state.readResponse !== undefined) return state.readResponse;
            return state.text === null ? { code: 404 } : state.text;
        },
        async putFile(path, dir, blob) {
            if (dir) return { code: 0 };
            if(state.workspaceRead&&path===recentSnapshotPath){state.snapshotWrites=(state.snapshotWrites||0)+1;return {code:0};}
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
            state.apiCalls[path] = (state.apiCalls[path] || 0) + 1;
            if(state.workspaceRead&&path==="/api/storage/getRecentDocs")return {code:0,data:[]};
            if(state.workspaceRead&&path==="/api/attr/batchGetBlockAttrs")return {code:0,data:Object.fromEntries(data.ids.map(id=>[id,state.attrs?.[id]||{}]))};
            if (path === "/api/query/sql") {
                state.sql.push(data.stmt);
                if(state.workspaceRead&&data.stmt.includes("WHERE type = 'd'"))return {code:0,data:state.sourceDocs||[]};
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
// Optional Kernel integration: only this named file may be read; never run maintenance.
if(process.argv.includes("--live-read")){
    const {app}=await fixture([]);let reads=0,blockedCalls=0;
    const token=process.env.SIYUAN_API_TOKEN;if(!token)throw Error("SIYUAN_API_TOKEN is required for the optional live read");
    app.setSiyuanRuntimePort({
        async getFile(path){
            assert.equal(path,PATH);reads++;
            const response=await fetch("http://127.0.0.1:6806/api/file/getFile",{method:"POST",headers:{Authorization:`token ${token}`,"Content-Type":"application/json"},body:JSON.stringify({path}),signal:AbortSignal.timeout(15000)});
            if(!response.ok)throw Error(`Kernel getFile HTTP ${response.status}`);
            return response.headers.get("content-type")?.includes("application/json")?response.json():response.text();
        },
        async post(){blockedCalls++;throw Error("Live read forbids all other Kernel APIs");},
        async putFile(){blockedCalls++;throw Error("Live read forbids writes");},
    });
    const started=performance.now(),result=await app.getTaskIndexResult();
    assert.equal(blockedCalls,0,"the production getter must not even attempt other APIs or writes");
    console.log(JSON.stringify({liveRead:{status:result.status,items:result.items.length,indexReads:reads,blockApiCalls:0,indexWrites:0,elapsedMs:+(performance.now()-started).toFixed(1)}}));
    process.exit(0);
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

// --read-baseline executes the previous commit's production getter, not a copy.
const readItems=Array.from({length:4500},(_,i)=>task(i+1,{markdown:`- [ ] ${"fixture ".repeat(20)}${i}`,content:"fixture ".repeat(20).trim()}));
const readFixture=await fixture(readItems), readStart=performance.now();
const readResult=await readFixture.app.getTaskIndexResult();
assert.equal(readResult.status,"ok");assert.equal(readResult.items.length,4500);
assert.equal(readFixture.state.reads,1);assert.equal(readFixture.state.writes,0);
const validationEndpoints=["/api/block/checkBlockExist","/api/block/getBlockInfo","/api/block/getBlockTreeInfos","/api/block/getBlockKramdowns"];
for(const path of validationEndpoints) assert.equal(readFixture.state.apiCalls[path]||0,readBaseline?4500:0);
console.log(JSON.stringify({foregroundRead:{mode:readBaseline?"c3e446c":"optimized",items:4500,inputBytes:Buffer.byteLength(readFixture.state.text),indexReads:readFixture.state.reads,indexWrites:readFixture.state.writes,blockApiCalls:validationEndpoints.reduce((count,path)=>count+(readFixture.state.apiCalls[path]||0),0),elapsedMs:+(performance.now()-readStart).toFixed(1)}},null,2));
if(readBaseline)process.exit(0);

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

await test("read A/B/C: 4500 old tasks and ten repeated list/provider reads never validate blocks",async()=>{
    const {app,state}=await fixture(readItems),original=state.text;
    for(let n=0;n<10;n++){
        const result=await app.getTaskIndexResult();assert.equal(result.status,"ok");assert.deepEqual(result.items,readItems);
    }
    const result=await app.loadTaskData({}, {refresh:false});assert.equal(result.status,"ok");assert.deepEqual(result.items,readItems);
    assert.equal(state.reads,11);assert.equal(state.writes,0);assert.equal(state.text,original);assert.deepEqual(state.apiCalls,{});
});
await test("read K: notebook filter, updated ordering, all semantic fields and stale rows are preserved",async()=>{
    const items=[task(1,{updated:"20261018000000",projectTargetId:"20261001000000-proj001",hiddenProjectTargetId:"20261001000000-proj002",visibleProjectTargetId:"20261001000000-proj003",projectRelationStatus:"target_mismatch"}),task(2,{updated:"20261019000000"}),task(3,{box:"20261001000000-box0002",checked:true})];
    const {app,state}=await fixture(items);state.blocks.clear();
    const result=await app.getTaskIndexResult([items[0].box]);assert.deepEqual(result.items,[items[1],items[0]]);
    assert.equal((await app.getTaskIndexResult(["20261001000000-absent1"])).status,"disabled");
    assert.equal(state.writes,0);assert.deepEqual(state.apiCalls,{});
});
await test("read I: explicit missing and corrupt/unreadable indexes never trigger implicit rebuild or writes",async()=>{
    for(const invalid of [undefined,null,"", "{bad", "null", "{}",{version:2,items:[]},{version:1,items:[null]},{code:403,msg:"forbidden"}]){
        const {app,state}=await fixture(),original=state.text;
        if(invalid===undefined)state.readError=true;else state.readResponse=invalid;
        await assert.rejects(app.getTaskIndexResult());
        const result=await app.loadTaskData({}, {refresh:false});assert.equal(result.status,"error");assert.deepEqual(result.items,[]);
        assert.equal(state.text,original);assert.equal(state.writes,0);assert.deepEqual(state.apiCalls,{});
    }
    const {app,state}=await fixture();state.text=null;
    assert.equal((await app.getTaskIndexResult()).status,"disabled");assert.equal(state.writes,0);assert.deepEqual(state.apiCalls,{});
});
await test("read M: foreground reads complete while a background SQL refresh holds the mutation queue",async()=>{
    const {app,state}=await fixture(),hold=gate();state.sqlGate=hold.promise;
    state.blocks.set(task(1).id,task(1,{checked:true,markdown:"- [x] refreshed"}));
    const background=app.refreshTaskIndexByRootIds([task(1).root_id]);await settle();assert.equal(state.sql.length,1);
    let result;const foreground=app.getTaskIndexResult().then(value=>{result=value;});await settle();
    assert(result,"foreground must not await the held mutation queue");assert.deepEqual(result.items,[task(1)]);assert.equal(state.writes,0);
    hold.release();await Promise.all([foreground,background]);
    assert.equal((await app.getTaskIndexResult()).items[0].markdown,"- [x] refreshed");assert.equal(state.writes,1);
});
await test("read M: a slow foreground file response does not hold up a business mutation",async()=>{
    const {app,state}=await fixture(),hold=gate();state.readGate=hold.promise;
    const foreground=app.getTaskIndexResult();await settle();state.readGate=null;
    let saved=false;const mutation=app.updateTaskIndexItem({id:task(1).id,checked:true}).then(()=>{saved=true;});await settle();
    assert(saved,"foreground must not occupy the mutation queue");hold.release();await Promise.all([foreground,mutation]);
    assert.equal((await app.getTaskIndexResult()).items[0].checked,true);assert.equal(state.writes,1);
});
await test("read E/F/G/H: explicit targeted, broad and user cleanup still validate and remove confirmed stale tasks",async()=>{
    for(const kind of ["targeted","broad","explicit"]){
        const {app,state}=await fixture([task(1),task(2)]);state.blocks.delete(task(2).id);
        assert.equal((await app.getTaskIndexResult()).items.length,2);assert.equal(state.blockChecks.length,0);
        if(kind==="targeted")await app.refreshTaskIndexByRootIds([task(1).root_id]);
        else if(kind==="broad")await app.refreshTaskIndexAfterBroadCommit();
        else assert.equal(await app.pruneMissingTaskIndexItems(),1);
        assert.deepEqual(rows(state).map(item=>item.id),[task(1).id]);assert(state.blockChecks.includes(task(2).id));
    }
    const {app,state}=await fixture();state.blocks.clear();state.blockError=true;
    assert.equal(await app.pruneMissingTaskIndexItems(),0);assert.equal(state.writes,0);assert.equal(rows(state).length,1);
});
await test("read D: real workspace task loading preserves project relations, schedule and completion",async()=>{
    const {app,state}=await fixture();state.workspaceRead=true;
    const target="20261001000000-proj001",today=new Date(2026,9,19);
    const projectIndex={version:1,updatedAt:"",containerSignature:"fixture",complete:true,nodes:{},roots:{[target]:{id:target,kind:"root",title:"Fixture project",notebookId:task(1).box,path:"/fixture.sy",hpath:"/fixture",order:0,updated:"20261001000000",status:"active",archivedAt:""}}};
    const items=[task(1,{markdown:app.generateTaskLine({taskname:"today fixture",startDate:"2026-10-19",deadline:"2026-10-19",projectTargetId:target,projectTitle:"Fixture project"})}),task(2,{markdown:app.generateTaskLine({taskname:"overdue fixture",deadline:"2026-10-18"})}),task(3,{markdown:app.generateTaskLine({taskname:"completed fixture",completed:true,startDate:"2026-10-19"}),checked:true})];
    state.text=JSON.stringify({version:1,items});state.blocks=new Map(items.map(item=>[item.id,item]));state.attrs={[items[0].id]:{"custom-homepage-enhanced-diary-project-target":target}};
    state.sourceDocs=[{id:task(1).root_id,content:"Fixture source",hpath:"/fixture"}];
    const result=await app.queryWorkspaceTasks(app.normalizeEnhancedDiaryConfig({}),today,{}, {projectIndex});
    assert.equal(result.length,3);const byId=new Map(result.map(task=>[task.id,task]));
    assert.equal(byId.get(items[0].id).isTodayTask,true);assert.equal(byId.get(items[1].id).isOverdue,true);assert.equal(byId.get(items[2].id).completed,true);
    for(const key of ["projectTargetId","hiddenProjectTargetId","visibleProjectTargetId","rootProjectId"])assert.equal(byId.get(items[0].id)[key],target);
    assert.equal(byId.get(items[0].id).projectRelationStatus,"normal");assert.equal(byId.get(items[0].id).markdown,items[0].markdown);
    for(const path of validationEndpoints)assert.equal(state.apiCalls[path]||0,0);
    assert.equal(state.writes,0);assert.equal(state.apiCalls["/api/attr/batchGetBlockAttrs"],1);
});
await test("read N: actual write-target guard still verifies one live task and rejects unknown/inactive blocks",async()=>{
    const {app,state}=await fixture(readItems);
    assert.equal(await app.ensureTaskBlockExists(readItems[0].id),true);assert.equal(state.blockChecks.length,1);
    state.blockError=true;assert.equal(await app.ensureTaskBlockExists(readItems[0].id),false);assert.equal(state.writes,0);
    state.blockError=false;state.blocks.set(readItems[0].id,{...readItems[0],markdown:"no longer a task"});
    assert.equal(await app.ensureTaskBlockExists(readItems[0].id),false);assert.equal(rows(state).length,4499);
});

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
console.log(`${passed} task-index production scenarios passed; M: multi-MB measurements above; R: writes restricted to task-index.json and the explicit recent-doc-snapshot fixture, Notebrain remains read-only.`);
