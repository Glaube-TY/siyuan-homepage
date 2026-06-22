<script lang="ts">
    import { onMount } from "svelte";
    import * as echarts from "echarts";
    import {
        addDays,
        diffDays,
        normalizeIntervals,
        parseDateOnly,
        toLocalDateString,
    } from "./reviewDocsSchedule";
    import type { ReviewItem } from "./reviewDocsTypes";

    interface Props {
        item: ReviewItem;
    }

    interface CurveEvent {
        date: string;
        label: string;
        kind: "start" | "done" | "next" | "future";
    }

    interface CurveModel {
        today: string;
        rangeStart: string;
        rangeEnd: string;
        noReviewPoints: [string, number | null][];
        actualPoints: [string, number | null][];
        plannedPoints: [string, number | null][];
        markerPoints: Array<{ name: string; value: [string, number]; itemStyle: { color: string } }>;
        events: CurveEvent[];
        currentNoReviewRetention: number;
        currentActualRetention: number;
        currentPlannedRetention: number;
        nextDate: string;
        progressText: string;
        futureEventCount: number;
    }

    let { item }: Props = $props();

    let chartContainer: HTMLDivElement | null = null;
    let chartInstance: echarts.ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame: number | null = null;

    const model = $derived(buildCurveModel(item));

    onMount(() => {
        if (!chartContainer) return undefined;

        chartInstance = echarts.init(chartContainer);
        renderChart();
        setupResizeObserver();
        window.addEventListener("resize", scheduleResize);

        return () => {
            window.removeEventListener("resize", scheduleResize);
            if (resizeFrame !== null) {
                cancelAnimationFrame(resizeFrame);
                resizeFrame = null;
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }
            if (chartInstance) {
                chartInstance.dispose();
                chartInstance = null;
            }
        };
    });

    $effect(() => {
        model;
        if (chartInstance) {
            renderChart();
        }
    });

    function renderChart() {
        if (!chartInstance) return;

        const colors = getThemeColors();
        const option: echarts.EChartsOption = {
            animationDuration: 260,
            color: [colors.muted, colors.actual, colors.planned, colors.marker],
            grid: {
                left: 48,
                right: 22,
                top: 54,
                bottom: 58,
                containLabel: true,
            },
            legend: {
                top: 8,
                left: "center",
                itemWidth: 18,
                itemHeight: 8,
                textStyle: {
                    color: colors.text,
                    fontSize: 12,
                },
            },
            tooltip: {
                trigger: "axis",
                confine: true,
                backgroundColor: colors.tooltipBg,
                borderColor: colors.border,
                textStyle: {
                    color: colors.text,
                },
                formatter: formatTooltip,
            },
            dataZoom: [
                {
                    type: "inside",
                    minSpan: 12,
                },
                {
                    type: "slider",
                    height: 18,
                    bottom: 18,
                    borderColor: colors.border,
                    fillerColor: colors.zoomFill,
                    handleStyle: {
                        color: colors.planned,
                    },
                    textStyle: {
                        color: colors.lightText,
                    },
                },
            ],
            xAxis: {
                type: "time",
                min: model.rangeStart,
                max: model.rangeEnd,
                axisLine: {
                    lineStyle: {
                        color: colors.border,
                    },
                },
                axisLabel: {
                    color: colors.lightText,
                    formatter: "{MM}-{dd}",
                },
                splitLine: {
                    show: false,
                },
            },
            yAxis: {
                type: "value",
                min: 0,
                max: 105,
                axisLabel: {
                    color: colors.lightText,
                    formatter: "{value}%",
                },
                splitLine: {
                    lineStyle: {
                        color: colors.grid,
                    },
                },
            },
            series: [
                {
                    name: "一次都不复习",
                    type: "line",
                    smooth: true,
                    showSymbol: false,
                    data: model.noReviewPoints,
                    lineStyle: {
                        width: 2,
                        type: "dashed",
                        color: colors.muted,
                    },
                },
                {
                    name: "当前进度估计",
                    type: "line",
                    smooth: true,
                    showSymbol: false,
                    data: model.actualPoints,
                    lineStyle: {
                        width: 2,
                        color: colors.actual,
                    },
                    areaStyle: {
                        color: colors.actualArea,
                    },
                },
                {
                    name: "按计划复习",
                    type: "line",
                    smooth: true,
                    showSymbol: false,
                    data: model.plannedPoints,
                    lineStyle: {
                        width: 3,
                        color: colors.planned,
                    },
                    markLine: {
                        symbol: "none",
                        silent: true,
                        label: {
                            formatter: "今天",
                            color: colors.planned,
                        },
                        lineStyle: {
                            color: colors.planned,
                            type: "dotted",
                        },
                        data: [{ xAxis: model.today }],
                    },
                },
                {
                    name: "复习节点",
                    type: "scatter",
                    symbolSize: 9,
                    data: model.markerPoints,
                    z: 4,
                },
            ],
        };

        chartInstance.setOption(option, true);
        scheduleResize();
    }

    function setupResizeObserver() {
        if (!chartContainer || typeof ResizeObserver === "undefined") return;
        resizeObserver = new ResizeObserver(scheduleResize);
        resizeObserver.observe(chartContainer);
    }

    function scheduleResize() {
        if (resizeFrame !== null) {
            cancelAnimationFrame(resizeFrame);
        }
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            if (!chartInstance || !chartContainer) return;
            if (chartContainer.clientWidth > 0 && chartContainer.clientHeight > 0) {
                chartInstance.resize();
            }
        });
    }

    function formatTooltip(params: any): string {
        const items = Array.isArray(params) ? params : [params];
        const date = String(items[0]?.axisValueLabel || items[0]?.value?.[0] || "");
        const rows = items
            .filter((entry: any) => Array.isArray(entry?.value))
            .map((entry: any) => {
                const value = entry.value?.[1];
                const label = entry.seriesName === "复习节点"
                    ? entry.name
                    : `${Math.round(Number(value) || 0)}%`;
                return `<div style="display:flex;gap:12px;align-items:center;justify-content:space-between;">
                    <span>${entry.marker || ""}${entry.seriesName}</span>
                    <strong>${label}</strong>
                </div>`;
            })
            .join("");

        return `<div style="min-width:160px;"><div style="margin-bottom:6px;font-weight:600;">${date}</div>${rows}</div>`;
    }

    function buildCurveModel(reviewItem: ReviewItem): CurveModel {
        const attrs = reviewItem.attrs;
        const today = toLocalDateString();
        const intervals = normalizeIntervals(attrs.intervals);
        const createdDate = dateFromAny(attrs.createdAt) || dateFromSiyuanTimestamp(reviewItem.created);
        const lastReviewedDate = dateFromAny(attrs.lastReviewedAt);
        const inferredAnchor = inferAnchorDate(attrs.nextDate, lastReviewedDate, intervals, attrs.intervalIndex);
        const anchorDate = createdDate || inferredAnchor || attrs.nextDate || today;
        const completedEvents = buildCompletedEvents(anchorDate, lastReviewedDate, intervals, attrs.reviewCount, attrs.intervalIndex);
        const futureEvents = buildFutureEvents(attrs.nextDate, intervals, attrs.intervalIndex);
        const events = uniqueEvents([
            { date: anchorDate, label: "开始", kind: "start" },
            ...completedEvents,
            ...futureEvents,
        ]);

        const eventDates = events.map((event) => event.date);
        const rangeEnd = addDays(maxDate([today, attrs.nextDate, ...eventDates, addDays(today, 30)]), 7);
        let rangeStart = minDate([anchorDate, today, addDays(today, -14), ...eventDates]);
        if (diffDays(rangeEnd, rangeStart) > 420) {
            rangeStart = addDays(rangeEnd, -420);
        }

        const dates = enumerateDates(rangeStart, rangeEnd);
        const actualResetDates = uniqueDates([anchorDate, ...completedEvents.map((event) => event.date)]);
        const plannedResetDates = uniqueDates([anchorDate, ...events.map((event) => event.date)]);

        const noReviewPoints = dates.map((date) => [
            date,
            date < anchorDate ? null : retentionSince(anchorDate, date, 2.2),
        ] as [string, number | null]);
        const actualPoints = dates.map((date) => [
            date,
            date < anchorDate ? null : retentionByResetDates(date, actualResetDates),
        ] as [string, number | null]);
        const plannedPoints = dates.map((date) => [
            date,
            date < anchorDate ? null : retentionByResetDates(date, plannedResetDates),
        ] as [string, number | null]);

        const completedCount = Math.max(0, Number(attrs.reviewCount) || 0);
        const totalCount = intervals.length || Math.max(completedCount, 1);

        return {
            today,
            rangeStart,
            rangeEnd,
            noReviewPoints,
            actualPoints,
            plannedPoints,
            markerPoints: events
                .filter((event) => event.date >= rangeStart && event.date <= rangeEnd)
                .map((event) => ({
                    name: event.label,
                    value: [event.date, 100],
                    itemStyle: {
                        color: event.kind === "done"
                            ? "#16a34a"
                            : event.kind === "future"
                                ? "#f59e0b"
                                : event.kind === "next"
                                    ? "#2563eb"
                                    : "#6b7280",
                    },
                })),
            events,
            currentNoReviewRetention: retentionSince(anchorDate, today, 2.2),
            currentActualRetention: retentionByResetDates(today, actualResetDates),
            currentPlannedRetention: retentionByResetDates(today, plannedResetDates),
            nextDate: attrs.nextDate || "--",
            progressText: `${Math.min(completedCount, totalCount)}/${totalCount}`,
            futureEventCount: futureEvents.filter((event) => event.date >= today).length,
        };
    }

    function buildCompletedEvents(
        anchorDate: string,
        lastReviewedDate: string,
        intervals: number[],
        reviewCount: number,
        intervalIndex: number
    ): CurveEvent[] {
        const count = Math.max(0, Math.floor(Number(reviewCount) || 0));
        if (count === 0) return [];

        if (lastReviewedDate) {
            const dates = [lastReviewedDate];
            let cursor = lastReviewedDate;
            const lastCompletedIndex = Math.max(0, Math.min(intervalIndex - 1, intervals.length - 1));

            for (let index = lastCompletedIndex; index >= 1 && dates.length < count; index -= 1) {
                cursor = addDays(cursor, -Math.max(1, intervals[index] || 1));
                dates.unshift(cursor);
            }
            while (dates.length < count) {
                cursor = addDays(dates[0], -1);
                dates.unshift(cursor);
            }

            return dates.slice(-count).map((date, index) => ({
                date,
                label: `已复习 ${index + 1}`,
                kind: "done",
            }));
        }

        let cursor = anchorDate;
        return Array.from({ length: count }, (_, index) => {
            cursor = addDays(cursor, Math.max(0, intervals[index] || (index === 0 ? 0 : 1)));
            return {
                date: cursor,
                label: `已复习 ${index + 1}`,
                kind: "done" as const,
            };
        });
    }

    function buildFutureEvents(nextDate: string, intervals: number[], intervalIndex: number): CurveEvent[] {
        if (!nextDate) return [];

        const events: CurveEvent[] = [{
            date: nextDate,
            label: "下次复习",
            kind: "next",
        }];
        let cursor = nextDate;
        for (let index = Math.max(0, intervalIndex + 1); index < intervals.length && events.length < 9; index += 1) {
            cursor = addDays(cursor, Math.max(1, intervals[index] || 1));
            events.push({
                date: cursor,
                label: `预计第 ${index + 1} 次`,
                kind: "future",
            });
        }
        return events;
    }

    function retentionByResetDates(date: string, resetDates: string[]): number {
        const sortedDates = resetDates.filter((resetDate) => resetDate <= date).sort();
        const lastIndex = Math.max(0, sortedDates.length - 1);
        const resetDate = sortedDates[lastIndex] || resetDates[0] || date;
        const stability = Math.min(90, 2.4 * Math.pow(1.85, lastIndex));
        return retentionSince(resetDate, date, stability);
    }

    function retentionSince(startDate: string, date: string, stabilityDays: number): number {
        const days = Math.max(0, diffDays(date, startDate));
        return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-days / stabilityDays))));
    }

    function inferAnchorDate(nextDate: string, lastReviewedDate: string, intervals: number[], intervalIndex: number): string {
        if (lastReviewedDate) {
            let cursor = lastReviewedDate;
            for (let index = Math.max(0, Math.min(intervalIndex - 1, intervals.length - 1)); index >= 1; index -= 1) {
                cursor = addDays(cursor, -Math.max(1, intervals[index] || 1));
            }
            return cursor;
        }
        if (nextDate && intervals.length > 0) {
            const index = Math.max(0, Math.min(intervalIndex, intervals.length - 1));
            return addDays(nextDate, -Math.max(0, intervals[index] || 0));
        }
        return "";
    }

    function enumerateDates(startDate: string, endDate: string): string[] {
        const dates: string[] = [];
        let cursor = startDate;
        while (cursor <= endDate) {
            dates.push(cursor);
            cursor = addDays(cursor, 1);
        }
        return dates;
    }

    function uniqueEvents(events: CurveEvent[]): CurveEvent[] {
        const priority: Record<CurveEvent["kind"], number> = {
            start: 0,
            done: 3,
            next: 2,
            future: 1,
        };
        const eventMap = new Map<string, CurveEvent>();
        for (const event of events.filter((entry) => isDateText(entry.date))) {
            const current = eventMap.get(event.date);
            if (!current || priority[event.kind] >= priority[current.kind]) {
                eventMap.set(event.date, event);
            }
        }
        return Array.from(eventMap.values()).sort((left, right) => left.date.localeCompare(right.date));
    }

    function uniqueDates(dates: string[]): string[] {
        return Array.from(new Set(dates.filter(isDateText))).sort();
    }

    function minDate(dates: string[]): string {
        const validDates = dates.filter(isDateText).sort();
        return validDates[0] || toLocalDateString();
    }

    function maxDate(dates: string[]): string {
        const validDates = dates.filter(isDateText).sort();
        return validDates[validDates.length - 1] || toLocalDateString();
    }

    function isDateText(value: string): boolean {
        return Boolean(parseDateOnly(value));
    }

    function dateFromAny(value: string): string {
        const text = String(value || "");
        const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
        return match && isDateText(match[1]) ? match[1] : "";
    }

    function dateFromSiyuanTimestamp(value: string): string {
        const text = String(value || "");
        if (!/^\d{8}/.test(text)) return "";
        const dateText = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
        return isDateText(dateText) ? dateText : "";
    }

    function getThemeColors() {
        const style = getComputedStyle(document.documentElement);
        const primary = cssVar(style, "--b3-theme-primary", "#2563eb");
        const text = cssVar(style, "--b3-theme-on-surface", "#1f2937");
        const lightText = cssVar(style, "--b3-theme-on-surface-light", "#6b7280");
        const border = cssVar(style, "--b3-border-color", "#d1d5db");
        const surface = cssVar(style, "--b3-theme-surface", "#ffffff");

        return {
            planned: primary,
            actual: "#16a34a",
            actualArea: "rgba(22, 163, 74, 0.12)",
            muted: "#9ca3af",
            marker: "#f59e0b",
            text,
            lightText,
            border,
            grid: border,
            tooltipBg: surface,
            zoomFill: "rgba(37, 99, 235, 0.12)",
        };
    }

    function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
        return style.getPropertyValue(name).trim() || fallback;
    }
</script>

<div class="review-forgetting-curve-dialog">
    <div class="curve-header">
        <div class="title-block">
            <h3>{item.title}</h3>
            <p>{item.hpath || item.path || "复习内容"}</p>
        </div>
        <div class="plan-badge">艾宾浩斯</div>
    </div>

    <div class="metrics-grid">
        <div class="metric-card primary">
            <span>当前估计</span>
            <strong>{model.currentActualRetention}%</strong>
        </div>
        <div class="metric-card">
            <span>按计划今天</span>
            <strong>{model.currentPlannedRetention}%</strong>
        </div>
        <div class="metric-card muted">
            <span>不复习估计</span>
            <strong>{model.currentNoReviewRetention}%</strong>
        </div>
        <div class="metric-card">
            <span>下一次</span>
            <strong>{model.nextDate}</strong>
        </div>
        <div class="metric-card">
            <span>计划进度</span>
            <strong>{model.progressText}</strong>
        </div>
        <div class="metric-card">
            <span>未来节点</span>
            <strong>{model.futureEventCount}</strong>
        </div>
    </div>

    <div class="chart-panel">
        <div class="chart-container" bind:this={chartContainer}></div>
    </div>

    <div class="timeline-strip" aria-label="复习节点">
        {#each model.events as event}
            <span class={`timeline-pill ${event.kind}`} class:past={event.date < model.today} class:today={event.date === model.today}>
                {event.date} · {event.label}
            </span>
        {/each}
    </div>
</div>

<style lang="scss">
    .review-forgetting-curve-dialog {
        width: min(920px, calc(100vw - 32px));
        max-width: 100%;
        max-height: calc(100vh - 112px);
        overflow: auto;
        box-sizing: border-box;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        color: var(--b3-theme-on-surface, #222);

        .curve-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--b3-border-color, #e5e7eb);
        }

        .title-block {
            min-width: 0;
        }

        h3 {
            margin: 0;
            font-size: 18px;
            line-height: 1.35;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        p {
            margin: 4px 0 0;
            font-size: 12px;
            line-height: 1.5;
            color: var(--b3-theme-on-surface-light, #666);
            overflow-wrap: anywhere;
        }

        .plan-badge {
            flex: 0 0 auto;
            border: 1px solid rgba(37, 99, 235, 0.28);
            border-radius: 999px;
            padding: 3px 10px;
            background: rgba(37, 99, 235, 0.1);
            color: var(--b3-theme-primary, #2563eb);
            font-size: 12px;
            line-height: 1.4;
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
            gap: 8px;
        }

        .metric-card {
            min-width: 0;
            border: 1px solid var(--b3-border-color, #e5e7eb);
            border-radius: 8px;
            background: var(--b3-theme-surface, #fff);
            padding: 10px;
            box-sizing: border-box;
        }

        .metric-card span {
            display: block;
            font-size: 12px;
            line-height: 1.3;
            color: var(--b3-theme-on-surface-light, #666);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .metric-card strong {
            display: block;
            margin-top: 5px;
            font-size: 20px;
            line-height: 1.2;
            overflow-wrap: anywhere;
        }

        .metric-card.primary strong {
            color: #16a34a;
        }

        .metric-card.muted strong {
            color: #6b7280;
        }

        .chart-panel {
            min-width: 0;
            border: 1px solid var(--b3-border-color, #e5e7eb);
            border-radius: 8px;
            background: var(--b3-theme-surface, #fff);
            padding: 10px;
            box-sizing: border-box;
        }

        .chart-container {
            width: 100%;
            height: clamp(280px, 48vh, 520px);
            min-height: 260px;
        }

        .timeline-strip {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            max-height: 96px;
            overflow: auto;
            padding: 2px;
        }

        .timeline-pill {
            border: 1px solid var(--b3-border-color, #e5e7eb);
            border-radius: 999px;
            background: var(--b3-theme-background, #f9fafb);
            color: var(--b3-theme-on-surface-light, #666);
            padding: 3px 8px;
            font-size: 12px;
            line-height: 1.35;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .timeline-pill.done {
            color: #15803d;
            border-color: rgba(22, 163, 74, 0.3);
            background: rgba(22, 163, 74, 0.08);
        }

        .timeline-pill.next,
        .timeline-pill.today {
            color: var(--b3-theme-primary, #2563eb);
            border-color: rgba(37, 99, 235, 0.3);
            background: rgba(37, 99, 235, 0.08);
        }

        .timeline-pill.future {
            color: #b45309;
            border-color: rgba(245, 158, 11, 0.35);
            background: rgba(245, 158, 11, 0.1);
        }

        .timeline-pill.past:not(.done) {
            opacity: 0.72;
        }

        @media (max-width: 560px) {
            padding: 12px;

            .curve-header {
                flex-direction: column;
            }

            h3 {
                white-space: normal;
            }

            .chart-panel {
                padding: 6px;
            }

            .chart-container {
                height: 320px;
            }
        }
    }
</style>
