import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, transform } from "esbuild";
import { parse, compile } from "svelte/compiler";
import { setImmediate } from "node:timers/promises";
import * as echarts from "echarts/core.js";
import { ScatterChart } from "echarts/charts.js";
import { CalendarComponent, TooltipComponent } from "echarts/components.js";
import { SVGRenderer } from "echarts/renderers.js";

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
let detailRetry;
function walkTemplate(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "InlineComponent" && node.name === "WorkspaceCalendarDayDetail") {
        detailRetry = node.attributes.find((attribute) => attribute.name === "onRetry")?.value[0].expression;
    }
    Object.values(node).forEach((child) => Array.isArray(child) ? child.forEach(walkTemplate) : walkTemplate(child));
}
walkTemplate(parse(page).html);
assert(detailRetry, "production retry event is wired");
const pageFunctions = functions(page, ["submitNewTaskForWorkspace", "createRecord", "toggleTask", "loadCalendar", "loadSelectedDayDetail", "ensureHistoryRecordsLoaded", "ensureReviewHistoryLoaded", "previousMonth", "nextMonth", "jumpCalendarToToday"]);
const pageMount = nodes(page).findLast((n) => n.type === "ExpressionStatement" && n.expression.callee?.name === "onMount");
const createPage = await factory(`
export function createPage(api) {
const {$state,window,showMessage,loadEnhancedDiaryWorkspaceState,buildWorkspaceCalendarMonth,loadWorkspaceDayDetail,
getOrCreateTodayDiaryDocument,addNewTaskToDiary,addWorkspaceQuickRecord,toggleWorkspaceTaskComplete,loadWorkspaceHistoryRecords,loadWorkspaceReviewHistory}=api;
const console={warn:(...args)=>api.warnings.push(String(args[0]))};
let state=api.initialState, loading=false, actionBusy=false, calendarLoading=false, dayDetailLoading=false, dayDetailError="";
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
const formatDiaryDate=(date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
let destroy;const onMount=(fn)=>{destroy=fn();};
${section(page, "    let refreshFlight:", "    async function saveWorkspaceSettings(")}
${pageFunctions}
return {refresh,submit:submitNewTaskForWorkspace,createRecord,toggleTask,beginWorkspaceAction,finishWorkspaceAction,
event:handleEnhancedDiaryIndexesUpdated,taskEvent:handleTaskDataUpdated,refreshAfterWorkspaceMutation,
loadCalendar,loadSelectedDayDetail,ensureHistoryRecordsLoaded,ensureReviewHistoryLoaded,
previousMonth,nextMonth,jumpCalendarToToday,retry:${page.slice(detailRetry.start,detailRetry.end)},
mount(){${page.slice(pageMount.start,pageMount.end)}},destroy(){destroy?.();},
snapshot:()=>({state,loading,actionBusy,calendarDays,selectedDayDetail,calendarDate,selectedCalendarDate,calendarLoading,dayDetailLoading,dayDetailError,dayDetailCache,pendingTask,pendingTaskVersion,workspaceMutationVersion,workspaceRefreshVersion,workspaceStateVersion,projectRefreshVersion,externalWorkspaceRefreshPending,failedRefreshVersion,advancedEnabled}),
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
const coreCompletes=(promise)=>Promise.race([promise,setImmediate().then(()=>{throw new Error('core refresh waited for an optional panel');})]);
function fixture({load,write,calendar,detail,history,review,initialState,today}={}) {
    const timers=new Map(),listeners=new Map(),messages=[],calls={load:0,calendar:0,detail:0,task:0,record:0,toggle:0};
    let timerId=0,revision=0,completed=false;
    const records=[];
    const snapshot=()=>({config:{dailyNotebookId:'notebook',projectStorage:{}},date:new Date(2026,9,19),revision,tasks:[{blockId:'task',taskname:'fixture',completed,markdown:completed?'- [x] fixture':'- [ ] fixture'}],projects:[],records:[...records]});
    const api={warnings:[],initialState:initialState===null?null:initialState||snapshot(),$state:(v)=>v,showMessage:(msg)=>messages.push(msg),
        window:{setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},addEventListener(n,f){listeners.set(n,f);},removeEventListener(n){listeners.delete(n);}},
        loadEnhancedDiaryWorkspaceState:async(...args)=>{calls.load++;return load?load(snapshot(),...args):snapshot();},
        buildWorkspaceCalendarMonth:async(...args)=>{calls.calendar++;return calendar?calendar(...args):[{revision}];},loadWorkspaceDayDetail:async(...args)=>{calls.detail++;return detail?detail(...args):{revision};},
        getOrCreateTodayDiaryDocument:async()=>today?today():({ok:true,docId:'diary'}),
        addNewTaskToDiary:async()=>{calls.task++;return write?write():{ok:true};},
        addWorkspaceQuickRecord:async(_plugin,_config,categoryTitle,content)=>{calls.record++;const result=write?await write():{ok:true};if(result.ok)records.push({headingBlockId:`record-${calls.record}`,categoryTitle,content});return result;},
        toggleWorkspaceTaskComplete:async()=>{calls.toggle++;const result=write?await write():{ok:true};if(result.ok){completed=!completed;revision++;}return result;},
        loadWorkspaceHistoryRecords:async()=>history?history():[],loadWorkspaceReviewHistory:async()=>review?review():[],
    };
    const runtime=createPage(api);
    return {runtime,api,calls,messages,timers,listeners,snapshot,setRevision(v){revision=v;},async mount(){runtime.mount();await runtime.flight();},
        async timersRun(){const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();await tick();await runtime.settle();},
        emit(name){listeners.get(name)?.();}};
}

const refreshMeasurements=[];
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
await check("acceptance operation refresh counts include synchronous index event bursts and completion reversal",async()=>{
    for(const operation of ['create-task','complete-task','undo-completion','create-record']){
        let f;
        f=fixture({write:()=>{f.emit('task');f.emit('diary');f.emit('task');return {ok:true};}});
        await f.mount();
        if(operation==='undo-completion'){
            await f.runtime.toggleTask(f.runtime.snapshot().state.tasks[0]);await f.runtime.settle();
            assert.equal(f.runtime.snapshot().state.tasks[0].completed,true);
        }
        const before={...f.calls};
        if(operation==='create-task')assert.equal(await f.runtime.submit({taskname:'synthetic'}),true);
        else if(operation==='create-record')assert.equal(await f.runtime.createRecord({categoryTitle:'synthetic',content:'synthetic'}),true);
        else await f.runtime.toggleTask(f.runtime.snapshot().state.tasks[0]);
        await f.runtime.settle();await f.timersRun();
        const delta=Object.fromEntries(Object.entries(f.calls).map(([key,value])=>[key,value-before[key]]));
        assert.equal(delta.load,1);assert.equal(delta.calendar,1);assert.equal(delta.detail,1);assert.equal(f.timers.size,0);
        if(operation==='complete-task'||operation==='undo-completion')assert.equal(f.runtime.snapshot().state.tasks[0].completed,operation==='complete-task');
        if(operation==='create-record')assert.equal(f.runtime.snapshot().state.records.length,1);
        refreshMeasurements.push({operation,...delta});f.runtime.destroy();
    }
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
await check("calendar failure preserves only the calendar; core publication clears covered pending intent",async()=>{
    let fail=false;const f=fixture({calendar:()=>{if(fail)throw new Error('calendar failed');return [];}});
    await f.mount();const old=f.runtime.snapshot();fail=true;f.setRevision(8);
    await f.runtime.refreshAfterWorkspaceMutation(true);await tick();
    assert.notEqual(f.runtime.snapshot().state,old.state);assert.equal(f.runtime.snapshot().state.revision,8);
    assert.equal(f.runtime.snapshot().calendarDays,old.calendarDays);
    assert.equal(f.runtime.snapshot().selectedDayDetail.revision,8);
    assert.equal(f.runtime.snapshot().externalWorkspaceRefreshPending,false);assert.equal(f.calls.load,2);
    assert.equal(f.runtime.snapshot().failedRefreshVersion,-1);assert.equal(f.runtime.snapshot().workspaceMutationVersion,1);
    assert.equal(f.runtime.snapshot().projectRefreshVersion,0);assert.equal(f.runtime.snapshot().calendarLoading,false);
    assert(f.messages.some((message)=>message.includes('日历加载失败')));
    assert(!f.messages.some((message)=>message.includes('工作区刷新失败')));
});
await check("isolation A/B initial optional panel failures still publish tasks, records and projects",async()=>{
    for(const panel of ['calendar','detail']){
        const f=fixture({initialState:null,load:(state)=>({...state,records:[{content:'fixture record'}],projects:[{id:'fixture project'}]}),
            [panel]:()=>{throw new Error(`${panel} failed`);}});
        await coreCompletes(f.mount());await tick();
        const current=f.runtime.snapshot();assert.equal(current.loading,false);assert.equal(current.state.tasks.length,1);
        assert.equal(current.state.records[0].content,'fixture record');assert.equal(current.state.projects[0].id,'fixture project');
        assert.equal(current.calendarLoading,false);assert.equal(current.dayDetailLoading,false);
        assert.equal(f.messages.length,1);assert(f.messages[0].includes(panel==='calendar'?'日历加载失败':'日期详情读取失败'));
        f.runtime.destroy();
    }
});
await check("isolation C/D never-settling panels cannot block core refresh, later mutations or manual retry",async()=>{
    for(const panel of ['calendar','detail']){
        const blocked=deferred();let hold=true;
        const f=fixture({initialState:null,[panel]:()=>hold?blocked.promise:panel==='calendar'?[{revision:10}]:{revision:10}});
        await coreCompletes(f.mount());assert.equal(f.runtime.snapshot().loading,false);
        f.setRevision(10);assert.equal(await coreCompletes(f.runtime.refresh()),true);
        assert.equal(f.runtime.snapshot().state.revision,10);
        const task=f.runtime.snapshot().state.tasks[0];await f.runtime.toggleTask(task);await coreCompletes(f.runtime.settle());
        assert.equal(f.runtime.snapshot().state.tasks[0].completed,true);assert.equal(f.runtime.snapshot().pendingTask,null);
        assert.equal(f.runtime.snapshot().externalWorkspaceRefreshPending,false);
        hold=false;
        if(panel==='calendar')await f.runtime.loadCalendar();else await f.runtime.loadSelectedDayDetail('2026-10-19');
        const latest=f.runtime.snapshot();assert.equal(latest.calendarLoading,false);assert.equal(latest.dayDetailLoading,false);
        blocked.resolve(panel==='calendar'?[{revision:0}]:{revision:0});await tick();
        assert.deepEqual(f.runtime.snapshot()[panel==='calendar'?'calendarDays':'selectedDayDetail'],panel==='calendar'?[{revision:10}]:{revision:10});
        f.runtime.destroy();
    }
});
await check("isolation E confirmed task completion publishes despite calendar failure, without another full refresh",async()=>{
    let fail=false;const f=fixture({calendar:()=>{if(fail)throw new Error('calendar failed');return [];}});await f.mount();fail=true;
    await f.runtime.toggleTask(f.runtime.snapshot().state.tasks[0]);await f.runtime.settle();await tick();
    const current=f.runtime.snapshot();assert.equal(current.state.tasks[0].completed,true);assert.equal(current.state.tasks[0].markdown,'- [x] fixture');
    assert.equal(current.pendingTask,null);assert.equal(current.pendingTaskVersion,0);assert.equal(current.externalWorkspaceRefreshPending,false);
    assert.equal(f.calls.load,2);assert.equal(f.timers.size,0);
});
await check("isolation F confirmed record closes once and publishes despite failed date detail; date selection retries",async()=>{
    let fail=false;const f=fixture({detail:()=>{if(fail)throw new Error('detail failed');return {revision:0};}});await f.mount();fail=true;
    const h=host(f.runtime.createRecord,'record'),d=await createDialog('QuickRecordDialog',{...h.props,initialContent:'new record'},f.messages);
    await d.submit();await f.runtime.settle();await tick();
    assert.equal(h.closed(),1);assert.equal(f.runtime.snapshot().state.records[0].content,'new record');
    await d.submit();assert.equal(f.calls.record,1);assert.equal(f.calls.load,2);
    assert.equal(f.runtime.snapshot().dayDetailLoading,false);assert(f.messages.some((m)=>m.includes('日期详情读取失败')));
    fail=false;await f.runtime.loadSelectedDayDetail('2026-10-20');assert.equal(f.runtime.snapshot().selectedCalendarDate,'2026-10-20');
    assert.equal(f.runtime.snapshot().dayDetailLoading,false);
});
await check("isolation I core loading uses the newest month/date and late optional responses cannot overwrite it",async()=>{
    const core=deferred(),month=deferred(),day=deferred();let holdCore=false,holdPanels=false;
    const f=fixture({load:(value)=>holdCore?core.promise:value,
        calendar:(_plugin,year,monthIndex)=>holdPanels?month.promise:[{month:`${year}-${monthIndex}`}],
        detail:(date)=>holdPanels?day.promise:{day:date.getDate()}});
    await f.mount();holdPanels=true;await coreCompletes(f.runtime.refresh());
    const oldMonth=f.runtime.loadCalendar(),oldDay=f.runtime.loadSelectedDayDetail('2026-10-21');
    holdCore=true;const refreshing=f.runtime.refresh();await tick();holdPanels=false;
    await f.runtime.nextMonth();await f.runtime.loadSelectedDayDetail('2026-11-07');
    core.resolve(f.snapshot());assert.equal(await coreCompletes(refreshing),true);await tick();
    const latest=f.runtime.snapshot();assert.equal(latest.calendarDate.getMonth(),10);assert.equal(latest.selectedCalendarDate,'2026-11-07');
    assert.deepEqual(latest.calendarDays,[{month:'2026-10'}]);assert.deepEqual(latest.selectedDayDetail,{day:7});
    month.resolve([{month:'old'}]);day.resolve({day:21});await Promise.all([oldMonth,oldDay]);
    assert.deepEqual(f.runtime.snapshot().calendarDays,latest.calendarDays);assert.deepEqual(f.runtime.snapshot().selectedDayDetail,latest.selectedDayDetail);
    assert.equal(f.runtime.snapshot().calendarLoading,false);assert.equal(f.runtime.snapshot().dayDetailLoading,false);
});
await check("isolation I overlapping month navigation starts detail reads immediately; an old today jump cannot restore its date",async()=>{
    const blocked=deferred();let hold=false;
    const f=fixture({calendar:()=>hold?blocked.promise:[]});await f.mount();hold=true;await coreCompletes(f.runtime.refresh());
    const old=f.runtime.jumpCalendarToToday();await tick();hold=false;
    await f.runtime.nextMonth();await f.runtime.loadSelectedDayDetail('2026-11-09');
    blocked.resolve([]);await old;
    assert.equal(f.runtime.snapshot().selectedCalendarDate,'2026-11-09');
    await f.runtime.previousMonth();assert.equal(f.runtime.snapshot().calendarDate.getMonth(),9);
});
await check("isolation J optional requests cannot update revoked, destroyed or newly mounted instances",async()=>{
    for(const revoke of [false,true]){
        const calendar=deferred(),detail=deferred();const f=fixture({calendar:()=>calendar.promise,detail:()=>detail.promise});await coreCompletes(f.mount());
        if(revoke)f.emit('homepage-advanced-unavailable');else f.runtime.destroy();
        const old=f.runtime.snapshot();const messages=f.messages.length;
        calendar.resolve([{revision:99}]);detail.reject(new Error('late detail error'));await tick();
        assert.deepEqual(f.runtime.snapshot(),old);assert.equal(f.messages.length,messages);
        const reads={...f.calls};await f.runtime.loadCalendar();await f.runtime.loadSelectedDayDetail('2026-10-22');assert.deepEqual(f.calls,reads);
        f.runtime.destroy();assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
        const next=fixture();await next.mount();assert(next.runtime.snapshot().state);assert.deepEqual(next.runtime.snapshot().calendarDays,[{revision:0}]);next.runtime.destroy();
    }
});
await check("panel loading ownership survives stale completions, cached navigation and a failed newer core read",async()=>{
    const old=deferred(),latest=deferred();let hold=false;
    const f=fixture({detail:(date)=>hold?(date.getDate()===21?old.promise:latest.promise):{day:date.getDate()}});await f.mount();hold=true;
    const first=f.runtime.loadSelectedDayDetail('2026-10-21'),second=f.runtime.loadSelectedDayDetail('2026-10-22');
    old.resolve({day:21});await first;assert.equal(f.runtime.snapshot().dayDetailLoading,true);
    latest.resolve({day:22});await second;assert.equal(f.runtime.snapshot().dayDetailLoading,false);
    assert.deepEqual(f.runtime.snapshot().selectedDayDetail,{day:22});

    const month=deferred(),day=deferred();let blocked=false;
    const g=fixture({calendar:()=>blocked?month.promise:[{month:'October'}],detail:()=>blocked?day.promise:{day:19}});await g.mount();blocked=true;
    const away=g.runtime.nextMonth();await tick();await g.runtime.loadSelectedDayDetail('2026-10-19');
    assert.equal(g.runtime.snapshot().dayDetailLoading,false);
    blocked=false;await g.runtime.previousMonth();assert.equal(g.runtime.snapshot().calendarLoading,false);
    month.resolve([{month:'November'}]);day.resolve({day:1});await away;
    assert.deepEqual(g.runtime.snapshot().calendarDays,[{month:'October'}]);

    const retired=deferred();let fail=false;
    const h=fixture({load:(state)=>{if(fail)throw new Error('core failed');return state;},detail:(date)=>date.getDate()===21?retired.promise:{day:19}});await h.mount();
    const pending=h.runtime.loadSelectedDayDetail('2026-10-21');fail=true;await h.runtime.refreshAfterWorkspaceMutation();
    retired.resolve({day:21});await pending;
    assert.equal(h.runtime.snapshot().dayDetailLoading,false);assert.equal(h.runtime.snapshot().selectedDayDetail,null);
    assert.equal(h.runtime.snapshot().externalWorkspaceRefreshPending,true);
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
        if(!partial)refreshMeasurements.push({operation:`create-project-${mode}`,projectPanelRefreshes:refreshCalls});
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
                path.endsWith('ProjectIndex')?['readEnhancedDiaryProjectIndex','refreshEnhancedDiaryProjectIndexAfterCreation']:
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
            refreshEnhancedDiaryProjectIndexAfterCreation:async()=>{calls.push('creation-index');return {lastStatus:'success'};},
            readEnhancedDiaryProjectIndex:async()=>{calls.push('index-read');return {roots:{[rootId]:{id:rootId}},nodes:{[childId]:{id:childId}}};},
        };
        globalThis.__workspaceProjectFixture=api;
        const input={storage:{mode:'notebook',notebookId:'book'},name:mode,parentTargetId:rootId};
        const create=mode==='root'?projectService.createEnhancedDiaryRootProject:projectService.createEnhancedDiarySubproject;
        assert.equal(await create(input),mode==='root'?rootId:childId);
        if(mode==='root')assert.deepEqual(calls,['create','path','creation-index','index-read']);
        else{
            assert.equal(calls.filter((c)=>c==='validate').length,2);
            assert(calls.indexOf('attrs-read')>calls.indexOf('attrs-write'));
            assert(calls.indexOf('creation-index')>calls.indexOf('attrs-read'));
            assert.equal(calls.at(-1),'index-read');
        }
        api.refreshEnhancedDiaryProjectIndexAfterCreation=async()=>({lastStatus:'failed'});
        headings.length=0;
        await assert.rejects(create(input),(err)=>err instanceof projectService.EnhancedDiaryProjectCreatedButNotVerifiedError && err.stage==='index');
        if(mode==='root'){
            api.getPathByID=async()=>({notebook:'wrong',path:'/wrong.sy'});
            await assert.rejects(create(input),/所属笔记本/);
        }
    }
    delete globalThis.__workspaceProjectFixture;
});

// Real lookup/index/Markdown parsing and detail service; only Kernel I/O is controlled.
const diaryBase = "src/components/utils/widgetBlock/widget/enhancedDiary/";
const detailBundle = await build({
    stdin: {resolveDir:root, contents:`
        export {loadWorkspaceDayDetail} from "./${base}enhancedDiaryWorkspaceDayDetail.ts";
        export {lookupDiaryDocumentForDate} from "./${diaryBase}enhancedDiaryDoc.ts";
        export {DEFAULT_ENHANCED_DIARY_CONFIG} from "./${diaryBase}enhancedDiaryTypes.ts";
        export {default as DetailPanel} from "./${base}components/WorkspaceCalendarDayDetail.svelte";
        export {render} from "svelte/server";
    `},bundle:true,write:false,format:'esm',platform:'node',alias:{'@':resolve(root,'src')},
    plugins:[{name:'day-detail-kernel-fixture',setup(builder){
        builder.onResolve({filter:/^@\/api$|^@\/components\/tools\/siyuanComponentDataApi$|^@\/components\/tools\/openDocs$/},({path})=>({path,namespace:'day-io'}));
        builder.onLoad({filter:/.*/,namespace:'day-io'},({path})=>{
            const names=path==='@/api'?['exportMdContent','renderSprig','createDailyNote','appendBlockChecked','insertBlockChecked','updateBlockChecked','deleteBlockChecked','getChildBlocksChecked','sqlChecked','getFile','getFileChecked','getFileOrNullChecked','listDocsByPathChecked','putFileChecked']:
                path.endsWith('openDocs')?['openDocs']:['prepareChangedRecentDocsForIndex'];
            return {contents:names.map(name=>`export const ${name}=(...args)=>globalThis.__dayDetailKernel.${name}(...args);`).join('\n'),loader:'js'};
        });
        builder.onLoad({filter:/\.svelte$/},async({path})=>({contents:compile(await readFile(path,'utf8'),{filename:path,generate:'server',css:'external'}).js.code,loader:'js',resolveDir:resolve(path,'..')}));
    }}],
});
const detailService=await import(`data:text/javascript;base64,${Buffer.from(detailBundle.outputFiles[0].text).toString('base64')}`);
function detailKernel() {
    const book='20261001000000-bbbbbbb',ids=new Map([19,20,21,22].map(day=>[day,`202610${day}000000-aaaaaaa`]));
    const config={...structuredClone(detailService.DEFAULT_ENHANCED_DIARY_CONFIG),dailyNotebookId:book};
    const payload={version:4,updatedAt:'2026-10-19T00:00:00Z',notebookId:book,complete:true,
        docs:Object.fromEntries([...ids].map(([day,id])=>[`202610${day}`,{id,date:`202610${day}`,box:book,title:'fixture'}]))};
    const calls=[],gates=new Map();let mode='ok';
    const readIndex=async(path)=>{calls.push('index-read');assert(path.endsWith('/enhanced-diary-index.json'));
        if(mode==='index-error')throw new Error('index transport failed');
        return new Blob([JSON.stringify(mode==='index-corrupt'?{version:4}:mode==='index-incomplete'?{...payload,complete:false}:payload)]);};
    globalThis.__dayDetailKernel={getFile:readIndex,getFileChecked:readIndex,getFileOrNullChecked:readIndex,
        sqlChecked:async(stmt)=>{calls.push('sql');assert(/WHERE id = '[^']+' LIMIT 1$/.test(stmt));
            if(mode==='sql-error')throw new Error('SQL unavailable');if(mode==='sql-missing')return [];
            const [day,id]=[...ids].find(([,id])=>stmt.includes(id));
            return [{id,type:'d',box:book,content:'fixture',ial:`{: custom-dailynote-202610${day}="202610${day}"}`}];},
        exportMdContent:async(id)=>{calls.push('markdown');if(gates.has(id))return gates.get(id).promise;
            if(mode==='markdown-error')throw new Error('export failed');if(mode==='markdown-null')return null;
            return {content:config.templates.day};},
        putFileChecked:async(path,_isDir,blob)=>{calls.push('write');assert.equal(mode,'sql-missing','only confirmed deletion may clean the index');
            if(path.endsWith('/enhanced-diary-index.json'))Object.assign(payload,JSON.parse(await blob.text()));},
    };
    for(const name of ['renderSprig','createDailyNote','appendBlockChecked','insertBlockChecked','updateBlockChecked','deleteBlockChecked','getChildBlocksChecked','listDocsByPathChecked','openDocs','prepareChangedRecentDocsForIndex']) {
        globalThis.__dayDetailKernel[name]=()=>{throw new Error(`unexpected ${name}`);};
    }
    return {config,payload,calls,ids,gates,mode(value){mode=value;},date(day){return new Date(2026,9,day);},
        workspace(){return fixture({load:(state)=>({...state,config}),detail:(date,cfg)=>detailService.loadWorkspaceDayDetail(date,cfg)});}};
}
await check("day detail missing and existing documents use real strict lookup and formal template parsing",async()=>{
    const k=detailKernel();
    const exists=await detailService.loadWorkspaceDayDetail(k.date(19),k.config);
    assert.equal(exists.hasDiary,true);assert.equal(exists.templateValid,true);assert.equal(exists.date,'2026-10-19');
    const existingHtml=detailService.render(detailService.DetailPanel,{props:{detail:exists,onOpenDoc:()=>{}}}).body;
    assert(existingHtml.includes('有日记')&&!existingHtml.includes('无日记'));
    delete k.payload.docs['20261020'];
    const missing=await detailService.loadWorkspaceDayDetail(k.date(20),k.config);
    assert.equal(missing.hasDiary,false);assert.equal(missing.reviewStatusText,'无日记');
    const missingHtml=detailService.render(detailService.DetailPanel,{props:{detail:missing,onOpenDoc:()=>{}}}).body;
    assert(missingHtml.includes('无日记')&&!missingHtml.includes('日期详情读取失败'));
    assert(!k.calls.includes('write'));
    k.mode('sql-missing');assert.equal((await detailService.loadWorkspaceDayDetail(k.date(19),k.config)).hasDiary,false);
    assert(!k.payload.docs['20261019'],'authoritatively confirmed missing docs retain normal cleanup');
});
await check("unreadable Markdown, SQL and index states reject without empty details or writes",async()=>{
    for(const mode of ['markdown-error','markdown-null','sql-error','index-error','index-corrupt','index-incomplete']){
        const k=detailKernel();k.mode(mode);
        await assert.rejects(detailService.loadWorkspaceDayDetail(k.date(19),k.config));
        assert(!k.calls.includes('write'),mode);assert.equal(Object.keys(k.payload.docs).length,4);
    }
    const k=detailKernel(),invalid={...k.config,headingStructure:new Proxy({}, {get(){throw new Error('parser input failed');}})};
    await assert.rejects(detailService.loadWorkspaceDayDetail(k.date(19),invalid),/parser input failed/);
    assert(!k.calls.includes('write'));
});
await check("real service failure renders an error, is not cached, and the production retry event recovers",async()=>{
    const k=detailKernel(),f=k.workspace();await f.mount();await tick();const core=f.runtime.snapshot().state;
    k.mode('markdown-error');await f.runtime.loadSelectedDayDetail('2026-10-20');
    let snap=f.runtime.snapshot();assert.equal(snap.state,core);assert.equal(snap.selectedDayDetail,null);
    assert.equal(snap.selectedCalendarDate,'2026-10-20');assert.equal(snap.dayDetailError,'日期详情读取失败');
    assert(!snap.dayDetailCache.has('2026-10-20'));assert(snap.dayDetailCache.has('2026-10-19'));
    const html=detailService.render(detailService.DetailPanel,{props:{detail:{date:'2099-01-01',hasDiary:false},
        error:snap.dayDetailError,selectedDate:snap.selectedCalendarDate,onRetry:()=>{},onOpenDoc:()=>{}}}).body;
    assert(html.includes('role="alert"')&&html.includes('日期详情读取失败')&&html.includes('重试'));
    assert(!html.includes('无日记')&&!html.includes('2099-01-01'));
    const reads=k.calls.length;await tick();assert.equal(k.calls.length,reads,'no automatic retry loop');
    k.mode('ok');await f.runtime.retry();snap=f.runtime.snapshot();assert.equal(snap.dayDetailError,'');
    assert.equal(snap.selectedCalendarDate,'2026-10-20');assert.equal(snap.selectedDayDetail.hasDiary,true);
    assert(snap.dayDetailCache.has('2026-10-20'));const cachedReads=k.calls.length;
    await f.runtime.loadSelectedDayDetail('2026-10-20');assert.equal(k.calls.length,cachedReads);
    f.runtime.destroy();
});
await check("real day reads isolate old failures, late success, leaving calendar, close and permission revocation",async()=>{
    for(const rejectOld of [false,true]){
        const k=detailKernel(),f=k.workspace();await f.mount();await tick();
        const old=deferred();k.gates.set(k.ids.get(20),old);
        const pending=f.runtime.loadSelectedDayDetail('2026-10-20');await tick();
        await f.runtime.loadSelectedDayDetail('2026-10-21');
        if(rejectOld)old.reject(new Error('late export'));else old.resolve({content:k.config.templates.day});
        await pending;const snap=f.runtime.snapshot();assert.equal(snap.selectedCalendarDate,'2026-10-21');
        assert.equal(snap.selectedDayDetail.date,'2026-10-21');assert.equal(snap.dayDetailError,'');
        assert(!snap.dayDetailCache.has('2026-10-20'));f.runtime.destroy();
    }
    for(const ending of ['leave','close','revoke']){
        const k=detailKernel(),f=k.workspace();await f.mount();await tick();const waiting=deferred();k.gates.set(k.ids.get(20),waiting);
        const reading=f.runtime.loadSelectedDayDetail('2026-10-20');await tick();f.runtime.tab('tasks');
        if(ending==='close')f.runtime.destroy();if(ending==='revoke')f.emit('homepage-advanced-unavailable');
        waiting.resolve({content:k.config.templates.day});await reading;const snap=f.runtime.snapshot();
        assert.equal(snap.dayDetailError,'');assert.equal(snap.dayDetailCache.has('2026-10-20'),ending==='leave');
        if(ending==='leave')assert.equal(snap.selectedDayDetail.date,'2026-10-20');else assert.equal(snap.selectedDayDetail,null);
        f.runtime.destroy();
    }
});
await check("an initial real detail failure cannot block core publication or create a missing-day cache",async()=>{
    const k=detailKernel();k.mode('sql-error');const f=k.workspace();await coreCompletes(f.mount());await tick();
    const snap=f.runtime.snapshot();assert(snap.state);assert.equal(snap.loading,false);
    assert.equal(snap.dayDetailLoading,false);assert.equal(snap.dayDetailError,'日期详情读取失败');
    assert.equal(snap.dayDetailCache.size,0);assert(!k.calls.includes('write'));f.runtime.destroy();
});
delete globalThis.__dayDetailKernel;

// Use the real ECharts model/view lifecycle, not a setOption stub.
echarts.use([ScatterChart, CalendarComponent, TooltipComponent, SVGRenderer]);
const calendarSource = await read("components/WorkspaceCalendarChart.svelte");
const calendarDestroy = nodes(calendarSource).find((n) => n.expression?.callee?.name === "onDestroy");
const createCalendar = await factory(`export function calendar(api) {
const {echarts,tick,onSelectDate}=api;
let chart=api.chart,days=api.days,year=2026,month=10,selectedDate='',isDestroyed=false,chartHeight=0;
let chartContainer={clientWidth:760},isCompact=api.compact,taskManagementEnabled=true,displaySettings={};
let initTimeout=null,themeTimeout=null,resizeRaf=null,resizeObserver=null,themeObserver=null,destroy;
const onDestroy=(fn)=>destroy=fn;
const readThemeColors=()=>({bg:'#fff',surface:'#fff',onBg:'#111',onSurface:'#111',muted:'#666',primary:'#08f',error:'#f00',border:'#ccc'});
${functions(calendarSource,['renderChart','getCalendarGeometry','getCalendarRowCount','getDateRange','calcActivityScore','buildOption','isImportantLunarDay','formatToday','handleChartClick'])}
${calendarSource.slice(calendarDestroy.start,calendarDestroy.end)}
return {renderChart,click:handleChartClick,select:(date)=>selectedDate=date,
month:(next,entries)=>{month=next;days=entries;},destroy:()=>destroy()};
}`, 'calendar');
const calendarDay=(date,hasDiary=false)=>({date,hasDiary,newTaskCount:0,migratedTaskCount:0,quickRecordCount:0,
completedReviewCount:0,pendingReviewCount:0,metadata:{lunarDayName:'初七',solarTermName:'',solarFestivalName:'',lunarFestivalName:'',legalHolidayName:''}});
await check("calendar selection retains the live ECharts tooltip across diary/empty dates, month and resize updates",async()=>{
    for(const compact of [false,true]){
        const days=[calendarDay('2026-11-14',true),calendarDay('2026-11-15')];
        const f=fixture({detail:(date)=>({hasDiary:date.getDate()===14})});await f.mount();
        const chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:760,height:584});
        const c=createCalendar({chart,echarts,days,compact,tick:async()=>{},onSelectDate:(day)=>f.runtime.loadSelectedDayDetail(day.date)});
        try{
            await c.renderChart();
            const tooltip=chart.getViewOfComponentModel(chart.getModel().getComponent('tooltip'));
            for(const day of days){
                c.click({componentType:'series',value:[day.date,0]});await tick();
                assert.equal(f.runtime.snapshot().selectedCalendarDate,day.date);
                assert.equal(f.runtime.snapshot().selectedDayDetail.hasDiary,day.hasDiary);
                c.select(day.date);await c.renderChart();chart.resize();
                assert.ok(chart.getViewOfComponentModel(chart.getModel().getComponent('tooltip'))===tooltip,
                    'selection must not dispose the tooltip while its keep-show callback can still run');
                const formatter=chart.getModel().getComponent('tooltip').get('formatter');
                assert(formatter({value:[day.date,0]}).includes(day.date),'hover details remain available');
            }
            const december=[calendarDay('2026-12-01')];c.month(11,december);await c.renderChart();
            assert.equal(chart.getModel().getSeriesByIndex(0).getData().count(),1,'old month rows are replaced');
            assert.deepEqual(chart.getModel().getSeriesByIndex(0).getData().getRawDataItem(0).value,['2026-12-01',0]);
            assert.ok(chart.getViewOfComponentModel(chart.getModel().getComponent('tooltip'))===tooltip);
            c.destroy();assert.equal(chart.isDisposed(),true,'leaving calendar disposes the chart');
            await c.renderChart();
        }finally{if(!chart.isDisposed())c.destroy();f.runtime.destroy();}
    }
});
await check("calendar destruction during a pending render cannot resize or update the disposed chart",async()=>{
    const waiting=deferred(),chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:760,height:584});
    const c=createCalendar({chart,echarts,days:[calendarDay('2026-11-15')],compact:false,tick:()=>waiting.promise});
    const rendering=c.renderChart();c.destroy();waiting.resolve();await rendering;assert.equal(chart.isDisposed(),true);
});
await check("leaving calendar during a day read preserves core state; closing drops the late response",async()=>{
    for(const close of [false,true]){
        const waiting=deferred();let held=false;
        const f=fixture({detail:(date)=>held?waiting.promise:{day:date.getDate()}});await f.mount();held=true;
        f.runtime.tab('calendar');const reading=f.runtime.loadSelectedDayDetail('2026-11-15');
        const core=f.runtime.snapshot().state;f.runtime.tab('tasks');if(close)f.runtime.destroy();
        const before=f.runtime.snapshot().selectedDayDetail;waiting.resolve({day:15,hasDiary:false});await reading;
        assert.equal(f.runtime.snapshot().state,core);
        assert.deepEqual(f.runtime.snapshot().selectedDayDetail,close?before:{day:15,hasDiary:false});
        f.runtime.destroy();
    }
});

await check("Svelte production components compile with submitting states and scoped styles",async()=>{
    for(const name of ['enhancedDiaryWorkspacePage.svelte','components/TaskEditorDialog.svelte','components/QuickRecordDialog.svelte','components/WorkspaceFormalProjectPanel.svelte','components/WorkspaceCalendarChart.svelte','components/WorkspaceCalendarPanel.svelte','components/WorkspaceCalendarDayDetail.svelte']){
        const result=compile(await read(name),{filename:resolve(root,base,name),generate:'client'});
        assert(!result.warnings.some((w)=>w.code==='non_reactive_update'),name);
    }
});
await check("created-but-unready diary keeps task input and does not close or write",async()=>{
    for(const reason of ['metadata_pending','index_not_ready','read_failed','out_of_scope','date_mismatch','creation_unknown']) {
        const f=fixture({today:async()=>({ok:false,docId:'known-diary',created:reason!=='creation_unknown',reason})});await f.mount();
        const h=host(f.runtime.submit),d=await createDialog('TaskEditorDialog',{...h.props,initialInput:{taskname:'retained without duplicate'}},f.messages);
        await d.submit();assert.equal(h.closed(),0);assert.equal(d.snapshot().taskname,'retained without duplicate');assert.equal(d.snapshot().submitting,false);
        assert.equal(f.calls.task,0);assert(f.messages.some(m=>m.includes('任务未写入')&&m.includes('请勿重复创建日记')));
    }
});
await check("created diary metadata readiness production regressions", async()=>{ await import("./verify-enhanced-diary-creation-readiness.mjs"); });
console.log(JSON.stringify({syntheticRefreshMeasurements:refreshMeasurements},null,2));
console.log(`Passed ${groups} workspace action groups. Fixtures exercise production handlers/hosts and refresh coordination; no real user documents were modified.`);
