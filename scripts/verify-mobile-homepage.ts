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
    "mobile-homepage-fab",
    "mobile-widget-hidden-by-section",
    "data-widget-kind=\"list\"",
    "data-widget-kind=\"chart\"",
    "data-widget-kind=\"complex\"",
    "mobile-widget-size-fallback",
]) {
    assert(stylesheet.includes(marker), `移动主页样式缺少 ${marker}`);
}
assert(
    stylesheet.includes("var(--siyuan-homepage-mobile-safe-area-top, env(safe-area-inset-top))"),
    "移动主页顶部安全区必须通过统一 Portal 变量解析",
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
    mobileHomepageSource.includes("button:not(.mobile-widget-drag-handle)"),
    "Sortable 过滤交互控件时不得连拖拽手柄一起排除",
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

console.log("mobile homepage verification passed");
