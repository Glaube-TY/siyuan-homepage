<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import * as echarts from "echarts";
    import AccountingIcon from "./AccountingIcon.svelte";
    import AccountingCalendarChart from "./AccountingCalendarChart.svelte";
    import AccountingCategoryReport from "./AccountingCategoryReport.svelte";
    import AccountingReportTable from "./AccountingReportTable.svelte";
    import {
        buildTrendChartData,
        formatAccountingCurrency,
        getPeriodRange,
        summarizeRecordsForMonth,
        summarizeRecordsForRange,
    } from "./accountingAnalytics";
    import type { AccountingPeriod, AccountingRecord } from "./accountingTypes";

    type AnalyticsView = "overview" | "calendar";

    interface Props {
        records?: AccountingRecord[];
        period?: AccountingPeriod;
        defaultCurrency?: string;
        year?: number;
        onYearChange?: (year: number) => void | Promise<void>;
    }

    let {
        records = [],
        period = "month",
        defaultCurrency = "CNY",
        year,
        onYearChange,
    }: Props = $props();

    let trendContainer = $state<HTMLDivElement | null>(null);
    let chartError = $state("");
    let analyticsView = $state<AnalyticsView>("overview");
    let mounted = false;
    let resizeObserver: ResizeObserver | null = null;
    let renderRafId: number | null = null;
    let trendChart: echarts.ECharts | null = null;
    let observedTrendContainer: HTMLDivElement | null = null;

    const initialMonth = untrack(() => detectYearMonth(records));
    const initialYear = untrack(() => year) ?? getYearFromYearMonth(initialMonth);
    let selectedMonth = $state(initialMonth);
    let calendarMonth = $state(initialMonth);
    let selectedYear = $state(initialYear);
    let reportYearMonth = $derived(period === "year" ? `${selectedYear}-01` : selectedMonth);
    let summary = $derived(getSummary());

    function detectYearMonth(items: AccountingRecord[]): string {
        if (items.length === 0) {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        }
        const sorted = [...items].filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).sort((a, b) => b.date.localeCompare(a.date));
        return sorted[0]?.date.slice(0, 7) || getCurrentYearMonth();
    }

    function getCurrentYearMonth(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    function getYearFromYearMonth(value: string): number {
        return Number(value.split("-")[0]) || new Date().getFullYear();
    }

    function formatYearMonth(date: Date): string {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    function syncYearMonth(value: string, yearValue: number, fallbackMonth = "01"): string {
        const month = value.split("-")[1] || fallbackMonth;
        return `${yearValue}-${month}`;
    }

    function getSummary() {
        if (period === "year") {
            return summarizeRecordsForRange(records, `${selectedYear}-01-01`, `${selectedYear}-12-31`);
        }
        if (period === "recent30") {
            const { start, end } = getPeriodRange(period, getTrendReferenceDate());
            return summarizeRecordsForRange(records, start, end);
        }
        return summarizeRecordsForMonth(records, selectedMonth);
    }

    function getTrendReferenceDate(): Date {
        if (period === "year") {
            return new Date(selectedYear, 0, 1);
        }
        const [yearStr, monthStr] = selectedMonth.split("-");
        const monthYear = Number(yearStr);
        const month = Number(monthStr);
        if (!Number.isFinite(monthYear) || !Number.isFinite(month) || month < 1 || month > 12) {
            return new Date();
        }
        if (period === "recent30") {
            return selectedMonth === getCurrentYearMonth()
                ? new Date()
                : new Date(monthYear, month, 0);
        }
        return new Date(monthYear, month - 1, 1);
    }

    async function shiftMonth(delta: number): Promise<void> {
        const [yearStr, monthStr] = selectedMonth.split("-");
        const date = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
        const next = formatYearMonth(date);
        const nextYear = date.getFullYear();
        const currentYear = getYearFromYearMonth(selectedMonth);
        if (nextYear !== currentYear) {
            await onYearChange?.(nextYear);
            selectedYear = nextYear;
        }
        selectedMonth = next;
        calendarMonth = next;
    }

    async function shiftYear(delta: number): Promise<void> {
        const nextYear = selectedYear + delta;
        if (nextYear !== selectedYear) {
            await onYearChange?.(nextYear);
        }
        selectedYear = nextYear;
        selectedMonth = `${nextYear}-01`;
        calendarMonth = `${nextYear}-01`;
    }

    async function handleCalendarMonthChange(next: string): Promise<void> {
        const nextYear = getYearFromYearMonth(next);
        const currentYear = getYearFromYearMonth(calendarMonth);
        if (nextYear !== currentYear) {
            await onYearChange?.(nextYear);
            selectedYear = nextYear;
        }
        selectedMonth = next;
        calendarMonth = next;
    }

    $effect(() => {
        if (typeof year === "number" && Number.isFinite(year) && year !== selectedYear) {
            selectedYear = year;
            selectedMonth = period === "year" ? `${year}-01` : syncYearMonth(selectedMonth, year);
            calendarMonth = syncYearMonth(calendarMonth, year);
        }
    });

    $effect(() => {
        const activeView = analyticsView;
        records;
        period;
        selectedMonth;
        selectedYear;
        defaultCurrency;
        if (!mounted) return;
        if (activeView !== "overview") {
            disposeTrendChart();
            return;
        }
        scheduleRender();
    });

    onMount(() => {
        mounted = true;
        requestAnimationFrame(() => {
            scheduleRender();
            setupResizeObserver();
        });
    });

    onDestroy(() => {
        mounted = false;
        if (renderRafId) {
            cancelAnimationFrame(renderRafId);
            renderRafId = null;
        }
        resizeObserver?.disconnect();
        resizeObserver = null;
        observedTrendContainer = null;
        disposeTrendChart();
    });

    function scheduleRender(): void {
        if (renderRafId) {
            cancelAnimationFrame(renderRafId);
        }
        renderRafId = requestAnimationFrame(() => {
            renderRafId = null;
            renderCharts();
        });
    }

    function setupResizeObserver(): void {
        if (typeof ResizeObserver === "undefined") return;
        resizeObserver = new ResizeObserver(() => {
            trendChart?.resize();
        });
        observeTrendContainer();
    }

    function observeTrendContainer(): void {
        if (!resizeObserver || !trendContainer || observedTrendContainer === trendContainer) return;
        if (observedTrendContainer) {
            resizeObserver.unobserve(observedTrendContainer);
        }
        resizeObserver.observe(trendContainer);
        observedTrendContainer = trendContainer;
    }

    function disposeTrendChart(): void {
        trendChart?.dispose();
        trendChart = null;
    }

    function isDisposed(chart: echarts.ECharts | null): boolean {
        if (!chart) return true;
        try {
            return chart.isDisposed();
        } catch {
            return true;
        }
    }

    function renderCharts(): void {
        if (analyticsView !== "overview" || !trendContainer) return;
        chartError = "";

        try {
            const trendReferenceDate = getTrendReferenceDate();
            const trendData = buildTrendChartData(records, period, trendReferenceDate);

            observeTrendContainer();
            if (!isDisposed(trendChart) && trendChart?.getDom() !== trendContainer) {
                disposeTrendChart();
            }
            if (isDisposed(trendChart)) {
                trendChart = echarts.init(trendContainer);
            }

            trendChart!.setOption({
                color: ["#3aa76d", "#d66b50"],
                grid: { left: 40, right: 18, top: 32, bottom: 34 },
                tooltip: {
                    trigger: "axis",
                    valueFormatter: (value: number) => formatAccountingCurrency(value, defaultCurrency),
                },
                legend: {
                    top: 0,
                    data: ["收入", "支出"],
                },
                xAxis: {
                    type: "category",
                    data: trendData.labels,
                    axisLabel: { hideOverlap: true },
                },
                yAxis: {
                    type: "value",
                    axisLabel: { formatter: (value: number) => String(value) },
                },
                series: [
                    { name: "收入", type: "bar", data: trendData.income, barMaxWidth: 18 },
                    { name: "支出", type: "bar", data: trendData.expense, barMaxWidth: 18 },
                ],
            }, true);
        } catch (error) {
            chartError = error instanceof Error ? error.message : "图表初始化失败";
        }
    }
</script>

<div class="accounting-charts">
    {#if chartError}
        <div class="chart-error">{chartError}</div>
    {/if}

    <!-- Period Navigator -->
    <section class="month-navigator">
        {#if period === "year"}
            <button class="month-nav-btn" onclick={() => shiftYear(-1)} aria-label="上一年">‹</button>
            <span class="month-nav-title">{selectedYear}</span>
            <button class="month-nav-btn" onclick={() => shiftYear(1)} aria-label="下一年">›</button>
        {:else}
            <button class="month-nav-btn" onclick={() => shiftMonth(-1)} aria-label="上个月">‹</button>
            <span class="month-nav-title">{selectedMonth}</span>
            <button class="month-nav-btn" onclick={() => shiftMonth(1)} aria-label="下个月">›</button>
        {/if}
    </section>

    <!-- Summary Cards -->
    <section class="summary-cards">
        <div class="summary-card expense">
            <span class="summary-label">支出</span>
            <span class="summary-value">{formatAccountingCurrency(summary.expense, defaultCurrency)}</span>
        </div>
        <div class="summary-card income">
            <span class="summary-label">收入</span>
            <span class="summary-value">{formatAccountingCurrency(summary.income, defaultCurrency)}</span>
        </div>
        <div class="summary-card balance">
            <span class="summary-label">结余</span>
            <span class="summary-value">{formatAccountingCurrency(summary.balance, defaultCurrency)}</span>
        </div>
        <div class="summary-card average">
            <span class="summary-label">{period === "year" ? "月均支出" : "日均支出"}</span>
            <span class="summary-value">
                {formatAccountingCurrency(
                    period === "year" ? summary.expense / 12 : summary.averageExpense,
                    defaultCurrency,
                )}
            </span>
        </div>
    </section>

    <section class="analytics-subnav" aria-label="分析视图">
        <button
            type="button"
            class:active={analyticsView === "overview"}
            onclick={() => (analyticsView = "overview")}
        >
            趋势统计
        </button>
        <button
            type="button"
            class:active={analyticsView === "calendar"}
            onclick={() => (analyticsView = "calendar")}
        >
            日历明细
        </button>
    </section>

    {#if analyticsView === "overview"}
        <!-- Trend Chart -->
        <section class="chart-section trend-section">
            <header>
                <AccountingIcon name="chartColumn" size={16} />
                <strong>收支趋势</strong>
            </header>
            <div bind:this={trendContainer} class="chart-box"></div>
        </section>

        <!-- Category Report -->
        <section class="chart-section">
            <AccountingCategoryReport {records} {period} {defaultCurrency} direction="expense" yearMonth={reportYearMonth} />
        </section>

        <section class="chart-section">
            <AccountingCategoryReport {records} {period} {defaultCurrency} direction="income" yearMonth={reportYearMonth} />
        </section>
    {:else}
        <!-- Calendar -->
        <section class="chart-section calendar-section">
            <AccountingCalendarChart {records} yearMonth={calendarMonth} onMonthChange={handleCalendarMonthChange} />
        </section>

        <!-- Daily Report Table -->
        <section class="chart-section table-section">
            <AccountingReportTable {records} period="month" yearMonth={calendarMonth} {defaultCurrency} />
        </section>
    {/if}
</div>

<style lang="scss">
    .accounting-charts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        min-width: 0;
    }

    .month-navigator {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.55rem 0.75rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
    }

    .month-nav-title {
        font-weight: 650;
        font-size: 0.95rem;
        color: var(--b3-theme-on-background);
    }

    .month-nav-btn {
        width: 1.9rem;
        height: 1.9rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        transition: background 0.12s;
    }

    .month-nav-btn:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
    }

    .summary-cards {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.55rem;
    }

    .summary-card {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.75rem;
        border-radius: 10px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }

    .summary-label {
        font-size: 0.75rem;
        color: var(--b3-theme-on-surface-light);
    }

    .summary-value {
        font-size: 1.1rem;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .summary-card.income .summary-value {
        color: #1f8f55;
    }

    .summary-card.expense .summary-value {
        color: #c9553f;
    }

    .summary-card.balance .summary-value {
        color: var(--b3-theme-on-background);
    }

    .summary-card.average .summary-value {
        color: var(--b3-theme-primary);
    }

    .analytics-subnav {
        grid-column: 1 / -1;
        display: inline-flex;
        width: fit-content;
        max-width: 100%;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: 10px;
        background: var(--b3-theme-surface);
    }

    .analytics-subnav button {
        min-width: 5.6rem;
        min-height: 2rem;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
    }

    .analytics-subnav button.active {
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    .chart-section {
        min-width: 0;
        min-height: 280px;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.85rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }

    .trend-section {
        grid-column: 1 / -1;
        min-height: 320px;
    }

    .calendar-section,
    .table-section {
        grid-column: span 1;
    }

    header {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--b3-theme-on-background);
    }

    header strong {
        font-size: 0.88rem;
    }

    header :global(svg) {
        color: var(--b3-theme-primary);
    }

    .chart-box {
        flex: 1 1 auto;
        min-height: 220px;
        min-width: 0;
    }

    .chart-error {
        grid-column: 1 / -1;
        padding: 0.45rem 0.6rem;
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
        color: var(--b3-theme-error);
        font-size: 0.78rem;
    }

    @media (max-width: 760px) {
        .accounting-charts {
            grid-template-columns: 1fr;
        }

        .summary-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .analytics-subnav {
            width: 100%;
        }

        .analytics-subnav button {
            flex: 1;
        }

        .trend-section,
        .calendar-section,
        .table-section {
            grid-column: 1 / -1;
        }
    }
</style>
