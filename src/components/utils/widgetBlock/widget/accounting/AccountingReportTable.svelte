<script lang="ts">
    import { buildDailyReport, buildMonthlyReport, formatAccountingCurrency } from "./accountingAnalytics";
    import type { AccountingPeriod, AccountingRecord } from "./accountingTypes";

    interface Props {
        records?: AccountingRecord[];
        period?: AccountingPeriod;
        yearMonth?: string;
        defaultCurrency?: string;
    }

    let {
        records = [],
        period = "month",
        yearMonth,
        defaultCurrency = "CNY",
    }: Props = $props();

    let effectiveYearMonth = $derived(yearMonth || getCurrentYearMonth());
    let effectiveYear = $derived(Number(effectiveYearMonth.split("-")[0]) || new Date().getFullYear());

    let items = $derived(
        period === "year"
            ? buildMonthlyReport(records, effectiveYear)
            : buildDailyReport(records, effectiveYearMonth),
    );
    let empty = $derived(items.length === 0);

    function getCurrentYearMonth(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    function label(item: { date?: string; month?: string }): string {
        return item.date || item.month || "";
    }
</script>

<div class="report-table">
    <div class="table-header">
        <strong>{period === "year" ? "月度汇总" : "每日汇总"}</strong>
    </div>
    {#if empty}
        <div class="table-empty">
            <span>暂无数据</span>
        </div>
    {:else}
        <div class="table-body">
            <div class="table-row table-head">
                <span>{period === "year" ? "月份" : "日期"}</span>
                <span class="num">收入</span>
                <span class="num">支出</span>
                <span class="num">结余</span>
            </div>
            {#each items as item}
                <div class="table-row">
                    <span>{label(item)}</span>
                    <span class="num income">+{formatAccountingCurrency(item.income, defaultCurrency)}</span>
                    <span class="num expense">-{formatAccountingCurrency(item.expense, defaultCurrency)}</span>
                    <span class="num" class:income={item.balance > 0} class:expense={item.balance < 0}>
                        {item.balance > 0 ? "+" : ""}{formatAccountingCurrency(item.balance, defaultCurrency)}
                    </span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .report-table {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        min-width: 0;
    }

    .table-header {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .table-header strong {
        font-size: 0.88rem;
        color: var(--b3-theme-on-background);
    }

    .table-empty {
        min-height: 6rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.82rem;
    }

    .table-body {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        overflow: hidden;
    }

    .table-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto auto;
        gap: 0.6rem;
        align-items: center;
        padding: 0.5rem 0.7rem;
        font-size: 0.8rem;
        color: var(--b3-theme-on-background);
    }

    .table-row:nth-child(even) {
        background: color-mix(in srgb, var(--b3-theme-surface) 40%, transparent);
    }

    .table-head {
        background: var(--b3-theme-surface) !important;
        font-weight: 600;
        font-size: 0.75rem;
        color: var(--b3-theme-on-surface-light);
    }

    .num {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }

    .income {
        color: #1f8f55;
    }

    .expense {
        color: #c9553f;
    }
</style>
