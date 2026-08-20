import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
assert.doesNotMatch(homepageSettingSource, /syncDesktopDraftFromPersistedConfig/);
assert.equal(
    homepageSettingSource.match(/\bapplyDesktopDraftFromPersistedConfig\(/g)?.length,
    3,
    "桌面草稿 mapper 必须由声明、初次加载和 partial 回读共同复用",
);
assert.match(
    homepageSettingSource,
    /const layoutSettings = await loadWidgetLayoutSettings\(plugin\);[\s\S]{0,600}applyDesktopDraftFromPersistedConfig\(savedConfig, layoutSettings\)/,
    "初次加载必须在读取 layout 后调用共享桌面草稿 mapper",
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

console.log(`Homepage settings experience verified: ${registry.length} searchable entries.`);
