<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import { loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
    import { resolveWidgetRuntimeInstanceId } from "../../utils/widgetRuntimeIdentity";
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
    let configReady = $state(false);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reloadPromise: Promise<void> | null = null;
    let lastReloadCompletedAt = 0;
    let hasLoadedOnce = false;
    let destroyed = false;
    let reloadGeneration = 0;
    let rootElement: HTMLDivElement | null = $state(null);
    let widgetVisible = $state(typeof IntersectionObserver === "undefined");
    let documentVisible = $state(document.visibilityState !== "hidden");
    let visibilityObserver: IntersectionObserver | null = null;
    const displayData = $derived(transformVisualChartData(dataset, config));
    const autoRefreshActive = $derived(advancedEnabled && configReady && widgetVisible && documentVisible);

    async function reload(generation: number): Promise<void> {
        if (!advancedEnabled) { loading = false; return; }
        loading = true;
        error = "";
        try {
            const result = await loadVisualChartData(config);
            if (destroyed || generation !== reloadGeneration) return;
            dataset = result;
            if (result.resolvedDatabaseId && result.resolvedDatabaseId !== config.source.databaseId) config.source.databaseId = result.resolvedDatabaseId;
        } catch (reason) {
            if (destroyed || generation !== reloadGeneration) return;
            dataset = { columns: [], rows: [], sourceLabel: "" };
            error = reason instanceof Error ? reason.message : "图表数据读取失败";
        } finally {
            if (destroyed || generation !== reloadGeneration) return;
            loading = false;
            hasLoadedOnce = true;
            lastReloadCompletedAt = Date.now();
        }
    }

    function clearRefreshTimer(): void {
        if (refreshTimer !== null) clearTimeout(refreshTimer);
        refreshTimer = null;
    }

    function shouldReloadOnActivation(): boolean {
        if (!hasLoadedOnce) return true;
        if (config.source.type === "manual") return false;
        const intervalMs = Math.max(0, Number(config.source.refreshSeconds) || 0) * 1000;
        return intervalMs > 0 && (lastReloadCompletedAt <= 0 || Date.now() - lastReloadCompletedAt >= intervalMs);
    }

    function scheduleRefresh(): void {
        clearRefreshTimer();
        if (!autoRefreshActive) return;
        const seconds = Math.max(0, Number(config.source.refreshSeconds) || 0);
        if (seconds <= 0 || config.source.type === "manual") return;
        if (!hasLoadedOnce) {
            void requestReload();
            return;
        }
        const intervalMs = seconds * 1000;
        const remainingMs = Math.max(0, intervalMs - Math.max(0, Date.now() - lastReloadCompletedAt));
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            if (!autoRefreshActive) return;
            if (shouldReloadOnActivation()) void requestReload();
            else scheduleRefresh();
        }, remainingMs);
    }

    function requestReload(): Promise<void> {
        if (reloadPromise) return reloadPromise;
        if (destroyed || !autoRefreshActive) return Promise.resolve();
        const generation = reloadGeneration;
        const request = reload(generation);
        reloadPromise = request;
        void request.then(
            () => {
                if (reloadPromise !== request) return;
                reloadPromise = null;
                if (!destroyed) scheduleRefresh();
            },
            () => {
                if (reloadPromise !== request) return;
                reloadPromise = null;
                if (!destroyed) scheduleRefresh();
            },
        );
        return request;
    }

    function syncRefreshActivity(wasActive = false): void {
        if (!autoRefreshActive) {
            clearRefreshTimer();
            return;
        }
        if (!wasActive && shouldReloadOnActivation()) {
            void requestReload();
            return;
        }
        scheduleRefresh();
    }

    function markDestroyed(): void {
        if (destroyed) return;
        destroyed = true;
        reloadGeneration += 1;
        clearRefreshTimer();
        visibilityObserver?.disconnect();
        visibilityObserver = null;
    }

    onMount(() => {
        const enable = () => {
            const wasActive = autoRefreshActive;
            advancedEnabled = true;
            syncRefreshActivity(wasActive);
        };
        const disable = () => { advancedEnabled = false; syncRefreshActivity(); };
        const handleDocumentVisibilityChange = () => {
            const wasActive = autoRefreshActive;
            documentVisible = document.visibilityState !== "hidden";
            syncRefreshActivity(!wasActive && autoRefreshActive);
        };
        window.addEventListener("homepage-advanced-ready", enable);
        window.addEventListener("homepage-advanced-unavailable", disable);
        document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
        advancedEnabled = Boolean(plugin?.ADVANCED);
        if (rootElement && typeof IntersectionObserver !== "undefined") {
            visibilityObserver = new IntersectionObserver((entries) => {
                const wasActive = autoRefreshActive;
                widgetVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
                syncRefreshActivity(!wasActive && autoRefreshActive);
            });
            visibilityObserver.observe(rootElement);
        }
        void (async () => {
            const instanceId = resolveWidgetRuntimeInstanceId(runtimeContext.instanceId, widgetContent) || "";
            if (instanceId && runtimeContext.deviceViewContext) {
                const stored = await loadWidgetInstanceConfig(runtimeContext.deviceViewContext, instanceId).catch(() => null);
                if (!destroyed && stored) { widgetContent = stored; config = visualChartConfigFromWidgetContent(stored); }
            }
            if (!destroyed) {
                configReady = true;
                syncRefreshActivity();
            }
        })();
        return () => {
            window.removeEventListener("homepage-advanced-ready", enable);
            window.removeEventListener("homepage-advanced-unavailable", disable);
            document.removeEventListener("visibilitychange", handleDocumentVisibilityChange);
            markDestroyed();
        };
    });

    onDestroy(() => {
        markDestroyed();
    });
</script>

<div bind:this={rootElement} class="visual-chart-widget" data-widget-part="root">
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
