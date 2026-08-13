import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOMEPAGE_THEME_API_VERSION } from "../src/homepage/theme/api/themeApiVersion";
import type { HomepageThemeDefinition } from "../src/homepage/theme/api/types";
import { HomepageThemeRegistry, registerHomepageTheme } from "../src/homepage/theme/registry/themeRegistry";
import { createHomepageEntitlementSnapshot } from "../src/homepage/theme/runtime/entitlementResolver";
import { resolveHomepageTheme } from "../src/homepage/theme/runtime/themeResolver";
import { normalizeHomepageAppearanceConfig } from "../src/homepage/theme/runtime/appearanceConfig";
import { resolveHomepageFooterPresentation } from "../src/homepage/theme/runtime/footerPresentation";
import { classifyWidgetAppearance } from "../src/homepage/theme/widgetAppearance/widgetAppearanceCompat";
import { HomepagePersistentRegionManager } from "../src/homepage/theme/runtime/persistentRegionManager";
import { resolveHomepageSectionNavigationActiveId } from "../src/homepage/theme/runtime/homepageSectionRuntime";
import { supportsHomepageThemeBanner } from "../src/homepage/theme/runtime/themeFeatures";
import { normalizeHomepageTopLayout } from "../src/homepage/theme/runtime/topLayout";
import {
    createDefaultButtons,
    normalizeButtonsList,
} from "../src/homepage/buttonRegistry";
import {
    createClassicRuntimeAppearanceSettings,
    resolveClassicPresentationSettings,
} from "../src/homepage/theme/builtins/classic/presentationSettings";

const renderer = (() => undefined) as unknown as HomepageThemeDefinition["renderer"];
const classic: HomepageThemeDefinition = {
    apiVersion: HOMEPAGE_THEME_API_VERSION,
    id: "builtin.classic",
    name: "Classic",
    version: "1",
    author: "test",
    access: "free",
    surfaces: ["desktop-homepage"],
    renderer,
};
const simple: HomepageThemeDefinition = {
    ...classic,
    id: "builtin.simple-test",
    name: "Simple",
    access: "vip",
};
const paper: HomepageThemeDefinition = {
    ...classic,
    id: "builtin.paper",
    name: "Paper",
    access: "vip",
    features: { banner: true, widgetAppearance: "theme-controlled" },
};
const handDrawn: HomepageThemeDefinition = {
    ...classic,
    id: "builtin.hand-drawn",
    name: "Hand Drawn",
    access: "vip",
    features: { banner: true, widgetAppearance: "theme-controlled" },
};
const card: HomepageThemeDefinition = {
    ...classic,
    id: "builtin.card",
    name: "Card",
    access: "vip",
    features: { banner: true, widgetAppearance: "theme-controlled" },
};
const technology: HomepageThemeDefinition = {
    ...classic,
    id: "builtin.technology",
    name: "Technology",
    access: "vip",
    features: { banner: true, widgetAppearance: "theme-controlled" },
};

const registry = new HomepageThemeRegistry();
registry.register(classic);
registry.register(simple);
registry.register(paper);
registry.register(handDrawn);
registry.register(card);
registry.register(technology);
assert.throws(() => registry.register(simple), /已注册/);
assert.throws(() => registry.register({ ...simple, id: "INVALID ID" }), /非法/);
assert.throws(() => registry.register({ ...simple, id: "vendor.unsupported", apiVersion: 2 as 1 }), /API 版本/);
assert.throws(() => registerHomepageTheme(classic), /内置命名空间/);

function resolve(preferredThemeId: string, advanced: boolean) {
    return resolveHomepageTheme({
        preferredThemeId,
        surface: "desktop-homepage",
        registry,
        entitlement: createHomepageEntitlementSnapshot(advanced),
    });
}

assert.equal(resolve("builtin.classic", false).effectiveThemeId, "builtin.classic");
assert.equal(resolve("builtin.classic", true).effectiveThemeId, "builtin.classic");
assert.equal(resolve("builtin.simple-test", true).effectiveThemeId, "builtin.simple-test");
assert.equal(resolve("builtin.simple-test", false).fallbackReason, "vip_required");
assert.equal(resolve("builtin.paper", true).effectiveThemeId, "builtin.paper");
assert.equal(resolve("builtin.paper", false).fallbackReason, "vip_required");
assert.equal(resolve("builtin.hand-drawn", true).effectiveThemeId, "builtin.hand-drawn");
assert.equal(resolve("builtin.hand-drawn", false).fallbackReason, "vip_required");
assert.equal(resolve("builtin.card", true).effectiveThemeId, "builtin.card");
assert.equal(resolve("builtin.card", false).fallbackReason, "vip_required");
assert.equal(resolve("builtin.technology", true).effectiveThemeId, "builtin.technology");
assert.equal(resolve("builtin.technology", false).fallbackReason, "vip_required");
assert.equal(supportsHomepageThemeBanner(classic), true, "API v1 themes that omit banner capability must keep legacy behavior");
assert.equal(supportsHomepageThemeBanner({ ...simple, features: { banner: false } }), false, "Themes must be able to disable Banner before resource loading");
const unsupportedRegistry = {
    get(id: string) {
        if (id === "builtin.classic") return classic;
        if (id === "vendor.unsupported") return { ...classic, id, surfaces: [] } as HomepageThemeDefinition;
        return undefined;
    },
} as HomepageThemeRegistry;
assert.equal(resolveHomepageTheme({
    preferredThemeId: "vendor.unsupported",
    surface: "desktop-homepage",
    registry: unsupportedRegistry,
    entitlement: createHomepageEntitlementSnapshot(true),
}).fallbackReason, "unsupported_surface");
const missing = resolve("com.example.missing", true);
assert.equal(missing.preferredThemeId, "com.example.missing");
assert.equal(missing.effectiveThemeId, "builtin.classic");
assert.equal(missing.fallbackReason, "not_registered");
assert.equal(normalizeHomepageAppearanceConfig({ preferredThemeId: "BAD ID" }).preferredThemeId, "builtin.classic");
assert.deepEqual(normalizeHomepageTopLayout({ contentLayout: "inline", bannerPosition: "before", primaryPosition: "actions-first", bannerContent: "all", align: "right" }), {
    contentLayout: "inline",
    bannerPosition: "before",
    primaryPosition: "actions-first",
    bannerContent: "all",
    align: "right",
});
assert.equal(normalizeHomepageTopLayout({ contentLayout: "invalid" }).contentLayout, "split");

assert.deepEqual(resolveHomepageFooterPresentation({ advanced: false, footerEnabled: true, footerContent: "" }), { visible: true, mode: "default" });
assert.deepEqual(resolveHomepageFooterPresentation({ advanced: false, footerEnabled: false, footerContent: "" }), { visible: true, mode: "default" });
assert.deepEqual(resolveHomepageFooterPresentation({ advanced: false, footerEnabled: false, footerContent: "custom" }), { visible: true, mode: "default" });
assert.deepEqual(resolveHomepageFooterPresentation({ advanced: true, footerEnabled: false, footerContent: "" }), { visible: false, mode: "default" });
assert.deepEqual(resolveHomepageFooterPresentation({ advanced: true, footerEnabled: true, footerContent: "" }), { visible: true, mode: "default" });
assert.deepEqual(resolveHomepageFooterPresentation({ advanced: true, footerEnabled: true, footerContent: "custom" }), { visible: true, mode: "custom", html: "custom" });

const classicRuntimeSettings = createClassicRuntimeAppearanceSettings(
    { futureSetting: "preserved", titleAlign: "right" },
    {
        titleAlign: "left",
        quickButtonStyle: "glass",
        bannerTitleColor: "#111111",
        bannerStatusColor: "#222222",
        bannerButtonColor: "#333333",
        bannerGlassEnabled: true,
        bannerGlassColorMode: "custom",
        bannerGlassColor: "#444444",
        bannerGlassOpacity: 30,
        bannerGlassBlur: 16,
    },
);
assert.equal(classicRuntimeSettings.futureSetting, "preserved");
assert.equal(resolveClassicPresentationSettings(classicRuntimeSettings).titleAlign, "left");
assert.equal(resolveClassicPresentationSettings({ bannerGlassOpacity: 999 }).bannerGlassOpacity, 100);

const historical = classifyWidgetAppearance("grid-column: span 2; background-color: rgba(0, 0, 0, 0.03); border: 2px solid var(--b3-theme-primary); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1); transition: all 0.2s ease-in-out; border-radius: 8px;");
assert.equal(historical.mode, "inherit");
assert.match(historical.runtimeStyle, /grid-column/);
assert.doesNotMatch(historical.runtimeStyle, /background/);
assert.equal(classifyWidgetAppearance("grid-row: span 3; background-color: rgb(255, 0, 0);").mode, "custom");
assert.equal(classifyWidgetAppearance("grid-row: span 3; border-color: #ff0000; border-width: 4px;").mode, "custom");

class FakeElement {
    parentElement: FakeElement | null = null;
    children: FakeElement[] = [];
    style = {
        width: "",
        removeProperty: (property: string) => {
            if (property === "width") this.style.width = "";
        },
    };
    constructor(private readonly rootConnected = false) {}
    get isConnected(): boolean { return this.rootConnected || Boolean(this.parentElement?.isConnected); }
    getBoundingClientRect(): { width: number } { return { width: 960 }; }
    append(child: FakeElement): void {
        if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
        child.parentElement = this;
        this.children.push(child);
    }
}
const parking = new FakeElement(true);
const workspaceHost = new FakeElement();
const footerHost = new FakeElement();
const workspaceAnchorA = new FakeElement(true);
const workspaceAnchorB = new FakeElement(true);
const footerAnchor = new FakeElement(true);
const regions = new HomepagePersistentRegionManager(parking as unknown as HTMLElement);
regions.registerHost("workspace", workspaceHost as unknown as HTMLElement);
regions.registerHost("footer", footerHost as unknown as HTMLElement);
regions.attach("workspace", workspaceAnchorA as unknown as HTMLElement);
regions.attach("footer", footerAnchor as unknown as HTMLElement);
assert.equal(regions.hasRequiredAttachments(), true);
regions.detach("workspace", workspaceAnchorA as unknown as HTMLElement);
assert.equal(workspaceHost.parentElement, parking);
assert.equal(workspaceHost.style.width, "960px");
regions.attach("workspace", workspaceAnchorB as unknown as HTMLElement);
assert.equal(regions.getHost("workspace"), workspaceHost as unknown as HTMLElement);
assert.equal(workspaceHost.parentElement, workspaceAnchorB);
assert.equal(workspaceHost.style.width, "");
assert.equal(regions.hasRequiredAttachments(), true);

function collectSourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? collectSourceFiles(path) : [path];
    });
}
const themeSources = collectSourceFiles("src/homepage/theme")
    .filter((path) => /\.(ts|svelte|scss)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
for (const forbidden of ["addCustomBlock", "writeDeviceView", "plugin.ADVANCED", "requiredWidgets", "initialWidgets", "forceLayout"]) {
    assert.equal(themeSources.includes(forbidden), false, `Theme source contains forbidden capability: ${forbidden}`);
}
const sharedSources = collectSourceFiles("src/homepage/theme/components/shared")
    .filter((path) => /\.svelte$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
for (const legacyClass of [
    "header-content", "icon-title", "section-title", "stats-info-wrap", "stats-info",
    "stats-info-refresh", "nav-bar", "nav-button", "more-button", "more-menu",
    "more-menu-item", "component-section-nav", "component-section-nav__button",
]) {
    assert.equal(sharedSources.includes(legacyClass), false, `Shared theme component still references Classic class: ${legacyClass}`);
}
assert.match(sharedSources, /floatingPopoverAction/, "Action overflow must use the shared floating primitive");
assert.match(sharedSources, /handleWindowPointerDown/, "Action overflow must close on outside pointer interaction");
assert.match(sharedSources, /event\.key === "Escape"/, "Action overflow must close on Escape");
assert.doesNotMatch(sharedSources, /forcedOverflow|overflowActions/, "Themes must not override the user's shortcut placement");
const actionRuntimeSource = readFileSync("src/homepage/theme/runtime/homepageActionRuntime.ts", "utf8");
assert.match(
    actionRuntimeSource,
    /placement:\s*button\.checked\s*\?\s*"primary"\s*:\s*"overflow"/,
    "Shortcut placement must follow the user's saved switch state",
);
const homepageActionSource = readFileSync("src/homepage/homepage.svelte", "utf8");
assert.match(homepageActionSource, /HOMEPAGE_CONTEXT_BUTTONS/, "Homepage context actions must remain explicit");
assert.match(homepageActionSource, /createBuiltinButton\("addWidget"\)/, "Add Widget must remain available from the homepage context menu");
assert.match(homepageActionSource, /createBuiltinButton\("settings"\)/, "Settings must remain available from the homepage context menu");
assert.match(homepageActionSource, /!isHomepageContextOnlyAction\(getButtonAction\(item\)\)/, "Context-only actions must never enter the shortcut action model");
for (const action of ["addWidget", "settings"]) {
    assert.equal(createDefaultButtons().some((item) => item.action === action), false, `${action} must not be a default shortcut button`);
    assert.equal(normalizeButtonsList([{ id: 1, label: action, action, checked: true, shortcut: "", order: 0 }]).some((item) => item.action === action), false, `${action} must be removed from saved shortcut settings`);
}
const widgetBlockSource = readFileSync("src/components/utils/widgetBlock/WidgetBlock.ts", "utf8");
assert.match(widgetBlockSource, /\[data-widget-native-context-menu\]/, "Widget context menu must expose a native-menu escape attribute");
assert.match(widgetBlockSource, /target\.closest\(WIDGET_NATIVE_CONTEXT_MENU_SELECTOR\)/, "Widget context menu must ignore interactive descendants");
for (const eventName of ["mousedown", "mouseup", "contextmenu"]) {
    assert.match(widgetBlockSource, new RegExp(`window\\.addEventListener\\("${eventName}",\\s*WidgetBlock\\.handleWindowForcedContextMenuGesture,\\s*true\\)`), `Widget context menu must capture Alt + right-click ${eventName} before embedded editors`);
    assert.match(widgetBlockSource, new RegExp(`window\\.removeEventListener\\("${eventName}",\\s*WidgetBlock\\.handleWindowForcedContextMenuGesture,\\s*true\\)`), `Widget forced ${eventName} listener must be removed with matching capture options`);
}
assert.match(widgetBlockSource, /window\.addEventListener\("keyup",\s*WidgetBlock\.handleWindowForcedContextMenuKeyUp,\s*true\)/, "Focused Protyle Alt gestures must wait for the Alt keyup capture");
assert.match(widgetBlockSource, /window\.removeEventListener\("keyup",\s*WidgetBlock\.handleWindowForcedContextMenuKeyUp,\s*true\)/, "Forced Alt keyup listener must be removed with matching capture options");
assert.match(widgetBlockSource, /addEventListener\("contextmenu",\s*this\.handleContextMenu\)/, "Ordinary widget context menus must retain their bubble-phase listener");
assert.match(widgetBlockSource, /handleWindowForcedContextMenuGesture[\s\S]*!event\.altKey\s*\|\|\s*event\.button\s*!==\s*2[\s\S]*event\.stopImmediatePropagation\(\)/, "Only Alt + right-click may bypass native editor menus, and it must stop Protyle before the target phase");
assert.match(widgetBlockSource, /event\.type\s*===\s*"contextmenu"\s*&&\s*this\.forcedContextMenuGestureActive[\s\S]*event\.type\s*===\s*"mouseup"[\s\S]*pendingForcedContextMenuWidget\s*=\s*this/, "Forced widget menu must wait for the complete right-click gesture before opening");
assert.match(widgetBlockSource, /handleWindowForcedContextMenuKeyUp[\s\S]*event\.key\s*!==\s*"Alt"[\s\S]*widget\.scheduleForcedContextMenu\(\)/, "Forced widget menu must open only after focused Protyle finishes Alt keyup");
assert.match(widgetBlockSource, /"组件大小"\s*:\s*"样式设置"/, "Widget context menu must describe theme-controlled appearance accurately");

const themeTypesSource = readFileSync("src/homepage/theme/api/types.ts", "utf8");
const themePropsBlock = themeTypesSource.slice(
    themeTypesSource.indexOf("export interface HomepageThemeProps"),
    themeTypesSource.indexOf("export interface HomepageThemeDefinition"),
);
assert.doesNotMatch(themePropsBlock, /\bclassic\s*:/, "Public Theme Props must not expose Classic presentation settings");
for (const capability of ["theme", "identity", "banner", "status", "actions", "sections", "footer", "regions", "appearance"]) {
    assert.match(themePropsBlock, new RegExp(`\\b${capability}\\s*:`), `Public Theme Props missing capability: ${capability}`);
}

const themeIndexSource = readFileSync("src/homepage/theme/index.ts", "utf8");
for (const primitive of ["HomepageThemeRegion", "HomepageIdentity", "HomepageBanner", "HomepageStatus", "HomepageActions", "HomepageSections"]) {
    assert.match(themeIndexSource, new RegExp(`\\b${primitive}\\b`), `Theme entry does not export primitive: ${primitive}`);
}
const sharedBannerSource = readFileSync("src/homepage/theme/components/shared/HomepageBanner.svelte", "utf8");
assert.match(sharedBannerSource, /banner\.integrated && banner\.glassEnabled/, "Integrated banner glass must live in the shared banner primitive");
assert.match(sharedBannerSource, /hp-banner__glass/, "Shared banner primitive must render the glass layer for every banner theme");

const homepageStyleSource = readFileSync("src/homepage/style/homepage.scss", "utf8");
assert.doesNotMatch(homepageStyleSource, /_workspace-header|_plugin-footer|_top-banner/, "Core stylesheet still imports Classic presentation partials");
assert.doesNotMatch(homepageStyleSource, /\.section\s*\{/, "Core stylesheet must not impose global section padding");
const workspaceStyleSource = readFileSync("src/homepage/style/_custom-content.scss", "utf8");
assert.doesNotMatch(workspaceStyleSource, /component-section-nav|background-color:\s*var\(--b3-theme-background|hover:not\(\[data-widget-type="custom-protyle"\]\)/, "Workspace mechanism CSS still contains theme presentation");

const simpleThemeStyleSource = readFileSync("src/homepage/theme/builtins/simple-test/simple-test.scss", "utf8");
assert.match(simpleThemeStyleSource, /@container hp-homepage/, "Simple workspace must respond to the actual homepage container");
assert.match(simpleThemeStyleSource, /--hp-content-max-width:\s*none/, "Simple workspace must not impose a fixed desktop width cap");
assert.match(simpleThemeStyleSource, /\.hp-simple-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*margin:\s*0;/s, "Simple workspace must use the full homepage width");
assert.doesNotMatch(simpleThemeStyleSource, /hp-simple-sidebar/, "Simple workspace must use the horizontal knowledge-workspace hierarchy");
assert.match(simpleThemeStyleSource, /hp-simple-header/, "Simple workspace must provide a horizontal identity/action header");
assert.match(simpleThemeStyleSource, /\.hp-sections\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s, "Horizontal section navigation must not expose a useless vertical scrollbar");
assert.match(simpleThemeStyleSource, /\.hp-status__refresh\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s, "Simple workspace status refresh must stay hidden until the status area is engaged");
assert.match(simpleThemeStyleSource, /\.hp-status:hover\s+\.hp-status__refresh,[\s\S]*?\.hp-status:focus-within\s+\.hp-status__refresh,[\s\S]*?\.hp-status__refresh:focus-visible\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s, "Simple workspace status refresh must reveal on hover and keyboard focus");
assert.match(simpleThemeStyleSource, /--hp-page-bg:\s*var\(--b3-theme-background/, "Simple workspace must inherit the SiYuan theme palette");
assert.doesNotMatch(simpleThemeStyleSource, /:root\[data-theme-mode=/, "Simple workspace must not define its own light or dark palette");
const simpleThemeSource = readFileSync("src/homepage/theme/builtins/simple-test/SimpleTestTheme.svelte", "utf8");
assert.doesNotMatch(simpleThemeSource, /HomepageBanner|banner\.enabled/, "Simple workspace must omit the banner presentation");
const simpleThemeDefinitionSource = readFileSync("src/homepage/theme/builtins/simple-test/definition.ts", "utf8");
assert.match(simpleThemeDefinitionSource, /features:\s*\{[^}]*banner:\s*false/, "Simple workspace must reject Banner before its resources are resolved");
const paperThemeStyleSource = readFileSync("src/homepage/theme/builtins/paper/paper.scss", "utf8");
assert.match(paperThemeStyleSource, /data-hp-theme="builtin\.paper"/, "Paper workspace styles must be scoped to its theme id");
assert.match(paperThemeStyleSource, /--hp-paper-sheet:/, "Paper workspace must expose semantic paper surface tokens");
assert.match(paperThemeStyleSource, /--hp-paper-texture:\s*url\("\.\/paper-texture\.svg"\)/, "Paper workspace must use its bundled SVG texture asset");
assert.doesNotMatch(paperThemeStyleSource, /--hp-paper-texture:\s*url\(["']?https?:/i, "Paper workspace texture must not depend on a remote request");
assert.match(paperThemeStyleSource, /\.hp-paper-sheet\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/s, "Paper workspace must use the full homepage width instead of a floating rounded card");
assert.match(paperThemeStyleSource, /\.hp-paper-sheet::before\s*\{[^}]*var\(--hp-paper-page-surface\)[^}]*paper-page-mask\.svg[^}]*drop-shadow/s, "Paper workspace must render its semi-transparent deckle sheet on a non-interactive backing layer");
assert.doesNotMatch(paperThemeStyleSource, /--hp-paper-page-surface:\s*#fff\b/i, "Homepage paper surface must remain translucent instead of opaque white");
assert.match(paperThemeStyleSource, /@container hp-homepage/, "Paper workspace must respond to the actual homepage container");
const paperTextureSource = readFileSync("src/homepage/theme/builtins/paper/paper-texture.svg", "utf8");
assert.match(paperTextureSource, /<feTurbulence\b/, "Paper texture must synthesize irregular SVG noise");
assert.match(paperTextureSource, /stitchTiles="stitch"/, "Paper texture must tile without visible seams");
assert.match(paperTextureSource, /fine-grain|soft-mottle|fibres/, "Paper texture must combine grain, mottling, and fibre detail");
const paperThemeSource = readFileSync("src/homepage/theme/builtins/paper/PaperTheme.svelte", "utf8");
assert.match(paperThemeSource, /HomepageBanner/, "Paper workspace must use the shared Banner primitive");
assert.match(paperThemeSource, /hp-paper-banner-clip[\s\S]*<svg/, "Paper Banner must render its paperclip outside the clipped image region");
assert.match(paperThemeSource, /hp-paper-banner-clip--back[\s\S]*hp-paper-banner-frame[\s\S]*hp-paper-banner-clip--front/, "Paperclip loops must straddle the backing paper on separate stacking layers");
assert.match(paperThemeSource, /hp-paper-banner-clip--back[\s\S]*hp-paper-banner-clip__inner[\s\S]*hp-paper-banner-frame[\s\S]*hp-paper-banner-clip--front[\s\S]*hp-paper-banner-clip__outer/, "Paperclip inner loop must sit behind the paper while the outer loop remains in front");
assert.match(paperThemeSource, /name="workspace"[\s\S]*name="footer"/, "Paper workspace must attach the required persistent regions in order");
const paperBannerMaskSource = readFileSync("src/homepage/theme/builtins/paper/paper-banner-mask.svg", "utf8");
assert.match(paperBannerMaskSource, /<feTurbulence\b[\s\S]*<feDisplacementMap\b/, "Paper Banner must use an irregular SVG deckle-edge mask");
assert.match(paperBannerMaskSource, /<rect\b[^>]*filter="url\(#deckle\)"/, "Paper Banner backing must use a noise-displaced paper rectangle instead of a mechanical polygon");
assert.doesNotMatch(paperBannerMaskSource, /<g\b[^>]*stroke="#fff"/, "Paper Banner edge must not add periodic synthetic fibre spikes");
const paperPageMaskSource = readFileSync("src/homepage/theme/builtins/paper/paper-page-mask.svg", "utf8");
assert.match(paperPageMaskSource, /<feTurbulence\b[\s\S]*<feDisplacementMap\b/, "Homepage paper sheet must use a noise-displaced deckle mask");
assert.match(paperThemeStyleSource, /mask-image:\s*url\("\.\/paper-banner-mask\.svg"\)/, "Paper Banner must apply its bundled torn-edge SVG mask");
assert.match(paperThemeStyleSource, /\.hp-paper-banner-frame\s*\{[^}]*background-color:\s*#fff;/s, "Paper Banner backing must remain an opaque white sheet instead of blending into the page");
assert.doesNotMatch(paperThemeStyleSource, /hp-paper-banner-frame::(?:before|after)/, "Paper Banner must not fall back to clipped tape pseudo-elements");
assert.doesNotMatch(paperThemeStyleSource, /\.hp-paper-banner\s*\{[^}]*clip-path:/s, "Paper Banner image must remain rectangular inside the torn backing paper");
const paperThemeDefinitionSource = readFileSync("src/homepage/theme/builtins/paper/definition.ts", "utf8");
assert.match(paperThemeDefinitionSource, /id:\s*"builtin\.paper"/, "Paper workspace must use a stable builtin theme id");
assert.match(paperThemeDefinitionSource, /name:\s*"纸质"/, "Paper workspace must use the compact Chinese theme name");
assert.doesNotMatch(paperThemeDefinitionSource, /thumbnail:/, "Theme definitions must not retain unused preview images");
assert.match(paperThemeDefinitionSource, /features:\s*\{[^}]*banner:\s*true[^}]*widgetAppearance:\s*"theme-controlled"/, "Paper workspace must preserve Banner and control Widget presentation");
const handDrawnThemeStyleSource = readFileSync("src/homepage/theme/builtins/hand-drawn/hand-drawn.scss", "utf8");
assert.match(handDrawnThemeStyleSource, /data-hp-theme="builtin\.hand-drawn"/, "Hand-drawn workspace styles must be scoped to its theme id");
assert.match(handDrawnThemeStyleSource, /--hp-sketch-ink:\s*var\(--b3-theme-on-background/, "Hand-drawn workspace must inherit the SiYuan palette");
assert.match(handDrawnThemeStyleSource, /\.hp-sketch-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s, "Hand-drawn workspace must use the full homepage width");
assert.match(handDrawnThemeStyleSource, /sketch-page-frame\.svg/, "Hand-drawn workspace must use a bundled irregular page outline");
assert.match(handDrawnThemeStyleSource, /@container hp-homepage/, "Hand-drawn workspace must respond to the actual homepage container");
assert.doesNotMatch(handDrawnThemeStyleSource, /https?:\/\//i, "Hand-drawn workspace must not depend on remote visual assets");
const handDrawnThemeSource = readFileSync("src/homepage/theme/builtins/hand-drawn/HandDrawnTheme.svelte", "utf8");
assert.match(handDrawnThemeSource, /HomepageBanner/, "Hand-drawn workspace must use the shared Banner primitive");
assert.match(handDrawnThemeSource, /name="workspace"[\s\S]*name="footer"/, "Hand-drawn workspace must attach the required persistent regions in order");
const handDrawnThemeDefinitionSource = readFileSync("src/homepage/theme/builtins/hand-drawn/definition.ts", "utf8");
assert.match(handDrawnThemeDefinitionSource, /name:\s*"手绘"/, "Hand-drawn workspace must use the compact Chinese theme name");
assert.doesNotMatch(handDrawnThemeDefinitionSource, /thumbnail:/, "Theme definitions must not retain unused preview images");
assert.match(handDrawnThemeDefinitionSource, /features:\s*\{[^}]*banner:\s*true[^}]*widgetAppearance:\s*"theme-controlled"/, "Hand-drawn workspace must preserve Banner and control Widget presentation");
const cardThemeStyleSource = readFileSync("src/homepage/theme/builtins/card/card.scss", "utf8");
assert.match(cardThemeStyleSource, /data-hp-theme="builtin\.card"/, "Card workspace styles must be scoped to its theme id");
assert.match(cardThemeStyleSource, /--hp-card-text:\s*var\(--b3-theme-on-background/, "Card workspace must inherit the SiYuan palette");
assert.match(cardThemeStyleSource, /\.hp-card-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*margin:\s*0;/s, "Card workspace must use the full homepage width");
for (const panel of ["identity", "status", "actions", "banner", "sections"]) {
    assert.match(cardThemeStyleSource, new RegExp(`\\.hp-card-${panel}-panel`), `Card workspace must style the ${panel} region as an explicit card`);
}
assert.match(cardThemeStyleSource, /@container hp-homepage/, "Card workspace must respond to the actual homepage container");
assert.doesNotMatch(cardThemeStyleSource, /https?:\/\//i, "Card workspace must not depend on remote visual assets");
assert.doesNotMatch(cardThemeStyleSource, /\.hp-card-(?:identity|status|actions|banner|sections)-panel::before/, "Card regions must remain plain cards without decorative top bars");
const cardThemeSource = readFileSync("src/homepage/theme/builtins/card/CardTheme.svelte", "utf8");
assert.match(cardThemeSource, /HomepageBanner/, "Card workspace must use the shared Banner primitive");
assert.match(cardThemeSource, /name="workspace"[\s\S]*name="footer"/, "Card workspace must attach the required persistent regions in order");
const cardThemeDefinitionSource = readFileSync("src/homepage/theme/builtins/card/definition.ts", "utf8");
assert.match(cardThemeDefinitionSource, /name:\s*"卡片"/, "Card workspace must use the compact Chinese theme name");
assert.doesNotMatch(cardThemeDefinitionSource, /thumbnail:/, "Theme definitions must not retain unused preview images");
assert.match(cardThemeDefinitionSource, /features:\s*\{[^}]*banner:\s*true[^}]*widgetAppearance:\s*"theme-controlled"/, "Card workspace must preserve Banner and control Widget presentation");
const technologyThemeStyleSource = readFileSync("src/homepage/theme/builtins/technology/technology.scss", "utf8");
assert.match(technologyThemeStyleSource, /data-hp-theme="builtin\.technology"/, "Technology workspace styles must be scoped to its theme id");
assert.match(technologyThemeStyleSource, /--hp-tech-cyan:/, "Technology workspace must expose semantic HUD tokens");
assert.match(technologyThemeStyleSource, /repeating-linear-gradient/, "Technology workspace must render a restrained scanline layer");
assert.match(technologyThemeStyleSource, /@container hp-homepage/, "Technology workspace must respond to the actual homepage container");
assert.doesNotMatch(technologyThemeStyleSource, /https?:\/\//i, "Technology workspace must not depend on remote visual assets");
const technologyThemeSource = readFileSync("src/homepage/theme/builtins/technology/TechnologyTheme.svelte", "utf8");
assert.match(technologyThemeSource, /HomepageBanner/, "Technology workspace must reuse the shared Banner primitive");
assert.match(technologyThemeSource, /name="workspace"[\s\S]*name="footer"/, "Technology workspace must attach the required persistent regions in order");
const technologyThemeDefinitionSource = readFileSync("src/homepage/theme/builtins/technology/definition.ts", "utf8");
assert.match(technologyThemeDefinitionSource, /id:\s*"builtin\.technology"/, "Technology workspace must use a stable builtin theme id");
assert.match(technologyThemeDefinitionSource, /name:\s*"科技"/, "Technology workspace must use the compact Chinese theme name");
assert.match(technologyThemeDefinitionSource, /access:\s*"vip"/, "Technology workspace must remain a VIP theme");
assert.equal(resolveHomepageSectionNavigationActiveId({ requestedSectionId: "tasks", activeSectionId: "notes", sectionIds: ["notes", "tasks"] }), "tasks");
assert.equal(resolveHomepageSectionNavigationActiveId({ activeSectionId: "notes", sectionIds: ["notes", "tasks"] }), "notes");
assert.equal(resolveHomepageSectionNavigationActiveId({ requestedSectionId: "missing", activeSectionId: "missing", sectionIds: ["notes", "tasks"] }), "notes");
assert.match(homepageActionSource, /mode === "initial-load"[\s\S]*requestedComponentSectionId = nextActiveSectionId/, "Initial load must synchronize section navigation with the resolved active section");
const sharedSectionsSource = readFileSync("src/homepage/theme/components/shared/HomepageSections.svelte", "utf8");
assert.match(sharedSectionsSource, /aria-selected=\{section\.active\}/, "Section tabs must expose their active state semantically");
assert.match(sharedSectionsSource, /navigationElement\.scrollTo/, "Section navigation must reveal an off-screen active tab");
const appearanceTabSource = readFileSync("src/homepage/homepageSetting/tabs/AppearanceSettingsTab.svelte", "utf8");
assert.doesNotMatch(appearanceTabSource, /theme\.preview|theme-card__preview|theme-card__fallback/, "Theme settings must not render misleading preview images");
assert.match(appearanceTabSource, /switchingThemeId[\s\S]*theme-card__progress/, "Theme settings must expose compact progress while a theme is activating");
const builtinThemeDiscoverySource = readFileSync("src/homepage/theme/registry/builtinThemeDiscovery.ts", "utf8");
assert.match(builtinThemeDiscoverySource, /includes\("\/classic\/"\)/, "Classic must be discovered before paid themes");
const settingsSource = readFileSync("src/homepage/homepageSetting/homepageSetting.svelte", "utf8");
assert.match(settingsSource, /HOMEPAGE_THEME_TRANSITION_EVENT/, "Theme settings must subscribe to the runtime transition lifecycle");
const appearanceOnlyBranch = settingsSource.slice(settingsSource.indexOf("if (appearanceOnly)"), settingsSource.indexOf("let result;"));
assert.equal(appearanceOnlyBranch.includes("saveHomepageSettingsInTransaction"), false, "Appearance-only save must not enter layout transaction");
assert.equal(appearanceOnlyBranch.includes("saveHomepageSettingConfig"), true, "Appearance-only save must update view config");
const homepageSource = readFileSync("src/homepage/homepage.svelte", "utf8");
assert.doesNotMatch(
    homepageSource,
    /\{#if\s+homepageConfigLoaded\}\s*<HomepageThemeHost/,
    "ThemeHost and required regions must mount before initial widget restore",
);
assert.ok(
    homepageSource.indexOf("hp-core-parking") < homepageSource.indexOf("<HomepageThemeHost"),
    "Persistent hosts must register before theme region anchors mount",
);
assert.match(
    homepageSource,
    /pendingPersistentRegionAnchors\.set\(name, anchor\)/,
    "Region anchors that mount before the manager must be queued",
);
assert.match(
    homepageSource,
    /for \(const \[name, anchor\] of pendingPersistentRegionAnchors\)/,
    "Queued region anchors must replay when the manager initializes",
);
assert.match(
    homepageSource,
    /await waitForPersistentRegionsMountable\(\)/,
    "Initial layout restore must wait for measurable persistent regions",
);
assert.match(homepageSource, /await plugin\?\.waitForHomepageEntitlementReady\?\.\(\)/, "Initial theme resolution must wait for entitlement readiness");
assert.match(homepageSource, /hp-initial-region-stage[\s\S]*HomepageThemeRegion name="workspace"[\s\S]*HomepageThemeRegion name="footer"/, "Initial restore must use neutral measurable region anchors instead of a placeholder theme");
assert.match(homepageSource, /if \(!initialWidgetGridReady\)[\s\S]*await revealInitializedHomepage\(\)/, "The real theme must remain covered until the first widget grid is calibrated");
assert.match(homepageSource, /bannerEnabled\s*=\s*config\.bannerEnabled/, "Theme capability must not overwrite the persisted Banner preference");
assert.match(homepageSource, /homepageTopLayout\s*=\s*advanced\s*\?\s*config\.homepageTopLayout/, "Theme capability must not overwrite the persisted top-layout preference");
assert.match(homepageSource, /enabled:\s*supportsHomepageThemeBanner\(themeResolution\.definition\)\s*&&\s*bannerEnabled/, "Banner visibility must be derived from theme capability at render time");
assert.match(homepageSource, /integrated:\s*supportsHomepageThemeBanner\(themeResolution\.definition\)\s*&&\s*homepageTopLayout\.bannerContent\s*===\s*"all"/, "Integrated Banner content must be derived from theme capability at render time");
assert.match(homepageSource, /resolveBannerImage\(config, getAdvancedEnabled\(\)\)/, "Banner resources must stay ready for live theme switching");
const themeActivationRequestSource = homepageSource.slice(
    homepageSource.indexOf("async function requestThemeResolutionActivation"),
    homepageSource.indexOf("function activateThemeResolution"),
);
assert.match(themeActivationRequestSource, /firstActivation[\s\S]*await tick\(\)[\s\S]*requestAnimationFrame[\s\S]*activateThemeResolution/, "Cold themes must paint their loading overlay before first activation");
assert.doesNotMatch(themeActivationRequestSource, /saveLayout|restoreLayout|saveData|writeDeviceView/, "Theme activation feedback must not mutate widget layout or configuration");
assert.match(homepageSource, /finishHomepageThemeTransition\(expectedThemeId\)/, "Theme transition must finish only after persistent regions and widget presentation are synchronized");
const activateThemeResolutionSource = homepageSource.slice(
    homepageSource.indexOf("function activateThemeResolution"),
    homepageSource.indexOf("function scheduleThemeRegionValidation"),
);
assert.doesNotMatch(activateThemeResolutionSource, /saveLayout|restoreLayout|saveData|writeDeviceView/, "Theme switching must not persist or restore widget layout");
const themeValidationSource = homepageSource.slice(
    homepageSource.indexOf("function scheduleThemeRegionValidation"),
    homepageSource.indexOf("async function waitForPersistentRegionsMountable"),
);
assert.doesNotMatch(themeValidationSource, /getAttribute\("style"\)/, "Persistent Region validation must not compare raw style strings");
assert.match(themeValidationSource, /collectThemeWidgetIdentityElements/, "Persistent Region validation must include detached preserved widgets");
assert.match(themeValidationSource, /temporarilyPreservedWidgetIds/, "Persistent Region validation must recognize transient preserved widgets");
for (const diagnostic of ["element_identity_changed", "instance_identity_changed", "section_changed", "dom_order_changed", "layout_semantics_changed"]) {
    assert.match(themeValidationSource, new RegExp(diagnostic), `Persistent Region validation missing diagnostic: ${diagnostic}`);
}
assert.match(homepageSource, /data-hp-widget-appearance-policy/, "Theme host must expose the widget appearance policy");
const themeHostStyleSource = readFileSync("src/homepage/theme/style/theme-host.scss", "utf8");
assert.doesNotMatch(themeHostStyleSource, /hp-core-parking\s*\{[^}]*display:\s*none/s, "Persistent Region parking must remain measurable");
assert.match(themeHostStyleSource, /data-hp-widget-appearance-policy="theme-controlled"/, "Theme-controlled widget appearance policy is missing");
assert.match(themeHostStyleSource, /hp-initial-theme-content\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/s, "The unresolved theme must not flash before initial reveal");
assert.match(themeHostStyleSource, /prefers-reduced-motion:\s*reduce/, "Initial loading motion must respect reduced-motion preferences");
const initialLoadOverlaySource = readFileSync("src/homepage/theme/components/HomepageInitialLoadOverlay.svelte", "utf8");
assert.match(initialLoadOverlaySource, /role=\"progressbar\"/, "Initial loading overlay must expose an accessible progress indicator");
assert.match(initialLoadOverlaySource, /aria-busy=\{!failed\}/, "Initial loading overlay must expose its busy state");
assert.match(initialLoadOverlaySource, /mode === "theme"[\s\S]*正在切换主题/, "Loading overlay must distinguish initial homepage load from a cold theme activation");
const themeTransitionEventsSource = readFileSync("src/homepage/theme/runtime/themeTransitionEvents.ts", "utf8");
assert.match(themeTransitionEventsSource, /"start" \| "ready" \| "error"/, "Theme transition lifecycle must expose start, ready, and error phases");

console.log("Homepage theme framework verification passed.");
