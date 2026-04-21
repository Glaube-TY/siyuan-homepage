<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import * as echarts from "echarts";
    import { getAttributeView } from "@/api";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    let parsedContent = $derived(JSON.parse(contentTypeJson));
    let databaseChartID = $derived(parsedContent.data?.databaseChartID);
    let databaseChartType = $derived(parsedContent.data?.databaseChartType);
    let databaseChartTitle = $derived(parsedContent.data?.databaseChartTitle);

    // 折线图设置变量
    let databaseChartLineType = $derived(parsedContent.data?.databaseChartLineType);
    let databaseChartLineSmooth = $derived(parsedContent.data?.databaseChartLineSmooth);
    let databaseChartLineCountSort =
        $derived(parsedContent.data?.databaseChartLineCountSort);
    let databaseChartLineMarkPoint =
        $derived(parsedContent.data?.databaseChartLineMarkPoint);
    let databaseChartLineMarkPointSize =
        $derived(parsedContent.data?.databaseChartLineMarkPointSize);
    let databaseChartLineWidth =
        $derived(parsedContent.data?.databaseChartLineWidth || 2);
    let databaseChartLineStyle =
        $derived(parsedContent.data?.databaseChartLineStyle || "solid");
    // 折线图XY
    let databaseChartLineXAxisSource =
        $derived(parsedContent.data?.databaseChartLineXAxisSource);
    let databaseChartLineXAxisTitle =
        $derived(parsedContent.data?.databaseChartLineXAxisTitle);
    let databaseChartLineYAxisSource =
        $derived(parsedContent.data?.databaseChartLineYAxisSource);
    let databaseChartLineYAxisTitle =
        $derived(parsedContent.data?.databaseChartLineYAxisTitle);
    // 折线图count
    let databaseChartLineCountColumn =
        $derived(parsedContent.data?.databaseChartLineCountColumn);
    let databaseChartLineCountXAxisTitle =
        $derived(parsedContent.data?.databaseChartLineCountXAxisTitle);
    let databaseChartLineCountYAxisTitle =
        $derived(parsedContent.data?.databaseChartLineCountYAxisTitle);

    let advancedEnabled = $state(false);
    let attributeView: any = null;

    // ECharts 实例引用
    let chartInstance: echarts.ECharts | null = null;
    // 图表容器本地引用
    let chartContainer: HTMLDivElement | null = $state(null);
    // 延迟初始化 timeout id
    let initTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    // resize 调度 raf id
    let resizeRafId: number | null = null;
    // 组件销毁标记
    let isDestroyed = false;

    let lineChartXYOption = $derived({
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "cross",
                crossStyle: {
                    color: "#999",
                },
            },
        },
        title: { text: databaseChartTitle, left: "center" },
        xAxis: {
            type: "category",
            data: [],
            name: databaseChartLineXAxisTitle || "",
            nameLocation: "middle",
            nameGap: 30,
        },
        yAxis: {
            type: "value",
            name: databaseChartLineYAxisTitle || "",
            nameLocation: "middle",
            nameGap: 50,
            nameRotate: 90,
        },
        series: [{}],
    });

    let lineChartCountOptions = $derived({
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "cross",
                crossStyle: {
                    color: "#999",
                },
            },
        },
        title: { text: databaseChartTitle, left: "center" },
        xAxis: {
            type: "category",
            data: [],
            name: databaseChartLineCountXAxisTitle || "",
            nameLocation: "middle",
            nameGap: 30,
        },
        yAxis: {
            type: "value",
            name: databaseChartLineCountYAxisTitle || "",
            nameLocation: "middle",
            nameGap: 50,
            nameRotate: 90,
        },
        series: [{}],
    });

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;

        attributeView = await getAttributeView(databaseChartID);

        if (isDestroyed) return;

        initTimeoutId = setTimeout(async () => {
            if (isDestroyed) return;

            if (!chartContainer) return;
            const chart = echarts.init(chartContainer);
            chartInstance = chart;

            if (isDestroyed) {
                chart.dispose();
                chartInstance = null;
                return;
            }

            if (databaseChartType === "line") {
                if (databaseChartLineType === "XY") {
                    await setLineChartXYData();
                    if (!isDestroyed && chartInstance) {
                        chart.setOption(lineChartXYOption);
                    }
                } else if (databaseChartLineType === "count") {
                    await setLineChartCountData();
                    if (!isDestroyed && chartInstance) {
                        chart.setOption(lineChartCountOptions);
                    }
                }
            }

            // 设置 ResizeObserver 监听容器尺寸变化
            setupResizeObserver();

            // 监听页面可见性变化
            document.addEventListener("visibilitychange", handleVisibilityChange);
        }, 0);
    });

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

    async function setLineChartXYData() {
        if (
            !attributeView ||
            !attributeView.keyValues ||
            !databaseChartLineXAxisSource ||
            !databaseChartLineYAxisSource
        ) {
            return;
        }

        // 查找匹配的Xkey
        const matchedX = attributeView.keyValues.find(
            (kv: any) => kv.key.id === databaseChartLineXAxisSource,
        );
        const matchedXType = matchedX?.key.type;
        const matchedXValues = matchedX?.values;

        // 确保 databaseChartLineYAxisSource 是数组
        const yAxisSources = Array.isArray(databaseChartLineYAxisSource)
            ? databaseChartLineYAxisSource
            : [databaseChartLineYAxisSource];

        let lineChartXYxAxisData = [];
        // 根据matchedXType提取X轴数据
        if (matchedXValues && matchedXType) {
            lineChartXYxAxisData = matchedXValues.map((item: any) => {
                if (matchedXType === "block" && item.block) {
                    return item.block.content;
                } else if (matchedXType === "text" && item.text) {
                    return item.text.content;
                } else if (matchedXType === "number" && item.number) {
                    return item.number.content;
                } else if (matchedXType === "date" && item.date) {
                    const date = new Date(item.date.content);
                    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
                } else if (matchedXType === "select" && item.mSelect) {
                    return item.mSelect[0].content;
                } else if (matchedXType === "url" && item.url) {
                    return item.url.content;
                } else if (matchedXType === "email" && item.email) {
                    return item.email.content;
                } else if (matchedXType === "phone" && item.phone) {
                    return item.phone.content;
                } else {
                    // 默认返回原始值
                    return item;
                }
            });
        }

        // 为每条Y轴数据创建系列
        const seriesData = [];

        // 遍历所有Y轴数据源
        for (const yAxisSource of yAxisSources) {
            // 查找匹配的Ykey
            const matchedY = attributeView.keyValues.find(
                (kv: any) => kv.key.id === yAxisSource,
            );
            const matchedYType = matchedY?.key.type;
            const matchedYValues = matchedY?.values;

            // 根据matchedYType提取Y轴数据（只处理number类型）
            if (matchedYValues && matchedYType === "number") {
                const yAxisData = matchedYValues.map((item: any) => {
                    if (item.number) {
                        return item.number.content;
                    } else {
                        return 0;
                    }
                });

                // 为每条线创建一个系列
                seriesData.push({
                    data: yAxisData,
                    type: "line",
                    smooth: databaseChartLineSmooth,
                    symbol: databaseChartLineMarkPoint,
                    symbolSize: databaseChartLineMarkPointSize,
                    lineStyle: {
                        width: databaseChartLineWidth,
                        type: databaseChartLineStyle,
                    },
                });
            }
        }

        // 根据databaseChartLineCountSort的值进行排序
        // 只有当Y轴数据源只有一个时，排序才有效
        if (databaseChartLineCountSort !== "none" && seriesData.length === 1) {
            // 使用第一条Y轴数据进行排序
            const primaryYData = seriesData[0].data;

            // 创建索引数组
            const indices = Array.from(
                { length: lineChartXYxAxisData.length },
                (_, i) => i,
            );

            // 根据排序方式对索引进行排序
            indices.sort((a, b) => {
                const valueA = primaryYData[a];
                const valueB = primaryYData[b];

                if (databaseChartLineCountSort === "asc") {
                    return valueA - valueB;
                } else {
                    return valueB - valueA;
                }
            });

            // 根据排序后的索引重新排列X轴和所有Y轴数据
            lineChartXYxAxisData = indices.map((i) => lineChartXYxAxisData[i]);

            // 重新排列每个系列的Y轴数据
            seriesData.forEach((series) => {
                series.data = indices.map((i) => series.data[i]);
            });
        }

        // 更新图表选项中的数据
        lineChartXYOption.xAxis.data = lineChartXYxAxisData;
        lineChartXYOption.series = seriesData; // 更新整个系列数组
    }

    async function setLineChartCountData() {
        if (
            !attributeView ||
            !attributeView.keyValues ||
            !databaseChartLineCountColumn
        ) {
            return;
        }

        // 查找匹配的列
        const matchedCount = attributeView.keyValues.find(
            (kv: any) => kv.key.id === databaseChartLineCountColumn,
        );
        const matchedCountType = matchedCount?.key.type;
        const matchedCountValues = matchedCount?.values;

        if (!matchedCountValues) return;

        // 提取值并统计数量
        let countData: any[] = [];

        // 提取值并统计数量
        if (matchedCountType && matchedCountValues) {
            countData = matchedCountValues.map((item: any) => {
                if (matchedCountType === "block" && item.block) {
                    return item.block.content;
                } else if (matchedCountType === "text" && item.text) {
                    return item.text.content;
                } else if (matchedCountType === "number" && item.number) {
                    return item.number.content;
                } else if (matchedCountType === "date" && item.date) {
                    const date = new Date(item.date.content);
                    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
                } else if (matchedCountType === "select" && item.mSelect) {
                    return item.mSelect[0].content;
                } else if (matchedCountType === "mselect" && item.mselect) {
                    return item.mselect
                        .map((s: any) => s.content)
                        .join(", ");
                } else if (matchedCountType === "url" && item.url) {
                    return item.url.content;
                } else if (matchedCountType === "email" && item.email) {
                    return item.email.content;
                } else if (matchedCountType === "phone" && item.phone) {
                    return item.phone.content;
                } else {
                    // 默认返回原始值
                    return item;
                }
            });
        }

        // 统计每个值的数量
        const countMap = new Map();
        countData.forEach((value) => {
            if (value !== undefined && value !== null && value !== "") {
                countMap.set(value, (countMap.get(value) || 0) + 1);
            }
        });

        // 转换为数组并排序
        let countArray = Array.from(countMap.entries()).map(
            ([name, value]) => ({
                name,
                value,
            }),
        );

        // 根据databaseChartLineCountSort的值进行排序
        if (databaseChartLineCountSort === "asc") {
            countArray.sort((a, b) => a.value - b.value);
        } else if (databaseChartLineCountSort === "desc") {
            countArray.sort((a, b) => b.value - a.value);
        } else {
            // 默认按名称排序
            countArray.sort((a, b) => {
                if (typeof a.name === "string" && typeof b.name === "string") {
                    return a.name.localeCompare(b.name);
                }
                return a.name - b.name;
            });
        }

        // 提取X轴和Y轴数据
        const xAxisData = countArray.map((item) => item.name);
        const yAxisData = countArray.map((item) => item.value);

        // 更新图表选项中的数据
        lineChartCountOptions.xAxis.data = xAxisData;
        lineChartCountOptions.series = [
            {
                data: yAxisData,
                type: "line",
                smooth: databaseChartLineSmooth,
                symbol: databaseChartLineMarkPoint,
                symbolSize: databaseChartLineMarkPointSize,
                lineStyle: {
                    width: databaseChartLineWidth,
                    type: databaseChartLineStyle,
                },
            },
        ];
    }
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div
            bind:this={chartContainer}
            style="width: 100%; height: 100%;"
        ></div>
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }
</style>
