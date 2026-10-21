import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compileString } from "sass-embedded";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(resolve(root, path), "utf8");
const [tab, editor, homepage, loader, classic, styles] = await Promise.all([
    read("src/homepage/homepageSetting/tabs/TitleSettingsTab.svelte"),
    read("src/homepage/homepageSetting/homepageSetting.svelte"),
    read("src/homepage/homepage.svelte"),
    read("src/homepage/configLoader.ts"),
    read("src/homepage/theme/builtins/classic/ClassicTheme.svelte"),
    read("src/homepage/theme/style/theme-host.scss"),
]);

// Follow the existing editor -> autosave -> normalized read -> root style contract.
assert.match(tab, /value=\{tempBannerButtonColor\}[\s\S]*?oninput=\{[^\n]*onTempBannerButtonColorChange/);
assert.match(editor, /onTempBannerButtonColorChange=\{\(value\) => tempBannerButtonColor = normalizeBannerIntegratedColor\(value\)\}/);
assert.match(editor, /function captureHomepageSettingsSignature\(\)[\s\S]*?tempBannerButtonColor,/);
assert.match(editor, /signature !== lastPersistedDraftSignature[\s\S]*?scheduleAutoSave\(\)/);
assert.match(editor, /bannerButtonColor: normalizeBannerIntegratedColor\(tempBannerButtonColor\)/);
assert.match(loader, /bannerButtonColor: normalizeBannerIntegratedColor\(config.bannerButtonColor\)/);
assert.match(homepage, /bannerButtonColor = advanced \? config.bannerButtonColor : DEFAULT_BANNER_INTEGRATED_COLOR/);
assert.match(homepage, /class="homepage-container"[\s\S]*?style:--homepage-banner-button-color=\{bannerButtonColor\}/);
assert.match(classic, /--homepage-banner-button-color: \$\{classic.bannerButtonColor\}/);

const bundle = await build({
    stdin: { contents: `
        export { normalizeBannerIntegratedColor } from "./src/homepage/homepageSetting/config";
        export { createClassicRuntimeAppearanceSettings, resolveClassicPresentationSettings } from "./src/homepage/theme/builtins/classic/presentationSettings";
    `, resolveDir: root, loader: "ts" },
    bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
for (const color of ["#123456", "#ffffff", "#000000", "#aBcDeF"]) {
    assert.equal(runtime.normalizeBannerIntegratedColor(color), color, "never adjust a user's valid color");
    for (const quickButtonStyle of ["default", "flat", "glass"]) {
        const persisted = { bannerButtonColor: "#ff0000", unknown: "preserved" };
        const before = structuredClone(persisted);
        const legacy = { ...runtime.resolveClassicPresentationSettings({}), bannerButtonColor: color, quickButtonStyle };
        const settings = runtime.createClassicRuntimeAppearanceSettings(persisted, legacy);
        assert.equal(runtime.resolveClassicPresentationSettings(settings).bannerButtonColor, color);
        assert.equal(settings.unknown, "preserved");
        assert.deepEqual(persisted, before);
    }
}
for (const invalid of [null, undefined, "", "red", "#fff", "#123456; color:red"]) {
    assert.equal(runtime.normalizeBannerIntegratedColor(invalid), "#ffffff");
}

const css = compileString(styles).css;
const colorRule = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].find(([, , declarations]) =>
    declarations.includes("color: var(--homepage-banner-button-color, #fff)") && declarations.includes("border-color: currentColor"));
assert.ok(colorRule, "banner button foreground and border share the selected color");
for (const selector of colorRule[1].split(",\n")) {
    assert.match(selector, /\.homepage-container\[data-hp-theme\] \.hp-top-layout\[data-banner-content=all\]/);
}
assert.doesNotMatch(colorRule[2], /!important/);
assert.match(colorRule[1], /:hover, :focus-visible, :disabled/);
assert.match(colorRule[2], /text-shadow:/, "light foreground keeps a dark halo over bright banners");
assert.match(css, /\[data-banner-content=all\][^{]+:focus-visible\s*\{\s*outline: 2px solid var\(--homepage-banner-button-color/);
assert.match(css, /\[data-banner-content=all\][^{]+svg\s*\{\s*filter: drop-shadow/);
for (const [directory, name] of [["card", "Card"], ["paper", "Paper"], ["hand-drawn", "HandDrawn"], ["technology", "Technology"]]) {
    assert.match(await read(`src/homepage/theme/builtins/${directory}/${name}Theme.svelte`), /data-banner-content=\{topLayout.bannerContent\}/);
}
assert.match(await read("src/components/utils/shared/SiyuanIcon.svelte"), /fill: currentColor/);
console.log("PASS banner buttons: editor/autosave/read/root propagation, Classic variants, all integrating themes, exact color preservation, scoped border/icon/focus/disabled and contrast contracts");
