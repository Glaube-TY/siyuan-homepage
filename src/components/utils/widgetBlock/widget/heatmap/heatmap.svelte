<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import * as echarts from "echarts";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import LocalIndexEmptyState from "../common/LocalIndexEmptyState.svelte";
    import {
        ensureHeatmapIndexInitialized,
        getRecentHeatmapCountsResult,
        refreshHeatmapIndexFromRecentDocuments,
        type ComponentCountsResult,
    } from "@/components/tools/siyuanComponentDataApi";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
    import {
        buildHeatmapCalendarData,
        formatHeatmapCalendarValue,
        getHeatmapRangeByMonthCount,
    } from "./heatmapDate";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();
    const parsedContent = $derived(JSON.parse(contentTypeJson));

    const heatmapTitle = $derived(parsedContent?.data?.heatmapTitle || "");
    const pastMonthCount = $derived(parsedContent?.data?.pastMonthCount || 6);
    const showLabel = $derived(parsedContent?.data?.showLabel ?? true);
    const colorPreset = $derived(parsedContent?.data?.selectedColorPreset || "github");
    const customColor = $derived(parsedContent?.data?.customColor || "#1ea769");
    const heatmapCountType = $derived(parsedContent?.data?.heatmapCountType || "block");

    // ECharts 实例引用
    let chartInstance: echarts.ECharts | null = null;
    // 图表容器本地引用
    let chartContainer = $state<HTMLDivElement | null>(null);
    // 延迟初始化 timeout id
    let initTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // 延后重绘 timeout id
    let redrawTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // 主题观察器
    let themeObserver: MutationObserver | null = null;
    // 主题调度 timeout id
    let themeScheduleTimeout: ReturnType<typeof setTimeout> | null = null;
    // 上次主题签名
    let lastThemeSignature: string = "";
    // ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    // resize 调度 raf id
    let resizeRafId: number | null = null;
    // 组件销毁标记
    let isDestroyed = false;
    // 缓存当前图表数据，用于重绘
    let currentChartData: [string, number][] = [];
    let currentCounts: Record<string, number> = {};
    let hasHeatmapData = $state(false);
    let heatmapStatusMessage = $state("热力图索引为空，请到主页设置 > 检索管理中刷新或手动重建索引。");
    let heatmapDataStatus = $state<"ok" | "empty" | "limited" | "disabled" | "unsupported" | "error">("empty");
    let isInitializing = $state(false);
    // 会员锁定状态
    let isLocked = $state(false);

    // 内存短 TTL 缓存（5 分钟），key: mode|startDate|endDate|monthCount
    const HEATMAP_CACHE_TTL_MS = 5 * 60 * 1000;
    const heatmapCache = new Map<string, { result: ComponentCountsResult; expiresAt: number }>();

    function getHeatmapCacheKey(mode: string, startDate: string, endDate: string, monthCount: number): string {
        return `${mode}|${startDate}|${endDate}|${monthCount}`;
    }

    function getCachedResult(key: string): ComponentCountsResult | null {
        const entry = heatmapCache.get(key);
        if (entry && entry.expiresAt > Date.now()) {
            return entry.result;
        }
        heatmapCache.delete(key);
        return null;
    }

    function setCachedResult(key: string, result: ComponentCountsResult): void {
        heatmapCache.set(key, { result, expiresAt: Date.now() + HEATMAP_CACHE_TTL_MS });
    }

    function clampHeatmapMonthCount(value: number | null | undefined): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
            return 6;
        }
        return Math.floor(parsed);
    }

    async function loadHeatmapData() {
        const monthCount = clampHeatmapMonthCount(pastMonthCount);
        const [startDate, endDate] = getHeatmapRangeByMonthCount(monthCount);
        const forceIndexRefresh = runtimeContext.forceIndexRefresh === true;
        await refreshHeatmapIndexFromRecentDocuments(plugin, {
            force: forceIndexRefresh,
        });
        const cacheKey = getHeatmapCacheKey(heatmapCountType, startDate, endDate, monthCount);

        let result = forceIndexRefresh ? null : getCachedResult(cacheKey);
        if (!result) {
            result = heatmapCountType === "words"
                ? await getWordCounts(startDate, endDate, plugin)
                : await getBlockCounts(startDate, endDate, plugin);
            setCachedResult(cacheKey, result);
        }

        if (isDestroyed) return;

        const counts = result.counts;
        currentCounts = counts;
        heatmapStatusMessage = result.message || heatmapStatusMessage;
        heatmapDataStatus = result.status;

        const hasPositiveData = Object.values(counts).some((value) => Number(value) > 0);
        const shouldRenderHeatmap = hasPositiveData || result.mode === "index";

        if (shouldRenderHeatmap && result.status !== "disabled" && result.status !== "error") {
            currentChartData = buildHeatmapCalendarData(counts, monthCount);
            hasHeatmapData = true;

            await tick();

            initHeatmapChartWithRetry();
        }
    }

    onMount(async () => {
        const advancedEnabled = plugin.ADVANCED;
        if (!advancedEnabled && heatmapCountType === "words") {
            isLocked = true;
            return;
        }

        const monthCount = clampHeatmapMonthCount(pastMonthCount);
        const [startDate, endDate] = getHeatmapRangeByMonthCount(monthCount);
        isInitializing = true;
        heatmapStatusMessage = "正在初始化热力图索引...";
        try {
            const initResult = await ensureHeatmapIndexInitialized(plugin, startDate, endDate);
            if (isDestroyed) return;
            if (initResult.initialized && initResult.status.lastStatus !== "success") {
                heatmapDataStatus = "error";
                heatmapStatusMessage = `${initResult.status.lastMessage || "热力图索引初始化失败"}，请到主页设置 > 检索管理中手动重建索引。`;
                return;
            }
            await loadHeatmapData();
        } catch (error) {
            if (isDestroyed) return;
            heatmapDataStatus = "error";
            heatmapStatusMessage = error instanceof Error ? error.message : "热力图索引初始化失败，请到主页设置 > 检索管理中手动重建索引。";
        } finally {
            if (!isDestroyed) isInitializing = false;
        }
    });

    function initHeatmapChartWithRetry(maxAttempts = 5) {
        if (isDestroyed) return;

        if (!chartContainer || chartContainer.clientWidth === 0 || chartContainer.clientHeight === 0) {
            if (maxAttempts > 0) {
                setTimeout(() => initHeatmapChartWithRetry(maxAttempts - 1), 100);
            }
            return;
        }

        // 避免重复初始化
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }

        const myChart = echarts.init(chartContainer);
        chartInstance = myChart;

        initTimeoutId = setTimeout(() => {
            if (isDestroyed) return;
            applyChartTheme();

            redrawTimeoutId = setTimeout(() => {
                if (!isDestroyed && chartInstance) {
                    applyChartTheme();
                }
            }, 100);

            setupThemeObserver();
        }, 0);
    }

    function applyChartTheme() {
        if (!chartInstance) return;

        const colorGradient = getColorGradient(colorPreset, customColor);

        const themeMode = window.siyuan.config.appearance.mode;
        const themeColor1 = getComputedStyle(document.documentElement)
            .getPropertyValue("--b3-theme-surface")
            .trim();
        const themeColor3 = getComputedStyle(document.documentElement)
            .getPropertyValue("--b3-theme-on-primary")
            .trim();
        const themeColor4 = getComputedStyle(document.documentElement)
            .getPropertyValue("--b3-theme-on-background")
            .trim();

        let themeTextColor = themeColor3;
        if (themeMode === 0) {
            themeTextColor = themeColor4;
        }

        chartInstance.setOption({
                title: {
                    show: !!heatmapTitle,
                    left: "center",
                    text: heatmapTitle,
                    textStyle: {
                        color: themeTextColor,
                    },
                },
                tooltip: {
                    formatter: ({ data }) => {
                        const [date, value] = data;
                        const unit =
                            heatmapCountType === "words" ? "个字" : "个块";
                        return `${date}: ${value} ${unit}`;
                    },
                },
                visualMap: {
                    show: showLabel,
                    min: 0,
                    max: Math.max(1, ...(Object.values(currentCounts) as number[])),
                    type: "piecewise",
                    orient: "horizontal",
                    left: "center",
                    top: heatmapTitle ? 40 : 0,
                    textStyle: {
                        color: themeTextColor,
                    },
                    inRange: {
                        color: colorGradient,
                    },
                },
                calendar: {
                    top: (!showLabel && !heatmapTitle) ? 30 : (showLabel && heatmapTitle) ? 100 : 50,
                    left: 30,
                    right: 10,
                    cellSize: ["auto", "auto"],
                    range: getHeatmapRangeByMonthCount(pastMonthCount),
                    itemStyle: {
                        borderWidth: 2,
                        borderColor: "transparent",
                        color: "transparent",
                    },
                    splitLine: {
                        show: false,
                    },
                    yearLabel: { show: false },
                    monthLabel: { show: true, color: themeTextColor },
                    dayLabel: { show: true, color: themeTextColor },
                },
                series: {
                    type: "custom",
                    coordinateSystem: "calendar",
                    renderItem: (params, api) => {
                        const cellPoint = api.coord(api.value(0));
                        const cellWidth = params.coordSys.cellWidth;
                        const cellHeight = params.coordSys.cellHeight;

                        if (isNaN(cellPoint[0]) || isNaN(cellPoint[1])) {
                            return null;
                        }

                        const dateValue = api.value(0);
                        const date = formatHeatmapCalendarValue(dateValue);
                        const value = api.value(1) as number;

                        const children: echarts.CustomSeriesRenderItemReturn[] = [];
                        const padding = 2;

                        // 基础背景块（每一天都有，内缩露出背景）
                        children.push({
                            type: "rect",
                            shape: {
                                x: cellPoint[0] - cellWidth / 2 + padding,
                                y: cellPoint[1] - cellHeight / 2 + padding,
                                width: cellWidth - padding * 2,
                                height: cellHeight - padding * 2,
                                r: 2,
                            },
                            style: {
                                fill: themeColor1,
                                opacity: 0.3,
                            },
                        });

                        // 有数据时叠加热力色块
                        if (value > 0) {
                            const maxValue = Math.max(1, ...(Object.values(currentCounts) as number[]));
                            const intensity = Math.min(1, value / maxValue);
                            const colorIndex = Math.min(4, Math.floor(intensity * 5));
                            const heatColor = colorGradient[colorIndex] || colorGradient[colorGradient.length - 1];

                            children.push({
                                type: "rect",
                                shape: {
                                    x: cellPoint[0] - cellWidth / 2 + padding,
                                    y: cellPoint[1] - cellHeight / 2 + padding,
                                    width: cellWidth - padding * 2,
                                    height: cellHeight - padding * 2,
                                    r: 2,
                                },
                                style: {
                                    fill: heatColor,
                                },
                            });
                        }

                        // 日期数字
                        children.push({
                            type: "text",
                            style: {
                                x: cellPoint[0],
                                y: cellPoint[1],
                                text: date.split("-")[2],
                                fill: themeTextColor,
                                font: api.font({ fontSize: 10 }),
                                align: "center",
                                verticalAlign: "middle",
                            },
                        });

                        return {
                            type: "group",
                            children,
                        };
                    },
                    data: currentChartData,
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowColor: "rgba(0, 0, 0, 0.5)",
                        },
                    },
                },
            });

        // 触发 resize 确保布局正确
        chartInstance.resize();
    }

    function getThemeSignature(): string {
        const mode = window.siyuan?.config?.appearance?.mode ?? 0;
        const surface = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-surface").trim();
        const background = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-background").trim();
        const primary = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-primary").trim();
        const onSurface = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-on-surface").trim();
        return `${mode}|${surface}|${background}|${primary}|${onSurface}`;
    }

    function scheduleThemeUpdate() {
        if (themeScheduleTimeout) {
            clearTimeout(themeScheduleTimeout);
        }
        themeScheduleTimeout = setTimeout(() => {
            if (isDestroyed) return;
            const newSignature = getThemeSignature();
            if (newSignature !== lastThemeSignature) {
                lastThemeSignature = newSignature;
                if (chartInstance) {
                    applyChartTheme();
                }
            }
        }, 50);
    }

    function setupThemeObserver() {
        // 初始化主题签名
        lastThemeSignature = getThemeSignature();

        // 观察 document.documentElement 和 document.body 的属性变化
        themeObserver = new MutationObserver(() => {
            if (isDestroyed) return;
            // 调度主题更新（去重 + 延后）
            scheduleThemeUpdate();
        });

        // 观察 html 和 body 的 class/style 变化
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style", "data-theme"],
        });

        if (document.body) {
            themeObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["class", "style", "data-theme"],
            });
        }

        // 观察 head 中的主题样式表变化
        const headObserver = new MutationObserver((mutations) => {
            if (isDestroyed) return;
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    const addedNodes = Array.from(mutation.addedNodes);
                    const hasThemeStyle = addedNodes.some((node: any) => {
                        if (node.nodeName === "LINK" || node.nodeName === "STYLE") {
                            const href = node.getAttribute?.("href") || "";
                            return href.includes("theme") || href.includes("appearance");
                        }
                        return false;
                    });
                    if (hasThemeStyle) {
                        scheduleThemeUpdate();
                    }
                }
            }
        });

        headObserver.observe(document.head, {
            childList: true,
        });

        // 保存引用以便清理
        (themeObserver as any)._headObserver = headObserver;

        // 设置 ResizeObserver 监听容器尺寸变化
        setupResizeObserver();

        // 监听页面可见性变化
        document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    function scheduleChartResize() {
        if (resizeRafId) {
            cancelAnimationFrame(resizeRafId);
        }
        resizeRafId = requestAnimationFrame(() => {
            resizeRafId = null;
            if (isDestroyed || !chartInstance || !chartContainer) return;
            if (chartContainer.clientWidth > 0 && chartContainer.clientHeight > 0) {
                chartInstance.resize();
            }
        });
    }

    function setupResizeObserver() {
        if (!chartContainer || typeof ResizeObserver === "undefined") return;

        resizeObserver = new ResizeObserver(() => {
            if (isDestroyed) return;
            scheduleChartResize();
        });

        resizeObserver.observe(chartContainer);
    }

    function handleVisibilityChange() {
        if (document.visibilityState === "visible" && !isDestroyed) {
            scheduleChartResize();
        }
    }

    onDestroy(() => {
        isDestroyed = true;

        // 清理延迟初始化 timeout
        if (initTimeoutId) {
            clearTimeout(initTimeoutId);
            initTimeoutId = null;
        }

        // 清理延后重绘 timeout
        if (redrawTimeoutId) {
            clearTimeout(redrawTimeoutId);
            redrawTimeoutId = null;
        }

        // 清理主题调度 timeout
        if (themeScheduleTimeout) {
            clearTimeout(themeScheduleTimeout);
            themeScheduleTimeout = null;
        }

        // 断开主题观察器
        if (themeObserver) {
            themeObserver.disconnect();
            // 断开 head observer
            if ((themeObserver as any)._headObserver) {
                (themeObserver as any)._headObserver.disconnect();
            }
            themeObserver = null;
        }

        // 断开 ResizeObserver
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        // 取消 resize raf
        if (resizeRafId) {
            cancelAnimationFrame(resizeRafId);
            resizeRafId = null;
        }

        // 移除 visibilitychange 监听
        document.removeEventListener("visibilitychange", handleVisibilityChange);

        // 销毁 ECharts 实例
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }

        // 释放容器引用
        chartContainer = null;
    });

    async function getBlockCounts(startDate: string, endDate: string, plugin: any) {
        return getRecentHeatmapCountsResult(startDate, endDate, "block", plugin);
    }

    async function getWordCounts(startDate: string, endDate: string, plugin: any) {
        return getRecentHeatmapCountsResult(startDate, endDate, "word", plugin);
    }

    function getColorGradient(preset, color) {
        const opacitySteps = [0.1, 0.3, 0.5, 0.7, 0.9];
        let baseColor;

        if (preset === "github") {
            baseColor = { r: 30, g: 160, b: 30 };
        } else if (preset === "blue") {
            baseColor = { r: 0, g: 123, b: 255 };
        } else if (preset === "custom") {
            const bigint = parseInt(color.replace("#", ""), 16);
            baseColor = {
                r: (bigint >> 16) & 255,
                g: (bigint >> 8) & 255,
                b: bigint & 255,
            };
        }

        return opacitySteps.map(
            (opacity) =>
                `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`,
        );
    }
</script>

<div class="content-display">
    {#if isLocked}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="字数热力图"
                subtitle="按字数统计创作热力图，直观展示写作强度。"
                icon="edit"
                features={[
                    "按字数统计创作热力图",
                    "支持多种颜色预设",
                    "适合写作爱好者追踪创作量"
                ]}
                highlights={["字数统计", "创作追踪", "可视化"]}
                compact
            />
        </div>
    {:else}
        {#if isInitializing}
            <div class="heatmap-empty-state">
                <strong>正在初始化热力图索引...</strong>
            </div>
        {:else if hasHeatmapData}
            <div class="heatmap-content-container">
                <div bind:this={chartContainer} style="width: 100%; height: 100%;"></div>
            </div>
        {:else}
            {#if heatmapDataStatus === "disabled"}
                <LocalIndexEmptyState
                    title="本地索引为空"
                    message="热力图本地索引为空，请迁移或重建索引。"
                    {plugin}
                    hint="请到主页设置 > 检索管理中刷新最近文档增量索引，或手动重建本地索引。"
                />
            {:else}
                <div class="heatmap-empty-state">
                    <strong>{heatmapStatusMessage}</strong>
                    <span>可到主页设置 > 检索管理中刷新最近文档增量索引，或手动重建当前范围索引。</span>
                </div>
            {/if}
        {/if}
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .content-not-advanced {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        overflow: hidden;
        padding: 8px;
    }

    .heatmap-content-container {
        width: 100%;
        height: calc(100%);
        margin: 0 auto;
        flex: none;
        position: relative;
        overflow: auto;
    }

    .heatmap-empty-state {
        width: 100%;
        height: 100%;
        min-height: 140px;
        padding: 16px;
        box-sizing: border-box;
        border: 1px dashed var(--b3-border-color);
        border-radius: 8px;
        color: var(--b3-theme-secondary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-align: center;

        strong {
            color: var(--b3-theme-on-surface);
            font-weight: 600;
        }
    }
</style>
