<script lang="ts">
    import { onMount } from "svelte";
    import * as echarts from "echarts";
    import { sql } from "@/api";

    export let contentTypeJson: string = "{}";

    async function getblocks(): Promise<any> {
        try {
            const query = `
            SELECT *
            FROM blocks 
            LIMIT 9999999999999
        `;
            return await sql(query);
        } catch (error) {
            console.error("Failed to fetch blocks:", error);
            return [];
        }
    }

    function getRecentSixMonthsRange(): string[] {
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const start = new Date(now);
        start.setMonth(start.getMonth() - 5, 1);

        return [
            start.toISOString().split("T")[0],
            end.toISOString().split("T")[0],
        ];
    }

    function formatTimestampToDate(timestamp: string): string {
        const year = timestamp.slice(0, 4);
        const month = timestamp.slice(4, 6);
        const day = timestamp.slice(6, 8);
        return `${year}-${month}-${day}`;
    }

    function countBlocksPerDay(blocks: any[]): { [key: string]: number } {
        const counts: { [key: string]: number } = {};

        blocks.forEach((block) => {
            // 改为使用 block.updated
            const dateStr = formatTimestampToDate(block.updated);

            if (counts[dateStr]) {
                counts[dateStr] += 1;
            } else {
                counts[dateStr] = 1;
            }
        });

        return counts;
    }

    onMount(async () => {
        setTimeout(async () => {
            const chartDom = document.getElementById("heatmap-chart");
            if (!chartDom) return;

            const myChart = echarts.init(chartDom);
            const blocks = await getblocks();
            const counts = countBlocksPerDay(blocks);
            const data = Object.entries(counts).map(([date, value]) => [
                date,
                value,
            ]);

            // 默认配置
            let range = getRecentSixMonthsRange();
            let colorPreset = "github";
            let customColor = "#1ea769";

            // 解析传入的配置
            try {
                const json = JSON.parse(contentTypeJson);
                if (json?.data?.length > 0) {
                    const config = json.data[0];

                    // ✅ 只保留 past 类型，直接使用 config.pastMonthCount
                    const pastMonthCount = config.pastMonthCount || 6;
                    const now = new Date();
                    const end = new Date(
                        now.getFullYear(),
                        now.getMonth() + 1,
                        0,
                    ); // 本月最后一天
                    const start = new Date(now);
                    start.setMonth(start.getMonth() - pastMonthCount + 1, 1); // N个月前的第一天

                    range = [
                        start.toISOString().split("T")[0],
                        end.toISOString().split("T")[0],
                    ];

                    // 设置颜色风格
                    colorPreset = config.selectedColorPreset || "github";
                    customColor = config.customColor || "#1ea769";
                }
            } catch (e) {
                console.error("Failed to parse contentTypeJson", e);
            }

            // 生成颜色梯度
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

            const colorGradient = getColorGradient(colorPreset, customColor);

            const themeMode = window.siyuan.config.appearance.mode;
            let themeTextColor = "#ffffff";
            if (themeMode === 0) {
                themeTextColor = "#000000";
            }

            // 设置 ECharts 配置
            myChart.setOption({
                title: {
                    left: "center",
                    text: "📅创作热力图",
                    textStyle: {
                        color: themeTextColor,
                    },
                },
                tooltip: {
                    formatter: ({ data }) => {
                        const [date, value] = data;
                        return `${date}: ${value} 个创作`;
                    },
                },
                visualMap: {
                    min: 0,
                    max: Math.max(...Object.values(counts)),
                    type: "piecewise",
                    orient: "horizontal",
                    left: "center",
                    top: 40,
                    inRange: {
                        color: colorGradient,
                    },
                },
                calendar: {
                    top: 100,
                    left: 30,
                    right: 10,
                    cellSize: ["auto", "auto"],
                    range: range,
                    itemStyle: {
                        borderWidth: 0.1,
                    },
                    yearLabel: { show: false },
                    monthLabel: { show: true, color: themeTextColor },
                    dayLabel: { show: true, color: themeTextColor },
                },
                series: {
                    type: "heatmap",
                    coordinateSystem: "calendar",
                    data: data,
                    label: {
                        show: true,
                        formatter: ({ data }) => {
                            const date = data[0];
                            return date.split("-")[2];
                        },
                        fontSize: 10,
                        color: "#000",
                    },
                    emphasis: {
                        itemStyle: {
                            borderColor: "#333",
                        },
                    },
                },
            });
        }, 0);
    });
</script>

<div class="content-display">
    <div class="heatmap-content-container">
        <div id="heatmap-chart" style="width: 100%; height: 100%;"></div>
    </div>
</div>

<style>
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

    .heatmap-content-container {
        width: 100%;
        height: calc(100%);
        margin: 0 auto;
        flex: none;
        position: relative;
        overflow: auto;
    }

    #heatmap-chart {
        position: absolute;
        width: 100%;
        height: calc(100%);
    }
</style>
