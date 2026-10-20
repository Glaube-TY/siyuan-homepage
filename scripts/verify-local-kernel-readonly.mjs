import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const root=resolve(import.meta.dirname,'..'),base='http://127.0.0.1:6806';
const token=process.env.SIYUAN_API_TOKEN;
const indexPath='/data/storage/petal/siyuan-homepage/enhanced-diary-project-index.json';
const taskPath='/data/storage/petal/siyuan-homepage/task-index.json';
const iconPath='/data/plugins/siyuan-homepage/icon.png';
const missingPath='/data/storage/petal/siyuan-homepage/.readonly-contract-probe-missing';
const files=new Set([indexPath,taskPath,iconPath,missingPath]);
const allowed=new Map([
    ['/api/system/version',new Set(['{}'])],['/api/notebook/lsNotebooks',new Set(['{}'])],
]);
const idValid=(value)=>typeof value==='string'&&/^\d{14}-[a-z0-9]{7}$/i.test(value);
const kind=(value)=>value===null?'null':Array.isArray(value)?'array':typeof value;
const fieldTypes=(value)=>Object.fromEntries(Object.entries(value??{}).map(([key,item])=>[idValid(key)?'<blockID>':key,kind(item)]));
const recordsShape=(rows)=>{
    const fields={};
    for(const row of rows)for(const [key,value] of Object.entries(row??{})){
        const safeKey=idValid(key)?'<blockID>':key;
        fields[safeKey]=[...new Set([...(fields[safeKey]??[]),kind(value)])].sort();
    }
    return fields;
};
const samples=[],evidence={},production=[];
const kernelFetch=globalThis.fetch;
let requestCount=0,blockedCalls=0;
function permit(path,payload){allowed.set(path,new Set([JSON.stringify(payload)]));}
async function read(path,payload,{operation=path,phase='direct',auth=true}={}){
    if(path==='/api/file/getFile')assert(files.has(payload?.path),'unapproved file read');
    else assert(allowed.get(path)?.has(JSON.stringify(payload)),'unapproved API or payload');
    assert(++requestCount<=64,'read request budget exceeded');
    const started=performance.now();let response,bytes,json;
    try{
        response=await kernelFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`token ${token}`}:{})},
            body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),redirect:'error'});
        const chunks=[];let length=0;
        for await(const chunk of response.body){length+=chunk.length;assert(length<=8*1024*1024,'response size bound exceeded');chunks.push(chunk);}
        bytes=Buffer.concat(chunks);
        try{json=JSON.parse(bytes.toString('utf8'));}catch{ /* Binary file responses need not be JSON. */ }
        const code=json&&typeof json==='object'&&!Array.isArray(json)?json.code:undefined;
        const errorEnvelope=typeof code==='number'&&code!==0;
        const classification=response.status===401||response.status===403||code===401||code===403?'auth_error':
            response.status===404||code===404?'not_found':!response.ok?'http_error':errorEnvelope?'api_error':
                path==='/api/file/getFile'?(json===undefined?'file_binary':'file_json'):'json_envelope';
        samples.push({operation,phase,http:response.status,contentType:response.headers.get('content-type'),bytes:bytes.length,
            ms:+(performance.now()-started).toFixed(2),json:json!==undefined,topTypes:json===undefined?null:fieldTypes(json),
            apiCode:typeof code==='number'?code:null,classification});
        return {response,bytes,json,classification};
    }catch(error){
        samples.push({operation,phase,http:response?.status??null,bytes:bytes?.length??0,ms:+(performance.now()-started).toFixed(2),
            classification:error.name==='TimeoutError'?'timeout':error.name==='AssertionError'?'safety_bound':'network_error'});
        return null;
    }finally{await delay(150);}
}
async function three(path,payload,operation=path){
    let result;
    for(let n=0;n<3;n++)result=await read(path,payload,{operation});
    return result;
}
const data=(result)=>result?.response.ok&&result.json?.code===0?result.json.data:undefined;
function stats(){
    const groups={};for(const sample of samples.filter((item)=>item.phase==='direct'))(groups[sample.operation]??=[]).push(sample);
    return Object.entries(groups).map(([operation,items])=>({operation,attempts:items.length,
        success:items.filter((item)=>['json_envelope','file_json','file_binary'].includes(item.classification)).length,
        minMs:Math.min(...items.map((item)=>item.ms)),maxMs:Math.max(...items.map((item)=>item.ms)),
        avgMs:+(items.reduce((sum,item)=>sum+item.ms,0)/items.length).toFixed(2),
        httpStatuses:[...new Set(items.map((item)=>item.http))],apiCodes:[...new Set(items.map((item)=>item.apiCode??null))],
        bytes:items.map((item)=>item.bytes),classifications:items.map((item)=>item.classification)}));
}
async function main(){
    assert(token,'SIYUAN_API_TOKEN required; use PowerShell Read-Host -MaskInput');
    const version=await three('/api/system/version',{});
    evidence.version={dataType:kind(data(version)),value:typeof data(version)==='string'?data(version):null};
    const booksResult=await three('/api/notebook/lsNotebooks',{}),books=data(booksResult);
    evidence.lsNotebooks={dataType:kind(books),dataFields:fieldTypes(books),notebooksType:kind(books?.notebooks),
        objectFields:Array.isArray(books?.notebooks)?recordsShape(books.notebooks):null};
    const book=Array.isArray(books?.notebooks)?books.notebooks.find((item)=>idValid(item.id)&&item.closed!==true):null;
    let list,doc,pathResult,children,attrs,sqlResult,statement,ids;
    if(book){
        list={notebook:book.id,path:'/',maxListCount:1,ignoreMaxListHint:true};permit('/api/filetree/listDocsByPath',list);
        const listed=data(await three('/api/filetree/listDocsByPath',list));
        evidence.listDocsByPath={dataFields:fieldTypes(listed),fileFields:Array.isArray(listed?.files)?recordsShape(listed.files):null,
            boxMatchesRequest:listed?.box===book.id,pathMatchesRequest:listed?.path==='/'};
        doc=Array.isArray(listed?.files)?listed.files.find((item)=>idValid(item.id)):null;
        if(doc){
            permit('/api/filetree/getPathByID',{id:doc.id});pathResult=data(await three('/api/filetree/getPathByID',{id:doc.id}));
            evidence.getPathByID={fields:fieldTypes(pathResult),notebookMatchesRequest:pathResult?.notebook===book.id,pathMatchesListing:pathResult?.path===doc.path};
            permit('/api/block/getChildBlocks',{id:doc.id});children=data(await three('/api/block/getChildBlocks',{id:doc.id}));
            evidence.getChildBlocks={type:kind(children),fields:Array.isArray(children)?recordsShape(children):null,
                omittedMarkdown:Array.isArray(children)?children.filter((item)=>!Object.hasOwn(item,'markdown')).length:null,
                omittedMarkdownCases:Array.isArray(children)?children.filter((item)=>!Object.hasOwn(item,'markdown')).map((item)=>({type:item.type,contentType:kind(item.content),contentEmpty:!item.content})):[]};
            ids=[doc.id];const child=Array.isArray(children)?children.find((item)=>idValid(item.id)):null;if(child)ids.push(child.id);
            permit('/api/attr/batchGetBlockAttrs',{ids});attrs=data(await three('/api/attr/batchGetBlockAttrs',{ids}));
            evidence.batchGetBlockAttrs={type:kind(attrs),requestedEntriesPresent:ids.every((id)=>attrs&&Object.hasOwn(attrs,id)),
                entryValueTypes:attrs&&typeof attrs==='object'?[...new Set(Object.values(attrs).map(kind))]:[],
                attributeValueTypes:attrs&&typeof attrs==='object'?[...new Set(Object.values(attrs).flatMap((item)=>Object.values(item??{}).map(kind)))]:[]};
            statement=`SELECT id, type, subtype, root_id, box, path, updated FROM blocks WHERE id = '${doc.id}' LIMIT 1`;
            permit('/api/query/sql',{stmt:statement});sqlResult=data(await three('/api/query/sql',{stmt:statement}));
            evidence.sql={type:kind(sqlResult),fields:Array.isArray(sqlResult)?recordsShape(sqlResult):null,returnedKnownId:sqlResult?.[0]?.id===doc.id};
        }
    }
    if(!doc)evidence.blockApis={status:'unverified_no_safe_document_id'};
    await three('/api/file/getFile',{path:iconPath},'getFile:plugin-icon');
    const task=await three('/api/file/getFile',{path:taskPath},'getFile:task-index');
    evidence.taskIndex={classification:task?.classification,bytes:task?.bytes.length??null,
        items:Array.isArray(task?.json?.items)?task.json.items.length:Array.isArray(task?.json)?task.json.length:null};
    const project=await three('/api/file/getFile',{path:indexPath},'getFile:project-index');
    evidence.projectIndex={classification:project?.classification,fields:fieldTypes(project?.json),completeType:kind(project?.json?.complete)};
    await three('/api/file/getFile',{path:missingPath},'getFile:missing');
    await read('/api/file/getFile',{path:iconPath},{operation:'getFile:without-authorization',phase:'auth-control',auth:false});

    const bundle=await build({stdin:{contents:`
        export {requestChecked,lsNotebooks,lsNotebooksChecked,getPathByID,getChildBlocksChecked,batchGetBlockAttrs,sqlChecked,getFileChecked,getFileOrNullChecked} from './src/api';
        export {setSiyuanRuntimePort} from './src/runtime/siyuan-runtime-port';
        export {verifyReadProjectSnapshot} from './src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectIndex';
    `,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{
        name:'read-only-production-entry',setup(api){
            api.onResolve({filter:/siyuanComponentDataApi$/},()=>({path:'unreachable-maintenance',namespace:'audit'}));
            api.onLoad({filter:/.*/,namespace:'audit'},()=>({contents:'export function prepareChangedRecentDocsForIndex(){throw Error("maintenance forbidden");}',loader:'js'}));
            api.onLoad({filter:/[\\/]enhancedDiaryProjectIndex\.ts$/},async({path})=>({contents:await readFile(path,'utf8')+'\nexport {readCreationIndex as verifyReadProjectSnapshot};',loader:'ts',resolveDir:resolve(path,'..')}));
        },
    }]});
    const app=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    app.setSiyuanRuntimePort({
        async post(path,payload){if(!allowed.get(path)?.has(JSON.stringify(payload))){blockedCalls++;throw Error('forbidden API');}
            const result=await read(path,payload,{phase:'production'});assert(result?.json,'JSON transport failure');return result.json;},
        async getFile(path){if(!files.has(path)){blockedCalls++;throw Error('forbidden file');}
            const result=await read('/api/file/getFile',{path},{phase:'production'});assert(result,'file transport failure');
            return result.json??result.bytes.buffer.slice(result.bytes.byteOffset,result.bytes.byteOffset+result.bytes.byteLength);},
        async putFile(){blockedCalls++;throw Error('all writes forbidden');},
    });
    async function check(name,run){try{await run();production.push({name,status:'pass'});}
        catch(error){production.push({name,status:'failed',category:error.name});}}
    await check('requestChecked/lsNotebooksChecked',async()=>assert(Array.isArray((await app.lsNotebooksChecked()).notebooks)));
    // Supply the browser URL transport only; the body still comes from the real Kernel.
    globalThis.fetch=async(path,options)=>{
        assert.equal(path,'/api/notebook/lsNotebooks');assert.equal(options?.method,'POST');assert.equal(options?.body,'{}');
        const result=await read(path,{}, {phase:'production'});assert(result,'browser transport failure');
        return new Response(result.bytes,{status:result.response.status,headers:result.response.headers});
    };
    try{await check('browser-relative-lsNotebooks',async()=>assert(Array.isArray((await app.lsNotebooks()).notebooks)));}
    finally{globalThis.fetch=kernelFetch;}
    if(doc){
        await check('requestChecked/listDocsByPath',async()=>{const value=await app.requestChecked('/api/filetree/listDocsByPath',list);assert(Array.isArray(value.files));assert.equal(value.box,book.id);assert.equal(value.path,'/');
            for(const item of value.files){assert(idValid(item.id));assert.equal(typeof item.name,'string');assert.equal(typeof item.path,'string');assert.equal(typeof item.mtime,'number');assert(Number.isFinite(item.mtime));}});
        await check('getPathByID',async()=>assert.equal((await app.getPathByID(doc.id)).path,pathResult.path));
        await check('getChildBlocksChecked',async()=>assert(Array.isArray(await app.getChildBlocksChecked(doc.id))));
        await check('batchGetBlockAttrs',async()=>{const value=await app.batchGetBlockAttrs(ids);assert(ids.every((id)=>kind(value[id])==='object'));});
        await check('sqlChecked',async()=>assert.equal((await app.sqlChecked(statement))[0]?.id,doc.id));
    }
    await check('getFileChecked/binary',async()=>assert((await app.getFileChecked(iconPath)) instanceof ArrayBuffer));
    await check('getFileOrNullChecked/missing',async()=>assert.equal(await app.getFileOrNullChecked(missingPath),null));
    if(project?.classification==='file_json'&&typeof project.json?.containerSignature==='string'){
        await check('strict-project-index-parser',async()=>{const value=await app.verifyReadProjectSnapshot(project.json.containerSignature,false);assert.equal(typeof value.complete,'boolean');});
    }else production.push({name:'strict-project-index-parser',status:'unverified_no_existing_index'});
    evidence.authControl=samples.find((item)=>item.phase==='auth-control');
    return {version:1,evidence,measurements:stats(),production,requestCount,blockedCalls,indexWrites:0,
        samples:samples.map((sample)=>({...sample})),networkFailure:'not_induced'};
}
try{
    const result=await main();
    await writeFile(join(tmpdir(),'homepage-local-kernel-readonly.json'),JSON.stringify(result,null,2),'utf8');
    console.log(JSON.stringify({audit:'completed',requestCount:result.requestCount,indexWrites:0,production:result.production}));
    if(result.production.some((item)=>item.status==='failed')||result.blockedCalls)process.exitCode=1;
}catch(error){
    await writeFile(join(tmpdir(),'homepage-local-kernel-readonly.json'),JSON.stringify({audit:'stopped',category:error.name}),'utf8');
    console.log(JSON.stringify({audit:'stopped',category:error.name}));process.exitCode=1;
}
