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
const guideSource = await readFile(resolve(root, "src/homepage/onboarding/HomepageOperationGuideDialog.svelte"), "utf8");
const guideAst = await scriptAst(guideSource);
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
        import { HOMEPAGE_THEME_TRANSITION_EVENT } from "./src/homepage/theme/runtime/themeTransitionEvents";
        export { setPicker } from "siyuan";
        export { readPicCaroSource, loadPicCaroImages, appendPicAsset, MAX_PIC_ASSETS, picCaroPlaybackImages } from "./${base}picCaroData";
        export { loadWidgetInstanceConfig, saveWidgetInstanceConfig } from "./src/homepage/deviceView/widgetInstanceRepository";
        export { render } from "svelte/server";
        export { default as Settings } from "./${base}PicCaroSet.svelte";
        export { default as Carousel } from "./${base}PicCaro.svelte";
        export { createHomepageOperationGuide } from "./src/homepage/onboarding/homepageOperationGuide";
        import { suppressHomepageOperationGuide } from "./src/homepage/onboarding/homepageOperationGuide";
        export function suppressGuide(onClose) {
            let saving = false, errorMessage = "";
            ${functions(guideAst, guideSource, ["suppress"])}
            suppress(); if (errorMessage) throw new Error(errorMessage);
        }
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
            const plugin = { ADVANCED: premium };
            let advancedEnabled = premium, PicAutoPlay = data.PicAutoPlay, widgetVisible = true, documentVisible = true;
            let swiperElement = null, images = [], failedPaths = [], loading = true, error = "", runtimeUnsupported = false;
            let requestSwiperSync = () => {}, mounted = false, rootElement;
            ${functions(runtimeAst, runtimeSource, ["loadImages", "imageFailed", "imageLoaded", "isSwiperLayoutReady", "syncAutoplay", "initializeSwiper"])}
            return { load: loadImages, fail: imageFailed, success: imageLoaded, initialize: initializeSwiper,
                mount(root) { rootElement = root; const onMount = (callback) => callback(); return ${runtimeSource.slice(
                    runtimeAst.instance.content.body.find((node) => node.expression?.callee?.name === "onMount").expression.start,
                    runtimeAst.instance.content.body.find((node) => node.expression?.callee?.name === "onMount").expression.end)}; },
                visible: (visible) => { widgetVisible = visible; requestSwiperSync(); },
                documentVisible: (visible) => { documentVisible = visible; requestSwiperSync(); },
                revoke: () => { advancedEnabled = false; requestSwiperSync(); }, sync: () => requestSwiperSync(),
                get snapshot() { return { images, failedPaths, loading, error, runtimeUnsupported }; } };
        }
    ` }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "piccaro-fixture", setup(builder) {
        builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path, importer }) => path === "svelte" && importer.endsWith("homepageOperationGuide.ts")
            ? { path: "guide-mount", namespace: "pic-fixture" } : { path: import.meta.resolve(path), external: true });
        builder.onResolve({ filter: /^@\/libs\/dialog$/ }, () => ({ path: "guide-dialog", namespace: "pic-fixture" }));
        builder.onResolve({ filter: /^siyuan$/ }, () => ({ path: "sdk", namespace: "pic-fixture" }));
        builder.onResolve({ filter: /\/deviceViewStorage$/ }, () => ({ path: "storage", namespace: "pic-fixture" }));
        builder.onResolve({ filter: /^swiper\// }, ({ path }) => ({ path, namespace: "swiper-fixture" }));
        builder.onResolve({ filter: /autoplay\.mjs$/, namespace: "swiper-fixture" }, ({ path }) => ({ path, namespace: "file" }));
        builder.onLoad({ filter: /.*/, namespace: "swiper-fixture" }, ({ path }) => ({ contents: path.endsWith("?inline")
            ? 'export default "fixture css";'
            : path === "swiper/element" ? 'globalThis.__picSwiperLoads++; export const register = () => globalThis.__picRegisters++;'
            : `export { default as Autoplay } from ${JSON.stringify(resolve(root, "node_modules/swiper/modules/autoplay.mjs"))};
                export const A11y="a11y", EffectCoverflow="coverflow", EffectCube="cube", EffectFade="fade", EffectFlip="flip", Navigation="navigation", Pagination="pagination";` }));
        builder.onLoad({ filter: /.*/, namespace: "pic-fixture" }, ({ path }) => ({ contents: path === "guide-mount"
            ? "export const mount=(component,options)=>{globalThis.__picGuideProps=options.props;return {};};"
            : path === "guide-dialog" ? `export const isSiyuanMobileFrontend=()=>false;
                export const svelteDialog=options=>{options.constructor({}); const dialog={props:globalThis.__picGuideProps,closed:false,
                    close(){if(this.closed)return;this.closed=true;options.callback?.();}};
                    globalThis.__picGuideDialogs.push(dialog);return {close:()=>dialog.close()};};`
            : path === "sdk" ? `
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

// Execute the production action/onMount callbacks and Swiper's installed Autoplay module.
// Geometry/observers and the clock are controlled; slide transitions deliver transitionend.
const savedGlobals = Object.fromEntries(["window", "document", "getComputedStyle", "MutationObserver", "ResizeObserver",
    "IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "Date"].map((key) => [key, globalThis[key]]));
const frames = new Map(), timers = new Map();
let sequence = 0, now = 0;
class TrackedEventTarget extends EventTarget {
    listeners = new Map();
    addEventListener(type, callback, options) {
        const callbacks = this.listeners.get(type) || new Set(); callbacks.add(callback); this.listeners.set(type, callbacks);
        super.addEventListener(type, callback, options);
    }
    removeEventListener(type, callback, options) {
        this.listeners.get(type)?.delete(callback); super.removeEventListener(type, callback, options);
    }
    get listenerCount() { return [...this.listeners.values()].reduce((count, callbacks) => count + callbacks.size, 0); }
}
globalThis.window = new TrackedEventTarget();
globalThis.document = Object.assign(new TrackedEventTarget(), { visibilityState: "visible" });
globalThis.getComputedStyle = (node) => ({ visibility: node.visibility });
globalThis.requestAnimationFrame = (callback) => { frames.set(++sequence, callback); return sequence; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.setTimeout = (callback, delay) => { timers.set(++sequence, { callback, at: now + delay }); return sequence; };
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.Date = class extends savedGlobals.Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
class Observer {
    static instances = [];
    targets = [];
    constructor(callback) { this.callback = callback; Observer.instances.push(this); }
    observe(target, options) { this.targets.push({ target, options }); }
    disconnect() { this.targets = []; }
    fire(entries = []) { if (this.targets.length) this.callback(entries); }
}
globalThis.MutationObserver = globalThis.ResizeObserver = globalThis.IntersectionObserver = Observer;
function frame() {
    const batch = [...frames.values()]; frames.clear(); batch.forEach((callback) => callback(now));
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function wake() { frame(); await settle(); }
async function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
        const next = [...timers].sort((a,b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback(); await wake();
    }
    now = end; await wake();
}
function fixture(config = workspace, { desktop = true, ready = true } = {}) {
    const runtime = rt.carousel(config); runtime.load();
    const homepage = desktop ? { dataset: { hpInitialState: ready ? "ready" : "loading" } } : null;
    const theme = desktop ? { ready, inert: !ready, hidden: !ready,
        classList: { contains: () => theme.ready }, getAttribute: () => String(theme.hidden) } : null;
    const node = { isConnected: true, clientWidth: 600, clientHeight: 300, visibility: ready ? "visible" : "hidden",
        closest: (selector) => selector === ".homepage-container" ? homepage : theme,
        initializeCalls: 0, updates: 0, starts: 0, stops: 0, resumes: 0, destroys: 0, indices: [0],
        initialize() {
            this.initializeCalls++;
            const handlers = new Map(), transitionTimers = new Set();
            const on = (name, callback) => { const list = handlers.get(name) || []; list.push(callback); handlers.set(name, list); };
            const emit = (name, ...args) => handlers.get(name)?.forEach((callback) => callback(...args));
            const swiper = this.swiper = { destroyed: false, activeIndex: 0, isEnd: false,
                params: { autoplay: { enabled: config.PicAutoPlay && runtime.snapshot.images.length >= 2,
                    delay: config.PicInterval * 1000, disableOnInteraction: false }, loop: true, speed: 800 },
                slides: runtime.snapshot.images.map(() => ({ getAttribute: () => null })), wrapperEl: new EventTarget(),
                update: () => { this.updates++; },
                slideNext: (speed) => {
                    swiper.activeIndex = (swiper.activeIndex + 1) % swiper.slides.length; this.indices.push(swiper.activeIndex);
                    emit("beforeTransitionStart", swiper, speed, true);
                    const id = setTimeout(() => { transitionTimers.delete(id); swiper.wrapperEl.dispatchEvent(new Event("transitionend")); }, speed);
                    transitionTimers.add(id);
                },
                destroy: () => { emit("destroy"); swiper.destroyed = true; this.destroys++; transitionTimers.forEach(clearTimeout); },
            };
            const Autoplay = this.modules[1];
            Autoplay({ swiper, params: swiper.params, on, emit, extendParams: (defaults) => {
                swiper.params.autoplay = { ...defaults.autoplay, ...swiper.params.autoplay };
            } });
            for (const [event, field] of [["autoplayStart", "starts"], ["autoplayStop", "stops"], ["autoplayResume", "resumes"]]) on(event, () => this[field]++);
            emit("init");
        },
    };
    const observerStart = Observer.instances.length;
    const cleanup = runtime.mount(node), action = runtime.initialize(node);
    const observers = Observer.instances.slice(observerStart);
    const mutation = observers.find((observer) => observer.targets.some(({ options }) => options?.attributeFilter));
    const resize = observers.find((observer) => observer.targets.some(({ options }) => !options) && observer !== observers[0]);
    const intersection = observers[0];
    intersection.fire([{ isIntersecting: true, intersectionRatio: 1 }]); runtime.sync();
    return { runtime, node, homepage, theme, mutation, resize, intersection,
        ready() {
            if (homepage) homepage.dataset.hpInitialState = "ready";
            if (theme) { theme.ready = true; theme.hidden = false; theme.inert = false; }
            node.visibility = "visible"; mutation?.fire();
        },
        intersect(visible) { intersection.fire([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]); runtime.sync(); },
        dispose() { action.destroy(); cleanup(); assert(observers.every((observer) => observer.targets.length === 0)); },
    };
}
function visibility(visible, fixtures) {
    document.visibilityState = visible ? "visible" : "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    fixtures.forEach(({ runtime }) => runtime.sync());
}
const threeImages = { ...workspace, PicAssetPaths: [...workspace.PicAssetPaths, "assets/c.png"] };
const startup = fixture(threeImages, { ready: false });
await wake();
assert.equal(startup.node.initializeCalls, 0);
assert.equal(globalThis.__picRegisters, 0, "hidden measurable startup must not import/register/init");
for (const { target, options } of startup.mutation.targets) {
    assert([startup.homepage, startup.theme].includes(target));
    assert.equal(options.childList, undefined); assert.equal(options.subtree, undefined);
}
startup.ready(); // Only readiness/visibility changes: no resize or refresh.
await wake();
assert.equal(startup.node.initializeCalls, 1); assert(startup.node.updates > 0);
assert.equal(startup.node.modules.length, 8); assert.equal(startup.node.injectStyles.length, 7);
assert.equal(startup.mutation.targets.length, 0, "initialization observer must disconnect immediately");
assert.equal(startup.node.swiper.autoplay.running, true); assert.equal(startup.node.swiper.autoplay.paused, false);
await advance(7600);
assert.deepEqual(startup.node.indices, [0,1,2], "real Autoplay timers advance at least twice without remount");
const starts = startup.node.starts;
const updates = startup.node.updates;
for (let i = 0; i < 10; i++) { startup.resize.fire(); startup.intersect(true); startup.mutation.fire(); }
await wake();
assert.equal(startup.node.initializeCalls, 1); assert.equal(startup.node.starts, starts); assert.equal(timers.size, 1);
assert.equal(startup.node.updates, updates, "unchanged visible geometry must not churn layout");
startup.node.swiper.autoplay.pause(true);
startup.runtime.sync(); await wake();
assert.equal(startup.node.swiper.autoplay.paused, false); assert.equal(startup.node.starts, starts);
assert(startup.node.resumes > 0);
startup.node.swiper.autoplay.pause(true);
const beforeUnrelatedTheme = startup.node.resumes;
window.dispatchEvent(new Event("homepage-theme-transition")); await wake();
assert.equal(startup.node.resumes, beforeUnrelatedTheme, "unrelated theme events must not disturb native transition pauses");
startup.runtime.sync(); await wake();
startup.intersect(false); assert.equal(startup.node.swiper.autoplay.running, false);
const beforeRevealUpdates = startup.node.updates;
startup.intersect(true); await wake();
assert(startup.node.updates > beforeRevealUpdates); assert.equal(startup.node.swiper.autoplay.running, true);
visibility(false, [startup]); assert.equal(startup.node.swiper.autoplay.running, false);
visibility(true, [startup]); await wake(); assert.equal(startup.node.swiper.autoplay.running, true);
window.dispatchEvent(new Event("homepage-theme-transition"));
startup.theme.hidden = true; startup.theme.inert = true; startup.node.visibility = "hidden";
await wake(); assert.equal(startup.node.swiper.autoplay.running, false);
startup.ready(); window.dispatchEvent(new Event("homepage-theme-transition"));
await wake(); assert.equal(startup.node.swiper.autoplay.running, true);
startup.runtime.fail(startup.runtime.snapshot.images[0].path);
startup.runtime.fail(startup.runtime.snapshot.images[1].path); startup.runtime.sync();
await wake(); assert.equal(startup.node.swiper.autoplay.running, false, "one usable image must not play");
startup.runtime.fail(startup.runtime.snapshot.images[2].path); startup.runtime.sync();
await wake(); assert.equal(startup.node.swiper.autoplay.running, false, "all failed images must not play");
startup.runtime.success(startup.runtime.snapshot.images[2].path);
startup.runtime.success(startup.runtime.snapshot.images[0].path); startup.runtime.sync();
await wake(); assert.equal(startup.node.swiper.autoplay.running, true);
window.dispatchEvent(new Event("homepage-advanced-unavailable")); startup.runtime.sync();
assert.equal(startup.node.swiper.autoplay.running, false);
startup.dispose(); assert.equal(startup.node.destroys, 1);
assert.equal(window.listenerCount, 0); assert.equal(document.listenerCount, 0);
window.dispatchEvent(new Event("homepage-advanced-ready"));
window.dispatchEvent(new Event("homepage-theme-transition")); await wake();
assert.equal(startup.node.destroys, 1); assert.equal(timers.size, 0);

visibility(false, []);
const background = fixture(threeImages); await wake(); assert.equal(background.node.initializeCalls, 0);
visibility(true, [background]); await wake(); assert.equal(background.node.initializeCalls, 1);
background.dispose();
for (const config of [{ ...workspace, PicAutoPlay: false }, { ...workspace, PicAssetPaths: ["assets/a.png"] }]) {
    const still = fixture(config); await wake(); still.resize.fire(); await wake();
    assert.equal(still.node.initializeCalls, 1); assert.equal(still.node.starts, 0); assert.equal(timers.size, 0);
    still.dispose();
}
for (const stage of ["readiness", "frame", "imports"]) {
    const pending = fixture(threeImages, { ready: stage !== "readiness" });
    if (stage === "imports") frame(); // Enter imports, destroy before their microtasks settle.
    pending.dispose(); await wake();
    assert.equal(pending.node.initializeCalls, 0); assert.equal(frames.size, 0); assert.equal(timers.size, 0);
    assert.equal(window.listenerCount, 0); assert.equal(document.listenerCount, 0);
}
const changedDuringImport = fixture(threeImages);
frame(); changedDuringImport.node.visibility = "hidden"; await settle();
assert.equal(changedDuringImport.node.initializeCalls, 0, "imports must recheck fresh visibility");
changedDuringImport.ready(); await wake(); assert.equal(changedDuringImport.node.initializeCalls, 1);
changedDuringImport.dispose();
for (const effect of ["slide", "fade", "cube", "coverflow", "flip"]) {
    const visible = fixture({ ...threeImages, PicEffect: effect }, { desktop: false });
    await wake(); assert.equal(visible.node.initializeCalls, 1, "visible supported placement starts on first frame");
    await advance(7600); assert.deepEqual(visible.node.indices, [0,1,2]); visible.dispose();
}
const zero = fixture(threeImages); zero.node.clientWidth = 0;
await wake(); assert.equal(zero.node.initializeCalls, 0);
zero.node.clientWidth = 600; zero.resize.fire(); await wake(); assert.equal(zero.node.initializeCalls, 1); zero.dispose();
for (const suppress of [false, true]) {
    const preferences = new Map();
    window.localStorage = { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) };
    globalThis.__picGuideDialogs = [];
    const home = fixture(threeImages, { ready: false });
    const guide = rt.createHomepageOperationGuide(() => home.homepage.dataset.hpInitialState === "ready");
    guide.request(); await wake(); assert.equal(globalThis.__picGuideDialogs.length, 0);
    home.ready(); guide.request(); await wake(); await wake();
    assert.equal(globalThis.__picGuideDialogs.length, 1);
    await advance(7600); assert.deepEqual(home.node.indices, [0,1,2], "guide open must not stall the carousel");
    const dialog = globalThis.__picGuideDialogs[0];
    if (suppress) rt.suppressGuide(dialog.props.onClose); else dialog.props.onClose();
    assert.equal(dialog.closed, true); assert.equal(preferences.size, suppress ? 1 : 0);
    await advance(3800); assert.equal(home.node.indices.length, 4); assert.equal(home.node.initializeCalls, 1);
    guide.destroy(); home.dispose();
}
assert.equal(frames.size, 0); assert.equal(timers.size, 0);
assert.equal(window.listenerCount, 0); assert.equal(document.listenerCount, 0);
assert.equal(globalThis.__picSwiperLoads, 1, "all instances reuse the lazy module cache");
Object.assign(globalThis, savedGlobals);
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
console.log("PASS PicCaro: source/settings/storage compatibility; production action/onMount + real Swiper Autoplay; hidden measurable startup -> ready without resize; two timed transitions; single-flight/paused/visibility/theme/resize/entitlement/disposal; static/off/effects/placements; operation guide open/close/suppress coexistence; lazy imports and scoped cleanup");
