<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import * as echarts from "echarts";
    import type { WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import { buildWorkspaceTaskAnalytics, type WorkspaceTaskAnalyticsSelection, type WorkspaceTaskMetric } from "../enhancedDiaryWorkspaceTaskAnalytics";
    interface Props { models: WorkspaceTaskViewModel[]; onSelect: (selection: WorkspaceTaskAnalyticsSelection) => void; }
    let { models, onSelect }: Props = $props();
    let projectMode = $state<"direct" | "root">("direct");
    let statusElement = $state<HTMLDivElement | null>(null); let deadlineElement = $state<HTMLDivElement | null>(null); let priorityElement = $state<HTMLDivElement | null>(null); let scheduleElement = $state<HTMLDivElement | null>(null); let ageElement = $state<HTMLDivElement | null>(null);
    let charts: echarts.ECharts[] = []; let observer: ResizeObserver | null = null; let themeObserver: MutationObserver | null = null; let mounted = false;
    const snapshot = $derived(buildWorkspaceTaskAnalytics(models, projectMode));

    interface MetricVisual { color: string; opacity?: number; }
    type MetricVisualResolver = string | ((metric: WorkspaceTaskMetric) => string | MetricVisual);
    function css(name: string, fallback: string): string { const element = statusElement; return element ? getComputedStyle(element).getPropertyValue(name).trim() || fallback : fallback; }
    function chartFor(element: HTMLDivElement): echarts.ECharts { let chart = echarts.getInstanceByDom(element); if (!chart) { chart = echarts.init(element); charts.push(chart); } return chart; }
    function isEmpty(metrics: WorkspaceTaskMetric[]): boolean { return metrics.every((item) => item.value === 0); }
    function metricVisual(metric: WorkspaceTaskMetric, resolver: MetricVisualResolver): MetricVisual {
        const resolved = typeof resolver === "function" ? resolver(metric) : resolver;
        return typeof resolved === "string" ? { color: resolved } : resolved;
    }
    function common(metrics: WorkspaceTaskMetric[], resolver: MetricVisualResolver) { return { animation: !matchMedia("(prefers-reduced-motion: reduce)").matches, grid: { left: 45, right: 12, top: 18, bottom: 54 }, tooltip: { trigger: "item" }, xAxis: { type: "category", data: metrics.map((item) => item.label), axisLabel: { color: css("--wk-ink-muted", "#777"), interval: 0, rotate: metrics.length > 5 ? 25 : 0 } }, yAxis: { type: "value", minInterval: 1, axisLabel: { color: css("--wk-ink-muted", "#777") }, splitLine: { lineStyle: { color: css("--wk-border", "#ddd"), opacity: .45 } } }, series: [{ type: "bar", data: metrics.map((item) => ({ value: item.value, itemStyle: { ...metricVisual(item, resolver), borderRadius: [4, 4, 0, 0] } })) }] }; }
    function setupClick(chart: echarts.ECharts, kind: WorkspaceTaskAnalyticsSelection["kind"], metrics: WorkspaceTaskMetric[]): void { chart.off("click"); chart.on("click", (params) => { const item = metrics[params.dataIndex]; if (item) onSelect({ kind, key: item.key, label: item.label }); }); }
    async function render(): Promise<void> {
        if (!mounted) return;
        await tick();
        const primary = css("--b3-theme-primary", "#4f7cff");
        const success = css("--b3-card-success-color", "#4f8f63");
        const error = css("--b3-theme-error", "#c94a45");
        const warning = css("--b3-card-warning-color", "#b98232");
        const info = css("--b3-card-info-color", "#5f8fbf");
        const muted = css("--wk-ink-faint", "#9297a0");
        const neutralLight = css("--b3-border-color", "#c3c6cc");
        const statusColor = (item: WorkspaceTaskMetric): string => ({ completed: success, active: primary, overdue: error } as Record<string, string>)[item.key] || muted;
        const deadlineColor = (item: WorkspaceTaskMetric): string => ({ overdue: error, today: warning, week: primary, month: info, later: muted, none: neutralLight, invalid: error } as Record<string, string>)[item.key] || muted;
        const priorityColor = (item: WorkspaceTaskMetric): MetricVisual => item.key === "0" ? { color: muted } : item.key === "1" ? { color: info } : item.key === "2" ? { color: warning, opacity: .72 } : item.key === "3" ? { color: warning } : { color: error };
        const scheduleColor = (item: WorkspaceTaskMetric): string => ({ range: primary, start_only: info, deadline_only: warning, none: muted, invalid: error } as Record<string, string>)[item.key] || muted;
        const ageColor = (item: WorkspaceTaskMetric): MetricVisual => item.key === "0-7" ? { color: info, opacity: .72 } : item.key === "8-14" ? { color: primary } : item.key === "15-30" ? { color: warning, opacity: .68 } : item.key === "31-90" ? { color: warning } : item.key === "90+" ? { color: error } : { color: muted };
        if (statusElement) {
            const chart = chartFor(statusElement);
            if (isEmpty(snapshot.status)) chart.clear();
            else chart.setOption({ animation: !matchMedia("(prefers-reduced-motion: reduce)").matches, tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { color: css("--wk-ink-muted", "#777") } }, series: [{ type: "pie", radius: ["44%", "70%"], data: snapshot.status.map((item) => ({ name: item.label, value: item.value, itemStyle: { color: statusColor(item) } })), label: { color: css("--wk-ink-secondary", "#555") } }] }, true);
            setupClick(chart, "status", snapshot.status);
        }
        const barDefs: Array<[HTMLDivElement | null, WorkspaceTaskAnalyticsSelection["kind"], WorkspaceTaskMetric[], MetricVisualResolver]> = [[deadlineElement, "deadline", snapshot.deadlines, deadlineColor], [priorityElement, "priority", snapshot.priorities, priorityColor], [scheduleElement, "schedule", snapshot.schedules, scheduleColor], [ageElement, "age", snapshot.ages, ageColor]];
        barDefs.forEach(([element, kind, metrics, resolver]) => { if (!element) return; const chart = chartFor(element); if (isEmpty(metrics)) chart.clear(); else chart.setOption(common(metrics, resolver), true); setupClick(chart, kind, metrics); });
    }
    onMount(() => { mounted = true; observer = new ResizeObserver(() => charts.forEach((chart) => chart.resize())); [statusElement, deadlineElement, priorityElement, scheduleElement, ageElement].forEach((element) => element && observer?.observe(element)); themeObserver = new MutationObserver(() => void render()); themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme-mode"] }); void render(); });
    $effect(() => { void snapshot; if (mounted) void render(); });
    onDestroy(() => { mounted = false; observer?.disconnect(); themeObserver?.disconnect(); charts.forEach((chart) => chart.dispose()); charts = []; });
</script>

<section class="analytics-view">
    <div class="kpis">{#each snapshot.kpis as item}<button type="button" onclick={() => onSelect({ kind: "kpi", key: item.key, label: item.label })}><span>{item.label}</span><strong>{item.value}</strong></button>{/each}</div>
    <div class="charts"><article><h3>当前状态</h3><div class="chart-shell"><div class="chart" bind:this={statusElement}></div>{#if isEmpty(snapshot.status)}<span class="chart-empty">当前筛选范围暂无数据。</span>{/if}</div></article><article><h3>截止时间分布</h3><div class="chart-shell"><div class="chart" bind:this={deadlineElement}></div>{#if isEmpty(snapshot.deadlines)}<span class="chart-empty">当前筛选范围暂无数据。</span>{/if}</div></article><article><h3>优先级分布</h3><div class="chart-shell"><div class="chart" bind:this={priorityElement}></div>{#if isEmpty(snapshot.priorities)}<span class="chart-empty">当前筛选范围暂无数据。</span>{/if}</div></article><article><h3>排期结构</h3><div class="chart-shell"><div class="chart" bind:this={scheduleElement}></div>{#if isEmpty(snapshot.schedules)}<span class="chart-empty">当前筛选范围暂无数据。</span>{/if}</div></article><article><h3>任务年龄</h3><div class="chart-shell"><div class="chart" bind:this={ageElement}></div>{#if isEmpty(snapshot.ages)}<span class="chart-empty">当前筛选范围暂无数据。</span>{/if}</div></article></div>
    <div class="loads"><article><header><h3>项目负载</h3><select bind:value={projectMode}><option value="direct">最具体项目</option><option value="root">根项目聚合</option></select></header><div class="load-list">{#each snapshot.projects as item}<button type="button" onclick={() => onSelect({ kind: "project", key: item.key, label: item.label, projectMode })}><strong>{item.label}</strong><span>待办 {item.active} · 完成 {item.completed} · 逾期 {item.overdue}</span></button>{/each}</div></article>
        <article><header><h3>标签负载</h3><small>多标签任务会在多个标签中出现</small></header><div class="load-list">{#each snapshot.tags as item}<button type="button" onclick={() => onSelect({ kind: "tag", key: item.key, label: item.label })}><strong>#{item.label}#</strong><span>待办 {item.active} · 完成 {item.completed} · 逾期 {item.overdue}</span></button>{/each}</div></article></div>
</section>

<style>
    .analytics-view { display: grid; gap: 10px; min-width: 0; } .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; } .kpis button { display: grid; gap: 4px; padding: 10px; border: 1px solid var(--wk-border); border-radius: 9px; background: var(--wk-surface); color: var(--wk-ink-muted); text-align: left; cursor: pointer; } .kpis strong { color: var(--wk-ink); font-size: 20px; }
    .charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; } article { min-width: 0; padding: 10px; border: 1px solid var(--wk-border); border-radius: 10px; background: var(--wk-surface); } h3 { margin: 0; color: var(--wk-ink-secondary); font-size: var(--wk-text-base); } .chart-shell { position: relative; } .chart { width: 100%; height: 260px; } .chart-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--wk-ink-faint); font-size: var(--wk-text-sm); text-align: center; pointer-events: none; }
    .loads { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; } .loads header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; } .loads select { min-height: 30px; border: 1px solid var(--wk-border); border-radius: 6px; background: var(--wk-background); color: var(--wk-ink-secondary); } .loads small { color: var(--wk-ink-faint); }
    .load-list { display: grid; gap: 5px; } .load-list button { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px; border: 0; border-radius: 7px; background: var(--wk-background); color: var(--wk-ink-secondary); text-align: left; cursor: pointer; } .load-list span { color: var(--wk-ink-faint); font-size: var(--wk-text-xs); }
    @container (max-width: 760px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .charts, .loads { grid-template-columns: 1fr; } }
</style>
