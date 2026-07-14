<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import * as echarts from "echarts";
    import type { VirtualElement } from "@floating-ui/dom";
    import type { WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import { buildWorkspaceTaskGanttData, clampGanttRowsToRange } from "../enhancedDiaryWorkspaceTaskTimeline";
    import { addDays, formatLocalDate, parseLocalDate } from "../enhancedDiaryWorkspaceDate";
    import WorkspaceTaskIcon from "./WorkspaceTaskIcon.svelte";
    interface Props { models: WorkspaceTaskViewModel[]; today: string; onSelect: (model: WorkspaceTaskViewModel) => void; onOpenProject?: (id: string) => void; onPreview: (model: WorkspaceTaskViewModel, anchor: HTMLElement | VirtualElement, source: "pointer" | "focus" | "click" | "keyboard") => void; onPreviewPointerLeave: (model: WorkspaceTaskViewModel) => void; onPreviewFocusLeave: (model: WorkspaceTaskViewModel) => void; }
    let { models, today, onSelect, onOpenProject, onPreview, onPreviewPointerLeave, onPreviewFocusLeave }: Props = $props();
    let range = $state<"30" | "60" | "90" | "180" | "all">("90");
    let chartElement = $state<HTMLDivElement | null>(null);
    let chart: echarts.ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let mounted = false;
    let previewModel: WorkspaceTaskViewModel | null = null;
    const data = $derived(buildWorkspaceTaskGanttData(models));
    const rows = $derived(range === "all" ? data.rows : clampGanttRowsToRange(data.rows, today, Number(range)));
    const projectGroups = $derived(Array.from(new Map(rows.map((row) => [row.projectKey, { id: row.projectKey, label: row.projectLabel }])).values()));

    function css(name: string, fallback: string): string { return chartElement ? getComputedStyle(chartElement).getPropertyValue(name).trim() || fallback : fallback; }
    function taskRow(params: any) { return params?.componentType === "series" && params?.seriesType === "custom" ? rows[params.dataIndex] : undefined; }
    function pointerAnchor(params: any): VirtualElement | null {
        if (!chartElement) return null;
        const source = params?.event?.event as MouseEvent | undefined;
        const bounds = chartElement.getBoundingClientRect();
        const clientX = source?.clientX ?? bounds.left + Number(params?.event?.offsetX || 0);
        const clientY = source?.clientY ?? bounds.top + Number(params?.event?.offsetY || 0);
        return { contextElement: chartElement, getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0) };
    }
    function handlePreviewFocusOut(event: FocusEvent, model: WorkspaceTaskViewModel): void {
        if (event.relatedTarget instanceof Node && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
        onPreviewFocusLeave(model);
    }
    function bounds(): { min: string; max: string } {
        if (range !== "all") { const days = Number(range); const half = Math.floor(days / 2); return { min: formatLocalDate(addDays(parseLocalDate(today), -half)), max: formatLocalDate(addDays(parseLocalDate(today), days - half)) }; }
        return { min: data.minDate || today, max: data.maxDate || today };
    }
    async function render(): Promise<void> {
        if (!mounted || !chartElement) return;
        await tick();
        if (!chart) {
            chart = echarts.init(chartElement);
            chart.on("mouseover", (params) => { const row = taskRow(params); const anchor = pointerAnchor(params); if (row && anchor) { previewModel = row.model; onPreview(row.model, anchor, "pointer"); } });
            chart.on("mouseout", (params) => { const row = taskRow(params); if (row) { onPreviewPointerLeave(row.model); if (previewModel?.task.blockId === row.model.task.blockId) previewModel = null; } });
            chart.on("globalout", () => { if (previewModel) { onPreviewPointerLeave(previewModel); previewModel = null; } });
            chart.on("click", (params) => { const row = taskRow(params); const anchor = pointerAnchor(params); if (row && anchor) { onSelect(row.model); previewModel = row.model; onPreview(row.model, anchor, "click"); } });
        }
        const { min, max } = bounds();
        const primary = css("--wk-primary", "#4f7cff"); const ink = css("--wk-ink-secondary", "#555"); const border = css("--wk-border", "#ddd"); const error = css("--wk-error", "#d23f31");
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        chart.setOption({
            animation: !reduced,
            grid: { left: 210, right: 28, top: 25, bottom: 48 },
            tooltip: { show: false },
            xAxis: { type: "time", min, max, axisLine: { lineStyle: { color: border } }, axisLabel: { color: ink }, splitLine: { show: true, lineStyle: { color: border, opacity: .45 } } },
            yAxis: { type: "category", inverse: true, data: rows.map((row) => `${row.projectLabel} · ${row.taskLabel}`), axisLabel: { color: ink, width: 190, overflow: "truncate" }, axisLine: { lineStyle: { color: border } } },
            dataZoom: [{ type: "inside", xAxisIndex: 0 }, { type: "slider", xAxisIndex: 0, height: 18, bottom: 5 }],
            series: [{
                type: "custom",
                data: rows.map((row, index) => [new Date(`${row.startDate}T00:00:00`).getTime(), new Date(`${row.endDate}T00:00:00`).getTime(), index, row.kind === "range" ? 0 : row.kind === "start" ? 1 : 2, row.model.isOverdue ? 1 : 0]),
                renderItem: (params: any, api: any) => {
                    const category = api.value(2); const start = api.coord([api.value(0), category]); const end = api.coord([api.value(1), category]); const height = Math.max(8, api.size([0, 1])[1] * .5); const color = api.value(4) ? error : primary; const kind = api.value(3);
                    if (kind === 1) return { type: "circle", shape: { cx: start[0], cy: start[1], r: 6 }, style: { fill: color } };
                    if (kind === 2) return { type: "polygon", shape: { points: [[start[0], start[1] - 7], [start[0] + 7, start[1]], [start[0], start[1] + 7], [start[0] - 7, start[1]]] }, style: { fill: color } };
                    return { type: "rect", shape: { x: start[0], y: start[1] - height / 2, width: Math.max(3, end[0] - start[0]), height, r: 4 }, style: { fill: color, opacity: .82 } };
                },
                encode: { x: [0, 1], y: 2 },
                markLine: { silent: true, symbol: "none", lineStyle: { color: error, type: "dashed", width: 1 }, label: { formatter: "今天", color: error }, data: [{ xAxis: new Date(`${today}T00:00:00`).getTime() }] },
            }],
        }, true);
    }

    onMount(() => {
        mounted = true; void render();
        if (chartElement) { resizeObserver = new ResizeObserver(() => chart?.resize()); resizeObserver.observe(chartElement); }
        themeObserver = new MutationObserver(() => void render()); themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme-mode"] });
    });
    $effect(() => { void rows; void range; if (mounted) void render(); });
    onDestroy(() => { mounted = false; if (previewModel) onPreviewPointerLeave(previewModel); previewModel = null; resizeObserver?.disconnect(); themeObserver?.disconnect(); chart?.dispose(); chart = null; });
</script>

<section class="gantt-view"><header><div><strong>项目任务甘特</strong><span>范围任务显示任务条；仅开始和仅截止任务显示真实单点节点。</span></div><select bind:value={range}><option value="30">30 天</option><option value="60">60 天</option><option value="90">90 天</option><option value="180">180 天</option><option value="all">适配全部</option></select></header>
    {#if projectGroups.length}<div class="project-links">{#each projectGroups as project}<button type="button" disabled={project.id === "__none__"} onclick={() => project.id !== "__none__" && onOpenProject?.(project.id)}><WorkspaceTaskIcon name="project" />{project.label}</button>{/each}</div>{/if}
    {#if rows.length}<div class="chart" bind:this={chartElement} style={`height:${Math.max(320, rows.length * 34 + 90)}px`}></div>{:else}<p class="empty">当前范围没有可绘制的真实任务日期。</p>{/if}
    {#if data.invalid.length}<div class="fallback danger"><strong>日期异常 {data.invalid.length}</strong>{#each data.invalid as model}<button type="button" class="task-preview-trigger" onmouseenter={(event) => onPreview(model, event.currentTarget, "pointer")} onmouseleave={() => onPreviewPointerLeave(model)} onfocus={(event) => onPreview(model, event.currentTarget, "focus")} onfocusout={(event) => handlePreviewFocusOut(event, model)} onclick={(event) => { onSelect(model); onPreview(model, event.currentTarget, "click"); }}>{model.task.taskname}</button>{/each}</div>{/if}
    {#if data.unscheduled.length}<div class="fallback"><strong>未排期任务 {data.unscheduled.length}</strong>{#each data.unscheduled as model}<button type="button" class="task-preview-trigger" onmouseenter={(event) => onPreview(model, event.currentTarget, "pointer")} onmouseleave={() => onPreviewPointerLeave(model)} onfocus={(event) => onPreview(model, event.currentTarget, "focus")} onfocusout={(event) => handlePreviewFocusOut(event, model)} onclick={(event) => { onSelect(model); onPreview(model, event.currentTarget, "click"); }}>{model.task.taskname}</button>{/each}</div>{/if}
</section>

<style>
    .gantt-view { display: grid; gap: 10px; min-width: 0; overflow: hidden; } header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; } header div { display: grid; gap: 3px; } header span { color: var(--wk-ink-faint); font-size: var(--wk-text-sm); } select { min-height: 34px; padding: 5px 8px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); }
    .chart { width: 100%; min-width: 720px; } .gantt-view:has(.chart) { overflow-x: auto; }
    .project-links, .fallback { display: flex; flex-wrap: wrap; gap: 5px; } .project-links button, .fallback button { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); cursor: pointer; } .project-links button:disabled { color: var(--wk-ink-faint); cursor: default; }
    .fallback { align-items: center; padding: 9px; border: 1px solid var(--wk-border); border-radius: 9px; } .fallback.danger { border-color: var(--wk-error-border); } .fallback strong { margin-right: 4px; color: var(--wk-ink-secondary); } .empty { padding: 22px; border: 1px dashed var(--wk-border); border-radius: 10px; color: var(--wk-ink-faint); text-align: center; }
</style>
