import type { VisualChartType } from "./visual-chart-types";

export const VISUAL_CHART_PALETTE_PRESETS = Object.freeze([
    { id: "siyuan", label: "思源清爽", colors: ["#5b7cfa", "#42b883", "#f6ad55", "#e66a8c", "#8b6de0", "#2ba3ad"] },
    { id: "ocean", label: "深海蓝调", colors: ["#2563eb", "#0891b2", "#14b8a6", "#84cc16", "#f59e0b", "#f97316"] },
    { id: "berry", label: "莓果花园", colors: ["#7c3aed", "#c026d3", "#e11d48", "#f97316", "#eab308", "#65a30d"] },
    { id: "paper", label: "纸张柔彩", colors: ["#486581", "#829ab1", "#d69e2e", "#c05621", "#9f7aea", "#319795"] },
    { id: "contrast", label: "高对比", colors: ["#0057b8", "#f2a900", "#6f2da8", "#00843d", "#d22630", "#00a3e0"] },
] as const);

export const VISUAL_CHART_TYPE_HELP: Readonly<Record<VisualChartType, string>> = Object.freeze({
    line: "突出连续变化趋势，适合时间序列。",
    area: "同时强调趋势与累计规模。",
    bar: "直观比较不同分类的数值。",
    horizontalBar: "分类名称较长时更容易阅读。",
    progress: "同时显示当前值、目标值和完成比例。",
    pie: "适合展示不超过 6 项的占比。",
    donut: "展示占比，并保留视觉中心。",
    scatter: "观察两个数值之间的关系与分布。",
    radar: "比较多个对象在相同指标上的表现。",
    heatmap: "用颜色深浅表现二维分类的强弱。",
    funnel: "展示流程各阶段的数量与转化。",
    gauge: "突出单个指标相对目标区间的位置。",
    treemap: "用矩形面积展示层级与占比。",
    sunburst: "用同心圆展示多层级构成。",
    wordCloud: "用字号突出高频文本或标签。",
});
