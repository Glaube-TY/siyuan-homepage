import type { EChartsOption } from "echarts";
import type { VisualChartConfig, VisualChartDataset } from "./visual-chart-types";

export interface VisualChartTheme {
    text: string;
    muted: string;
    border: string;
    surface: string;
}

function numeric(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function legendPosition(position: VisualChartConfig["appearance"]["legendPosition"]): Record<string, unknown> {
    if (position === "bottom") return { bottom: 0, left: "center" };
    if (position === "left") return { left: 0, top: "middle", orient: "vertical" };
    if (position === "right") return { right: 0, top: "middle", orient: "vertical" };
    return { top: 0, left: "center" };
}

function hierarchicalData(rows: Array<Record<string, unknown>>, nameField: string, valueField: string): any[] {
    const root: any[] = [];
    for (const row of rows) {
        const path = String(row[nameField] ?? "未命名").split(/[/>]/).map((item) => item.trim()).filter(Boolean);
        let level = root;
        path.forEach((name, index) => {
            let node = level.find((item: any) => item.name === name);
            if (!node) { node = { name, children: [] }; level.push(node); }
            if (index === path.length - 1) { node.value = numeric(row[valueField]); if (!node.children.length) delete node.children; }
            else { node.children ||= []; level = node.children; }
        });
    }
    return root;
}

function progressValues(row: Record<string, unknown>, valueField: string, targetField: string, defaultTarget: number): { actual: number; target: number; dateBased: boolean } {
    if (row.type === "date" && typeof row.startDate === "string" && typeof row.endDate === "string") {
        const start = new Date(`${row.startDate}T00:00:00`);
        const end = new Date(`${row.endDate}T00:00:00`);
        if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end.getTime() >= start.getTime()) {
            const day = 86_400_000;
            const target = Math.max(1, Math.floor((end.getTime() - start.getTime()) / day));
            const actual = Math.max(0, Math.min(target, Math.floor((Date.now() - start.getTime()) / day)));
            return { actual, target, dateBased: true };
        }
    }
    const actual = numeric(row[valueField]);
    const mappedTarget = targetField ? numeric(row[targetField]) : 0;
    return { actual, target: mappedTarget > 0 ? mappedTarget : defaultTarget, dateBased: false };
}

function readableNumber(value: number): string {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export function buildVisualChartOption(dataset: VisualChartDataset, config: VisualChartConfig, theme: VisualChartTheme): EChartsOption {
    const { chartType, appearance, detail, interaction, mapping } = config;
    const categoryField = mapping.category || mapping.name || dataset.columns[0] || "category";
    const valueFields = mapping.values.length ? mapping.values : [mapping.value || dataset.columns[1] || dataset.columns[0]].filter(Boolean);
    const nameField = mapping.name || categoryField;
    const valueField = mapping.value || valueFields[0] || dataset.columns[1] || dataset.columns[0];
    const categories = dataset.rows.map((row) => String(row[categoryField] ?? ""));
    const color = appearance.palette.length ? appearance.palette : undefined;
    const textColor = appearance.textColor || theme.text;
    const titleSpace = appearance.title || appearance.subtitle ? 46 : 12;
    const sideLegend = appearance.showLegend && ["left", "right"].includes(appearance.legendPosition);
    const zoomSpace = interaction.dataZoom ? 42 : 12;
    const base: any = {
        backgroundColor: appearance.background === "transparent" ? "transparent" : appearance.background,
        color,
        animation: interaction.animation,
        animationDuration: interaction.animationDuration,
        animationDurationUpdate: Math.min(1000, interaction.animationDuration),
        animationEasing: "cubicOut",
        textStyle: { color: textColor, fontSize: appearance.fontSize },
        title: appearance.title || appearance.subtitle ? {
            text: appearance.title,
            subtext: appearance.subtitle,
            left: 10,
            top: 6,
            textStyle: { color: textColor, fontSize: appearance.fontSize + 3, fontWeight: 650 },
            subtextStyle: { color: theme.muted, fontSize: Math.max(9, appearance.fontSize - 1) },
        } : undefined,
        tooltip: interaction.tooltip ? { trigger: ["pie", "donut", "funnel", "treemap", "sunburst", "wordCloud", "gauge"].includes(chartType) ? "item" : "axis", confine: true } : undefined,
        legend: appearance.showLegend ? { ...legendPosition(appearance.legendPosition), textStyle: { color: theme.muted, fontSize: appearance.fontSize - 1 }, type: "scroll" } : undefined,
        toolbox: interaction.toolbox ? { right: 8, top: 6, feature: { dataView: { readOnly: true }, restore: {}, saveAsImage: {} } } : undefined,
    };

    if (chartType === "progress") {
        const targetField = mapping.secondaryValue;
        const progressRows = dataset.rows.map((row, index) => {
            const { actual, target, dateBased } = progressValues(row, valueField, targetField, detail.progressDefaultTarget);
            const percent = target > 0 ? Math.max(0, actual / target * 100) : 0;
            const suffix = dateBased ? "天" : "";
            const label = detail.progressLabelMode === "percent" ? `${readableNumber(percent)}%`
                : detail.progressLabelMode === "value" ? `${readableNumber(actual)}${suffix}`
                    : `${readableNumber(actual)}${suffix} / ${readableNumber(target)}${suffix}`;
            return {
                name: String(row[nameField] ?? `项目 ${index + 1}`),
                value: Math.min(100, percent),
                label,
                itemStyle: { color: color?.[index % color.length] },
            };
        });
        base.legend = undefined;
        base.tooltip = interaction.tooltip ? { trigger: "item", confine: true, valueFormatter: (value: number) => `${readableNumber(value)}%` } : undefined;
        base.grid = { top: titleSpace + 8, bottom: 10, left: 12, right: detail.progressLabelPosition === "right" ? 76 : 18, containLabel: true };
        base.xAxis = { type: "value", min: 0, max: 100, show: false };
        base.yAxis = { type: "category", inverse: true, data: progressRows.map((item) => item.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: textColor, width: 130, overflow: "truncate" } };
        base.series = [{
            name: "完成进度",
            type: "bar",
            data: progressRows,
            barWidth: detail.progressBarHeight,
            showBackground: true,
            backgroundStyle: { color: theme.border, opacity: detail.progressTrackOpacity / 100, borderRadius: detail.progressRounded ? 999 : 0 },
            itemStyle: { borderRadius: detail.progressRounded ? 999 : 0 },
            label: {
                show: true,
                position: detail.progressLabelPosition === "inside" ? "insideRight" : "right",
                color: detail.progressLabelPosition === "inside" ? theme.surface : textColor,
                formatter: (params: any) => params.data.label,
            },
        }];
        return base;
    }

    if (["pie", "donut", "funnel", "gauge", "treemap", "sunburst", "wordCloud"].includes(chartType)) {
        const commonData = dataset.rows.map((row) => ({ name: String(row[nameField] ?? "未命名"), value: numeric(row[valueField]) }));
        if (chartType === "pie" || chartType === "donut") {
            const labelFormat = detail.pieLabelContent === "value" ? "{c}"
                : detail.pieLabelContent === "percent" ? "{d}%"
                    : detail.pieLabelContent === "name" ? "{b}"
                        : "{b}  {d}%";
            base.series = [{
                type: "pie",
                radius: chartType === "donut" ? [`${Math.min(appearance.donutInnerRadius, detail.pieOuterRadius - 5)}%`, `${detail.pieOuterRadius}%`] : ["0%", `${detail.pieOuterRadius}%`],
                center: ["50%", titleSpace > 20 ? "57%" : "52%"],
                roseType: detail.pieRoseType === "none" ? undefined : detail.pieRoseType,
                avoidLabelOverlap: true,
                data: commonData,
                label: { show: appearance.showLabels, color: textColor, formatter: labelFormat },
                itemStyle: { borderColor: theme.surface, borderWidth: detail.pieBorderWidth, borderRadius: Math.min(8, appearance.barRadius) },
            }];
        } else if (chartType === "funnel") {
            base.series = [{ type: "funnel", top: titleSpace + 8, bottom: 12, left: "12%", width: "76%", sort: detail.funnelSort, funnelAlign: detail.funnelAlign, gap: detail.funnelGap, data: commonData, label: { show: appearance.showLabels, color: textColor } }];
        } else if (chartType === "gauge") {
            const item = commonData[0] || { name: valueField, value: 0 };
            base.series = [{ type: "gauge", min: detail.gaugeMin, max: detail.gaugeMax, center: ["50%", "58%"], radius: "78%", progress: { show: true, width: detail.gaugeProgressWidth }, pointer: { show: detail.gaugeShowPointer }, axisLine: { lineStyle: { width: detail.gaugeProgressWidth } }, splitLine: { length: 8 }, detail: { valueAnimation: true, formatter: "{value}", color: textColor, fontSize: appearance.fontSize + 8 }, data: [item] }];
        } else if (chartType === "treemap") {
            base.series = [{ type: "treemap", top: titleSpace, bottom: 8, left: 8, right: 8, roam: detail.treemapRoam, breadcrumb: { show: detail.treemapBreadcrumb }, label: { show: appearance.showLabels, color: "#fff" }, upperLabel: { show: appearance.showLabels }, itemStyle: { gapWidth: detail.treemapGap }, data: hierarchicalData(dataset.rows, nameField, valueField) }];
        } else if (chartType === "sunburst") {
            base.series = [{ type: "sunburst", top: titleSpace, radius: [`${detail.sunburstInnerRadius}%`, "76%"], emphasis: { focus: "ancestor" }, label: { show: appearance.showLabels, rotate: detail.sunburstLabelRotate === "none" ? 0 : detail.sunburstLabelRotate, color: textColor }, data: hierarchicalData(dataset.rows, nameField, valueField) }];
        } else {
            const rotationRange = detail.wordCloudRotation === "none" ? [0, 0] : detail.wordCloudRotation === "rightAngle" ? [0, 90] : [-45, 45];
            base.series = [{ type: "wordCloud", shape: detail.wordCloudShape, left: "center", top: titleSpace, width: "94%", height: `calc(100% - ${titleSpace}px)`, sizeRange: [detail.wordCloudMinSize, Math.max(detail.wordCloudMinSize, detail.wordCloudMaxSize)], rotationRange, rotationStep: detail.wordCloudRotation === "free" ? 15 : 90, gridSize: detail.wordCloudGap, drawOutOfBound: false, textStyle: { color: (_params: any) => color?.[Math.floor(Math.random() * color.length)] || textColor }, data: commonData }];
        }
        return base;
    }

    const grid = {
        top: titleSpace + (appearance.showLegend && appearance.legendPosition === "top" ? 24 : 0),
        bottom: zoomSpace + (appearance.showLegend && appearance.legendPosition === "bottom" ? 25 : 0),
        left: sideLegend && appearance.legendPosition === "left" ? 100 : 48,
        right: sideLegend && appearance.legendPosition === "right" ? 100 : 20,
        containLabel: true,
    };
    const axisStyle = { axisLine: { lineStyle: { color: theme.border } }, axisLabel: { color: theme.muted }, splitLine: { lineStyle: { color: theme.border, opacity: 0.55 } } };

    if (chartType === "radar") {
        const maxByField = valueFields.map((field) => Math.max(1, ...dataset.rows.map((row) => numeric(row[field]))));
        base.radar = { center: ["50%", "58%"], radius: "68%", shape: detail.radarShape, splitNumber: detail.radarSplitNumber, indicator: valueFields.map((field, index) => ({ name: field, max: maxByField[index] * 1.15 })), axisName: { color: theme.muted }, splitLine: { lineStyle: { color: theme.border } } };
        base.series = [{ type: "radar", areaStyle: detail.radarFillOpacity > 0 ? { opacity: detail.radarFillOpacity / 100 } : undefined, data: dataset.rows.map((row) => ({ name: String(row[categoryField] ?? "数据"), value: valueFields.map((field) => numeric(row[field])) })) }];
        return base;
    }

    if (chartType === "heatmap") {
        const yField = mapping.secondaryValue || valueFields[0] || dataset.columns[1];
        const xValues = Array.from(new Set(dataset.rows.map((row) => String(row[categoryField] ?? ""))));
        const yValues = Array.from(new Set(dataset.rows.map((row) => String(row[yField] ?? ""))));
        const values = dataset.rows.map((row) => [xValues.indexOf(String(row[categoryField] ?? "")), yValues.indexOf(String(row[yField] ?? "")), numeric(row[valueField])]);
        const max = Math.max(1, ...values.map((item) => item[2]));
        base.grid = grid;
        base.xAxis = { type: "category", data: xValues, name: detail.xAxisTitle, nameLocation: "middle", nameGap: 28, ...axisStyle };
        base.yAxis = { type: "category", data: yValues, name: detail.yAxisTitle, nameLocation: "middle", nameGap: 38, ...axisStyle };
        const heatmapColors = [...(color?.length ? color : ["#e9efff", "#5b7cfa"] )];
        if (detail.heatmapReverse) heatmapColors.reverse();
        base.visualMap = { show: detail.heatmapShowScale, min: 0, max, calculable: true, orient: "horizontal", left: "center", bottom: 0, inRange: { color: heatmapColors }, textStyle: { color: theme.muted } };
        base.series = [{ type: "heatmap", data: values, label: { show: appearance.showLabels }, itemStyle: { borderColor: theme.surface, borderWidth: detail.heatmapBorderWidth }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,.25)" } } }];
        return base;
    }

    const horizontal = chartType === "horizontalBar";
    base.grid = grid;
    base.xAxis = horizontal ? { type: "value", name: detail.xAxisTitle, nameLocation: "middle", nameGap: 28, ...axisStyle } : { type: chartType === "scatter" ? "value" : "category", data: chartType === "scatter" ? undefined : categories, name: detail.xAxisTitle, nameLocation: "middle", nameGap: 28, ...axisStyle };
    base.yAxis = horizontal ? { type: "category", data: categories, name: detail.yAxisTitle, nameLocation: "middle", nameGap: 38, ...axisStyle } : { type: "value", name: detail.yAxisTitle, nameLocation: "middle", nameGap: 38, ...axisStyle };
    base.dataZoom = interaction.dataZoom ? [{ type: "inside", xAxisIndex: horizontal ? undefined : 0, yAxisIndex: horizontal ? 0 : undefined }, { type: "slider", xAxisIndex: horizontal ? undefined : 0, yAxisIndex: horizontal ? 0 : undefined, height: horizontal ? undefined : 14, width: horizontal ? 14 : undefined }] : undefined;
    base.series = valueFields.map((field, index) => {
        const type = chartType === "scatter" ? "scatter" : (chartType === "bar" || chartType === "horizontalBar") ? "bar" : "line";
        return {
            name: field,
            type,
            stack: appearance.stacked ? "total" : undefined,
            smooth: type === "line" ? detail.lineCurve === "smooth" : undefined,
            step: type === "line" && detail.lineCurve === "step" ? "middle" : undefined,
            showSymbol: type === "line" ? detail.lineShowSymbols : undefined,
            symbol: type === "scatter" ? detail.scatterSymbol : type === "line" ? detail.lineSymbol : undefined,
            symbolSize: type === "scatter" || type === "line" ? appearance.symbolSize : undefined,
            lineStyle: type === "line" ? { width: appearance.lineWidth, type: detail.lineStyle } : undefined,
            areaStyle: type === "line" && (chartType === "area" || appearance.showArea) ? { opacity: detail.lineAreaOpacity / 100 } : undefined,
            barMaxWidth: type === "bar" ? detail.barWidth : undefined,
            barGap: type === "bar" ? `${detail.barGap}%` : undefined,
            showBackground: type === "bar" ? detail.barShowBackground : undefined,
            backgroundStyle: type === "bar" ? { color: theme.border, opacity: 0.18, borderRadius: appearance.barRadius } : undefined,
            itemStyle: type === "bar" ? { borderRadius: appearance.barRadius } : type === "scatter" ? { opacity: detail.scatterOpacity / 100 } : undefined,
            label: { show: appearance.showLabels, position: type === "bar" ? "top" : "right" },
            data: dataset.rows.map((row) => chartType === "scatter" ? [numeric(row[categoryField]), numeric(row[field]), String(row[nameField] ?? "")] : numeric(row[field])),
            encode: chartType === "scatter" ? { tooltip: [0, 1, 2] } : undefined,
            emphasis: { focus: "series" },
            z: index + 2,
        };
    });
    return base;
}
