import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { compile, parse, preprocess } from "svelte/compiler";
import { compileString } from "sass-embedded";
import ts from "typescript";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const componentPath = resolve(root, "src/components/utils/widgetBlock/contentSetting.svelte");
const source = await readFile(componentPath, "utf8");
// Parse the script/template at their original offsets; SCSS is preprocessed when compiling below.
const ast = parse(source.slice(0, source.lastIndexOf("<style")), { modern: true }), nodes = ast.instance.content.body;
const snippet = (node) => source.slice(node.start, node.end);
function walk(value, visit) {
    if (!value || typeof value !== "object") return;
    visit(value);
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach((item) => walk(item, visit)); else walk(child, visit);
}
let confirm;
walk(ast.fragment, (node) => {
    if (node.type === "RegularElement" && node.attributes?.some((attr) => attr.name === "class" && attr.value?.[0]?.data === "confirm-button")) {
        const value = node.attributes.find((attr) => attr.name === "onclick").value;
        confirm = (Array.isArray(value) ? value[0] : value).expression;
    }
});
assert(confirm, "must execute the original confirm handler");
const imports = nodes.filter((node) => node.type === "ImportDeclaration" && !["svelte", "siyuan"].includes(node.source.value)).map(snippet).join("\n");
const script = nodes.filter((node) => node.type !== "ImportDeclaration").map((node) => {
    if (node.type === "VariableDeclaration" && node.declarations[0].id.name === "widgetSearchResults") {
        return "const widgetSearchResults = {find: (predicate) => getWidgetSearchResults(widgetSearchText).find(predicate)};";
    }
    return snippet(node);
}).join("\n");
async function hostMethod(file, method) {
    const text = await readFile(resolve(root, file), "utf8"), tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let found;
    const visit = (node) => { if (ts.isMethodDeclaration(node) && node.name.getText(tree) === method) found = node.getText(tree); ts.forEachChild(node, visit); };
    visit(tree); assert(found); return found;
}
const homeMethod = await hostMethod("src/components/utils/widgetBlock/WidgetBlock.ts", "openContentSettings");
const sidebarMethod = await hostMethod("src/components/utils/sidebar/sidebarWidgetBlock.ts", "setupEventListeners");
const bundle = await build({
    stdin: { resolveDir: dirname(componentPath), loader: "ts", contents: `
        ${imports}
        import ContentSettings from "./contentSetting.svelte";
        export {ContentSettings}; export {render} from "svelte/server";
        export {setSiyuanRuntimePort} from "@/runtime/siyuan-runtime-port";
        export {isPremiumWidgetType} from "@/features/entitlement/homepage-premium-features";
        export function settings(props) {
            const mounts = [], $props = () => props, $state = (value) => value;
            const onMount = (callback) => mounts.push(callback), showMessage = () => {};
            ${script}
            return { mount: mounts[0], confirm: ${snippet(confirm)}, close: onClose,
                query(value) {widgetSearchText = value;}, select: selectWidgetSearchResult, keydown: handleWidgetSearchKeydown,
                category: handleCategoryChange, dropdown: handleContentTypeChange, options: (tab) => getWidgetOptions(getRawWidgetOptionsForTab(tab)),
                premium(value) {advancedEnabled = value;},
                get snapshot() {return {selectedContentType,activeTab,widgetSearchText,advancedEnabled,loadedWidgetConfig,customWeatherCityName};},
                get results() {return getWidgetSearchResults(widgetSearchText);}
            };
        }
        export function host(surface) {
            let constructor, mounted, closed = 0, writes = [], contentClick, stored;
            const WidgetBlockContent = ContentSettings;
            const mount = (component, options) => {mounted = {component, ...options};};
            const svelteDialog = (options) => {constructor = options.constructor;return {close(){closed++;}};};
            const saveWidgetContentPreservingSize = async (...args) => {writes.push(args);stored=args[2];};
            const loadWidgetInstanceConfig = async () => stored, normalizeWidgetConfigData = (value) => value;
            class Home {${homeMethod}}
            class Sidebar {${sidebarMethod}}
            const context = {scopeId:"fixture",surface};
            const instance = Object.assign(surface === "homepage" ? new Home() : new Sidebar(), {
                plugin:{ADVANCED:true},id:"fixture-widget",isNewInstance:false,currentBlockForSettingsRef:{value:null},
                deviceViewContext:context,runtimeOptions:{deviceViewContext:context},updateContent() {},
                element:{id:"fixture-widget",dataset:{},querySelector(selector){return selector === ".block-content-button" ? {addEventListener(event,callback){contentClick=callback;}} : null;}}
            });
            if(surface === "homepage") instance.openContentSettings(); else {instance.setupEventListeners();contentClick();}
            constructor({});
            return {props:mounted.props,component:mounted.component,context,writes,get closed(){return closed;}};
        }
    ` }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "widget-settings-fixture", setup(builder) {
        builder.onResolve({filter:/^svelte(?:\/|$)/},({path})=>({path:import.meta.resolve(path),external:true}));
        builder.onResolve({filter:/^siyuan$/},()=>({path:"siyuan",namespace:"fixture"}));
        builder.onResolve({filter:/^@\/homepage\/deviceView\/widgetInstanceRepository$/},()=>({path:"repository",namespace:"fixture"}));
        builder.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({loader:"js",contents:path === "repository"
            ? "export const loadWidgetInstanceConfig = async () => structuredClone(globalThis.__widgetLoadedConfig);"
            : "export const showMessage = () => {}; export const openTab = () => {}; export const openAssetPicker = () => {throw new Error('Unexpected asset picker call');};"}));
        builder.onLoad({filter:/\.svelte$/},async({path})=>{
            let component;
            if(path === componentPath){
                component=source;
                const edits=[];
                for(const node of nodes) if(node.type === "VariableDeclaration") for(const declaration of node.declarations){
                    if(["selectedContentType","activeTab","widgetSearchText","advancedEnabled"].includes(declaration.id.name)){
                        const argument=declaration.init.arguments[0];
                        edits.push({start:argument.start,end:argument.end,value:`globalThis.__widgetRender.${declaration.id.name} ?? (${snippet(argument)})`});
                    }
                }
                for(const edit of edits.sort((a,b)=>b.start-a.start)) component=component.slice(0,edit.start)+edit.value+component.slice(edit.end);
            }else if(["PremiumSelect.svelte","PremiumMark.svelte"].includes(basename(path)))component=await readFile(path,"utf8");
            else component=`<span data-setting="${basename(path)}"></span>`;
            const processed=await preprocess(component,{style:({content,attributes})=>attributes.lang === "scss"
                ? {code:compileString(content,{url:pathToFileURL(path),loadPaths:[dirname(path)]}).css}:undefined},{filename:path});
            return {contents:compile(processed.code,{filename:path,generate:"server",css:"external"}).js.code,loader:"js",resolveDir:dirname(path)};
        });
    }}],
});
const rt=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
let apiCalls=0, saves=[], closed=0;
const warnings=[], originalWarn=console.warn;
console.warn=(message)=>warnings.push(message);
// Notebook loading uses fetch; stub that existing mount request as well as the runtime port.
globalThis.fetch=async(path)=>{apiCalls++;assert.equal(path,"/api/notebook/lsNotebooks");return new Response(JSON.stringify({code:0,data:{notebooks:[]}}),{status:200,headers:{"Content-Type":"application/json"}});};
rt.setSiyuanRuntimePort({async post(path){apiCalls++;assert.equal(path,"/api/notebook/lsNotebooks");return {code:0,data:{notebooks:[]}};}});
globalThis.__widgetLoadedConfig={type:"weather",activeTab:"tool",data:{cityName:"模拟城市",cityCode:"fixture",weatherStyle:"default"}};
const original=structuredClone(globalThis.__widgetLoadedConfig);
const props={plugin:{ADVANCED:false},deviceViewContext:{scopeId:"fixture",surface:"homepage"},currentBlockId:"fixture-widget",onClose:()=>closed++,onConfirm:async(value)=>saves.push(JSON.parse(value))};
const settings=rt.settings(props);await settings.mount();assert.equal(settings.snapshot.selectedContentType,"weather");assert.equal(settings.snapshot.activeTab,"tool");
const baselineCalls=apiCalls, baseline=structuredClone(settings.snapshot);
const values=()=>settings.results.map((item)=>item.value);
for(const [query, expected] of [["日记",["recent-journals","enhancedDiary"]],["图表",["visualChart"]],["picCARO",["PicCaro"]],["天气",["weather"]],["增强日记",["enhancedDiary"]],["轮播图",["PicCaro"]],["每日一句",["dailyQuote"]]]){
    settings.query(query);assert.deepEqual(values(),expected);
}
settings.query("文档");assert(settings.results.length > 4);assert(settings.results.some((item)=>item.tab === "note")&&settings.results.some((item)=>item.tab === "custom"));
settings.query("可视化");assert.deepEqual(values(),["heatmap","sql","visualChart","globalCalendar","statisticalCard"]);
for(const query of ["","   ","不存在的组件"]){settings.query(query);assert.deepEqual(settings.results,[]);}
assert.deepEqual({...settings.snapshot,widgetSearchText:""},{...baseline,widgetSearchText:""});
assert.deepEqual(globalThis.__widgetLoadedConfig,original);assert.equal(saves.length,0);assert.equal(apiCalls,baselineCalls);
assert.equal(baselineCalls,1,"existing mount loads notebooks once through the mocked transport");

settings.query("图表");assert.equal(settings.results[0].requiresAdvanced,true);assert.equal(settings.results[0].disabled,true);
settings.select("visualChart");assert.equal(settings.snapshot.selectedContentType,"weather","cannot bypass PremiumSelect with a search handler");
const key=(name)=>{const event={key:name,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};settings.keydown(event);return event;};
assert.equal(key("Enter").prevented,true);assert.equal(settings.snapshot.selectedContentType,"weather");assert.equal(saves.length,0);
settings.query("日记");key("Enter");assert.equal(settings.snapshot.selectedContentType,"recent-journals");assert.equal(settings.snapshot.activeTab,"note");assert.equal(settings.snapshot.widgetSearchText,"");
settings.query("天气");const escape=key("Escape");assert.equal(escape.stopped,true);assert.equal(settings.snapshot.widgetSearchText,"");assert.equal(settings.snapshot.selectedContentType,"recent-journals");
assert.equal(key("Tab").prevented,false);assert.equal(key("Enter").stopped,true);assert.equal(saves.length,0);
settings.premium(true);settings.query("PicCaro");assert.equal(settings.results[0].disabled,false);settings.select("PicCaro");assert.equal(settings.snapshot.activeTab,"tool");
settings.query("图表");settings.select("visualChart");assert.equal(settings.snapshot.activeTab,"visualization");
settings.premium(false);settings.query("图表");settings.select("visualChart");assert.equal(settings.snapshot.widgetSearchText,"图表","revoked permission prevents selection");
settings.query("天气");settings.select("weather");assert.equal(settings.snapshot.activeTab,"tool");
assert.equal(apiCalls,baselineCalls);assert.equal(saves.length,0);await settings.confirm();assert.equal(saves.length,1);assert.equal(saves[0].data.cityName,"模拟城市");
settings.query("日记");settings.close();assert.equal(closed,1);assert.equal(saves.length,1);assert.deepEqual(globalThis.__widgetLoadedConfig,original);

function html(snapshot){globalThis.__widgetRender=snapshot;return rt.render(rt.ContentSettings,{props}).body;}
settings.query("图表");const locked=html(settings.snapshot);assert(locked.includes("高级会员专属"));assert.match(locked,/disabled/);
settings.premium(true);settings.query("PicCaro");assert(html(settings.snapshot).includes("图片轮播"));settings.select("PicCaro");
assert(html(settings.snapshot).includes('data-setting="PicCaroSet.svelte"'),"search selection renders the original settings branch");
settings.query("不存在的组件");assert(html(settings.snapshot).includes("没有找到匹配的组件"));settings.query("");assert(!html(settings.snapshot).includes('aria-label="组件搜索结果"'));
for(const tab of ["note","visualization","tool","info","custom"]){
    settings.category(tab);assert(settings.options(tab).length);const option=settings.options(tab).find((item)=>!item.disabled);settings.dropdown(option.value);assert.equal(settings.snapshot.activeTab,tab);
    assert(html(settings.snapshot).includes('role="combobox"'),"original PremiumSelect still renders");
    for(const item of settings.options(tab))assert.equal(!!item.requiresAdvanced,rt.isPremiumWidgetType(item.value));
}
for(const surface of ["homepage","sidebar"]){
    const host=rt.host(surface);assert.equal(host.component,rt.ContentSettings);assert.equal(host.props.deviceViewContext,host.context);
    globalThis.__widgetLoadedConfig=structuredClone(original);const form=rt.settings(host.props);await form.mount();
    form.query("日记");assert.equal(host.writes.length,0);form.select("recent-journals");assert.equal(host.writes.length,0);
    form.close();assert.equal(host.closed,1);assert.equal(host.writes.length,0);
    await form.confirm();assert.equal(host.writes.length,1);assert.equal(host.writes[0][3],host.context);assert.equal(host.writes[0][2].type,"recent-journals");
}
console.warn=originalWarn;assert.deepEqual(warnings,[],"fixture must not silently pass a failed mount");
console.log("PASS widget search: actual catalog/functions/handlers/confirm/mount, names/types/categories/aliases/order, no API or save on search, Premium gate, Enter/Escape/Tab, original panels/dropdowns, existing config, both real host methods");
