import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
    isPremiumBannerGlobalType,
    isPremiumDailyQuoteMode,
    isPremiumHeatmapCountType,
    isPremiumTimedateMode,
    isPremiumWeatherStyle,
    isPremiumWidgetType,
    PREMIUM_WIDGET_TYPES,
} from "../src/features/entitlement/homepage-premium-features";
import { getHomepageAgentWidgetDescriptor } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-catalog";
import { validateAndNormalizeHomepageWidgetPatch } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-adapters";
import { MOBILE_WIDGET_CATALOG } from "../src/homepage/mobileHomepage/mobile-widget-categories";
import { searchHomepageSettings } from "../src/homepage/homepageSetting/settingsExperience";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(repoRoot, "src");

function read(relativePath: string): string {
    return readFileSync(join(repoRoot, relativePath), "utf8");
}

function getPremiumSectionSource(source: string, title: string): string {
    const start = source.indexOf(`<SettingSection title="${title}"`);
    assert(start >= 0, `${title} SettingSection 不存在`);
    const openingEnd = source.indexOf(">", start);
    assert(openingEnd >= 0, `${title} SettingSection 开始标签不完整`);
    assert.match(source.slice(start, openingEnd + 1), /\bpremium(?:=|\s|>)/, `${title} SettingSection 必须标记 Premium`);
    const end = source.indexOf("</SettingSection>", openingEnd);
    assert(end >= 0, `${title} SettingSection 未闭合`);
    return source.slice(start, end);
}

function assertPremiumSectionHasNoPremiumRows(source: string, title: string): void {
    assert.doesNotMatch(
        getPremiumSectionSource(source, title),
        /<SettingRow[^>]*\bpremium(?:=|\s|>)/,
        `${title} 的子 SettingRow 不应重复 PremiumMark`,
    );
}

function collectSourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? collectSourceFiles(path) : /\.(?:svelte|ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
    });
}

const allRuntimeSource = collectSourceFiles(srcRoot)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
assert.doesNotMatch(allRuntimeSource, /👑/, "src 运行时代码不得使用 👑 作为会员标识");

const premiumMarkSource = read("src/components/utils/shared/PremiumMark.svelte");
assert.match(premiumMarkSource, /SiyuanIcon/);
assert.match(premiumMarkSource, /name="vip"/);
assert.match(premiumMarkSource, /aria-label="高级会员专属"/);
assert.doesNotMatch(premiumMarkSource, /title=/);
assert.doesNotMatch(premiumMarkSource, /Crown|👑/);

const settingRowSource = read("src/libs/components/SettingRow.svelte");
const settingSectionSource = read("src/libs/components/SettingSection.svelte");
assert.match(settingRowSource, /premium\?: boolean/);
assert.match(settingRowSource, /PremiumMark/);
assert.match(settingRowSource, /data-homepage-setting-title=\{title\}/);
assert.match(settingSectionSource, /premium\?: boolean/);
assert.match(settingSectionSource, /PremiumMark/);
assert.match(settingSectionSource, /data-homepage-setting-section=\{title\}/);

const searchSource = read("src/homepage/homepageSetting/settingsExperience.ts");
const mobileCatalogSource = read("src/homepage/mobileHomepage/mobile-widget-categories.ts");
const subTabSource = read("src/homepage/homepageSetting/tabDefs.ts");
const subTabNavSource = read("src/homepage/homepageSetting/layout/SubTabNav.svelte");
const aiTabsSource = read("src/homepage/homepageSetting/aiKnowledgeBaseTabs.ts");
const aiSubTabNavSource = read("src/homepage/homepageSetting/layout/AiKnowledgeBaseSubTabNav.svelte");
const notificationTabsSource = read("src/homepage/homepageSetting/notificationCenterTabs.ts");
const notificationSubTabNavSource = read("src/homepage/homepageSetting/layout/NotificationCenterSubTabNav.svelte");
const robotTabsSource = read("src/homepage/homepageSetting/robotAssistantTabs.ts");
const robotSubTabNavSource = read("src/homepage/homepageSetting/layout/RobotAssistantSubTabNav.svelte");
const appearanceSource = read("src/homepage/homepageSetting/tabs/AppearanceSettingsTab.svelte");
const templateCenterSource = read("src/homepage/features/templateCenter/TemplateCenterDialog.svelte");
const titleSettingsSource = read("src/homepage/homepageSetting/tabs/TitleSettingsTab.svelte");
const stylesSettingsSource = read("src/homepage/homepageSetting/tabs/StylesSettingsTab.svelte");
const mobileSettingsSource = read("src/homepage/homepageSetting/tabs/MobileSettingsTab.svelte");
const widgetsSettingsSource = read("src/homepage/homepageSetting/tabs/WidgetsSettingsTab.svelte");
const aiSettingsSource = read("src/homepage/homepageSetting/tabs/AiKnowledgeBaseSettingsTab.svelte");
const favoritesSource = read("src/components/utils/widgetBlock/widget/favorites/favoritesSet.svelte");
const vipSectionSource = read("src/homepage/homepageSetting/sections/VipSection.svelte");
const heatmapRuntimeSource = read("src/components/utils/widgetBlock/widget/heatmap/heatmap.svelte");
const agentAdapterSource = read("src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-adapters.ts");
const premiumSelectSource = read("src/components/utils/shared/PremiumSelect.svelte");
const contentSettingStyleSource = read("src/components/utils/widgetBlock/contentSettingStyle/contentSetting.scss");
const buttonRegistrySource = read("src/homepage/buttonRegistry.ts");
const buttonSettingsSource = read("src/homepage/homepageSetting/tabs/ButtonSettingsTab.svelte");
const countdownEventEditorSource = read("src/features/countdown-center/components/CountdownEventEditor.svelte");
const countdownCenterDialogSource = read("src/features/countdown-center/components/CountdownCenterDialog.svelte");
const notificationSettingsSource = read("src/homepage/homepageSetting/tabs/NotificationCenterSettingsTab.svelte");
const favoritesSettingsSource = read("src/components/utils/widgetBlock/widget/favorites/favoritesSet.svelte");
const homepageIndexSource = read("src/index.ts");
const automationRuntimeSource = read("src/features/agent-platform/automation/automation-runtime.ts");
const automationControlSource = read("src/features/agent-platform/automation/automation-control.ts");
assert.match(searchSource, /requiresAdvanced\?: boolean/);
assert.match(mobileCatalogSource, /requiresAdvanced: boolean/);
assert.match(mobileCatalogSource, /requiresAdvanced: isPremiumWidgetType\(item\.type\)/);
assert.match(subTabSource, /requiresAdvanced\?: boolean/);
assert.match(subTabNavSource, /tab\.requiresAdvanced/);
assert.match(subTabNavSource, /PremiumMark/);
assert.match(subTabSource, /key: "aiKnowledgeBase", label: "AI 中心", requiresAdvanced: true/);
for (const source of [aiTabsSource, notificationTabsSource, robotTabsSource]) {
    assert.match(source, /requiresAdvanced\?: boolean/);
    assert.match(source, /requiresAdvanced: true/);
}
for (const source of [aiSubTabNavSource, notificationSubTabNavSource, robotSubTabNavSource]) {
    assert.match(source, /advancedEnabled: boolean/);
    assert.match(source, /tab\.requiresAdvanced/);
    assert.match(source, /class:locked/);
    assert.match(source, /PremiumMark/);
}
for (const source of [subTabSource, searchSource, mobileCatalogSource]) {
    assert.doesNotMatch(source, /👑|（会员）|会员专属|VIP 专属/);
}

const normalPresentationFiles = [
    "src/homepage/homepageSetting/tabs/AppearanceSettingsTab.svelte",
    "src/homepage/features/templateCenter/TemplateCenterDialog.svelte",
    "src/homepage/homepageSetting/tabDefs.ts",
    "src/homepage/homepageSetting/settingsExperience.ts",
    "src/homepage/mobileHomepage/mobile-widget-categories.ts",
    "src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteSet.svelte",
    "src/components/utils/widgetBlock/widget/timedate/timedateSet.svelte",
    "src/components/utils/widgetBlock/widget/weather/weatherSet.svelte",
    "src/components/utils/widgetBlock/widget/heatmap/heatmapSet.svelte",
    "src/components/utils/widgetBlock/contentSetting.svelte",
];
for (const relativePath of normalPresentationFiles) {
    assert.doesNotMatch(
        read(relativePath),
        /👑|（会员）|会员专属|VIP 专属|会员功能|会员主题/,
        `${relativePath} 不得包含文字式会员 badge`,
    );
}

assert.match(appearanceSource, /PremiumMark/);
assert.doesNotMatch(appearanceSource, /"VIP"|会员主题/);
assert.match(templateCenterSource, /PremiumMark/);
assert.doesNotMatch(templateCenterSource, /会员功能|会员可用/);
assert.match(vipSectionSource, /PremiumMark/);
assert.doesNotMatch(vipSectionSource, /SiyuanIcon name="iconVIP"|VIP组件/);
assert.match(vipSectionSource, /<PremiumMark size=\{14\} \/> 尊享版/);

for (const relativePath of [
    "src/homepage/theme/builtins/card/definition.ts",
    "src/homepage/theme/builtins/paper/definition.ts",
    "src/homepage/theme/builtins/hand-drawn/definition.ts",
    "src/homepage/theme/builtins/technology/definition.ts",
    "src/homepage/theme/builtins/simple-test/definition.ts",
]) {
    const themeSource = read(relativePath);
    assert.match(themeSource, /access:\s*"vip"/);
    assert.doesNotMatch(themeSource, /"VIP"/);
}

assertPremiumSectionHasNoPremiumRows(titleSettingsSource, "顶部区域布局");
assertPremiumSectionHasNoPremiumRows(stylesSettingsSource, "页脚");
assertPremiumSectionHasNoPremiumRows(stylesSettingsSource, "鼠标样式");
assertPremiumSectionHasNoPremiumRows(stylesSettingsSource, "背景图片");
assertPremiumSectionHasNoPremiumRows(stylesSettingsSource, "飘落特效");
assertPremiumSectionHasNoPremiumRows(mobileSettingsSource, "移动端主页");
assertPremiumSectionHasNoPremiumRows(mobileSettingsSource, "悬浮快捷按钮");
assertPremiumSectionHasNoPremiumRows(widgetsSettingsSource, "组件分区导航");

const statusModeRowStart = titleSettingsSource.indexOf('<SettingRow title="状态语来源"');
assert(statusModeRowStart >= 0, "状态语来源 SettingRow 不存在");
const statusModeRowEnd = titleSettingsSource.indexOf("</SettingRow>", statusModeRowStart);
const statusModeRow = titleSettingsSource.slice(statusModeRowStart, statusModeRowEnd);
assert.doesNotMatch(statusModeRow, /\bpremium(?:=|\s|>)/);
assert.match(statusModeRow, /AI 智能生成[\s\S]*<PremiumMark/);
assert.doesNotMatch(aiSettingsSource, /status-ai-vip-title">[\s\S]*?<PremiumMark/);
assert.match(favoritesSource, /<SettingRow title="收藏管理"[^>]*\bpremium/);
const favoritesManageRowStart = favoritesSource.indexOf('<SettingRow title="收藏管理"');
const favoritesManageRowEnd = favoritesSource.indexOf("</SettingRow>", favoritesManageRowStart);
assert.doesNotMatch(favoritesSource.slice(favoritesManageRowStart, favoritesManageRowEnd), /PremiumMark/);

const bannerTypeLine = searchSource.split("\n").find((line) => line.includes('id: "homepage.banner.type"')) ?? "";
const statusModeLine = searchSource.split("\n").find((line) => line.includes('id: "homepage.status.mode"')) ?? "";
assert.doesNotMatch(bannerTypeLine, /requiresAdvanced/);
assert.doesNotMatch(statusModeLine, /requiresAdvanced/);
assert.match(searchSource.split("\n").find((line) => line.includes('id: "homepage.status.prompt"')) ?? "", /requiresAdvanced: true/);
assert.match(searchSource.split("\n").find((line) => line.includes('id: "homepage.status.max-chars"')) ?? "", /requiresAdvanced: true/);
const bannerBingEntry = searchHomepageSettings("Bing", 200).find((entry) => entry.id === "homepage.banner.bing-api");
assert(bannerBingEntry?.requiresAdvanced, "Bing API 搜索项必须标记 Premium");

assert.match(heatmapRuntimeSource, /import \{ isPremiumHeatmapCountType \} from/);
assert.doesNotMatch(heatmapRuntimeSource, /function isPremiumHeatmapCountType/);
for (const helper of ["isPremiumDailyQuoteMode", "isPremiumTimedateMode", "isPremiumWeatherStyle"]) {
    assert.match(agentAdapterSource, new RegExp(`import[\\s\\S]*${helper}`));
    assert.match(agentAdapterSource, new RegExp(`${helper}\\(String\\(patch\\.`));
}
assert.doesNotMatch(agentAdapterSource, /type === "timedate" && \["dial3"/);
assert.throws(
    () => validateAndNormalizeHomepageWidgetPatch("weather", { weatherStyle: "simple1" }, { advancedEnabled: false }),
    /高级功能/,
);
assert.throws(
    () => validateAndNormalizeHomepageWidgetPatch("weather", { weatherStyle: "simple2" }, { advancedEnabled: false }),
    /高级功能/,
);
assert.doesNotThrow(() => validateAndNormalizeHomepageWidgetPatch("weather", { weatherStyle: "default" }, { advancedEnabled: false }));
assert.doesNotThrow(() => validateAndNormalizeHomepageWidgetPatch("weather", { weatherStyle: "simple1" }, { advancedEnabled: true }));

const agentCatalogSource = read("src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-catalog.ts");
assert.doesNotMatch(agentCatalogSource, /ADVANCED_TYPES/);
assert.match(agentCatalogSource, /isPremiumWidgetType/);
assert.equal(getHomepageAgentWidgetDescriptor("visualChart")?.advancedRequired, true);
assert.equal(getHomepageAgentWidgetDescriptor("heatmap")?.advancedRequired, false);
assert.equal(getHomepageAgentWidgetDescriptor("notebrain")?.advancedRequired, true);
assert.equal(isPremiumWidgetType("heatmap"), false);
assert.equal(isPremiumWidgetType("visualChart"), true);

for (const type of [
    "reviewDocs", "stikynot", "enhancedDiary", "News", "constellation", "historyDays",
    "visualChart", "globalCalendar", "statisticalCard", "focus", "habitTracker", "countdown",
    "musicPlayer", "almanac", "PicCaro", "CYBMOK", "countdownTimer", "fixedAssets",
    "accounting", "notebrain",
]) {
    assert.equal(isPremiumWidgetType(type), true, `${type} 必须属于整组件会员能力`);
}

assert.equal(isPremiumDailyQuoteMode("custom"), false);
assert.equal(isPremiumDailyQuoteMode("ai"), true);
assert.equal(isPremiumDailyQuoteMode("remote"), true);
assert.equal(isPremiumHeatmapCountType("block"), false);
for (const type of ["words", "documentCreated", "documentUpdated"]) assert.equal(isPremiumHeatmapCountType(type), true);
for (const mode of ["classic", "simple1", "simple2", "dial1", "dial2"]) assert.equal(isPremiumTimedateMode(mode), false);
for (const mode of ["dial3", "dial4", "dial5", "dial6", "dial7", "dial8", "dial9"]) assert.equal(isPremiumTimedateMode(mode), true);
assert.equal(isPremiumWeatherStyle("default"), false);
assert.equal(isPremiumWeatherStyle("simple1"), true);
assert.equal(isPremiumWeatherStyle("simple2"), true);
assert.equal(isPremiumBannerGlobalType("custom"), false);
assert.equal(isPremiumBannerGlobalType("local"), false);
assert.equal(isPremiumBannerGlobalType("remote"), false);
assert.equal(isPremiumBannerGlobalType("bing"), true);
assert.equal(PREMIUM_WIDGET_TYPES.has("heatmap"), false);

assert(MOBILE_WIDGET_CATALOG.every((item) => typeof item.requiresAdvanced === "boolean"));
assert.equal(MOBILE_WIDGET_CATALOG.find((item) => item.type === "heatmap")?.requiresAdvanced, false);
assert.equal(MOBILE_WIDGET_CATALOG.find((item) => item.type === "visualChart")?.requiresAdvanced, true);

const dailyQuoteSource = read("src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteSet.svelte");
const mobileContentSource = read("src/homepage/mobileHomepage/MobileWidgetContentForm.svelte");
const timedateSource = read("src/components/utils/widgetBlock/widget/timedate/timedateSet.svelte");
const weatherSource = read("src/components/utils/widgetBlock/widget/weather/weatherSet.svelte");
const heatmapSource = read("src/components/utils/widgetBlock/widget/heatmap/heatmapSet.svelte");
const contentSettingSource = read("src/components/utils/widgetBlock/contentSetting.svelte");
const bannerSource = read("src/homepage/homepageSetting/tabs/BannerSettingsTab.svelte");
for (const source of [dailyQuoteSource, mobileContentSource, timedateSource, weatherSource, heatmapSource, contentSettingSource]) {
    assert.doesNotMatch(source, /👑/);
}
for (const source of [dailyQuoteSource, mobileContentSource]) {
    assert.doesNotMatch(source, /AI 生成（会员）|远程接口（会员）|远程语录（会员）/);
}
assert.match(dailyQuoteSource, /PremiumSelect/);
assert.match(dailyQuoteSource, /isPremiumDailyQuoteMode\(option\.value\)/);
assert.match(mobileContentSource, /premiumOption\("ai", "AI 生成", isPremiumDailyQuoteMode\("ai"\)\)/);
assert.match(mobileContentSource, /premiumOption\("words", "字数", isPremiumHeatmapCountType\("words"\)\)/);
assert.match(mobileContentSource, /premiumOption\("dial3", "表盘 3", isPremiumTimedateMode\("dial3"\)\)/);
assert.match(mobileContentSource, /premiumOption\("simple1", "简约 1", isPremiumWeatherStyle\("simple1"\)\)/);
assert.match(timedateSource, /PremiumSelect/);
assert.match(timedateSource, /isPremiumTimedateMode\(option\.value\)/);
assert.match(weatherSource, /PremiumSelect/);
assert.match(weatherSource, /isPremiumWeatherStyle\(option\.value\)/);
assert.match(heatmapSource, /PremiumSelect/);
assert.match(heatmapSource, /isPremiumHeatmapCountType\(option\.value\)/);
assert.match(contentSettingSource, /PremiumSelect/);
assert.match(contentSettingSource, /isPremiumWidgetType\(option\.value\)/);
assert.match(contentSettingSource, /WIDGET_OPTIONS_BY_TAB/);
assert.match(contentSettingSource, /getRawWidgetOptionsForTab/);
assert.match(contentSettingSource, /isContentTypeInTab/);
assert.match(contentSettingSource, /function handleCategoryChange\(nextTab/);
for (const tab of ["note", "visualization", "tool", "info", "custom"]) {
    assert.match(contentSettingSource, new RegExp(`handleCategoryChange\\("${tab}"\\)`));
}
assert.match(contentSettingSource, /function handleContentTypeChange\(value: string\)/);
assert.equal(contentSettingSource.match(/placeholder="请选择组件"/g)?.length, 5);
assert.match(contentSettingSource, /onValueChange=\{handleContentTypeChange\}/);
assert.match(contentSettingSource, /请先从当前分类选择一个组件/);
assert.match(contentSettingSource, /const effectiveActiveTab = resolveActiveTabForContentType\(selectedContentType\)/);
assert.match(contentSettingSource, /activeTab: effectiveActiveTab/);
assert.doesNotMatch(contentSettingSource, /activeTab = parsedData\.activeTab/);
assert.match(contentSettingSource, /组件 type 与 activeTab 不一致，本次设置界面已按 type 修正显示分类/);
assert.match(contentSettingSource, /content-type-empty-state/);
assert.match(contentSettingStyleSource, /content-type-empty-state/);
assert.doesNotMatch(contentSettingSource, /advancedEnabled \|\| selectedContentType === "enhancedDiary"/);
assert.doesNotMatch(contentSettingSource, /isPremiumWidgetType\(selectedContentType\)/);
assert.match(bannerSource, /PremiumSelect/);
assert.match(bannerSource, /isPremiumBannerGlobalType\(option\.value\)/);
for (const source of [dailyQuoteSource, timedateSource, weatherSource, heatmapSource, bannerSource]) {
    assert.doesNotMatch(source, /<SettingRow[^>]*premium=\{isPremium/);
}
assert.match(mobileContentSource, /requiresAdvanced\?: boolean/);
assert.match(mobileContentSource, /hasPremiumOptions/);
assert.match(mobileContentSource, /<PremiumSelect/);
assert.match(mobileContentSource, /field\.vipOnly === true/);
assert.match(mobileContentSource, /<PremiumMark/);

assert.match(premiumSelectSource, /export interface PremiumSelectOption/);
assert.match(premiumSelectSource, /role="combobox"/);
assert.match(premiumSelectSource, /aria-expanded/);
assert.match(premiumSelectSource, /aria-haspopup="listbox"/);
assert.match(premiumSelectSource, /aria-controls/);
assert.match(premiumSelectSource, /role="listbox"/);
assert.match(premiumSelectSource, /role="option"/);
assert.match(premiumSelectSource, /aria-selected/);
assert.match(premiumSelectSource, /placeholder\?: string/);
assert.match(premiumSelectSource, /placeholder = "请选择"/);
assert.match(premiumSelectSource, /selectedOption\?\.label \?\? placeholder/);
assert.match(premiumSelectSource, /class:placeholder=\{!selectedOption\}/);
assert.doesNotMatch(premiumSelectSource, /selectedOption\?\.label \?\? value/);
assert.match(premiumSelectSource, /SiyuanIcon/);
assert.match(premiumSelectSource, /name="iconDown"/);
assert.doesNotMatch(premiumSelectSource, /⌄|▼|▾/);
for (const key of ["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"]) {
    assert.match(premiumSelectSource, new RegExp(`event\.key === "${key === " " ? " " : key}"`));
}
assert.match(premiumSelectSource, /option\.requiresAdvanced/);
assert.match(premiumSelectSource, /selectedOption\?\.requiresAdvanced/);
assert.match(premiumSelectSource, /document\.addEventListener\("pointerdown"/);
assert.match(premiumSelectSource, /document\.removeEventListener\("pointerdown"/);

assert.match(aiSettingsSource, /AI_PREMIUM_META/);
assert.match(aiSettingsSource, /if \(!advancedEnabled\)/);
assert.match(aiSettingsSource, /<AdvancedFeatureLock/);
for (const subTab of ["models", "entries", "status", "selection", "webSearch", "workbenches", "memory", "automation"]) {
    assert.match(searchSource, new RegExp(`mainTab: "aiKnowledgeBase", subTab: "${subTab}"[^\\n]*requiresAdvanced: true`));
}
for (const source of [homepageIndexSource, automationRuntimeSource, automationControlSource]) {
    assert.match(source, /isHomepageEntitlementGranted/);
}
assert.match(automationRuntimeSource, /async function scanJobs\(\): Promise<void> \{\s*if \(!isHomepageEntitlementGranted\(\)\) return;/);
assert.match(automationControlSource, /if \(!isHomepageEntitlementGranted\(\)\) throw new Error\("高级功能不可用。"\)/);
assert.match(homepageIndexSource, /openKbSettingsDialog\(\): Promise<void>/);
assert.match(homepageIndexSource, /initialMainTab: "aiKnowledgeBase"/);

assert.match(buttonRegistrySource, /requiresAdvanced\?: boolean/);
assert.match(buttonRegistrySource, /aiKnowledgeBase:[\s\S]*?requiresAdvanced: true/);
assert.match(buttonRegistrySource, /templateCenter:[\s\S]*?requiresAdvanced: true/);
assert.doesNotMatch(buttonRegistrySource, /templateCenter:[\s\S]*?badge: "会员功能"/);
assert.match(buttonSettingsSource, /PremiumMark/);
assert.match(buttonSettingsSource, /selectedButtonMeta\?\.requiresAdvanced/);
assert.doesNotMatch(buttonSettingsSource, /会员功能/);

assert.doesNotMatch(countdownEventEditorSource, /纪念日通知为 VIP 专属/);
assert.match(countdownEventEditorSource, /纪念日通知\s*<PremiumMark/);
assert.doesNotMatch(countdownCenterDialogSource, /纪念日通知为 VIP 专属/);
assert.match(countdownCenterDialogSource, /纪念日通知\s*<PremiumMark/);
assert.doesNotMatch(notificationSettingsSource, /通知中心为 VIP 专属功能/);
assert.match(notificationSettingsSource, /当前不可用，请在「会员服务」中开通后使用/);
assert.doesNotMatch(mobileSettingsSource, /移动端主页为会员专属功能/);
assert.match(mobileSettingsSource, /当前不可用，开通后可配置和使用；已有设置会继续保留/);
assert.doesNotMatch(favoritesSettingsSource, /收藏文档管理与分组为 VIP 专属功能/);
assert.match(favoritesSettingsSource, /已有分组和组件设置会完整保留/);

const premiumSearchResults = searchHomepageSettings("会员", 200);
assert(premiumSearchResults.some((entry) => entry.id === "homepage.behavior.sidebar" && entry.requiresAdvanced));
assert(premiumSearchResults.some((entry) => entry.id === "homepage.mobile.auto-open-enabled" && entry.requiresAdvanced));
assert(premiumSearchResults.some((entry) => entry.id === "robot.agent.model" && entry.requiresAdvanced));

console.log(`premium presentation verification passed (${relative(repoRoot, srcRoot)})`);
