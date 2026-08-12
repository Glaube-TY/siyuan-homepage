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
    const [homepage, entry, overlay, clock, cybmok, chartRuntime, carousel, musicPlayer] = await Promise.all([
        read("src/homepage/homepage.svelte"),
        read("src/index.ts"),
        read("src/homepage/theme/components/HomepageInitialLoadOverlay.svelte"),
        read("src/components/utils/widgetBlock/widget/timedate/sharedSecondClock.ts"),
        read("src/components/utils/widgetBlock/widget/CYBMOK/cybmokData.ts"),
        read("src/utils/charts/echarts.ts"),
        read("src/components/utils/widgetBlock/widget/PicCaro/PicCaro.svelte"),
        read("src/components/utils/widgetBlock/widget/musicPlayer/musicPlayer.svelte"),
    ]);

    assert.match(homepage, /mapWithConcurrency\(widgetIdsNeedingRead, 4/);
    assert.match(homepage, /Promise\.all\(\[/);
    assert.match(homepage, /scheduleIdleTask\(\(\) =>/);
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
        assert.equal(source.match(new RegExp(`${loader}\\(\\)`, "g"))?.length, 1, `${feature} 每轮只能读取一次设置`);
        assert.match(source, /scanOnce\(runState\.settings\)/, `${feature} 应复用调度检查读取的设置`);
    }
}

await verifyBoundedConcurrency();
await verifySourceContracts();
console.log("global performance contracts verified");
