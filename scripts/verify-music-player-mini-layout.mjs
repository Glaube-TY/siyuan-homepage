import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compile, parse, preprocess } from "svelte/compiler";
import { compileString } from "sass-embedded";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "src/components/utils/widgetBlock/widget/musicPlayer/MusicPlayerMini.svelte");
const source = await readFile(path, "utf8");
const ast = parse((await preprocess(source, { style: () => ({ code: "" }) })).code, { modern: true });
const mode = ast.instance.content.body.find((node) => node.id?.name === "computeLayoutMode");
const mount = ast.instance.content.body.find((node) => node.expression?.callee?.name === "onMount").expression;
const edits = [];
function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "AssignmentExpression" && ["containerWidth", "containerHeight"].includes(node.left.name)) {
        edits.push({ start: node.right.start, end: node.right.end, value: `write(${source.slice(node.right.start, node.right.end)})` });
    }
    Object.values(node).forEach((child) => Array.isArray(child) ? child.forEach(walk) : walk(child));
}
walk(mount);
assert.equal(edits.length, 2, "instrument the production state assignments without replacing layout decisions");
let mountSource = source.slice(mount.start, mount.end);
for (const edit of edits.sort((a,b) => b.start - a.start)) mountSource = mountSource.slice(0, edit.start - mount.start) + edit.value + mountSource.slice(edit.end - mount.start);
const bundle = await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
        export { render } from "svelte/server";
        export { default as Mini } from "./src/components/utils/widgetBlock/widget/musicPlayer/MusicPlayerMini.svelte";
        export { getTrackKey } from "./src/components/utils/widgetBlock/widget/musicPlayer/musicTrackIdentity";
        ${source.slice(mode.start, mode.end)}
        export function layout(env) {
            const {ResizeObserver,requestAnimationFrame,cancelAnimationFrame,getComputedStyle}=env;
            let rootEl=env.element,containerWidth=0,containerHeight=0,writes=0,cleanup;
            const write=value=>{writes++;return value;},onMount=callback=>cleanup=callback();
            ${mountSource};
            return {destroy:()=>cleanup?.(),rebind:element=>rootEl=element,
                get snapshot(){return {width:containerWidth,height:containerHeight,mode:computeLayoutMode(containerWidth,containerHeight),writes};}};
        }
    ` }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "music-mini-fixture", setup(builder) {
        builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({ path: import.meta.resolve(path), external: true }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
            const processed = await preprocess(await readFile(path, "utf8"), { style: ({ content, attributes }) => attributes.lang === "scss"
                ? { code: compileString(content, { loadPaths: [dirname(path)] }).css } : undefined }, { filename: path });
            return { contents: compile(processed.code, { filename: path, generate: "server", css: "external" }).js.code, loader: "js", resolveDir: dirname(path) };
        });
    }}],
});
const rt = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function fixture(width, height, { rem = 16, supportsBox = true, hasObserver = true } = {}) {
    const frames = new Map(), observations = [], doc = {}, rect = { width, height };
    let sequence = 0, callback, disconnected = 0;
    const element = { ownerDocument: { documentElement: doc }, getBoundingClientRect: () => rect };
    const env = { element, getComputedStyle: (target) => { assert.equal(target, doc); return { fontSize: `${rem}px` }; },
        requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: (id) => frames.delete(id),
        ResizeObserver: hasObserver ? class {
            constructor(fn) { callback = fn; }
            observe(target, options) { assert.equal(target, element); observations.push(options); if (options && !supportsBox) throw Error("unsupported box"); }
            disconnect() { disconnected++; }
        } : undefined,
    };
    const runtime = rt.layout(env);
    return { runtime, rect, frames, observations,
        fire(options = {}) {
            const { content = { width: 1, height: 1 }, target = element } = options;
            const box = "box" in options ? options.box : [{ inlineSize: rect.width, blockSize: rect.height }];
            callback([{ target, borderBoxSize: box, contentRect: content }]);
        },
        flush() { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); assert.equal(frames.size, 0, "measurement cannot schedule itself forever"); },
        get disconnected() { return disconnected; },
    };
}

for (const [width, height, expected] of [[500,450,"full"],[360,300,"compact"],[280,300,"micro"]]) {
    const f = fixture(width,height); f.fire(); f.flush(); assert.equal(f.runtime.snapshot.mode, expected);
    assert.deepEqual(f.observations, [{box:"border-box"}]); f.runtime.destroy(); assert.equal(f.disconnected,1);
}
for (const [width,height] of [[320,400],[500,250]]) {
    const f = fixture(width,height), modes = [];
    for (let i=0;i<20;i++) {
        const padding = f.runtime.snapshot.mode === "micro" ? 0.35*16 : 0.75*16;
        f.fire({content:{width:width-2*padding,height:height-2*padding}}); f.flush(); modes.push(f.runtime.snapshot.mode);
    }
    assert.deepEqual([...new Set(modes)],["micro"],"fixed outer geometry stays stable despite mode-dependent contentRect");
    assert.equal(f.runtime.snapshot.writes,2); f.runtime.destroy();
}
{
    const f = fixture(360,400), before = f.runtime.snapshot;
    for(let i=0;i<20;i++)f.fire();
    assert.equal(f.frames.size,1); f.flush(); assert.deepEqual(f.runtime.snapshot,before);
    for(const [width,expected]of [[500,"full"],[320,"micro"],[360,"compact"]]) {
        f.rect.width=width;f.fire();f.flush();assert.equal(f.runtime.snapshot.mode,expected);
    }
    f.rect.width=500;
    for(const [height,expected]of [[250,"micro"],[300,"compact"],[450,"full"]]) {
        f.rect.height=height;f.fire();f.flush();assert.equal(f.runtime.snapshot.mode,expected);
    }
    // A temporary dialog-induced container resize may adapt once and then settle.
    f.rect.width=320;f.fire();f.flush();assert.equal(f.runtime.snapshot.mode,"micro");
    f.rect.width=500;f.fire();f.flush();assert.equal(f.runtime.snapshot.mode,"full");
    const stable=f.runtime.snapshot;f.fire();f.flush();assert.deepEqual(f.runtime.snapshot,stable);f.runtime.destroy();
}
{
    const f=fixture(0,0);assert.equal(f.runtime.snapshot.mode,"micro");
    Object.assign(f.rect,{width:500,height:450});f.fire();f.flush();assert.equal(f.runtime.snapshot.mode,"full");
    f.fire({box:{inlineSize:360,blockSize:400}});f.flush();assert.equal(f.runtime.snapshot.mode,"compact","legacy object borderBoxSize works");
    f.fire({target:{}});assert.equal(f.frames.size,0);
    f.fire();const late=[...f.frames.values()][0],before=f.runtime.snapshot;
    f.runtime.rebind({getBoundingClientRect(){throw Error("cleanup cannot use a rebound root");}});
    f.runtime.destroy();assert.equal(f.frames.size,0);assert.equal(f.disconnected,1);
    late();f.fire();assert.deepEqual(f.runtime.snapshot,before);assert.equal(f.frames.size,0);
}
for(const supportsBox of [false,true]) {
    const f=fixture(320,400,{supportsBox});
    for(const box of [undefined,[],null,{inlineSize:NaN,blockSize:400},{inlineSize:-1,blockSize:400}]) {
        f.fire({box,content:{width:900,height:900}});f.flush();assert.equal(f.runtime.snapshot.width,296);assert.equal(f.runtime.snapshot.mode,"micro");
    }
    const before=f.runtime.snapshot;
    for(const value of [-1,NaN,Infinity]) {f.rect.width=value;f.fire({box:null});f.flush();assert.deepEqual(f.runtime.snapshot,before);}
    f.fire({box:[{inlineSize:Number.MAX_VALUE,blockSize:400}]});f.flush();assert.deepEqual(f.runtime.snapshot,before);
    if(!supportsBox)assert.deepEqual(f.observations,[{box:"border-box"},undefined]);f.runtime.destroy();
}
{
    const noObserver=fixture(500,450,{hasObserver:false});assert.equal(noObserver.runtime.snapshot.mode,"full");noObserver.runtime.destroy();
    const a=fixture(500,450),b=fixture(320,400);assert.equal(a.runtime.snapshot.mode,"full");assert.equal(b.runtime.snapshot.mode,"micro");
    b.rect.width=500;b.fire();b.flush();assert.equal(b.runtime.snapshot.mode,"full");assert.equal(a.runtime.snapshot.writes,2);
    a.runtime.destroy();b.runtime.destroy();
}
{
    const a=fixture(408,350,{rem:16}),b=fixture(408,350,{rem:20});
    assert.equal(a.runtime.snapshot.mode,"full");assert.equal(b.runtime.snapshot.mode,"compact","baseline padding follows root rem");
    a.runtime.destroy();b.runtime.destroy();
    const f=fixture(324,400);const before=f.runtime.snapshot;
    for(const width of [323.99999999,324.00000001]){f.rect.width=width;f.fire();f.flush();assert.deepEqual(f.runtime.snapshot,before);}
    f.runtime.destroy();
}

const track={sourceKind:"subsonic",sourceProfileId:"fixture",sourceTrackId:"one",fileName:"song.mp3",baseName:"song",ext:".mp3",size:1,mtimeMs:1,
    title:"测试歌曲",artist:"测试歌手",album:"测试专辑",coverObjectUrl:"/assets/cover.png",lyrics:[{time:0,primary:"第一句"},{time:30,primary:"第二句"}]};
const vm={musicFiles:[track],currentTrackIndex:0,isPlaying:true,currentTime:20,duration:100,volume:0.6,isMuted:false,playMode:"order",showCover:true,favoriteTrackKeys:[rt.getTrackKey(track)]};
const before=structuredClone(vm),props={vm,actions:new Proxy({}, {get:()=>()=>{throw Error("render must not change playback");}}),onOpenDetail:()=>{throw Error("unexpected dialog");}};
const html=rt.render(rt.Mini,{props}).body;
for(const text of [track.title,track.artist,track.album,track.coverObjectUrl,"第一句","暂停","上一曲","下一曲","播放列表",'aria-label="音量"','width: 20%'])assert(html.includes(text),text);
assert.deepEqual(vm,before,"render/layout does not mutate music state");
const progressed=rt.render(rt.Mini,{props:{...props,vm:{...vm,currentTime:40}}}).body;
assert(progressed.includes("第二句"));assert(progressed.includes("width: 40%"));
console.log("PASS music mini layout: production computeLayoutMode/onMount/ResizeObserver; fixed border-box width/height feedback, rem padding, repeated events/RAF dedup, resizing/dialog recovery, zero/invalid/legacy/fallback geometry, destroy/rebind/multiple instances, real Svelte content/progress/lyrics render");
