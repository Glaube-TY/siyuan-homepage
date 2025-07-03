<script lang="ts">
    import { onMount } from "svelte";
    import { openTab } from "siyuan";
    import * as echarts from "echarts";
    import {
        getLatestDailyNotes,
        type DailyNoteInfo,
    } from "./latestDailyNotes";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    let recentJournalsShowType: string = "list";

    // 原始数据
    let dailyNotes: DailyNoteInfo[] = [];

    // 最终显示的笔记
    let displayedDocs: DailyNoteInfo[] = [];

    let currentDate: Date = new Date();

    function getMonthRange(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return `${year}-${month}`;
    }

    function goToPreviousMonth() {
        const prevDate = new Date(currentDate);
        prevDate.setMonth(prevDate.getMonth() - 1);
        currentDate = prevDate;
        updateCalendar();
    }

    function goToNextMonth() {
        const nextDate = new Date(currentDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        currentDate = nextDate;
        updateCalendar();
    }

    function updateCalendar() {
        const chartDom = document.getElementById("latest-daily-notes-calendar");
        if (!chartDom) return;

        const myChart = echarts.getInstanceByDom(chartDom);

        const range = getMonthRange(currentDate);
        const data = buildCustomCalendarData(dailyNotes, range);

        myChart.setOption({
            calendar: {
                range: range,
            },
            series: {
                data: data,
            },
        });
    }

    function buildCustomCalendarData(
        dailyNotes: DailyNoteInfo[],
        month: string,
    ) {
        const noteDates = new Set(dailyNotes.map((note) => note.content));
        const [year, monthStr] = month.split("-");
        const monthNum = parseInt(monthStr, 10);
        const yearNum = parseInt(year, 10);
        const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

        const dates = [];

        for (let i = 1; i <= daysInMonth; i++) {
            const dayStr = String(i).padStart(2, "0");
            const dateStr = `${year}-${monthStr}-${dayStr}`;
            const hasJournal = noteDates.has(dateStr);
            dates.push({
                name: dateStr,
                value: [dateStr, hasJournal ? "0" : ""],
            });
        }

        return dates;
    }

    function formatMonthTitle(date: Date): string {
        const options: Intl.DateTimeFormatOptions = {
            year: "numeric",
            month: "long",
        };
        return new Intl.DateTimeFormat("zh-CN", options).format(date);
    }

    onMount(async () => {
        dailyNotes = await getLatestDailyNotes();
        const parsed = JSON.parse(contentTypeJson);

        const limit = parsed.data?.limit || 5;
        recentJournalsShowType = parsed.data?.recentJournalsShowType || "list";

        const sorted = [...dailyNotes].sort((a, b) =>
            b.created.localeCompare(a.created),
        );
        displayedDocs = sorted.slice(0, limit);

        const recentJournalsCalendarIcon =
            parsed.data?.recentJournalsCalendarIcon || "📝";
        const recentJournalsCalendarIconSize =
            parsed.data?.recentJournalsCalendarIconSize || 16;

        setTimeout(async () => {
            const chartDom = document.getElementById(
                "latest-daily-notes-calendar",
            );
            if (!chartDom) return;

            const myChart = echarts.init(chartDom);
            const range = getMonthRange(currentDate);

            myChart.setOption({
                title: {
                    left: "center",
                },
                tooltip: {
                    formatter: (params) => {
                        const date = params.name;
                        const value = params.data?.value;
                        const hasJournal = Array.isArray(value)
                            ? value[1] !== ""
                            : false;
                        return `${date}\n${hasJournal ? "有日记" : "无日记"}`;
                    },
                },
                calendar: {
                    top: 0,
                    left: 30,
                    cellSize: ["auto", "auto"],
                    range: range,
                    itemStyle: {
                        borderWidth: 1,
                        borderColor: "#666",
                    },
                    yearLabel: { show: true },
                },
                series: {
                    type: "custom",
                    coordinateSystem: "calendar",
                    renderItem: (params, api) => {
                        const cellPoint = api.coord(api.value(0));
                        const cellWidth = params.coordSys.cellWidth;
                        const cellHeight = params.coordSys.cellHeight;

                        const value = api.value(1);
                        const hasJournal = value !== "";
                        const dateFontSize = 14;

                        if (isNaN(cellPoint[0]) || isNaN(cellPoint[1]))
                            return null;

                        const children: echarts.CustomSeriesRenderItemReturn[] =
                            [];

                        const dateValue = new Date(api.value(0));
                        const year = dateValue.getFullYear();
                        const month = String(dateValue.getMonth() + 1).padStart(
                            2,
                            "0",
                        );
                        const day = String(dateValue.getDate()).padStart(
                            2,
                            "0",
                        );
                        const currentDate = `${year}-${month}-${day}`;

                        const now = new Date();
                        const yearNow = now.getFullYear();
                        const monthNow = String(now.getMonth() + 1).padStart(
                            2,
                            "0",
                        );
                        const dayNow = String(now.getDate()).padStart(2, "0");
                        const today = `${yearNow}-${monthNow}-${dayNow}`;
                        const isToday = currentDate === today;
                        const themeColor = getComputedStyle(
                            document.documentElement,
                        )
                            .getPropertyValue("--b3-theme-primary")
                            .trim();

                        if (isToday) {
                            children.push({
                                type: "rect",
                                shape: {
                                    x: cellPoint[0] - cellWidth / 2,
                                    y: cellPoint[1] - cellHeight / 2,
                                    width: cellWidth,
                                    height: cellHeight,
                                    r: 4,
                                },
                                style: {
                                    fill: themeColor,
                                    opacity: 0.2,
                                },
                            });
                        }

                        if (!hasJournal) {
                            children.push({
                                type: "text",
                                style: {
                                    x: cellPoint[0] - dateFontSize / 2,
                                    y: cellPoint[1] - dateFontSize / 2,
                                    text: new Date(api.value(0))
                                        .getDate()
                                        .toString(),
                                    fill: "#777",
                                    font: api.font({ fontSize: dateFontSize }),
                                },
                            });
                        }

                        if (hasJournal) {
                            children.push({
                                type: "text",
                                style: {
                                    x: cellPoint[0] - cellWidth / 2 + 5,
                                    y: cellPoint[1] - cellHeight / 2 + 5,
                                    text: new Date(api.value(0))
                                        .getDate()
                                        .toString(),
                                    fill: "#777",
                                    font: api.font({ fontSize: 14 }),
                                },
                            });
                            children.push({
                                type: "text",
                                style: {
                                    x: cellPoint[0],
                                    y: cellPoint[1],
                                    text: recentJournalsCalendarIcon,
                                    font: api.font({
                                        fontSize:
                                            recentJournalsCalendarIconSize,
                                    }),
                                },
                            });
                        }

                        return {
                            type: "group",
                            children,
                        };
                    },
                    dimensions: [undefined, { type: "ordinal" }],
                    data: buildCustomCalendarData(
                        dailyNotes,
                        range,
                    ),
                },
            });

            myChart.on("click", (params) => {
                if (
                    params.componentType === "series" &&
                    params.seriesType === "custom"
                ) {
                    const date = params.name;
                    const note = dailyNotes.find((n) => n.content === date);
                    if (note) {
                        openTab({
                            app: plugin.app,
                            doc: {
                                id: note.id,
                            },
                        });
                    }
                }
            });
        }, 0);
    });
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
</svelte:head>

<div class="content-display">
    {#if recentJournalsShowType == "list"}
        <h3 class="widget-title">📓最近日记</h3>
        <ul class="document-list">
            {#if displayedDocs.length > 0}
                {#each displayedDocs as doc (doc.id + "-" + doc.updated)}
                    <li class="document-item">
                        <div
                            class="document-item-content"
                            on:click={() =>
                                openTab({
                                    app: plugin.app,
                                    doc: {
                                        id: doc.id,
                                    },
                                })}
                            role="button"
                            tabindex="0"
                            aria-label="打开最近日记：{doc.content}"
                        >
                            📅 {doc.content || "(无标题)"}
                        </div>
                    </li>
                {/each}
            {:else}
                <p>暂无日记记录</p>
            {/if}
        </ul>
    {:else}
        <div class="widget-title-container">
            <button
                class="nav-button prev"
                title="上一个月"
                on:click={goToPreviousMonth}
            >
                <i class="fas fa-chevron-left"></i>
            </button>
            <p class="widget-title-calendar">{formatMonthTitle(currentDate)}</p>
            <button
                class="nav-button next"
                title="下一个月"
                on:click={goToNextMonth}
            >
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div id="latest-daily-notes-calendar"></div>
    {/if}
</div>

<style lang="scss">
    .widget-title {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid #e2e8f0;
        text-align: center;
        display: inline-block;
        line-height: 1.2;
    }

    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 10px;
        box-sizing: border-box;

        .widget-title-container {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.2rem;

            .widget-title-calendar {
                font-size: 18px;
                font-weight: 600;
                color: #1e293b;
                white-space: nowrap;
            }

            .nav-button {
                border: none;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                font-size: 14px;
                color: #475569;
                transition: all 0.2s ease;
            }

            .nav-button:hover {
                background-color: var(--b3-theme-primary);
                transform: scale(1.1);
                color: white;
            }
        }
    }

    #latest-daily-notes-calendar {
        width: 100%;
        height: 100%;
    }

    .document-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: center;
        list-style: none;
        padding-left: 0;
        margin: 0;
        overflow-y: auto;
    }

    .document-item {
        flex: 0 0 auto;
        padding: 0.5rem 0.75rem;
        margin-bottom: 0.5rem;
        background-color: #f8fafc;
        border-radius: 6px;
        font-size: 14px;
        color: #475569;
        transition: background-color 0.2s ease;
    }

    .document-item:hover {
        background-color: #eff6ff;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .document-item-content {
        margin-top: 4px;
        display: block;
        color: var(--b3-theme-primary);
        text-decoration: none;
        font-weight: bold;
        cursor: pointer;

        &:hover {
            text-decoration: underline;
        }
    }
</style>
