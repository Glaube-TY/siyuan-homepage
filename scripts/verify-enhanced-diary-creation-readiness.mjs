import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..'),dir='src/components/utils/widgetBlock/widget/enhancedDiary';
const apiNames=['sql','requestChecked','batchGetBlockAttrs','getBlockKramdownChecked','exportMdContent','renderSprig','createDailyNote','appendBlockChecked','insertBlockChecked','updateBlockChecked','deleteBlockChecked','getChildBlocksChecked','sqlChecked','getFile','getFileChecked','getFileOrNullChecked','listDocsByPathChecked','putFileChecked','getBlockAttrsChecked','setBlockAttrsChecked','checkBlockExist','getBlockBreadcrumb','getBlockInfo','getBlockKramdowns','getBlockTreeInfos'];
const bundle=await build({stdin:{resolveDir:root,contents:`
export {getOrCreateTodayDiaryDocument,addNewTaskToDiary} from './${dir}/enhancedDiaryActions';
export {validateEnhancedDiaryWriteTarget,waitForCreatedDiaryDocument} from './${dir}/enhancedDiaryDoc';
export {indexCreatedEnhancedDiaryDocument,getEnhancedDiaryIndexEntriesStrict} from './${dir}/enhancedDiaryIndex';
export {DEFAULT_ENHANCED_DIARY_CONFIG} from './${dir}/enhancedDiaryTypes';`},bundle:true,write:false,format:'esm',platform:'node',alias:{'@':resolve(root,'src')},plugins:[{name:'creation-io',setup(b){
 b.onResolve({filter:/^@\/api$|^@\/components\/tools\/siyuanComponentDataApi$|openDocs$|enhancedDiaryWorkspaceProjectLifecycle$/},({path})=>({path,namespace:'creation-io'}));
 b.onLoad({filter:/.*/,namespace:'creation-io'},({path})=>({contents:(path==='@/api'?apiNames:path.endsWith('openDocs')?['openDocs']:path.endsWith('Lifecycle')?['extractProjectWriteTargetErrorCode','validateEnhancedDiaryProjectWriteTarget']:['prepareChangedRecentDocsForIndex','synchronizeTaskIndexAfterWrite']).map(n=>`export const ${n}=(...args)=>globalThis.__diaryCreationIO.${n}(...args);`).join('\n'),loader:'js'}));
}}]});
let sequence=0;
const book='20261020000000-bookaaa',id='20261020000001-docaaaa',oldId='20261019000001-oldaaaa',taskId='20261020000002-taskaaa';
const localDate=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
async function fixture(options={}){
 const runtime=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')+'#'+sequence++);
 const date=localDate(new Date()),config={...structuredClone(runtime.DEFAULT_ENHANCED_DIARY_CONFIG),dailyNotebookId:book};
 const old={id:oldId,date:'20261019',box:book};
 const state={created:false,creates:0,reads:0,writes:0,metadataReads:0,taskWrites:0,syncs:0,tasks:[],queries:[],started:0,
  payload:{version:4,updatedAt:'fixture',notebookId:book,complete:true,docs:{'20261019':old}},...options};
 const row=()=>({id,type:'d',box:state.wrongBook?'20261020000000-otheraa':book,content:'fixture',path:`/${id}.sy`,hpath:'/fixture',ial:`{: custom-dailynote-${state.wrongDate?'20000101':date}="${date}"}`,updated:'20261020000000'});
 const io={
  getFileChecked:async()=>{state.reads++;if(state.indexReadError)throw Error('index read failed');return structuredClone(state.payload);},
  getFile:async()=>structuredClone(state.payload),
  sqlChecked:async stmt=>{state.queries.push(stmt);
   if(stmt.includes('FROM attributes')){if(state.recoveryError)throw Error('recovery unavailable');return state.recovered?[{id}]:[];}
   assert(stmt.includes(id));assert(!/LIKE|SELECT \*/i.test(stmt));state.metadataReads++;
   if(state.hang)return new Promise(()=>{});if(state.networkError)throw Error('network');if(state.malformed)return null;if(state.multiple)return [row(),row()];
   if(!state.created&&!state.recovered)return [];
   if(state.metadataReads<=(state.invisibleReads||0)||Date.now()-state.started<(state.visibleAfterMs||0)||state.neverVisible)return [];
   return [row()];},
  createDailyNote:async()=>{state.creates++;assert.equal(state.creates,1,'no repeated creation');state.created=true;state.started=Date.now();
   if(state.unknownCreation)throw Error('response lost');return {id};},
  exportMdContent:async()=>{if(state.exportError)throw Error('export unavailable');return {content:config.templates.day};},
  putFileChecked:async(path,isDir,blob)=>{assert(!state.corrupt);if(isDir)return;if(state.indexWriteError)throw Error('write failed');state.writes++;state.payload=JSON.parse(await blob.text());if(state.badReadback)state.payload.docs={};},
  getChildBlocksChecked:async()=>state.noTemplate?[]:config.templates.day.split('\n').flatMap((s,n)=>{const m=/^(#{1,6}) (.+)$/.exec(s);return m?[{id:`20261020000003-${String(n).padStart(7,'0')}`,type:'h',subType:'h'+m[1].length,markdown:s,content:m[2]}]:[]}),
  appendBlockChecked:async(_type,md)=>{state.taskWrites++;assert.equal(state.taskWrites,1);state.tasks.push({id:taskId,markdown:md});return [{doOperations:[{action:'insert',id:taskId}]}];},
  insertBlockChecked:async(...args)=>io.appendBlockChecked(...args),
  synchronizeTaskIndexAfterWrite:async()=>{state.syncs++;return {complete:true,blockId:taskId};},
 };
 globalThis.__diaryCreationIO=new Proxy(io,{get:(t,k)=>t[k]||(()=>{throw Error('unexpected fixture I/O '+String(k))})});
 return {runtime,state,config,date,old,prepare:()=>runtime.getOrCreateTodayDiaryDocument({app:{id:'fixture-app'}},config),
  async task(){const r=await this.prepare();return r.ok?runtime.addNewTaskToDiary({docId:r.docId,dailyNotebookId:book,expectedDate:date,task:{taskname:'fixture task'}}):r;}};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS diary readiness '+name);}
await check('A immediately visible and concurrent preparation creates only once',async()=>{
 const f=await fixture();const [a,b]=await Promise.all([f.prepare(),f.prepare()]);assert.equal(a.ok,true);assert.equal(a,b);assert.equal(f.state.creates,1);assert.equal(f.state.writes,1);assert.deepEqual(f.state.payload.docs['20261019'],f.old);assert.equal(f.state.payload.docs[f.date].id,id);
 const reads=f.state.metadataReads;await f.prepare();assert.equal(f.state.creates,1);assert.equal(f.state.metadataReads,reads+1,'existing verified diary has no creation wait');
});
await check('B first three metadata reads absent then visible',async()=>{const f=await fixture({invisibleReads:3});const r=await f.prepare();assert(r.ok);assert.equal(f.state.creates,1);assert(f.state.metadataReads>=4);});
await check('C visibility later than one second',async()=>{const f=await fixture({visibleAfterMs:1100});const start=Date.now();assert((await f.prepare()).ok);assert(Date.now()-start>=1100);assert(Date.now()-start<4200);});
await check('D/E/F missing, network and malformed responses remain unknown with a finite budget',async()=>{
 for(const options of [{neverVisible:true},{networkError:true},{malformed:true},{hang:true}]){const f=await fixture(options),start=Date.now();const r=await f.prepare();assert.equal(r.ok,false);assert.equal(r.reason,'metadata_pending');assert.equal(r.docId,id);assert.equal(r.created,true);assert(Date.now()-start<4200);assert.equal(f.state.taskWrites,0);assert.equal(f.state.writes,0);f.state.neverVisible=f.state.networkError=f.state.malformed=f.state.hang=false;assert((await f.prepare()).ok);assert.equal(f.state.creates,1);}
});
await check('multiple rows in a single-ID response remain unknown',async()=>{const f=await fixture({created:true,multiple:true});assert.equal((await f.runtime.validateEnhancedDiaryWriteTarget(id,book,f.date)).status,'unknown');assert.equal(f.state.writes,0);});
await check('G/H scope and date errors fail immediately',async()=>{for(const option of ['wrongBook','wrongDate']){const f=await fixture({[option]:true});const r=await f.prepare();assert.equal(r.reason,option==='wrongBook'?'out_of_scope':'date_mismatch');assert.equal(f.state.metadataReads,1);assert.equal(f.state.writes,0);assert.equal(f.state.taskWrites,0);}});
await check('I export failure keeps the real ID and never recreates',async()=>{const f=await fixture({exportError:true});const r=await f.prepare();assert.equal(r.reason,'read_failed');assert.equal(r.docId,id);assert.equal(r.created,true);f.state.exportError=false;assert((await f.prepare()).ok);assert.equal(f.state.creates,1);});
await check('J index write/readback failure is not task success',async()=>{for(const option of ['indexWriteError','badReadback']){const f=await fixture({[option]:true});const r=await f.prepare();assert.equal(r.reason,'index_not_ready');assert.equal(r.docId,id);assert.equal(r.created,true);assert.equal(f.state.taskWrites,0);if(option==='indexWriteError'){f.state.indexWriteError=false;assert((await f.prepare()).ok);assert.equal(f.state.creates,1);}}});
await check('K/M recover after remount from official date metadata without createDailyNote',async()=>{const f=await fixture({recovered:true});const r=await f.prepare();assert(r.ok);assert.equal(r.docId,id);assert.equal(f.state.creates,0);assert.equal(f.state.payload.docs[f.date].id,id);assert(f.state.queries.some(q=>q.includes('FROM attributes')&&q.includes('LIMIT 2')));});
await check('M lost creation response or failed recovery never authorizes another create',async()=>{for(const opts of [{unknownCreation:true},{recoveryError:true}]){const f=await fixture(opts);assert.equal((await f.prepare()).ok,false);assert.equal((await f.prepare()).ok,false);assert.equal(f.state.creates,opts.unknownCreation?1:0);assert.equal(f.state.taskWrites,0);}});
await check('N template missing leaves task unwritten and identifies the existing template entry',async()=>{const f=await fixture({noTemplate:true});const r=await f.task();assert.equal(r.ok,false);assert.equal(r.reason,'missing_heading');assert(r.message.includes('补充今日模板'));assert.equal(f.state.taskWrites,0);});
await check('O task insertion and synchronization run once after readiness; final target check retained',async()=>{const f=await fixture();const r=await f.task();assert.equal(r.ok,true);assert.equal(r.blockId,taskId);assert.equal(f.state.taskWrites,1);assert.equal(f.state.syncs,1);f.state.wrongBook=true;assert.equal((await f.runtime.addNewTaskToDiary({docId:id,dailyNotebookId:book,expectedDate:f.date,task:{taskname:'blocked'}})).ok,false);assert.equal(f.state.taskWrites,1);});
await check('strict index corruption, version, notebook, completeness and failed reads cause no replacement/rebuild',async()=>{
 for(const variant of ['corrupt','version','notebook','incomplete','read-error']){const f=await fixture();if(variant==='corrupt')f.state.payload={};if(variant==='version')f.state.payload.version=3;if(variant==='notebook')f.state.payload.notebookId='other';if(variant==='incomplete')f.state.payload.complete=false;if(variant==='read-error')f.state.indexReadError=true;const before=structuredClone(f.state.payload);assert.equal((await f.prepare()).reason,'index_not_ready');f.state.created=true;assert.equal(await f.runtime.indexCreatedEnhancedDiaryDocument(book,id,f.date),false);assert.deepEqual(f.state.payload,before);assert.equal(f.state.writes,0);assert.equal(f.state.creates,0);}
});


await check('maintenance queue reads fresh state and preserves other registered dates',async()=>{
 const f=await fixture({created:true});const io=globalThis.__diaryCreationIO,read=io.getFileChecked;let reads=0;
 io.getFileChecked=async()=>{const result=await read();if(++reads===2)f.state.payload.docs['20261018']={id:'20261018000001-newaaaa',date:'20261018',box:book};return result;};
 // Two queued registrations must merge from disk, not a snapshot captured before the queue.
 assert.deepEqual(await Promise.all([f.runtime.indexCreatedEnhancedDiaryDocument(book,id,f.date),f.runtime.indexCreatedEnhancedDiaryDocument(book,id,f.date)]),[true,true]);
 assert.equal(f.state.payload.docs['20261018'].id,'20261018000001-newaaaa');assert.deepEqual(f.state.payload.docs['20261019'],f.old);
});

console.log(`Passed ${passed} diary creation readiness groups; real production orchestration/validation/indexing/insertion with controlled Kernel I/O. Task synchronization I/O is a boundary stub; full task-index maintenance remains covered by its dedicated verifier.`);
