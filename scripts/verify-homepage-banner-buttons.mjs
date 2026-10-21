import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compileString, compileAsync } from "sass-embedded";
import { compile, preprocess } from "svelte/compiler";

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
for (const part of ["Title", "Status", "Button"]) {
    assert.match(tab, new RegExp(`value=\\{tempBanner${part}Color\\}[\\s\\S]*?oninput=\\{[^\\n]*onTempBanner${part}ColorChange`));
    assert.match(editor, new RegExp(`onTempBanner${part}ColorChange=\\{\\(value\\) => tempBanner${part}Color = normalizeBannerIntegratedColor\\(value\\)\\}`));
    assert.match(editor, new RegExp(`function captureHomepageSettingsSignature\\(\\)[\\s\\S]*?tempBanner${part}Color,`));
    assert.match(editor, new RegExp(`banner${part}Color: normalizeBannerIntegratedColor\\(tempBanner${part}Color\\)`));
    assert.match(editor, new RegExp(`tempBanner${part}Color = normalizeBannerIntegratedColor\\(savedConfig.banner${part}Color\\)`));
    assert.match(loader, new RegExp(`banner${part}Color: normalizeBannerIntegratedColor\\(config.banner${part}Color\\)`));
    assert.match(homepage, new RegExp(`banner${part}Color = advanced \\? config.banner${part}Color : DEFAULT_BANNER_INTEGRATED_COLOR`));
    assert.match(homepage, new RegExp(`class="homepage-container"[\\s\\S]*?style:--homepage-banner-${part.toLowerCase()}-color=\\{banner${part}Color\\}`));
    assert(classic.includes(`--homepage-banner-${part.toLowerCase()}-color: ` + "${classic.banner" + part + "Color}"));
}
assert.match(editor, /signature !== lastPersistedDraftSignature[\s\S]*?scheduleAutoSave\(\)/);

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
assert.match(css, /\.hp-status__text:not\(\.hp-status__text--error\)\s*\{\s*color: var\(--homepage-banner-status-color/);
for (const [directory, name] of [["card", "Card"], ["paper", "Paper"], ["hand-drawn", "HandDrawn"], ["technology", "Technology"]]) {
    assert.match(await read(`src/homepage/theme/builtins/${directory}/${name}Theme.svelte`), /data-banner-content=\{topLayout.bannerContent\}/);
}
assert.match(await read("src/components/utils/shared/SiyuanIcon.svelte"), /fill: currentColor/);
const themes = [["classic", "Classic"], ["card", "Card"], ["paper", "Paper"], ["hand-drawn", "HandDrawn"], ["technology", "Technology"], ["simple-test", "SimpleTest"]];
const palettes = [
    { bannerTitleColor: "#ff2828", bannerStatusColor: "#20b86b", bannerButtonColor: "#3278e8" },
    { bannerTitleColor: "#ff2828", bannerStatusColor: "#ff2828", bannerButtonColor: "#ff2828" },
];
const variants = themes.flatMap(([name]) => (name === "classic" ? ["default", "flat", "glass"] : ["default"]).map(style => ({ name, style })));
const configFor = (colors, style) => ({ ...colors, quickButtonStyle: style, unknown: { preserved: [1, "fixture"] }, homepageAppearance: { themeSettings: {} } });
// Compile the production root's actual style directives, rather than hand-writing passing bindings.
const directives = homepage.match(/style:--homepage-banner-(?:title|status|button)-color=\{[^}]+\}/g);
assert.equal(directives.length, 3);
const fixture = `<script>
    import HomepageThemeHost from "./src/homepage/theme/components/HomepageThemeHost.svelte";
    import { normalizeBannerIntegratedColor } from "./src/homepage/homepageSetting/config";
    import { createClassicRuntimeAppearanceSettings, resolveClassicPresentationSettings } from "./src/homepage/theme/builtins/classic/presentationSettings";
    let initial = $props();
    let updated = $state(null);
    const current = $derived(updated ?? initial);
    const config = $derived(current.config), definition = $derived(current.definition);
    const integrated = $derived(current.integrated ?? true), showIcon = $derived(current.showIcon ?? true);
    const error = $derived(current.error ?? false), bannerTone = $derived(current.bannerTone ?? "#fff");
    export function configure(next) { updated = next; }
    const bannerTitleColor = $derived(normalizeBannerIntegratedColor(config.bannerTitleColor));
    const bannerStatusColor = $derived(normalizeBannerIntegratedColor(config.bannerStatusColor));
    const bannerButtonColor = $derived(normalizeBannerIntegratedColor(config.bannerButtonColor));
    const settings = $derived(definition.id === "builtin.classic"
        ? createClassicRuntimeAppearanceSettings(config.homepageAppearance.themeSettings[definition.id] ?? {}, {
            ...resolveClassicPresentationSettings({}), bannerTitleColor, bannerStatusColor, bannerButtonColor, quickButtonStyle: config.quickButtonStyle,
        }) : config.homepageAppearance.themeSettings[definition.id] ?? {});
    const themeProps = $derived({
        identity: { title: "隔离横幅标题", showIcon, icon: { type: "emoji", emoji: "🏠", style: "square" } },
        banner: { enabled: true, imageSrc: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="240"><rect width="900" height="240" fill="' + bannerTone + '"/></svg>'), height: 240, integrated, glassEnabled: false, setImageElement() {}, resetPosition() {} },
        status: { text: error ? "错误：状态语生成失败，请重试。" : "较长状态语用于验证自动换行。".repeat(12) + "\\n第二行状态语。", runtimeState: error ? "error" : "ready", refreshing: false, errorMessage: error ? "隔离错误" : undefined, refresh() {} },
        actions: { items: [{ id: "one", action: "one", label: "功能按钮", iconName: "settings", placement: "primary" }], invoke() {} },
        sections: { enabled: false, items: [], navAlign: "center", select() {} }, regions: { attach() {}, detach() {} },
        appearance: { settings }, topLayout: { contentLayout: "split", bannerPosition: "after", primaryPosition: "content-first", bannerContent: integrated ? "all" : "none", align: "center" },
    });
</script>
<div class="homepage-container" data-hp-theme={definition.id} ${directives.join(" ")}>
    <HomepageThemeHost {definition} {themeProps} onRendererError={(error) => { throw error; }} />
</div>`;

async function compileFixture(generate) {
    const imports = themes.map(([directory, name]) => `import ${name} from "./src/homepage/theme/builtins/${directory}/${name}Theme.svelte";`).join("\n");
    const definitions = `export const definitions = {${themes.map(([directory, name]) => `"${directory}": {id:"builtin.${directory}",renderer:${name}}`).join(",")}};`;
    const browserEntry = `import { mount, unmount, settled } from "svelte";
        let app, options;
        window.bannerFixture = {
            async mount(next) { if (app) await unmount(app); options = next; app = mount(Fixture, {target:document.getElementById("fixture"),props:{...next,definition:definitions[next.theme]}}); await settled(); },
            async update(next) { options = next; app.configure({...next,definition:definitions[next.theme]}); await settled(); },
            snapshot() { return JSON.stringify(options.config); }
        };`;
    const result = await build({
        stdin: { contents: `import Fixture from "banner-color-fixture"; ${imports}\n${definitions}\n${generate === "server" ? 'export { render } from "svelte/server"; export { Fixture };' : browserEntry}`, resolveDir: root, loader: "js" },
        bundle: true, platform: generate === "server" ? "node" : "browser", format: "esm", conditions: generate === "server" ? [] : ["browser"],
        write: false, logLevel: "silent", alias: { "@": resolve(root, "src") }, plugins: [{ name: "banner-colors", setup(builder) {
            if (generate === "server") builder.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({ path: import.meta.resolve(path), external: true }));
            builder.onResolve({ filter: /^banner-color-fixture$/ }, () => ({ path: "banner-color-fixture.svelte", namespace: "fixture" }));
            const load = async (path, source) => {
                const processed = await preprocess(source, { style: ({ content, attributes }) => attributes.lang === "scss" ? { code: compileString(content, { loadPaths: [dirname(path)] }).css } : undefined }, { filename: path });
                const contents = compile(processed.code, { filename: path, generate, css: generate === "server" ? "external" : "injected" }).js.code;
                return { contents, loader: "js", resolveDir: dirname(path) };
            };
            builder.onLoad({ filter: /./, namespace: "fixture" }, () => load(resolve(root, "banner-color-fixture.svelte"), fixture));
            builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => load(path, await readFile(path, "utf8")));
            // Widget skins do not style the header; compile only the six actual header styles below.
            builder.onLoad({ filter: /\.scss$/ }, () => ({ contents: "", loader: "js" }));
        }}],
    });
    return result.outputFiles[0].text;
}

const server = await import(`data:text/javascript;base64,${Buffer.from(await compileFixture("server")).toString("base64")}`);
let renders = 0;
for (const { name, style } of variants) for (const colors of palettes) for (const showIcon of [false, true]) for (const integrated of [false, true]) for (const error of [false, true]) {
    const config = configFor(colors, style), before = JSON.stringify(config);
    const html = server.render(server.Fixture, { props: { config, definition: server.definitions[name], showIcon, integrated, error } }).body;
    for (const part of ["Title", "Status", "Button"]) assert(html.includes(`--homepage-banner-${part.toLowerCase()}-color: ${colors[`banner${part}Color`]}`));
    assert(html.includes(`data-banner-content="${integrated && name !== "simple-test" ? "all" : "none"}"`));
    assert.equal(html.includes('class="hp-identity__icon"'), showIcon);
    assert.equal(html.includes("hp-status__text--error"), error);
    assert.equal(JSON.stringify(config), before);
    renders++;
}
console.log(`PASS banner colors: ${renders} real Svelte SSR renders; three independent root bindings, all themes, Classic variants, error and configuration contracts`);

// Optional installed Playwright (including NODE_PATH) enables the computed-style matrix without adding a dependency.
let chromium;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); }
catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
if (!chromium) {
    console.log("SKIP computed styles: expose an installed playwright package through NODE_PATH to run the isolated DOM matrix");
} else {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1.5 });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const themeCss = (await Promise.all(themes.map(([directory]) => compileAsync(resolve(root, `src/homepage/theme/builtins/${directory}/${directory}.scss`))))).map(result => result.css).join("\n");
        // Disable only fixture transitions so color assertions do not sample intermediate animation frames.
        await page.setContent(`<style>${themeCss}\n${css}\n#fixture{width:900px}#fixture *{transition:none!important;animation:none!important}</style><div id="fixture"></div>`);
        await page.addScriptTag({ content: await compileFixture("client"), type: "module" });
        await page.waitForFunction(() => Boolean(window.bannerFixture));
        const capture = () => page.evaluate(() => {
            const get = selector => { const el = document.querySelector(selector); return el ? getComputedStyle(el).color : null; };
            const status = document.querySelector(".hp-status__text"), action = document.querySelector(".hp-actions__primary .hp-action"), root = document.querySelector(".homepage-container");
            return { title: get(".hp-identity__title"), icon: get(".hp-identity__icon"), status: get(".hp-status__text"), action: get(".hp-actions__primary .hp-action"), refresh: get(".hp-status__refresh"),
                svg: get(".hp-actions__primary .hp-action svg"), border: getComputedStyle(action).borderTopColor, fill: getComputedStyle(action.querySelector("svg")).fill,
                bannerContent: document.querySelector(".hp-top-layout").dataset.bannerContent, error: status.classList.contains("hp-status__text--error"), text: status.textContent,
                renderers: [...document.querySelectorAll(".hp-theme")].map(el => el.className),
                wrapped: status.getBoundingClientRect().height > parseFloat(getComputedStyle(status).lineHeight) * 1.5,
                variables: ["title", "status", "button"].map(part => getComputedStyle(root).getPropertyValue(`--homepage-banner-${part}-color`).trim()) };
        });
        const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
        const baseline = new Map();
        let checks = 0;
        for (const dark of [false, true]) for (const bannerTone of ["#ffffff", "#101010"]) for (const { name: theme, style } of variants) for (const showIcon of [false, true]) for (const integrated of [false, true]) for (const [index, colors] of palettes.entries()) {
            const options = { theme, config: configFor(colors, style), showIcon, integrated, bannerTone }, saved = JSON.stringify(options.config);
            await page.evaluate(async ({ options, dark, first }) => {
                const vars = { "background": dark ? "#191919" : "#fff", "surface": dark ? "#262626" : "#fafafa", "on-background": dark ? "#eee" : "#222", "on-surface": dark ? "#ddd" : "#444", "primary": "#3578e5", "on-primary": "#fff", "error": "#c94a42" };
                for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(`--b3-theme-${name}`, value);
                await window.bannerFixture[first ? "mount" : "update"](options);
            }, { options, dark, first: checks === 0 });
            for (const state of ["default", "hover-action", "hover-refresh", "focus", "disabled"]) {
                await page.mouse.move(1090, 790);
                await page.evaluate(() => { document.activeElement?.blur(); document.querySelector(".hp-status__refresh").disabled = false; });
                if (state.startsWith("hover")) await page.locator(state === "hover-action" ? ".hp-actions__primary .hp-action" : ".hp-status__refresh").hover({ force: true });
                if (state === "focus") { await page.keyboard.press("Tab"); await page.locator(".hp-actions__primary .hp-action").focus(); }
                if (state === "disabled") await page.locator(".hp-status__refresh").evaluate(el => el.disabled = true);
                const actual = await capture();
                assert.deepEqual(actual.variables, Object.values(colors));
                assert.equal(actual.icon !== null, showIcon);
                assert(actual.wrapped, "long status remains multiline");
                if (integrated && theme !== "simple-test") {
                    assert.equal(actual.bannerContent, "all", JSON.stringify({ theme, style, integrated, showIcon, state, actual, errors }));
                    assert.equal(actual.title, rgb(colors.bannerTitleColor), `${theme}/${state}/title`);
                    if (showIcon) assert.equal(actual.icon, rgb(colors.bannerTitleColor));
                    assert.equal(actual.status, rgb(colors.bannerStatusColor), `${theme}/${state}/status`);
                    for (const key of ["action", "refresh", "svg", "border", "fill"]) assert.equal(actual[key], rgb(colors.bannerButtonColor), `${theme}/${style}/${state}/${key}`);
                } else {
                    assert.equal(actual.bannerContent, "none");
                    const key = JSON.stringify([dark, bannerTone, theme, style, showIcon, integrated, state]);
                    const appearance = [actual.title, actual.icon, actual.status, actual.action, actual.refresh, actual.border, actual.svg, actual.fill];
                    if (!index) baseline.set(key, appearance); else assert.deepEqual(appearance, baseline.get(key), "non-integrated and Simple-test keep native theme colors");
                }
                assert.equal(await page.evaluate(() => window.bannerFixture.snapshot()), saved, "render and theme switches cannot mutate settings");
                checks++;
            }
        }
        for (const { name: theme, style } of variants) {
            const options = { theme, config: configFor(palettes[0], style), integrated: true, showIcon: true, bannerTone: "#ffffff" };
            await page.evaluate(options => window.bannerFixture.update(options), options);
            const before = await capture();
            const reopened = JSON.parse(JSON.stringify(options));
            await page.evaluate(options => window.bannerFixture.mount(options), reopened);
            assert.deepEqual(await capture(), before, "isolated JSON save/reopen preserves colors and configuration");
            const changed = { ...options, config: { ...options.config, bannerTitleColor: "#112233" } };
            await page.evaluate(options => window.bannerFixture.update(options), changed);
            const titleOnly = await capture();
            assert.equal(titleOnly.title, theme === "simple-test" ? before.title : rgb("#112233"), "title updates without remounting");
            assert.deepEqual([titleOnly.status, titleOnly.action, titleOnly.refresh], [before.status, before.action, before.refresh], "changing only title color cannot affect status or buttons");
            assert.equal(await page.evaluate(() => window.bannerFixture.snapshot()), JSON.stringify(changed.config));
            await page.evaluate(options => window.bannerFixture.update({ ...options, error: true }), reopened);
            const error = await capture();
            assert(error.error && error.text.includes("错误："));
            assert.notEqual(error.status, before.status, "custom status color cannot hide the native error color");
            assert.deepEqual([error.title, error.action, error.refresh], [before.title, before.action, before.refresh]);
            checks += 3;
        }
        assert.deepEqual(errors, []);
        console.log(`PASS computed styles: ${checks} Edge/Chromium DOM cases at 150% DPI; five integrating themes + Simple-test, independent/all-red colors, light/dark themes and banners, icon/wrapping/hover/focus/disabled, live theme switches, isolated save/reopen, error colors; zero page errors`);
    } finally { await browser.close(); }
}
