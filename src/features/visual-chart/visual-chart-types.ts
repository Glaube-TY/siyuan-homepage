export type VisualChartType =
    | "line"
    | "area"
    | "bar"
    | "horizontalBar"
    | "progress"
    | "pie"
    | "donut"
    | "scatter"
    | "radar"
    | "heatmap"
    | "funnel"
    | "gauge"
    | "treemap"
    | "sunburst"
    | "wordCloud";

export type VisualChartSourceType = "database" | "sql" | "documents" | "tags" | "manual";
export type VisualChartAggregate = "none" | "count" | "sum" | "average" | "min" | "max";

export interface VisualChartSourceConfig {
    type: VisualChartSourceType;
    databaseId: string;
    sql: string;
    notebookIds: string[];
    documentKeyword: string;
    documentSort: "updated" | "created" | "title";
    manualData: string;
    refreshSeconds: number;
}

export interface VisualChartMappingConfig {
    category: string;
    values: string[];
    name: string;
    value: string;
    secondaryValue: string;
}

export interface VisualChartTransformConfig {
    aggregate: VisualChartAggregate;
    sort: "none" | "categoryAsc" | "categoryDesc" | "valueAsc" | "valueDesc";
    limit: number;
    emptyAsZero: boolean;
}

export interface VisualChartAppearanceConfig {
    title: string;
    subtitle: string;
    palette: string[];
    background: string;
    textColor: string;
    fontSize: number;
    smooth: boolean;
    stacked: boolean;
    showArea: boolean;
    showLabels: boolean;
    showLegend: boolean;
    legendPosition: "top" | "bottom" | "left" | "right";
    lineWidth: number;
    symbolSize: number;
    barRadius: number;
    donutInnerRadius: number;
}

export interface VisualChartDetailConfig {
    xAxisTitle: string;
    yAxisTitle: string;
    lineCurve: "straight" | "smooth" | "step";
    lineStyle: "solid" | "dashed" | "dotted";
    lineSymbol: "circle" | "rect" | "triangle" | "diamond" | "pin" | "arrow";
    lineShowSymbols: boolean;
    lineAreaOpacity: number;
    barWidth: number;
    barGap: number;
    barShowBackground: boolean;
    progressDefaultTarget: number;
    progressBarHeight: number;
    progressRounded: boolean;
    progressLabelMode: "percent" | "value" | "valueTarget";
    progressLabelPosition: "inside" | "right";
    progressTrackOpacity: number;
    pieOuterRadius: number;
    pieRoseType: "none" | "radius" | "area";
    pieLabelContent: "name" | "value" | "percent" | "namePercent";
    pieBorderWidth: number;
    scatterSymbol: "circle" | "rect" | "triangle" | "diamond" | "pin";
    scatterOpacity: number;
    radarShape: "polygon" | "circle";
    radarFillOpacity: number;
    radarSplitNumber: number;
    heatmapShowScale: boolean;
    heatmapReverse: boolean;
    heatmapBorderWidth: number;
    funnelSort: "descending" | "ascending" | "none";
    funnelAlign: "left" | "center" | "right";
    funnelGap: number;
    gaugeMin: number;
    gaugeMax: number;
    gaugeProgressWidth: number;
    gaugeShowPointer: boolean;
    treemapGap: number;
    treemapRoam: boolean;
    treemapBreadcrumb: boolean;
    sunburstInnerRadius: number;
    sunburstLabelRotate: "radial" | "tangential" | "none";
    wordCloudShape: "circle" | "cardioid" | "diamond" | "triangle-forward" | "pentagon" | "star";
    wordCloudMinSize: number;
    wordCloudMaxSize: number;
    wordCloudRotation: "none" | "rightAngle" | "free";
    wordCloudGap: number;
}

export interface VisualChartInteractionConfig {
    animation: boolean;
    animationDuration: number;
    tooltip: boolean;
    dataZoom: boolean;
    toolbox: boolean;
}

export interface VisualChartConfig {
    version: 3;
    chartType: VisualChartType;
    source: VisualChartSourceConfig;
    mapping: VisualChartMappingConfig;
    transform: VisualChartTransformConfig;
    appearance: VisualChartAppearanceConfig;
    detail: VisualChartDetailConfig;
    interaction: VisualChartInteractionConfig;
}

export interface VisualChartDataset {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    sourceLabel: string;
}

export interface VisualChartLoadResult extends VisualChartDataset {
    resolvedDatabaseId?: string;
}

export const VISUAL_CHART_TYPE_OPTIONS: ReadonlyArray<{ value: VisualChartType; label: string; group: string }> = [
    { value: "line", label: "折线图", group: "趋势" },
    { value: "area", label: "面积图", group: "趋势" },
    { value: "bar", label: "柱状图", group: "比较" },
    { value: "horizontalBar", label: "横向条形图", group: "比较" },
    { value: "progress", label: "进度图", group: "进度" },
    { value: "pie", label: "饼图", group: "占比" },
    { value: "donut", label: "环形图", group: "占比" },
    { value: "scatter", label: "散点图", group: "关系" },
    { value: "radar", label: "雷达图", group: "关系" },
    { value: "heatmap", label: "热力图", group: "高级" },
    { value: "funnel", label: "漏斗图", group: "高级" },
    { value: "gauge", label: "仪表盘", group: "高级" },
    { value: "treemap", label: "矩形树图", group: "层级" },
    { value: "sunburst", label: "旭日图", group: "层级" },
    { value: "wordCloud", label: "词云", group: "文本" },
];
