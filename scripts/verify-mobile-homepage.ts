import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    MOBILE_WIDGET_CATALOG,
    MOBILE_WIDGET_CATEGORIES,
} from "../src/homepage/mobileHomepage/mobile-widget-categories.js";
import {
    applyMobileSectionOperation,
    readMobileSectionState,
} from "../src/homepage/mobileHomepage/mobileSectionLayout.js";

const expectedCategoryIds = ["all", "note", "visualization", "tool", "info", "custom"];
assert.deepEqual(MOBILE_WIDGET_CATEGORIES.map((item) => item.id), expectedCategoryIds);
assert.equal(new Set(MOBILE_WIDGET_CATALOG.map((item) => item.type)).size, MOBILE_WIDGET_CATALOG.length);
assert(MOBILE_WIDGET_CATALOG.every((item) => expectedCategoryIds.includes(item.activeTab)));

const registryPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widgetDefinitionRegistry.ts", import.meta.url));
const mobileWidgetTypes = readFileSync(registryPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("defineWidget({ type:"))
    .filter((line) => !line.includes("placements:") || line.includes('"mobile"'))
    .map((line) => line.match(/type:\s*"([^"]+)"/)?.[1])
    .filter((type): type is string => Boolean(type));
assert.deepEqual(
    [...new Set(MOBILE_WIDGET_CATALOG.map((item) => item.type))].sort(),
    [...new Set(mobileWidgetTypes)].sort(),
    "移动组件目录必须覆盖全部支持 mobile placement 的注册组件",
);

const baseLayout = {
    schema: "siyuan-homepage-device-view" as const,
    version: 2,
    revision: 1,
    updatedAt: "2026-08-14T00:00:00.000Z",
    deviceId: "mobile-shared",
    surface: "mobile-homepage" as const,
    order: [
        { id: "widget-a", style: null, index: 0 },
        { id: "widget-b", style: null, index: 1 },
    ],
    sections: {
        note: { widgetIds: ["widget-a", "widget-b"] },
        ignored: { widgetIds: [] },
    },
};
const normalized = applyMobileSectionOperation(baseLayout);
assert.deepEqual(Object.keys(normalized.sections || {}), ["mobile-home"]);
assert.equal(normalized.sections?.["mobile-home"].name, "主页");
assert.deepEqual(normalized.sections?.["mobile-home"].widgetIds, ["widget-a", "widget-b"]);

const created = applyMobileSectionOperation(normalized, {
    type: "create",
    sectionId: "mobile-section-work",
    name: "工作",
});
const moved = applyMobileSectionOperation(created, {
    type: "assign",
    widgetId: "widget-a",
    sectionId: "mobile-section-work",
});
assert.equal(moved.componentSectionsModeEnabled, true);
assert.deepEqual(readMobileSectionState(moved).assignments, {
    "widget-b": "mobile-home",
    "widget-a": "mobile-section-work",
});
const renamed = applyMobileSectionOperation(moved, {
    type: "rename",
    sectionId: "mobile-section-work",
    name: "项目",
});
assert.equal(readMobileSectionState(renamed).sections[1].name, "项目");
const removed = applyMobileSectionOperation(renamed, {
    type: "delete",
    sectionId: "mobile-section-work",
});
assert.deepEqual(readMobileSectionState(removed).assignments, {
    "widget-b": "mobile-home",
    "widget-a": "mobile-home",
});
assert.throws(
    () => applyMobileSectionOperation(normalized, { type: "assign", widgetId: "missing", sectionId: "mobile-home" }),
    /不存在的组件/,
);

const stylesheetPath = fileURLToPath(new URL("../src/homepage/mobileHomepage/mobileHomepage.scss", import.meta.url));
const stylesheet = readFileSync(stylesheetPath, "utf8");
for (const marker of [
    "grid-template-columns: repeat(2",
    "mobile-homepage-app-bar",
    "mobile-widget-hidden-by-section",
    "data-widget-frame-title=\"optional\"",
    "data-widget-frame-content=\"scrollable\"",
    "data-widget-kind=\"chart\"",
    "mobile-widget-size-fallback",
]) {
    assert(stylesheet.includes(marker), `移动主页样式缺少 ${marker}`);
}
assert(
    !stylesheet.includes('> :not(.mobile-widget-chrome, .mobile-widget-size-fallback) {\n            overflow-x: hidden !important;\n            overflow-y: auto !important'),
    "移动主页不得再把整个组件挂载根节点设为滚动区",
);
assert(
    stylesheet.includes("var(--siyuan-homepage-mobile-safe-area-top, env(safe-area-inset-top))"),
    "移动主页顶部安全区必须通过统一 Portal 变量解析",
);
assert(!stylesheet.includes("mobile-homepage-fab"), "移动主页浏览态不得保留常驻添加组件悬浮按钮");
assert(
    stylesheet.includes(".mobile-widget-content-panel")
        && stylesheet.includes("height: 100%")
        && stylesheet.includes("flex-direction: column"),
    "移动组件内容面板必须建立完整高度与 flex 链，长表单才能滚动",
);
assert(
    stylesheet.includes(".mobile-widget-content-sheet")
        && stylesheet.includes("height: min(85dvh, 720px)")
        && stylesheet.includes("box-sizing: border-box"),
    "移动组件内容弹层必须提供确定高度，不能只依赖 max-height",
);
assert(
    stylesheet.includes(".mobile-content-form-body")
        && stylesheet.includes("overflow-y: auto")
        && stylesheet.includes("touch-action: pan-y")
        && stylesheet.includes("-webkit-overflow-scrolling: touch"),
    "移动组件长表单必须接管纵向触摸滚动",
);

const mobileHomepagePath = fileURLToPath(new URL("../src/homepage/mobileHomepage/mobileHomepage.svelte", import.meta.url));
const mobileHomepageSource = readFileSync(mobileHomepagePath, "utf8");
assert(
    mobileHomepageSource.includes("const shouldEnableSortable = editMode && activeSectionId === MOBILE_ALL_SECTION_ID"),
    "Sortable 必须仅在移动主页全量编辑态启用",
);
assert(
    mobileHomepageSource.includes("if (!shouldEnableSortable)")
        && mobileHomepageSource.includes("sortable.destroy()"),
    "退出移动主页全量编辑态时必须销毁 Sortable，避免浏览态拦截触摸",
);
assert(
    !mobileHomepageSource.includes("disabled: true"),
    "移动主页浏览态不得保留禁用但仍绑定容器的 Sortable",
);
assert(
    mobileHomepageSource.includes("filter: MOBILE_SORTABLE_FILTER_SELECTOR"),
    "Sortable 过滤交互控件时不得连拖拽手柄一起排除",
);
assert(
    mobileHomepageSource.includes("先创建配置，再把区块加入 DOM")
        && mobileHomepageSource.includes("removeTransientMobileWidget"),
    "移动端新增组件必须先保存配置，并在布局提交失败时清理未提交区块",
);
assert(
    mobileHomepageSource.includes("editMode = false")
        && mobileHomepageSource.includes("if (targetSectionId) activeSectionId = targetSectionId"),
    "移动端新增组件成功后必须退出编辑态并返回新组件所在主页分区",
);
assert(!mobileHomepageSource.includes("mobile-homepage-fab"), "添加组件入口必须从浏览态悬浮按钮移除");
const contentConfirmSource = mobileHomepageSource.slice(
    mobileHomepageSource.indexOf("async function handleContentConfirm"),
    mobileHomepageSource.indexOf("function requestDeleteSelectedWidget"),
);
assert(
    contentConfirmSource.indexOf("await saveLayout") < contentConfirmSource.indexOf("instance.updateContent"),
    "新增组件必须先提交配置与布局，再运行组件，避免音乐播放器挂载异常导致无法添加",
);
assert(
    mobileHomepageSource.includes('restored.status === "ready"')
        && mobileHomepageSource.includes("renderedLayoutRevision = null"),
    "布局恢复不完整时不得允许残缺 DOM 覆盖持久化布局",
);

const mobileMenuPath = fileURLToPath(new URL("../src/homepage/mobileHomepage/MobileHomepageMenuSheet.svelte", import.meta.url));
const mobileMenuSource = readFileSync(mobileMenuPath, "utf8");
assert(
    mobileMenuSource.includes("onAddWidget") && mobileMenuSource.includes("添加组件"),
    "添加组件入口必须位于主页更多菜单",
);

const mobileContentFormPath = fileURLToPath(new URL("../src/homepage/mobileHomepage/MobileWidgetContentForm.svelte", import.meta.url));
const mobileContentFormSource = readFileSync(mobileContentFormPath, "utf8");
assert(
    !mobileContentFormSource.includes("svelteDialog")
        && mobileContentFormSource.includes('onOpenSubpage("music-cloud")'),
    "移动组件的下级设置不得继续打开桌面弹窗",
);
const mobileConfigBuilder = mobileContentFormSource.slice(
    mobileContentFormSource.indexOf("function buildWidgetConfig"),
    mobileContentFormSource.indexOf("async function submit"),
);
assert(
    mobileConfigBuilder.includes('case "heatmap"')
        && mobileConfigBuilder.includes("heatmapTitle: normalizeString(form.heatmapTitle)")
        && mobileConfigBuilder.includes("showLabel: normalizeBoolean(form.showLabel, true)"),
    "移动端热力图设置必须保存空标题和关闭标签状态，不能回退到旧配置",
);
const mobileContentSheetPath = fileURLToPath(new URL("../src/homepage/mobileHomepage/MobileWidgetContentSheet.svelte", import.meta.url));
const mobileContentSheetSource = readFileSync(mobileContentSheetPath, "utf8");
for (const subpage of ["music-cloud", "favorites-manager", "countdown-center", "review-notify", "focus-notify"]) {
    assert(mobileContentSheetSource.includes(subpage), `移动内容设置缺少下级页面 ${subpage}`);
}

const mobileWidgetBlockPath = fileURLToPath(new URL("../src/homepage/mobileHomepage/mobileWidgetBlock.ts", import.meta.url));
const mobileWidgetBlockSource = readFileSync(mobileWidgetBlockPath, "utf8");
assert(
    mobileWidgetBlockSource.includes('closest(".mobile-widget-action-button")'),
    "移动组件三点按钮必须使用区块级事件委托，避免重挂载后监听器失效",
);
for (const marker of ["[contenteditable]:not([contenteditable='false'])", "[role='textbox']", ".ql-editor"]) {
    assert(mobileWidgetBlockSource.includes(marker), `移动组件交互过滤器缺少 ${marker}`);
}
assert(!stylesheet.includes("overflow-y: hidden;"), "移动组件不得通过纵向 overflow hidden 禁用内部滚动");
for (const marker of [
    '[data-widget-frame-title="optional"]',
    '[data-widget-frame-content="scrollable"]',
    '[data-widget-part="body"]',
    "overflow-y: auto !important",
    "overscroll-behavior-y: contain",
    "-webkit-overflow-scrolling: touch",
]) {
    assert(stylesheet.includes(marker), `移动组件共享滚动边界缺少 ${marker}`);
}
const widgetFramePath = fileURLToPath(new URL("../src/components/utils/widgetBlock/WidgetFrame.svelte", import.meta.url));
const widgetFrameSource = readFileSync(widgetFramePath, "utf8");
for (const marker of ['data-widget-frame-title', 'data-widget-frame-content', 'data-widget-part="header"', 'data-widget-part="body"']) {
    assert(widgetFrameSource.includes(marker), `公共组件框架缺少 ${marker}`);
}
for (const variant of ["weather.simple-1", "weather.simple-2"]) {
    assert(stylesheet.includes(`[data-widget-content-variant="${variant}"]`), `${variant} 必须覆盖移动端通用内容留白`);
}
assert(
    stylesheet.includes(":is(.content-display, .content-display-simple1)")
        && stylesheet.includes("padding: 0 !important"),
    "移动端简洁天气必须保持边到边显示",
);
const semanticTitlePath = fileURLToPath(new URL("../src/homepage/theme/widgetPresentation/components/WidgetSemanticTitle.svelte", import.meta.url));
const semanticTitleSource = readFileSync(semanticTitlePath, "utf8");
assert(semanticTitleSource.includes("hp-widget-title__summary"), "移动端公共标题必须支持右侧统计摘要");
for (const relativePath of [
    "../src/components/utils/widgetBlock/widget/quickNotes/quickNotes.svelte",
    "../src/components/utils/widgetBlock/widget/tasksPlus/tasksPlus.svelte",
    "../src/components/utils/widgetBlock/widget/latestDailyNotes/latestDailyNotes.svelte",
    "../src/components/utils/widgetBlock/widget/childDocs/childDocs.svelte",
    "../src/components/utils/widgetBlock/widget/conditionDocs/conditionDocs.svelte",
    "../src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs.svelte",
    "../src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiary.svelte",
    "../src/components/utils/widgetBlock/widget/sql/sql.svelte",
]) {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    assert(source.includes("compact={isMobilePlacement}"), `${relativePath} 缺少移动端紧凑标题注册`);
    assert(source.includes("summary={isMobilePlacement"), `${relativePath} 缺少移动端标题统计摘要`);
}
for (const [relativePath, hardcodedColor] of [
    ["../src/components/utils/widgetBlock/widget/latestDocs/latestDocs.svelte", "rgba(14, 165, 233"],
    ["../src/components/utils/widgetBlock/widget/tasks/recentTasks.svelte", "rgba(99, 102, 241"],
    ["../src/components/utils/widgetBlock/widget/favorites/favorites.svelte", "rgba(236, 72, 153"],
] as const) {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    assert(!source.includes(hardcodedColor), `${relativePath} 仍包含移动端写死主题色 ${hardcodedColor}`);
}
const accountingWidgetPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widget/accounting/accounting.svelte", import.meta.url));
const accountingWidgetSource = readFileSync(accountingWidgetPath, "utf8");
for (const marker of ['data-widget-part="root"', 'data-widget-part="body"', 'data-widget-part="list"']) {
    assert(accountingWidgetSource.includes(marker), `记账组件缺少移动滚动语义 ${marker}`);
}
assert(
    stylesheet.includes('[data-widget-context-actions="true"]')
        && stylesheet.includes(".mobile-widget-drag-handle"),
    "包含扩展动作的组件必须在移动浏览态显示操作入口并隐藏拖拽手柄",
);
for (const marker of [
    "getContextMenuActions()",
    'placement: "mobile"',
    "resolveWidgetContextMenuActions",
    "dataset.widgetContextActions",
]) {
    assert(mobileWidgetBlockSource.includes(marker), `移动组件扩展动作桥接缺少 ${marker}`);
}
const mobileActionSheetPath = fileURLToPath(new URL("../src/homepage/mobileHomepage/MobileWidgetActionSheet.svelte", import.meta.url));
const mobileActionSheetSource = readFileSync(mobileActionSheetPath, "utf8");
assert(
    mobileActionSheetSource.includes("contextActions")
        && mobileActionSheetSource.includes("onRunContextAction"),
    "移动组件操作菜单必须渲染注册表提供的扩展动作",
);
assert(
    mobileHomepageSource.includes("contextActions={selectedWidgetActions}")
        && mobileHomepageSource.includes("runSelectedContextAction"),
    "移动主页必须把扩展动作接入组件操作菜单",
);

const widgetRegistryPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widgetDefinitionRegistry.ts", import.meta.url));
const widgetRegistrySource = readFileSync(widgetRegistryPath, "utf8");
assert(
    widgetRegistrySource.includes("placementComponents: { mobile: MusicPlayerMobileLauncher }"),
    "移动主页音乐播放器必须使用轻量入口，不能重复挂载完整播放运行时",
);
const widgetMountRegistryPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widgetMountRegistry.ts", import.meta.url));
const widgetMountRegistrySource = readFileSync(widgetMountRegistryPath, "utf8");
assert(
    widgetMountRegistrySource.includes("definition.placementComponents?.[placement] ?? definition.component"),
    "Widget 挂载器必须解析 placement 专用组件",
);
const mobileMusicLauncherPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widget/musicPlayer/MusicPlayerMobileLauncher.svelte", import.meta.url));
const mobileMusicLauncherSource = readFileSync(mobileMusicLauncherPath, "utf8");
assert(
    mobileMusicLauncherSource.includes("requestOpenMobileMusicPlayer")
        && !mobileMusicLauncherSource.includes("Howl"),
    "移动主页音乐入口只能连接常驻播放器，不得加载音频运行时",
);

const mobileStyleSheetPath = fileURLToPath(new URL("../src/homepage/mobileHomepage/MobileWidgetStyleSheet.svelte", import.meta.url));
const mobileStyleSheetSource = readFileSync(mobileStyleSheetPath, "utf8");
assert(
    mobileStyleSheetSource.includes("if (await onStyleChanged()) onClose()"),
    "选择组件尺寸并保存成功后必须自动关闭样式面板",
);

const stikynotPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widget/stikynot/stikynot.svelte", import.meta.url));
const stikynotSource = readFileSync(stikynotPath, "utf8");
assert(
    stikynotSource.includes("便签暂不支持移动端编辑")
        && stikynotSource.includes("if (isMobile || !advancedEnabled")
        && stikynotSource.includes("subscribeHomepageEntitlement"),
    "移动端便签必须明确禁用且不得初始化 Quill，桌面端仍需跟随统一会员状态",
);
assert(!MOBILE_WIDGET_CATALOG.some((item) => item.type === "stikynot"), "便签不得继续出现在移动端添加目录");
assert(
    widgetRegistrySource.includes('type: "stikynot"')
        && widgetRegistrySource.includes('placements: ["homepage", "sidebar", "preview", "dock"]'),
    "便签注册表必须明确排除 mobile placement",
);
const stikynotPresetsPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widget/stikynot/stikynotPresets.ts", import.meta.url));
const stikynotPresetsSource = readFileSync(stikynotPresetsPath, "utf8");
for (const preset of ["default", "kraftPaper", "wood", "marble", "Ink", "beach", "BlueSky", "sunsetHeart", "Stars", "waterDrop", "PinkPorcelain"]) {
    assert(stikynotPresetsSource.includes(`value: "${preset}"`), `便签共享样式缺少 ${preset}`);
}
assert(
    mobileContentFormSource.includes("STIKYNOT_STYLE_PRESETS.map"),
    "移动端便签设置必须复用完整背景预设清单",
);

const dialogStylesheetPath = fileURLToPath(new URL("../src/style/dialog-viewport.css", import.meta.url));
const dialogStylesheet = readFileSync(dialogStylesheetPath, "utf8");
for (const marker of ["position: fixed !important", "height: 100dvh", "inset: 0 !important"]) {
    assert(dialogStylesheet.includes(marker), `统一移动端弹窗样式缺少 ${marker}`);
}
assert(
    dialogStylesheet.includes("--siyuan-homepage-mobile-safe-area-top: 0px"),
    "全屏 Portal 工作区必须统一声明 WebView 顶部安全区已消费",
);

const dialogHelperPath = fileURLToPath(new URL("../src/libs/dialog.ts", import.meta.url));
const dialogHelper = readFileSync(dialogHelperPath, "utf8");
assert(dialogHelper.includes("createMobileDialogPortal"), "移动端工作区必须使用项目自有全屏 Portal");
const dialogStylesPath = fileURLToPath(new URL("../src/style/dialog-viewport.css", import.meta.url));
const dialogStyles = readFileSync(dialogStylesPath, "utf8");
assert(
    dialogStyles.includes('[data-siyuan-homepage-mobile-quick-actions="true"]'),
    "插件全屏弹窗必须隐藏全局移动悬浮按钮",
);

const focusPath = fileURLToPath(new URL("../src/components/utils/widgetBlock/widget/focus/focus.svelte", import.meta.url));
const focusSource = readFileSync(focusPath, "utf8");
assert(
    focusSource.includes('runtimeContext.placement === "mobile"')
        && focusSource.includes("class:mobile={isMobilePlacement}"),
    "番茄钟必须按移动端 placement 启用触控布局",
);
assert(
    focusSource.includes(".timer.mobile .controls{opacity:1;transform:none}")
        && focusSource.includes("width:48px;height:48px;touch-action:manipulation"),
    "移动端番茄钟控制区必须常驻显示并提供足够大的触控目标",
);
assert(
    focusSource.includes('aria-label="开始或继续番茄钟"')
        && focusSource.includes('aria-label="打开番茄钟设置"'),
    "番茄钟图标按钮必须提供清晰的辅助功能标签",
);

console.log("mobile homepage verification passed");
