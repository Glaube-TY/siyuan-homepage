import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { parse, compile, preprocess } from "svelte/compiler";
import { compileString } from "sass-embedded";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "src/components/utils/widgetBlock/widget/PicCaro/";
const settingsSource = await readFile(resolve(root, `${base}PicCaroSet.svelte`), "utf8");
const runtimeSource = await readFile(resolve(root, `${base}PicCaro.svelte`), "utf8");
const parentSource = await readFile(resolve(root, "src/components/utils/widgetBlock/contentSetting.svelte"), "utf8");
async function scriptAst(source) {
    const processed = await preprocess(source, { style: () => ({ code: "" }) });
    return parse(processed.code, { modern: true });
}
const settingsAst = await scriptAst(settingsSource), runtimeAst = await scriptAst(runtimeSource);
const parentAst = await scriptAst(parentSource);
function functions(ast, source, names) {
    return names.map((name) => {
        const node = ast.instance.content.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === name);
        assert(node, name);
        return source.slice(node.start, node.end);
    }).join("\n");
}
function walk(node, visit) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
    visit(node);
    Object.values(node).forEach((child) => { if (child && typeof child === "object") walk(child, visit); });
}
const picBranches = [];
walk(parentAst, (node) => {
    if (node.type === "IfStatement" && node.test.type === "BinaryExpression" && node.test.right.value === "PicCaro") picBranches.push(node);
});
const loadBranch = picBranches.find((node) => node.test.left.type === "MemberExpression" && node.test.left.object.name === "parsedData");
const saveBranch = picBranches.find((node) => node.consequent.body.some((statement) => statement.expression?.left?.name === "contentTypeJson"));
const guardBranch = picBranches.find((node) => node.test.left.name === "selectedContentType" && node !== saveBranch);
assert(loadBranch && saveBranch && guardBranch);
const sliceBody = (node) => parentSource.slice(node.consequent.start + 1, node.consequent.end - 1);
const fieldNames = ["PicFolderPath", "PicAutoPlay", "PicInterval", "PicNavigation", "PicPagination", "PicPaginationType",
    "PicPaginationDyBu", "PicPaginationPrOp", "PicEffect", "PicSlidesPerView", "PicRandomSwitch"];

globalThis.__picMessages = [];
globalThis.__picStore = new Map();
globalThis.__picSwiperLoads = 0;
globalThis.__picRegisters = 0;
const output = await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { pickWorkspaceImage } from "./src/homepage/utils/workspaceImage";
        import { appendPicAsset, MAX_PIC_ASSETS, readPicCaroSource, loadPicCaroImages, picCaroPlaybackImages } from "./${base}picCaroData";
        import { showMessage } from "siyuan";
        export { setPicker } from "siyuan";
        export { readPicCaroSource, loadPicCaroImages, appendPicAsset, MAX_PIC_ASSETS, picCaroPlaybackImages } from "./${base}picCaroData";
        export { loadWidgetInstanceConfig, saveWidgetInstanceConfig } from "./src/homepage/deviceView/widgetInstanceRepository";
        export { render } from "svelte/server";
        export { default as Settings } from "./${base}PicCaroSet.svelte";
        export { default as Carousel } from "./${base}PicCaro.svelte";
        export function settings(paths, premium = true) {
            let PicSourceMode = "workspaceAssets", PicAssetPaths = paths, sourceError = "", advancedEnabled = premium;
            let alive = true, picking = false, selectionRevision = 0;
            ${functions(settingsAst, settingsSource, ["addImage", "removeImage", "moveImage", "cancelPendingSelection"])}
            return { add: addImage, remove: removeImage, move: moveImage, dispose: () => alive = false,
                setMode: (mode) => { cancelPendingSelection(); PicSourceMode = mode; },
                revoke: () => { cancelPendingSelection(); advancedEnabled = false; }, grant: () => advancedEnabled = true,
                get paths() { return PicAssetPaths; }, get busy() { return picking; } };
        }
        export function form(parsedData) {
            let PicSourceMode = "localFolder", PicAssetPaths = [], picSourceError = "";
            let ${fieldNames.join(", ")};
            ${sliceBody(loadBranch)}
            return { speed: (speed) => PicInterval = speed, paths: () => PicAssetPaths,
                save() {
                    ${sliceBody(guardBranch)}
                    let contentTypeJson; const effectiveActiveTab = "tool", currentBlockId = parsedData.instanceId;
                    ${sliceBody(saveBranch)}
                    return contentTypeJson;
                } };
        }
        export function carousel(data, premium = true) {
            let advancedEnabled = premium, PicAutoPlay = data.PicAutoPlay, widgetVisible = true, documentVisible = true;
            let swiperElement = null, images = [], failedPaths = [], loading = true, error = "", runtimeUnsupported = false;
            ${functions(runtimeAst, runtimeSource, ["loadImages", "imageFailed", "imageLoaded", "syncAutoplay", "initializeSwiper"])}
            return { load: loadImages, fail: imageFailed, success: imageLoaded, initialize: initializeSwiper,
                visible: (visible) => { widgetVisible = visible; syncAutoplay(); },
                documentVisible: (visible) => { documentVisible = visible; syncAutoplay(); },
                revoke: () => { advancedEnabled = false; syncAutoplay(); }, sync: syncAutoplay,
                get snapshot() { return { images, failedPaths, loading, error, runtimeUnsupported }; } };
        }
    ` }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "piccaro-fixture", setup(builder) {
        builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({ path: import.meta.resolve(path), external: true }));
        builder.onResolve({ filter: /^siyuan$/ }, () => ({ path: "sdk", namespace: "pic-fixture" }));
        builder.onResolve({ filter: /\/deviceViewStorage$/ }, () => ({ path: "storage", namespace: "pic-fixture" }));
        builder.onResolve({ filter: /^swiper\// }, ({ path }) => ({ path, namespace: "swiper-fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "swiper-fixture" }, ({ path }) => ({ contents: path.endsWith("?inline")
            ? 'export default "fixture css";'
            : path === "swiper/element" ? 'globalThis.__picSwiperLoads++; export const register = () => globalThis.__picRegisters++;'
            : 'export const A11y="a11y", Autoplay="autoplay", EffectCoverflow="coverflow", EffectCube="cube", EffectFade="fade", EffectFlip="flip", Navigation="navigation", Pagination="pagination";' }));
        builder.onLoad({ filter: /.*/, namespace: "pic-fixture" }, ({ path }) => ({ contents: path === "sdk" ? `
            export let openAssetPicker;
            export const setPicker = (picker) => openAssetPicker = picker;
            export const showMessage = (...args) => globalThis.__picMessages.push(args);
        ` : `
            const key = (context, id) => context.scopeId + "/" + context.surface + "/" + id;
            export const readDeviceWidget = async (context, id) => structuredClone(globalThis.__picStore.get(key(context,id)) ?? null);
            export const writeDeviceWidget = async (context, id, config, options) => {
                const prior = globalThis.__picStore.get(key(context,id));
                if (prior.revision !== options.expectedRevision) throw new Error("revision conflict");
                const doc = { config: structuredClone(config), revision: prior.revision + 1 };
                globalThis.__picStore.set(key(context,id), doc); return doc;
            };
            export const removeDeviceWidget = () => { throw new Error("Unexpected resource/instance deletion"); };
        ` }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
            let source = await readFile(path, "utf8");
            if (path.endsWith("/PicCaro.svelte") || path.endsWith("\\PicCaro.svelte")) {
                // Inject test state only into the actual component's state initializers; retain its renderer and events.
                const replacements = [];
                const fixtureStates = { images: "globalThis.__picRender.images", failedPaths: "globalThis.__picRender.failedPaths", loading: "false", advancedEnabled: "Boolean(plugin?.ADVANCED)" };
                for (const node of (await scriptAst(source)).instance.content.body) {
                    if (node.type !== "VariableDeclaration") continue;
                    for (const declaration of node.declarations) if (declaration.id.name in fixtureStates) {
                        const argument = declaration.init.arguments[0];
                        replacements.push({ start: argument.start, end: argument.end, value: fixtureStates[declaration.id.name] });
                    }
                }
                for (const edit of replacements.sort((a,b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
            }
            source = (await preprocess(source, { style: ({ content, attributes }) => attributes.lang === "scss"
                ? { code: compileString(content, { loadPaths: [dirname(path)] }).css } : undefined }, { filename: path })).code;
            return { contents: compile(source, { filename: path, generate: "server", css: "external" }).js.code, loader: "js", resolveDir: dirname(path) };
        });
    } }],
});
const rt = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
assert.equal(globalThis.__picSwiperLoads, 0, "Swiper must not load merely by importing the component");
const oldData = Object.fromEntries(fieldNames.map((field, i) => [field, i]));
Object.assign(oldData, { PicFolderPath: "C:/photos", PicAutoPlay: true, PicInterval: 3, PicEffect: "slide", PicRandomSwitch: false });
assert.equal(rt.readPicCaroSource(oldData).mode, "localFolder");
const oldWidget = { type: "PicCaro", instanceId: "widget-pic", data: oldData };
const oldForm = rt.form(oldWidget), oldSaved = oldForm.save();
assert.equal(oldSaved.data.PicFolderPath, oldData.PicFolderPath);
for (const field of fieldNames) assert.equal(oldSaved.data[field], oldData[field]);
const workspace = { ...oldData, PicSourceMode: "workspaceAssets", PicAssetPaths: ["assets/a.png", "assets/中文 空格%20.png"] };
assert.deepEqual(rt.readPicCaroSource(workspace).paths, workspace.PicAssetPaths);
for (const malformed of [null, "bad", {}, ["assets/a.txt"], ["assets/../bad.png"], ["https://external/a.png"], ["assets/a.png", "/assets/a.png"], Array(101).fill("assets/a.png")]) {
    const data = { ...workspace, PicAssetPaths: malformed }, before = structuredClone(data);
    assert.throws(() => rt.readPicCaroSource(data));
    assert.equal(rt.form({ ...oldWidget, data }).save(), undefined, "damaged configuration must block saving");
    assert.deepEqual(data, before);
}
assert.throws(() => rt.readPicCaroSource({ PicSourceMode: "workspaceAssets" }));
assert.throws(() => rt.readPicCaroSource({ PicSourceMode: "unknown" }));
assert.equal(rt.form({ ...oldWidget, data: null }).save(), undefined);
const form = rt.form({ ...oldWidget, data: workspace });
form.speed(8);
const edited = form.save();
assert.deepEqual(edited.data.PicAssetPaths, workspace.PicAssetPaths);
assert.equal(edited.data.PicInterval, 8);
assert.deepEqual(rt.form(edited).paths(), workspace.PicAssetPaths);
const context = { scopeId: "mobile-shared", surface: "homepage" };
const storageKey = "mobile-shared/homepage/widget-pic";
globalThis.__picStore.set(storageKey, { config: oldWidget, revision: 2 });
globalThis.__picStore.set("other/homepage/widget-pic", { config: oldWidget, revision: 9 });
await rt.saveWidgetInstanceConfig(context, "widget-pic", edited);
assert.deepEqual(await rt.loadWidgetInstanceConfig(context, "widget-pic"), edited);
assert.equal(globalThis.__picStore.get("other/homepage/widget-pic").revision, 9);

for (const result of [null, new Error("permission denied"), { path: "assets/../bad.png" }]) {
    const settings = rt.settings([...workspace.PicAssetPaths]);
    rt.setPicker(async () => { if (result instanceof Error) throw result; return result; });
    await settings.add();
    assert.deepEqual(settings.paths, workspace.PicAssetPaths);
    assert.equal(settings.busy, false);
}
const settings = rt.settings([...workspace.PicAssetPaths]);
rt.setPicker(async () => ({ path: "assets/a.png" }));
await settings.add();
assert.equal(settings.paths.length, 2);
rt.setPicker(async () => ({ path: "assets/new%20file.png" }));
await settings.add();
assert.equal(settings.paths[2], "assets/new%20file.png");
settings.move(2,-1); assert.equal(settings.paths[1], "assets/new%20file.png");
settings.remove(0); assert.equal(settings.paths.length, 2);
const full = rt.settings(Array.from({ length: 100 }, (_, i) => `assets/${i}.png`));
rt.setPicker(() => { throw new Error("Limit must prevent opening a picker"); });
await full.add(); assert.equal(full.paths.length, 100);
assert(globalThis.__picMessages.some(([message]) => message.includes("100")));
let choose;
rt.setPicker(() => new Promise((resolveChoice) => choose = resolveChoice));
const disposed = rt.settings([]), pending = disposed.add();
disposed.dispose(); choose({ path: "assets/a.png" }); await pending;
assert.deepEqual(disposed.paths, []);
const revoked = rt.settings([]), revokedPending = revoked.add();
revoked.revoke(); revoked.grant(); choose({ path: "assets/a.png" }); await revokedPending;
assert.deepEqual(revoked.paths, []);
const switched = rt.settings([]), switchedPending = switched.add();
switched.setMode("localFolder"); switched.setMode("workspaceAssets"); choose({ path: "assets/a.png" }); await switchedPending;
assert.deepEqual(switched.paths, []);

for (const mobile of [false,true]) {
    Object.defineProperty(globalThis, "navigator", { value: { userAgent: mobile ? "Android Mobile" : "Browser" }, configurable: true });
    globalThis.window = { require() { throw new Error("Workspace mode must never require fs/path"); } };
    const loaded = rt.loadPicCaroImages(workspace);
    assert.equal(loaded.unsupported, false);
    assert.equal(loaded.images[1].path, "/assets/%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC%2520.png");
}
globalThis.window = {};
assert.equal(rt.loadPicCaroImages(oldData).unsupported, true);
const reads = [];
globalThis.window = { require(name) {
    reads.push(name);
    return name === "fs" ? { readdirSync(path) { assert.equal(path, "C:/photos"); return ["a.JPG","b.png","legacy.raw","skip.txt"]; } }
        : { extname: (file) => file.slice(file.lastIndexOf(".")), join: (folder, file) => `${folder}/${file}` };
} };
assert.deepEqual(rt.loadPicCaroImages(oldData).images.map((image) => image.path), ["file://C:/photos/a.JPG", "file://C:/photos/b.png", "file://C:/photos/legacy.raw"]);
assert.deepEqual(reads, ["fs","path"]);
const runtime = rt.carousel(workspace); runtime.load();
const beforeFailure = structuredClone(runtime.snapshot.images);
runtime.fail(beforeFailure[0].path); assert.equal(runtime.snapshot.failedPaths.length, 1);
runtime.fail(beforeFailure[1].path); assert.equal(runtime.snapshot.failedPaths.length, 2);
assert.deepEqual(runtime.snapshot.images, beforeFailure);
runtime.success(beforeFailure[0].path); assert.equal(runtime.snapshot.failedPaths.length, 1);
assert.deepEqual(workspace.PicAssetPaths, ["assets/a.png", "assets/中文 空格%20.png"]);
const shuffled = rt.picCaroPlaybackImages(beforeFailure, true);
assert.notEqual(shuffled, beforeFailure);
assert.deepEqual([...shuffled].sort((a,b) => a.path.localeCompare(b.path)), [...beforeFailure].sort((a,b) => a.path.localeCompare(b.path)));

let starts = 0, stops = 0, destroys = 0;
const node = { initialize() { this.swiper = { destroyed: false, destroy() { destroys++; }, autoplay: { running: false,
    start() { starts++; this.running = true; }, stop() { stops++; this.running = false; } } }; } };
const action = runtime.initialize(node);
await new Promise((resolveWait) => setTimeout(resolveWait, 0));
assert.equal(globalThis.__picRegisters, 1);
assert.equal(node.modules.length, 8); assert.equal(node.injectStyles.length, 7);
assert.equal(starts, 1);
runtime.visible(false); assert.equal(stops, 1);
runtime.visible(true); assert.equal(starts, 2);
runtime.documentVisible(false); assert.equal(stops, 2);
runtime.documentVisible(true); assert.equal(starts, 3);
runtime.revoke(); assert.equal(stops, 3);
action.destroy(); assert.equal(destroys, 1);
const early = rt.carousel(workspace), beforeRegisters = globalThis.__picRegisters;
early.load(); early.initialize(node).destroy();
await new Promise((resolveWait) => setTimeout(resolveWait, 0));
assert.equal(globalThis.__picRegisters, beforeRegisters, "unmounted pending initialization must be discarded");
for (const effect of ["slide","fade","cube","coverflow","flip"]) {
    globalThis.__picRender = { images: beforeFailure, failedPaths: [] };
    const html = rt.render(rt.Carousel, { props: { plugin: { ADVANCED: true }, contentTypeJson: JSON.stringify({ data: { ...workspace, PicEffect: effect } }) } }).body;
    assert(html.includes("swiper-container")); assert(html.includes(`effect="${effect}"`));
    assert(html.includes('autoplay-delay="3000"')); assert(html.includes('loading="lazy"'));
}
for (const failureCount of [1,2]) {
    globalThis.__picRender = { images: beforeFailure, failedPaths: beforeFailure.slice(0,failureCount).map((image) => image.path) };
    const html = rt.render(rt.Carousel, { props: { plugin: { ADVANCED: true }, contentTypeJson: JSON.stringify({ data: workspace }) } }).body;
    assert(html.includes(failureCount === 1 ? "部分图片加载失败" : "全部图片无法显示"));
    assert(html.includes("尚未同步"));
}
const lockedHtml = rt.render(rt.Carousel, { props: { plugin: { ADVANCED: false }, contentTypeJson: JSON.stringify({ data: workspace }) } }).body;
assert(!lockedHtml.includes("swiper-container"));
assert(!rt.render(rt.Settings, { props: { advancedEnabled: false, PicSourceMode: "workspaceAssets", PicAssetPaths: workspace.PicAssetPaths } }).body.includes("添加图片"));
assert(rt.render(rt.Settings, { props: { advancedEnabled: true, PicSourceMode: "workspaceAssets", PicAssetPaths: workspace.PicAssetPaths } }).body.includes("图片列表（2 / 100）"));
console.log("PASS PicCaro: actual source parser/loaders, settings handlers/form read-save, instance repository, limits/cancel/error/disposal, local compatibility, cross-platform URLs, real Swiper markup/effects, lazy initialization/pause/cleanup and Premium gates");
