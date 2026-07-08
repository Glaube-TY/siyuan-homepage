<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import { getCategoryIcon } from "./accountingCategoryConfig";
    import {
        filterAccountingRecords,
        formatAccountingCurrency,
        getAssetDisplayName,
        getAvailableCategories,
        getAvailableMonths,
        relativeDateLabel,
        summarizeDay,
    } from "./accountingAnalytics";
    import type {
        AccountingAccount,
        AccountingDirection,
        AccountingFilter,
        AccountingRecord,
    } from "./accountingTypes";

    interface Props {
        records?: AccountingRecord[];
        filter?: AccountingFilter;
        defaultCurrency?: string;
        accounts?: AccountingAccount[];
        availableYears?: number[];
        selectedYear?: number;
        onEdit: (record: AccountingRecord) => void;
        onDelete?: (record: AccountingRecord) => void | Promise<void>;
        onMonthChange?: (month: string | undefined) => void | Promise<void>;
        onYearChange?: (year: number) => void | Promise<void>;
    }

    let {
        records = [],
        filter = $bindable<AccountingFilter>({ direction: "all" }),
        defaultCurrency = "CNY",
        accounts = [],
        availableYears = [],
        selectedYear,
        onEdit,
        onDelete,
        onMonthChange,
        onYearChange,
    }: Props = $props();

    let months = $derived(getAvailableMonths(records));
    let monthOptions = $derived(
        filter.month && !months.includes(filter.month)
            ? [filter.month, ...months]
            : months,
    );
    let categories = $derived(getAvailableCategories(records));
    let visibleRecords = $derived(filterAccountingRecords(records, filter));

    let groupedRecords = $derived(groupByDate(visibleRecords));

    function groupByDate(items: AccountingRecord[]): { date: string; records: AccountingRecord[]; summary: { income: number; expense: number; transfer: number } }[] {
        const map = new Map<string, AccountingRecord[]>();
        for (const record of items) {
            if (!map.has(record.date)) map.set(record.date, []);
            map.get(record.date)!.push(record);
        }
        return Array.from(map.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, dayRecords]) => ({
                date,
                records: dayRecords,
                summary: summarizeDay(dayRecords),
            }));
    }

    function setDirection(value: AccountingDirection | "all"): void {
        filter = { ...filter, direction: value };
    }

    function directionLabel(value: AccountingDirection): string {
        if (value === "income") return "收入";
        if (value === "transfer") return "转账";
        return "支出";
    }

    function amountPrefix(value: AccountingDirection): string {
        if (value === "income") return "+";
        if (value === "expense") return "-";
        return "";
    }

    function formatAccountMeta(record: AccountingRecord): string {
        if (record.direction === "transfer") {
            const from = getAssetDisplayName(record.account, accounts);
            const to = getAssetDisplayName(record.counterAccount, accounts);
            if (from && to) return `${from} → ${to}`;
            return from || to || "";
        }
        return getAssetDisplayName(record.account, accounts);
    }

    function primaryLabel(record: AccountingRecord): string {
        return record.title?.trim() || record.categoryPrimary || "其他";
    }

    function secondaryLabel(record: AccountingRecord): string {
        const parts: string[] = [];
        if (record.categoryPrimary && record.categoryPrimary !== record.title) {
            parts.push(record.categoryPrimary);
        }
        if (record.categorySecondary) {
            parts.push(record.categorySecondary);
        }
        return parts.join(" · ");
    }
</script>

<div class="accounting-record-list">
    <div class="list-filters">
        {#if availableYears.length > 0}
            <select
                class="filter-select"
                value={selectedYear ?? availableYears[0]}
                onchange={(e) => {
                    const value = Number(e.currentTarget.value);
                    if (Number.isFinite(value)) {
                        void onYearChange?.(value);
                    }
                }}
            >
                {#each availableYears as year}
                    <option value={year}>{year} 年</option>
                {/each}
            </select>
        {/if}

        <div class="filter-chips">
            <button class="filter-chip" class:active={filter.direction === "all" || !filter.direction} onclick={() => setDirection("all")}>全部</button>
            <button class="filter-chip" class:active={filter.direction === "expense"} onclick={() => setDirection("expense")}>支出</button>
            <button class="filter-chip" class:active={filter.direction === "income"} onclick={() => setDirection("income")}>收入</button>
            <button class="filter-chip" class:active={filter.direction === "transfer"} onclick={() => setDirection("transfer")}>转账</button>
        </div>

        {#if monthOptions.length > 0}
            <select
                class="filter-select"
                value={filter.month || ""}
                onchange={(e) => {
                    const value = e.currentTarget.value || undefined;
                    filter = { ...filter, month: value };
                    onMonthChange?.(value);
                }}
            >
                <option value="">全部月份</option>
                {#each monthOptions as month}
                    <option value={month}>{month}</option>
                {/each}
            </select>
        {/if}

        {#if categories.length > 0}
            <select class="filter-select" value={filter.categoryPrimary || ""} onchange={(e) => (filter = { ...filter, categoryPrimary: e.currentTarget.value || undefined })}>
                <option value="">全部分类</option>
                {#each categories as category}
                    <option value={category}>{category}</option>
                {/each}
            </select>
        {/if}
    </div>

    {#if visibleRecords.length === 0}
        <div class="empty-list">
            <AccountingIcon name="records" size={28} />
            <span>暂无匹配流水</span>
        </div>
    {:else}
        <div class="record-groups">
            {#each groupedRecords as group (group.date)}
                <section class="record-group">
                    <header class="group-header">
                        <span class="group-date">{relativeDateLabel(group.date)}</span>
                        <span class="group-summary">
                            {#if group.summary.expense > 0}
                                <span class="group-expense">支 {formatAccountingCurrency(group.summary.expense, defaultCurrency)}</span>
                            {/if}
                            {#if group.summary.income > 0}
                                <span class="group-income">收 {formatAccountingCurrency(group.summary.income, defaultCurrency)}</span>
                            {/if}
                        </span>
                    </header>
                    <div class="group-items">
                        {#each group.records as record (record.recordId)}
                            <button class="record-row" onclick={() => onEdit(record)} title="编辑流水">
                                <span class="record-icon" class:income={record.direction === "income"} class:expense={record.direction === "expense"} class:transfer={record.direction === "transfer"}>
                                    <AccountingIcon name={getCategoryIcon(record.direction, record.categoryPrimary || "其他")} size={18} />
                                </span>
                                <span class="record-main">
                                    <span class="record-title">{primaryLabel(record)}</span>
                                    <span class="record-meta">
                                        {#if secondaryLabel(record)}
                                            {secondaryLabel(record)} · {formatAccountMeta(record)}
                                        {:else}
                                            {formatAccountMeta(record)}
                                        {/if}
                                    </span>
                                </span>
                                <span class="record-amount" class:income={record.direction === "income"} class:expense={record.direction === "expense"} class:transfer={record.direction === "transfer"}>
                                    {amountPrefix(record.direction)}{formatAccountingCurrency(record.amount, record.currency || defaultCurrency)}
                                </span>
                                {#if onDelete}
                                    <span
                                        class="record-delete"
                                        role="button"
                                        tabindex="0"
                                        title="删除"
                                        onclick={(event) => {
                                            event.stopPropagation();
                                            void onDelete(record);
                                        }}
                                        onkeydown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void onDelete(record);
                                            }
                                        }}
                                    >
                                        <AccountingIcon name="trash" size={15} />
                                    </span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </section>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .accounting-record-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-height: 0;
    }

    .list-filters {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .filter-chips {
        display: flex;
        gap: 0.25rem;
        background: var(--b3-theme-surface);
        border-radius: 8px;
        padding: 2px;
    }

    .filter-chip {
        padding: 0.3rem 0.65rem;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.76rem;
        font-weight: 550;
        cursor: pointer;
        transition: all 0.12s;
        white-space: nowrap;
    }

    .filter-chip.active {
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }

    .filter-select {
        padding: 0.3rem 0.5rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font: inherit;
        font-size: 0.76rem;
    }

    .record-groups {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        min-height: 0;
    }

    .record-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.2rem 0.3rem;
    }

    .group-date {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--b3-theme-on-background);
    }

    .group-summary {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.72rem;
        font-weight: 500;
    }

    .group-income {
        color: #1f8f55;
    }

    .group-expense {
        color: #c9553f;
    }

    .group-items {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.35rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-background);
        box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }

    .record-row {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.55rem;
        padding: 0.55rem;
        border: none;
        border-radius: 9px;
        background: transparent;
        color: var(--b3-theme-on-background);
        text-align: left;
        cursor: pointer;
        font: inherit;
        transition: background 0.1s;
    }

    .record-row:hover {
        background: color-mix(in srgb, var(--b3-theme-surface) 60%, transparent);
    }

    .record-icon {
        width: 2.1rem;
        height: 2.1rem;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
    }

    .record-icon.income {
        color: #1f8f55;
        background: rgba(31, 143, 85, 0.12);
    }

    .record-icon.expense {
        color: #c9553f;
        background: rgba(201, 85, 63, 0.12);
    }

    .record-icon.transfer {
        color: var(--b3-theme-on-surface-light);
        background: var(--b3-theme-surface-light);
    }

    .record-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }

    .record-title,
    .record-meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .record-title {
        font-weight: 600;
        font-size: 0.88rem;
    }

    .record-meta {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.72rem;
    }

    .record-amount {
        font-weight: 700;
        white-space: nowrap;
        font-size: 0.9rem;
    }

    .record-amount.income {
        color: #1f8f55;
    }

    .record-amount.expense {
        color: #c9553f;
    }

    .record-amount.transfer {
        color: var(--b3-theme-on-surface-light);
    }

    .record-delete {
        width: 1.9rem;
        height: 1.9rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 7px;
        color: var(--b3-theme-error);
        transition: background 0.12s;
    }

    .record-delete:hover {
        background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
    }

    .empty-list {
        min-height: 8rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
    }

    @media (max-width: 640px) {
        .list-filters {
            flex-direction: column;
            align-items: stretch;
        }

        .record-row {
            grid-template-columns: auto minmax(0, 1fr);
        }

        .record-amount,
        .record-delete {
            justify-self: end;
        }
    }
</style>
