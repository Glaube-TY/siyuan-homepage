import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { parse, compile } from "svelte/compiler";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const page = await readFile(resolve(root, "src/homepage/homepage.svelte"), "utf8");
const pageAst = parse(page, { modern: true });
const guidePath = resolve(root, "src/homepage/onboarding/HomepageOperationGuideDialog.svelte");
const component = await readFile(guidePath, "utf8");
const componentAst = parse(component, { modern: true });
const named = (name) => {
    const node = pageAst.instance.content.body.find((entry) => entry.type === "FunctionDeclaration" && entry.id.name === name);
    assert(node, name); return page.slice(node.start, node.end);
};
const controller = pageAst.instance.content.body.find((node) => node.type === "VariableDeclaration" && node.declarations.some((entry) => entry.id.name === "homepageOperationGuide"));
assert(controller);
const componentScript = componentAst.instance.content.body.filter((node) => node.type !== "ImportDeclaration").map((node) => component.slice(node.start, node.end)).join("\n");
const menuConstants = pageAst.instance.content.body.filter((node) => node.type === "VariableDeclaration" && node.declarations[0].id.name?.startsWith("HOMEPAGE_CONTEXT_")).map((node) => page.slice(node.start, node.end)).join("\n");
let mountCallback, destroyCallback;
function walk(node, visitor) {
    if (!node || typeof node !== "object") return;
    visitor(node);
    Object.values(node).forEach((child) => Array.isArray(child) ? child.forEach((item) => walk(item, visitor)) : walk(child, visitor));
}
walk(pageAst.instance, (node) => {
    if (node.type === "CallExpression" && node.callee.name === "onMount") mountCallback = node.arguments[0];
    if (node.type === "CallExpression" && node.callee.name === "onDestroy") destroyCallback = node.arguments[0];
});
const calls = [];
walk(mountCallback, (node) => { if (node.type === "CallExpression") calls.push(node.callee.name); });
assert(calls.indexOf("revealInitializedHomepage") < calls.indexOf("tryOpenHomepageOperationGuide"), "real mount must reveal before requesting the guide");
let destroysGuide = false;
walk(destroyCallback, (node) => { if (node.type === "CallExpression" && node.callee.object?.name === "homepageOperationGuide" && node.callee.property.name === "destroy") destroysGuide = true; });
assert(destroysGuide, "real unmount must dispose the guide");

const bundle = await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
        import {createHomepageOperationGuide,suppressHomepageOperationGuide} from './src/homepage/onboarding/homepageOperationGuide';
        export * from './src/homepage/onboarding/homepageOperationGuide';
        export {default as Guide} from './src/homepage/onboarding/HomepageOperationGuideDialog.svelte';
        export {render} from 'svelte/server';
        import {createBuiltinButton} from './src/homepage/buttonRegistry';
        export {createDefaultButtons,normalizeButtonsList} from './src/homepage/buttonRegistry';
        export function contextMenu() {
            const calls=[],menus=[],settings=[],plugin={},currentBlockForSettingsRef={value:null},containerEl={isConnected:true};
            const getButtonAction=item=>item.action,handleButtonClick=(...args)=>calls.push(args),ensureWidgetAddTargetReady=async()=>({containerEl,sectionsEnabled:false}),saveLayout=()=>{},handleFirstContentCommitted=()=>{};
            class Element {closest(){return null;}}
            const Menu=class{constructor(){menus.push(this);this.items=[];}addItem(item){this.items.push(item);}addSeparator(){}open(position){this.position=position;}};
            const createOpenHomepageSetting=(...args)=>()=>settings.push(args);
            ${menuConstants}
            ${["invokeHomepageButton","resolveHomepageContextRegion","openHomepageSettingAt","handleHomepageContextMenu","initializeHomepageContextMenu"].map(named).join("\n")}
            let listener;const node={addEventListener(type,fn){listener=fn;},removeEventListener(){listener=null;}};
            const binding=initializeHomepageContextMenu(node);
            return {calls,menus,settings,containerEl,destroy:binding.destroy,rightClick(){listener({target:new Element(),clientX:20,clientY:30,preventDefault(){},stopPropagation(){}});}};
        }
        export function guideUi(props) {
            const $props=()=>props,$state=value=>value,onMount=()=>{};
            ${componentScript}
            return {suppress,close:onClose,key:handleKeydown,get error(){return errorMessage;}};
        }
        export function homepage(options={}) {
            const plugin={isMobile:options.mobile||false};
            let homepageComponentDestroyed=false,homepageConfigLoaded=options.config!==false,initialWidgetGridReady=options.grid!==false;
            let homepageInitialLoadState=options.state||'ready',themeTransitionOverlayActive=options.overlay||false,initialThemeRendererMounted=false;
            let homepageThemeTransition=null,homepageThemeTransitionTimer=null,cancelDeferredHomepageEffects=null,homepageVisibilityObserver=null;
            let pendingExternalStorageRefresh=false;
            const document={visibilityState:options.documentHidden?'hidden':'visible',addEventListener(...args){globalThis.__guide.listeners.set(...args);},removeEventListener(name){globalThis.__guide.listeners.delete(name);}};
            const homepageRootElement={isConnected:true,clientWidth:options.hidden?0:800,clientHeight:600,getClientRects(){return this.clientWidth?[{}]:[];}};
            const getComputedStyle=()=>({display:'block',visibility:'visible'}),ResizeObserver=class{constructor(fn){globalThis.__guide.resize=fn;}observe(){}disconnect(){globalThis.__guide.disconnected++;}};
            const tick=async()=>{},waitForPersistentRegionsMountable=async()=>true,scheduleThemeRegionValidation=()=>{},updateCustomGridMetrics=()=>{};
            const warmedHomepageThemeIds=new Set(),themeResolution={effectiveThemeId:'fixture'},MIN_THEME_TRANSITION_OVERLAY_MS=0;
            const abortStatusAiRequest=()=>{},cleanupFallingEffects=()=>{},cleanupMouseEffects=()=>{},requestExternalStorageRefresh=()=>{},dispatchHomepageThemeTransition=()=>{};
            ${page.slice(controller.start, controller.end)}
            ${["tryOpenHomepageOperationGuide","isHomepageRuntimeVisibleAndMountable","setupHomepageVisibilityObserver","teardownHomepageVisibilityObserver","revealInitializedHomepage","handleHomepageTabBeforeDestroy","finishHomepageThemeTransition"].map(named).join("\n")}
            setupHomepageVisibilityObserver();
            return {request:tryOpenHomepageOperationGuide,destroy(){handleHomepageTabBeforeDestroy();teardownHomepageVisibilityObserver();},
                async reveal(){await revealInitializedHomepage();tryOpenHomepageOperationGuide();},
                visibility(visible){homepageRootElement.clientWidth=visible?800:0;globalThis.__guide.resize();},
                ready(){homepageInitialLoadState='ready';tryOpenHomepageOperationGuide();},
                overlayDone(){themeTransitionOverlayActive=false;homepageThemeTransition={themeId:'fixture',requestId:1,startedAt:performance.now(),firstActivation:false,trace:{finish(){}}};finishHomepageThemeTransition('fixture');},
                get state(){return homepageInitialLoadState;}};
        }
    ` }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "guide-fixture", setup(builder) {
        builder.onResolve({ filter: /^@\/libs\/dialog$/ }, () => ({path:"dialog",namespace:"fixture"}));
        builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({path,importer}) => path === "svelte" && importer.endsWith("homepageOperationGuide.ts")
            ? {path:"mount",namespace:"fixture"} : {path:import.meta.resolve(path),external:true});
        builder.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({contents:path === "mount"
            ? "export const mount=(component,args)=>{globalThis.__guide.props=args.props;return {};};"
            : "export const isSiyuanMobileFrontend=()=>globalThis.__guide.mobile;export const svelteDialog=options=>globalThis.__guide.open(options);",loader:"js"}));
        builder.onLoad({filter:/\.svelte$/},async({path})=>({contents:compile(await readFile(path,"utf8"),{filename:path,generate:"server",css:"external"}).js.code,loader:"js",resolveDir:dirname(path)}));
    }}],
});
let sequence = 0;
async function fixture(storage = new Map()) {
    const state={storage,writes:[],frames:new Map(),dialogs:[],mobile:false,failRead:false,failWrite:false,mismatch:false,listeners:new Map(),disconnected:0};
    globalThis.__guide=state;
    globalThis.window={localStorage:{getItem(key){if(state.failRead)throw Error("read failed");return state.mismatch?null:storage.get(key)??null;},setItem(key,value){if(state.failWrite)throw Error("write failed");state.writes.push([key,value]);storage.set(key,value);}}};
    let rafId=0;
    globalThis.requestAnimationFrame=(fn)=>{state.frames.set(++rafId,fn);return rafId;};
    globalThis.cancelAnimationFrame=(id)=>state.frames.delete(id);
    state.open=(options)=>{
        const entry={options,closed:false,props:null,close(){if(entry.closed)return;entry.closed=true;options.callback?.();}};
        options.constructor({});entry.props=state.props;state.dialogs.push(entry);return {close:entry.close};
    };
    state.flush=async()=>{for(let attempt=0;attempt<12;attempt++){await Promise.resolve();const pending=[...state.frames];state.frames.clear();pending.forEach(([,fn])=>fn());}};
    const runtime=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${sequence++}`);
    return {state,runtime};
}

{
    const {state,runtime}=await fixture();
    const home=runtime.homepage({state:"loading"});home.request();await state.flush();assert.equal(state.dialogs.length,0);
    const revealing=home.reveal();assert.equal(state.dialogs.length,0);await state.flush();await revealing;
    assert.equal(home.state,"ready");assert.equal(state.dialogs.length,1);assert.equal(state.dialogs[0].options.title,"主页操作提示");
    runtime.guideUi(state.dialogs[0].props).close();assert.deepEqual(state.writes,[]);
    for(let count=0;count<20;count++)state.resize();home.overlayDone();home.ready();await state.flush();assert.equal(state.dialogs.length,1);
    home.destroy();const reopened=runtime.homepage();reopened.request();await state.flush();assert.equal(state.dialogs.length,2);reopened.destroy();
}
for(const options of [{config:false},{grid:false},{state:"error"},{mobile:true},{documentHidden:true}]) {
    const {state,runtime}=await fixture();const home=runtime.homepage(options);home.request();await state.flush();assert.equal(state.dialogs.length,0,JSON.stringify(options));home.destroy();
}
{
    const {state,runtime}=await fixture();const home=runtime.homepage({hidden:true});home.request();await state.flush();assert.equal(state.dialogs.length,0);
    home.visibility(true);await state.flush();assert.equal(state.dialogs.length,1);home.destroy();
    const overlay=runtime.homepage({overlay:true});overlay.request();await state.flush();assert.equal(state.dialogs.length,1);overlay.overlayDone();await state.flush();assert.equal(state.dialogs.length,2);overlay.destroy();
}
for(const closeKind of ["close","x","escape","mask","external","tab","plugin-unload"]) {
    const {state,runtime}=await fixture();const home=runtime.homepage();home.request();await state.flush();
    const ui=runtime.guideUi(state.dialogs[0].props);
    if(closeKind === "close")ui.close();
    else if(closeKind === "escape")ui.key({key:"Escape",preventDefault(){},stopPropagation(){}});
    else if(closeKind === "tab"||closeKind === "plugin-unload")home.destroy();
    else state.dialogs[0].close(); // Native Dialog X, mask and destroy all use its existing callback.
    assert(state.dialogs[0].closed);assert.deepEqual(state.writes,[]);home.request();await state.flush();assert.equal(state.dialogs.length,1);home.destroy();
}
{
    const {state,runtime}=await fixture();const home=runtime.homepage();home.request();await state.flush();runtime.guideUi(state.dialogs[0].props).suppress();
    assert.deepEqual(state.writes,[[runtime.HOMEPAGE_OPERATION_GUIDE_KEY,"1"]]);assert(state.dialogs[0].closed);home.destroy();
    const reopened=runtime.homepage();reopened.request();await state.flush();assert.equal(state.dialogs.length,1);reopened.destroy();
    const restarted=await fixture(state.storage);const afterRestart=restarted.runtime.homepage();afterRestart.request();await restarted.state.flush();assert.equal(restarted.state.dialogs.length,0);afterRestart.destroy();
}
for(const error of ["failWrite","failRead","mismatch"]) {
    const {state,runtime}=await fixture();const home=runtime.homepage();home.request();await state.flush();state[error]=true;
    const ui=runtime.guideUi(state.dialogs[0].props);ui.suppress();assert(!state.dialogs[0].closed);assert.match(ui.error,/保存失败/);
    state[error]=false;ui.close();assert(state.dialogs[0].closed);home.destroy();
}
{
    const {state,runtime}=await fixture();const home=runtime.homepage();home.request();await state.flush();const ui=runtime.guideUi(state.dialogs[0].props);
    state.failWrite=true;ui.suppress();assert(!state.dialogs[0].closed);state.failWrite=false;ui.suppress();assert(state.dialogs[0].closed);assert.equal(state.storage.get(runtime.HOMEPAGE_OPERATION_GUIDE_KEY),"1");home.destroy();
}
for(const marker of ["0","true","invalid"]) {
    const {state,runtime}=await fixture();state.storage.set(runtime.HOMEPAGE_OPERATION_GUIDE_KEY,marker);const home=runtime.homepage();home.request();await state.flush();assert.equal(state.dialogs.length,1);assert.deepEqual(state.writes,[]);home.destroy();
}
{
    const {state,runtime}=await fixture();state.failRead=true;const home=runtime.homepage();home.request();await state.flush();assert.equal(state.dialogs.length,1);assert.equal(state.dialogs[0].props.readFailed,true);assert.deepEqual(state.writes,[]);home.destroy();
}
{
    const {state,runtime}=await fixture();const home=runtime.homepage();home.request();home.destroy();await state.flush();assert.equal(state.dialogs.length,0);assert.equal(state.frames.size,0);
    const midway=runtime.homepage();midway.request();const first=[...state.frames.values()][0];state.frames.clear();first();const stale=[...state.frames.values()][0];midway.destroy();stale();assert.equal(state.dialogs.length,0);
    const old=runtime.homepage(),next=runtime.homepage();old.request();next.request();await state.flush();assert.equal(state.dialogs.filter((entry)=>!entry.closed).length,1);
    old.destroy();await state.flush();assert.equal(state.dialogs.filter((entry)=>!entry.closed).length,1);const last=state.dialogs.at(-1);old.destroy();assert(!last.closed);next.destroy();assert(last.closed);
    const waitingOwner=runtime.homepage(),waitingDestroyed=runtime.homepage();waitingOwner.request();waitingDestroyed.request();await state.flush();const count=state.dialogs.length;waitingDestroyed.destroy();waitingOwner.destroy();await state.flush();assert.equal(state.dialogs.length,count);
    assert.equal(state.listeners.size,0);assert(state.disconnected>0);
}
{
    const {state,runtime}=await fixture();state.mobile=true;const home=runtime.homepage();home.request();await state.flush();assert.equal(state.dialogs.length,0);home.destroy();
    const html=runtime.render(runtime.Guide,{props:{onClose(){}}}).body;
    assert.match(html,/在主页空白处/);assert.match(html,/点击鼠标右键/);assert.match(html,/#iconAdd/);assert.match(html,/#iconSettings/);
    const buttons=[...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match)=>match[1].replace(/<!--[\s\S]*?-->/g,"").trim());
    assert.deepEqual(buttons,["不再显示","关闭"]);assert.deepEqual(state.writes,[]);
    assert.match(runtime.render(runtime.Guide,{props:{onClose(){},readFailed:true}}).body,/提示偏好读取失败/);
    const menu=runtime.contextMenu();menu.rightClick();assert.deepEqual(menu.menus[0].items.map((item)=>item.label),["添加组件","主页设置"]);
    menu.menus[0].items[0].click();await Promise.resolve();assert.equal(menu.calls[0][0].action,"addWidget");assert.equal(menu.calls[0][4].containerEl,menu.containerEl);
    menu.menus[0].items[1].click();assert.equal(menu.calls[1][0].action,"settings");menu.destroy();
    const defaults=runtime.createDefaultButtons();assert.deepEqual(defaults.map((item)=>item.action),["search","diary","aiKnowledgeBase","templateCenter","cleanEmptyDocs"]);
    assert(!runtime.normalizeButtonsList([...defaults,{action:"addWidget"},{action:"settings"}]).some((item)=>["addWidget","settings"].includes(item.action)));
}
console.log("PASS homepage operation guide: production controller, ready/visibility/theme hooks, one-shot and cross-instance ownership, all dismiss paths, checked local preference persistence, storage failures, destroy/RAF cleanup and real Svelte render; no homepage/widget writes");
