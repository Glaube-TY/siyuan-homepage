<script lang="ts">
    import { onMount } from "svelte";
    import * as echarts from "echarts";
    import {
        getLatestDailyNotes,
        type DailyNoteInfo,
    } from "./latestDailyNotes";
    import { openDocs } from "@/components/tools/openDocs";
    import {
        createFloatingDocPopup,
        setMouseOnTrigger,
        hideImmediately,
    } from "@/components/tools/floatingDoc";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsed = JSON.parse(contentTypeJson);
    const limit = parsed.data?.limit || 5;
    const recentJournalsShowType =
        parsed.data?.recentJournalsShowType || "list";
    const recentJournalsCalendarIcon =
        parsed.data?.recentJournalsCalendarIcon || "📝";
    const recentJournalsCalendarIconSize =
        parsed.data?.recentJournalsCalendarIconSize || 16;
    const showLatestDailyNotesFloatDoc =
        parsed.data?.showLatestDailyNotesFloatDoc ?? true;
    const latestDailyNotesFloatDocShowTime =
        parsed.data?.latestDailyNotesFloatDocShowTime || 0.1;

    // 原始数据
    let dailyNotes: DailyNoteInfo[] = [];

    // 最终显示的笔记
    let displayedDocs: DailyNoteInfo[] = [];

    let currentDate: Date = new Date();
    
    // 悬浮窗定时器（列表模式）
    let listFloatDocTimeout: number | null = null;
    // 悬浮窗定时器（日历模式）
    let calendarFloatDocTimeout: number | null = null;

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

        const sorted = [...dailyNotes].sort((a, b) =>
            b.created.localeCompare(a.created),
        );

        displayedDocs = sorted.slice(0, limit);

        setTimeout(async () => {
            const chartDom = document.getElementById(
                "latest-daily-notes-calendar",
            );
            if (!chartDom) return;

            const myChart = echarts.init(chartDom);
            const range = getMonthRange(currentDate);

            const themeMode = window.siyuan.config.appearance.mode;
            const themeColor1 = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-surface")
                .trim();
            const themeColor2 = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-background")
                .trim();
            const themeColor3 = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-on-primary")
                .trim();
            const themeColor4 = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-on-background")
                .trim();
            const themeColor5 = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-primary")
                .trim();

            let themeTextColor = themeColor3;
            if (themeMode === 0) {
                themeTextColor = themeColor4;
            }

            myChart.setOption({
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
                    top: 10,
                    left: 30,
                    right: 10,
                    cellSize: ["auto", "auto"],
                    range: range,
                    itemStyle: {
                        borderWidth: 4,
                        borderColor: themeColor2,
                        color: themeColor1,
                        opacity: 0.5,
                    },
                    splitLine: {
                        show: false,
                    },
                    yearLabel: { show: false },
                    monthLabel: { show: false },
                    dayLabel: {
                        show: true,
                        fontSize: 12,
                        margin: 10,
                        color: themeTextColor,
                    },
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
                                    fill: themeColor5,
                                    opacity: 0.1,
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
                    data: buildCustomCalendarData(dailyNotes, range),
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
                        if (recentJournalsShowType === "calendar" && !plugin.isMobile) {
                            hideImmediately();
                        }
                        openDocs(plugin, note.id);
                    }
                }
            });
            myChart.on("mouseover", (params) => {
                if (
                    params.componentType === "series" &&
                    params.seriesType === "custom"
                ) {
                    const date = params.name;
                    const note = dailyNotes.find((n) => n.content === date);
                    if (note) {
                        const syntheticEvent = new MouseEvent("mouseover", {
                            clientX: params.event?.offsetX || 0,
                            clientY: params.event?.offsetY || 0,
                            bubbles: true,
                            cancelable: true,
                        });

                        if (showLatestDailyNotesFloatDoc && !plugin.isMobile) {
                            // 清除之前的定时器
                            if (calendarFloatDocTimeout) {
                                clearTimeout(calendarFloatDocTimeout);
                            }
                            // 设置新的定时器
                            calendarFloatDocTimeout = window.setTimeout(() => {
                                createFloatingDocPopup(
                                    note,
                                    syntheticEvent,
                                    plugin,
                                );
                                calendarFloatDocTimeout = null;
                            }, latestDailyNotesFloatDocShowTime * 1000);
                        }
                    }
                }
            });

            myChart.on("mouseout", (params) => {
                if (
                    params.componentType === "series" &&
                    params.seriesType === "custom"
                ) {
                    if (showLatestDailyNotesFloatDoc && !plugin.isMobile) {
                        // 清除悬浮窗显示定时器
                        if (calendarFloatDocTimeout) {
                            clearTimeout(calendarFloatDocTimeout);
                            calendarFloatDocTimeout = null;
                        }
                        setTimeout(() => {
                            setMouseOnTrigger(false);
                        }, 150);
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
                            on:click={() => {
                                if (recentJournalsShowType === "calendar" && !plugin.isMobile) {
                                    hideImmediately();
                                }
                                openDocs(plugin, doc.id);
                            }}
                            on:keydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    openDocs(plugin, doc.id);
                                }
                            }}
                            on:mouseenter={(e) => {
                            if (showLatestDailyNotesFloatDoc && !plugin.isMobile) {
                                // 清除之前的定时器
                                if (listFloatDocTimeout) {
                                    clearTimeout(listFloatDocTimeout);
                                }
                                // 设置新的定时器
                                listFloatDocTimeout = window.setTimeout(() => {
                                    createFloatingDocPopup(doc, e, plugin);
                                    listFloatDocTimeout = null;
                                }, latestDailyNotesFloatDocShowTime * 1000);
                            }
                        }}
                        on:mouseleave={() => {
                            if (showLatestDailyNotesFloatDoc && !plugin.isMobile) {
                                // 清除悬浮窗显示定时器
                                if (listFloatDocTimeout) {
                                    clearTimeout(listFloatDocTimeout);
                                    listFloatDocTimeout = null;
                                }
                                setTimeout(() => {
                                    setMouseOnTrigger(false);
                                }, 150);
                            }
                        }}
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
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--b3-border-color);
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
                transition: all 0.2s ease;
                background-color: var(--b3-theme-surface);
            }

            .nav-button:hover {
                background-color: var(--b3-list-icon-hover);
                transform: scale(1.1);
            }
        }
    }

    #latest-daily-notes-calendar {
        width: 100%;
        height: 100%;
    }

    .fas {
        color: var(--b3-theme-primary);
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
        background-color: var(--b3-theme-surface);
        border-radius: 6px;
        font-size: 14px;
        transition: background-color 0.2s ease;
    }

    .document-item:hover {
        background-color: var(--b3-list-hover);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        text-decoration: underline;
    }

    .document-item-content {
        margin-top: 4px;
        display: block;
        color: var(--b3-theme-primary);
        text-decoration: none;
        font-weight: bold;
        cursor: pointer;
        border: none;
        background-color: transparent;

        &:hover {
            text-decoration: underline;
        }
    }
</style>
