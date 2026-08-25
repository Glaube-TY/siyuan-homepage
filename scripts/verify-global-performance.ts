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
    const [homepage, entry, overlay, clock, cybmok, chartRuntime, carousel, musicPlayer, bannerDrag] = await Promise.all([
        read("src/homepage/homepage.svelte"),
        read("src/index.ts"),
        read("src/homepage/theme/components/HomepageInitialLoadOverlay.svelte"),
        read("src/components/utils/widgetBlock/widget/timedate/sharedSecondClock.ts"),
        read("src/components/utils/widgetBlock/widget/CYBMOK/cybmokData.ts"),
        read("src/utils/charts/echarts.ts"),
        read("src/components/utils/widgetBlock/widget/PicCaro/PicCaro.svelte"),
        read("src/components/utils/widgetBlock/widget/musicPlayer/musicPlayer.svelte"),
        read("src/homepage/topBanner/drag.ts"),
    ]);

    assert.match(homepage, /mapWithConcurrency\(widgetIdsNeedingRead, 4/);
    assert.match(homepage, /Promise\.all\(\[/);
    assert.match(homepage, /scheduleIdleTask\(\(\) =>/);
    assert.match(homepage, /destroyBannerDrag\?\.setPosition\(0\)/);
    assert.match(entry, /void loadSelectionAiToolbarSettingsSnapshot\(this\)/);
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
