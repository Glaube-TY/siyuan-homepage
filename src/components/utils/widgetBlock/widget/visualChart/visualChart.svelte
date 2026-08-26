<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import { loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
    import { visualChartConfigFromWidgetContent } from "@/features/visual-chart/visual-chart-config";
    import { loadVisualChartData, transformVisualChartData } from "@/features/visual-chart/visual-chart-data";
    import type { VisualChartConfig, VisualChartDataset } from "@/features/visual-chart/visual-chart-types";
    import VisualChartCanvas from "./VisualChartCanvas.svelte";

    interface Props { plugin: any; contentTypeJson?: string; runtimeContext?: WidgetRuntimeContext }
    let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();

    function parseContent(input: string): Record<string, any> {
        try { const value = JSON.parse(input); return value && typeof value === "object" ? value : {}; }
        catch { return {}; }
    }

    let widgetContent = $state<Record<string, any>>(untrack(() => parseContent(contentTypeJson)));
    let config = $state<VisualChartConfig>(untrack(() => visualChartConfigFromWidgetContent(widgetContent)));
    let dataset = $state<VisualChartDataset>({ columns: [], rows: [], sourceLabel: "" });
    let loading = $state(true);
    let error = $state("");
    let advancedEnabled = $state(false);
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    const displayData = $derived(transformVisualChartData(dataset, config));

    async function reload(): Promise<void> {
        if (!advancedEnabled) { loading = false; return; }
        loading = true;
        error = "";
        try {
            const result = await loadVisualChartData(config);
            dataset = result;
            if (result.resolvedDatabaseId && result.resolvedDatabaseId !== config.source.databaseId) config.source.databaseId = result.resolvedDatabaseId;
        } catch (reason) {
            dataset = { columns: [], rows: [], sourceLabel: "" };
            error = reason instanceof Error ? reason.message : "图表数据读取失败";
        } finally { loading = false; }
    }

    function scheduleRefresh(): void {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = null;
        const seconds = Math.max(0, Number(config.source.refreshSeconds) || 0);
        if (seconds > 0 && config.source.type !== "manual") refreshTimer = setInterval(() => void reload(), seconds * 1000);
    }

    onMount(() => {
        let disposed = false;
        const enable = () => { advancedEnabled = true; void reload(); scheduleRefresh(); };
        const disable = () => { advancedEnabled = false; if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; };
        window.addEventListener("homepage-advanced-ready", enable);
        window.addEventListener("homepage-advanced-unavailable", disable);
        advancedEnabled = Boolean(plugin?.ADVANCED);
        void (async () => {
            const instanceId = String(widgetContent.instanceId || "");
            if (instanceId && runtimeContext.deviceViewContext) {
                const stored = await loadWidgetInstanceConfig(runtimeContext.deviceViewContext, instanceId).catch(() => null);
                if (!disposed && stored) { widgetContent = stored; config = visualChartConfigFromWidgetContent(stored); }
            }
            if (!disposed) { await reload(); scheduleRefresh(); }
        })();
        return () => {
            disposed = true;
            window.removeEventListener("homepage-advanced-ready", enable);
            window.removeEventListener("homepage-advanced-unavailable", disable);
        };
    });

    onDestroy(() => { if (refreshTimer) clearInterval(refreshTimer); });
</script>

<div class="visual-chart-widget" data-widget-part="root">
    {#if !advancedEnabled}
        <AdvancedFeatureLock compact title="可视化图表" subtitle="连接数据库、SQL 和文档数据生成图表" icon="chart" highlights={["多数据源", "动态图表"]} />
    {:else}
        <div class="chart-output">
            {#if loading && !displayData.rows.length}<div class="widget-state">正在载入图表…</div>
            {:else if error}<div class="widget-state error"><strong>图表需要配置</strong><span>{error}</span></div>
            {:else if !displayData.rows.length}<div class="widget-state"><strong>开始制作图表</strong><span>右键组件并打开图表工作台</span></div>
            {:else}<VisualChartCanvas {config} dataset={displayData} />{/if}
        </div>
        <div class="compact-warning"><strong>请放大组件</strong><span>放大后显示完整图表内容</span></div>
    {/if}
</div>

<style>
    .visual-chart-widget{position:relative;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;overflow:hidden;color:var(--b3-theme-on-background);container-type:size}.chart-output{width:100%;height:100%;min-width:0;min-height:0}.widget-state,.compact-warning{width:100%;height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:16px;color:var(--b3-theme-on-surface);text-align:center}.widget-state strong,.compact-warning strong{color:var(--b3-theme-on-background);font-size:13px}.widget-state span,.compact-warning span{max-width:82%;font-size:10px;line-height:1.4}.widget-state.error strong{color:var(--b3-theme-error)}.compact-warning{display:none;background:color-mix(in srgb,var(--b3-theme-surface) 84%,transparent)}@container (max-width:260px){.chart-output{display:none}.compact-warning{display:flex}}@container (max-height:190px){.chart-output{display:none}.compact-warning{display:flex}}@container (max-width:180px){.compact-warning span{display:none}.compact-warning{padding:8px}.compact-warning strong{font-size:11px}}
</style>
