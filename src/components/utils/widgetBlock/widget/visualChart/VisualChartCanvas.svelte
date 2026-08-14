<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import * as echarts from "@/utils/charts/echarts";
    import "echarts-wordcloud";
    import { buildVisualChartOption } from "@/features/visual-chart/visual-chart-option";
    import type { VisualChartConfig, VisualChartDataset } from "@/features/visual-chart/visual-chart-types";

    interface Props {
        config: VisualChartConfig;
        dataset: VisualChartDataset;
    }

    let { config, dataset }: Props = $props();
    let container = $state<HTMLDivElement | null>(null);
    let chart: echarts.ECharts | null = null;
    let observer: ResizeObserver | null = null;
    let frame = 0;

    function css(name: string, fallback: string): string {
        if (!container) return fallback;
        return getComputedStyle(container).getPropertyValue(name).trim() || fallback;
    }

    function render(): void {
        if (!container || !container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) return;
        chart ||= echarts.init(container, undefined, { renderer: "canvas" });
        chart.setOption(buildVisualChartOption(dataset, config, {
            text: css("--b3-theme-on-background", "#2f3441"),
            muted: css("--b3-theme-on-surface", "#707786"),
            border: css("--b3-border-color", "#d9dde7"),
            surface: css("--b3-theme-surface", "#ffffff"),
        }), { notMerge: true, lazyUpdate: true });
        chart.resize();
    }

    function scheduleRender(): void {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(render);
    }

    $effect(() => {
        config;
        dataset;
        scheduleRender();
    });

    onMount(() => {
        scheduleRender();
        if (container && typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(scheduleRender);
            observer.observe(container);
        }
    });

    onDestroy(() => {
        cancelAnimationFrame(frame);
        observer?.disconnect();
        chart?.dispose();
        chart = null;
    });
</script>

<div class="visual-chart-canvas" bind:this={container} aria-label={config.appearance.title || "可视化图表"}></div>

<style>
    .visual-chart-canvas{width:100%;height:100%;min-width:0;min-height:0}
</style>
