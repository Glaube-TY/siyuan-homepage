import type { VisualChartConfig, VisualChartType } from "./visual-chart-types";

const DEFAULT_PALETTE = ["#5b7cfa", "#42b883", "#f6ad55", "#e66a8c", "#8b6de0", "#2ba3ad"];

export function createDefaultVisualChartConfig(): VisualChartConfig {
    return {
        version: 3,
        chartType: "bar",
        source: {
            type: "manual",
            databaseId: "",
            sql: "select type, count(*) as count from blocks group by type order by count desc",
            notebookIds: [],
            documentKeyword: "",
            documentSort: "updated",
            manualData: JSON.stringify([
                { category: "示例 A", value: 32 },
                { category: "示例 B", value: 56 },
                { category: "示例 C", value: 41 },
                { category: "示例 D", value: 68 },
            ], null, 2),
            refreshSeconds: 0,
        },
        mapping: { category: "category", values: ["value"], name: "category", value: "value", secondaryValue: "" },
        transform: { aggregate: "none", sort: "none", limit: 200, emptyAsZero: true },
        appearance: {
            title: "可视化图表",
            subtitle: "",
            palette: [...DEFAULT_PALETTE],
            background: "transparent",
            textColor: "",
            fontSize: 12,
            smooth: true,
            stacked: false,
            showArea: false,
            showLabels: false,
            showLegend: true,
            legendPosition: "top",
            lineWidth: 2,
            symbolSize: 7,
            barRadius: 5,
            donutInnerRadius: 52,
        },
        detail: {
            xAxisTitle: "",
            yAxisTitle: "",
            lineCurve: "smooth",
            lineStyle: "solid",
            lineSymbol: "circle",
            lineShowSymbols: true,
            lineAreaOpacity: 20,
            barWidth: 56,
            barGap: 30,
            barShowBackground: false,
            progressDefaultTarget: 100,
            progressBarHeight: 18,
            progressRounded: true,
            progressLabelMode: "valueTarget",
            progressLabelPosition: "right",
            progressTrackOpacity: 18,
            pieOuterRadius: 72,
            pieRoseType: "none",
            pieLabelContent: "namePercent",
            pieBorderWidth: 2,
            scatterSymbol: "circle",
            scatterOpacity: 78,
            radarShape: "polygon",
            radarFillOpacity: 18,
            radarSplitNumber: 5,
            heatmapShowScale: true,
            heatmapReverse: false,
            heatmapBorderWidth: 1,
            funnelSort: "descending",
            funnelAlign: "center",
            funnelGap: 3,
            gaugeMin: 0,
            gaugeMax: 100,
            gaugeProgressWidth: 12,
            gaugeShowPointer: true,
            treemapGap: 2,
            treemapRoam: true,
            treemapBreadcrumb: true,
            sunburstInnerRadius: 8,
            sunburstLabelRotate: "radial",
            wordCloudShape: "circle",
            wordCloudMinSize: 12,
            wordCloudMaxSize: 48,
            wordCloudRotation: "free",
            wordCloudGap: 7,
        },
        interaction: { animation: true, animationDuration: 650, tooltip: true, dataZoom: false, toolbox: false },
    };
}

function objectValue(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function valueIn<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
    return options.includes(value as T) ? value as T : fallback;
}

function isChartType(value: unknown): value is VisualChartType {
    return ["line", "area", "bar", "horizontalBar", "progress", "pie", "donut", "scatter", "radar", "heatmap", "funnel", "gauge", "treemap", "sunburst", "wordCloud"].includes(String(value));
}

export function normalizeVisualChartConfig(value: unknown): VisualChartConfig {
    const defaults = createDefaultVisualChartConfig();
    const root = objectValue(value);
    const source = objectValue(root.source);
    const mapping = objectValue(root.mapping);
    const transform = objectValue(root.transform);
    const appearance = objectValue(root.appearance);
    const detail = objectValue(root.detail);
    const interaction = objectValue(root.interaction);
    const gaugeMin = numberIn(detail.gaugeMin, defaults.detail.gaugeMin, -1_000_000_000, 1_000_000_000);
    const gaugeMax = Math.max(gaugeMin + 1, numberIn(detail.gaugeMax, defaults.detail.gaugeMax, -999_999_999, 1_000_000_001));
    const wordCloudMinSize = numberIn(detail.wordCloudMinSize, defaults.detail.wordCloudMinSize, 8, 60);
    const wordCloudMaxSize = Math.max(wordCloudMinSize, numberIn(detail.wordCloudMaxSize, defaults.detail.wordCloudMaxSize, 12, 160));

    return {
        version: 3,
        chartType: root.chartType === "progressBar" ? "progress" : isChartType(root.chartType) ? root.chartType : defaults.chartType,
        source: {
            ...defaults.source,
            ...source,
            type: ["database", "sql", "documents", "tags", "manual"].includes(source.type) ? source.type : defaults.source.type,
            notebookIds: stringArray(source.notebookIds),
            refreshSeconds: numberIn(source.refreshSeconds, 0, 0, 3600),
        },
        mapping: {
            ...defaults.mapping,
            ...mapping,
            values: stringArray(mapping.values, defaults.mapping.values),
        },
        transform: {
            ...defaults.transform,
            ...transform,
            limit: numberIn(transform.limit, defaults.transform.limit, 1, 5000),
        },
        appearance: {
            ...defaults.appearance,
            ...appearance,
            palette: stringArray(appearance.palette, defaults.appearance.palette).filter(Boolean).slice(0, 12),
            fontSize: numberIn(appearance.fontSize, defaults.appearance.fontSize, 9, 28),
            lineWidth: numberIn(appearance.lineWidth, defaults.appearance.lineWidth, 1, 10),
            symbolSize: numberIn(appearance.symbolSize, defaults.appearance.symbolSize, 2, 30),
            barRadius: numberIn(appearance.barRadius, defaults.appearance.barRadius, 0, 30),
            donutInnerRadius: numberIn(appearance.donutInnerRadius, defaults.appearance.donutInnerRadius, 0, 85),
        },
        detail: {
            ...defaults.detail,
            ...detail,
            lineCurve: valueIn(detail.lineCurve, ["straight", "smooth", "step"], appearance.smooth === false ? "straight" : defaults.detail.lineCurve),
            lineStyle: valueIn(detail.lineStyle, ["solid", "dashed", "dotted"], defaults.detail.lineStyle),
            lineSymbol: valueIn(detail.lineSymbol, ["circle", "rect", "triangle", "diamond", "pin", "arrow"], defaults.detail.lineSymbol),
            lineAreaOpacity: numberIn(detail.lineAreaOpacity, defaults.detail.lineAreaOpacity, 0, 80),
            barWidth: numberIn(detail.barWidth, defaults.detail.barWidth, 8, 100),
            barGap: numberIn(detail.barGap, defaults.detail.barGap, -100, 100),
            progressDefaultTarget: numberIn(detail.progressDefaultTarget, defaults.detail.progressDefaultTarget, 0.000001, 1_000_000_000),
            progressBarHeight: numberIn(detail.progressBarHeight, defaults.detail.progressBarHeight, 6, 48),
            progressLabelMode: valueIn(detail.progressLabelMode, ["percent", "value", "valueTarget"], defaults.detail.progressLabelMode),
            progressLabelPosition: valueIn(detail.progressLabelPosition, ["inside", "right"], defaults.detail.progressLabelPosition),
            progressTrackOpacity: numberIn(detail.progressTrackOpacity, defaults.detail.progressTrackOpacity, 5, 60),
            pieOuterRadius: numberIn(detail.pieOuterRadius, defaults.detail.pieOuterRadius, 30, 95),
            pieRoseType: valueIn(detail.pieRoseType, ["none", "radius", "area"], defaults.detail.pieRoseType),
            pieLabelContent: valueIn(detail.pieLabelContent, ["name", "value", "percent", "namePercent"], defaults.detail.pieLabelContent),
            pieBorderWidth: numberIn(detail.pieBorderWidth, defaults.detail.pieBorderWidth, 0, 12),
            scatterSymbol: valueIn(detail.scatterSymbol, ["circle", "rect", "triangle", "diamond", "pin"], defaults.detail.scatterSymbol),
            scatterOpacity: numberIn(detail.scatterOpacity, defaults.detail.scatterOpacity, 10, 100),
            radarShape: valueIn(detail.radarShape, ["polygon", "circle"], defaults.detail.radarShape),
            radarFillOpacity: numberIn(detail.radarFillOpacity, defaults.detail.radarFillOpacity, 0, 80),
            radarSplitNumber: numberIn(detail.radarSplitNumber, defaults.detail.radarSplitNumber, 2, 10),
            heatmapBorderWidth: numberIn(detail.heatmapBorderWidth, defaults.detail.heatmapBorderWidth, 0, 8),
            funnelSort: valueIn(detail.funnelSort, ["descending", "ascending", "none"], defaults.detail.funnelSort),
            funnelAlign: valueIn(detail.funnelAlign, ["left", "center", "right"], defaults.detail.funnelAlign),
            funnelGap: numberIn(detail.funnelGap, defaults.detail.funnelGap, 0, 30),
            gaugeMin,
            gaugeMax,
            gaugeProgressWidth: numberIn(detail.gaugeProgressWidth, defaults.detail.gaugeProgressWidth, 4, 40),
            treemapGap: numberIn(detail.treemapGap, defaults.detail.treemapGap, 0, 16),
            sunburstInnerRadius: numberIn(detail.sunburstInnerRadius, defaults.detail.sunburstInnerRadius, 0, 70),
            sunburstLabelRotate: valueIn(detail.sunburstLabelRotate, ["radial", "tangential", "none"], defaults.detail.sunburstLabelRotate),
            wordCloudShape: valueIn(detail.wordCloudShape, ["circle", "cardioid", "diamond", "triangle-forward", "pentagon", "star"], defaults.detail.wordCloudShape),
            wordCloudMinSize,
            wordCloudMaxSize,
            wordCloudRotation: valueIn(detail.wordCloudRotation, ["none", "rightAngle", "free"], defaults.detail.wordCloudRotation),
            wordCloudGap: numberIn(detail.wordCloudGap, defaults.detail.wordCloudGap, 2, 30),
        },
        interaction: {
            ...defaults.interaction,
            ...interaction,
            animationDuration: numberIn(interaction.animationDuration, defaults.interaction.animationDuration, 0, 5000),
        },
    };
}

export function visualChartConfigFromWidgetContent(content: unknown): VisualChartConfig {
    const root = objectValue(content);
    const data = objectValue(root.data);
    if (data.visualChart && typeof data.visualChart === "object") return normalizeVisualChartConfig(data.visualChart);

    const defaults = createDefaultVisualChartConfig();
    if (data.visualChartType === "tagCloud") {
        return normalizeVisualChartConfig({
            ...defaults,
            chartType: "wordCloud",
            source: { ...defaults.source, type: "tags", refreshSeconds: 60 },
            mapping: { ...defaults.mapping, category: "name", name: "name", values: ["count"], value: "count" },
            appearance: { ...defaults.appearance, title: "标签词云" },
        });
    }
    if (data.visualChartType === "progressBar" && Array.isArray(data.progressBars) && data.progressBars.length) {
        return normalizeVisualChartConfig({
            ...defaults,
            chartType: "progress",
            source: {
                ...defaults.source,
                type: "manual",
                manualData: JSON.stringify(data.progressBars.map((bar: any) => ({
                    name: String(bar?.title || "未命名"),
                    progress: Number(bar?.progress) || 0,
                    target: Number(bar?.target) || 0,
                    type: String(bar?.type || "number"),
                    startDate: typeof bar?.startDate === "string" ? bar.startDate : "",
                    endDate: typeof bar?.endDate === "string" ? bar.endDate : "",
                    taskId: typeof bar?.taskId === "string" ? bar.taskId : "",
                })), null, 2),
            },
            mapping: { ...defaults.mapping, category: "name", name: "name", values: ["progress"], value: "progress", secondaryValue: "target" },
            appearance: { ...defaults.appearance, title: "进度概览", stacked: false },
            detail: { ...defaults.detail, progressLabelMode: "valueTarget" },
        });
    }
    return normalizeVisualChartConfig(defaults);
}

export function writeVisualChartConfigToWidgetContent(content: unknown, config: VisualChartConfig): Record<string, unknown> {
    const root = objectValue(content);
    const data = objectValue(root.data);
    return {
        ...root,
        type: "visualChart",
        data: { ...data, visualChartType: config.chartType, visualChart: normalizeVisualChartConfig(config) },
    };
}
