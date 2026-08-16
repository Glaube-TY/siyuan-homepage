import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveWidgetPresentation } from "../src/homepage/theme/widgetPresentation/resolver";
import { WIDGET_PRESENTATION_CONTRACT_VERSION, type WidgetDefinition, type WidgetPresentationManifest } from "../src/homepage/theme/widgetPresentation/types";
import { classifyWidgetTitle } from "../src/homepage/theme/widgetPresentation/titleCompatibility";
import { validateWidgetPresentationManifest } from "../src/homepage/theme/widgetPresentation/presentationRegistry";
import { resolveWidgetShellVariant, serializeWidgetShellTokens } from "../src/homepage/theme/widgetPresentation/shell";

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
for (const attribute of ["widgetType", "widgetKind", "widgetPresentationCategory", "widgetPlacement", "widgetPresentation", "widgetPresentationMode", "widgetPresentationScope", "widgetPresentationVariant", "widgetContentVariant", "hpWidgetShellState", "hpWidgetShellVariant"]) {
    const combined = mountSource + readFileSync("src/homepage/theme/widgetPresentation/runtime.ts", "utf8");
    assert.match(combined, new RegExp(attribute), `挂载运行时缺少 ${attribute}`);
}
assert.match(mountSource, /getWidgetDefinition/, "Widget 挂载必须经过统一 Definition Registry");
assert.match(mountSource, /frame: definition\.frame/, "Widget 挂载必须把框架注册传给公共运行时");
assert.match(mountSource, /applyWidgetPresentation\(target, definition, placement, contentData\)/, "Widget 挂载必须把实例配置交给 Presentation 内容形态解析器");
assert.match(definitionSource, /timedate\.dial/, "时间日期 Widget 必须声明表盘内容形态语义");
const registeredCategories = [...definitionSource.matchAll(/defineWidget\(\{ type: "([^"]+)", kind: "[^"]+", category: "([^"]+)"/g)];
assert.equal(registeredCategories.length, 37, "全部 Widget 必须显式声明主题呈现类别");
for (const categoryName of ["collection", "metrics", "visualization", "editorial", "media", "control", "embedded", "workspace", "intrinsic"]) {
    assert.ok(registeredCategories.some((match) => match[2] === categoryName), `呈现类别 ${categoryName} 必须有组件注册`);
}
for (const variantName of ["recent-journals.calendar", "countdown.timeline", "custom-protyle.immersive", "timedate.dial", "visualchart.tag-cloud", "visualchart.progress", "historydays.image", "almanac.traditional"]) {
    assert.ok(definitionSource.includes(variantName), `缺少主题展示变体 ${variantName}`);
}

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
for (const presentation of ["recent-journals", "review-docs", "enhanced-diary", "native.weather", "native.stikynot", "native.statistical-card", "native.almanac"]) {
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
