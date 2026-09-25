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
        contents: `export { removeTopBarWithFallback, supportsDynamicToolbar } from "./src/utils/siyuanPluginApiCompat";`,
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

console.log("SiYuan plugin API compatibility verification passed (A-F)");
