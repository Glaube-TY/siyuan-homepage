import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compile, parse } from "svelte/compiler";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bannerPath = "src/homepage/homepageSetting/tabs/BannerSettingsTab.svelte";
const stylesPath = "src/homepage/homepageSetting/tabs/StylesSettingsTab.svelte";
// Execute each actual Svelte event handler with controlled props/actions; render the real components too.
async function pickerHandler(path) {
    const source = await readFile(resolve(root, path), "utf8");
    const ast = parse(source, { modern: true });
    const handler = ast.instance.content.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === "handleAssetSelect");
    assert(handler);
    return source.slice(handler.start, handler.end);
}
const bundled = await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { pickWorkspaceImage } from "./src/homepage/utils/workspaceImage";
        import { showMessage } from "siyuan";
        export { setPicker } from "siyuan";
        export { pickWorkspaceImage, toWorkspaceImageUrl, WORKSPACE_IMAGE_EXTENSIONS } from "./src/homepage/utils/workspaceImage";
        export { getImage, clearImageCache } from "./src/components/tools/getImage";
        export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port";
        export { resolveBannerImage, resolveBackgroundImage } from "./src/homepage/configLoader";
        export { render } from "svelte/server";
        export { default as Banner } from "./${bannerPath}";
        export { default as Styles } from "./${stylesPath}";
        export function bannerController(config) {
            let assetPickerBusy = false, alive = true;
            let tempBannerEnabled = true, bannerGlobalType = config.bannerGlobalType;
            const onBannerRemoteUrlChange = (url) => config.bannerRemoteUrl = url;
            const onTempBannerTypeChange = (type) => config.bannerType = type;
            ${await pickerHandler(bannerPath)}
            return { select: handleAssetSelect, dispose: () => alive = false, disable: () => tempBannerEnabled = false,
                get busy() { return assetPickerBusy; } };
        }
        export function backgroundController(config, premium = true) {
            let assetPickerBusy = false, alive = true, advancedEnabled = premium;
            const settingsState = config;
            const actions = { onBackgroundImageRemoteUrlChange: (url) => config.backgroundImageRemoteUrl = url,
                onBackgroundImageTypeChange: (type) => config.backgroundImageType = type };
            ${await pickerHandler(stylesPath)}
            return { select: handleAssetSelect, dispose: () => alive = false, revoke: () => advancedEnabled = false,
                get busy() { return assetPickerBusy; } };
        }
    ` },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "native-picker-fixture", setup(builder) {
        builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({ path: import.meta.resolve(path), external: true }));
        builder.onResolve({ filter: /^siyuan$/ }, () => ({ path: "sdk", namespace: "picker-fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "picker-fixture" }, () => ({ contents: `
            export let openAssetPicker;
            export const setPicker = (picker) => openAssetPicker = picker;
            export const showMessage = (...args) => globalThis.__assetPickerMessages.push(args);
        ` }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
            contents: compile(await readFile(path, "utf8"), { filename: path, generate: "server", css: "external" }).js.code,
            loader: "js", resolveDir: dirname(path),
        }));
    } }],
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
globalThis.__assetPickerMessages = [];
assert.equal(globalThis.__assetPickerMessages.length, 0, "loading a Host without the new API must not call it at startup");
await assert.rejects(runtime.pickWorkspaceImage(), /3\.8\.6/);

const saved = { bannerEnabled: true, bannerGlobalType: "custom", bannerType: "local", bannerLocalData: "data:image/png;base64,AAAA",
    bannerRemoteUrl: "https://example.com/old-banner.png", backgroundImageEnabled: true, backgroundImageType: "local",
    backgroundImageLocalData: "data:image/png;base64,BBBB", backgroundImageRemoteUrl: "https://example.com/old-background.png" };
const pickedPath = "assets/中文 空格 #?%&'().PNG";
const expectedUrl = "/assets/%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC%20%23%3F%25%26%27%28%29.PNG";
assert.equal(runtime.toWorkspaceImageUrl(pickedPath), expectedUrl);
assert.equal(runtime.toWorkspaceImageUrl("assets/simple.png"), "/assets/simple.png");
assert.equal(runtime.toWorkspaceImageUrl("/assets/a%20b.webp"), "/assets/a%20b.webp");
assert.equal(runtime.toWorkspaceImageUrl("assets/nested/image.svg"), "/assets/nested/image.svg");
for (const name of ["a%20b.png", "a%25b.png", "a%FF.png", "100%.png"]) {
    const url = runtime.toWorkspaceImageUrl(`assets/${name}`);
    assert.equal(decodeURIComponent(url), `/assets/${name}`, "raw picker filenames must retain literal percent sequences");
}
for (const input of ["", " ", null, "file:///assets/a.png", "https://external.invalid/assets/a.png", "//external/assets/a.png",
    "C:\\assets\\a.png", "assets\\a.png", "assets/../a.png", "assets/./a.png", "assets//a.png", "assets/",
    "/assets/%2e%2e/a.png", "/assets/%252e%252e/a.png", "/assets/a%2fb.png", "/assets/a%5cb.png", "/assets/a%00.png",
    "/assets/a%FF.png", "assets/a\n.png", "other/a.png", "assets/a.txt", "assets/a.png.exe", "assets/png"]) {
    assert.throws(() => runtime.toWorkspaceImageUrl(input), Error, String(input));
}

const previousLocation = globalThis.location;
try {
    for (const origin of ["http://127.0.0.1:6806", "https://docker.example", "https://remote.example:8443"]) {
        globalThis.location = { origin };
        assert.equal(runtime.toWorkspaceImageUrl(`${origin}/assets/a%20b.png`), "/assets/a%20b.png");
        assert.throws(() => runtime.toWorkspaceImageUrl(`${origin}/assets/../a.png`));
        assert.throws(() => runtime.toWorkspaceImageUrl(`${origin}/assets/a.png?token=private`));
    }
} finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
}

for (const makeController of [runtime.bannerController, runtime.backgroundController]) {
    for (const result of [null, new Error("permission denied"), { path: "assets/../a.png" }, {}, { path: "assets/a.txt" }]) {
        const config = structuredClone(saved), before = structuredClone(config);
        const controller = makeController(config);
        runtime.setPicker(async () => { if (result instanceof Error) throw result; return result; });
        const beforeMessages = globalThis.__assetPickerMessages.length;
        await controller.select();
        assert.deepEqual(config, before, "cancel, API failure and invalid paths must not schedule a settings change");
        assert.equal(controller.busy, false);
        assert.equal(globalThis.__assetPickerMessages.length - beforeMessages, result === null ? 0 : 1);
    }
    const config = structuredClone(saved), controller = makeController(config);
    let choose, calls = 0;
    runtime.setPicker((options) => {
        calls++;
        assert.deepEqual(options, { exts: [...runtime.WORKSPACE_IMAGE_EXTENSIONS] });
        return new Promise((resolveChoice) => choose = resolveChoice);
    });
    const selection = controller.select();
    assert.equal(controller.busy, true);
    await controller.select();
    assert.equal(calls, 1, "duplicate clicks must not open multiple pickers");
    choose({ path: pickedPath });
    await selection;
    assert.equal(controller.busy, false);
    const banner = makeController === runtime.bannerController;
    assert.equal(config[banner ? "bannerRemoteUrl" : "backgroundImageRemoteUrl"], expectedUrl);
    assert.equal(config[banner ? "bannerType" : "backgroundImageType"], "remote");
    const html = banner ? runtime.render(runtime.Banner, { props: { tempBannerEnabled: true, bannerGlobalType: "custom", tempBannerType: config.bannerType,
        bannerLocalData: config.bannerLocalData, bannerRemoteUrl: config.bannerRemoteUrl, advancedEnabled: false } }).body
        : runtime.render(runtime.Styles, { props: { state: config, actions: {}, advancedEnabled: true } }).body;
    assert(html.includes(`src="${expectedUrl}"`), "actual settings component must preview the chosen resource");
    assert(html.includes("从思源资源中选择图片"));

    const closedConfig = structuredClone(saved), closed = makeController(closedConfig);
    const pending = closed.select();
    closed.dispose();
    choose({ path: pickedPath });
    await pending;
    assert.deepEqual(closedConfig, saved, "closing settings before selection must discard the pending result");
}
const gatedConfig = structuredClone(saved), gated = runtime.backgroundController(gatedConfig, false);
runtime.setPicker(() => { throw new Error("Premium gate was bypassed"); });
await gated.select();
assert.deepEqual(gatedConfig, saved);
assert(!runtime.render(runtime.Styles, { props: { state: saved, actions: {}, advancedEnabled: false } }).body.includes("从思源资源中选择图片"));
const revokedConfig = structuredClone(saved), revoked = runtime.backgroundController(revokedConfig);
let completeChoice;
runtime.setPicker(() => new Promise((resolveChoice) => completeChoice = resolveChoice));
const pending = revoked.select();
revoked.revoke();
completeChoice({ path: pickedPath });
await pending;
assert.deepEqual(revokedConfig, saved);

const proxyCalls = [];
runtime.setSiyuanRuntimePort({ async post(path, payload) {
    proxyCalls.push({ path, payload });
    assert.equal(path, "/api/network/forwardProxy");
    return { code: 0, data: { body: "data:image/png;base64,PROXY" } };
} });
for (const electron of [false, true]) {
    globalThis.window = electron ? { require() {} } : {};
    runtime.clearImageCache();
    const before = proxyCalls.length;
    assert.equal(await runtime.getImage(expectedUrl), expectedUrl);
    assert.equal(await runtime.getImage("assets/legacy.png"), "assets/legacy.png");
    assert.equal((await runtime.resolveBannerImage({ ...saved, bannerType: "remote", bannerRemoteUrl: expectedUrl }, false)).bannerImgSrc, expectedUrl);
    assert.equal((await runtime.resolveBackgroundImage({ ...saved, backgroundImageType: "remote", backgroundImageRemoteUrl: expectedUrl }, true)).backgroundImageSrc, expectedUrl);
    assert.equal(proxyCalls.length, before, "workspace images must never enter an external HTTP proxy");
    assert.equal((await runtime.resolveBannerImage(saved, false)).bannerImgSrc, saved.bannerLocalData);
    assert.equal((await runtime.resolveBackgroundImage(saved, true)).backgroundImageSrc, saved.backgroundImageLocalData);
    for (const url of ["https://example.com/old.png", "http://example.com/old.png"]) assert(await runtime.getImage(url));
}
assert.equal((await runtime.resolveBannerImage({ ...saved, bannerType: "remote", bannerRemoteUrl: "" }, false)).emptyReason, "unconfigured");
assert.equal((await runtime.resolveBannerImage({ ...saved, bannerGlobalType: "bing" }, false)).fallbackReason, "premium_required");
const previousFetch = globalThis.fetch;
try {
    globalThis.fetch = async (url, options) => {
        assert(String(url).startsWith("/api/network/proxy?"));
        assert.equal(options.method, "GET");
        return new Response(JSON.stringify({ images: [{ urlbase: "/th?id=OHR.AssetPickerFixture" }] }), {
            headers: { "content-type": "application/json" },
        });
    };
    assert.equal((await runtime.resolveBannerImage({ ...saved, bannerGlobalType: "bing", bingApiType: "POD_1K" }, true)).bannerImgSrc,
        "https://cn.bing.com/th?id=OHR.AssetPickerFixture_1920x1080.jpg");
} finally { globalThis.fetch = previousFetch; }
assert.equal((await runtime.resolveBackgroundImage({ ...saved, backgroundImageType: "remote", backgroundImageRemoteUrl: expectedUrl }, false)).backgroundImageSrc, "");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const sdk = JSON.parse(await readFile(resolve(root, "node_modules/siyuan/package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"));
assert.equal(pkg.devDependencies.siyuan, "1.2.9");
assert.equal(sdk.version, "1.2.9");
assert.equal(pkg.version, "5.1.6");
assert.equal(manifest.version, "5.1.6");
assert.equal(manifest.minAppVersion, "3.8.6");
console.log("PASS native asset picker: actual helper/SDK mock, Svelte handlers and rendered previews, safe paths, cancel/error/disposal, Premium gate, local resource routing, legacy images/Bing, SDK and Host versions");
