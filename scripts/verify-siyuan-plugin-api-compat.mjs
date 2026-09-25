import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [indexSource, settingsSource] = await Promise.all([
    readFile(resolve(root, "src/index.ts"), "utf8"),
    readFile(resolve(root, "src/homepage/homepageSetting/homepageSetting.svelte"), "utf8"),
]);

const bundle = await build({
    stdin: {
        contents: `export { removeTopBarWithFallback, supportsDynamicDock, supportsDynamicToolbar } from "./src/utils/siyuanPluginApiCompat";`,
        loader: "ts",
        resolveDir: root,
        sourcefile: "verify-siyuan-plugin-api-compat.ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    logLevel: "silent",
});
const apiCompat = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`,
);

const modernTopBarCalls = [];
apiCompat.removeTopBarWithFallback({ removeTopBar: (id) => modernTopBarCalls.push(id) }, "stable-id", () => {
    assert.fail("modern host must use removeTopBar");
});
assert.deepEqual(modernTopBarCalls, ["stable-id"]);
let legacyTopBarFallbackCalls = 0;
apiCompat.removeTopBarWithFallback({}, "stable-id", () => { legacyTopBarFallbackCalls += 1; });
assert.equal(legacyTopBarFallbackCalls, 1);

assert.equal(apiCompat.supportsDynamicToolbar({ addToolbarItem() {}, removeToolbarItem() {} }), true);
assert.equal(apiCompat.supportsDynamicToolbar({}), false);
assert.equal(apiCompat.supportsDynamicToolbar({ addToolbarItem() {} }), false);
assert.equal(apiCompat.supportsDynamicDock({ removeDock() {} }), true);
assert.equal(apiCompat.supportsDynamicDock({}), false);
assert.equal(apiCompat.supportsDynamicDock({ removeDock: true }), false);

const dataChanged = indexSource.slice(
    indexSource.indexOf("public override onDataChanged"),
    indexSource.indexOf("private ensureDeviceIdentityForRuntime"),
);
assert.match(dataChanged, /reason !== undefined && reason !== "sync" && reason !== "overwrite"/);
assert.match(dataChanged, /scheduleHomepageEntitlementExternalRefresh/);
assert.match(dataChanged, /new CustomEvent\(HOMEPAGE_SHARED_SETTINGS_EXTERNAL_CHANGE_EVENT\)/);
assert(!dataChanged.includes("super.onDataChanged") && !dataChanged.includes("location.reload"));

const topBars = indexSource.slice(
    indexSource.indexOf("private registerHomepageTopBar"),
    indexSource.indexOf("private isMobileFrontend"),
);
assert.match(topBars, /id: HOMEPAGE_TOPBAR_ID/);
assert.match(topBars, /id: KB_CHAT_TOPBAR_ID/);
assert.match(topBars, /removeTopBarWithFallback\(this, id/);
assert.match(topBars, /document\.querySelectorAll/);

const selectionRuntime = indexSource.slice(
    indexSource.indexOf("private stopSelectionAiPremiumRuntime"),
    indexSource.indexOf("private async startSelectionAiPremiumRuntime"),
);
assert.match(selectionRuntime, /supportsDynamicToolbar\(this\)/);
assert.match(selectionRuntime, /this\.addToolbarItem\(item\)/);
assert.match(selectionRuntime, /this\.removeToolbarItem\(name\)/);
assert.match(selectionRuntime, /this\.isMobileFrontend\(\)/);
const toolbarFallback = indexSource.slice(
    indexSource.indexOf("updateProtyleToolbar(toolbar"),
    indexSource.indexOf("async onLayoutReady"),
);
assert.match(toolbarFallback, /if \(supportsDynamicToolbar\(this\)\) return toolbar/);
assert.match(toolbarFallback, /toolbar\.push\(\.\.\.selectionAiToolbarItems\)/);

const refreshSharedSettings = settingsSource.slice(
    settingsSource.indexOf("async function refreshSharedMobileSettings"),
    settingsSource.indexOf("function handleHomepageSettingsSavedEvent"),
);
const visibilityGuardIndex = refreshSharedSettings.indexOf('document.visibilityState !== "visible"');
const sharedSettingsReadIndex = refreshSharedSettings.indexOf("readHomepageSharedSettingsSnapshot(plugin)");
assert(visibilityGuardIndex >= 0 && visibilityGuardIndex < sharedSettingsReadIndex);
assert.match(settingsSource, /const SHARED_SETTINGS_POLL_MS = 60000/);
assert.match(settingsSource, /if \(document\.visibilityState === "visible"\) void refreshSharedMobileSettings\(\)/);
assert.match(settingsSource, /addEventListener\(HOMEPAGE_SHARED_SETTINGS_EXTERNAL_CHANGE_EVENT, handleHomepageSettingsSavedEvent\)/);
assert.match(settingsSource, /removeEventListener\(HOMEPAGE_SHARED_SETTINGS_EXTERNAL_CHANGE_EVENT, handleHomepageSettingsSavedEvent\)/);

const sourceSection = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert(start >= 0, `missing source marker: ${startMarker}`);
    assert(end > start, `missing source end marker: ${endMarker}`);
    return source.slice(start, end);
};

const homepageSurface = sourceSection(
    indexSource,
    "private async initializeHomepageSurface(config: PluginConfig): Promise<void> {",
    "private syncHomepageDocks(config: PluginConfig): void {",
);
assert.match(homepageSurface, /this\.syncHomepageDocks\(config\)/);
assert.doesNotMatch(homepageSurface, /this\.register(?:Kb)?Dock\(\)/);
assert.match(indexSource, /private async handleHomepageSettingsSaved\(\): Promise<void> \{[\s\S]*?await this\.initializeHomepageSurface\(config\);/);

const dockSync = sourceSection(
    indexSource,
    "private syncHomepageDocks(config: PluginConfig): void {",
    "/** 仅同步旧快照",
);
assert.match(dockSync, /!this\.isMobileFrontend\(\)/);
assert.match(dockSync, /config\.sidebarEnabled === true[\s\S]*?this\.registerDock\(\)[\s\S]*?this\.unregisterSidebarDock\(\)/);
assert.match(dockSync, /config\.aiKbDockEnabled === true[\s\S]*?this\.registerKbDock\(\)[\s\S]*?this\.unregisterKbDock\(\)/);

const sidebarUnregister = sourceSection(indexSource, "private unregisterSidebarDock(): void {", "private unregisterKbDock(): void {");
const kbUnregister = sourceSection(indexSource, "private unregisterKbDock(): void {", "private cleanupSidebarDockInstance(): void {");
assert.match(sidebarUnregister, /!this\.sidebarDockRegistered \|\| !supportsDynamicDock\(this\)/);
assert.match(sidebarUnregister, /this\.removeDock\(DOCK_TYPE\)/);
assert.match(sidebarUnregister, /this\.cleanupSidebarDockInstance\(\)[\s\S]*?this\.sidebarDockRegistered = false/);
assert.match(kbUnregister, /!this\.kbDockRegistered \|\| !supportsDynamicDock\(this\)/);
assert.match(kbUnregister, /this\.kbDockInitGeneration \+= 1[\s\S]*?this\.removeDock\(KB_DOCK_TYPE\)/);
assert.match(kbUnregister, /this\.cleanupKbDockInstance\(\)[\s\S]*?this\.kbDockRegistered = false/);
assert.doesNotMatch(`${sidebarUnregister}\n${kbUnregister}`, /querySelector|\.remove\(|dockRight|dockLeft|dockBottom|dock__item/);

const sidebarCleanup = sourceSection(indexSource, "private cleanupSidebarDockInstance(): void {", "private cleanupKbDockInstance(): void {");
const kbCleanup = sourceSection(indexSource, "private cleanupKbDockInstance(): void {", "private registerDock() {");
assert.match(sidebarCleanup, /this\.sidebarDockInstance = null[\s\S]*?unmount\(instance\)/);
assert.match(kbCleanup, /this\.kbDockInitGeneration \+= 1[\s\S]*?this\.kbDockInstance = null[\s\S]*?unmount\(instance\)/);

const sidebarRegistration = sourceSection(indexSource, "private registerDock() {", "private registerKbDock() {");
const kbRegistration = sourceSection(indexSource, "private registerKbDock() {", "// 校验并规范化 docId");
assert.match(sidebarRegistration, /if \(this\.sidebarDockRegistered\) return/);
assert.match(sidebarRegistration, /id: DOCK_TYPE[\s\S]*?type: DOCK_TYPE/);
assert.match(sidebarRegistration, /this\.cleanupSidebarDockInstance\(\)[\s\S]*?destroy: \(\) => this\.cleanupSidebarDockInstance\(\)/);
assert.match(kbRegistration, /if \(this\.kbDockRegistered\) return/);
assert.match(kbRegistration, /id: KB_DOCK_TYPE[\s\S]*?type: KB_DOCK_TYPE/);
assert.match(kbRegistration, /this\.cleanupKbDockInstance\(\)[\s\S]*?this\.kbDockInitGeneration === initGeneration/);
assert.match(kbRegistration, /destroy: \(\) => this\.cleanupKbDockInstance\(\)/);
assert.match(kbRegistration, /config\.aiKbDockEnabled === false/);

const unload = sourceSection(indexSource, "async onunload() {", "updateProtyleToolbar(toolbar");
assert.match(unload, /this\.cleanupSidebarDockInstance\(\)/);
assert.match(unload, /this\.cleanupKbDockInstance\(\)/);
assert.doesNotMatch(unload, /removeDock\(/);

const openKbDock = sourceSection(indexSource, "public async openKbDock(): Promise<boolean> {", "private sanitizeDocId(value: unknown)");
assert.match(openKbDock, /if \(this\.isMobileFrontend\(\)[\s\S]*?this\.openMobileKbChat\(\)[\s\S]*?return true/);
assert.match(openKbDock, /config\.aiKbDockEnabled === false[\s\S]*?return false/);
assert.match(openKbDock, /if \(!this\.kbDockRegistered\) \{\s*this\.registerKbDock\(\);/);
assert.match(openKbDock, /await this\.waitForKbDockButton\(\)/);
assert.equal((indexSource.match(/const DOCK_TYPE = "homepage_dock";/) ?? []).length, 1);
assert.equal((indexSource.match(/const KB_DOCK_TYPE = "homepage_kb_dock";/) ?? []).length, 1);

console.log("SiYuan plugin API compatibility verification passed (A-H)");
