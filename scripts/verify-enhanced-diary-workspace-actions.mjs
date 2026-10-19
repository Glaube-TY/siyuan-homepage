import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, transform } from "esbuild";
import { parse, compile } from "svelte/compiler";

const root = resolve(import.meta.dirname, "..");
const base = "src/components/utils/widgetBlock/widget/enhancedDiary/workspace/";
const read = (name) => readFile(resolve(root, base, name), "utf8");
const page = await read("enhancedDiaryWorkspacePage.svelte");
const project = await read("components/WorkspaceFormalProjectPanel.svelte");
const dialogs = await read("enhancedDiaryWorkspaceDialogs.ts");
function nodes(source) { return parse(source).instance.content.body; }
function functions(source, names) {
    return names.map((name) => {
        const node = nodes(source).find((n) => n.type === "FunctionDeclaration" && n.id.name === name);
        assert(node, `production function ${name}`);
        return source.slice(node.start, node.end);
    }).join("\n");
}
function section(source, start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert(from >= 0 && to > from);
    return source.slice(from, to);
}
async function factory(source, name) {
    const { code } = await transform(source, { loader: "ts", format: "esm" });
    return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`))[name];
}
const pageFunctions = functions(page, ["submitNewTaskForWorkspace", "createRecord", "toggleTask", "loadCalendar", "loadSelectedDayDetail", "ensureHistoryRecordsLoaded", "ensureReviewHistoryLoaded"]);
const pageMount = nodes(page).findLast((n) => n.type === "ExpressionStatement" && n.expression.callee?.name === "onMount");
const createPage = await factory(`
export function createPage(api) {
const {$state,window,showMessage,loadEnhancedDiaryWorkspaceState,buildWorkspaceCalendarMonth,loadWorkspaceDayDetail,
getOrCreateTodayDiaryDocument,addNewTaskToDiary,addWorkspaceQuickRecord,toggleWorkspaceTaskComplete,loadWorkspaceHistoryRecords,loadWorkspaceReviewHistory}=api;
const console={warn:(...args)=>api.warnings.push(String(args[0]))};
let state=api.initialState, loading=false, actionBusy=false, calendarLoading=false, dayDetailLoading=false;
let historyRecordsLoaded=false,reviewHistoryLoaded=false,historyRecordsLoading=false,reviewHistoryLoading=false;
let calendarDate=new Date(2026,9,19),selectedCalendarDate='2026-10-19',calendarDays=[],selectedDayDetail=null;
let calendarMonthCache=new Map(),dayDetailCache=new Map(),calendarRequestVersion=0,dayDetailRequestVersion=0;
let componentAlive=false,advancedEnabled=false,workspaceMutationVersion=0,pendingStartupAction=null;
let activeTab='overview',recordViewMode='today',editingTask=null,editingRecord=null,deletingTask=null,deletingRecord=null,migratingTask=null,commandPaletteOpen=false;
const plugin={ADVANCED:true}, initialTab='overview',initialAction=null, taskManagementEnabled=true;
const isWorkspaceTab=()=>true,isWorkspaceStartupAction=()=>false,runPendingStartupAction=()=>{};
const handleWorkspaceKeydown=()=>{},handleWorkspaceTabRequest=()=>{},recordTaskIndexMetric=()=>{};
const ENHANCED_DIARY_INDEXES_UPDATED_EVENT='diary',TASK_DATA_UPDATED_EVENT='task';
const formatDiaryAttrDate=()=> '20261019',parseLocalDate=(value)=>new Date(value+'T00:00:00');
let destroy;const onMount=(fn)=>{destroy=fn();};
${section(page, "    let refreshFlight:", "    async function saveWorkspaceSettings(")}
${pageFunctions}
return {refresh,submit:submitNewTaskForWorkspace,createRecord,toggleTask,beginWorkspaceAction,finishWorkspaceAction,
event:handleEnhancedDiaryIndexesUpdated,taskEvent:handleTaskDataUpdated,refreshAfterWorkspaceMutation,
loadCalendar,loadSelectedDayDetail,ensureHistoryRecordsLoaded,ensureReviewHistoryLoaded,
mount(){${page.slice(pageMount.start,pageMount.end)}},destroy(){destroy?.();},
snapshot:()=>({state,loading,actionBusy,calendarDays,selectedDayDetail,pendingTask,pendingTaskVersion,workspaceMutationVersion,workspaceRefreshVersion,externalWorkspaceRefreshPending,advancedEnabled}),
tab(value){activeTab=value;recordViewMode='history';},settle:()=>refreshMutationTail,flight:()=>refreshFlight};
}`, "createPage");

async function createDialog(name, props, messages) {
    const source = await read(`components/${name}.svelte`);
    const script = nodes(source).filter((n) => n.type !== "ImportDeclaration").map((n) => source.slice(n.start,n.end)).join("\n");
    const make = await factory(`export function make(api){
        const {$props,$state,$derived,onMount,onDestroy,showMessage}=api;
        const $effect=()=>{},loadEnhancedDiaryProjectIndexForWorkspace=async()=>({}),isEnhancedDiaryProjectStorageReady=()=>false;
        const isEnhancedDiaryProjectEffectivelyActive=()=>true,resolveEnhancedDiaryProjectTarget=()=>null;
        ${script}
        return {submit,snapshot:()=>({submitting,submitted,${name === "TaskEditorDialog" ? "taskname" : "content"}})};
    }`, "make");
    let destroy;
    const result=make({$props:()=>props,$state:(v)=>v,$derived:(v)=>v,onMount:(fn)=>fn(),onDestroy:(fn)=>{destroy=fn;},showMessage:(msg)=>messages.push(msg)});
    return {...result,destroy:()=>destroy()};
}

// Run the real dialog host wrappers too: false must propagate back to the form.
const hostSource = dialogs.replace(/^import .*;\n/gm, "");
const openHosts = await factory(`export function hosts(api){
const {mount,svelteDialog}=api;const TaskEditorDialog={},QuickRecordDialog={};
${section(hostSource, 'function getWorkspaceDialogPresentation(', 'export function openProjectRelationRepairDialog(').replaceAll('export function ', 'function ')}
return {task:openTaskEditorSvelteDialog,record:openQuickRecordSvelteDialog};}`, "hosts");
function host(onSubmit, kind="task") {
    let props,closed=0;
    const hosts=openHosts({mount:(_,options)=>{props=options.props;return {};},svelteDialog:(options)=>{
        const classList={add(){}};
        options.constructor({classList,style:{}});
        return {dialog:{element:{classList}},close(){closed++;options.callback();}};
    }});
    hosts[kind]({onSubmit});
    return {props,closed:()=>closed};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const tick=async()=>{for(let i=0;i<35;i++) await Promise.resolve();};
function fixture({load,write,calendar,detail,history,review,initialState}={}) {
    const timers=new Map(),listeners=new Map(),messages=[],calls={load:0,calendar:0,detail:0,task:0,record:0,toggle:0};
    let timerId=0,revision=0,completed=false;
    const snapshot=()=>({config:{dailyNotebookId:'notebook',projectStorage:{}},date:new Date(2026,9,19),revision,tasks:[{blockId:'task',taskname:'fixture',completed,markdown:completed?'- [x] fixture':'- [ ] fixture'}],projects:[],records:[]});
    const api={warnings:[],initialState:initialState===null?null:initialState||snapshot(),$state:(v)=>v,showMessage:(msg)=>messages.push(msg),
        window:{setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},addEventListener(n,f){listeners.set(n,f);},removeEventListener(n){listeners.delete(n);}},
        loadEnhancedDiaryWorkspaceState:async(...args)=>{calls.load++;return load?load(snapshot(),...args):snapshot();},
        buildWorkspaceCalendarMonth:async()=>{calls.calendar++;return calendar?calendar():[{revision}];},loadWorkspaceDayDetail:async()=>{calls.detail++;return detail?detail():{revision};},
        getOrCreateTodayDiaryDocument:async()=>({ok:true,docId:'diary'}),
        addNewTaskToDiary:async()=>{calls.task++;return write?write():{ok:true};},
        addWorkspaceQuickRecord:async()=>{calls.record++;return write?write():{ok:true};},
        toggleWorkspaceTaskComplete:async()=>{calls.toggle++;const result=write?await write():{ok:true};if(result.ok){completed=!completed;revision++;}return result;},
        loadWorkspaceHistoryRecords:async()=>history?history():[],loadWorkspaceReviewHistory:async()=>review?review():[],
    };
    const runtime=createPage(api);
    return {runtime,api,calls,messages,timers,listeners,snapshot,setRevision(v){revision=v;},async mount(){runtime.mount();await runtime.flight();},
        async timersRun(){const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();await tick();await runtime.settle();},
        emit(name){listeners.get(name)?.();}};
}

let groups=0;
async function check(name,fn){await fn();groups++;console.log(`PASS ${name}`);}
await check("A/C task submission closes only after write confirmation, before full reload; duplicate clicks blocked",async()=>{
    const writing=deferred(),reading=deferred();let hold=false;
    const f=fixture({write:()=>writing.promise,load:(value)=>hold?reading.promise:value});await f.mount();hold=true;
    const h=host(f.runtime.submit),dialog=await createDialog("TaskEditorDialog",{...h.props,initialInput:{taskname:'keep me'}},f.messages);
    const submit=dialog.submit();await tick();assert.equal(dialog.snapshot().submitting,true);assert.equal(h.closed(),0);
    await dialog.submit();assert.equal(f.calls.task,1);assert.equal(f.runtime.snapshot().actionBusy,true);
    writing.resolve({ok:true});await submit;assert.equal(h.closed(),1);assert.equal(f.runtime.snapshot().actionBusy,false);
    await dialog.submit();assert.equal(f.calls.task,1);assert.equal(f.calls.load,2);
    reading.resolve(f.snapshot());await f.runtime.settle();assert.equal(f.calls.load,2);assert.equal(f.timers.size,0);
});
await check("B task false and rejected write keep form fields; retry allowed",async()=>{
    for(const throws of [false,true]){
        const f=fixture({write:()=>{if(throws)throw new Error('write failed');return {ok:false};}});await f.mount();
        const h=host(f.runtime.submit),d=await createDialog('TaskEditorDialog',{...h.props,initialInput:{taskname:'retained'}},f.messages);
        await d.submit();assert.equal(h.closed(),0);assert.equal(d.snapshot().taskname,'retained');assert.equal(d.snapshot().submitting,false);
        assert.equal(f.calls.load,1);await d.submit();assert.equal(f.calls.task,2);
    }
});
await check("D/E/F quick record normal/partial/failed writes preserve result and prevent duplicates",async()=>{
    for(const result of [{ok:true},{ok:true,partial:true},{ok:false}]){
        const reading=deferred();let hold=false;const f=fixture({write:()=>result,load:(s)=>hold?reading.promise:s});await f.mount();hold=true;
        const h=host(f.runtime.createRecord,'record'),d=await createDialog('QuickRecordDialog',{...h.props,initialContent:'retained body'},f.messages);
        await d.submit();assert.equal(h.closed(),result.ok?1:0);assert.equal(d.snapshot().content,'retained body');
        if(result.partial)assert(f.messages.some((m)=>m.includes('勿重复添加')));
        await d.submit();assert.equal(f.calls.record,result.ok?1:2);
        reading.resolve(f.snapshot());await f.runtime.settle();
    }
});
await check("G/H task completion waits for confirmed write and latest read; failure leaves original intact",async()=>{
    for(const ok of [true,false]){
        const writing=deferred(),reading=deferred();let hold=false;const f=fixture({write:()=>writing.promise,load:(s)=>hold?reading.promise:s});await f.mount();hold=true;
        const task=f.runtime.snapshot().state.tasks[0],run=f.runtime.toggleTask(task);
        assert.equal(f.runtime.snapshot().pendingTask.blockId,task.blockId);assert.equal(task.completed,false);
        await f.runtime.toggleTask(task);assert.equal(f.calls.toggle,1);
        writing.resolve({ok});await run;assert.equal(task.completed,false);
        if(ok){assert(f.runtime.snapshot().pendingTask);reading.resolve(f.snapshot());await f.runtime.settle();assert.equal(f.runtime.snapshot().state.tasks[0].completed,true);assert.equal(f.runtime.snapshot().state.tasks[0].markdown,'- [x] fixture');}
        else assert.equal(f.calls.load,1);
        assert.equal(f.runtime.snapshot().pendingTask,null);
    }
});
await check("I/K index events during action coalesce, external change is not lost",async()=>{
    const f=fixture();await f.mount();f.runtime.beginWorkspaceAction();
    f.emit('task');f.emit('diary');f.emit('task');f.setRevision(2);
    assert.equal(f.calls.load,1);assert.equal(f.timers.size,0);
    f.runtime.finishWorkspaceAction();await f.runtime.settle();assert.equal(f.calls.load,2);assert.equal(f.runtime.snapshot().state.revision,2);
});
await check("J new change during refresh rejects stale state and performs one latest read",async()=>{
    const gate=deferred();let hold=false;const f=fixture({load:(value)=>{if(hold){hold=false;return gate.promise;}return value;}});await f.mount();hold=true;
    f.emit('task');const flush=f.timersRun();await tick();f.setRevision(3);f.emit('diary');
    gate.resolve({...f.snapshot(),revision:1});await flush;assert.equal(f.runtime.snapshot().state.revision,3);assert.equal(f.calls.load,3);
    await f.timersRun();assert.equal(f.calls.load,3);
});
await check("K local confirmed write overtakes an older external refresh without losing either event",async()=>{
    const gate=deferred();let hold=false;
    const f=fixture({load:(s)=>{if(hold){hold=false;return gate.promise;}return s;}});await f.mount();hold=true;
    f.emit('diary');const flushing=f.timersRun();await tick();
    const prior=f.runtime.snapshot().state;f.setRevision(5);
    assert.equal(await f.runtime.createRecord({categoryTitle:'fixture',content:'body'}),true);
    assert.equal(f.runtime.snapshot().state,prior);
    f.emit('task');gate.resolve({...f.snapshot(),revision:1});await flushing;await f.runtime.settle();
    assert.equal(f.runtime.snapshot().state.revision,5);assert.equal(f.calls.load,3);assert.equal(f.runtime.snapshot().externalWorkspaceRefreshPending,false);
});
await check("refresh errors preserve snapshot and pending intent, without automatic retries; manual refresh recovers",async()=>{
    let fail=false;const f=fixture({load:(s)=>{if(fail)throw new Error('read failed');return s;}});await f.mount();const original=f.runtime.snapshot().state;
    fail=true;await f.runtime.refreshAfterWorkspaceMutation(true);f.runtime.finishWorkspaceAction();await tick();assert.equal(f.calls.load,2);
    assert.equal(f.runtime.snapshot().state,original);assert.equal(f.runtime.snapshot().externalWorkspaceRefreshPending,true);
    fail=false;f.setRevision(4);assert.equal(await f.runtime.refresh({forceTaskIndexRefresh:true}),true);
    assert.equal(f.runtime.snapshot().state.revision,4);assert.equal(f.runtime.snapshot().workspaceMutationVersion,1);
});
await check("L unmount removes timers/listeners and in-flight reads cannot publish",async()=>{
    const gate=deferred();let hold=false;const f=fixture({load:(s)=>hold?gate.promise:s});await f.mount();hold=true;
    const old=f.runtime.snapshot().state;const read=f.runtime.refresh();await tick();f.emit('task');f.runtime.destroy();
    gate.resolve({...f.snapshot(),revision:9});await read;await f.runtime.settle();assert.equal(f.runtime.snapshot().state,old);
    assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);f.runtime.event();assert.equal(f.timers.size,0);
});
await check("L destruction before the queued refresh starts cannot set loading or issue reads",async()=>{
    const f=fixture();await f.mount();const run=f.runtime.refresh();f.runtime.destroy();await run;
    assert.equal(f.runtime.snapshot().loading,false);assert.equal(f.calls.load,1);
});
await check("M entitlement revocation invalidates in-flight reads and prevents queued refresh",async()=>{
    const gate=deferred();let hold=false;const f=fixture({load:(s)=>hold?gate.promise:s});await f.mount();hold=true;
    const read=f.runtime.refresh();await tick();f.emit('task');f.emit('homepage-advanced-unavailable');
    gate.resolve(f.snapshot());await read;await f.timersRun();assert.equal(f.runtime.snapshot().state,null);assert.equal(f.calls.load,2);
    assert.equal(f.timers.size,0);assert.equal(f.runtime.snapshot().advancedEnabled,false);
});
await check("M permission restoration drains the latest intent after the obsolete read settles",async()=>{
    const gate=deferred();let hold=false;
    const f=fixture({load:(s)=>{if(hold){hold=false;return gate.promise;}return s;}});await f.mount();hold=true;
    const run=f.runtime.refresh();await tick();f.emit('homepage-advanced-unavailable');f.setRevision(7);f.emit('homepage-advanced-ready');
    gate.resolve({...f.snapshot(),revision:1});await run;await tick();await f.runtime.settle();
    assert.equal(f.runtime.snapshot().state.revision,7);assert.equal(f.calls.load,3);
});
await check("calendar failure retains the entire previous state and pending work",async()=>{
    let fail=false;const f=fixture({calendar:()=>{if(fail)throw new Error('calendar failed');return [];}});
    await f.mount();const old=f.runtime.snapshot();fail=true;f.setRevision(8);
    await f.runtime.refreshAfterWorkspaceMutation(true);await tick();
    assert.equal(f.runtime.snapshot().state,old.state);assert.equal(f.runtime.snapshot().calendarDays,old.calendarDays);
    assert.equal(f.runtime.snapshot().selectedDayDetail,old.selectedDayDetail);
    assert.equal(f.runtime.snapshot().externalWorkspaceRefreshPending,true);assert.equal(f.calls.load,2);
});
await check("obsolete lazy history reads are discarded and the visible history loads the latest snapshot",async()=>{
    for(const tab of ['records','review']){
        const gate=deferred();let reads=0;
        const load=()=>++reads===1?gate.promise:[{revision:2}];
        const f=fixture({history:load,review:load});await f.mount();f.runtime.tab(tab);
        const old=tab==='records'?f.runtime.ensureHistoryRecordsLoaded():f.runtime.ensureReviewHistoryLoaded();
        await f.runtime.refreshAfterWorkspaceMutation();gate.resolve([{revision:1}]);await old;await tick();
        assert.equal(reads,2);assert.deepEqual(f.runtime.snapshot().state[tab==='records'?'historyRecords':'reviewHistory'],[{revision:2}]);
    }
});
await check("R/S initial and explicit refresh load full state, calendar and day; refresh remains single-flight",async()=>{
    const f=fixture({initialState:null});await f.mount();assert(f.runtime.snapshot().state);assert.equal(f.calls.calendar,1);assert.equal(f.calls.detail,1);
    const a=f.runtime.refresh(),b=f.runtime.refresh();assert.equal(a,b);await a;assert.equal(f.calls.load,2);assert.equal(f.calls.calendar,2);assert.equal(f.calls.detail,2);
});
await check("form destruction during submit does not update submitting state or notify errors",async()=>{
    const gate=deferred(),messages=[];const d=await createDialog('QuickRecordDialog',{onSubmit:()=>gate.promise,onClose(){}},messages);
    const run=d.submit();d.destroy();gate.reject(new Error('late'));await run;assert.equal(d.snapshot().submitting,true);assert.deepEqual(messages,[]);
});

const projectFns=functions(project,['submitCreate','refreshCreatedProject']);
const createProjectPanel=await factory(`export function panel(api){
let alive=true,busy=false,createMode=api.mode,config={projectStorage:{}},projectName='fixture',overview='',goal='',focus='',selectedTargetId='parent',projectLifecycleFilter='active';
const {createEnhancedDiaryRootProject,createEnhancedDiarySubproject,EnhancedDiaryProjectCreatedButNotVerifiedError,refresh,showMessage}=api;
function closeCreateForm(){createMode='';projectName='';}
${projectFns}
return {submitCreate,snapshot:()=>({busy,createMode}),destroy(){alive=false;}};
}`, 'panel');
class PartialProject extends Error { constructor(){super('项目已创建，索引未确认，请勿重复创建');this.docId='created';} }
await check("N/O/P/Q project root/child service confirmation precedes success; detail failure never reverses result",async()=>{
    for(const mode of ['root','child']) for(const partial of [false,true]){
        const writing=deferred(),reading=deferred(),messages=[];let calls=0,refreshCalls=0;
        const service=()=>{calls++;return writing.promise;};
        const p=createProjectPanel({mode,createEnhancedDiaryRootProject:service,createEnhancedDiarySubproject:service,
            EnhancedDiaryProjectCreatedButNotVerifiedError:PartialProject,refresh:()=>{refreshCalls++;return reading.promise;},showMessage:(m)=>messages.push(m)});
        const run=p.submitCreate();await p.submitCreate();assert.equal(calls,1);assert.deepEqual(messages,[]);
        if(partial)writing.reject(new PartialProject());else writing.resolve('created');
        await run;assert.equal(p.snapshot().busy,false);assert.equal(p.snapshot().createMode,'');assert.equal(refreshCalls,1);
        assert(messages[0].includes(partial?'勿重复创建':'项目创建成功'));
        reading.resolve(false);await tick();assert(messages.at(-1).includes('详情暂时无法加载'));assert(!messages.includes('项目创建失败'));
        await p.submitCreate();assert.equal(calls,1);
    }
});

const makeProjectReads=await factory(`export function make(api){
let alive=true,refreshGeneration=0,appliedMutationVersion=0,workspaceMutationVersion=0,storageReady=true,loading=false,error='';
let index=api.initial,recordItems=[],selectedTargetId='root',projectLifecycleFilter='active',detailTab='overview',overviewSnapshot={};
const config={projectStorage:{},dailyNotebookId:'book'},EMPTY_INDEX={},EMPTY_SNAPSHOT={};
const console={warn(){}},resolveEnhancedDiaryProjectTarget=(value,id)=>value.roots[id],targetMatchesLifecycleFilter=()=>true,firstTargetForLifecycleFilter=()=> 'root';
const loadEnhancedDiaryProjectIndexForWorkspace=()=>api.read(),readEnhancedDiaryProjectRecordIndex=async()=>({items:{}}),loadEnhancedDiaryProjectOverviewSnapshot=()=>api.detail();
const loadField=async()=>{},rebuildEnhancedDiaryProjectIndex=()=>{throw new Error('unexpected rebuild');};
${functions(project,['refresh','loadOverviewSnapshot'])}
return {refresh,snapshot:()=>({index,error,loading,selectedTargetId,overviewSnapshot}),destroy(){alive=false;refreshGeneration++;}};
}`, 'make');
await check("Q project read outcome is explicit; failed/obsolete/destroyed reads cannot publish another index",async()=>{
    const initial={roots:{root:{id:'root',status:'active'}}};
    const api={initial,read:async()=>initial,detail:async()=>({overview:'verified detail'})};const p=makeProjectReads(api);
    assert.equal(await p.refresh(),true);
    api.read=async()=>{throw new Error('read failed');};assert.equal(await p.refresh(),false);assert.equal(p.snapshot().index,initial);
    api.read=async()=>initial;api.detail=async()=>{throw new Error('detail failed');};assert.equal(await p.refresh(),false);
    const gate=deferred();api.read=()=>gate.promise;const old=p.refresh();
    const latest={roots:{root:{id:'root',status:'active'}},revision:2};api.read=async()=>latest;api.detail=async()=>({overview:'latest'});
    assert.equal(await p.refresh(),true);gate.resolve(initial);assert.equal(await old,false);assert.equal(p.snapshot().index,latest);
    const ending=deferred();api.read=()=>ending.promise;const pending=p.refresh();p.destroy();ending.resolve(initial);await pending;
    assert.equal(p.snapshot().index,latest);
});

const projectServiceBuild=await build({
    entryPoints:[resolve(root,base,'enhancedDiaryWorkspaceProjectService.ts')],bundle:true,write:false,format:'esm',platform:'node',
    plugins:[{name:'project-controlled-api-fixture',setup(builder){
        builder.onResolve({filter:/^@\/api$|enhancedDiaryWorkspaceProjectLifecycle$|enhancedDiaryProjectIndex$|enhancedDiaryProjectContainer$/},({path})=>({path,namespace:'project-fixture'}));
        builder.onLoad({filter:/.*/,namespace:'project-fixture'},({path})=>{
            const names=path==='@/api'?['appendBlockChecked','createDocWithMd','getBlockAttrsChecked','getChildBlocksChecked','getPathByID','insertBlockChecked','setBlockAttrsChecked']:
                path.endsWith('ProjectLifecycle')?['validateEnhancedDiaryProjectWriteTarget']:
                path.endsWith('ProjectIndex')?['readEnhancedDiaryProjectIndex','rebuildEnhancedDiaryProjectIndexAfterChange']:
                ['isDirectChildPath','listDirectProjectDocs','resolveProjectContainer'];
            return {contents:names.map((name)=>`export const ${name}=(...args)=>globalThis.__workspaceProjectFixture.${name}(...args);`).join('\n'),loader:'js'};
        });
    }}],
});
const projectService=await import(`data:text/javascript;base64,${Buffer.from(projectServiceBuild.outputFiles[0].text).toString('base64')}`);
await check("N/O real root/child creation services retain location, heading, attribute readback and index verification",async()=>{
    for(const mode of ['root','child']){
        const rootId='20261019000000-aaaaaaa',childId='20261019000000-bbbbbbb',calls=[],headings=[],attrs={};
        const api={
            resolveProjectContainer:async()=>({mode:'notebook',notebookId:'book'}),listDirectProjectDocs:async()=>[],
            createDocWithMd:async()=>{calls.push('create');return rootId;},getPathByID:async()=>{calls.push('path');return {notebook:'book',path:`/${rootId}.sy`};},
            validateEnhancedDiaryProjectWriteTarget:async()=>{calls.push('validate');return {kind:'root',id:rootId,rootProjectId:rootId};},
            getChildBlocksChecked:async()=>{calls.push('headings');return headings;},
            appendBlockChecked:async(_type,markdown)=>{calls.push('append');headings.push({id:childId,type:'h',subtype:'h1',markdown,content:'child'});return [{doOperations:[{action:'insert',id:childId}]}];},
            insertBlockChecked:async()=>{throw new Error('unexpected sibling insertion');},
            setBlockAttrsChecked:async(id,value)=>{calls.push('attrs-write');attrs[id]=value;},getBlockAttrsChecked:async(id)=>{calls.push('attrs-read');return attrs[id]||{};},
            rebuildEnhancedDiaryProjectIndexAfterChange:async()=>{calls.push('rebuild');return {lastStatus:'success'};},
            readEnhancedDiaryProjectIndex:async()=>{calls.push('index-read');return {roots:{[rootId]:{id:rootId}},nodes:{[childId]:{id:childId}}};},
        };
        globalThis.__workspaceProjectFixture=api;
        const input={storage:{mode:'notebook',notebookId:'book'},name:mode,parentTargetId:rootId};
        const create=mode==='root'?projectService.createEnhancedDiaryRootProject:projectService.createEnhancedDiarySubproject;
        assert.equal(await create(input),mode==='root'?rootId:childId);
        if(mode==='root')assert.deepEqual(calls,['create','path','rebuild','index-read']);
        else{
            assert.equal(calls.filter((c)=>c==='validate').length,2);
            assert(calls.indexOf('attrs-read')>calls.indexOf('attrs-write'));
            assert(calls.indexOf('rebuild')>calls.indexOf('attrs-read'));
            assert.equal(calls.at(-1),'index-read');
        }
        api.rebuildEnhancedDiaryProjectIndexAfterChange=async()=>({lastStatus:'failed'});
        headings.length=0;
        await assert.rejects(create(input),(err)=>err instanceof projectService.EnhancedDiaryProjectCreatedButNotVerifiedError && err.stage==='index');
        if(mode==='root'){
            api.getPathByID=async()=>({notebook:'wrong',path:'/wrong.sy'});
            await assert.rejects(create(input),/所属笔记本/);
        }
    }
    delete globalThis.__workspaceProjectFixture;
});

await check("Svelte production components compile with submitting states and scoped styles",async()=>{
    for(const name of ['enhancedDiaryWorkspacePage.svelte','components/TaskEditorDialog.svelte','components/QuickRecordDialog.svelte','components/WorkspaceFormalProjectPanel.svelte']){
        const result=compile(await read(name),{filename:resolve(root,base,name),generate:'client'});
        assert(!result.warnings.some((w)=>w.code==='non_reactive_update'),name);
    }
});
console.log(`Passed ${groups} workspace action groups. Fixtures exercise production handlers/hosts and refresh coordination; no real user documents were modified.`);
