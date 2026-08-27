import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveWidgetPresentation } from "../src/homepage/theme/widgetPresentation/resolver";
import { WIDGET_PRESENTATION_CONTRACT_VERSION, type WidgetDefinition, type WidgetPresentationManifest } from "../src/homepage/theme/widgetPresentation/types";
import { classifyWidgetTitle } from "../src/homepage/theme/widgetPresentation/titleCompatibility";
import { validateWidgetPresentationManifest } from "../src/homepage/theme/widgetPresentation/presentationRegistry";
import { resolveWidgetShellVariant, serializeWidgetShellTokens } from "../src/homepage/theme/widgetPresentation/shell";
import { assertDeviceViewSegment } from "../src/homepage/deviceView/deviceViewPaths";
import { resolveFocusBreakDurations } from "../src/components/utils/widgetBlock/widget/focus/focusConfig";
import {
    normalizeWidgetContentForRuntime,
    resolveWidgetRuntimeInstanceId,
} from "../src/components/utils/widgetBlock/utils/widgetRuntimeIdentity";

const renderer = (() => undefined) as WidgetDefinition["component"];
const semanticDefinition: WidgetDefinition = {
    type: "sample-list",
    kind: "list",
    presentationCategory: "collection",
    component: renderer,
    requiresPlugin: false,
    semanticLabel: "示例列表",
    semanticIcon: "documents.recent",
    supportedPlacements: ["homepage"],
    defaultPresentationScope: "full",
    frame: { title: "optional", content: "scrollable" },
    capabilities: {
        cssTokens: true,
        semanticParts: true,
        themeIcon: true,
        rendererOverride: false,
        stateful: true,
    },
    presentationContractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
};
const legacyDefinition: WidgetDefinition = {
    ...semanticDefinition,
    type: "legacy-list",
    defaultPresentationScope: "native",
    capabilities: { ...semanticDefinition.capabilities, semanticParts: false, themeIcon: false },
};
const classicManifest: WidgetPresentationManifest = {
    contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
    generic: { id: "classic.legacy" },
};

const specific = resolveWidgetPresentation({
    themeId: "test.theme",
    definition: semanticDefinition,
    manifest: {
        contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
        generic: { id: "test.generic" },
        kinds: { list: { id: "test.list" } },
        widgets: { "sample-list": { id: "test.sample", scope: "chrome" } },
        icons: { "documents.recent": "iconFile" },
        shell: {
            id: "test.sheet",
            variants: 4,
            tokens: { background: "var(--test-sheet)", border: "0", borderRadius: "0", boxShadow: "none" },
        },
    },
    classicManifest,
});
assert.equal(specific.presentationId, "test.sample");
assert.equal(specific.level, "theme-widget");
assert.equal(specific.scope, "chrome", "Theme descriptor scope 必须覆盖 Definition 默认值");
assert.equal(specific.resolvedIcon, "iconFile");
assert.equal(specific.shell?.id, "test.sheet");
assert.equal(specific.shell?.state, "applied");
assert.equal(specific.shell?.variants, 4);
assert.equal(
    serializeWidgetShellTokens(specific.shell),
    "--hp-widget-shell-background:var(--test-sheet);--hp-widget-shell-border:0;--hp-widget-shell-border-radius:0;--hp-widget-shell-box-shadow:none",
    "Widget 外壳令牌必须只序列化到主页根节点 CSS 变量",
);
assert.equal(resolveWidgetShellVariant("stable-widget", 4), resolveWidgetShellVariant("stable-widget", 4), "外壳变体必须稳定");
assert.ok(resolveWidgetShellVariant("stable-widget", 4) >= 1 && resolveWidgetShellVariant("stable-widget", 4) <= 4);

const excludedShell = resolveWidgetPresentation({
    themeId: "test.theme",
    definition: semanticDefinition,
    manifest: {
        contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
        generic: { id: "test.generic" },
        shell: { id: "test.sheet", exclude: { widgetTypes: ["sample-list"] } },
    },
    classicManifest,
});
assert.equal(excludedShell.shell?.state, "excluded", "主题必须能从统一外壳中排除指定 Widget");

const category = resolveWidgetPresentation({
    themeId: "test.theme",
    definition: semanticDefinition,
    manifest: {
        contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
        categories: { collection: { id: "test.collection" } },
        kinds: { list: { id: "test.legacy-list" } },
    },
    classicManifest,
});
assert.equal(category.level, "theme-category", "主题呈现类别必须优先于旧版功能 kind");
assert.equal(category.presentationId, "test.collection");
assert.equal(category.presentationCategory, "collection");

const variant = resolveWidgetPresentation({
    themeId: "test.theme",
    definition: semanticDefinition,
    contentVariant: "sample-list.calendar",
    manifest: {
        contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
        variants: { "sample-list.calendar": { id: "test.calendar-variant" } },
        widgets: { "sample-list": { id: "test.sample" } },
    },
    classicManifest,
});
assert.equal(variant.level, "theme-variant", "展示变体必须优先于组件级呈现");
assert.equal(variant.presentationVariant, "sample-list.calendar");

const excludedContentVariantShell = resolveWidgetPresentation({
    themeId: "test.theme",
    definition: semanticDefinition,
    contentVariant: "timedate.dial",
    manifest: {
        contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION,
        generic: { id: "test.generic" },
        shell: { id: "test.sheet", exclude: { presentationVariants: ["timedate.dial"] } },
    },
    classicManifest,
});
assert.equal(excludedContentVariantShell.contentVariant, "timedate.dial", "Presentation 必须保留实例内容形态语义");
assert.equal(excludedContentVariantShell.shell?.state, "excluded", "主题必须能按实例内容形态排除外壳");

const kind = resolveWidgetPresentation({
    themeId: "test.theme",
    definition: semanticDefinition,
    manifest: { contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION, kinds: { list: { id: "test.list" } } },
    classicManifest,
});
assert.equal(kind.level, "theme-kind");
assert.equal(kind.scope, "full", "未覆盖时必须继承 Definition 默认 scope");
assert.deepEqual(kind.fallbackTrail, ["theme-variant", "theme-widget", "theme-category", "theme-kind"]);

const generic = resolveWidgetPresentation({
    themeId: "test.theme",
    definition: semanticDefinition,
    manifest: { contractVersion: WIDGET_PRESENTATION_CONTRACT_VERSION, generic: { id: "test.generic" } },
    classicManifest,
});
assert.equal(generic.level, "theme-generic");

const semantic = resolveWidgetPresentation({ themeId: "test.theme", definition: semanticDefinition, classicManifest });
assert.equal(semantic.level, "semantic");
assert.equal(semantic.presentationId, "compat.semantic");

const classic = resolveWidgetPresentation({ themeId: "test.theme", definition: legacyDefinition, classicManifest });
assert.equal(classic.level, "classic");
assert.equal(classic.presentationId, "classic.legacy");

const legacy = resolveWidgetPresentation({ themeId: "test.theme", definition: legacyDefinition });
assert.equal(legacy.level, "legacy");
assert.deepEqual(legacy.fallbackTrail, ["theme-variant", "theme-widget", "theme-category", "theme-kind", "theme-generic", "semantic", "classic", "legacy"]);
assert.equal(classifyWidgetTitle("latest-docs", "🕒最近文档"), "historical-default");
assert.equal(classifyWidgetTitle("latest-docs", "我的文档"), "custom");
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 2 }),
    /Contract 版本/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, generic: { id: "valid.id", mode: "invalid" } }),
    /mode 非法/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, generic: { id: "valid.id", scope: "invalid" } }),
    /scope 非法/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, shell: { id: "valid.shell", variants: 13 } }),
    /1 到 12/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, shell: { id: "valid.shell", tokens: { background: "red;display:none" } } }),
    /安全的 CSS 值/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, shell: { id: "valid.shell", exclude: { contentVariants: ["illegal variant"] } } }),
    /contentVariants/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, shell: { id: "valid.shell", exclude: { presentationVariants: ["illegal variant"] } } }),
    /presentationVariants/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, categories: { task: { id: "valid.id" } } }),
    /presentation category/,
);
assert.throws(
    () => validateWidgetPresentationManifest({ contractVersion: 1, variants: { "illegal variant": { id: "valid.id" } } }),
    /presentation variant/,
);

function collectSourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? collectSourceFiles(path) : [path];
    });
}

const definitionSource = readFileSync("src/components/utils/widgetBlock/widgetDefinitionRegistry.ts", "utf8");
const registeredTypes = [...definitionSource.matchAll(/defineWidget\(\{ type: "([^"]+)"/g)].map((match) => match[1]);
assert.equal(registeredTypes.length, 37, "所有现有 Widget 都必须进入统一 Definition Registry");
assert.equal(new Set(registeredTypes).size, registeredTypes.length, "Widget Definition type 必须唯一");
for (const type of ["latest-docs", "favorites", "recent-journals", "TaskMan", "notebrain"]) {
    assert.ok(registeredTypes.includes(type), `Definition Registry 缺少 ${type}`);
}
for (const capability of ["semanticLabel", "semanticIcon", "supportedPlacements", "capabilities", "responsiveProfile", "presentationCategory", "presentationVariants", "resolveContentVariant", "frame"]) {
    assert.match(definitionSource, new RegExp(capability), `Widget Definition 缺少 ${capability}`);
}

const registeredScopes = [...definitionSource.matchAll(/defineWidget\(\{ type: "([^"]+)", kind: "[^"]+", category: "[^"]+", scope: "(full|chrome|native)"/g)]
    .map((match) => [match[1], match[2]] as const);
assert.equal(registeredScopes.length, 37, "全部 Widget 必须显式声明 Presentation Scope");
const scopeByType = new Map(registeredScopes);
const expectedFull = ["latest-docs", "favorites", "recent-journals", "TaskMan", "HOT", "childDocs", "conditionDocs", "quick-notes", "TaskManPlus"];
const expectedChrome = ["sql", "constellation", "reviewDocs", "fixedAssets"];
for (const type of expectedFull) assert.equal(scopeByType.get(type), "full", `${type} 必须归类为 full`);
for (const type of expectedChrome) assert.equal(scopeByType.get(type), "chrome", `${type} 必须归类为 chrome`);
assert.equal([...scopeByType.values()].filter((scope) => scope === "native").length, 22, "必须保留 22 个 native Widget");
assert.match(definitionSource, /semanticParts: input\.scope !== "native"/, "full/chrome 必须启用 semanticParts，native 必须保持关闭");
const registeredFrames = [...definitionSource.matchAll(/defineWidget\(\{[^\n]+?frame: ([A-Z_]+_FRAME)/g)];
assert.equal(registeredFrames.length, 37, "全部 Widget 必须显式注册标题区与内容区框架");
assert.match(definitionSource, /TITLE_SCROLL_FRAME[\s\S]*title: "optional"[\s\S]*content: "scrollable"/, "标题列表组件必须注册固定标题与滚动内容区");
assert.match(definitionSource, /CONTENT_CONTAINED_FRAME[\s\S]*title: "none"[\s\S]*content: "contained"/, "单信息组件必须能注册为无标题填充内容区");

const mountSource = readFileSync("src/components/utils/widgetBlock/widgetMountRegistry.ts", "utf8");
const legacyFocusConfig = {
    type: "focus",
    blockId: "block-legacy-focus",
    data: {
        focusDuration: 40,
        breakDuration: 10,
        timerStyle: "circular-progress",
        timerFontSize: 4,
        showFocusInfo: true,
    },
};
const runtimeFocusConfig = normalizeWidgetContentForRuntime(legacyFocusConfig, "block-runtime-focus");
assert.equal(runtimeFocusConfig.instanceId, "block-runtime-focus", "挂载时必须优先使用真实 Widget 实例 ID");
assert.equal(runtimeFocusConfig.blockId, "block-legacy-focus", "挂载时不得删除 legacy blockId");
assert.equal("instanceId" in legacyFocusConfig, false, "挂载归一化不得修改原始配置对象");
assert.equal(
    resolveWidgetRuntimeInstanceId("block-runtime-focus", legacyFocusConfig),
    "block-runtime-focus",
    "运行时实例 ID 必须优先于持久化配置",
);
assert.equal(
    resolveWidgetRuntimeInstanceId(undefined, legacyFocusConfig),
    "block-legacy-focus",
    "缺少运行时 ID 时必须回退 legacy blockId",
);
assert.deepEqual(
    resolveFocusBreakDurations(legacyFocusConfig.data, { shortBreakDuration: 5, longBreakDuration: 15 }),
    { shortBreakDuration: 10, longBreakDuration: 10 },
    "旧版 breakDuration 必须同时恢复短休息和长休息时长",
);
assert.deepEqual(
    resolveFocusBreakDurations(
        { ...legacyFocusConfig.data, shortBreakDuration: 7, longBreakDuration: 12 },
        { shortBreakDuration: 5, longBreakDuration: 15 },
    ),
    { shortBreakDuration: 7, longBreakDuration: 12 },
    "新版休息字段必须优先于 legacy breakDuration",
);
assert.throws(
    () => assertDeviceViewSegment(undefined, "组件实例 ID"),
    /不是合法的设备视图路径段/,
    "路径边界必须把非字符串 ID 转成项目自己的明确错误",
);
for (const attribute of ["widgetType", "widgetKind", "widgetPresentationCategory", "widgetPlacement", "widgetPresentation", "widgetPresentationMode", "widgetPresentationScope", "widgetPresentationVariant", "widgetContentVariant", "hpWidgetShellState", "hpWidgetShellVariant"]) {
    const combined = mountSource + readFileSync("src/homepage/theme/widgetPresentation/runtime.ts", "utf8");
    assert.match(combined, new RegExp(attribute), `挂载运行时缺少 ${attribute}`);
}
assert.match(mountSource, /getWidgetDefinition/, "Widget 挂载必须经过统一 Definition Registry");
assert.match(mountSource, /frame: definition\.frame/, "Widget 挂载必须把框架注册传给公共运行时");
assert.match(mountSource, /applyWidgetPresentation\(target, definition, placement, mountContentData\)/, "Widget 挂载必须把实例配置交给 Presentation 内容形态解析器");
assert.match(mountSource, /normalizeWidgetContentForRuntime/, "Widget 挂载必须先注入运行时 authoritative instanceId");
assert.match(mountSource, /contentTypeJson: mountContentTypeJson/, "Widget 组件必须接收仅运行时归一化后的配置");
assert.match(mountSource, /instanceId: runtimeContext\.instanceId/, "Widget 组件 runtimeContext 必须继续携带 authoritative instanceId");
for (const hostPath of [
    "src/components/utils/widgetBlock/WidgetBlock.ts",
    "src/homepage/mobileHomepage/mobileWidgetBlock.ts",
    "src/components/utils/sidebar/sidebarWidgetBlock.ts",
]) {
    const hostSource = readFileSync(hostPath, "utf8");
    assert.match(hostSource, /\.\.\.runtimeContext,[\s\S]*instanceId: this\.id/, "Widget 宿主必须在 runtimeContext 展开后写入 this.id");
}
assert.match(definitionSource, /timedate\.dial/, "时间日期 Widget 必须声明表盘内容形态语义");
const registeredCategories = [...definitionSource.matchAll(/defineWidget\(\{ type: "([^"]+)", kind: "[^"]+", category: "([^"]+)"/g)];
assert.equal(registeredCategories.length, 37, "全部 Widget 必须显式声明主题呈现类别");
for (const categoryName of ["collection", "metrics", "visualization", "editorial", "media", "control", "embedded", "workspace", "intrinsic"]) {
    assert.ok(registeredCategories.some((match) => match[2] === categoryName), `呈现类别 ${categoryName} 必须有组件注册`);
}
for (const variantName of ["recent-journals.calendar", "countdown.timeline", "custom-protyle.immersive", "timedate.dial", "visualchart.tag-cloud", "visualchart.progress", "historydays.image", "almanac.traditional"]) {
    assert.ok(definitionSource.includes(variantName), `缺少主题展示变体 ${variantName}`);
}

const constellationDefinitionLine = definitionSource.split(/\r?\n/).find((line) => line.includes('defineWidget({ type: "constellation"')) ?? "";
assert.match(constellationDefinitionLine, /variants:\s*\["constellation\.classic",\s*"constellation\.elegant"\]/, "星座运势必须注册 classic/elegant 展示变体");
assert.match(constellationDefinitionLine, /contentVariant:\s*\(content\).*constellationStyle/, "星座运势变体必须由实例 constellationStyle 决定");

const constellationSettingsSource = readFileSync("src/components/utils/widgetBlock/contentSetting.svelte", "utf8");
assert.match(constellationSettingsSource, /let selectedConstellation: ConstellationValue\s*=\s*\$state\("capricorn"\)/, "桌面星座设置必须使用 canonical 默认值");
assert.match(constellationSettingsSource, /let constellationStyle: ConstellationStyle\s*=\s*\$state\("classic"\)/, "桌面星座设置必须提供 classic 默认样式");
assert.match(constellationSettingsSource, /type:\s*"constellation"[\s\S]*?data:\s*\{\s*selectedConstellation,\s*constellationStyle,\s*\}/, "桌面星座设置保存时必须同时写入星座和样式");
assert.match(constellationSettingsSource, /<ConstellationSet[\s\S]*bind:selectedConstellation[\s\S]*bind:constellationStyle/, "桌面星座设置必须同时绑定星座和样式选择器");

const mobileConstellationSettingsSource = readFileSync("src/homepage/mobileHomepage/MobileWidgetContentForm.svelte", "utf8");
assert.match(mobileConstellationSettingsSource, /constellation:\s*\{\s*selectedConstellation:\s*"capricorn",\s*constellationStyle:\s*"classic",\s*\}/, "移动端星座设置必须提供 canonical/classic 默认值");
assert.match(mobileConstellationSettingsSource, /case\s*"constellation":[\s\S]*?selectedConstellation:\s*normalizeConstellationValue\([\s\S]*?constellationStyle:\s*normalizeConstellationStyle/, "移动端保存必须归一化星座值和样式");
assert.match(mobileConstellationSettingsSource, /key:\s*"constellationStyle"[\s\S]*?CONSTELLATION_STYLE_OPTIONS\.map/, "移动端星座设置必须提供样式选择器");

const constellationPresentationSource = readFileSync("src/components/utils/widgetBlock/widget/constellation/constellation.svelte", "utf8");
const constellationClassicSource = readFileSync("src/components/utils/widgetBlock/widget/constellation/_classic.svelte", "utf8");
const constellationElegantSource = readFileSync("src/components/utils/widgetBlock/widget/constellation/_elegant.svelte", "utf8");
assert.match(constellationPresentationSource, /getConstellationApiValue[\s\S]*normalizeConstellationStyle[\s\S]*normalizeConstellationValue/, "星座组件必须从共享层读取值、样式和 API 参数");
assert.match(constellationPresentationSource, /requestGeneration[\s\S]*destroyed/, "星座组件请求必须防止旧请求和销毁后的结果回写");
assert.match(constellationPresentationSource, /loadState[\s\S]*constellation-state-error[\s\S]*onclick=\{retry\}/, "星座组件必须提供 loading/error/retry 状态");
assert.match(constellationPresentationSource, /constellationStyle === "classic"[\s\S]*<ClassicConstellation[\s\S]*<ElegantConstellation/, "星座组件必须按样式分派两个纯展示分支");
assert.doesNotMatch(constellationPresentationSource, /\.fortune-card\s*\{[\s\S]*overflow-y\s*:/, "星座组件不得保留嵌套 fortune-card 滚动区");
assert.match(constellationClassicSource, /fortune-card1[\s\S]*fortune-card2/, "classic 必须保留指数、幸运信息和详情分组");
assert.doesNotMatch(constellationClassicSource, /fetch\(|onMount\(/, "classic 展示分支不得发起远程请求");
assert.match(constellationElegantSource, /elegant-hero[\s\S]*metrics-panel[\s\S]*lucky-strip[\s\S]*reading-section/, "elegant 必须提供 hero、指数、幸运信息和详情区");
assert.doesNotMatch(constellationElegantSource, /hero-capsule|index-card|lucky-card|highlight-card|detail-card/, "elegant 不得回到重复卡片堆叠布局");
assert.doesNotMatch(constellationElegantSource, /\b(?:vw|vh)\b/, "elegant 不得使用 viewport 单位作为组件响应式尺寸");
assert.doesNotMatch(constellationElegantSource, /WidgetSemanticTitle|fetch\(/, "elegant 必须无公共标题栏且不得发起远程请求");

const homepageSource = readFileSync("src/homepage/homepage.svelte", "utf8");
const syncCall = homepageSource.slice(homepageSource.indexOf("syncHomepageWidgetPresentations") - 100, homepageSource.indexOf("syncHomepageWidgetPresentations") + 220);
assert.doesNotMatch(syncCall, /saveLayout|writeDeviceView|restoreLayout/, "切换主题同步 Presentation 不得写入或恢复布局");
assert.match(homepageSource, /syncHomepageWidgetPresentations\(collectThemeWidgetIdentityElements\(\)\)/, "主题切换后必须原位同步现有 Widget Presentation");
assert.match(homepageSource, /serializeWidgetShellTokens\(homepageWidgetShell\)/, "主题外壳令牌必须挂到主页根节点而不是 Widget inline style");
assert.match(homepageSource, /data-hp-widget-shell=\{homepageWidgetShell\?\.id\}/, "主页根节点必须暴露已注册的 Widget 外壳 ID");

for (const relativePath of [
    "src/components/utils/widgetBlock/widget/latestDocs/latestDocs.svelte",
    "src/components/utils/widgetBlock/widget/favorites/favorites.svelte",
    "src/components/utils/widgetBlock/widget/latestDailyNotes/latestDailyNotes.svelte",
    "src/components/utils/widgetBlock/widget/tasks/recentTasks.svelte",
    "src/components/utils/widgetBlock/widget/HOT/HOT.svelte",
    "src/components/utils/widgetBlock/widget/childDocs/childDocs.svelte",
    "src/components/utils/widgetBlock/widget/conditionDocs/conditionDocs.svelte",
    "src/components/utils/widgetBlock/widget/quickNotes/quickNotes.svelte",
    "src/components/utils/widgetBlock/widget/tasksPlus/tasksPlus.svelte",
]) {
    const source = readFileSync(relativePath, "utf8");
    for (const part of ["root", "body", "list", "item", "primary"]) {
        assert.match(source, new RegExp(`data-widget-part="${part}"`), `${relativePath} 缺少语义部件 ${part}`);
    }
    assert.ok(
        source.includes("data-widget-part=\"header\"") || source.includes("<WidgetSemanticTitle"),
        `${relativePath} 缺少语义部件 header`,
    );
}

const recentTasksSource = readFileSync("src/components/utils/widgetBlock/widget/tasks/recentTasks.svelte", "utf8");
const tasksPlusSource = readFileSync("src/components/utils/widgetBlock/widget/tasksPlus/tasksPlus.svelte", "utf8");
assert.match(recentTasksSource, /\.task-list[\s\S]*minmax\(min\(100%,\s*250px\),\s*1fr\)/, "任务管理列表必须允许网格列收缩到组件宽度");
assert.match(recentTasksSource, /\.task-item[\s\S]*?flex:\s*0 0 auto/, "任务管理任务项不得在滚动容器中收缩");
assert.match(tasksPlusSource, /\.task-item[\s\S]*?flex:\s*0 0 auto/, "任务管理 Plus 任务项不得在滚动容器中收缩");
assert.match(tasksPlusSource, /\.tasks-details[\s\S]*?white-space:\s*normal/, "任务管理 Plus 元数据必须保留独立多行布局");

for (const relativePath of [
    "src/components/utils/widgetBlock/widget/sql/sql.svelte",
    "src/components/utils/widgetBlock/widget/constellation/constellation.svelte",
    "src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs.svelte",
    "src/components/utils/widgetBlock/widget/fixedAssets/fixedAssets.svelte",
]) {
    const source = readFileSync(relativePath, "utf8");
    assert.match(source, /data-widget-part="root"/, `${relativePath} 缺少 chrome root`);
    assert.match(source, /<WidgetSemanticTitle/, `${relativePath} 缺少 chrome semantic title`);
    assert.match(source, /data-widget-part="body"/, `${relativePath} 缺少 chrome body`);
}

const semanticTitleSource = readFileSync("src/homepage/theme/widgetPresentation/components/WidgetSemanticTitle.svelte", "utf8");
assert.match(semanticTitleSource, /\.hp-widget-title__icon[\s\S]*display:\s*none/, "语义标题默认必须隐藏主题图标");
assert.match(semanticTitleSource, /\.hp-widget-title__semantic[\s\S]*display:\s*none/, "语义标题默认必须隐藏语义标题");
assert.match(semanticTitleSource, /\.hp-widget-title__legacy[\s\S]*display:\s*inline/, "语义标题默认必须显示 Legacy 标题");
assert.equal(classifyWidgetTitle("HOT", "哔哩哔哩热榜🔥"), "custom", "HOT 动态标题不得被误判为静态默认标题");
assert.equal(classifyWidgetTitle("reviewDocs", "📚复习文档"), "historical-default");
assert.equal(classifyWidgetTitle("reviewDocs", "我的复习队列"), "custom");
assert.match(semanticTitleSource, /summary\?: string \| number/, "公共语义标题必须支持移动端简短统计信息");

const widgetFrameSource = readFileSync("src/components/utils/widgetBlock/WidgetFrame.svelte", "utf8");
assert.match(widgetFrameSource, /data-widget-scroll-owner=\{frame\.content === "scrollable" \? "body" : "none"\}/, "公共组件框架必须声明 body 为唯一纵向滚动区");
assert.match(widgetFrameSource, /\[data-widget-part="body"\] \[data-widget-part="list"\]\) \{[\s\S]*?height:\s*auto !important;[\s\S]*?overflow-y:\s*visible !important;/, "内部列表必须自然增高，由公共 body 统一滚动");
assert.match(widgetFrameSource, /\[data-widget-part="body"\] > \[data-widget-part="list"\]\) \{\s*flex:\s*0 0 auto !important;/, "TaskMan Plus 等直属列表不能占满 body 后截断滚动高度");
assert.match(widgetFrameSource, /@supports not selector\(::\-webkit-scrollbar\)[\s\S]*?scrollbar-width:\s*thin;/, "Firefox 内容区必须使用标准细滚动条");
assert.match(widgetFrameSource, /@supports selector\(::\-webkit-scrollbar\)[\s\S]*?::\-webkit-scrollbar\)[\s\S]*?width:\s*3px;[\s\S]*?height:\s*3px;/, "Chromium 内容区必须使用三像素极细滚动条");
assert.match(widgetFrameSource, /::\-webkit-scrollbar-button\)[\s\S]*?display:\s*none;[\s\S]*?width:\s*0;[\s\S]*?height:\s*0;/, "Chromium 内容区必须移除 Windows 方向按钮");
assert.doesNotMatch(widgetFrameSource.slice(0, widgetFrameSource.indexOf("@supports not selector")), /scrollbar-width\s*:/, "Chromium 公共规则前不能声明会覆盖 WebKit 外观的 scrollbar-width");
assert.doesNotMatch(widgetFrameSource, /scrollbar-width:\s*auto/, "公共框架不得重新启用 Windows 默认滚动条");
const mobileHomepageSource = readFileSync("src/homepage/mobileHomepage/mobileHomepage.scss", "utf8");
const mobileFrameScrollRule = mobileHomepageSource.slice(
    mobileHomepageSource.indexOf('.widget-block [data-widget-frame-content="scrollable"] [data-widget-part="body"]'),
    mobileHomepageSource.indexOf('.widget-block .hp-widget-title.compact[data-widget-part="header"]'),
);
assert.doesNotMatch(mobileFrameScrollRule, /scrollbar-width|::\-webkit-scrollbar/, "移动端不得覆盖公共框架的滚动条实现");

const titleScrollComponents = [
    "latestDocs/latestDocs.svelte",
    "favorites/favorites.svelte",
    "latestDailyNotes/latestDailyNotes.svelte",
    "tasks/recentTasks.svelte",
    "HOT/HOT.svelte",
    "sql/sql.svelte",
    "tasksPlus/tasksPlus.svelte",
    "quickNotes/quickNotes.svelte",
    "childDocs/childDocs.svelte",
    "constellation/constellation.svelte",
    "conditionDocs/conditionDocs.svelte",
    "fixedAssets/fixedAssets.svelte",
    "reviewDocs/reviewDocs.svelte",
    "enhancedDiary/enhancedDiary.svelte",
    "accounting/accounting.svelte",
] as const;
for (const relativePath of titleScrollComponents) {
    const source = readFileSync(`src/components/utils/widgetBlock/widget/${relativePath}`, "utf8");
    assert.match(source, /data-widget-part="body"/, `${relativePath} 必须把内容注册到公共 body 滚动区`);
}

const childDocsSource = readFileSync("src/components/utils/widgetBlock/widget/childDocs/childDocs.svelte", "utf8");
assert.match(childDocsSource, /\.document-item-content\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/, "子文档标题容器必须允许收缩并禁止横向溢出");
assert.match(childDocsSource, /\.doc-title\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/, "过长的子文档标题必须单行显示省略号");

const enhancedDiarySource = readFileSync("src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiary.svelte", "utf8");
assert.match(enhancedDiarySource, /enhanced-diary-container" data-widget-part="root"/, "强化日记必须注册组件根区域");
assert.match(enhancedDiarySource, /enhanced-diary-body" data-widget-part="body"/, "强化日记必须把标题外内容放入独立滚动区");
assert.doesNotMatch(enhancedDiarySource, /scrollbar-width|scrollbar-color|scrollbar-gutter/, "强化日记不能私自维护滚动条外观");

const reviewDocsSource = readFileSync("src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs.svelte", "utf8");
assert.doesNotMatch(reviewDocsSource, /scrollbar-width|scrollbar-color|scrollbar-gutter/, "复习文档不能私自维护滚动条外观");
const enhancedDiaryRootStyle = enhancedDiarySource.match(/\.enhanced-diary-container\s*\{([\s\S]*?)\}/)?.[1];
assert.ok(enhancedDiaryRootStyle, "无法提取强化日记根区域样式");
assert.doesNotMatch(
    enhancedDiaryRootStyle,
    /overflow-y:\s*auto/,
    "强化日记根区域不得整体滚动",
);
assert.match(enhancedDiarySource, /\.enhanced-diary-body\s*\{[\s\S]*?overflow-y:\s*auto/, "强化日记 body 必须承担独立滚动");

assert.match(reviewDocsSource, /review-docs-body" data-widget-part="body"/, "复习文档必须提供独立内容滚动区");
assert.match(reviewDocsSource, /review-list" data-widget-part="list"/, "复习列表不得冒充整个内容滚动区");
assert.match(reviewDocsSource, /\.review-docs-body\s*\{[\s\S]*?overflow-y:\s*auto/, "复习文档内容区必须支持桌面与移动端滚动");

const heatmapSource = readFileSync("src/components/utils/widgetBlock/widget/heatmap/heatmap.svelte", "utf8");
assert.match(heatmapSource, /isInitializing = false;[\s\S]*?await tick\(\);[\s\S]*?setupResizeObserver\(\);[\s\S]*?scheduleHeatmapRender\(\);/, "热力图必须等待加载状态结束并挂载图表 DOM 后再监听尺寸和渲染");
assert.match(heatmapSource, /ResizeObserver\([\s\S]*?scheduleHeatmapRender\(\)/, "热力图分页从隐藏恢复可见时必须重新调度完整渲染");
assert.match(heatmapSource, /chartInstance \|\| echarts\.init|if \(!chartInstance\)[\s\S]*?echarts\.init/, "热力图必须像其他可视化图表一样仅初始化一个 ECharts 实例");
assert.doesNotMatch(heatmapSource, /initHeatmapChartWithRetry|setTimeout\(\(\) => initHeatmapChart/, "热力图不得依赖有限次数定时重试判断分页可见性");

const sqlSource = readFileSync("src/components/utils/widgetBlock/widget/sql/sql.svelte", "utf8");
assert.match(sqlSource, /compact=\{isMobilePlacement\}/, "SQL 查询必须注册移动端紧凑标题");
assert.match(sqlSource, /summary=\{isMobilePlacement/, "SQL 查询移动端标题必须显示结果统计");
assert.match(sqlSource, /sql-display-content" data-widget-part="body"/, "SQL 查询必须把表格放入独立内容区域");
assert.match(sqlSource, /\.sql-display-content\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow:\s*auto/, "SQL 查询内容区域必须独立滚动");

const weatherSource = readFileSync("src/components/utils/widgetBlock/widget/weather/weather.svelte", "utf8");
const weatherSimple1Source = readFileSync("src/components/utils/widgetBlock/widget/weather/_simple1.svelte", "utf8");
const weatherSimple2Source = readFileSync("src/components/utils/widgetBlock/widget/weather/_simple2.svelte", "utf8");
const cardWidgetSource = readFileSync("src/homepage/theme/builtins/card/widgets/_specialized.scss", "utf8");
assert.match(weatherSource, /class="weather-default-content"/, "默认天气布局必须提供独立间距目标，不能影响简洁天气");
for (const source of [weatherSimple1Source, weatherSimple2Source]) {
    assert.match(source, /svg\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/, "简洁天气 SVG 必须填满组件内容区域");
}
assert.doesNotMatch(cardWidgetSource, /\.content-display\s*>\s*div/, "卡片主题不得给所有天气直系内容统一添加留白");
assert.match(cardWidgetSource, /\.content-display\s*>\s*\.weather-default-content/, "卡片主题的天气间距只能作用于默认布局");

const widgetThemeStyles = collectSourceFiles("src/homepage/theme/builtins/simple-test/widgets")
    .filter((path) => path.endsWith(".scss"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
assert.match(widgetThemeStyles, /container-name:\s*hp-widget/, "Widget 必须建立自己的 inline-size container");
assert.match(widgetThemeStyles, /@container hp-widget \(max-width: 239px\)/, "Widget 缺少 compact 容器规则");
assert.match(widgetThemeStyles, /@container hp-widget \(min-width: 560px\)/, "Widget 缺少 wide 容器规则");
assert.doesNotMatch(widgetThemeStyles, /minmax\(250px/, "Widget Presentation 不得保留固定 250px 网格退化");
assert.doesNotMatch(widgetThemeStyles, /\.mobile-homepage|\.sidebar|\.dock/, "桌面主页 Widget Presentation 不得污染其他 surface");
assert.match(widgetThemeStyles, /data-widget-placement="homepage"/, "主题 Widget CSS 必须限制到 desktop homepage placement");
assert.match(widgetThemeStyles, /data-widget-presentation-scope="full"/, "Kind Presentation 必须限制到 full scope");
assert.doesNotMatch(widgetThemeStyles, /data-widget-kind="list"\](?!\[data-widget-presentation-scope="full"\])/, "list Kind 样式不得污染 native Widget");
assert.doesNotMatch(widgetThemeStyles, /data-widget-kind="task"\](?!\[data-widget-presentation-scope="full"\])/, "task Kind 样式不得污染 native Widget");
assert.doesNotMatch(widgetThemeStyles, /\.widget-block\[data-widget-presentation-scope="native"\]\s*\{/, "不得全局透明化所有 native Widget 外壳");

const simpleManifest = readFileSync("src/homepage/theme/builtins/simple-test/widgets/manifest.ts", "utf8");
for (const id of ["hot", "child-docs", "condition-docs", "quick-notes", "taskman-plus", "sql", "constellation", "review-docs", "fixed-assets", "enhanced-diary"]) {
    assert.match(simpleManifest, new RegExp(`simple\\.workspace\\.${id}`), `Simple Manifest 缺少 ${id}`);
}
const paperManifest = readFileSync("src/homepage/theme/builtins/paper/widgets/manifest.ts", "utf8");
for (const id of ["hot", "child-docs", "condition-docs", "quick-notes", "taskman-plus", "sql", "constellation", "review-docs", "fixed-assets", "enhanced-diary"]) {
    assert.match(paperManifest, new RegExp(`paper\\.workspace\\.${id}`), `Paper Manifest 缺少 ${id}`);
}
assert.match(paperManifest, /shell:[\s\S]*id:\s*"paper\.sheet"[\s\S]*variants:\s*4/, "纸质主题必须通过 Manifest 注册多变体纸张外壳");
for (const token of ["background", "border", "borderRadius", "boxShadow"]) {
    assert.match(paperManifest, new RegExp(`${token}:`), `纸质主题统一外壳缺少 ${token} 令牌`);
}
const paperWidgetThemeStyles = collectSourceFiles("src/homepage/theme/builtins/paper/widgets")
    .filter((path) => path.endsWith(".scss"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
assert.match(paperWidgetThemeStyles, /container-name:\s*hp-widget/, "纸质主题 Widget 必须建立自己的 inline-size container");
assert.match(paperWidgetThemeStyles, /data-widget-placement="homepage"/, "纸质主题 Widget CSS 必须限制到 desktop homepage placement");
assert.match(paperWidgetThemeStyles, /data-widget-presentation-scope="full"/, "纸质主题 Kind Presentation 必须限制到 full scope");
assert.doesNotMatch(paperWidgetThemeStyles, /builtin\.simple-test|simple\.workspace/, "纸质主题 Widget Presentation 不得依赖简洁主题");
assert.match(paperWidgetThemeStyles, /data-hp-widget-shell="paper\.sheet"/, "纸质 Widget 毛边必须绑定注册外壳语义，而不是污染所有主题");
assert.match(paperWidgetThemeStyles, /paper-widget-mask-[a-d]\.svg/, "纸质 Widget 必须提供多套稳定轮换的毛边蒙版");
const handDrawnManifest = readFileSync("src/homepage/theme/builtins/hand-drawn/widgets/manifest.ts", "utf8");
for (const id of ["hot", "child-docs", "condition-docs", "quick-notes", "taskman-plus", "sql", "constellation", "review-docs", "fixed-assets", "enhanced-diary"]) {
    assert.match(handDrawnManifest, new RegExp(`hand-drawn\\.workspace\\.${id}`), `Hand-drawn Manifest 缺少 ${id}`);
}
assert.match(handDrawnManifest, /shell:[\s\S]*id:\s*"hand-drawn\.sketch-card"[\s\S]*variants:\s*4/, "手绘主题必须通过 Manifest 注册多变体草图外壳");
for (const token of ["background", "border", "borderRadius", "boxShadow"]) {
    assert.match(handDrawnManifest, new RegExp(`${token}:`), `手绘主题统一外壳缺少 ${token} 令牌`);
}
const handDrawnWidgetThemeStyles = collectSourceFiles("src/homepage/theme/builtins/hand-drawn/widgets")
    .filter((path) => path.endsWith(".scss"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
assert.match(handDrawnWidgetThemeStyles, /container-name:\s*hp-widget/, "手绘主题 Widget 必须建立自己的 inline-size container");
assert.match(handDrawnWidgetThemeStyles, /data-widget-placement="homepage"/, "手绘主题 Widget CSS 必须限制到 desktop homepage placement");
assert.match(handDrawnWidgetThemeStyles, /data-widget-presentation-scope="full"/, "手绘主题 Kind Presentation 必须限制到 full scope");
assert.doesNotMatch(handDrawnWidgetThemeStyles, /builtin\.(?:simple-test|paper)|(?:simple|paper)\.workspace/, "手绘主题 Widget Presentation 不得依赖其他内置主题");
assert.match(handDrawnWidgetThemeStyles, /data-hp-widget-shell="hand-drawn\.sketch-card"/, "手绘 Widget 歪线边框必须绑定注册外壳语义");
assert.match(handDrawnWidgetThemeStyles, /sketch-frame-[a-d]/, "手绘 Widget 必须提供多套稳定轮换的歪线轮廓");
const cardManifest = readFileSync("src/homepage/theme/builtins/card/widgets/manifest.ts", "utf8");
for (const id of ["hot", "child-docs", "condition-docs", "quick-notes", "taskman-plus", "sql", "constellation", "review-docs", "fixed-assets", "enhanced-diary"]) {
    assert.match(cardManifest, new RegExp(`card\\.workspace\\.${id}`), `Card Manifest 缺少 ${id}`);
}
assert.match(cardManifest, /shell:[\s\S]*id:\s*"card\.elevated"[\s\S]*variants:\s*3/, "纯卡片主题必须通过 Manifest 注册稳定轮换的卡片外壳");
for (const token of ["background", "border", "borderRadius", "boxShadow"]) {
    assert.match(cardManifest, new RegExp(`${token}:`), `纯卡片主题统一外壳缺少 ${token} 令牌`);
}
const cardWidgetThemeStyles = collectSourceFiles("src/homepage/theme/builtins/card/widgets")
    .filter((path) => path.endsWith(".scss"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
assert.match(cardWidgetThemeStyles, /container-name:\s*hp-widget/, "纯卡片主题 Widget 必须建立自己的 inline-size container");
assert.match(cardWidgetThemeStyles, /data-widget-placement="homepage"/, "纯卡片主题 Widget CSS 必须限制到 desktop homepage placement");
assert.match(cardWidgetThemeStyles, /data-widget-presentation-scope="full"/, "纯卡片主题 Kind Presentation 必须限制到 full scope");
assert.doesNotMatch(cardWidgetThemeStyles, /builtin\.(?:simple-test|paper|hand-drawn)|(?:simple|paper|hand-drawn)\.workspace/, "纯卡片主题 Widget Presentation 不得依赖其他内置主题");
assert.match(cardWidgetThemeStyles, /data-hp-widget-shell="card\.elevated"/, "纯卡片 Widget 阴影与圆角必须绑定注册外壳语义");
assert.match(cardWidgetThemeStyles, /--hp-card-widget-shadow:\s*var\(--hp-card-shadow-widget\)/, "纯卡片 Widget 必须从主题令牌继承默认分层阴影");
assert.match(cardWidgetThemeStyles, /border-radius:\s*18px[\s\S]*box-shadow:\s*var\(--hp-card-widget-shadow\)/, "纯卡片 Widget 必须具备醒目的圆角和可变分层阴影");
assert.match(cardWidgetThemeStyles, /data-hp-widget-shell-variant="2"/, "纯卡片主题必须实现稳定外壳变体 2");
assert.match(cardWidgetThemeStyles, /data-hp-widget-shell-variant="3"/, "纯卡片主题必须实现稳定外壳变体 3");
assert.match(cardManifest, /exclude:[\s\S]*card\.workspace\.native\.pic-caro/, "纯卡片主题必须通过 Manifest 排除全出血图片轮播外壳");
assert.match(cardManifest, /presentationVariants:[\s\S]*timedate\.dial/, "纯卡片主题必须只按注册展示变体排除仿真表盘外壳");
for (const presentation of ["native.weather", "native.stikynot", "native.statistical-card", "native.almanac"]) {
    assert.doesNotMatch(
        cardManifest.slice(cardManifest.indexOf("exclude:"), cardManifest.indexOf("tokens:")),
        new RegExp(`card\\.workspace\\.${presentation}`),
        `纯卡片主题不应排除 ${presentation} 外壳`,
    );
}
assert.doesNotMatch(cardWidgetThemeStyles, /data-hp-widget-shell="card\.elevated"[^}]*::before/, "纯卡片 Widget 不得添加装饰性顶部黑条");
for (const presentation of ["recent-journals", "review-docs", "native.weather", "native.stikynot", "native.statistical-card", "native.almanac"]) {
    assert.match(cardWidgetThemeStyles, new RegExp(`card\\.workspace\\.${presentation}`), `纯卡片主题缺少 ${presentation} 的专项适配`);
}

const classicDefinition = readFileSync("src/homepage/theme/builtins/classic/definition.ts", "utf8");
const simpleDefinition = readFileSync("src/homepage/theme/builtins/simple-test/definition.ts", "utf8");
const paperDefinition = readFileSync("src/homepage/theme/builtins/paper/definition.ts", "utf8");
const handDrawnDefinition = readFileSync("src/homepage/theme/builtins/hand-drawn/definition.ts", "utf8");
const cardDefinition = readFileSync("src/homepage/theme/builtins/card/definition.ts", "utf8");
assert.match(classicDefinition, /widgetPresentation:\s*classicWidgetPresentation/, "Classic 必须显式注册 Widget Presentation");
assert.match(simpleDefinition, /widgetPresentation:\s*simpleWorkspaceWidgetPresentation/, "简洁工作区必须显式注册 Widget Presentation");
assert.match(paperDefinition, /widgetPresentation:\s*paperWorkspaceWidgetPresentation/, "纸质工作区必须显式注册 Widget Presentation");
assert.match(handDrawnDefinition, /widgetPresentation:\s*handDrawnWidgetPresentation/, "手绘风格必须显式注册 Widget Presentation");
assert.match(cardDefinition, /widgetPresentation:\s*cardWidgetPresentation/, "纯卡片主题必须显式注册 Widget Presentation");
assert.match(classicDefinition, /widgetAppearance:\s*"user-configurable"/, "Classic 必须继续允许用户自定义 Widget 外观");
assert.match(simpleDefinition, /widgetAppearance:\s*"theme-controlled"/, "简洁工作区必须继续由主题接管 Widget 外观");
assert.match(paperDefinition, /widgetAppearance:\s*"theme-controlled"/, "纸质工作区必须由主题接管 Widget 外观");
assert.match(handDrawnDefinition, /widgetAppearance:\s*"theme-controlled"/, "手绘风格必须由主题接管 Widget 外观");
assert.match(cardDefinition, /widgetAppearance:\s*"theme-controlled"/, "纯卡片主题必须由主题接管 Widget 外观");

console.log("Widget Presentation Framework verification passed.");
