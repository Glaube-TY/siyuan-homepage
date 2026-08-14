import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const dialogSource = read("src/libs/dialog.ts");
const navigationSource = read("src/libs/mobileDialogNavigation.ts");
const portalSource = read("src/libs/mobileDialogPortal.ts");
const cssSource = read("src/style/dialog-viewport.css");

assert(dialogSource.includes("registerPluginDialog"), "缺少统一的项目弹窗注册入口");
assert(dialogSource.includes('mobilePresentation ?? "workspace"'), "Svelte 工作台未默认接入移动端全屏框架");
assert(portalSource.includes("registerMobileDialogNavigation"), "项目移动端 Portal 未接入局部返回栈");
assert(dialogSource.includes("createMobileDialogPortal"), "Svelte 工作区未接入独立移动端 Portal");
assert(portalSource.includes('options.closeControl === "content"'), "移动端 Portal 未限制内容自带关闭入口的声明");
assert(dialogSource.includes('closeControl: args.mobileCloseControl ?? "portal"'), "移动端 Portal 未默认保留共享关闭按钮");
assert(portalSource.includes("document.body.appendChild(host)"), "移动端 Portal 没有挂载到 document.body");
assert(!portalSource.includes("attachNativeMobileDialogToPortal"), "项目移动端弹窗不得重新挂载思源原生 Dialog");
assert(!portalSource.includes('surface.className = "b3-dialog__container'), "项目移动端全屏容器不得复用思源 Dialog 容器类");
assert(!portalSource.includes('content.className = "dialog-content'), "项目移动端全屏内容不得复用思源 Dialog 内容类");
assert(!portalSource.includes('header.className = "b3-dialog__header'), "项目移动端全屏标题不得复用思源 Dialog 标题类");
assert(navigationSource.includes('window.addEventListener("keydown", handleBackKey, true)'), "未接入移动端返回按键事件");
assert(!navigationSource.includes("history.pushState"), "移动端弹窗不得写入思源共用的浏览器历史栈");
assert(!navigationSource.includes("history.back"), "移动端弹窗不得驱动思源共用的浏览器历史栈");
assert(!navigationSource.includes('"popstate"'), "移动端弹窗不得拦截思源的路由历史事件");
assert(cssSource.includes(".siyuan-homepage-mobile-overlay-layer--workspace"), "缺少项目自有的移动端工作区全屏样式");
assert(cssSource.includes(".siyuan-homepage-mobile-overlay-layer--prompt"), "缺少项目自有的移动端紧凑操作面板样式");
assert(cssSource.includes("--siyuan-homepage-layer-mobile-dialog: 2147483000"), "移动端 Portal 缺少统一的宿主隔离层级令牌");
assert(cssSource.includes("z-index: var(--siyuan-homepage-layer-mobile-dialog) !important"), "移动端 Portal 未使用统一层级令牌");
assert(cssSource.includes("--siyuan-homepage-mobile-safe-area-top: 0px"), "移动端 Portal 工作区未声明已消费 WebView 顶部安全区");
assert(!cssSource.includes("contain: layout paint"), "移动端整屏 Portal 不应强制高成本的布局绘制隔离");
assert(!cssSource.includes("body:has(.siyuan-homepage-fullscreen-dialog)"), "移动端弹窗不得使用会随组件 DOM 变化反复求值的全局 :has 选择器");

const sourceRoot = path.join(root, "src");
const candidates: string[] = [];
function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (/\.(ts|svelte|css|scss)$/.test(entry.name)) candidates.push(absolute);
    }
}
walk(sourceRoot);

for (const file of candidates) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file).replace(/\\/g, "/");
    const lines = source.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
        if (!line.includes("env(safe-area-inset-top)")) continue;
        assert(
            line.includes("var(--siyuan-homepage-mobile-safe-area-top"),
            `${relative}:${index + 1} 绕过了统一移动端顶部安全区变量`,
        );
    }

    for (const [index, line] of lines.entries()) {
        if (!line.includes('mobileHeader: "hidden"') && !line.includes('title: ""')) continue;
        const nearby = lines.slice(Math.max(0, index - 12), index + 13).join("\n");
        if (!nearby.includes("svelteDialog(") && !nearby.includes("simpleDialog(")) continue;
        assert(
            nearby.includes('mobileCloseControl: "content"'),
            `${relative}:${index + 1} 隐藏共享标题栏前未声明内容自带关闭入口`,
        );
    }

    if (!source.includes("new Dialog(")) continue;
    assert(relative === "src/libs/dialog.ts", `${relative} 绕过了统一弹窗创建入口`);
}

const customMobileCloseMarkers: Array<[string, string]> = [
    ["src/components/utils/widgetBlock/widget/enhancedDiary/workspace/components/WorkspaceHeader.svelte", 'aria-label="关闭强化日记工作台"'],
    ["src/homepage/mobileHomepage/mobileHomepage.svelte", 'aria-label="关闭移动主页"'],
    ["src/homepage/mobileQuickActions/MobileQuickActionsSettingsDialog.svelte", 'aria-label="关闭移动端设置"'],
    ["src/features/kb/components/panels/kb-main-panel.svelte", 'aria-label="关闭 AI 知识库"'],
    ["src/features/kb/components/panels/kb-premium-gate-panel.svelte", 'aria-label="关闭 AI 知识库"'],
    ["src/components/utils/widgetBlock/widget/visualChart/VisualChartConsole.svelte", 'aria-label="关闭可视化图表工作台"'],
    ["src/features/countdown-center/components/CountdownCenterHeader.svelte", 'label="关闭纪念日中心"'],
    ["src/features/favorites-manager/components/FavoritesManagerDialog.svelte", 'aria-label="关闭收藏文档管理"'],
    ["src/components/utils/widgetBlock/widget/musicPlayer/MusicPlayerMobilePage.svelte", 'aria-label="关闭播放器"'],
    ["src/components/utils/widgetBlock/widget/accounting/AccountingDetailDialog.svelte", 'aria-label="关闭记账"'],
    ["src/components/utils/widgetBlock/widget/habitTracker/HabitTrackerDialog.svelte", 'aria-label="关闭习惯中心"'],
    ["src/components/utils/widgetBlock/widget/focus/FocusCenterDialog.svelte", 'aria-label="关闭专注中心"'],
    ["src/components/utils/widgetBlock/widget/globalCalendar/GlobalCalendarDetailDialog.svelte", 'aria-label="关闭全局日历"'],
];

for (const [relative, marker] of customMobileCloseMarkers) {
    assert(read(relative).includes(marker), `${relative} 缺少适配自身布局的移动端关闭入口`);
}

const kbMainSource = read("src/features/kb/components/panels/kb-main-panel.svelte");
assert(kbMainSource.includes("min-width: 44px"), "AI 知识库移动端工具栏按钮宽度不足 44px");
assert(kbMainSource.includes("min-height: 44px"), "AI 知识库移动端工具栏按钮高度不足 44px");

const indexSource = read("src/index.ts");
const quickNotesOpenStart = indexSource.indexOf("private async openQuickNotesDialog");
const quickNotesOpenEnd = indexSource.indexOf("private registerHomepageTopBar", quickNotesOpenStart);
assert(quickNotesOpenStart >= 0 && quickNotesOpenEnd > quickNotesOpenStart, "无法定位快速笔记弹窗入口");
assert(
    !indexSource.slice(quickNotesOpenStart, quickNotesOpenEnd).includes('mobilePresentation: "prompt"'),
    "快速笔记应保持移动端全屏工作区展示",
);
const quickNotesDialogSource = read("src/components/utils/widgetBlock/widget/quickNotes/quickNotesDialog.svelte");
assert(quickNotesDialogSource.includes("width: 100%"), "快速笔记输入区未适配移动端宽度");
assert(!quickNotesDialogSource.includes("width: 400px"), "快速笔记不得保留桌面固定输入宽度");
assert(!quickNotesDialogSource.includes("height: 200px"), "快速笔记不得保留桌面固定输入高度");
assert(quickNotesDialogSource.includes("flex: 1 1 auto"), "快速笔记输入区未占满全屏剩余空间");
assert(quickNotesDialogSource.includes("min-height: 44px"), "快速笔记操作按钮高度不足 44px");

console.log("移动端弹窗框架验证通过");
