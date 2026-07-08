<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import { getCategoryIcon } from "./accountingCategoryConfig";
    import { formatAccountingCurrency } from "./accountingAnalytics";
    import type { AccountingRecord, AccountingSummary } from "./accountingTypes";

    interface Props {
        summary: AccountingSummary;
        records?: AccountingRecord[];
        defaultCurrency?: string;
        monthlyBudget?: number;
        onAdd?: () => void;
        onEdit?: (record: AccountingRecord) => void;
    }

    let {
        summary,
        records = [],
        defaultCurrency = "CNY",
        monthlyBudget = 0,
        onAdd,
        onEdit,
    }: Props = $props();

    let budgetPercent = $derived(
        monthlyBudget > 0 ? Math.min(100, Math.round(summary.budgetUsedRatio * 100)) : 0,
    );

    const cards = $derived([
        { label: "本月结余", value: summary.balance, icon: "wallet" as const, tone: "balance" },
        { label: "本月收入", value: summary.incomeTotal, icon: "income" as const, tone: "income" },
        { label: "本月支出", value: summary.expenseTotal, icon: "expense" as const, tone: "expense" },
        { label: "今日支出", value: summary.todayExpense, icon: "calendar" as const, tone: "expense" },
    ]);
</script>

<div class="accounting-dashboard">
    <div class="summary-grid">
        {#each cards as card}
            <div class="summary-card {card.tone}">
                <div class="card-icon-row">
                    <span class="card-icon-bg">
                        <AccountingIcon name={card.icon} size={17} />
                    </span>
                    <span class="summary-label">{card.label}</span>
                </div>
                <strong>{formatAccountingCurrency(card.value, defaultCurrency)}</strong>
            </div>
        {/each}
    </div>

    {#if monthlyBudget > 0}
        <div class="budget-panel">
            <div class="budget-head">
                <span><AccountingIcon name="budget" size={15} /> 月预算</span>
                <strong>{budgetPercent}%</strong>
            </div>
            <div class="budget-track">
                <span style={`width: ${budgetPercent}%`}></span>
            </div>
            <p>{formatAccountingCurrency(summary.expenseTotal, defaultCurrency)} / {formatAccountingCurrency(monthlyBudget, defaultCurrency)}</p>
        </div>
    {/if}

    <div class="recent-panel">
        <div class="recent-head">
            <strong>最近流水</strong>
            {#if onAdd}
                <button type="button" onclick={onAdd}>
                    <AccountingIcon name="plus" size={15} />
                    <span>记一笔</span>
                </button>
            {/if}
        </div>

        {#if records.length === 0}
            <div class="empty-recent">暂无流水，点击"记一笔"开始记录。</div>
        {:else}
            <div class="recent-list">
                {#each records as record (record.recordId)}
                    <button type="button" class="recent-row" onclick={() => onEdit?.(record)}>
                        <span class="recent-cat-icon">
                            <AccountingIcon name={getCategoryIcon(record.direction, record.categoryPrimary || "其他")} size={15} />
                        </span>
                        <span class="recent-title">{record.title}</span>
                        <span class="recent-date">{record.date}</span>
                        <strong class:income={record.direction === "income"} class:expense={record.direction === "expense"}>
                            {record.direction === "income" ? "+" : record.direction === "expense" ? "-" : ""}{formatAccountingCurrency(record.amount, record.currency || defaultCurrency)}
                        </strong>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style lang="scss">
    .accounting-dashboard {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        min-width: 0;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.65rem;
    }

    .summary-card {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.8rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }

    .card-icon-row {
        display: flex;
        align-items: center;
        gap: 0.42rem;
    }

    .card-icon-bg {
        width: 2rem;
        height: 2rem;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .summary-card.income .card-icon-bg {
        background: rgba(31, 143, 85, 0.12);
        color: #1f8f55;
    }

    .summary-card.expense .card-icon-bg {
        background: rgba(201, 85, 63, 0.12);
        color: #c9553f;
    }

    .summary-card.balance .card-icon-bg {
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
    }

    .summary-card strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 1.15rem;
        font-weight: 700;
        line-height: 1.2;
    }

    .summary-label {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.76rem;
        font-weight: 500;
    }

    .summary-card.income strong,
    .recent-row strong.income {
        color: #1f8f55;
    }

    .summary-card.expense strong,
    .recent-row strong.expense {
        color: #c9553f;
    }

    .budget-panel,
    .recent-panel {
        padding: 0.8rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }

    .budget-head,
    .recent-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
    }

    .budget-head span,
    .recent-head button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
    }

    .budget-track {
        height: 0.48rem;
        margin-top: 0.55rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-background) 70%, transparent);
        overflow: hidden;
    }

    .budget-track span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--b3-theme-primary);
        transition: width 0.3s ease;
    }

    .budget-panel p {
        margin: 0.4rem 0 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.76rem;
    }

    .recent-head button {
        min-height: 1.9rem;
        padding: 0.28rem 0.65rem;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 8px;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        font-size: 0.78rem;
    }

    .recent-list {
        margin-top: 0.6rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .recent-row {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.55rem;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--b3-theme-on-background);
        text-align: left;
        cursor: pointer;
        font: inherit;
        transition: background 0.12s, transform 0.12s;
    }

    .recent-row:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
        transform: translateY(-1px);
    }

    .recent-cat-icon {
        width: 1.9rem;
        height: 1.9rem;
        border-radius: 7px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
    }

    .recent-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 650;
    }

    .recent-date {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.74rem;
        white-space: nowrap;
    }

    .recent-row strong {
        white-space: nowrap;
        font-size: 0.88rem;
    }

    .empty-recent {
        min-height: 4.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
    }

    @media (max-width: 760px) {
        .summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .recent-row {
            grid-template-columns: auto minmax(0, 1fr) auto;
        }

        .recent-date {
            display: none;
        }
    }
</style>
