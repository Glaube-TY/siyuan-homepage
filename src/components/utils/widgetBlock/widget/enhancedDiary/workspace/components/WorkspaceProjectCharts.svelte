<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import * as echarts from "echarts";
    import type { ProjectActivityDay, ProjectTaskViewFilter } from "../enhancedDiaryWorkspaceProjectAnalytics";
    import WorkspaceProjectIcon from "./WorkspaceProjectIcon.svelte";

    interface Props {
        activityDays: ProjectActivityDay[];
        taskTotal: number;
        completedTasks: number;
        pendingTasks: number;
        overdueTasks: number;
        completionRate: number;
        taskManagementEnabled?: boolean;
        onSelectDate: (date: string) => void;
        onSelectTaskStatus: (filter: ProjectTaskViewFilter) => void;
    }

    let {
        activityDays,
        taskTotal,
        completedTasks,
        pendingTasks,
        overdueTasks,
        completionRate,
        taskManagementEnabled = true,
        onSelectDate,
        onSelectTaskStatus,
    }: Props = $props();

    let trendElement = $state<HTMLDivElement | null>(null);
    let statusElement = $state<HTMLDivElement | null>(null);
    let trendChart: echarts.ECharts | null = null;
    let statusChart: echarts.ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let resizeFrame: number | null = null;
    let themeTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let themeSig = "";
    let lastTrendSize = "";
    let lastStatusSize = "";

    const hasTrendData = $derived(activityDays.some((day) =>
        day.recordCount > 0 || day.keyRecordCount > 0 || (taskManagementEnabled && day.taskCount > 0)
    ));
    const hasTaskData = $derived(taskManagementEnabled && taskTotal > 0);

    $effect(() => {
        activityDays;
        taskTotal;
        completedTasks;
        pendingTasks;
        overdueTasks;
        completionRate;
        taskManagementEnabled;
        void tick().then(() => syncCharts(true));
    });

    onMount(() => {
        setupObservers();
        void tick().then(() => syncCharts(true));
    });

    function readTheme() {
        const root = trendElement?.closest(".workspace-page") || statusElement?.closest(".workspace-page") || document.documentElement;
        const style = getComputedStyle(root);
        const host = trendElement || statusElement;
        const resolve = (name: string, fallback: string, property: "color" | "backgroundColor" = "color") => {
            if (!style.getPropertyValue(name).trim() || !host) return fallback;
            const probe = document.createElement("span");
            probe.style.position = "absolute";
            probe.style.visibility = "hidden";
            probe.style[property] = `var(${name})`;
            host.appendChild(probe);
            const value = getComputedStyle(probe)[property];
            probe.remove();
            return value || fallback;
        };
        const surface = resolve("--wk-surface", resolve("--b3-theme-surface", "transparent", "backgroundColor"), "backgroundColor");
        const ink = resolve("--wk-ink-secondary", resolve("--b3-theme-on-surface", "currentColor"));
        const muted = resolve("--wk-ink-muted", resolve("--b3-theme-on-surface-light", ink));
        return {
            surface,
            ink,
            muted,
            primary: resolve("--wk-primary", resolve("--b3-theme-primary", ink)),
            error: resolve("--wk-error", resolve("--b3-theme-error", ink)),
            border: resolve("--wk-border", resolve("--b3-border-color", muted)),
        };
    }

    function currentThemeSignature(): string {
        const colors = readTheme();
        return Object.values(colors).join("|");
    }

    function prefersReducedMotion(): boolean {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    }

    function chartSize(element: HTMLElement | null): string {
        return element ? `${Math.round(element.clientWidth)}x${Math.round(element.clientHeight)}` : "";
    }

    function setupObservers(): void {
        resizeObserver = new ResizeObserver(() => {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                if (destroyed) return;
                const trendSize = chartSize(trendElement);
                const statusSize = chartSize(statusElement);
                if (trendChart && trendSize && trendSize !== lastTrendSize) {
                    lastTrendSize = trendSize;
                    trendChart.resize();
                }
                if (statusChart && statusSize && statusSize !== lastStatusSize) {
                    lastStatusSize = statusSize;
                    statusChart.resize();
                }
            });
        });
        themeObserver = new MutationObserver(() => {
            const next = currentThemeSignature();
            if (next === themeSig) return;
            themeSig = next;
            if (themeTimer) clearTimeout(themeTimer);
            themeTimer = setTimeout(() => { if (!destroyed) renderCharts(); }, 160);
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
        themeSig = currentThemeSignature();
    }

    function observeElements(): void {
        resizeObserver?.disconnect();
        if (trendElement) resizeObserver?.observe(trendElement);
        if (statusElement) resizeObserver?.observe(statusElement);
    }

    function syncCharts(render: boolean): void {
        if (destroyed) return;
        if (hasTrendData && trendElement && !trendChart) {
            trendChart = echarts.init(trendElement);
            trendChart.on("click", (params: any) => {
                const date = typeof params.name === "string" ? params.name : "";
                if (date) onSelectDate(date);
            });
        } else if ((!hasTrendData || !trendElement) && trendChart) {
            trendChart.dispose();
            trendChart = null;
        }
        if (hasTaskData && statusElement && !statusChart) {
            statusChart = echarts.init(statusElement);
            statusChart.on("click", (params: any) => {
                if (params.name === "已完成") onSelectTaskStatus("completed");
                else if (params.name === "逾期") onSelectTaskStatus("overdue");
                else if (params.name === "待完成") onSelectTaskStatus("pending");
            });
        } else if ((!hasTaskData || !statusElement) && statusChart) {
            statusChart.dispose();
            statusChart = null;
        }
        observeElements();
        if (render) renderCharts();
    }

    function tooltip(colors: ReturnType<typeof readTheme>) {
        return {
            trigger: "axis" as const,
            confine: true,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            textStyle: { color: colors.ink },
            axisPointer: { type: "shadow" as const },
        };
    }

    function renderCharts(): void {
        const colors = readTheme();
        const animation = !prefersReducedMotion();
        if (trendChart) {
            const series: any[] = [];
            if (taskManagementEnabled) series.push({
                name: "任务", type: "bar", stack: "activity", barMaxWidth: 15,
                itemStyle: { color: colors.primary }, data: activityDays.map((day) => day.taskCount),
            });
            series.push({
                name: "记录", type: "bar", stack: "activity", barMaxWidth: 15,
                itemStyle: { color: echarts.color.modifyAlpha(colors.primary, 0.32) }, data: activityDays.map((day) => day.recordCount),
            });
            series.push({
                name: "关键记录", type: "scatter", symbolSize: 7,
                itemStyle: { color: colors.primary, borderColor: colors.surface, borderWidth: 1 },
                dimensions: ["日期", "位置", "关键记录"], encode: { x: "日期", y: "位置", tooltip: ["关键记录"] },
                data: activityDays.map((day) => day.keyRecordCount > 0
                    ? { name: day.date, value: [day.date, day.taskCount + day.recordCount + day.keyRecordCount, day.keyRecordCount] }
                    : { name: day.date, value: [day.date, null, 0] }),
            });
            trendChart.setOption({
                animation,
                grid: { left: 34, right: 14, top: 32, bottom: 28 },
                tooltip: tooltip(colors),
                legend: { top: 0, right: 0, textStyle: { color: colors.muted }, itemWidth: 10, itemHeight: 8 },
                xAxis: {
                    type: "category", data: activityDays.map((day) => day.date),
                    axisLabel: { color: colors.muted, formatter: (value: string, index: number) => index % 5 === 0 ? value.slice(5) : "" },
                    axisLine: { lineStyle: { color: colors.border } }, axisTick: { show: false },
                },
                yAxis: { type: "value", minInterval: 1, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: echarts.color.modifyAlpha(colors.border, 0.45) } } },
                series,
            }, true);
            lastTrendSize = chartSize(trendElement);
            trendChart.resize();
        }
        if (statusChart) {
            statusChart.setOption({
                animation,
                tooltip: { ...tooltip(colors), trigger: "item", formatter: "{b}: {c}" },
                title: {
                    text: `${completionRate}%`, subtext: "完成率", left: "center", top: "39%",
                    textStyle: { color: colors.ink, fontSize: 22, fontWeight: 700 }, subtextStyle: { color: colors.muted, fontSize: 12 },
                },
                series: [{
                    type: "pie", radius: ["58%", "78%"], center: ["50%", "52%"], avoidLabelOverlap: true,
                    label: { show: false }, emphasis: { scaleSize: 4 },
                    data: [
                        { name: "已完成", value: completedTasks, itemStyle: { color: colors.primary } },
                        { name: "待完成", value: Math.max(0, pendingTasks - overdueTasks), itemStyle: { color: echarts.color.modifyAlpha(colors.muted, 0.38) } },
                        { name: "逾期", value: overdueTasks, itemStyle: { color: colors.error } },
                    ],
                }],
            }, true);
            lastStatusSize = chartSize(statusElement);
            statusChart.resize();
        }
    }

    onDestroy(() => {
        destroyed = true;
        resizeObserver?.disconnect();
        themeObserver?.disconnect();
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        if (themeTimer) clearTimeout(themeTimer);
        trendChart?.dispose();
        statusChart?.dispose();
        trendChart = null;
        statusChart = null;
    });
</script>

<div class="project-chart-grid" class:single={!taskManagementEnabled}>
    <section class="project-chart-card trend-card">
        <header><WorkspaceProjectIcon name="chart" /><div><h4>项目活动趋势</h4><p>最近 30 天的真实任务来源与记录日期</p></div></header>
        {#if hasTrendData}<div class="chart-canvas" bind:this={trendElement} aria-label="项目活动趋势图"></div>
        {:else}<div class="chart-empty">最近 30 天暂无可绘制的项目活动。</div>{/if}
    </section>
    {#if taskManagementEnabled}
        <section class="project-chart-card status-card">
            <header><WorkspaceProjectIcon name="tasks" /><div><h4>任务状态</h4><p>当前互斥状态分布</p></div></header>
            {#if hasTaskData}<div class="chart-canvas" bind:this={statusElement} aria-label="项目任务状态图"></div>
            {:else}<div class="chart-empty">当前项目暂无任务。</div>{/if}
        </section>
    {/if}
</div>

<style>
    .project-chart-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 12px; min-width: 0; }
    .project-chart-grid.single { grid-template-columns: minmax(0, 1fr); }
    .project-chart-card { min-width: 0; padding: 14px; border: 1px solid var(--wk-border); border-radius: 13px; background: var(--wk-surface); }
    header { display: flex; align-items: flex-start; gap: 8px; color: var(--wk-primary); }
    h4, p { margin: 0; }
    h4 { color: var(--wk-ink-secondary); font-size: var(--wk-text-md); }
    p { margin-top: 2px; color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .chart-canvas { width: 100%; height: 260px; min-width: 0; }
    .chart-empty { display: grid; place-items: center; min-height: 220px; color: var(--wk-ink-muted); text-align: center; }
    @container (max-width: 860px) { .project-chart-grid { grid-template-columns: 1fr; } }
    @container (max-width: 520px) { .chart-canvas { height: 230px; } }
</style>
