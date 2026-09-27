import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadFixture() {
    const result = await build({
        stdin: {
            sourcefile: "verify-banner-empty-state-fixture.ts",
            resolveDir: root,
            contents: [
                'export { resolveBannerImage } from "./src/homepage/configLoader.ts";',
                'export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port.ts";',
            ].join("\n"),
        },
        bundle: true,
        format: "esm",
        platform: "browser",
        mainFields: ["browser", "module", "main"],
        target: "node24",
        tsconfig: resolve(root, "tsconfig.json"),
        write: false,
        logLevel: "silent",
    });
    return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
}

function customConfig(overrides = {}) {
    return {
        bannerEnabled: true,
        bannerGlobalType: "custom",
        bannerType: "local",
        bannerLocalData: "",
        bannerRemoteUrl: "",
        bingApiType: "POD_UHD",
        ...overrides,
    };
}

const fixture = await loadFixture();

const emptyLocal = await fixture.resolveBannerImage(customConfig({ bannerLocalData: "  \t" }), true);
assert.equal(emptyLocal.bannerImgSrc, "");
assert.equal(emptyLocal.emptyReason, "unconfigured");

const configuredLocal = await fixture.resolveBannerImage(customConfig({ bannerLocalData: "data:image/png;base64,AAAA" }), true);
assert.equal(configuredLocal.bannerImgSrc, "data:image/png;base64,AAAA");
assert.equal(configuredLocal.emptyReason, undefined);

const emptyRemote = await fixture.resolveBannerImage(customConfig({ bannerType: "remote", bannerRemoteUrl: "  " }), true);
assert.equal(emptyRemote.bannerImgSrc, "");
assert.equal(emptyRemote.emptyReason, "unconfigured");

const previousWarn = console.warn;
console.warn = () => {};
fixture.setSiyuanRuntimePort({
    async post() {
        throw new Error("network unavailable");
    },
});
try {
    const remoteUrl = "https://example.invalid/banner-empty-state-check.jpg";
    const configuredRemote = await fixture.resolveBannerImage(
        customConfig({ bannerType: "remote", bannerRemoteUrl: remoteUrl }),
        true,
    );
    assert.equal(configuredRemote.bannerImgSrc, remoteUrl);
    assert.equal(configuredRemote.emptyReason, undefined);
} finally {
    console.warn = previousWarn;
}

for (const bannerType of [undefined, "legacy-unknown"]) {
    const legacyConfig = customConfig();
    if (bannerType === undefined) {
        delete legacyConfig.bannerType;
    } else {
        legacyConfig.bannerType = bannerType;
    }
    const legacyEmpty = await fixture.resolveBannerImage(legacyConfig, true);
    assert.equal(legacyEmpty.bannerImgSrc, "");
    assert.equal(legacyEmpty.emptyReason, "unconfigured");
}

const previousFetch = globalThis.fetch;
console.warn = () => {};
globalThis.fetch = async () => new Response("blocked", { status: 503 });
try {
    const failedBing = await fixture.resolveBannerImage(
        customConfig({ bannerGlobalType: "bing", bingApiType: "POD_UHD" }),
        true,
    );
    assert.equal(failedBing.bannerImgSrc, "");
    assert.equal(failedBing.emptyReason, undefined);
} finally {
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
}

const premiumFallback = await fixture.resolveBannerImage(
    customConfig({ bannerGlobalType: "bing" }),
    false,
);
assert.equal(premiumFallback.fallbackReason, "premium_required");
assert.equal(premiumFallback.emptyReason, undefined);

const disabledBanner = await fixture.resolveBannerImage(customConfig({ bannerEnabled: false }), true);
assert.equal(disabledBanner.bannerImgSrc, "");
assert.equal(disabledBanner.emptyReason, undefined);

const bannerSource = await readFile(resolve(root, "src/homepage/theme/components/shared/HomepageBanner.svelte"), "utf8");
assert.match(bannerSource, /\{#if banner\.fallbackReason === "premium_required"\}[\s\S]*?\{:else if banner\.imageSrc\}[\s\S]*?\{:else if banner\.emptyReason === "unconfigured"\}/);
assert.match(bannerSource, /<div class="hp-banner__empty-state" role="status" aria-label="横幅未配置图片">\s*<strong>横幅未配置图片<\/strong>\s*<span>请前往主页设置中的横幅设置添加图片<\/span>/);
assert.match(bannerSource, /\{#if banner\.imageSrc && banner\.integrated && banner\.glassEnabled && !banner\.fallbackReason\}\s*<div\s+class="hp-banner__glass"/);
assert.match(bannerSource, /\{#if banner\.imageSrc && !banner\.fallbackReason\}\s*<button[\s\S]*?hp-banner__reset/);
assert.match(bannerSource, /\.hp-banner__empty-state\s*\{[\s\S]*?var\(--hp-text,[\s\S]*?\}\s*\.hp-banner__empty-state span\s*\{[\s\S]*?var\(--hp-text-muted,/);

const homepageSource = await readFile(resolve(root, "src/homepage/homepage.svelte"), "utf8");
assert.match(homepageSource, /bannerEmptyReason\s*=\s*\$state<"unconfigured"\s*\|\s*undefined>\(undefined\)/);
assert.match(homepageSource, /bannerEmptyReason\s*=\s*bannerResult\.emptyReason/);
assert.match(homepageSource, /enabled:\s*supportsHomepageThemeBanner\(themeResolution\.definition\)\s*&&\s*bannerEnabled,/);
assert.match(homepageSource, /emptyReason:\s*bannerEmptyReason,/);

for (const theme of ["classic/ClassicTheme.svelte", "card/CardTheme.svelte", "paper/PaperTheme.svelte", "hand-drawn/HandDrawnTheme.svelte", "technology/TechnologyTheme.svelte"]) {
    const themeSource = await readFile(resolve(root, "src/homepage/theme/builtins", theme), "utf8");
    assert.match(themeSource, /import HomepageBanner from/);
    assert.match(themeSource, /<HomepageBanner\b/);
    assert.match(themeSource, /\{#if banner\.enabled\}/);
}

const paperSource = await readFile(resolve(root, "src/homepage/theme/builtins/paper/PaperTheme.svelte"), "utf8");
assert.match(paperSource, /\{#if banner\.enabled\}[\s\S]*?hp-paper-banner-stage[\s\S]*?hp-paper-banner-clip--back[\s\S]*?hp-paper-banner-frame[\s\S]*?<HomepageBanner[\s\S]*?hp-paper-banner-clip--front[\s\S]*?\{\/if\}/);

console.log("Banner empty-state verification passed.");
