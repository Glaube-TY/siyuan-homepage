import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import {
    isPremiumDailyQuoteMode,
    isPremiumHeatmapCountType,
    isPremiumTimedateMode,
    isPremiumWeatherStyle,
    isPremiumWidgetType,
    PREMIUM_WIDGET_TYPES,
    resolveWidgetPremiumRequirement,
} from "../src/features/entitlement/homepage-premium-features";

const repoRoot = join(process.cwd());

function read(relativePath: string): string {
    return readFileSync(join(repoRoot, relativePath), "utf8");
}

const PREMIUM_WIDGET_DATA_DIRS = [
    "reviewDocs",
    "stikynot",
    "enhancedDiary",
    "News",
    "constellation",
    "historyDays",
    "visualChart",
    "globalCalendar",
    "statisticalCard",
    "focus",
    "habitTracker",
    "countdown",
    "musicPlayer",
    "almanac",
    "PicCaro",
    "CYBMOK",
    "countdownTimer",
    "fixedAssets",
    "accounting",
] as const;

const TOP_LEVEL_RUNTIME_CALLS = new Set([
    "setInterval",
    "setTimeout",
    "fetch",
    "registerSharedWidgetFlusher",
    "registerSharedWidgetCleanup",
]);

function collectTypeScriptFiles(relativeDirectory: string): string[] {
    const absoluteDirectory = join(repoRoot, relativeDirectory);
    if (!existsSync(absoluteDirectory)) return [];
    const files: string[] = [];
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
        const relativePath = join(relativeDirectory, entry.name);
        if (entry.isDirectory()) files.push(...collectTypeScriptFiles(relativePath));
        else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(relativePath);
    }
    return files;
}

function getExpressionName(expression: ts.Expression): string {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) {
        const owner = getExpressionName(expression.expression);
        return owner ? `${owner}.${expression.name.text}` : expression.name.text;
    }
    return "";
}

function collectTopLevelRuntimeCalls(relativePath: string): string[] {
    const source = read(relativePath);
    const sourceFile = ts.createSourceFile(
        relativePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const violations: string[] = [];
    const visitTopLevel = (node: ts.Node): void => {
        if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
        if (ts.isCallExpression(node)) {
            const name = getExpressionName(node.expression);
            if (TOP_LEVEL_RUNTIME_CALLS.has(name) || name.endsWith(".addEventListener")) {
                const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
                violations.push(`${relativePath}:${position} ${name}`);
            }
        }
        ts.forEachChild(node, visitTopLevel);
    };
    sourceFile.statements.forEach(visitTopLevel);
    return violations;
}

function assertBefore(source: string, first: string, second: string, message: string): void {
    const firstIndex = source.indexOf(first);
    const secondIndex = source.indexOf(second);
    assert(firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex, message);
}

for (const type of PREMIUM_WIDGET_TYPES) {
    assert.equal(resolveWidgetPremiumRequirement(type, { data: {} }), true, `${type} 必须在运行时硬闸中锁定`);
}
assert.equal(resolveWidgetPremiumRequirement("favorites", { data: { groupsEnabled: true } }), false);
assert.equal(resolveWidgetPremiumRequirement("dailyQuote", { data: { dailyQuoteMode: "custom" } }), false);
for (const mode of ["ai", "remote"]) {
    assert.equal(resolveWidgetPremiumRequirement("dailyQuote", { data: { dailyQuoteMode: mode } }), true);
}
assert.equal(resolveWidgetPremiumRequirement("heatmap", { data: { heatmapCountType: "block" } }), false);
for (const type of ["words", "documentCreated", "documentUpdated"]) {
    assert.equal(resolveWidgetPremiumRequirement("heatmap", { data: { heatmapCountType: type } }), true);
}
for (const type of ["classic", "simple1", "simple2", "dial1", "dial2"]) {
    assert.equal(resolveWidgetPremiumRequirement("timedate", { data: { timeType: type } }), false);
}
for (const type of ["dial3", "dial4", "dial5", "dial6", "dial7", "dial8", "dial9"]) {
    assert.equal(resolveWidgetPremiumRequirement("timedate", { data: { timeType: type } }), true);
}
assert.equal(resolveWidgetPremiumRequirement("weather", { data: { weatherStyle: "default" } }), false);
for (const style of ["simple1", "simple2"]) {
    assert.equal(resolveWidgetPremiumRequirement("weather", { data: { weatherStyle: style } }), true);
}
assert.equal(isPremiumWidgetType("heatmap"), false);
assert.equal(isPremiumDailyQuoteMode("custom"), false);
assert.equal(isPremiumHeatmapCountType("block"), false);
assert.equal(isPremiumTimedateMode("dial3"), true);
assert.equal(isPremiumWeatherStyle("simple1"), true);

const entitlementSource = read("src/features/entitlement/homepage-premium-features.ts");
assert.match(entitlementSource, /export function resolveWidgetPremiumRequirement/);
const hostSource = read("src/components/utils/widgetBlock/WidgetRuntimeHost.svelte");
assert.doesNotMatch(hostSource, /\{#key advanced\}/);
assert.match(hostSource, /premiumRequired && !advanced/);
assert.match(hostSource, /<WidgetPremiumRuntimeGate \{premiumTitle\} \/>/);
assert.match(hostSource, /\{:else\}[\s\S]*<WidgetFrame component=\{SelectedComponent\}/);
assert.match(hostSource, /premiumRequired: boolean/);

const mountSource = read("src/components/utils/widgetBlock/widgetMountRegistry.ts");
assert.match(mountSource, /resolveWidgetPremiumRequirement\(widgetType, contentData\)/);
assert.match(mountSource, /premiumRequired,/);
assert.match(mountSource, /premiumTitle: definition\.semanticLabel/);

const gateSource = read("src/components/utils/widgetBlock/WidgetPremiumRuntimeGate.svelte");
assert.match(gateSource, /import AdvancedFeatureLock/);
assert.match(gateSource, /compact=\{true\}/);
assert.match(gateSource, /data-widget-part="root"/);
assert.match(gateSource, /data-widget-part="body"/);
assert.doesNotMatch(gateSource, /fetch|SQL|agent|notification|api|store/i);

const lifecycleSource = read("src/components/utils/widgetBlock/utils/widget-runtime-lifecycle.ts");
assert.match(lifecycleSource, /querySelectorAll\("\.widget-block"\)/);
assert.match(lifecycleSource, /instance\.destroy\(\)/);
assert.match(lifecycleSource, /catch \(error\)/);

const sidebarSource = read("src/components/utils/sidebar/sidebar.svelte");
const sidebarUnavailable = sidebarSource.slice(sidebarSource.indexOf("const handleAdvancedUnavailable"), sidebarSource.indexOf("window.addEventListener", sidebarSource.indexOf("const handleAdvancedUnavailable")));
assertBefore(sidebarUnavailable, "destroyMountedWidgetBlocks", "advanced = false", "侧边栏必须先销毁组件实例再隐藏容器");
assert.match(sidebarSource, /destroyMountedWidgetBlocks\(container\)/);

const mobileSource = read("src/homepage/mobileHomepage/mobileHomepage.svelte");
const mobileUnavailable = mobileSource.slice(mobileSource.indexOf("const handleAdvancedUnavailable"), mobileSource.indexOf("window.addEventListener", mobileSource.indexOf("const handleAdvancedUnavailable")));
assertBefore(mobileUnavailable, "destroyMountedWidgetBlocks", "advanced = false", "移动主页必须先销毁组件实例再隐藏容器");
assert.match(mobileSource, /if \(destroyed \|\| !advanced\) return;/);
assert.match(mobileSource, /if \(!advanced\) return;/);
assert.match(mobileSource, /if \(!advanced\) \{[\s\S]*destroyMountedWidgetBlocks\(container\)/);

const focusDataSource = read("src/components/utils/widgetBlock/widget/focus/focusData.ts");
assert.match(focusDataSource, /export function acquireFocusDataRuntime\(\)/);
assert.match(focusDataSource, /focusDataRuntimeRefCount/);
assert.match(focusDataSource, /focusDataRuntimeLeases/);
assert.match(focusDataSource, /lease\.released/);
assert.match(focusDataSource, /unregisterFocusDataSharedCleanup/);
assert.match(focusDataSource, /stopFocusDataRuntimeCompletely/);
assert.match(focusDataSource, /let unregisterFocusPendingSafetyFlusher/);
assert.match(focusDataSource, /function ensureFocusPendingSafetyFlusher\(\)/);
assert.match(focusDataSource, /function releaseFocusPendingSafetyFlusherIfIdle\(\)/);
const focusSafetySource = focusDataSource.slice(
    focusDataSource.indexOf("function ensureFocusPendingSafetyFlusher"),
    focusDataSource.indexOf("export function queueFocusSession"),
);
assert.match(focusSafetySource, /registerSharedWidgetFlusher\(/, "Focus Safety Flusher 必须只在显式 helper 内注册");
const focusQueueSource = focusDataSource.slice(
    focusDataSource.indexOf("export function queueFocusSession"),
    focusDataSource.indexOf("export async function flushPendingFocusSessions"),
);
assertBefore(focusQueueSource, "pendingFocusSessions.set(normalized.id, normalized);", "ensureFocusPendingSafetyFlusher();", "Focus 入队后必须注册 pending Safety Flusher");
const focusFlushSource = focusDataSource.slice(focusDataSource.indexOf("export async function flushPendingFocusSessions"));
assert.match(focusFlushSource, /finally \{[\s\S]*releaseFocusPendingSafetyFlusherIfIdle\(\)/, "Focus flush 完成后必须释放空闲 Safety Flusher");
const focusRuntimeStopSource = focusDataSource.slice(
    focusDataSource.indexOf("function stopFocusDataRuntimeCompletely"),
    focusDataSource.indexOf("export function acquireFocusDataRuntime"),
);
assert.doesNotMatch(focusRuntimeStopSource, /pendingFocusSessions\.clear\(\)/, "Focus Runtime stop 不得清空 pending sessions");
const focusComponentSource = read("src/components/utils/widgetBlock/widget/focus/focus.svelte");
assert.match(focusComponentSource, /acquireFocusDataRuntime/);
assert.match(focusComponentSource, /releaseFocusDataRuntime\?\.\(\)/);
assertBefore(focusComponentSource, "releaseFocusDataRuntime = acquireFocusDataRuntime();", "void initialize()", "Focus 必须在初始化前 acquire 数据 Runtime");
assertBefore(focusComponentSource, "void flushPendingFocusSessions().catch", "releaseFocusDataRuntime?.()", "Focus 必须先安排最后一次 flush 再 release Runtime");
const focusToolSource = read("src/features/kb/services/agent-workbench/tools/homepage-components/homepage-focus.tool.ts");
assert.doesNotMatch(focusToolSource, /acquireFocusDataRuntime/, "Focus Agent Tool 不应持有 Widget Data Runtime");

const cybmokDataSource = read("src/components/utils/widgetBlock/widget/CYBMOK/cybmokData.ts");
assert.match(cybmokDataSource, /export function acquireCYBMOKDataRuntime\(\)/);
assert.match(cybmokDataSource, /cybmokDataRuntimeRefCount/);
assert.match(cybmokDataSource, /cybmokDataRuntimeLeases/);
assert.match(cybmokDataSource, /lease\.released/);
assert.match(cybmokDataSource, /unregisterCYBMOKPendingSafetyFlusher/);
assert.match(cybmokDataSource, /unregisterCYBMOKSharedCleanup/);
assert.match(cybmokDataSource, /stopCYBMOKDataRuntimeCompletely/);
assert.match(cybmokDataSource, /function ensureCYBMOKPendingSafetyFlusher\(\)/);
assert.match(cybmokDataSource, /function releaseCYBMOKPendingSafetyFlusherIfIdle\(\)/);
const cybmokSafetySource = cybmokDataSource.slice(
    cybmokDataSource.indexOf("function ensureCYBMOKPendingSafetyFlusher"),
    cybmokDataSource.indexOf("function finalizeActiveBatch"),
);
assert.match(cybmokSafetySource, /registerSharedWidgetFlusher\(/, "CYBMOK Safety Flusher 必须只在显式 helper 内注册");
const cybmokRecordSource = cybmokDataSource.slice(
    cybmokDataSource.indexOf("export function recordCYBMOKKnock"),
    cybmokDataSource.indexOf("export async function flushPendingCYBMOKKnocks"),
);
assertBefore(cybmokRecordSource, "activeBatch.lastKnockAt = timestamp;", "ensureCYBMOKPendingSafetyFlusher();", "CYBMOK 产生敲击后必须注册 pending Safety Flusher");
const cybmokFlushSource = cybmokDataSource.slice(cybmokDataSource.indexOf("export async function flushPendingCYBMOKKnocks"));
assert.match(cybmokFlushSource, /finally \{[\s\S]*releaseCYBMOKPendingSafetyFlusherIfIdle\(\)/, "CYBMOK flush 完成后必须释放空闲 Safety Flusher");
const cybmokRuntimeAcquireSource = cybmokDataSource.slice(cybmokDataSource.indexOf("export function acquireCYBMOKDataRuntime"));
assert.doesNotMatch(cybmokRuntimeAcquireSource, /registerSharedWidgetFlusher\(/, "CYBMOK Data Runtime 不得持有 Shared Flusher");
const cybmokRuntimeStopSource = cybmokDataSource.slice(
    cybmokDataSource.indexOf("function stopCYBMOKDataRuntimeCompletely"),
    cybmokDataSource.indexOf("export function acquireCYBMOKDataRuntime"),
);
assert.doesNotMatch(cybmokRuntimeStopSource, /activeBatch\s*=\s*null|pendingBatches\.(splice|length\s*=)/, "CYBMOK Runtime stop 不得清空 active/pending batches");
const cybmokComponentSource = read("src/components/utils/widgetBlock/widget/CYBMOK/CYBMOK.svelte");
assert.match(cybmokComponentSource, /acquireCYBMOKDataRuntime/);
assert.match(cybmokComponentSource, /releaseCYBMOKDataRuntime\?\.\(\)/);
assertBefore(cybmokComponentSource, "releaseCYBMOKDataRuntime = acquireCYBMOKDataRuntime();", "advancedEnabled = plugin.ADVANCED", "CYBMOK 必须在初始化数据前 acquire Runtime");
assertBefore(cybmokComponentSource, "void flushPendingCYBMOKKnocks().catch", "releaseCYBMOKDataRuntime?.()", "CYBMOK 必须先安排最后一次 flush 再 release Runtime");

const premiumWidgetDataFiles = PREMIUM_WIDGET_DATA_DIRS.flatMap((directory) =>
    collectTypeScriptFiles(`src/components/utils/widgetBlock/widget/${directory}`),
);
const premiumWidgetTopLevelRuntimeCalls = premiumWidgetDataFiles.flatMap(collectTopLevelRuntimeCalls);
assert.deepEqual(
    premiumWidgetTopLevelRuntimeCalls,
    [],
    `Premium Widget data module 不得在 import 时启动长期 Runtime:\n${premiumWidgetTopLevelRuntimeCalls.join("\n")}`,
);

const indexSource = read("src/index.ts");
const unloadSource = indexSource.slice(indexSource.indexOf("async onunload()"));
assertBefore(unloadSource, "await flushPendingSharedWidgetWrites();", "destroySharedWidgetStorage();", "插件卸载必须先 flush pending shared widget writes 再销毁存储");
assert.match(indexSource, /private async startHomepagePremiumBackgroundRuntimes\(\)/);
assert.match(indexSource, /await this\.waitForHomepageEntitlementReady\(\);[\s\S]*isHomepageEntitlementGranted\(\)/);
assert.match(indexSource, /destroyAutomationRuntime/);
assert.match(indexSource, /destroyTaskNotifyScheduler/);
assert.match(indexSource, /destroyCountdownNotifyScheduler/);
assert.match(indexSource, /destroyEnhancedDiaryNotifyScheduler/);
assert.match(indexSource, /destroyReviewNotifyScheduler/);
assert.match(indexSource, /await disposeRobotClientRuntime\(\)/);
const onloadSource = indexSource.slice(
    indexSource.indexOf("async onload()"),
    indexSource.indexOf("private async applyGlobalBackgroundImageStyle"),
);
assert.doesNotMatch(onloadSource, /registerMobileQuickActionsForegroundListeners\(\)/, "onload 不得无条件注册移动前台监听器");
assert.doesNotMatch(onloadSource, /initSelectionAiToolbarPointerTracker\(\)/, "onload 不得无条件启动划词指针追踪");
assert.doesNotMatch(onloadSource, /\.finally\(\(\) => initSelectionAiToolbarPointerTracker\(\)\)/);

const baseListenerSource = indexSource.slice(
    indexSource.indexOf("private registerBaseIndependentListeners"),
    indexSource.indexOf("private syncHomepageConfigDependentListeners"),
);
assert.match(baseListenerSource, /homepage-advanced-ready/);
assert.match(baseListenerSource, /homepage-advanced-unavailable/);
const configDependentListenerSource = indexSource.slice(
    indexSource.indexOf("private syncHomepageConfigDependentListeners"),
    indexSource.indexOf("private registerMinimalHomepageEntry"),
);
assert.doesNotMatch(configDependentListenerSource, /homepage-advanced-ready|homepage-advanced-unavailable|homepageWindowListenersRegistered/);
assert.doesNotMatch(indexSource, /homepageWindowListenersRegistered/);

const selectionLifecycleSource = indexSource.slice(
    indexSource.indexOf("private stopSelectionAiPremiumRuntime"),
    indexSource.indexOf("private async handleHomepageAdvancedReady"),
);
assert.match(selectionLifecycleSource, /isHomepageEntitlementGranted\(\)/);
assert.match(selectionLifecycleSource, /this\.isMobileFrontend\(\)/);
assert.match(selectionLifecycleSource, /await loadSelectionAiToolbarSettingsSnapshot\(this\)/);
assert.match(selectionLifecycleSource, /getSelectionAiToolbarSettingsSnapshot\(\)\.enabled/);
assert.match(selectionLifecycleSource, /initSelectionAiToolbarPointerTracker\(\)/);
const toolbarSource = indexSource.slice(
    indexSource.indexOf("updateProtyleToolbar(toolbar"),
    indexSource.indexOf("async onLayoutReady()"),
);
assertBefore(toolbarSource, "removeSelectionAiToolbarItems(toolbar);", "isHomepageEntitlementGranted()", "划词 AI 工具栏必须先清理旧项并检查会员状态");
assert.match(toolbarSource, /!isHomepageEntitlementGranted\(\)/);
const unavailableRuntimeSource = indexSource.slice(
    indexSource.indexOf("private async handleHomepageAdvancedUnavailable"),
    indexSource.indexOf("async onunload()"),
);
assertBefore(unavailableRuntimeSource, "this.stopSelectionAiPremiumRuntime();", "await this.stopHomepagePremiumBackgroundRuntimes();", "会员失效时必须先销毁划词 AI 运行时");
assert.match(unavailableRuntimeSource, /unregisterMobileQuickActionsForegroundListeners\(\)/);
assert.match(unavailableRuntimeSource, /destroyMobileQuickActions\(\)/);

const quickActionsSource = indexSource.slice(
    indexSource.indexOf("private async refreshMobileQuickActionsFromSharedConfig"),
    indexSource.indexOf("private async openHomepage"),
);
assert.match(quickActionsSource, /refreshMobileQuickActionsFromSharedConfig[\s\S]*if \(!isHomepageEntitlementGranted\(\)/);
assert.match(quickActionsSource, /scheduleMobileQuickActionsRefresh[\s\S]*if \(!isHomepageEntitlementGranted\(\)/);
assert.match(quickActionsSource, /performMobileQuickActionsRefresh[\s\S]*if \(!isHomepageEntitlementGranted\(\)/);
assert.match(quickActionsSource, /registerMobileQuickActionsForegroundListeners[\s\S]*!isHomepageEntitlementGranted\(\)/);
assert.match(quickActionsSource, /mobileQuickActionsVisibilityHandler[\s\S]*isHomepageEntitlementGranted\(\)/);
const finalizeHomepageSource = indexSource.slice(
    indexSource.indexOf("private async finalizeHomepageSurfaceOnLayoutReady"),
    indexSource.indexOf("private ensureTabContainers"),
);
assertBefore(finalizeHomepageSource, "await this.waitForHomepageEntitlementReady();", "this.registerMobileQuickActionsForegroundListeners();", "移动端首次获得会员状态后必须注册前台监听器");

const layoutSource = indexSource.slice(indexSource.indexOf("async onLayoutReady()"), indexSource.indexOf("private async finalizeHomepageSurfaceOnLayoutReady"));
assert.match(layoutSource, /startNotificationCenterRuntime\(\)/);
assert.match(layoutSource, /startHomepagePremiumBackgroundRuntimes/);
assert.match(layoutSource, /if \(this\.isMobileFrontend\(\)\) \{[\s\S]*startNotificationCenterRuntime\(\)/);
for (const starter of ["startAutomationRuntime", "startTaskNotifyScheduler", "startCountdownNotifyScheduler", "startEnhancedDiaryNotifyScheduler", "startReviewNotifyScheduler", "initRobotClientRuntime"]) {
    assert.doesNotMatch(layoutSource, new RegExp(`${starter}\\(`), `onLayoutReady 不得无条件启动 ${starter}`);
}
const premiumBackgroundStartSource = indexSource.slice(
    indexSource.indexOf("private async startHomepagePremiumBackgroundRuntimes"),
    indexSource.indexOf("private async stopHomepagePremiumBackgroundRuntimes"),
);
assertBefore(premiumBackgroundStartSource, "startNotificationCenterRuntime();", "const starters:", "桌面会员后台必须先启动通知中心核心");
const premiumBackgroundStopSource = indexSource.slice(
    indexSource.indexOf("private async stopHomepagePremiumBackgroundRuntimes"),
    indexSource.indexOf("private stopSelectionAiPremiumRuntime"),
);
assert.match(premiumBackgroundStopSource, /if \(!this\.isMobileFrontend\(\)\) \{[\s\S]*destroyNotificationCenterRuntime\(\)/);
assert.match(indexSource, /handleHomepageAdvancedReady[\s\S]*startHomepagePremiumBackgroundRuntimes/);
assert.match(indexSource, /handleHomepageAdvancedReady[\s\S]*startSelectionAiPremiumRuntime/);
assert.match(indexSource, /handleHomepageAdvancedUnavailable[\s\S]*stopHomepagePremiumBackgroundRuntimes/);

const homepageSource = read("src/homepage/homepage.svelte");
const statusUnavailableSource = homepageSource.slice(
    homepageSource.indexOf("async function handleAdvancedUnavailable"),
    homepageSource.indexOf("// 处理主页设置保存事件", homepageSource.indexOf("async function handleAdvancedUnavailable")),
);
assertBefore(statusUnavailableSource, "abortStatusAiRequest();", "if (homepageInitialLoadState !== \"ready\")", "会员失效时必须立即中止状态 AI 请求");
const statusTextSource = homepageSource.slice(
    homepageSource.indexOf("async function updateDisplayedStatsInfoText"),
    homepageSource.indexOf("async function refreshStatusText", homepageSource.indexOf("async function updateDisplayedStatsInfoText")),
);
assertBefore(statusTextSource, "if (statusTextMode === \"ai\" && !advanced)", "await prepareHomepageStatistics(plugin);", "免费 AI 状态语必须在统计准备前直接返回");
assert.match(statusTextSource, /setStatusAiRuntimeState\("no_premium"\)/);
assert.match(statusTextSource, /getHomepageStatusAiFailureText\("not_premium"\)/);

const notificationSource = read("src/features/notification-center/notification-center-runtime.ts");
assert.match(notificationSource, /getHomepageEntitlementSnapshot/);
assert.match(notificationSource, /membershipState = snapshot\.status === "pending"/);
assert.match(notificationSource, /if \(membershipState === "ready"\) \{[\s\S]*startNotificationRuleRuntime\(\)/);
assert.match(notificationSource, /handlePremiumUnavailable[\s\S]*destroyNotificationRuleRuntime/);
const notificationStart = notificationSource.slice(notificationSource.indexOf("export function startNotificationCenterRuntime"));
assert.match(notificationStart, /if \(membershipState === "ready"\) \{[\s\S]*startNotificationRuleRuntime\(\);/);

const automationSource = read("src/features/agent-platform/automation/automation-runtime.ts");
assert.match(automationSource, /async function scanJobs\(\): Promise<void> \{\s*if \(!isHomepageEntitlementGranted\(\)\) return;/);
assert.match(read("src/features/agent-platform/automation/automation-control.ts"), /isHomepageEntitlementGranted/);
assert.match(read("src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAi.ts"), /isHomepageEntitlementGranted/);
assert.match(read("src/features/notification-center/notification-center-plugin.ts"), /isHomepageEntitlementGranted/);
assert.match(read("src/features/notification-center/notification-center-service.ts"), /premium_required/);
const kernelSource = read("src/kernel/kernel-entitlement.ts");
assert.match(kernelSource, /verifyLocalLicense/);
assert.match(kernelSource, /kernel license read timeout/);
assert.doesNotMatch(kernelSource, /CACHE_TTL_MS/);

console.log("premium runtime verification passed: resolver, widget hard gate, selection/mobile lifecycle, focus/CYBMOK data lifecycle, premium module audit, status AI hard gate, background lifecycle, notification rule lifecycle, and safety gates");
