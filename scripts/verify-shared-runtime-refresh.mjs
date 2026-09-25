import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const indexSource = await readFile(resolve(root, "src/index.ts"), "utf8");

function sourceSection(startMarker, endMarker) {
    const start = indexSource.indexOf(startMarker);
    const end = indexSource.indexOf(endMarker, start + startMarker.length);
    assert(start >= 0, `missing source marker: ${startMarker}`);
    assert(end > start, `missing source end marker: ${endMarker}`);
    return indexSource.slice(start, end);
}

const methods = [
    sourceSection("public override onDataChanged(reason?: TPluginDataChangeReason): void {", "private ensureDeviceIdentityForRuntime()"),
    sourceSection("private scheduleHomepageSharedRuntimeRefresh(reason: string): void {", "private async performHomepageSharedRuntimeRefresh("),
    sourceSection("private async performHomepageSharedRuntimeRefresh(", "private disposeHomepageSharedRuntimeRefresh(): void {"),
    sourceSection("private disposeHomepageSharedRuntimeRefresh(): void {", "private syncHomepageConfigDependentListeners("),
    sourceSection("private syncTaskEditorContentMenu(enabled: boolean): void {", "private registerMinimalHomepageEntry(): void {"),
    sourceSection("private syncKbDockEnabled(enabled: boolean): void {", "/** 仅同步旧快照"),
    sourceSection("private stopSelectionAiPremiumRuntime(): void {", "private async startSelectionAiPremiumRuntime(): Promise<void> {"),
    sourceSection("private syncKbTopBarEnabled(enabled: boolean): void {", "private removeExistingTopBar("),
];
const fixtureSource = [
    `
const HOMEPAGE_SHARED_RUNTIME_REFRESH_DEBOUNCE_MS = 400;
const HOMEPAGE_SHARED_SETTINGS_EXTERNAL_CHANGE_EVENT = "homepage-shared-settings-external-change";
const KB_CHAT_TOPBAR_ID = "siyuan-homepage-kb-chat";
const window = {
    setTimeout(callback, delay) { return globalThis.__sharedRuntimeSupport.setTimeout(callback, delay); },
    clearTimeout(id) { globalThis.__sharedRuntimeSupport.clearTimeout(id); },
    dispatchEvent(event) { globalThis.__sharedRuntimeSupport.events.push(event.type); },
};
class CustomEvent { constructor(type) { this.type = type; } }
const console = {
    debug(...args) { globalThis.__sharedRuntimeSupport.debug.push(args); },
    warn(...args) { globalThis.__sharedRuntimeSupport.warnings.push(args); },
};
const readHomepageSharedSettingsSnapshot = () => globalThis.__sharedRuntimeSupport.readSnapshot();
const setSelectionAiToolbarSettingsSnapshot = (value) => {
    globalThis.__sharedRuntimeSupport.selectionSetterCalls.push(value);
    globalThis.__sharedRuntimeSupport.selectionSettings = value;
};
const getSelectionAiToolbarSettingsSnapshot = () => globalThis.__sharedRuntimeSupport.selectionSettings;
const createSelectionAiToolbarItems = ({ settings }) => settings.skills
    .filter((skill) => skill.enabled)
    .map((skill) => ({ name: "selection-" + skill.id }));
const supportsDynamicToolbar = (plugin) => typeof plugin.addToolbarItem === "function"
    && typeof plugin.removeToolbarItem === "function";
const isHomepageEntitlementGranted = () => globalThis.__sharedRuntimeSupport.entitled;
const initSelectionAiToolbarPointerTracker = () => {};
const destroySelectionAiToolbarPointerTracker = () => {};
const destroySelectionAiPopup = () => {};
const destroySelectionAiActionMenu = () => {};

class SharedRuntimeFixture {
    homepageEntitlementDisposed = false;
    homepageSharedRuntimeRefreshTimer = null;
    homepageSharedRuntimeRefreshInFlight = false;
    homepageSharedRuntimeRefreshPending = false;
    homepageSharedRuntimeRefreshGeneration = 0;
    homepageSharedRuntimeRefreshDisposed = false;
    mobileQuickActionsRefreshes = [];
    mobileQuickActions = false;
    contentMenuListenerRegistered = false;
    contentMenuEventBindThis = () => {};
    eventBus = {
        on: (name) => globalThis.__sharedRuntimeSupport.menuEvents.push("on:" + name),
        off: (name) => globalThis.__sharedRuntimeSupport.menuEvents.push("off:" + name),
    };
    kbDockRegistered = false;
    kbTopBarElement = null;
    selectionAiToolbarItemNames = new Set();
    addToolbarItem(item) { globalThis.__sharedRuntimeSupport.toolbarAdds.push(item.name); }
    removeToolbarItem(name) { globalThis.__sharedRuntimeSupport.toolbarRemoves.push(name); }
    isMobileFrontend() { return globalThis.__sharedRuntimeSupport.mobile; }
    isNewWindow() { return false; }
    scheduleHomepageEntitlementExternalRefresh(reason) {
        globalThis.__sharedRuntimeSupport.entitlementRefreshes.push(reason);
    }
    scheduleMobileQuickActionsRefresh(reason) {
        globalThis.__sharedRuntimeSupport.mobileQuickActionsRefreshes.push(reason);
    }
    syncSidebarDockEnabled(enabled) {
        globalThis.__sharedRuntimeSupport.sidebarSyncCalls.push(enabled);
    }
    registerKbDock() {
        if (this.kbDockRegistered) return;
        this.kbDockRegistered = true;
        globalThis.__sharedRuntimeSupport.kbDockAdds += 1;
    }
    unregisterKbDock() {
        if (!this.kbDockRegistered || !globalThis.__sharedRuntimeSupport.modernHost) return;
        this.kbDockRegistered = false;
        globalThis.__sharedRuntimeSupport.kbDockRemoves += 1;
    }
    removeExistingTopBar(kind) {
        globalThis.__sharedRuntimeSupport.topBarRemoves.push(kind);
    }
    addTopBar(options) {
        globalThis.__sharedRuntimeSupport.topBarAdds.push(options.id);
        return { dataset: {} };
    }
${methods.join("\n")}
}
export { SharedRuntimeFixture };
`,
].join("\n");

const bundled = await build({
    stdin: {
        contents: fixtureSource,
        loader: "ts",
        resolveDir: root,
        sourcefile: "verify-shared-runtime-refresh.ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    logLevel: "silent",
});
const { SharedRuntimeFixture } = await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`,
);

function createFixture({
    readSnapshot = async () => ({ revision: 1, updatedAt: "one", config: {} }),
    mobile = false,
    entitled = true,
    modernHost = true,
    kbDockRegistered = false,
    contentMenuListenerRegistered = false,
    selectionSettings = { enabled: true, skills: [{ id: "ask", enabled: true }] },
} = {}) {
    let nextTimerId = 1;
    const support = {
        timers: new Map(),
        timerDelays: [],
        clearedTimers: [],
        events: [],
        debug: [],
        warnings: [],
        entitlementRefreshes: [],
        menuEvents: [],
        kbDockAdds: 0,
        kbDockRemoves: 0,
        topBarAdds: [],
        topBarRemoves: [],
        toolbarAdds: [],
        toolbarRemoves: [],
        selectionSetterCalls: [],
        mobileQuickActionsRefreshes: [],
        sidebarSyncCalls: [],
        autoOpenCalls: [],
        readSnapshot,
        mobile,
        entitled,
        modernHost,
        selectionSettings,
        setTimeout(callback, delay) {
            const id = nextTimerId++;
            this.timers.set(id, callback);
            this.timerDelays.push(delay);
            return id;
        },
        clearTimeout(id) {
            this.clearedTimers.push(id);
            this.timers.delete(id);
        },
    };
    globalThis.__sharedRuntimeSupport = support;
    const runtime = new SharedRuntimeFixture();
    runtime.kbDockRegistered = kbDockRegistered;
    runtime.contentMenuListenerRegistered = contentMenuListenerRegistered;
    return { runtime, support };
}

async function runNextTimer(fixture) {
    const entry = fixture.support.timers.entries().next().value;
    assert(entry, "expected a scheduled timer");
    fixture.support.timers.delete(entry[0]);
    entry[1]();
    await settleRefresh(fixture.runtime);
}

async function settleRefresh(runtime) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        if (!runtime.homepageSharedRuntimeRefreshInFlight && !runtime.homepageSharedRuntimeRefreshPending) return;
    }
    assert.fail("shared runtime refresh did not settle");
}

const snapshot = (config, revision = 1) => ({
    revision,
    updatedAt: String(revision),
    config,
});

// A-B: sync/overwrite retain existing notifications and debounce into the shared refresh.
{
    const fixture = createFixture({ readSnapshot: async () => snapshot({ taskEditorEnabled: true }) });
    fixture.runtime.onDataChanged("sync");
    fixture.runtime.onDataChanged("overwrite");
    assert.deepEqual(fixture.support.entitlementRefreshes, ["sync", "overwrite"]);
    assert.deepEqual(fixture.support.events, [
        "homepage-shared-settings-external-change",
        "homepage-shared-settings-external-change",
    ]);
    assert.equal(fixture.support.clearedTimers.length, 1);
    assert.equal(fixture.support.timers.size, 1);
    assert.deepEqual(fixture.support.timerDelays, [400, 400]);
    await runNextTimer(fixture);
    assert.deepEqual(fixture.support.menuEvents, ["on:open-menu-content"]);
}

// C: unsupported reasons do not schedule any refresh; undefined remains supported.
{
    const fixture = createFixture();
    fixture.runtime.onDataChanged("load");
    assert.equal(fixture.support.entitlementRefreshes.length, 0);
    assert.equal(fixture.support.events.length, 0);
    assert.equal(fixture.support.timers.size, 0);
    fixture.runtime.onDataChanged();
    assert.deepEqual(fixture.support.entitlementRefreshes, ["unknown"]);
    assert.equal(fixture.support.events.length, 1);
    assert.equal(fixture.support.timers.size, 1);
}

function assertNoRuntimeMutation(fixture) {
    assert.equal(fixture.runtime.contentMenuListenerRegistered, true);
    assert.equal(fixture.runtime.kbDockRegistered, true);
    assert.notEqual(fixture.runtime.kbTopBarElement, null);
    assert.deepEqual(fixture.runtime.selectionAiToolbarItemNames, new Set(["selection-ask"]));
    assert.deepEqual(fixture.support.menuEvents, []);
    assert.equal(fixture.support.kbDockAdds + fixture.support.kbDockRemoves, 0);
    assert.deepEqual(fixture.support.topBarAdds, []);
    assert.deepEqual(fixture.support.topBarRemoves, []);
    assert.equal(fixture.support.selectionSetterCalls.length, 0);
    assert.deepEqual(fixture.support.toolbarAdds, []);
    assert.deepEqual(fixture.support.toolbarRemoves, []);
}

// D-E: absent and unreadable shared snapshots preserve all current runtime state.
for (const [readSnapshot, expectedWarnings] of [
    [async () => null, 0],
    [async () => { throw new Error("corrupt snapshot"); }, 1],
]) {
    const fixture = createFixture({ readSnapshot, kbDockRegistered: true, contentMenuListenerRegistered: true });
    fixture.runtime.kbTopBarElement = { dataset: {} };
    fixture.runtime.selectionAiToolbarItemNames = new Set(["selection-ask"]);
    await fixture.runtime.performHomepageSharedRuntimeRefresh();
    assertNoRuntimeMutation(fixture);
    assert.equal(fixture.support.warnings.length, expectedWarnings);
}

// F-H: only an explicit boolean key changes KB Dock state; missing keys preserve it.
{
    const disabled = createFixture({ readSnapshot: async () => snapshot({ aiKbDockEnabled: false }), kbDockRegistered: true });
    await disabled.runtime.performHomepageSharedRuntimeRefresh();
    assert.equal(disabled.runtime.kbDockRegistered, false);
    assert.equal(disabled.support.kbDockRemoves, 1);

    const enabled = createFixture({ readSnapshot: async () => snapshot({ aiKbDockEnabled: true }) });
    await enabled.runtime.performHomepageSharedRuntimeRefresh();
    assert.equal(enabled.runtime.kbDockRegistered, true);
    assert.equal(enabled.support.kbDockAdds, 1);

    const missing = createFixture({ readSnapshot: async () => snapshot({}), kbDockRegistered: true });
    await missing.runtime.performHomepageSharedRuntimeRefresh();
    assert.equal(missing.runtime.kbDockRegistered, true);
    assert.equal(missing.support.kbDockRemoves, 0);
}

// I-J: KB TopBar and task editor content-menu listener update independently by field.
{
    const disabled = createFixture({
        readSnapshot: async () => snapshot({ aiKbTabEnabled: false, taskEditorEnabled: false }),
        contentMenuListenerRegistered: true,
    });
    disabled.runtime.kbTopBarElement = { dataset: {} };
    await disabled.runtime.performHomepageSharedRuntimeRefresh();
    assert.equal(disabled.runtime.contentMenuListenerRegistered, false);
    assert.equal(disabled.runtime.kbTopBarElement, null);
    assert.deepEqual(disabled.support.menuEvents, ["off:open-menu-content"]);
    assert.deepEqual(disabled.support.topBarRemoves, ["kb-chat"]);

    const enabled = createFixture({ readSnapshot: async () => snapshot({ aiKbTabEnabled: true, taskEditorEnabled: true }) });
    await enabled.runtime.performHomepageSharedRuntimeRefresh();
    assert.equal(enabled.runtime.contentMenuListenerRegistered, true);
    assert.notEqual(enabled.runtime.kbTopBarElement, null, JSON.stringify({
        adds: enabled.support.topBarAdds,
        removes: enabled.support.topBarRemoves,
        warnings: enabled.support.warnings,
        menuEvents: enabled.support.menuEvents,
        selectionSetterCalls: enabled.support.selectionSetterCalls,
    }));
    assert.deepEqual(enabled.support.menuEvents, ["on:open-menu-content"]);
    assert.deepEqual(enabled.support.topBarAdds, ["siyuan-homepage-kb-chat"]);
}

// K-M: Selection AI uses the present settings snapshot, respects entitlement, and ignores a missing key.
{
    const disabled = createFixture({
        readSnapshot: async () => snapshot({ selectionAiToolbar: { enabled: false, skills: [{ id: "ask", enabled: true }] } }),
    });
    disabled.runtime.selectionAiToolbarItemNames = new Set(["selection-ask"]);
    await disabled.runtime.performHomepageSharedRuntimeRefresh();
    assert.equal(disabled.support.selectionSetterCalls.length, 1);
    assert.deepEqual(disabled.support.toolbarRemoves, ["selection-ask"]);
    assert.equal(disabled.runtime.selectionAiToolbarItemNames.size, 0);

    const enabled = createFixture({ readSnapshot: async () => snapshot({ selectionAiToolbar: { enabled: true, skills: [{ id: "ask", enabled: true }] } }) });
    await enabled.runtime.performHomepageSharedRuntimeRefresh();
    assert.deepEqual(enabled.support.toolbarAdds, ["selection-ask"]);

    const gated = createFixture({
        readSnapshot: async () => snapshot({ selectionAiToolbar: { enabled: true, skills: [{ id: "ask", enabled: true }] } }),
        entitled: false,
    });
    await gated.runtime.performHomepageSharedRuntimeRefresh();
    assert.deepEqual(gated.support.toolbarAdds, []);

    const missing = createFixture();
    missing.runtime.selectionAiToolbarItemNames = new Set(["selection-ask"]);
    await missing.runtime.performHomepageSharedRuntimeRefresh();
    assert.equal(missing.support.selectionSetterCalls.length, 0);
    assert.deepEqual(missing.runtime.selectionAiToolbarItemNames, new Set(["selection-ask"]));
}

// N-O: mobile schedules the existing quick-action refresh, desktop does not; Auto Open never runs here.
{
    const mobile = createFixture({
        mobile: true,
        readSnapshot: async () => snapshot({ mobileAutoOpenEnabled: true, mobileAutoOpenTarget: "kb" }),
    });
    await mobile.runtime.performHomepageSharedRuntimeRefresh();
    assert.deepEqual(mobile.support.mobileQuickActionsRefreshes, ["sync"]);
    assert.deepEqual(mobile.support.autoOpenCalls, []);

    const desktop = createFixture({ readSnapshot: async () => snapshot({ mobileQuickActionsEnabled: false }) });
    await desktop.runtime.performHomepageSharedRuntimeRefresh();
    assert.deepEqual(desktop.support.mobileQuickActionsRefreshes, []);
}

// P: changes received during a read coalesce into one immediate follow-up using the newest snapshot.
{
    let finishFirstRead;
    let reads = 0;
    const fixture = createFixture({ readSnapshot: () => {
        reads += 1;
        return reads === 1
            ? new Promise((resolve) => { finishFirstRead = resolve; })
            : Promise.resolve(snapshot({ taskEditorEnabled: false }, 2));
    } });
    const firstRead = fixture.runtime.performHomepageSharedRuntimeRefresh();
    await Promise.resolve();
    fixture.runtime.scheduleHomepageSharedRuntimeRefresh("sync");
    assert.equal(fixture.runtime.homepageSharedRuntimeRefreshPending, true);
    finishFirstRead(snapshot({ taskEditorEnabled: true }, 1));
    await firstRead;
    await settleRefresh(fixture.runtime);
    assert.equal(reads, 2);
    assert.deepEqual(fixture.support.menuEvents, ["on:open-menu-content", "off:open-menu-content"]);
    assert.equal(fixture.runtime.homepageSharedRuntimeRefreshPending, false);
}

// Q: unload invalidates an in-flight read and clears scheduled work before it can mutate runtimes.
{
    let finishRead;
    const fixture = createFixture({
        readSnapshot: () => new Promise((resolve) => { finishRead = resolve; }),
        kbDockRegistered: true,
        contentMenuListenerRegistered: true,
    });
    fixture.runtime.kbTopBarElement = { dataset: {} };
    fixture.runtime.selectionAiToolbarItemNames = new Set(["selection-ask"]);
    fixture.runtime.onDataChanged("sync");
    const timerId = fixture.runtime.homepageSharedRuntimeRefreshTimer;
    const pendingRead = fixture.runtime.performHomepageSharedRuntimeRefresh();
    await Promise.resolve();
    fixture.runtime.homepageSharedRuntimeRefreshPending = true;
    fixture.runtime.disposeHomepageSharedRuntimeRefresh();
    assert.equal(fixture.runtime.homepageSharedRuntimeRefreshTimer, null);
    assert.equal(fixture.runtime.homepageSharedRuntimeRefreshPending, false);
    assert.ok(fixture.support.clearedTimers.includes(timerId));
    finishRead(snapshot({ aiKbDockEnabled: false, aiKbTabEnabled: false, taskEditorEnabled: false }, 3));
    await pendingRead;
    await settleRefresh(fixture.runtime);
    assertNoRuntimeMutation(fixture);
}

// R: the refresh is read-only and remains isolated from Homepage/Device View/Quick Notes lifecycle.
const performRefresh = sourceSection(
    "private async performHomepageSharedRuntimeRefresh(",
    "private disposeHomepageSharedRuntimeRefresh(): void {",
);
const onDataChanged = sourceSection(
    "public override onDataChanged(reason?: TPluginDataChangeReason): void {",
    "private ensureDeviceIdentityForRuntime()",
);
const unload = sourceSection("async onunload() {", "updateProtyleToolbar(toolbar");
assert.match(performRefresh, /readHomepageSharedSettingsSnapshot\(this\)/);
assert.match(performRefresh, /Object\.prototype\.hasOwnProperty\.call\(config, key\)/);
assert.match(performRefresh, /snapshot === null/);
assert.match(performRefresh, /this\.syncKbDockEnabled\(/);
assert.match(performRefresh, /this\.syncKbTopBarEnabled\(/);
assert.match(performRefresh, /this\.syncTaskEditorContentMenu\(/);
assert.match(performRefresh, /setSelectionAiToolbarSettingsSnapshot\(config\.selectionAiToolbar\)[\s\S]*?this\.syncSelectionAiPremiumRuntime\(\)/);
assert.match(performRefresh, /this\.scheduleMobileQuickActionsRefresh\("sync"\)/);
assert.doesNotMatch(performRefresh, /sidebarEnabled|syncSidebarDockEnabled|syncHomepageDocks|initializeHomepageSurface|recoverDeviceViewRuntimeAfterIdentityReady|handleHomepageSettingsSaved|loadHomepageConfigDataStrict|saveHomepageSharedSettings|saveData\(|writeJson|openMobile|openQuickNotes|setQuickNoteConfigLoader|syncRobotAgentRuntimeConfig|syncRobotQuickNoteLegacySnapshot|startAutomationRuntime/);
assert.match(onDataChanged, /scheduleHomepageEntitlementExternalRefresh/);
assert.match(onDataChanged, /HOMEPAGE_SHARED_SETTINGS_EXTERNAL_CHANGE_EVENT/);
assert.match(onDataChanged, /scheduleHomepageSharedRuntimeRefresh/);
assert.match(unload, /disposeHomepageSharedRuntimeRefresh\(\)/);
assert.match(indexSource, /private async refreshMobileQuickActionsFromSharedConfig\([\s\S]*?"local-save" \| "sync"/);
assert.match(indexSource, /private scheduleMobileQuickActionsRefresh\(reason: "visibility" \| "focus" \| "sync"\)/);
assert.match(indexSource, /private syncHomepageDocks\(config: PluginConfig\): void \{[\s\S]*?syncSidebarDockEnabled[\s\S]*?syncKbDockEnabled/);

console.log("shared runtime refresh verification passed (A-R)");
