import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mapWithConcurrency } from "../src/utils/async/mapWithConcurrency";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

async function verifyBoundedConcurrency(): Promise<void> {
    let active = 0;
    let maxActive = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 2));
        active -= 1;
        return value * 2;
    });
    assert.deepEqual(result, [2, 4, 6, 8, 10, 12]);
    assert.equal(maxActive, 3);
}

async function verifySourceContracts(): Promise<void> {
    const [
        homepage,
        entry,
        overlay,
        clock,
        cybmok,
        chartRuntime,
        carousel,
        musicPlayer,
        bannerDrag,
        layoutShared,
        widgetBlock,
        layoutHandler,
        mobileLayout,
        configLoader,
        settingConfig,
        settings,
        visualChart,
        backgroundScheduler,
        getImage,
        runtimePerformance,
        quickNotes,
        selectionAi,
        floatingDoc,
        weather,
        latestDailyNotes,
        countdown,
        countdownDefault,
        about,
        titleSettings,
        sharedSettings,
    ] = await Promise.all([
        read("src/homepage/homepage.svelte"),
        read("src/index.ts"),
        read("src/homepage/theme/components/HomepageInitialLoadOverlay.svelte"),
        read("src/components/utils/widgetBlock/widget/timedate/sharedSecondClock.ts"),
        read("src/components/utils/widgetBlock/widget/CYBMOK/cybmokData.ts"),
        read("src/utils/charts/echarts.ts"),
        read("src/components/utils/widgetBlock/widget/PicCaro/PicCaro.svelte"),
        read("src/components/utils/widgetBlock/widget/musicPlayer/musicPlayer.svelte"),
        read("src/homepage/topBanner/drag.ts"),
        read("src/components/utils/widgetBlock/utils/layout-shared.ts"),
        read("src/components/utils/widgetBlock/WidgetBlock.ts"),
        read("src/components/utils/widgetBlock/utils/layout-handler.ts"),
        read("src/homepage/mobileHomepage/mobileHomepage_layout.ts"),
        read("src/homepage/configLoader.ts"),
        read("src/homepage/homepageSetting/config.ts"),
        read("src/homepage/homepageSetting/homepageSetting.svelte"),
        read("src/components/utils/widgetBlock/widget/visualChart/visualChart.svelte"),
        read("src/features/background-runtime/background-scheduler.ts"),
        read("src/components/tools/getImage.ts"),
        read("src/utils/performance/runtimePerformance.ts"),
        read("src/components/utils/widgetBlock/widget/quickNotes/quickNotes.svelte"),
        read("src/features/kb/services/selection-ai/selection-ai-config.ts"),
        read("src/components/tools/floatingDoc.ts"),
        read("src/components/utils/widgetBlock/widget/weather/weather.svelte"),
        read("src/components/utils/widgetBlock/widget/latestDailyNotes/latestDailyNotes.svelte"),
        read("src/components/utils/widgetBlock/widget/countdownTimer/countdownTimer.svelte"),
        read("src/components/utils/widgetBlock/widget/countdownTimer/_default.svelte"),
        read("src/homepage/homepageSetting/sections/AboutSection.svelte"),
        read("src/homepage/homepageSetting/tabs/TitleSettingsTab.svelte"),
        read("src/homepage/sharedSettings/homepageSharedSettings.ts"),
    ]);

    assert.match(homepage, /mapWithConcurrency\(widgetIdsNeedingRead, 4/);
    assert.match(homepage, /Promise\.all\(\[/);
    assert.match(homepage, /scheduleIdleTask\(\(\) =>/);
    assert.match(homepage, /destroyBannerDrag\?\.setPosition\(0\)/);
    assert.match(entry, /private async startSelectionAiPremiumRuntime[\s\S]*await loadSelectionAiToolbarSettingsSnapshot\(this\)/);
    assert.doesNotMatch(entry, /\.finally\(\(\) => initSelectionAiToolbarPointerTracker\(\)\)/);
    assert.match(entry, /cancelDeferredBackgroundStartup/);
    assert.match(overlay, /aria-valuenow=\{normalizedProgress\}/);
    assert.match(clock, /document\.visibilityState === "hidden"/);
    assert.match(cybmok, /record\.kind !== "legacy-daily"/);
    assert.match(chartRuntime, /from "echarts\/core"/);
    assert.doesNotMatch(chartRuntime, /import \* as echarts from "echarts"/);
    assert.match(carousel, /from "swiper\/element"/);
    assert.doesNotMatch(carousel, /swiper\/element\/bundle/);
    assert.match(carousel, /init="false"/);
    assert.match(carousel, /swiper\.injectStyles = swiperStyles/);
    assert.match(musicPlayer, /howler\/dist\/howler\.core\.min\.js/);
    assert.match(musicPlayer, /const provider = sourceProvider/);
    assert.match(musicPlayer, /provider !== sourceProvider/);
    assert.match(musicPlayer, /runMetadataQueue\(token\)[\s\S]*\.catch\(/);

    const handleMoveSource = bannerDrag.match(
        /function handleMove\(e: MouseEvent \| TouchEvent\)[\s\S]*?async function initImagePosition/,
    )?.[0] ?? "";
    assert.match(handleMoveSource, /requestAnimationFrame/);
    assert.doesNotMatch(
        handleMoveSource,
        /clientHeight|offsetHeight|getBoundingClientRect|getComputedStyle|DOMMatrix|await|saveData|onSavePosition/,
        "Banner drag move must stay a layout-free, synchronous RAF scheduler",
    );
    const startDragSource = bannerDrag.match(
        /function startDrag\(e: MouseEvent \| TouchEvent\)[\s\S]*?function persistPosition/,
    )?.[0] ?? "";
    assert.doesNotMatch(
        startDragSource,
        /syncImagePositionBounds|fitImageToSurface|clientWidth|clientHeight|offsetHeight|getBoundingClientRect|getComputedStyle|DOMMatrix|willChange/,
        "Banner drag start must not force layout or toggle compositor hints",
    );
    assert.match(bannerDrag, /let moveRaf: number \| null = null/);
    assert.match(bannerDrag, /pendingTranslateY/);
    assert.match(bannerDrag, /touchcancel/);
    assert.doesNotMatch(bannerDrag, /getComputedStyle|DOMMatrixReadOnly/);
    assert.match(bannerDrag, /renderedImageHeight/);
    assert.match(bannerDrag, /translate3d\(0, \$\{clampedY\}px, 0\)/);
    assert.doesNotMatch(bannerDrag, /offsetHeight/);
    assert.match(bannerDrag, /entry\.contentRect\.width/);
    assert.match(bannerDrag, /entry\.contentRect\.height/);
    assert.match(bannerDrag, /geometryRaf/);
    assert.match(bannerDrag, /cancelGeometryRaf\(\)/);
    assert.match(bannerDrag, /imageElement\.style\.willChange = "transform"/);
    const endDragSource = bannerDrag.match(
        /function endDrag\(\)[\s\S]*?function setPosition/,
    )?.[0] ?? "";
    assert.doesNotMatch(
        endDragSource,
        /async function|await|clientHeight|clientWidth|offsetHeight|getBoundingClientRect|getComputedStyle|DOMMatrix|loadData|saveData|readDeviceView|updateDeviceView|putFile|scheduleIdleTask|requestIdleCallback|setTimeout/,
        "Banner drag end must only finalize UI state and invoke the persistence callback",
    );
    assert.doesNotMatch(endDragSource, /willChange/);
    assert.match(endDragSource, /Math\.abs\(finalY - dragStartTranslateY\) > BANNER_POSITION_EPSILON/);
    assert.ok(
        endDragSource.indexOf("detachDragWindowListeners()") < endDragSource.indexOf("persistPosition(finalY)"),
        "Banner drag listeners must be detached before async persistence starts",
    );
    const destroySource = bannerDrag.slice(bannerDrag.indexOf("destroy: () =>"));
    assert.match(destroySource, /cancelMoveRaf\(\)/);
    assert.match(destroySource, /cancelGeometryRaf\(\)/);
    assert.match(destroySource, /resizeObserver\?\.disconnect\(\)/);
    assert.match(destroySource, /imageElement\.style\.willChange = originalWillChange/);

    assert.match(layoutShared, /const HOMEPAGE_WIDGET_READ_CONCURRENCY = 4/);
    assert.match(layoutShared, /await ensureCurrentDeviceViewReady\(context\)/);
    assert.match(layoutShared, /const \[layout, view\] = await Promise\.all\(\[/);
    assert.match(layoutShared, /loadLayoutSnapshotForContext\(context, \{ assumeReady: true \}\)/);
    assert.match(layoutShared, /expectsView \? readDeviceViewSettings\(context\) : Promise\.resolve\(null\)/);
    assert.match(layoutShared, /const retryDelays = \[0, 25, 75\]/);
    assert.match(layoutShared, /const \[layoutRecheck, viewRecheck\] = await Promise\.all\(\[/);
    assert.doesNotMatch(layoutShared, /Promise\.all\(widgetIds\.map/);
    assert.match(layoutShared, /mapWithConcurrency\(widgetIds, HOMEPAGE_WIDGET_READ_CONCURRENCY/);
    assert.match(layoutShared, /const candidates = defaultOrder\.filter/);
    assert.match(layoutShared, /mapWithConcurrency\(\s*candidates,\s*HOMEPAGE_WIDGET_READ_CONCURRENCY/);
    assert.match(layoutShared, /const \[latestSnapshot, latestManifest\] = await Promise\.all\(\[/);
    assert.match(layoutShared, /mapWithConcurrency\(\s*\[\.\.\.rebuildWidgetDocuments\],\s*HOMEPAGE_WIDGET_READ_CONCURRENCY/);
    assert.match(layoutShared, /const widgetsNeedingRestoreRead/);
    assert.match(layoutShared, /restoreReadResults = await mapWithConcurrency\(/);
    assert.match(layoutShared, /resolveEffectiveWidgetLayoutSettings\(/);
    assert.match(layoutShared, /widgetLayoutNumber: effectiveWidgetLayoutSettings\.widgetLayoutNumber/);
    assert.match(layoutShared, /目标分栏 .*不存在于最新布局，未写入活动分栏状态/);
    assert.match(widgetBlock, /isValidWidgetLayoutNumber\(runtimeOptions\.widgetLayoutNumber\)/);
    assert.match(widgetBlock, /widgetLayoutNumber: this\.widgetLayoutNumber/);
    assert.match(widgetBlock, /public async updateRuntimeOptions[\s\S]*\): Promise<void>/);
    assert.match(layoutHandler, /widgetLayoutNumber\?: number/);
    assert.match(mobileLayout, /mapWithConcurrency\(order, 4/);
    assert.match(mobileLayout, /for \(const result of widgetReadResults\)/);
    assert.match(mobileLayout, /let instance: WidgetBlock \| null = null/);
    assert.match(mobileLayout, /instance\?\.destroy\(\)/);
    assert.match(mobileLayout, /instance\?\.element\.remove\(\)/);
    assert.doesNotMatch(mobileLayout, /instance!\.destroy|instance!\.element/);

    assert.match(configLoader, /const viewPromise = readDeviceViewSettings\(context\)/);
    assert.match(configLoader, /const layoutPromise = surface === "desktop-homepage"/);
    assert.match(configLoader, /let \[mergedConfig, layout\] = await Promise\.all\(\[mergedConfigPromise, layoutPromise\]\)/);
    assert.match(configLoader, /export async function loadHomepageSharedCapabilityConfig/);
    const sharedCapabilitySource = configLoader.slice(
        configLoader.indexOf("export async function loadHomepageSharedCapabilityConfig"),
        configLoader.indexOf("export interface BannerImageResult"),
    );
    assert.match(sharedCapabilitySource, /const viewPromise = readDeviceViewSettings\(context\)/);
    assert.match(sharedCapabilitySource, /const sharedPromise = readHomepageSharedSettingsSnapshot\(plugin\)/);
    assert.match(sharedCapabilitySource, /const \[view, shared\] = await Promise\.all\(\[viewPromise, sharedPromise\]\)/);
    assert.match(sharedCapabilitySource, /pickHomepageSharedSettings\(shared\.config\)/);
    assert.doesNotMatch(sharedCapabilitySource, /readHomepageSharedSettingsSnapshot\(plugin\)\.catch/);
    assert.doesNotMatch(sharedCapabilitySource, /return null/);
    assert.doesNotMatch(sharedCapabilitySource, /if \(shared\) return shared\.config/);
    assert.doesNotMatch(sharedCapabilitySource, /readDeviceViewLayout|loadLayoutSnapshotForContext/);
    const bannerLoaderSource = configLoader.slice(configLoader.indexOf("export async function loadBannerDisplaySettings"));
    assert.match(bannerLoaderSource, /readDeviceViewSettings\(context\)/);
    assert.doesNotMatch(bannerLoaderSource, /loadHomepageConfigDataStrict|readDeviceViewLayout|mergeHomepageSharedSettings/);
    assert.match(settingConfig, /const settingsPromise = readDeviceViewSettings\(context\)/);
    assert.match(settingConfig, /const layoutPromise = surface === "desktop-homepage"/);
    assert.match(settingConfig, /let \[merged, layout\] = await Promise\.all\(\[mergedConfigPromise, layoutPromise\]\)/);

    assert.match(homepage, /const \[bannerResult, backgroundResult\] = await Promise\.all\(\[/);
    assert.match(homepage, /bannerHeight = config\.bannerHeight/);
    assert.match(homepage, /const \[loadedSnapshot, manifest\] = await Promise\.all\(\[/);
    assert.match(homepage, /const activeSectionPersistenceQueue = createLatestWinsAsyncQueue/);
    assert.match(homepage, /let activeSectionPersistenceTask: Promise<void> = Promise\.resolve\(\)/);
    assert.match(homepage, /for \(const \[runtimeSectionId, state\] of sectionRuntimeStates\)/);
    assert.match(homepage, /const persistenceTask = activeSectionPersistenceQueue\.enqueue/);
    assert.match(homepage, /activeSectionPersistenceTask = persistenceTask\.catch\(\(\) => undefined\)/);
    assert.match(homepage, /void persistenceTask\.catch\(\(\) => undefined\)/);
    const switchVisibleSource = homepage.slice(
        homepage.indexOf("async function switchVisibleComponentSection"),
        homepage.indexOf("async function handleComponentSectionSwitch"),
    );
    assert.doesNotMatch(switchVisibleSource, /await setActiveComponentSectionForCurrentDevice/);
    assert.match(switchVisibleSource, /activateComponentSectionContainer\(targetSectionId\)/);
    assert.match(switchVisibleSource, /cleanupContainerInfrastructure\(previousVisibleSectionId\)/);
    const dragPersistenceSource = homepage.slice(
        homepage.indexOf("async function saveSectionLayoutAfterDrag"),
        homepage.indexOf("function setupContainerInfrastructure"),
    );
    assert.match(dragPersistenceSource, /await activeSectionPersistenceTask\.catch\(\(\) => undefined\)/);
    assert.match(dragPersistenceSource, /container\.isConnected/);
    assert.match(dragPersistenceSource, /pendingExternalStorageRefresh/);
    assert.match(dragPersistenceSource, /sectionRuntimeStates\.get\(sectionId\)/);
    assert.match(dragPersistenceSource, /runtimeState\.layoutRevision/);
    assert.match(dragPersistenceSource, /expectedLayoutRevision: uiBaseRevision/);
    assert.ok(
        dragPersistenceSource.indexOf("await activeSectionPersistenceTask.catch")
            < dragPersistenceSource.indexOf("sectionRuntimeStates.get(sectionId)"),
        "Drag persistence must await the latest active-section write before reading runtime state",
    );
    assert.ok(
        dragPersistenceSource.indexOf("sectionRuntimeStates.get(sectionId)")
            < dragPersistenceSource.indexOf("runtimeState.layoutRevision"),
        "Drag persistence must read layout revision from the re-read runtime state",
    );
    assert.ok(
        dragPersistenceSource.indexOf("container.isConnected")
            < dragPersistenceSource.indexOf("sectionRuntimeStates.get(sectionId)"),
        "Drag persistence must validate the connected container before reading runtime state",
    );
    assert.ok(
        dragPersistenceSource.indexOf("pendingExternalStorageRefresh")
            < dragPersistenceSource.indexOf("runtimeState.layoutRevision"),
        "Drag persistence must skip stale DOM when an external refresh is pending",
    );
    assert.match(dragPersistenceSource, /saveLayoutWithResult\(plugin, container/);
    assert.match(homepage, /void saveSectionLayoutAfterDrag\(sectionId, container\)/);
    assert.match(homepage, /createRuntimePerformanceTrace\("homepage-section-switch"\)/);
    assert.match(homepage, /storage-identity-ready/);
    assert.match(homepage, /runtime-ready/);
    assert.match(homepage, /sectionTrace\.checkpoint\("visible"\)/);
    assert.match(homepage, /MIN_THEME_TRANSITION_OVERLAY_MS = 120/);
    const themeSwitchSource = homepage.slice(
        homepage.indexOf("async function requestThemeResolutionActivation"),
        homepage.indexOf("function finishHomepageThemeTransition"),
    );
    assert.equal((themeSwitchSource.match(/requestAnimationFrame/g) || []).length, 1);
    assert.match(themeSwitchSource, /createRuntimePerformanceTrace\("homepage-theme-switch"\)/);
    assert.match(themeSwitchSource, /checkpoint\("overlay-painted"\)/);
    assert.match(themeSwitchSource, /checkpoint\("activated"\)/);

    assert.match(entry, /setQuickNoteConfigLoader\(\(plugin\) => loadHomepageSharedCapabilityConfig\(plugin\)\)/);
    assert.match(entry, /private async applyGlobalBackgroundImageStyle\(config\?: PluginConfig\)/);
    assert.match(entry, /const resolvedConfig = config[\s\S]*normalizeHomepageConfigData\(config\)[\s\S]*loadHomepageConfig\(this\)/);
    assert.match(entry, /await this\.applyGlobalBackgroundImageStyle\(config\)/);
    assert.match(entry, /readyDeviceViewSurfaces\.has\(primarySurface\)[\s\S]*isHomepageDeviceViewAvailable\(\)/);
    assert.match(entry, /invalidateFloatingDocDefaultModeCache\(\)/);

    assert.match(settings, /let statusAiModelSummaryState = \$state<StatusAiModelSummaryState>\("idle"\)/);
    assert.match(settings, /let statusAiModelSummaryGeneration = 0/);
    assert.match(settings, /let statusAiModelSummaryAppliedGeneration = -1/);
    assert.match(settings, /statusAiModelSummaryRequest: Promise<void> \| null/);
    assert.doesNotMatch(settings, /statusAiModelSummaryLoaded|statusAiModelSummaryLoading|statusAiModelSummaryDirty/);
    assert.match(settings, /async function ensureStatusAiModelSummaryLoaded/);
    assert.doesNotMatch(settings, /await refreshStatusAiModelSummary\(\)/);
    const statusSummarySource = settings.slice(
        settings.indexOf("function isStatusAiSummaryVisible"),
        settings.indexOf("function handleStatusAiModelChange"),
    );
    assert.match(statusSummarySource, /advancedEnabled/);
    assert.match(statusSummarySource, /tempStatusTextMode === "ai"/);
    assert.match(statusSummarySource, /const requestGeneration = statusAiModelSummaryGeneration/);
    assert.match(statusSummarySource, /statusAiModelSummaryState = "loading"/);
    assert.match(statusSummarySource, /statusAiModelSummaryState = "ready"/);
    assert.match(statusSummarySource, /statusAiModelSummaryState = "error"/);
    assert.match(statusSummarySource, /statusAiModelSummaryAppliedGeneration = requestGeneration/);
    assert.match(statusSummarySource, /requestGeneration !== statusAiModelSummaryGeneration/);
    assert.match(statusSummarySource, /statusAiSummaryWasVisible/);
    assert.match(statusSummarySource, /statusAiModelSummaryGeneration \+= 1/);
    assert.match(statusSummarySource, /requestGeneration !== statusAiModelSummaryGeneration[\s\S]*ensureStatusAiModelSummaryLoaded/);
    assert.match(settings, /const \[savedConfig, mobileConfig, layoutSettings\] = await Promise\.all\(\[/);
    assert.match(settings, /settingsLoaded = true/);
    assert.match(settings, /const SHARED_SETTINGS_POLL_MS = 10000/);
    assert.match(settings, /document\.visibilityState === "hidden"/);
    assert.match(settings, /window\.addEventListener\("focus", handleSettingsFocus\)/);
    assert.match(settings, /document\.addEventListener\("visibilitychange", handleSettingsVisibilityChange\)/);
    assert.match(settings, /window\.removeEventListener\("focus", handleSettingsFocus\)/);
    assert.match(settings, /document\.removeEventListener\("visibilitychange", handleSettingsVisibilityChange\)/);
    assert.match(settings, /createRuntimePerformanceTrace\("homepage-settings-open"\)/);
    assert.match(settings, /checkpoint\("core-config-loaded"\)/);
    assert.match(settings, /checkpoint\("interactive"\)/);
    assert.match(settings, /checkpoint\("ai-model-summary-ready"\)/);

    assert.match(titleSettings, /statusAiModelSummaryState\?: StatusAiModelSummaryState/);
    const statusNotesSource = titleSettings.slice(titleSettings.indexOf("<div class=\"status-ai-notes\">"));
    assert.match(statusNotesSource, /statusAiModelSummaryState === "idle" \|\| statusAiModelSummaryState === "loading"/);
    assert.match(statusNotesSource, /正在读取模型配置/);
    assert.match(statusNotesSource, /statusAiModelSummaryState === "error"/);
    assert.match(statusNotesSource, /statusAiModelSummaryState === "ready" && statusAiAvailableModelCount <= 0/);
    assert.ok(
        statusNotesSource.indexOf('statusAiModelSummaryState === "ready" && statusAiAvailableModelCount <= 0')
            > statusNotesSource.indexOf('statusAiModelSummaryState === "idle" || statusAiModelSummaryState === "loading"'),
        "Title settings must show loading before the no-model warning",
    );

    assert.match(visualChart, /bind:this=\{rootElement\}/);
    assert.match(visualChart, /new IntersectionObserver/);
    assert.match(visualChart, /document\.visibilityState/);
    assert.match(visualChart, /let configReady = \$state\(false\)/);
    assert.match(visualChart, /const autoRefreshActive = \$derived\(advancedEnabled && configReady && widgetVisible && documentVisible\)/);
    assert.match(visualChart, /let refreshTimer: ReturnType<typeof setTimeout> \| null = null/);
    assert.match(visualChart, /let reloadPromise: Promise<void> \| null = null/);
    assert.match(visualChart, /let lastReloadCompletedAt = 0/);
    assert.match(visualChart, /let hasLoadedOnce = false/);
    assert.match(visualChart, /let destroyed = false/);
    assert.match(visualChart, /let reloadGeneration = 0/);
    assert.match(visualChart, /if \(!autoRefreshActive\) return/);
    assert.match(visualChart, /config\.source\.type === "manual"/);
    assert.match(visualChart, /Date\.now\(\) - lastReloadCompletedAt/);
    assert.match(visualChart, /function requestReload\(\): Promise<void>/);
    assert.match(visualChart, /if \(reloadPromise\) return reloadPromise/);
    assert.match(visualChart, /const request = reload\(generation\)/);
    assert.match(visualChart, /reloadPromise = request/);
    assert.doesNotMatch(visualChart, /setInterval|clearInterval/);
    assert.match(visualChart, /setTimeout/);
    assert.match(visualChart, /configReady = true[\s\S]*syncRefreshActivity\(\)/);
    const observerSource = visualChart.slice(
        visualChart.indexOf("visibilityObserver = new IntersectionObserver"),
        visualChart.indexOf("visibilityObserver.observe"),
    );
    assert.match(observerSource, /widgetVisible =/);
    assert.doesNotMatch(observerSource, /reload\(/);
    assert.match(visualChart, /if \(destroyed \|\| generation !== reloadGeneration\) return/);
    assert.match(visualChart, /function markDestroyed\(\)/);
    assert.match(visualChart, /reloadGeneration \+= 1/);
    assert.match(backgroundScheduler, /const BACKGROUND_SCAN_CONCURRENCY = 2/);
    assert.match(backgroundScheduler, /mapWithConcurrency\(/);
    assert.doesNotMatch(backgroundScheduler, /\r\n/, "background-scheduler.ts 应保持 LF 行尾");

    assert.match(getImage, /const IMAGE_CACHE_MAX_ENTRIES = 32/);
    assert.match(getImage, /function getCachedImage/);
    assert.match(getImage, /function setCachedImage/);
    assert.match(getImage, /imageCache\.keys\(\)\.next\(\)\.value/);
    assert.match(runtimePerformance, /"homepage-settings-open"/);
    assert.match(runtimePerformance, /"homepage-section-switch"/);
    assert.match(runtimePerformance, /"homepage-theme-switch"/);
    assert.match(runtimePerformance, /const MAX_SAMPLES = 80/);
    assert.doesNotMatch(runtimePerformance, /\r\n/, "runtimePerformance.ts 应保持 LF 行尾");

    for (const [name, source] of [
        ["quickNotes", quickNotes],
        ["selectionAi", selectionAi],
        ["floatingDoc", floatingDoc],
        ["weather", weather],
        ["latestDailyNotes", latestDailyNotes],
        ["countdown", countdown],
        ["countdownDefault", countdownDefault],
        ["about", about],
    ] as const) {
        assert.doesNotMatch(source, /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome|fas fa-|font-awesome/, `${name} 不应依赖 Font Awesome`);
    }
    assert.match(quickNotes, /loadHomepageSharedCapabilityConfig/);
    assert.match(quickNotes, /let quickNotesEnabled = \$state<boolean \| undefined>\(undefined\)/);
    assert.match(quickNotes, /let quickNotesConfigLoadState = \$state<"loading" \| "ready" \| "error">\("loading"\)/);
    const quickNotesMountSource = quickNotes.slice(
        quickNotes.indexOf("onMount(async () =>"),
        quickNotes.indexOf("async function getQuickNotes"),
    );
    assert.match(quickNotesMountSource, /quickNotesConfigLoadState = "ready"/);
    assert.match(quickNotesMountSource, /quickNotesConfigLoadState = "error"/);
    assert.match(quickNotesMountSource, /\[QuickNotes\] 读取快速笔记配置失败/);
    assert.doesNotMatch(quickNotesMountSource, /catch[\s\S]*quickNotesEnabled\s*=\s*false/);
    const quickNotesTemplateSource = quickNotes.slice(quickNotes.indexOf("<div class=\"quick-notes-content-container\""));
    assert.match(quickNotesTemplateSource, /quickNotesConfigLoadState === "loading"/);
    assert.match(quickNotesTemplateSource, /quickNotesConfigLoadState === "error"/);
    assert.match(quickNotesTemplateSource, /快速笔记设置暂时无法读取/);
    assert.ok(
        quickNotesTemplateSource.indexOf('quickNotesConfigLoadState === "loading"')
            < quickNotesTemplateSource.indexOf('quickNotesConfigLoadState === "error"')
            && quickNotesTemplateSource.indexOf('quickNotesConfigLoadState === "error"')
                < quickNotesTemplateSource.indexOf("!quickNotesEnabled"),
        "Quick Notes must render loading/error before the disabled state",
    );
    assert.match(selectionAi, /loadHomepageSharedCapabilityConfig/);
    const selectionLoaderSource = selectionAi.slice(selectionAi.indexOf("export async function loadSelectionAiToolbarSettingsSnapshot"));
    assert.match(selectionLoaderSource, /catch \(error\)/);
    assert.match(selectionLoaderSource, /\[SelectionAI\] 读取工具栏设置失败，本轮保留当前内存配置/);
    assert.match(selectionLoaderSource, /return getSelectionAiToolbarSettingsSnapshot\(\)/);
    assert.doesNotMatch(selectionLoaderSource, /catch[\s\S]*setSelectionAiToolbarSettingsSnapshot\(undefined\)/);
    assert.match(floatingDoc, /cachedDefaultDocPreviewMode/);
    assert.match(floatingDoc, /readDeviceViewSettings/);
    assert.match(weather, /from "@lucide\/svelte\/icons\/thermometer"/);
    assert.match(weather, /from "@lucide\/svelte\/icons\/cloud-sun"/);
    assert.match(weather, /from "@lucide\/svelte\/icons\/wind"/);
    assert.match(weather, /from "@lucide\/svelte\/icons\/droplets"/);
    assert.match(latestDailyNotes, /SiyuanIcon name="previous"/);
    assert.match(latestDailyNotes, /SiyuanIcon name="next"/);
    assert.match(countdown, /from "@lucide\/svelte\/icons\/clock"/);
    assert.match(countdownDefault, /from "@lucide\/svelte\/icons\/square"/);
    assert.match(about, /from "@lucide\/svelte\/icons\/heart"/);
    for (const key of ["quickNotesPosition", "quickNotesTimestampEnabled", "quickNotesAddPosition"]) {
        assert.match(sharedSettings, new RegExp(`"${key}"`), `${key} 必须属于共享设置快照`);
    }

    const automationPanel = await read("src/homepage/homepageSetting/tabs/AutomationCenterSettingsPanel.svelte");
    assert.match(automationPanel, /automationJobStore\.listJobs\(\)/);
    assert.match(automationPanel, /requestAutomationRunNow/);
    assert.match(automationPanel, /trigger\.kind === "once" && state\.lastCompletedAt/);

    const timedateFiles = [
        "_classic.svelte",
        "_simple1.svelte",
        "_simple2.svelte",
        ...Array.from({ length: 9 }, (_, index) => `_dial${index + 1}.svelte`),
    ];
    for (const file of timedateFiles) {
        const source = await read(`src/components/utils/widgetBlock/widget/timedate/${file}`);
        assert.match(source, /subscribeSharedSecondClock/, `${file} 应使用共享时钟`);
        if (file !== "_classic.svelte") {
            assert.doesNotMatch(source, /setInterval\(/, `${file} 不应再创建独立秒级计时器`);
        }
    }

    for (const [feature, loader] of [
        ["task-notify", "loadTaskNotifySettings"],
        ["review-notify", "loadReviewNotifySettings"],
        ["enhanced-diary-notify", "loadEnhancedDiaryNotifySettings"],
        ["countdown-notify", "loadCountdownNotifySettings"],
    ]) {
        const source = await read(`src/features/${feature}/${feature}-scheduler.ts`);
        assert.match(source, new RegExp(`load: ${loader}`), `${feature} 应把设置读取交给共享调度器`);
        assert.match(source, /scan: run\w+NotifyScan/, `${feature} 应复用共享调度器传入的同一份设置`);
    }
}

await verifyBoundedConcurrency();
await verifySourceContracts();
console.log("global performance contracts verified");
