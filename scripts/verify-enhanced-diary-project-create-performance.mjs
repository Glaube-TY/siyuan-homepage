import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from "node:child_process";

const root=resolve(import.meta.dirname,'..');
const dir='src/components/utils/widgetBlock/widget/enhancedDiary';
const lifecycleBaseline=process.argv.includes('--lifecycle-baseline');
async function projectBundle(realRecent=false){return build({stdin:{contents:`
export * from './${dir}/enhancedDiaryProjectIndex';
export * from './${dir}/enhancedDiaryProjectTypes';
export * from './${dir}/workspace/enhancedDiaryWorkspaceProjectService';
export * from './${dir}/workspace/enhancedDiaryWorkspaceProjectLifecycle';
export {setSiyuanRuntimePort} from './src/runtime/siyuan-runtime-port';
`,loader:'ts',resolveDir:root},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{
    name:'recent-doc-scope',setup(api){
        if(lifecycleBaseline)api.onLoad({filter:/[\\/]enhancedDiaryProjectIndex\.ts$/},({path})=>({
            contents:execFileSync('git',['show',`bb1567682e73cf18fe9e55a19f27182d297828ea:${path.slice(root.length+1).replaceAll('\\','/')}`],{cwd:root,encoding:'utf8'}),loader:'ts',resolveDir:resolve(path,'..'),
        }));
        if(!realRecent)api.onResolve({filter:/siyuanComponentDataApi$/},()=>({path:'recent',namespace:'fixture'}));
        api.onResolve({filter:/favorites-store$|notification-center-mobile-plan-manager$/},({path})=>({path:path.split('/').at(-1),namespace:'fixture'}));
        api.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='recent'?
            `export const prepareChangedRecentDocsForIndex=async()=>({changedDocs:globalThis.__projectCreateFixture.changedDocs,commit:async()=>{globalThis.__projectCreateFixture.commits++;}});`:
            (path==='favorites-store'?['addFavoriteItem','removeFavoriteItem','removeFavoriteItemsByIds','reorderFavoriteItems','readFavoritesIndexStrict','doesFavoritesIndexExist']:['requestMobilePlanRefresh']).map((name)=>`export const ${name}=()=>{};`).join('\n'),loader:'js'}));
    },
}]});}
const bundle=await projectBundle();
let recentBundle;
let sequence=0;
const id=(n)=>`20261019000000-${n.toString(36).padStart(7,'0')}`;
const notebook=id(999999),storage={mode:'notebook',notebookId:notebook};
const clone=(value)=>structuredClone(value);
async function fixture(count=5,{latency=0,parentDoc=false,realRecent=false}={}){
    const selected=realRecent?(recentBundle??=await projectBundle(true)):bundle;
    const app=await import(`data:text/javascript;base64,${Buffer.from(selected.outputFiles[0].text).toString('base64')}#${sequence++}`);
    const state={docs:[],children:new Map(),attrs:new Map(),file:undefined,changedDocs:[],calls:[],reads:0,writes:0,readbacks:0,awaitingReadback:false,
        readError:false,writeError:false,dropWrite:false,readbackError:false,attrError:false,childError:false,dirError:false,createCount:0,insertCount:0,
        commits:0,recentReads:0,recentWrites:0,recentFile:JSON.stringify({version:1,updatedAt:'fixture',docs:{},consumers:{}})};
    const recentPath='/data/storage/petal/siyuan-homepage/recent-doc-snapshot.json';
    const projectStorage=parentDoc?{mode:'parentDoc',parentDocId:id(888888)}:storage;
    const addRoot=(n,name=`Project ${n}`)=>{
        const doc={id:id(n),name,path:`${parentDoc?'/'+id(888888):''}/${id(n)}.sy`,mtime:1700000000+n,sort:state.docs.length};
        state.docs.push(doc);state.children.set(doc.id,[]);state.attrs.set(doc.id,{id:doc.id,updated:'20261019000000'});return doc.id;
    };
    let nodeSequence=700000;
    const addNode=(rootId,level=1,title='new child',n=nodeSequence++)=>{
        const nodeId=id(n);state.children.get(rootId).push({id:nodeId,type:'h',subtype:`h${level}`,markdown:`${'#'.repeat(level)} ${title}`});
        state.attrs.set(nodeId,{id:nodeId,[app.ENHANCED_DIARY_PROJECT_NODE_ATTR]:'true',updated:'20261019000000'});return nodeId;
    };
    for(let n=1;n<=count;n++){
        const rootId=addRoot(n);
        for(let j=0;j<1+n%5;j++)addNode(rootId,[1,2,3,2,1][j],`Node ${n}.${j}`,n*100+j+10000);
    }
    globalThis.__projectCreateFixture=state;
    app.setSiyuanRuntimePort({
        async getFile(path){
            if(realRecent&&path===recentPath){state.recentReads++;return state.recentFile;}
            assert.equal(path,app.ENHANCED_DIARY_PROJECT_INDEX_PATH);state.reads++;if(latency)await delay(latency);
            await state.readHook?.(state.reads);
            if(state.readError)throw new Error('synthetic storage read failure');
            if(state.awaitingReadback){state.awaitingReadback=false;state.readbacks++;if(state.readbackError)throw new Error('synthetic disk readback failure');}
            if(state.readResponse!==undefined)return clone(state.readResponse);
            return state.file===undefined?{code:404,msg:'missing'}:state.file;
        },
        async putFile(path,isDir,file){
            if(isDir){assert.equal(path,'/data/storage/petal/siyuan-homepage');return {code:0};}
            if(realRecent&&path===recentPath){state.recentWrites++;state.recentFile=await file.text();return {code:0};}
            assert.equal(path,app.ENHANCED_DIARY_PROJECT_INDEX_PATH);state.writes++;
            if(state.writeError)throw new Error('synthetic index write failure');
            if(!state.dropWrite)state.file=await file.text();
            if(state.corruptWrite)state.file=JSON.stringify({...JSON.parse(state.file),complete:false});
            state.awaitingReadback=true;
            return {code:0};
        },
        async post(path,payload){
            // Only an immediate storage read is write verification, not a later business read.
            state.awaitingReadback=false;
            state.calls.push({path,payload:clone(payload)});if(latency)await delay(latency);
            let data;
            if(realRecent&&path==='/api/storage/getRecentDocs')return {code:0,data:[]};
            if(path==='/api/filetree/listDocsByPath'){
                if(state.dirError)throw new Error('synthetic directory failure');
                data=state.dirResponse!==undefined?state.dirResponse:{files:clone(state.docs),box:notebook,path:payload.path};
            }else if(path==='/api/block/getChildBlocks'){
                if(state.childError)throw new Error('synthetic headings failure');
                await state.childHook?.(payload.id);
                data=clone(state.children.get(payload.id)??[]);
            }else if(path==='/api/attr/batchGetBlockAttrs'){
                if(state.attrError)return {code:403,msg:'permission denied'};
                data=state.attrResponse!==undefined?state.attrResponse:Object.fromEntries(payload.ids.filter((key)=>state.attrs.has(key)).map((key)=>[key,clone(state.attrs.get(key))]));
            }else if(path==='/api/query/sql'){
                assert(parentDoc&&payload.stmt.includes(`WHERE id = '${id(888888)}'`));
                data=[{id:id(888888),type:'d',box:notebook,path:`/${id(888888)}.sy`,hpath:'/Projects',content:'Projects'}];
            }else if(path==='/api/attr/getBlockAttrs')data=clone(state.attrs.get(payload.id)??{});
            else if(path==='/api/filetree/createDocWithMd'){
                state.createCount++;data=addRoot(900000+state.createCount,payload.path.split('/').at(-1));
            }else if(path==='/api/filetree/getPathByID')data=state.pathResponse??{notebook,path:state.docs.find((doc)=>doc.id===payload.id)?.path};
            else if(path==='/api/block/appendBlock'||path==='/api/block/insertBlock'){
                const owner=payload.parentID??[...state.children].find(([,rows])=>rows.some((row)=>row.id===payload.nextID))?.[0];
                assert(owner,'fixture insertion target exists');const match=/^(#{1,6}) (.*)$/.exec(payload.data);assert(match);
                const nodeId=addNode(owner,match[1].length,match[2]);state.attrs.set(nodeId,{id:nodeId});state.insertCount++;
                if(payload.nextID){const rows=state.children.get(owner),node=rows.pop();rows.splice(rows.findIndex((row)=>row.id===payload.nextID),0,node);}
                data=[{doOperations:[{action:'insert',id:nodeId}]}];
            }else if(path==='/api/attr/setBlockAttrs'){
                if(state.setAttrsError)return {code:403,msg:'attribute write denied'};
                state.attrs.set(payload.id,{...state.attrs.get(payload.id),...payload.attrs});data=null;
            }else if(path==='/api/attr/batchSetBlockAttrs'){
                for(const item of payload.blockAttrs)state.attrs.set(item.id,{...state.attrs.get(item.id),...item.attrs});data=null;
            }else throw new Error(`unexpected API ${path}`);
            return {code:0,msg:'',data};
        },
    });
    const initialized=await app.rebuildEnhancedDiaryProjectIndex(projectStorage);
    if(initialized.lastStatus!=='success')throw new Error('fixture initialization: '+JSON.stringify(initialized));
    state.awaitingReadback=false;
    const reset=()=>{state.calls=[];state.reads=0;state.writes=0;state.readbacks=0;state.awaitingReadback=false;state.commits=0;state.recentReads=0;state.recentWrites=0;};reset();
    const index=()=>JSON.parse(state.file);
    const request=(rootId,createdId,level=1,title='new child',parentTargetId=rootId,ancestorTargetIds=[rootId])=>({storage:projectStorage,createdId,createdKind:'node',affectedRootProjectId:rootId,expectedNode:{title,level,parentTargetId,ancestorTargetIds}});
    return {app,state,addRoot,addNode,reset,index,request,storage:projectStorage,
        counts:()=>({listDirectProjectDocs:state.calls.filter((c)=>c.path==='/api/filetree/listDocsByPath').length,
            getChildBlocksChecked:state.calls.filter((c)=>c.path==='/api/block/getChildBlocks').length,
            batchGetBlockAttrs:state.calls.filter((c)=>c.path==='/api/attr/batchGetBlockAttrs').length,
            kernelPostRequests:state.calls.length,indexReads:state.reads,indexWrites:state.writes,indexReadbacks:state.readbacks}),
    };
}
async function lifecycleMeasurements(){
    const results=[];
    for(const roots of [5,50,200])for(const operation of ['validate-once','validate-twice','create-child','duplicate-child','root-state-change','node-title-change']){
        const f=await fixture(roots),start=performance.now();
        if(operation.startsWith('validate')){
            for(let n=0;n<(operation==='validate-twice'?2:1);n++){
                f.state.awaitingReadback=false;
                await f.app.validateEnhancedDiaryProjectWriteTarget(storage,id(1));
            }
        }else if(operation==='create-child')await f.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name:'new measured child'});
        else if(operation==='duplicate-child')await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name:'Node 1.0'}),/同名/);
        else{
            if(operation==='root-state-change')f.state.attrs.get(id(1))[f.app.ENHANCED_DIARY_PROJECT_STATUS_ATTR]='archived';
            else{f.state.children.get(id(1))[0].markdown='# changed title';f.state.changedDocs=[{id:id(1)}];}
            success(await f.app.refreshEnhancedDiaryProjectIndex(storage));
        }
        const metric={roots,operation,...f.counts(),syntheticMs:+(performance.now()-start).toFixed(1)};
        const expected=operation==='create-child'?(lifecycleBaseline?3:1):operation.startsWith('validate')?
            (lifecycleBaseline?(operation==='validate-twice'?2:1):0):operation==='duplicate-child'?(lifecycleBaseline?1:0):1;
        assert.equal(metric.indexWrites,expected,operation);results.push(metric);
    }
    console.log(JSON.stringify({lifecycleMode:lifecycleBaseline?'bb15676':'current',syntheticApiLatencyMs:0,lifecycleMeasurements:results},null,2));
    return results;
}
let groups=0;
async function test(name,run){try{await run();groups++;console.log('PASS '+name);}catch(error){console.error('FAIL '+name+': '+error.message);process.exit(1);}}
const success=(result)=>{if(result.lastStatus!=='success')throw new Error(JSON.stringify(result));};
const failed=(result)=>assert.equal(result.lastStatus,'error',result.lastMessage);
if(lifecycleBaseline||process.argv.includes('--lifecycle-only')){await lifecycleMeasurements();process.exit(0);}

await test('unchanged lifecycle validation keeps both guards without index writes and refreshes verified cache',async()=>{
    const f=await fixture(),disk=f.index();disk.updatedAt='external timestamp only';disk.roots[id(1)].title='external title';
    f.state.docs[0].name='external title';f.state.file=JSON.stringify(disk);const retained=f.state.file;
    for(let n=0;n<2;n++)assert.equal((await f.app.validateEnhancedDiaryProjectWriteTarget(storage,id(1))).title,'external title');
    assert.equal(f.state.writes,0);assert.equal(f.state.file,retained);assert.equal(f.state.commits,2);
    assert.equal((await f.app.readEnhancedDiaryProjectIndex(storage)).updatedAt,'external timestamp only');
    const created=await f.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name:'confirmed child'});
    assert(f.index().nodes[created]);assert.equal(f.state.commits,4);assert.equal(f.state.writes,1);assert.equal(f.state.readbacks,1);
    f.reset();await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name:'confirmed child'}),/同名/);
    assert.equal(f.state.writes,0);
});
await test('semantic changes in roots, headings, ordering, archive and hierarchy still persist',async()=>{
    for(const change of ['root-title','root-path','root-updated','root-order','root-status','node-title','node-updated','node-order','node-hierarchy','node-status']){
        const f=await fixture(),rootId=id(2),rows=f.state.children.get(rootId);f.state.changedDocs=[{id:rootId}];
        if(change==='root-title')f.state.docs[1].name='renamed root';
        if(change==='root-path')f.state.docs[1].hPath='/Renamed';
        if(change==='root-updated')f.state.docs[1].mtime++;
        if(change==='root-order')f.state.docs.reverse();
        if(change==='root-status')f.state.attrs.get(rootId)[f.app.ENHANCED_DIARY_PROJECT_STATUS_ATTR]='archived';
        if(change==='node-title')rows[0].markdown='# renamed node';
        if(change==='node-updated')f.state.attrs.get(rows[0].id).updated='20261019000001';
        if(change==='node-order')rows.reverse();
        if(change==='node-hierarchy'){rows[1].subtype='h1';rows[1].markdown='# changed level';}
        if(change==='node-status')f.state.attrs.get(rows[0].id)[f.app.ENHANCED_DIARY_PROJECT_STATUS_ATTR]='archived';
        const before=f.index();success(await f.app.refreshEnhancedDiaryProjectIndex(storage));
        assert.equal(f.state.writes,1,change);assert.equal(f.state.readbacks,1,change);assert.notDeepEqual(f.index(),before,change);
        if(change==='node-hierarchy'){assert.equal(f.index().nodes[rows[1].id].level,1);assert.equal(f.index().nodes[rows[1].id].parentTargetId,rootId);}
    }
});
await test('real archive/restore services retain ancestor restrictions and persist status',async()=>{
    const f=await fixture(),rootId=id(1),nodeId=id(10100);
    assert.equal((await f.app.archiveEnhancedDiaryProject(storage,rootId)).status,'success');
    assert.equal(f.index().roots[rootId].status,'archived');
    await assert.rejects(f.app.validateEnhancedDiaryProjectWriteTarget(storage,nodeId),/归档/);
    assert.equal((await f.app.restoreEnhancedDiaryProject(storage,nodeId)).status,'blocked');
    assert.equal((await f.app.restoreEnhancedDiaryProject(storage,rootId)).status,'success');
    assert.equal((await f.app.validateEnhancedDiaryProjectWriteTarget(storage,nodeId)).status,'active');
});
await test('incremental no-op/change cannot overwrite an intervening external index snapshot',async()=>{
    for(const change of [false,true]){
        const f=await fixture();if(change)f.state.docs[0].name='local changed';let external;
        f.state.readHook=(reads)=>{if(reads===2){const disk=f.index();disk.roots[id(2)].title='external writer';external=JSON.stringify(disk);f.state.file=external;}};
        failed(await f.app.refreshEnhancedDiaryProjectIndex(storage));assert.equal(f.state.writes,0);assert.equal(f.state.file,external);
    }
});
await test('incremental and creation maintenance share a queue without losing either change',async()=>{
    const f=await fixture();f.state.docs[0].name='queued rename';const created=f.addNode(id(3));
    const results=await Promise.all([f.app.refreshEnhancedDiaryProjectIndex(storage),f.app.refreshEnhancedDiaryProjectIndexAfterCreation(f.request(id(3),created))]);
    results.forEach(success);assert.equal(f.index().roots[id(1)].title,'queued rename');assert(f.index().nodes[created]);
    assert.equal(f.state.writes,2);assert.equal(f.state.readbacks,2);
});
await test('incremental actual writes verify disk while no-ops never issue a verification write',async()=>{
    for(const mode of ['writeError','dropWrite','corruptWrite','readbackError']){
        const f=await fixture();f.state.docs[0].name='real change';f.state[mode]=true;
        failed(await f.app.refreshEnhancedDiaryProjectIndex(storage));assert.equal(f.state.writes,1);
        assert.equal(f.state.readbacks,mode==='writeError'?0:1);
    }
    const f=await fixture();f.state.changedDocs=[{id:id(1)}];const heading=f.state.children.get(id(1))[0];
    heading.subtype='h2';heading.markdown='## interrupted';f.state.attrs.get(heading.id)[f.app.ENHANCED_DIARY_PROJECT_NODE_ATTR]='false';
    const retained=f.state.file;failed(await f.app.refreshEnhancedDiaryProjectIndex(storage));assert.equal(f.state.file,retained);assert.equal(f.state.writes,0);
});
await test('incremental unknown, incomplete, foreign and damaged snapshots never become a save baseline',async()=>{
    for(const mode of ['null','foreign','relation','incomplete']){
        const f=await fixture(),disk=f.index();
        if(mode==='null')f.state.readResponse=null;
        if(mode==='foreign')disk.containerSignature='notebook:foreign';
        if(mode==='relation')disk.nodes[id(10101)].ancestorTargetIds=[];
        if(mode==='incomplete')disk.complete=false;
        f.state.file=JSON.stringify(disk);const retained=f.state.file;
        const result=await f.app.refreshEnhancedDiaryProjectIndex(storage);
        assert.equal(result.lastStatus,mode==='incomplete'?'idle':'error');assert.equal(f.state.writes,0);assert.equal(f.state.file,retained);
    }
});
await test('real recent-doc preparation initializes the consumer once then skips unchanged writes',async()=>{
    const f=await fixture(5,{realRecent:true});
    await f.app.validateEnhancedDiaryProjectWriteTarget(storage,id(1));
    assert.equal(f.state.recentWrites,1);
    const retained=f.state.recentFile;
    await f.app.validateEnhancedDiaryProjectWriteTarget(storage,id(1));
    assert.equal(f.state.writes,0);assert.equal(f.state.recentWrites,1);assert.equal(f.state.recentReads,5);
    assert.equal(f.state.recentFile,retained);
    assert.deepEqual(JSON.parse(f.state.recentFile).docs,{});
    console.log(JSON.stringify({unchangedSharedSnapshot:{projectIndexWrites:f.state.writes,recentSnapshotWrites:f.state.recentWrites,recentSnapshotReads:f.state.recentReads}}));
});

await test('targeted root creation preserves all old nodes, actual metadata and ordering; repeat is no-op',async()=>{
    const f=await fixture();const before=f.index();const created=f.addRoot(5000,'official document title');
    f.state.docs.unshift(f.state.docs.pop());
    const input={storage,createdId:created,createdKind:'root',affectedRootProjectId:created};
    success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(input));
    const next=f.index();assert.deepEqual(next.nodes,before.nodes);assert.equal(next.roots[created].title,'official document title');
    f.state.docs.forEach((doc,order)=>assert.equal(next.roots[doc.id].order,order));
    assert.equal(f.counts().getChildBlocksChecked,1);assert.equal(f.state.readbacks,1);
    f.reset();success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(input));assert.equal(f.state.writes,0);assert.equal(f.state.readbacks,0);
    f.state.file=JSON.stringify({...f.index(),updatedAt:'timestamp changed without semantic changes'});f.reset();
    success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(input));assert.equal(f.state.writes,0);
});
await test('new root may contain project headings; parent-document containers retain validated paths',async()=>{
    const f=await fixture();const created=f.addRoot(5000),child=f.addNode(created,1,'existing node');
    success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation({storage,createdId:created,createdKind:'root',affectedRootProjectId:created}));
    assert(f.index().nodes[child]);assert.equal(f.counts().getChildBlocksChecked,1);
    const g=await fixture(5,{parentDoc:true});const docId=await g.app.createEnhancedDiaryRootProject({storage:g.storage,name:'under parent'});
    assert.equal(g.index().roots[docId].path,`/${id(888888)}/${docId}.sy`);
    const childId=await g.app.createEnhancedDiarySubproject({storage:g.storage,parentTargetId:docId,name:'child'});
    assert.equal(g.index().nodes[childId].rootProjectId,docId);
});
await test('nested node rebuilding uses real buildNodes and preserves unrelated root nodes and project references',async()=>{
    const f=await fixture();const before=f.index(),rootId=id(2),parentId=id(10201);
    const created=f.addNode(rootId,3,'nested child');
    // Place the child immediately below its intended H2 parent.
    const rows=f.state.children.get(rootId),node=rows.pop();rows.splice(rows.findIndex((row)=>row.id===parentId)+1,0,node);
    success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(f.request(rootId,created,3,'nested child',parentId,[rootId,id(10200),parentId])));
    const next=f.index();assert.equal(next.nodes[created].parentTargetId,parentId);
    for(const [key,value] of Object.entries(before.nodes))assert.deepEqual(next.nodes[key],value.rootProjectId===rootId?{...value,order:next.nodes[key].order}:value);
    assert.deepEqual(f.state.calls.filter((c)=>c.path==='/api/block/getChildBlocks').map((c)=>c.payload.id),[rootId]);
    assert.equal(f.app.resolveEnhancedDiaryProjectTarget(next,parentId).id,parentId);
});
await test('a new heading recomputes existing child ancestry instead of merely appending a node',async()=>{
    const f=await fixture();const before=f.index(),rootId=id(1),created=f.addNode(rootId,1,'new branch');
    const rows=f.state.children.get(rootId),node=rows.pop();rows.splice(1,0,node);
    success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(f.request(rootId,created,1,'new branch')));
    const next=f.index();assert.equal(next.nodes[id(10101)].parentTargetId,created);
    assert.deepEqual(next.nodes[id(10101)].ancestorTargetIds,[rootId,created]);
    for(const [key,value] of Object.entries(before.nodes).filter(([,value])=>value.rootProjectId!==rootId))assert.deepEqual(next.nodes[key],value);
});
await test('real root and child services complete verified creation once',async()=>{
    for(const kind of ['root','node']){
        const f=await fixture();const created=kind==='root'?await f.app.createEnhancedDiaryRootProject({storage,name:'created root'}):
            await f.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name:'created child'});
        assert((kind==='root'?f.index().roots:f.index().nodes)[created]);assert(f.state.readbacks>=1);
        assert.equal(f.state.createCount,kind==='root'?1:0);
    }
});
await test('duplicate name, H6, archived root and archived ancestor reject before creating',async()=>{
    const f=await fixture();await assert.rejects(f.app.createEnhancedDiaryRootProject({storage,name:'Project 1'}),/同名/);
    const rootId=id(1),sibling=f.addNode(rootId,1,'duplicate');
    success(await f.app.rebuildEnhancedDiaryProjectIndex(storage));f.reset();
    await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId:rootId,name:'duplicate'}),/同名/);
    const deep=f.addNode(rootId,6,'deep');success(await f.app.rebuildEnhancedDiaryProjectIndex(storage));
    await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId:deep,name:'too deep'}),/H6/);
    for(const target of [rootId,sibling]){
        f.state.changedDocs=[{id:rootId}];
        f.state.attrs.get(target)[f.app.ENHANCED_DIARY_PROJECT_STATUS_ATTR]='archived';
        await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId:sibling,name:'blocked'}),/归档/);
        delete f.state.attrs.get(target)[f.app.ENHANCED_DIARY_PROJECT_STATUS_ATTR];
    }
    assert.equal(f.state.createCount,0);
});
await test('bad creation location and node attribute write failure retain true created identity',async()=>{
    const f=await fixture();f.state.pathResponse={notebook:id(5),path:'/wrong.sy'};
    await assert.rejects(f.app.createEnhancedDiaryRootProject({storage,name:'wrong location'}),/所属笔记本/);
    assert.equal(f.state.createCount,1);assert.equal(f.state.writes,0);
    f.state.setAttrsError=true;
    await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name:'attrs fail'}),
        (error)=>error instanceof f.app.EnhancedDiaryProjectCreatedButNotVerifiedError&&error.stage==='metadata'&&!!error.docId);
});
await test('strict disk errors, malformed index/version/container and unknown file responses never overwrite',async()=>{
    for(const variant of ['broken','version','container','relation','null','403','network']){
        const f=await fixture();const original=f.state.file;const created=f.addNode(id(1));
        if(variant==='broken')f.state.file='{';
        if(variant==='version')f.state.file=JSON.stringify({...f.index(),version:999});
        if(variant==='container')f.state.file=JSON.stringify({...f.index(),containerSignature:'notebook:elsewhere'});
        if(variant==='relation'){const value=f.index();Object.values(value.nodes)[0].ancestorTargetIds=[];f.state.file=JSON.stringify(value);}
        if(variant==='null')f.state.readResponse=null;
        if(variant==='403')f.state.readResponse={code:403,msg:'denied'};
        if(variant==='network')f.state.readError=true;
        const retained=f.state.file;
        failed(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(f.request(id(1),created)));
        assert.equal(f.state.writes,0);assert.equal(f.state.file,retained);assert(original);
    }
});
await test('real child creation prechecks reject corrupt or unreadable disk indexes before any write',async()=>{
    for(const variant of ['broken','version','403','network']){
        const f=await fixture();
        if(variant==='broken')f.state.file='{';
        if(variant==='version')f.state.file=JSON.stringify({...f.index(),version:999});
        if(variant==='403')f.state.readResponse={code:403,msg:'denied'};
        if(variant==='network')f.state.readError=true;
        const retained=f.state.file;
        await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name:'must not create'}));
        assert.equal(f.state.writes,0);assert.equal(f.state.insertCount,0);assert.equal(f.state.file,retained);
    }
});
await test('missing created node, malformed directory/headings/attrs and interrupted moves preserve old index',async()=>{
    for(const variant of ['missing','directory','null-block','duplicate-block','attrs','permission','interrupted','hierarchy']){
        const f=await fixture();const original=f.state.file;const rootId=id(1),created=f.addNode(rootId);
        if(variant==='missing')f.state.children.get(rootId).pop();
        if(variant==='directory')f.state.dirResponse={files:[null]};
        if(variant==='null-block')f.state.children.get(rootId).push(null);
        if(variant==='duplicate-block')f.state.children.get(rootId).push(f.state.children.get(rootId)[0]);
        if(variant==='attrs')f.state.attrResponse={};
        if(variant==='permission')f.state.attrError=true;
        if(variant==='interrupted'){const heading=f.state.children.get(rootId)[0];heading.subtype='h2';heading.markdown='## moved';f.state.attrs.get(heading.id)[f.app.ENHANCED_DIARY_PROJECT_NODE_ATTR]='false';}
        if(variant==='hierarchy')f.state.children.get(rootId).at(-1).subtype='h2';
        failed(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(f.request(rootId,created)));
        assert.equal(f.state.writes,0);assert.equal(f.state.file,original);
    }
});
await test('write failure, dropped writes, corrupted readback and readback transport failure stay partial',async()=>{
    for(const mode of ['writeError','dropWrite','corruptWrite','readbackError']){
        const f=await fixture();f.state[mode]=true;
        await assert.rejects(f.app.createEnhancedDiaryRootProject({storage,name:'written but unverified'}),
            (error)=>error instanceof f.app.EnhancedDiaryProjectCreatedButNotVerifiedError&&error.stage==='index'&&!!error.docId);
        assert.equal(f.state.createCount,1);assert.equal(f.state.writes,1);
        assert.equal(f.state.readbacks,mode==='writeError'?0:1);
        assert.equal((await f.app.readEnhancedDiaryProjectIndex(storage)).roots[id(900001)]!==undefined,mode==='corruptWrite'||mode==='readbackError');
    }
});
await test('incomplete or confirmed missing index uses the guarded full rebuild',async()=>{
    for(const missing of [false,true]){
        const f=await fixture();if(missing)f.state.file=undefined;else f.state.file=JSON.stringify({...f.index(),complete:false});
        const created=f.addNode(id(1));success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(f.request(id(1),created)));
        assert.equal(f.index().complete,true);assert(f.counts().getChildBlocksChecked>=5);assert.equal(f.state.readbacks,1);
    }
});
await test('other root changes safely fall back; mid-read external disk changes are not overwritten',async()=>{
    const f=await fixture();const created=f.addNode(id(1));f.state.docs[1].name='renamed elsewhere';
    success(await f.app.refreshEnhancedDiaryProjectIndexAfterCreation(f.request(id(1),created)));
    assert.equal(f.index().roots[id(2)].title,'renamed elsewhere');assert(f.counts().getChildBlocksChecked>=5);
    const g=await fixture();const child=g.addNode(id(1));let changed;
    g.state.childHook=()=>{const next=g.index();next.updatedAt='external';g.state.file=JSON.stringify(next);changed=g.state.file;g.state.childHook=null;};
    failed(await g.app.refreshEnhancedDiaryProjectIndexAfterCreation(g.request(id(1),child)));assert.equal(g.state.writes,0);assert.equal(g.state.file,changed);
    const h=await fixture();const latestChild=h.addNode(id(1)),oldFile=h.state.file;
    h.state.childHook=()=>{h.state.docs[0].mtime++;h.state.childHook=null;};
    failed(await h.app.refreshEnhancedDiaryProjectIndexAfterCreation(h.request(id(1),latestChild)));assert.equal(h.state.writes,0);assert.equal(h.state.file,oldFile);
});
await test('concurrent creation requests share maintenanceTails and retain both roots',async()=>{
    const f=await fixture();const a=f.addRoot(800001),b=f.addRoot(800002);
    const results=await Promise.all([a,b].map((createdId)=>f.app.refreshEnhancedDiaryProjectIndexAfterCreation({storage,createdId,createdKind:'root',affectedRootProjectId:createdId})));
    results.forEach(success);assert(f.index().roots[a]&&f.index().roots[b]);assert.equal(f.state.writes,1);
    const g=await fixture();
    const created=await Promise.all(['first','second'].map((name)=>g.app.createEnhancedDiaryRootProject({storage,name})));
    assert.equal(g.state.createCount,2);created.forEach((docId)=>assert(g.index().roots[docId]));
    const h=await fixture();
    const children=await Promise.all(['first','second'].map((name)=>h.app.createEnhancedDiarySubproject({storage,parentTargetId:id(1),name})));
    assert.equal(h.state.insertCount,2);children.forEach((blockId)=>assert(h.index().nodes[blockId]));
});
await test('manual full rebuild and formal incremental refresh retain their original scope',async()=>{
    const f=await fixture();success(await f.app.rebuildEnhancedDiaryProjectIndex(storage));assert.equal(new Set(f.state.calls.filter((c)=>c.path==='/api/block/getChildBlocks').map((c)=>c.payload.id)).size,5);
    f.reset();const created=f.addNode(id(3));f.state.changedDocs=[{id:id(3)}];success(await f.app.refreshEnhancedDiaryProjectIndex(storage));assert(f.index().nodes[created]);
    assert(f.state.calls.filter((c)=>c.path==='/api/block/getChildBlocks').every((c)=>c.payload.id===id(3)));
});

const measurements=[];
for(const roots of [5,50,200])for(const kind of ['root','node','nested'])for(const mode of ['full','targeted']){
    const f=await fixture(roots,{latency:1});const rootId=kind==='root'?f.addRoot(800000):id(1);
    const createdId=kind==='root'?rootId:f.addNode(rootId,kind==='nested'?3:1);
    if(kind==='nested'){
        const rows=f.state.children.get(rootId),node=rows.pop();rows.splice(2,0,node);
    }
    const input=kind==='root'?{storage,createdId,createdKind:'root',affectedRootProjectId:rootId}:
        kind==='nested'?f.request(rootId,createdId,3,'new child',id(10101),[rootId,id(10100),id(10101)]):f.request(rootId,createdId);
    const start=performance.now();success(await(mode==='full'?f.app.rebuildEnhancedDiaryProjectIndexAfterChange(storage):f.app.refreshEnhancedDiaryProjectIndexAfterCreation(input)));
    const metric={roots,kind,mode,...f.counts(),syntheticMs:+(performance.now()-start).toFixed(1)};measurements.push(metric);
    if(mode==='targeted'){assert.equal(metric.getChildBlocksChecked,1);assert.equal(metric.batchGetBlockAttrs,kind==='root'?1:2);assert.equal(metric.indexWrites,1);assert.equal(metric.indexReadbacks,1);}
}
const serviceMeasurements=[];
for(const roots of [5,50,200]){
    for(const kind of ['root','node','nested','duplicate-root','duplicate-node','workspace-read','consecutive']){
        const f=await fixture(roots);
        const parentTargetId=kind==='nested'?id(10101):id(1);
        const created=[];
        if(kind==='workspace-read')created.push(await f.app.createEnhancedDiaryRootProject({storage,name:'workspace-created'}));
        f.reset();const start=performance.now();
        if(kind==='duplicate-root')await assert.rejects(f.app.createEnhancedDiaryRootProject({storage,name:'Project 1'}),/同名/);
        else if(kind==='duplicate-node')await assert.rejects(f.app.createEnhancedDiarySubproject({storage,parentTargetId,name:'Node 1.0'}),/同名/);
        else if(kind==='workspace-read'){
            const loaded=await f.app.loadEnhancedDiaryProjectIndexForWorkspace(storage);
            assert(loaded.roots[created[0]]);assert.equal(f.counts().indexWrites,0);assert.equal(f.counts().getChildBlocksChecked,0);
        }else{
            for(let i=0;i<(kind==='consecutive'?3:1);i++)created.push(kind==='root'||kind==='consecutive'?
                await f.app.createEnhancedDiaryRootProject({storage,name:`created ${i}`}):
                await f.app.createEnhancedDiarySubproject({storage,parentTargetId,name:`created ${i}`}));
            created.forEach((key)=>assert(f.index().roots[key]||f.index().nodes[key]));
            if(kind==='nested')assert.equal(f.index().nodes[created[0]].parentTargetId,parentTargetId);
        }
        const metric={roots,kind,...f.counts(),syntheticMs:+(performance.now()-start).toFixed(1)};
        if(kind.startsWith('duplicate'))assert.equal(f.state.createCount+f.state.insertCount,0);
        serviceMeasurements.push(metric);
    }
    for(const mode of ['full','targeted']){
        const f=await fixture(roots),created=[];const start=performance.now();
        for(let i=0;i<3;i++){
            const createdId=f.addRoot(800000+i);created.push(createdId);
            success(await(mode==='full'?f.app.rebuildEnhancedDiaryProjectIndexAfterChange(storage):
                f.app.refreshEnhancedDiaryProjectIndexAfterCreation({storage,createdId,createdKind:'root',affectedRootProjectId:createdId})));
        }
        created.forEach((key)=>assert(f.index().roots[key]));
        measurements.push({roots,kind:'consecutive',mode,...f.counts(),syntheticMs:+(performance.now()-start).toFixed(1),syntheticApiLatencyMs:0});
    }
}
console.log(JSON.stringify({syntheticApiLatencyMs:1,measurements,serviceApiLatencyMs:0,serviceMeasurements},null,2));
const lifecycle=await lifecycleMeasurements();
console.log(`Passed ${groups} project creation groups plus ${measurements.length} maintenance, ${serviceMeasurements.length} service and ${lifecycle.length} lifecycle measurements. No real documents or indexes were modified. Timings are synthetic, not SiYuan client measurements.`);
