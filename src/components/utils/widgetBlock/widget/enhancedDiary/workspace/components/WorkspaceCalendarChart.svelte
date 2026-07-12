<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import * as echarts from "echarts";
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { EnhancedDiaryWorkspaceCalendarSettings } from "../../enhancedDiaryTypes";

    interface Props {
        days: EnhancedDiaryCalendarDay[];
        year: number;
        month: number;
        loading?: boolean;
        selectedDate?: string;
        onSelectDate?: (day: EnhancedDiaryCalendarDay) => void;
        onPrev?: () => void;
        onNext?: () => void;
        onToday?: () => void;
        variant?: "full" | "compact";
        displaySettings?: EnhancedDiaryWorkspaceCalendarSettings;
        taskManagementEnabled?: boolean;
    }

    let {
        days = [],
        year,
        month,
        loading = false,
        selectedDate = "",
        onSelectDate,
        onPrev,
        onNext,
        onToday,
        variant = "full",
        displaySettings,
        taskManagementEnabled = true,
    }: Props = $props();

    let chartContainer = $state<HTMLDivElement | null>(null);
    let chart: echarts.ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let initTimeout: ReturnType<typeof setTimeout> | null = null;
    let themeTimeout: ReturnType<typeof setTimeout> | null = null;
    let resizeRaf: number | null = null;
    let isDestroyed = false;
    let lastThemeSig = "";
    let chartHeight = $state(460);
    let observedWidth = 0;
    let observedHeight = 0;

    const isCompact = $derived(variant === "compact");
    const monthLabel = $derived(`${year} 年 ${month + 1} 月`);

    $effect(() => {
        days;
        year;
        month;
        selectedDate;
        variant;
        displaySettings;
        taskManagementEnabled;
        if (chart && !isDestroyed) {
            void tick().then(() => {
                if (!isDestroyed) {
                    void renderChart();
                    chart?.resize();
                }
            });
        }
    });

    onMount(() => {
        initTimeout = setTimeout(() => {
            void initChart();
        }, 50);
        return () => {
            if (initTimeout) clearTimeout(initTimeout);
        };
    });

    async function initChart() {
        if (isDestroyed || !chartContainer) return;
        if (chartContainer.clientWidth === 0 || chartContainer.clientHeight === 0) {
            initTimeout = setTimeout(() => void initChart(), 200);
            return;
        }
        if (chart) {
            chart.dispose();
            chart = null;
        }
        chart = echarts.init(chartContainer);
        setupObservers();
        void renderChart();

        chart.on("click", handleChartClick);
    }

    function handleChartClick(params: any): void {
        if (params.componentType !== "series" || !params.value?.[0]) return;
        const day = days.find((item) => item.date === params.value[0]);
        if (day && onSelectDate) onSelectDate(day);
    }

    function themeSignature(): string {
        const style = getComputedStyle(chartContainer?.closest(".workspace-page") || document.documentElement);
        return [
            style.getPropertyValue("--b3-theme-background"),
            style.getPropertyValue("--b3-theme-on-background"),
            style.getPropertyValue("--b3-theme-primary"),
            style.getPropertyValue("--b3-theme-surface"),
        ].join("|");
    }

    function readThemeColors() {
        const root = chartContainer?.closest(".workspace-page") || document.documentElement;
        const style = getComputedStyle(root);
        const currentColor = style.color || "currentColor";
        const resolve = (name: string, fallback: string): string => {
            if (!style.getPropertyValue(name).trim() || !chartContainer) return fallback;
            const probe = document.createElement("span");
            probe.style.color = `var(${name})`;
            probe.style.position = "absolute";
            probe.style.visibility = "hidden";
            chartContainer.appendChild(probe);
            const resolved = getComputedStyle(probe).color;
            probe.remove();
            return resolved || fallback;
        };
        const bg = resolve("--b3-theme-background", "transparent");
        const surface = resolve("--b3-theme-surface", bg);
        const onBg = resolve("--b3-theme-on-background", currentColor);
        const onSurface = resolve("--b3-theme-on-surface", onBg);
        const muted = resolve("--b3-theme-on-surface-light", onSurface);
        const primary = resolve("--b3-theme-primary", onBg);
        const error = resolve("--b3-theme-error", onBg);
        const border = resolve("--b3-border-color", muted);
        return { bg, surface, onBg, onSurface, muted, primary, error, border };
    }

    function setupObservers() {
        if (!chartContainer) return;
        resizeObserver = new ResizeObserver(() => {
            if (!chartContainer) return;
            const width = Math.round(chartContainer.clientWidth);
            const height = Math.round(chartContainer.clientHeight);
            if (width === observedWidth && height === observedHeight) return;
            observedWidth = width;
            observedHeight = height;
            if (resizeRaf) cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(() => {
                if (!isDestroyed && chart && chartContainer) {
                    void renderChart();
                }
            });
        });
        resizeObserver.observe(chartContainer);

        themeObserver = new MutationObserver(() => {
            const sig = themeSignature();
            if (sig !== lastThemeSig) {
                lastThemeSig = sig;
                if (themeTimeout) clearTimeout(themeTimeout);
                themeTimeout = setTimeout(() => {
                    if (!isDestroyed) void renderChart();
                }, 200);
            }
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style"],
        });
        lastThemeSig = themeSignature();
    }

    async function renderChart() {
        if (!chart || isDestroyed) return;
        const geometry = getCalendarGeometry();
        if (chartHeight !== geometry.height) {
            chartHeight = geometry.height;
            await tick();
            if (!chart || isDestroyed) return;
        }
        chart.resize();
        const colors = readThemeColors();
        const option = buildOption(colors, geometry.cellSize);
        chart.setOption(option, true);
    }

    function calcActivityScore(day: EnhancedDiaryCalendarDay): number {
        let score = 0;
        if (day.hasDiary) score += 2;
        score += day.newTaskCount || 0;
        score += day.migratedTaskCount || 0;
        score += day.quickRecordCount || 0;
        score += day.completedReviewCount || 0;
        score += (day.pendingReviewCount || 0) * 0.5;
        return Math.min(score, 12);
    }

    function getDateRange() {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const pad = (n: number) => String(n).padStart(2, "0");
        return {
            start: `${year}-${pad(month + 1)}-01`,
            end: `${year}-${pad(month + 1)}-${pad(lastDay.getDate())}`,
        };
    }

    function getCalendarRowCount(): number {
        const firstDay = new Date(year, month, 1);
        const mondayIndex = (firstDay.getDay() + 6) % 7;
        const dayCount = new Date(year, month + 1, 0).getDate();
        return Math.ceil((mondayIndex + dayCount) / 7);
    }

    function getCalendarGeometry(): { cellSize: number; height: number } {
        const width = chartContainer?.clientWidth || (isCompact ? 300 : 760);
        const available = Math.max(280, width - (isCompact ? 20 : 76));
        const raw = Math.floor(available / 7);
        const cellSize = isCompact
            ? Math.max(34, Math.min(44, raw))
            : Math.max(42, Math.min(88, raw));
        const top = isCompact ? 26 : 42;
        const bottom = isCompact ? 8 : 14;
        return {
            cellSize,
            height: top + bottom + getCalendarRowCount() * cellSize,
        };
    }

    function buildOption(
        colors: { bg: string; surface: string; onBg: string; onSurface: string; muted: string; primary: string; error: string; border: string },
        squareCellSize: number,
    ) {
        const dateRange = getDateRange();
        const data: any[] = [];
        const dayMap = new Map<string, EnhancedDiaryCalendarDay>();
        for (const day of days) {
            if (day.date >= dateRange.start && day.date <= dateRange.end) {
                const isSelected = day.date === selectedDate;
                const activity = calcActivityScore(day);
                const activityAlpha = activity <= 0 ? 0 : activity <= 2 ? 0.04 : activity <= 5 ? 0.07 : activity <= 8 ? 0.1 : 0.14;
                data.push({
                    value: [day.date, activity],
                    itemStyle: {
                        color: activityAlpha > 0 ? echarts.color.modifyAlpha(colors.primary, activityAlpha) : "transparent",
                        borderWidth: isSelected ? 2 : 0,
                        borderColor: isSelected ? colors.primary : "transparent",
                    },
                });
                dayMap.set(day.date, day);
            }
        }

        return {
            backgroundColor: "transparent",
            tooltip: {
                trigger: "item" as const,
                confine: true,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                textStyle: { color: colors.onSurface, fontSize: 13 },
                formatter: (params: any) => {
                    const d = dayMap.get(params.value[0]);
                    if (!d) return params.value[0];
                    let html = `<strong>${params.value[0]}</strong><br/>`;
                    const meta = d.metadata;
                    const calendarText = [
                        displaySettings?.showLunar !== false ? meta.lunarDayName : "",
                        displaySettings?.showSolarTerm !== false ? meta.solarTermName : "",
                        displaySettings?.showFestival !== false ? (meta.solarFestivalName || meta.lunarFestivalName) : "",
                        displaySettings?.showLegalHoliday !== false ? meta.legalHolidayName : "",
                    ].filter(Boolean).join(" · ");
                    if (calendarText) html += `${calendarText}<br/>`;
                    if (d.hasDiary) html += "已有日记<br/>";
                    if (taskManagementEnabled && d.newTaskCount) html += `新建任务: ${d.newTaskCount}<br/>`;
                    if (taskManagementEnabled && d.migratedTaskCount) html += `迁移任务: ${d.migratedTaskCount}<br/>`;
                    if (d.quickRecordCount) html += `快速记录: ${d.quickRecordCount}<br/>`;
                    if (d.completedReviewCount || d.pendingReviewCount) {
                        html += `复盘: ${d.completedReviewCount || 0}/${(d.completedReviewCount || 0) + (d.pendingReviewCount || 0)}<br/>`;
                    }
                    return html;
                },
            },
            calendar: {
                range: [dateRange.start, dateRange.end],
                orient: "vertical",
                left: "center",
                top: isCompact ? 26 : 42,
                cellSize: [squareCellSize, squareCellSize],
                yearLabel: { show: false },
                monthLabel: { show: false },
                dayLabel: {
                    firstDay: 1,
                    fontSize: isCompact ? 9 : 11,
                    color: colors.muted,
                    margin: isCompact ? 5 : 12,
                },
                itemStyle: {
                    color: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: isCompact ? 8 : 12,
                },
                splitLine: { show: false },
            },
            series: [
                {
                    type: "scatter",
                    coordinateSystem: "calendar",
                    data: data,
                    symbol: "rect",
                    symbolSize: [Math.max(1, squareCellSize - 3), Math.max(1, squareCellSize - 3)],
                    cursor: "pointer",
                    label: {
                        show: true,
                        position: "inside",
                        formatter: (params: any) => {
                            const d = dayMap.get(params.value[0]);
                            const dayNum = d ? parseInt(d.date.split("-")[2], 10) : "";
                            if (!d) return String(dayNum);
                            const meta = d.metadata;
                            const holiday = displaySettings?.showLegalHoliday !== false ? meta.legalHolidayName : "";
                            const festival = displaySettings?.showFestival !== false ? (meta.solarFestivalName || meta.lunarFestivalName) : "";
                            const term = displaySettings?.showSolarTerm !== false ? meta.solarTermName : "";
                            const lunar = displaySettings?.showLunar !== false ? meta.lunarDayName : "";
                            const sub = holiday || festival || term || lunar || "";
                            const brief = displaySettings?.showBriefCounts !== false;
                            const taskCount = taskManagementEnabled ? d.newTaskCount + d.migratedTaskCount : 0;
                            const taskMark = taskCount ? `{task|●${brief ? taskCount : ""}}` : "";
                            const recordMark = d.quickRecordCount ? `{record|━${brief ? d.quickRecordCount : ""}}` : "";
                            const reviewCount = d.completedReviewCount + d.pendingReviewCount;
                            const reviewMark = reviewCount ? `{review|○${brief ? reviewCount : ""}}` : "";
                            const marks = [taskMark, recordMark, reviewMark].filter(Boolean).join("  ");
                            const dayStyle = d.date === formatToday() ? "today" : "day";
                            return isCompact ? `{${dayStyle}|${dayNum}}` : `{${dayStyle}|${dayNum}}\n{sub|${sub}}\n${marks}`;
                        },
                        rich: {
                            day: { fontSize: isCompact ? 12 : 14, fontWeight: 700, color: colors.onBg, lineHeight: isCompact ? 18 : 22 },
                            today: { fontSize: isCompact ? 12 : 14, fontWeight: 700, color: colors.primary, lineHeight: isCompact ? 18 : 22 },
                            sub: { fontSize: 12, color: colors.muted, lineHeight: 17 },
                            task: { fontSize: 12, color: echarts.color.modifyAlpha(colors.primary, 0.9), lineHeight: 15 },
                            record: { fontSize: 12, color: echarts.color.modifyAlpha(colors.primary, 0.65), lineHeight: 15 },
                            review: { fontSize: 12, color: echarts.color.modifyAlpha(colors.primary, 0.45), lineHeight: 15 },
                        },
                    },
                    emphasis: {
                        scale: false,
                        itemStyle: {
                            color: echarts.color.modifyAlpha(colors.primary, 0.08),
                            shadowBlur: 8,
                            shadowColor: "transparent",
                        },
                    },
                },
            ],
        };
    }

    function formatToday(): string {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    onDestroy(() => {
        isDestroyed = true;
        if (initTimeout) clearTimeout(initTimeout);
        if (themeTimeout) clearTimeout(themeTimeout);
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
        if (themeObserver) { themeObserver.disconnect(); themeObserver = null; }
        if (chart) {
            chart.off("click", handleChartClick);
            chart.dispose();
            chart = null;
        }
    });
</script>

<div class="calendar-chart {isCompact ? 'compact' : 'full'}">
    {#if !isCompact}
        <div class="chart-nav">
            <span class="chart-month">{monthLabel}</span>
            <div class="chart-nav-actions">
                <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={onPrev} disabled={loading}>← 上月</button>
                <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={onToday}>今天</button>
                <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={onNext} disabled={loading}>下月 →</button>
            </div>
        </div>
    {/if}
    <div class="chart-body" bind:this={chartContainer} style={`height:${chartHeight}px`}></div>
    {#if loading}
        <div class="chart-overlay">
            <div class="wk-skeleton">
                <div class="wk-skeleton-line wide"></div>
                <div class="wk-skeleton-line medium"></div>
            </div>
        </div>
    {/if}
</div>

<style>
    .calendar-chart {
        position: relative;
        width: 100%;
    }

    .calendar-chart.full .chart-body {
        width: 100%;
    }

    .calendar-chart.compact .chart-body {
        width: 100%;
    }

    .chart-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
    }

    .chart-month {
        font-size: 22px;
        font-weight: 700;
        color: var(--wk-ink);
    }

    @container (max-width: 680px) {
        .chart-nav { align-items: flex-start; gap: 10px; }
        .chart-nav-actions :global(button) { padding-inline: 9px; }
    }

    .chart-nav-actions {
        display: flex;
        gap: 6px;
    }

    .chart-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--wk-bg-card) 60%, transparent);
    }
</style>
