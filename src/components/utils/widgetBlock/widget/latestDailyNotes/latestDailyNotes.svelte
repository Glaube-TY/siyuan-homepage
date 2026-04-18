<script lang="ts">
    import { onMount, onDestroy } from "svelte";
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

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    const parsed = $derived(JSON.parse(contentTypeJson));
    const limit = $derived(parsed.data?.limit || 5);
    const recentJournalsShowType = $derived(
        parsed.data?.recentJournalsShowType || "list"
    );
    const recentJournalsCalendarIcon = $derived(
        parsed.data?.recentJournalsCalendarIcon || "📝"
    );
    const recentJournalsCalendarIconSize = $derived(
        parsed.data?.recentJournalsCalendarIconSize || 16
    );
    const showLatestDailyNotesFloatDoc = $derived(
        parsed.data?.showLatestDailyNotesFloatDoc ?? true
    );
    const latestDailyNotesFloatDocShowTime = $derived(
        parsed.data?.latestDailyNotesFloatDocShowTime || 0.1
    );

    // 原始数据
    let dailyNotes: DailyNoteInfo[] = [];

    // 最终显示的笔记
    let displayedDocs: DailyNoteInfo[] = $state([]);

    let currentDate: Date = $state(new Date());
    
    // 悬浮窗定时器（列表模式）
    let listFloatDocTimeout: number | null = $state(null);
    // 悬浮窗定时器（日历模式）
    let calendarFloatDocTimeout: number | null = null;
    // mouseleave 延迟定时器
    let listMouseLeaveTimeout: number | null = null;
    let calendarMouseLeaveTimeout: number | null = null;
    // 图表初始化定时器
    let chartInitTimeout: number | null = null;
    // 延后重绘 timeout id
    let redrawTimeoutId: number | null = null;
    // ECharts 实例引用
    let chartInstance: echarts.ECharts | null = null;
    // 图表容器本地引用
    let chartContainer: HTMLDivElement | null = $state(null);
    // 主题观察器
    let themeObserver: MutationObserver | null = null;
    // 主题调度 timeout id
    let themeScheduleTimeout: number | null = null;
    // 上次主题签名
    let lastThemeSignature: string = "";
    // ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    // resize 调度 raf id
    let resizeRafId: number | null = null;
    // 组件销毁标记
    let isDestroyed = false;

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
        isDestroyed = false;
        dailyNotes = await getLatestDailyNotes();

        const sorted = [...dailyNotes].sort((a, b) =>
            b.created.localeCompare(a.created),
        );

        displayedDocs = sorted.slice(0, limit);

        chartInitTimeout = window.setTimeout(() => {
            initCalendarChart();
        }, 0);
    });

    function initCalendarChart() {
        if (!chartContainer || isDestroyed) return;

        // 检查容器尺寸是否有效，无效则延后重试
        if (chartContainer.clientWidth === 0 || chartContainer.clientHeight === 0) {
            chartInitTimeout = window.setTimeout(() => {
                if (!isDestroyed) {
                    initCalendarChart();
                }
            }, 100);
            return;
        }

        const myChart = echarts.init(chartContainer);
        const range = getMonthRange(currentDate);

        // 应用主题并渲染
        applyChartTheme(myChart, range);

        // 延后重绘，确保主题样式已稳定
        redrawTimeoutId = window.setTimeout(() => {
            if (!isDestroyed && chartInstance) {
                applyChartTheme(chartInstance, getMonthRange(currentDate));
            }
        }, 100);

        // 监听主题变化
        setupThemeObserver();

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
                    // 清除之前的 mouseleave timeout
                    if (calendarMouseLeaveTimeout) {
                        clearTimeout(calendarMouseLeaveTimeout);
                    }
                    calendarMouseLeaveTimeout = window.setTimeout(() => {
                        setMouseOnTrigger(false);
                        calendarMouseLeaveTimeout = null;
                    }, 150);
                }
            }
        });

        // 保存图表实例引用
        chartInstance = myChart;
    }

    function getThemeColors() {
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
        const themeColor5 = getComputedStyle(document.documentElement)
            .getPropertyValue("--b3-theme-primary")
            .trim();

        let themeTextColor = themeColor3;
        if (themeMode === 0) {
            themeTextColor = themeColor4;
        }

        return { themeColor1, themeTextColor, themeColor5 };
    }

    function applyChartTheme(myChart: echarts.ECharts, range: string) {
        const { themeColor1, themeTextColor, themeColor5 } = getThemeColors();

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
                    borderWidth: 2,
                    borderColor: "transparent",
                    color: "transparent",
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

                    const children: echarts.CustomSeriesRenderItemReturn[] = [];

                    // 基础背景块（内缩，形成缝隙感）
                    const padding = 2;
                    children.push({
                        type: "rect",
                        shape: {
                            x: cellPoint[0] - cellWidth / 2 + padding,
                            y: cellPoint[1] - cellHeight / 2 + padding,
                            width: cellWidth - padding * 2,
                            height: cellHeight - padding * 2,
                            r: 3,
                        },
                        style: {
                            fill: themeColor1,
                            opacity: 0.3,
                        },
                    });

                    const dateValue = new Date(api.value(0));
                    const year = dateValue.getFullYear();
                    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
                    const day = String(dateValue.getDate()).padStart(2, "0");
                    const currentDateStr = `${year}-${month}-${day}`;

                    const now = new Date();
                    const yearNow = now.getFullYear();
                    const monthNow = String(now.getMonth() + 1).padStart(2, "0");
                    const dayNow = String(now.getDate()).padStart(2, "0");
                    const today = `${yearNow}-${monthNow}-${dayNow}`;
                    const isToday = currentDateStr === today;

                    if (isToday) {
                        children.push({
                            type: "rect",
                            shape: {
                                x: cellPoint[0] - cellWidth / 2 + padding,
                                y: cellPoint[1] - cellHeight / 2 + padding,
                                width: cellWidth - padding * 2,
                                height: cellHeight - padding * 2,
                                r: 3,
                            },
                            style: {
                                fill: themeColor5,
                                opacity: 0.5,
                            },
                        });
                    }

                    if (!hasJournal) {
                        children.push({
                            type: "text",
                            style: {
                                x: cellPoint[0] - dateFontSize / 2,
                                y: cellPoint[1] - dateFontSize / 2,
                                text: new Date(api.value(0)).getDate().toString(),
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
                                text: new Date(api.value(0)).getDate().toString(),
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
                                    fontSize: recentJournalsCalendarIconSize,
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

        // 触发 resize 确保布局正确
        myChart.resize();
    }

    function getThemeSignature(): string {
        const mode = window.siyuan?.config?.appearance?.mode ?? 0;
        const surface = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-surface").trim();
        const background = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-background").trim();
        const primary = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-primary").trim();
        const onBackground = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-on-background").trim();
        return `${mode}|${surface}|${background}|${primary}|${onBackground}`;
    }

    function scheduleThemeUpdate() {
        if (themeScheduleTimeout) {
            clearTimeout(themeScheduleTimeout);
        }
        themeScheduleTimeout = window.setTimeout(() => {
            if (isDestroyed) return;
            const newSignature = getThemeSignature();
            if (newSignature !== lastThemeSignature) {
                lastThemeSignature = newSignature;
                if (chartInstance) {
                    applyChartTheme(chartInstance, getMonthRange(currentDate));
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

    function updateCalendar() {
        if (!chartContainer) return;

        const myChart = echarts.getInstanceByDom(chartContainer);
        if (!myChart) return;

        const range = getMonthRange(currentDate);

        // 重新应用主题并更新数据
        applyChartTheme(myChart, range);
    }

    onDestroy(() => {
        isDestroyed = true;

        // 清理所有 timeout
        if (listFloatDocTimeout) clearTimeout(listFloatDocTimeout);
        if (calendarFloatDocTimeout) clearTimeout(calendarFloatDocTimeout);
        if (listMouseLeaveTimeout) clearTimeout(listMouseLeaveTimeout);
        if (calendarMouseLeaveTimeout) clearTimeout(calendarMouseLeaveTimeout);
        if (chartInitTimeout) clearTimeout(chartInitTimeout);
        if (redrawTimeoutId) clearTimeout(redrawTimeoutId);

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
                            onclick={() => {
                                if (recentJournalsShowType === "calendar" && !plugin.isMobile) {
                                    hideImmediately();
                                }
                                openDocs(plugin, doc.id);
                            }}
                            onkeydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    openDocs(plugin, doc.id);
                                }
                            }}
                            onmouseenter={(e) => {
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
                        onmouseleave={() => {
                            if (showLatestDailyNotesFloatDoc && !plugin.isMobile) {
                                // 清除悬浮窗显示定时器
                                if (listFloatDocTimeout) {
                                    clearTimeout(listFloatDocTimeout);
                                    listFloatDocTimeout = null;
                                }
                                // 清除之前的 mouseleave timeout
                                if (listMouseLeaveTimeout) {
                                    clearTimeout(listMouseLeaveTimeout);
                                }
                                listMouseLeaveTimeout = window.setTimeout(() => {
                                    setMouseOnTrigger(false);
                                    listMouseLeaveTimeout = null;
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
                onclick={goToPreviousMonth}
            >
                <i class="fas fa-chevron-left"></i>
            </button>
            <p class="widget-title-calendar">{formatMonthTitle(currentDate)}</p>
            <button
                class="nav-button next"
                title="下一个月"
                onclick={goToNextMonth}
            >
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div bind:this={chartContainer} class="calendar-chart-container"></div>
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

    .calendar-chart-container {
        width: 100%;
        height: calc(100% - 50px);
        min-height: 200px;
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
