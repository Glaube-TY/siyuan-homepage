import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const homepagePath = "src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiary.svelte";
const snapshotPath = "src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryHomepageSnapshot.ts";
const overviewPath = "src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceOverview.ts";
const homepageSource = readFileSync(homepagePath, "utf8");
const snapshotSource = readFileSync(snapshotPath, "utf8");
const overviewSource = readFileSync(overviewPath, "utf8");

for (const marker of [
  'data-widget-part="root"',
  'data-widget-part="body"',
  "WidgetSemanticTitle",
  "enhanced-diary-quick-dock",
  "enhanced-diary-today",
  "enhanced-diary-metrics",
  "enhanced-diary-focus",
  "enhanced-diary-period-track",
  "WorkspaceOverviewIcon",
  "todayDiaryStatus",
  'name="dashboard"',
  'name="taskAdd"',
  'name="recordAdd"',
  "TASK_DATA_UPDATED_EVENT",
  "requestAnimationFrame",
  "toggleWorkspaceTaskComplete",
]) {
  assert.match(homepageSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `主页缺少契约：${marker}`);
}

for (const legacyMarker of [
  "enhanced-diary-toolbar",
  "enhanced-diary-tool-button",
  "enhanced-diary-header",
  "enhanced-diary-title",
  "enhanced-diary-open-button",
  "enhanced-diary-quick-actions",
  "enhanced-diary-summary",
  "enhanced-diary-warning",
  "enhanced-diary-empty",
  "cards-grid",
  "diary-card",
  "card-countdown",
]) {
  assert.doesNotMatch(homepageSource, new RegExp(legacyMarker), `主页不应保留旧视觉结构：${legacyMarker}`);
}

for (const emoji of ["⏰", "✅", "⚠️", "📅", "📝", "📁", "🎯"]) {
  assert.doesNotMatch(homepageSource, new RegExp(emoji), `主页不应使用 Emoji 功能图标：${emoji}`);
}

for (const [stateName, statePattern] of [
  ["config", /let config = \$state\.raw<EnhancedDiaryConfig \| null>\(null\)/],
  ["cards", /let cards = \$state\.raw<CardInfo\[\]>\(\[\]\)/],
  ["menuCard", /let menuCard = \$state\.raw<CardInfo \| null>\(null\)/],
  ["homepageSnapshot", /let homepageSnapshot = \$state\.raw<EnhancedDiaryHomepageSnapshot \| null>\(null\)/],
] as const) {
  assert.match(homepageSource, statePattern, `${stateName} 必须使用 replace-only 的 $state.raw`);
}
assert.match(homepageSource, /let snapshotLoading = \$state\(false\)/, "Snapshot 必须有明确 loading 状态");
assert.match(homepageSource, /let snapshotLoadError = \$state<string \| null>\(null\)/, "Snapshot 必须有明确 error 状态");

assert.match(homepageSource, /enhanced-diary-period-item[\s\S]*?type="button"/, "周期项目必须使用真实 button");
assert.match(homepageSource, /handleCardKeydown[\s\S]*?getBoundingClientRect/, "周期项目键盘操作必须保留菜单定位");
assert.match(homepageSource, /openWorkspace\(initialTab = "overview"\)[\s\S]*?openEnhancedDiaryWorkspace\(initialTab\)/, "工作台入口必须支持目标 tab");
assert.match(homepageSource, /class="enhanced-diary-today"[\s\S]*?onclick=\{openTodayDiary\}/, "Today Hero 必须承担今日日记入口");
assert.match(homepageSource, /loadAndBuildCards[\s\S]*?config = loaded[\s\S]*?Promise\.all\([\s\S]*?buildCards\(loaded\)[\s\S]*?loadHomepageSnapshot\(generation\)/, "初始化必须并行加载周期卡和主页 Snapshot");
assert.match(homepageSource, /submitNewTask[\s\S]*?loadHomepageSnapshot\(\)[\s\S]*?submitNewRecord[\s\S]*?loadHomepageSnapshot\(\)/, "新增任务和记录后只能刷新 Snapshot");
assert.match(homepageSource, /finally[\s\S]*?focusTaskBusyId = ""/, "焦点任务必须清理 busy 状态");

const topbarStart = homepageSource.indexOf('<div class="enhanced-diary-topbar">');
const topbarEnd = homepageSource.indexOf("</div>", topbarStart);
assert.ok(topbarStart >= 0 && topbarEnd > topbarStart, "无法提取强化日记 topbar");
const topbarMarkup = homepageSource.slice(topbarStart, topbarEnd);
assert.doesNotMatch(topbarMarkup, /<button|WorkspaceOverviewIcon/, "topbar 只能保留 WidgetSemanticTitle");

const quickDockStart = homepageSource.indexOf('<div class="enhanced-diary-quick-dock"');
const quickDockEnd = homepageSource.indexOf("</div>", quickDockStart);
const todayHeroStart = homepageSource.indexOf('class="enhanced-diary-today"');
const metricsStart = homepageSource.indexOf('<div class="enhanced-diary-metrics"');
assert.ok(quickDockStart >= 0 && quickDockEnd > quickDockStart, "无法提取 Quick Dock");
assert.ok(todayHeroStart >= 0 && todayHeroStart < quickDockStart && quickDockStart < metricsStart, "Quick Dock 必须位于 Today Hero 和 Metrics 之间");
const quickDockMarkup = homepageSource.slice(quickDockStart, quickDockEnd);
for (const iconName of ["dashboard", "taskAdd", "recordAdd"]) {
  assert.match(quickDockMarkup, new RegExp(`name="${iconName}"`), `Quick Dock 缺少 ${iconName} 图标`);
}
assert.doesNotMatch(quickDockMarkup, /name="today"/, "Quick Dock 不得重复提供 Today 入口");
for (const label of ["打开强化日记工作台", "新建任务", "快速记录"]) {
  assert.ok(quickDockMarkup.includes(`title="${label}"`), `Quick Dock 缺少 title：${label}`);
  assert.ok(quickDockMarkup.includes(`aria-label="${label}"`), `Quick Dock 缺少 aria-label：${label}`);
}
assert.match(quickDockMarkup, /\{#if taskManagementEnabled\}[\s\S]*name="taskAdd"/, "taskAdd 必须受 taskManagementEnabled 控制");
assert.doesNotMatch(quickDockMarkup, /<span\b/, "Quick Dock 只能保留图标，不得增加文字按钮内容");

const quickDockStyle = homepageSource.match(/\.enhanced-diary-quick-dock\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(quickDockStyle, "无法提取 Quick Dock 样式");
assert.doesNotMatch(quickDockStyle, /position\s*:\s*(?:absolute|fixed)/, "Quick Dock 必须参与正常文档流");
assert.doesNotMatch(quickDockStyle, /(?:^|[;\n])\s*width\s*:\s*100%/, "Quick Dock 不得铺满整行");
const topbarStyle = homepageSource.match(/\.enhanced-diary-topbar\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(topbarStyle, "无法提取 topbar 样式");
assert.match(topbarStyle, /padding-inline-end\s*:\s*(?:3[6-9]|4[0-2])px/, "topbar 必须为 Homepage host chrome 预留右侧安全区");
assert.match(homepageSource, /drag handle[\s\S]*host chrome/i, "topbar 必须说明通用 drag handle 的 host chrome 边界");
assert.match(homepageSource, /\.enhanced-diary-container\.is-mobile-placement[\s\S]*padding-inline-end\s*:\s*0/, "移动端应取消无意义的桌面 drag handle 安全区");

const mobileEditingSafeZone = homepageSource.match(
  /:global\([\s\S]*?mobile-homepage--editing[\s\S]*?\)[\s\S]*?\.enhanced-diary-container\.is-mobile-placement[\s\S]*?\.enhanced-diary-topbar\s*\{([\s\S]*?)\}/,
)?.[1];
assert.ok(mobileEditingSafeZone, "Mobile Homepage 编辑模式必须存在宿主 chrome 安全区");
assert.match(
  mobileEditingSafeZone,
  /padding-inline-end\s*:\s*(?:9[8-9]|10[0-9]|110)px/,
  "Mobile Homepage 编辑模式必须覆盖宿主控件本体、edge inset 和视觉安全间距",
);

const mobileContextSafeZone = homepageSource.match(
  /:global\([\s\S]*?widget-block\[data-widget-context-actions="true"\][\s\S]*?\)[\s\S]*?\.enhanced-diary-container\.is-mobile-placement[\s\S]*?\.enhanced-diary-topbar\s*\{([\s\S]*?)\}/,
);
assert.ok(mobileContextSafeZone, "非编辑 context action 状态必须存在宿主 chrome 安全区");
assert.match(mobileContextSafeZone[0], /mobile-homepage--editing|:not\(/, "context action 安全区必须限定真实的非编辑状态");
assert.match(
  mobileContextSafeZone[1],
  /padding-inline-end\s*:\s*(?:5[2-9]|60)px/,
  "单个 Mobile Widget action button 必须覆盖控件本体、edge inset 和视觉安全间距",
);

for (const hostChromeMarker of ["mobile-widget-chrome", "mobile-widget-action-button", "mobile-widget-drag-handle"]) {
  assert.doesNotMatch(homepageSource, new RegExp(hostChromeMarker), `强化日记不得直接修改宿主控件：${hostChromeMarker}`);
}

const legacyThemeFiles = [
  ["Card", "src/homepage/theme/builtins/card/widgets/_specialized.scss"],
  ["Paper", "src/homepage/theme/builtins/paper/widgets/_specialized.scss"],
  ["Hand-drawn", "src/homepage/theme/builtins/hand-drawn/widgets/_specialized.scss"],
  ["Simple-Test", "src/homepage/theme/builtins/simple-test/widgets/specific/_workspace-tools.scss"],
] as const;
const legacyEnhancedDiarySelectors = [
  ".enhanced-diary-header",
  ".enhanced-diary-title",
  ".enhanced-diary-open-button",
  ".enhanced-diary-quick-actions",
  ".enhanced-diary-summary",
  ".enhanced-diary-warning",
  ".enhanced-diary-empty",
] as const;
for (const [themeName, themePath] of legacyThemeFiles) {
  const themeSource = readFileSync(themePath, "utf8");
  for (const selector of legacyEnhancedDiarySelectors) {
    assert.doesNotMatch(
      themeSource,
      new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${themeName} 主题不得保留旧强化日记 selector：${selector}`,
    );
  }
  if (themeName === "Card") {
    assert.doesNotMatch(themeSource, /\.diary-card\b/, "Card 主题不得保留旧强化日记 diary-card selector");
  }
}

const snapshotLoaderStart = homepageSource.indexOf("async function loadHomepageSnapshot(");
const snapshotLoaderEnd = homepageSource.indexOf("    const PERIOD_SHORT_LABELS", snapshotLoaderStart);
assert.ok(snapshotLoaderStart >= 0 && snapshotLoaderEnd > snapshotLoaderStart, "无法提取 Snapshot 加载函数");
const snapshotLoaderSource = homepageSource.slice(snapshotLoaderStart, snapshotLoaderEnd);
assert.match(snapshotLoaderSource, /generation === snapshotLoadGeneration/, "Snapshot freshness 必须检查 snapshot generation");
assert.match(snapshotLoaderSource, /expectedLoadGeneration === loadGeneration/, "Snapshot freshness 必须检查配置 generation");
assert.doesNotMatch(
  homepageSource,
  /(?:nextConfig|config)\s*(?:===|!==)\s*(?:config|nextConfig)/,
  "Snapshot freshness 不得比较配置对象 identity",
);
assert.match(snapshotLoaderSource, /catch[\s\S]*snapshotLoadError = "今日状态暂时无法读取"/, "Snapshot 失败必须记录 error 状态");
assert.match(snapshotLoaderSource, /finally[\s\S]*generation === snapshotLoadGeneration[\s\S]*snapshotLoading = false/, "旧 Snapshot 请求不得提前关闭 loading 状态");

const bodyStart = homepageSource.indexOf('<div class="enhanced-diary-body"');
const periodSectionStart = homepageSource.indexOf('<section class="enhanced-diary-periods"', bodyStart);
assert.ok(bodyStart >= 0 && periodSectionStart > bodyStart, "无法提取 Homepage Snapshot 状态区域");
const snapshotStateMarkup = homepageSource.slice(bodyStart, periodSectionStart);
assert.match(snapshotStateMarkup, /\{#if homepageSnapshot\}/, "Snapshot 成功状态必须优先渲染");
assert.match(snapshotStateMarkup, /\{:else if snapshotLoading\}[\s\S]*正在读取今日状态…/, "Snapshot 必须有真实 loading 分支");
assert.match(snapshotStateMarkup, /\{:else\}[\s\S]*今日状态暂时无法读取[\s\S]*重新读取今日状态/, "Snapshot 初次失败必须提供可访问重试入口");
assert.match(snapshotStateMarkup, /name="refresh"/, "Snapshot 重试入口必须使用 refresh 图标");
assert.match(snapshotStateMarkup, /onclick=\{\(\) => void loadHomepageSnapshot\(\)\}/, "Snapshot 重试入口只能刷新 Snapshot");
const retryStart = snapshotStateMarkup.indexOf('class="enhanced-diary-retry"');
const retryEnd = snapshotStateMarkup.indexOf("</button>", retryStart);
assert.ok(retryStart >= 0 && retryEnd > retryStart, "无法提取 Snapshot 重试按钮");

const periodTrackStart = homepageSource.indexOf('<div class="enhanced-diary-period-track">');
const periodTrackEnd = homepageSource.indexOf("</section>", periodTrackStart);
assert.ok(periodTrackStart >= 0 && periodTrackEnd > periodTrackStart, "无法提取周期状态轨道");
const periodTrackMarkup = homepageSource.slice(periodTrackStart, periodTrackEnd);
const countdownBlocks = Array.from(periodTrackMarkup.matchAll(/\{#if card\.countdown\}([\s\S]*?)\{\/if\}/g));
assert.ok(countdownBlocks.length > 0, "周期必须保留 countdown 条件渲染");
const countdownMarkup = countdownBlocks[0]?.[1] || "";
assert.match(countdownMarkup, /class="enhanced-diary-period-countdown"/, "周期 countdown 必须使用专用结构");
assert.match(countdownMarkup, /WorkspaceOverviewIcon\s+name="clock"/, "周期 countdown 必须携带 clock 图标");
assert.match(countdownMarkup, /<span>\s*\{card\.countdown\}\s*<\/span>/, "周期 countdown 文本必须独立包裹在 span 中");

const countdownStyle = homepageSource.match(/\.enhanced-diary-period-countdown\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(countdownStyle, "无法提取周期 countdown 样式");
assert.match(countdownStyle, /display\s*:\s*inline-flex/, "周期 countdown 必须使用行级 flex 布局");
assert.match(countdownStyle, /align-self\s*:\s*flex-start/, "周期 countdown 必须左对齐");
assert.match(countdownStyle, /max-width\s*:\s*100%/, "周期 countdown 不得横向溢出");
assert.doesNotMatch(countdownStyle, /overflow\s*:/, "周期 countdown 容器不得承担文本裁切");

const countdownIconStyle = homepageSource.match(/\.enhanced-diary-period-countdown\s+:global\(svg\)\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(countdownIconStyle, "无法提取周期 countdown 图标样式");
assert.match(countdownIconStyle, /flex\s*:\s*0\s+0\s+auto/, "周期 countdown 图标必须禁止收缩");

const countdownTextStyle = homepageSource.match(/\.enhanced-diary-period-countdown\s*>\s*span\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(countdownTextStyle, "无法提取周期 countdown 文本样式");
assert.match(countdownTextStyle, /overflow\s*:\s*hidden/, "周期 countdown 只能裁切文本 span");
assert.match(countdownTextStyle, /text-overflow\s*:\s*ellipsis/, "周期 countdown 文本必须使用省略号");
assert.match(countdownTextStyle, /white-space\s*:\s*nowrap/, "周期 countdown 文本必须保持单行");

const metricStyle = homepageSource.match(/\.enhanced-diary-metric\s*>\s*span\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(metricStyle, "无法提取统计项内部布局样式");
assert.match(metricStyle, /display\s*:\s*flex/, "统计项内部必须使用 flex 布局");
assert.match(metricStyle, /flex-direction\s*:\s*row/, "统计项默认必须标签与数值同行");
assert.match(metricStyle, /flex-wrap\s*:\s*wrap/, "统计项空间不足时必须允许自然换行");

const metricLabelStyle = homepageSource.match(/\.enhanced-diary-metric\s*>\s*span\s*>\s*span\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(metricLabelStyle, "无法提取统计标签样式");
assert.match(metricLabelStyle, /white-space\s*:\s*nowrap/, "统计标签必须保持单行");

const metricStrongStyle = homepageSource.match(/\.enhanced-diary-metric\s+strong\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(metricStrongStyle, "无法提取统计数值样式");
assert.doesNotMatch(metricStrongStyle, /margin-left\s*:\s*auto/, "统计数值不得被推到最右侧");

const metricStyleStart = homepageSource.indexOf(".enhanced-diary-metric {");
const metricStyleEnd = homepageSource.indexOf(".enhanced-diary-focus", metricStyleStart);
assert.ok(metricStyleStart >= 0 && metricStyleEnd > metricStyleStart, "无法提取统计区样式范围");
assert.doesNotMatch(
  homepageSource.slice(metricStyleStart, metricStyleEnd),
  /justify-content\s*:\s*space-between/,
  "统计项不得使用 space-between 把数值推到右侧",
);
assert.doesNotMatch(snapshotStateMarkup.slice(retryStart, retryEnd), /loadAndBuildCards/, "Snapshot 重试不得重建周期卡");

for (const forbidden of ["loadEnhancedDiaryWorkspaceState", "loadTaskData", "queryWorkspaceTasks", "refreshTaskIndex", "sqlChecked", "batchGetBlockAttrs"]) {
  assert.doesNotMatch(snapshotSource, new RegExp(forbidden), `Homepage Snapshot 不应调用：${forbidden}`);
}
for (const required of [
  "lookupDiaryDocumentForDate",
  "buildEnhancedDiaryWorkspaceSummary",
  "readTaskIndexSnapshot",
  "readEnhancedDiaryProjectIndex",
  "parseTaskLine",
  "isTaskCompleted",
  "extractTaskTags",
  "deriveWorkspaceTaskScheduleFlags",
  "isEnhancedDiarySystemTaskMarkdown",
  "status: \"unreadable\"",
  "selectOverviewFocusTasks(tasks, 3)",
]) {
  assert.match(snapshotSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Snapshot 缺少契约：${required}`);
}
assert.match(snapshotSource, /root\.status === "active"/, "项目统计必须只计入 active root");
assert.match(snapshotSource, /Promise\.allSettled/, "Snapshot 数据域必须隔离失败");
assert.match(overviewSource, /limit = 5/, "工作台 focus selector 必须保留默认 5 条");
assert.match(overviewSource, /slice\(0, Math\.max\(0, limit\)\)/, "focus selector 必须支持主页限制为 3 条");

const styleStart = homepageSource.indexOf(".enhanced-diary-container {");
const menuStyleStart = homepageSource.indexOf(":global(.enhanced-diary-body-menu-overlay)");
assert.ok(styleStart >= 0 && menuStyleStart > styleStart, "无法定位强化日记局部样式");
const localStyle = homepageSource.slice(styleStart, menuStyleStart);
const rootStyleEnd = homepageSource.indexOf("}", styleStart);
assert.ok(rootStyleEnd > styleStart, "无法提取强化日记根区域样式");
assert.doesNotMatch(homepageSource.slice(styleStart, rootStyleEnd), /overflow-y:\s*auto/, "根容器不得整体滚动");
assert.match(localStyle, /\.enhanced-diary-body\s*\{[\s\S]*?overflow-y:\s*auto/, "body 必须承担唯一纵向滚动");
assert.match(localStyle, /container-name:\s*hp-widget/, "主页组件必须建立容器查询上下文");
assert.match(localStyle, /@container hp-widget/, "响应式必须使用 Widget 容器查询");

console.log("enhanced diary homepage contracts verified");
