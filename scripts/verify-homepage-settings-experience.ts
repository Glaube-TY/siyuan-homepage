import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLatestWinsAsyncQueue } from "../src/utils/async/latestWinsAsyncQueue";
import { AI_KNOWLEDGE_BASE_SUB_TABS } from "../src/homepage/homepageSetting/aiKnowledgeBaseTabs";
import { NOTIFICATION_CENTER_SUB_TABS } from "../src/homepage/homepageSetting/notificationCenterTabs";
import { ROBOT_ASSISTANT_SUB_TABS } from "../src/homepage/homepageSetting/robotAssistantTabs";
import {
    SETTING_SCOPE_LABELS,
    getHomepageSettingSearchRegistry,
    searchHomepageSettings,
} from "../src/homepage/homepageSetting/settingsExperience";
import { mainTabs, subTabs } from "../src/homepage/homepageSetting/tabDefs";

const registry = getHomepageSettingSearchRegistry();
assert.ok(registry.length >= 80, "设置搜索注册表必须覆盖主要设置项");

const ids = registry.map((entry) => entry.id);
assert.equal(new Set(ids).size, ids.length, "设置搜索注册 id 必须唯一");

const mainTabKeys = new Set(mainTabs.map((tab) => tab.key));
const subTabKeys = {
    homepage: new Set(subTabs.map((tab) => tab.key)),
    aiKnowledgeBase: new Set(AI_KNOWLEDGE_BASE_SUB_TABS.map((tab) => tab.id)),
    notifyBridge: new Set(NOTIFICATION_CENTER_SUB_TABS.map((tab) => tab.id)),
    robotAssistant: new Set(ROBOT_ASSISTANT_SUB_TABS.map((tab) => tab.id)),
} as const;

for (const entry of registry) {
    assert.ok(mainTabKeys.has(entry.mainTab), `设置 ${entry.id} 的一级页签无效`);
    if (entry.subTab && entry.mainTab in subTabKeys) {
        const allowed = subTabKeys[entry.mainTab as keyof typeof subTabKeys] as ReadonlySet<string>;
        assert.ok(allowed.has(entry.subTab), `设置 ${entry.id} 的二级页签无效`);
    }
    assert.ok(
        searchHomepageSettings(entry.title, registry.length).some((result) => result.id === entry.id),
        `设置 ${entry.id} 必须能通过标题搜索到`,
    );
}

for (const scopeLabel of Object.values(SETTING_SCOPE_LABELS)) {
    assert.ok(searchHomepageSettings(scopeLabel, registry.length).length > 0, `作用域“${scopeLabel}”必须可搜索`);
}

assert.equal(searchHomepageSettings("__definitely_missing_setting__").length, 0);
assert.ok(searchHomepageSettings("横幅").some((entry) => entry.mainTab === "homepage" && entry.subTab === "banner"));
assert.ok(searchHomepageSettings("划词").some((entry) => entry.mainTab === "aiKnowledgeBase" && entry.subTab === "selection"));
assert.ok(searchHomepageSettings("机器人").some((entry) => entry.mainTab === "robotAssistant"));
assert.ok(searchHomepageSettings("通知").some((entry) => entry.mainTab === "notifyBridge"));

const kbSettingsPanelSource = readFileSync(
    "src/features/kb/components/panels/kb-settings-panel.svelte",
    "utf8",
);
const homepageSettingSource = readFileSync(
    "src/homepage/homepageSetting/homepageSetting.svelte",
    "utf8",
);
const titleSettingsTabSource = readFileSync(
    "src/homepage/homepageSetting/tabs/TitleSettingsTab.svelte",
    "utf8",
);
assert.match(
    titleSettingsTabSource,
    /const effectiveTopLayoutForSettings = \$derived\(\s*advancedEnabled\s*\?\s*tempHomepageTopLayout\s*:\s*DEFAULT_HOMEPAGE_TOP_LAYOUT,\s*\);/s,
    "Free settings must derive the displayed top layout from the default effective value",
);
for (const field of ["contentLayout", "bannerPosition", "primaryPosition", "bannerContent", "align"]) {
    assert.match(
        titleSettingsTabSource,
        new RegExp(`value=\\{effectiveTopLayoutForSettings\\.${field}\\}`),
        `Top-layout Select must display the effective ${field} value`,
    );
}
assert.match(
    titleSettingsTabSource,
    /const effectiveQuickButtonStyleForSettings = \$derived\(\s*advancedEnabled\s*\?\s*tempQuickButtonStyle\s*:\s*DEFAULT_QUICK_BUTTON_STYLE,\s*\);/s,
    "Free settings must derive the displayed quick-button style from the default effective value",
);
assert.match(
    titleSettingsTabSource,
    /value=\{effectiveQuickButtonStyleForSettings\}/,
    "Quick-button Select must display the effective value",
);
assert.doesNotMatch(
    titleSettingsTabSource,
    /value=\{tempHomepageTopLayout\.(?:contentLayout|bannerPosition|primaryPosition|bannerContent|align)\}/,
    "Top-layout Selects must not display the saved value directly",
);
assert.doesNotMatch(
    titleSettingsTabSource,
    /value=\{tempQuickButtonStyle\}/,
    "Quick-button Select must not display the saved value directly",
);
const homepageConfigLoaderSource = readFileSync("src/homepage/configLoader.ts", "utf8");
const bannerSaveStart = homepageConfigLoaderSource.indexOf("export async function saveBannerDisplaySettings");
const bannerSaveEnd = homepageConfigLoaderSource.indexOf("\nexport ", bannerSaveStart + 1);
const bannerSaveSource = homepageConfigLoaderSource.slice(
    bannerSaveStart,
    bannerSaveEnd === -1 ? undefined : bannerSaveEnd,
);
const bannerPersistStart = homepageConfigLoaderSource.indexOf("async function persistBannerDisplaySettings");
const bannerPersistEnd = homepageConfigLoaderSource.indexOf("\nexport ", bannerPersistStart + 1);
const bannerPersistSource = homepageConfigLoaderSource.slice(
    bannerPersistStart,
    bannerPersistEnd === -1 ? undefined : bannerPersistEnd,
);
assert.match(homepageConfigLoaderSource, /bannerDisplaySaveCoalescers/);
assert.match(homepageConfigLoaderSource, /createLatestWinsAsyncQueue/);
assert.match(homepageConfigLoaderSource, /scheduleBannerDisplaySaveDrain/);
assert.match(homepageConfigLoaderSource, /scheduleBannerDisplaySaveDrain[\s\S]*requestAnimationFrame[\s\S]*requestAnimationFrame[\s\S]*scheduleIdleTask/);
assert.match(bannerPersistSource, /ensureCurrentDeviceViewReady[\s\S]*updateDeviceViewSettings/);
assert.match(bannerSaveSource, /scheduleDrain:\s*scheduleBannerDisplaySaveDrain/);
assert.doesNotMatch(bannerSaveSource, /loadHomepageConfigDataStrict|readDeviceViewSettings|expectedRevision|putFile|saveData/);
assert.doesNotMatch(homepageSettingSource, /syncDesktopDraftFromPersistedConfig/);
assert.equal(
    homepageSettingSource.match(/\bapplyDesktopDraftFromPersistedConfig\(/g)?.length,
    3,
    "桌面草稿 mapper 必须由声明、初次加载和 partial 回读共同复用",
);
assert.match(
    homepageSettingSource,
    /const layoutSettingsPromise = loadWidgetLayoutSettings\(plugin\);[\s\S]{0,500}const \[savedConfig, mobileConfig, layoutSettings\] = await Promise\.all\(\[[\s\S]{0,500}applyDesktopDraftFromPersistedConfig\(savedConfig, layoutSettings\)/,
    "初次加载必须并行读取 layout 并调用共享桌面草稿 mapper",
);
assert.match(
    homepageSettingSource,
    /const layoutSettings = await loadWidgetLayoutSettings\(plugin\);[\s\S]{0,1000}applyDesktopDraftFromPersistedConfig\(reloaded, layoutSettings\)/,
    "partial 回读必须在读取 layout 后调用共享桌面草稿 mapper",
);
assert.ok(kbSettingsPanelSource.includes("modelOnly && settingsLoaded"), "主页模型设置必须启用自动保存");
assert.match(
    kbSettingsPanelSource,
    /\{#if !modelOnly\}[\s\S]*?<div class="settings-header">[\s\S]*?保存设置[\s\S]*?\{\/if\}/,
    "主页模型设置不应显示重复标题栏和手动保存按钮",
);

async function verifyLatestWinsSaveQueue(): Promise<void> {
    const scheduledDrains: Array<() => void> = [];
    const persisted: number[] = [];
    const queue = createLatestWinsAsyncQueue(
        async (value: number) => {
            persisted.push(value);
        },
        (_current, next) => next,
        { scheduleDrain: (drain) => scheduledDrains.push(drain) },
    );
    const scheduledRequests = [-20, -40, -80, -120].map((value) => queue.enqueue(value));
    assert.equal(scheduledDrains.length, 1, "调度中的 queue 只能登记一次 drain");
    assert.deepEqual(persisted, [], "scheduled drain 释放前不能启动持久化");
    const scheduledDrain = scheduledDrains.shift();
    assert.ok(scheduledDrain);
    scheduledDrain();
    await Promise.all(scheduledRequests);
    assert.deepEqual(persisted, [-120], "真正 drain 前的连续位置必须只保存最终值");

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
    });
    const inFlightDrains: Array<() => void> = [];
    const inFlightPersisted: number[] = [];
    const inFlightQueue = createLatestWinsAsyncQueue(
        async (value: number) => {
            inFlightPersisted.push(value);
            if (value === -20) await firstGate;
        },
        (_current, next) => next,
        { scheduleDrain: (drain) => inFlightDrains.push(drain) },
    );
    const first = inFlightQueue.enqueue(-20);
    const firstDrain = inFlightDrains.shift();
    assert.ok(firstDrain);
    firstDrain();
    assert.deepEqual(inFlightPersisted, [-20]);
    const pendingRequests = [-40, -80, -120].map((value) => inFlightQueue.enqueue(value));
    assert.equal(inFlightDrains.length, 0, "in-flight persist 期间不能直接启动下一笔");
    releaseFirst();
    await first;
    assert.deepEqual(inFlightPersisted, [-20]);
    const secondDrain = inFlightDrains.shift();
    assert.ok(secondDrain);
    secondDrain();
    await Promise.all(pendingRequests);
    assert.deepEqual(inFlightPersisted, [-20, -120], "in-flight 期间只应再保存最新 pending");

    const resetBeforeDrain: Array<() => void> = [];
    const resetBeforePersisted: number[] = [];
    const resetBeforeQueue = createLatestWinsAsyncQueue(
        async (value: number) => {
            resetBeforePersisted.push(value);
        },
        (_current, next) => next,
        { scheduleDrain: (drain) => resetBeforeDrain.push(drain) },
    );
    const oldDrag = resetBeforeQueue.enqueue(-120);
    const reset = resetBeforeQueue.enqueue(0);
    assert.deepEqual(resetBeforePersisted, []);
    const resetDrain = resetBeforeDrain.shift();
    assert.ok(resetDrain);
    resetDrain();
    await Promise.all([oldDrag, reset]);
    assert.deepEqual(resetBeforePersisted, [0], "scheduled drag 被重置时只能写入 0");

    const resetInFlightDrains: Array<() => void> = [];
    const resetInFlightPersisted: number[] = [];
    const resetInFlightQueue = createLatestWinsAsyncQueue(
        async (value: number) => {
            resetInFlightPersisted.push(value);
        },
        (_current, next) => next,
        { scheduleDrain: (drain) => resetInFlightDrains.push(drain) },
    );
    const activeReset = resetInFlightQueue.enqueue(0);
    const newDrag = resetInFlightQueue.enqueue(-100);
    const resetInFlightDrain = resetInFlightDrains.shift();
    assert.ok(resetInFlightDrain);
    resetInFlightDrain();
    await Promise.all([activeReset, newDrag]);
    assert.deepEqual(resetInFlightPersisted, [-100], "重置 pending 前的新拖动必须成为最终写入");

    const failureDrains: Array<() => void> = [];
    const failedPersisted: number[] = [];
    const failureQueue = createLatestWinsAsyncQueue(
        async (value: number) => {
            failedPersisted.push(value);
            if (value === 1) throw new Error("synthetic failure");
        },
        (_current, next) => next,
        { scheduleDrain: (drain) => failureDrains.push(drain) },
    );
    const failed = failureQueue.enqueue(1);
    const failedDrain = failureDrains.shift();
    assert.ok(failedDrain);
    failedDrain();
    const afterFailure = failureQueue.enqueue(2);
    await assert.rejects(failed, /synthetic failure/);
    assert.deepEqual(failedPersisted, [1]);
    const recoveryDrain = failureDrains.shift();
    assert.ok(recoveryDrain);
    recoveryDrain();
    await afterFailure;
    const later = failureQueue.enqueue(3);
    const laterDrain = failureDrains.shift();
    assert.ok(laterDrain);
    laterDrain();
    await later;
    assert.deepEqual(failedPersisted, [1, 2, 3], "失败批次不能阻塞后续重新调度");

    const immediatePersisted: number[] = [];
    const immediateQueue = createLatestWinsAsyncQueue(
        async (value: number) => {
            immediatePersisted.push(value);
        },
        (_current, next) => next,
    );
    const immediate = immediateQueue.enqueue(1);
    assert.deepEqual(immediatePersisted, [1], "默认 queue 仍应保持立即 drain 语义");
    await immediate;
}

await verifyLatestWinsSaveQueue();

console.log(`Homepage settings experience verified: ${registry.length} searchable entries.`);
