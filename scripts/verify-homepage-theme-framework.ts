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

const registry = new HomepageThemeRegistry();
registry.register(classic);
registry.register(simple);
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
assert.match(actionRuntimeSource, /placement:\s*button\.checked\s*\?\s*"primary"\s*:\s*"overflow"/, "Shortcut placement must follow the user's saved switch state");

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

const homepageStyleSource = readFileSync("src/homepage/style/homepage.scss", "utf8");
assert.doesNotMatch(homepageStyleSource, /_workspace-header|_plugin-footer|_top-banner/, "Core stylesheet still imports Classic presentation partials");
assert.doesNotMatch(homepageStyleSource, /\.section\s*\{/, "Core stylesheet must not impose global section padding");
const workspaceStyleSource = readFileSync("src/homepage/style/_custom-content.scss", "utf8");
assert.doesNotMatch(workspaceStyleSource, /component-section-nav|background-color:\s*var\(--b3-theme-background|hover:not\(\[data-widget-type="custom-protyle"\]\)/, "Workspace mechanism CSS still contains theme presentation");

const simpleThemeStyleSource = readFileSync("src/homepage/theme/builtins/simple-test/simple-test.scss", "utf8");
assert.match(simpleThemeStyleSource, /@container hp-homepage/, "Simple workspace must respond to the actual homepage container");
assert.match(simpleThemeStyleSource, /--hp-content-max-width:\s*1500px/, "Simple workspace must cap ultra-wide content");
assert.doesNotMatch(simpleThemeStyleSource, /hp-simple-sidebar/, "Simple workspace must use the horizontal knowledge-workspace hierarchy");
assert.match(simpleThemeStyleSource, /hp-simple-header/, "Simple workspace must provide a horizontal identity/action header");
assert.match(simpleThemeStyleSource, /\.hp-sections\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s, "Horizontal section navigation must not expose a useless vertical scrollbar");
const appearanceTabSource = readFileSync("src/homepage/homepageSetting/tabs/AppearanceSettingsTab.svelte", "utf8");
assert.match(appearanceTabSource, /theme\.preview\?\.thumbnail/, "Theme settings must render real preview thumbnails when provided");
assert.match(appearanceTabSource, /theme-card__fallback/, "Theme settings must keep a preview fallback");
const settingsSource = readFileSync("src/homepage/homepageSetting/homepageSetting.svelte", "utf8");
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

console.log("Homepage theme framework verification passed.");
