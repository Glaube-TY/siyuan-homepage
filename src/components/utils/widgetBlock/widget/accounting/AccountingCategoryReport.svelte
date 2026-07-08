<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import * as echarts from "echarts";
    import AccountingIcon from "./AccountingIcon.svelte";
    import { buildCategoryReport, formatAccountingCurrency } from "./accountingAnalytics";
    import type { AccountingPeriod, AccountingRecord } from "./accountingTypes";

    interface Props {
        records?: AccountingRecord[];
        period?: AccountingPeriod;
        defaultCurrency?: string;
        direction?: "expense" | "income";
        yearMonth?: string;
    }

    let {
        records = [],
        period = "month",
        defaultCurrency = "CNY",
        direction = "expense",
        yearMonth,
    }: Props = $props();

    let container = $state<HTMLDivElement | null>(null);
    let chart: echarts.ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mounted = false;
    let rafId: number | null = null;

    let referenceDate = $derived(yearMonthToDate(yearMonth));
    let reportItems = $derived(buildCategoryReport(records, period, referenceDate, direction));

    function yearMonthToDate(value: string | undefined): Date {
        if (!value) return new Date();
        const [yearStr, monthStr] = value.split("-");
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
            if (period === "recent30") {
                return value === getCurrentYearMonth() ? new Date() : new Date(year, month, 0);
            }
            return new Date(year, month - 1, 1);
        }
        return new Date();
    }

    function getCurrentYearMonth(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    let total = $derived(reportItems.reduce((sum, item) => sum + item.amount, 0));
    let empty = $derived(reportItems.length === 0);

    $effect(() => {
        records;
        period;
        direction;
        yearMonth;
        defaultCurrency;
        reportItems;
        if (mounted) {
            if (empty) {
                disposeChart();
                return;
            }
            scheduleRender();
        }
    });

    onMount(() => {
        mounted = true;
        scheduleRender();
        setupResizeObserver();
    });

    onDestroy(() => {
        mounted = false;
        if (rafId) cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        disposeChart();
    });

    function scheduleRender(): void {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            rafId = null;
            renderChart();
        });
    }

    function setupResizeObserver(): void {
        if (typeof ResizeObserver === "undefined") return;
        resizeObserver = new ResizeObserver(() => chart?.resize());
        if (container) resizeObserver.observe(container);
    }

    function isDisposed(c: echarts.ECharts | null): boolean {
        if (!c) return true;
        try {
            return c.isDisposed();
        } catch {
            return true;
        }
    }

    function disposeChart(): void {
        chart?.dispose();
        chart = null;
    }

    function renderChart(): void {
        if (!container) return;
        if (!isDisposed(chart) && chart?.getDom() !== container) {
            disposeChart();
        }
        if (isDisposed(chart)) {
            chart = echarts.init(container);
        }
        const data = reportItems.map((item) => ({
            name: item.name,
            value: item.amount,
        }));
        chart.setOption({
            color: ["#d66b50", "#f2a65a", "#6aaed6", "#7c8fda", "#76b582", "#c58ad8", "#d9b76c", "#9aa4ad"],
            tooltip: {
                trigger: "item",
                valueFormatter: (value: number) => formatAccountingCurrency(value, defaultCurrency),
            },
            series: [
                {
                    name: direction === "income" ? "收入分类" : "支出分类",
                    type: "pie",
                    radius: ["42%", "70%"],
                    center: ["50%", "50%"],
                    label: { formatter: "{b}" },
                    data,
                },
            ],
        });
    }

    function progressStyle(percent: number): string {
        return `--progress: ${percent}%`;
    }
</script>

<div class="category-report">
    <div class="category-header">
        <strong>{direction === "income" ? "收入分类" : "支出分类"}</strong>
        {#if total > 0}
            <span class="category-total">{formatAccountingCurrency(total, defaultCurrency)}</span>
        {/if}
    </div>

    {#if empty}
        <div class="category-empty">
            <AccountingIcon name="chartPie" size={28} />
            <span>暂无{direction === "income" ? "收入" : "支出"}数据</span>
        </div>
    {:else}
        <div bind:this={container} class="category-chart"></div>

        <div class="category-list">
            {#each reportItems as item, index}
                <div class="category-item">
                    <span class="category-rank">{index + 1}</span>
                    <span class="category-name">{item.name}</span>
                    <div class="category-progress" style={progressStyle(item.percent)}>
                        <div class="category-progress-bar"></div>
                    </div>
                    <span class="category-amount">{formatAccountingCurrency(item.amount, defaultCurrency)}</span>
                    <span class="category-percent">{item.percent}%</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .category-report {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        min-width: 0;
    }

    .category-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .category-header strong {
        font-size: 0.88rem;
        color: var(--b3-theme-on-background);
    }

    .category-total {
        font-size: 0.8rem;
        color: var(--b3-theme-on-surface-light);
    }

    .category-empty {
        min-height: 8rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
    }

    .category-chart {
        height: 200px;
        min-width: 0;
    }

    .category-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-width: 0;
    }

    .category-item {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 0.35rem;
        border-radius: 8px;
        background: transparent;
        transition: background 0.1s;
    }

    .category-item:hover {
        background: color-mix(in srgb, var(--b3-theme-surface) 60%, transparent);
    }

    .category-rank {
        width: 1.3rem;
        height: 1.3rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface-light);
        font-size: 0.7rem;
        font-weight: 600;
    }

    .category-name {
        font-size: 0.82rem;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .category-progress {
        grid-column: 2 / 3;
        height: 4px;
        border-radius: 2px;
        background: var(--b3-theme-surface);
        overflow: hidden;
    }

    .category-progress-bar {
        width: var(--progress);
        height: 100%;
        border-radius: 2px;
        background: var(--b3-theme-primary);
    }

    .category-amount {
        font-size: 0.8rem;
        font-weight: 600;
        white-space: nowrap;
    }

    .category-percent {
        font-size: 0.75rem;
        color: var(--b3-theme-on-surface-light);
        min-width: 2.2rem;
        text-align: right;
    }
</style>
