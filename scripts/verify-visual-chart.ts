import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDefaultVisualChartConfig, visualChartConfigFromWidgetContent } from "../src/features/visual-chart/visual-chart-config.js";
import { buildVisualChartOption } from "../src/features/visual-chart/visual-chart-option.js";
import { VISUAL_CHART_TYPE_OPTIONS, type VisualChartDataset } from "../src/features/visual-chart/visual-chart-types.js";
import { resolveWidgetContextMenuActions, type WidgetContextMenuActionContext } from "../src/components/utils/widgetBlock/widgetContextMenuActions.js";

const theme = { text: "#222", muted: "#777", border: "#ddd", surface: "#fff" };
const dataset: VisualChartDataset = {
    columns: ["category", "seriesA", "seriesB"],
    rows: [
        { category: "A", seriesA: 12, seriesB: 7 },
        { category: "B", seriesA: 18, seriesB: 11 },
    ],
    sourceLabel: "verify",
};

for (const chart of VISUAL_CHART_TYPE_OPTIONS) {
    const config = createDefaultVisualChartConfig();
    config.chartType = chart.value;
    config.mapping.values = ["seriesA", "seriesB"];
    config.mapping.value = "seriesA";
    config.mapping.secondaryValue = "seriesB";
    const option = buildVisualChartOption(dataset, config, theme) as Record<string, unknown>;
    assert.ok(Array.isArray(option.series), `${chart.value} must produce series`);
}

function optionFor(type: typeof VISUAL_CHART_TYPE_OPTIONS[number]["value"], change: (config: ReturnType<typeof createDefaultVisualChartConfig>) => void): any {
    const config = createDefaultVisualChartConfig();
    config.chartType = type;
    config.mapping.values = ["seriesA", "seriesB"];
    config.mapping.value = "seriesA";
    config.mapping.secondaryValue = "seriesB";
    change(config);
    return buildVisualChartOption(dataset, config, theme) as any;
}

const lineOption = optionFor("line", (config) => {
    config.detail.lineCurve = "step";
    config.detail.lineStyle = "dashed";
    config.detail.lineShowSymbols = false;
});
assert.equal(lineOption.series[0].step, "middle");
assert.equal(lineOption.series[0].lineStyle.type, "dashed");
assert.equal(lineOption.series[0].showSymbol, false);

const barOption = optionFor("bar", (config) => {
    config.detail.barWidth = 42;
    config.detail.barShowBackground = true;
});
assert.equal(barOption.series[0].barMaxWidth, 42);
assert.equal(barOption.series[0].showBackground, true);

const progressDataset: VisualChartDataset = {
    columns: ["name", "progress", "target"],
    rows: [
        { name: "设计稿", progress: 32, target: 80 },
        { name: "开发", progress: 75, target: 100 },
    ],
    sourceLabel: "progress verify",
};
const progressConfig = createDefaultVisualChartConfig();
progressConfig.chartType = "progress";
progressConfig.mapping.name = "name";
progressConfig.mapping.category = "name";
progressConfig.mapping.value = "progress";
progressConfig.mapping.values = ["progress"];
progressConfig.mapping.secondaryValue = "target";
progressConfig.detail.progressBarHeight = 24;
progressConfig.detail.progressLabelMode = "valueTarget";
progressConfig.detail.progressLabelPosition = "right";
const progressOption = buildVisualChartOption(progressDataset, progressConfig, theme) as any;
assert.equal(progressOption.xAxis.max, 100);
assert.equal(progressOption.series[0].barWidth, 24);
assert.equal(progressOption.series[0].data[0].value, 40);
assert.equal(progressOption.series[0].data[0].label, "32 / 80");
assert.equal(progressOption.series[0].label.position, "right");

const pieOption = optionFor("pie", (config) => {
    config.appearance.showLabels = true;
    config.detail.pieRoseType = "radius";
    config.detail.pieLabelContent = "percent";
});
assert.equal(pieOption.series[0].roseType, "radius");
assert.equal(pieOption.series[0].label.formatter, "{d}%");

const scatterOption = optionFor("scatter", (config) => {
    config.detail.scatterSymbol = "diamond";
    config.detail.scatterOpacity = 55;
});
assert.equal(scatterOption.series[0].symbol, "diamond");
assert.equal(scatterOption.series[0].itemStyle.opacity, 0.55);

const radarOption = optionFor("radar", (config) => {
    config.detail.radarShape = "circle";
    config.detail.radarSplitNumber = 7;
});
assert.equal(radarOption.radar.shape, "circle");
assert.equal(radarOption.radar.splitNumber, 7);

const heatmapOption = optionFor("heatmap", (config) => {
    config.detail.heatmapShowScale = false;
    config.detail.heatmapBorderWidth = 4;
});
assert.equal(heatmapOption.visualMap.show, false);
assert.equal(heatmapOption.series[0].itemStyle.borderWidth, 4);

const funnelOption = optionFor("funnel", (config) => {
    config.detail.funnelSort = "ascending";
    config.detail.funnelAlign = "left";
});
assert.equal(funnelOption.series[0].sort, "ascending");
assert.equal(funnelOption.series[0].funnelAlign, "left");

const gaugeOption = optionFor("gauge", (config) => {
    config.detail.gaugeMin = 10;
    config.detail.gaugeMax = 80;
    config.detail.gaugeShowPointer = false;
});
assert.equal(gaugeOption.series[0].min, 10);
assert.equal(gaugeOption.series[0].max, 80);
assert.equal(gaugeOption.series[0].pointer.show, false);

const treemapOption = optionFor("treemap", (config) => {
    config.detail.treemapGap = 6;
    config.detail.treemapRoam = false;
});
assert.equal(treemapOption.series[0].itemStyle.gapWidth, 6);
assert.equal(treemapOption.series[0].roam, false);

const sunburstOption = optionFor("sunburst", (config) => {
    config.detail.sunburstInnerRadius = 24;
    config.detail.sunburstLabelRotate = "tangential";
});
assert.equal(sunburstOption.series[0].radius[0], "24%");
assert.equal(sunburstOption.series[0].label.rotate, "tangential");

const wordCloudOption = optionFor("wordCloud", (config) => {
    config.detail.wordCloudShape = "star";
    config.detail.wordCloudRotation = "none";
});
assert.equal(wordCloudOption.series[0].shape, "star");
assert.deepEqual(wordCloudOption.series[0].rotationRange, [0, 0]);

const legacyTagCloud = visualChartConfigFromWidgetContent({ type: "visualChart", data: { visualChartType: "tagCloud" } });
assert.equal(legacyTagCloud.chartType, "wordCloud");
assert.equal(legacyTagCloud.source.type, "tags");
assert.equal(legacyTagCloud.version, 3);
assert.equal(legacyTagCloud.detail.wordCloudShape, "circle");

const legacyProgress = visualChartConfigFromWidgetContent({
    type: "visualChart",
    data: {
        visualChartType: "progressBar",
        progressBars: [
            { title: "发布准备", progress: 6, target: 10, type: "number", taskId: "task-1" },
            { title: "冲刺周期", progress: 0, target: 0, type: "date", startDate: "2026-08-01", endDate: "2026-08-15" },
        ],
    },
});
const migratedProgressRows = JSON.parse(legacyProgress.source.manualData);
assert.equal(legacyProgress.chartType, "progress");
assert.equal(legacyProgress.mapping.secondaryValue, "target");
assert.equal(migratedProgressRows[0].name, "发布准备");
assert.equal(migratedProgressRows[0].taskId, "task-1");
assert.equal(migratedProgressRows[1].startDate, "2026-08-01");

const actionContext = {} as WidgetContextMenuActionContext;
const actions = resolveWidgetContextMenuActions([
    { id: "demo.last", label: "后", order: 20, execute: () => {} },
    { id: "demo.hidden", label: "隐藏", order: 1, visible: () => false, execute: () => {} },
    { id: "demo.first", label: "前", order: 10, execute: () => {} },
], actionContext);
assert.deepEqual(actions.map((action) => action.id), ["demo.first", "demo.last"]);

const widgetSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/visualChart/visualChart.svelte", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/visualChart/VisualChartConsole.svelte", import.meta.url), "utf8");
const consoleEntrySource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/visualChart/openVisualChartConsole.ts", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../src/features/visual-chart/visual-chart-data.ts", import.meta.url), "utf8");
assert.doesNotMatch(widgetSource, /widget-actions/, "visual chart must not render internal action buttons");
assert.match(widgetSource, /compact-warning/, "visual chart must provide a compact-size fallback");
assert.doesNotMatch(consoleSource, /刷新数据/, "visual chart console must refresh data automatically");
assert.match(consoleSource, /sourceSignature/, "visual chart console must track live data-source edits");
assert.match(consoleSource, /VisualChartStyleInspector/, "visual chart console must use the no-code style inspector");
assert.match(consoleEntrySource, /icon:\s*"iconGraph"/, "visual chart studio context-menu action must have a chart icon");
assert.doesNotMatch(dataSource, /content\s+like/i, "document keyword queries must not scan blocks.content with LIKE");

console.log(`visual-chart verification passed (${VISUAL_CHART_TYPE_OPTIONS.length} chart types + context menu registry)`);
