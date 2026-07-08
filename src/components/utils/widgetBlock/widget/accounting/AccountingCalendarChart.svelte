<script lang="ts">
    import { buildCalendarReport } from "./accountingAnalytics";
    import type { AccountingRecord } from "./accountingTypes";

    interface Props {
        records?: AccountingRecord[];
        yearMonth?: string;
        onMonthChange?: (yearMonth: string) => void | Promise<void>;
    }

    let { records = [], yearMonth, onMonthChange }: Props = $props();

    let effectiveYearMonth = $derived(yearMonth || getCurrentYearMonth());
    let days = $derived(buildCalendarReport(records, effectiveYearMonth));
    let empty = $derived(days.every((d) => !d.hasData));
    let shiftingMonth = $state(false);

    function getCurrentYearMonth(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    async function shiftMonth(delta: number): Promise<void> {
        if (shiftingMonth) return;
        const [yearStr, monthStr] = effectiveYearMonth.split("-");
        const date = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
        const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        shiftingMonth = true;
        try {
            await onMonthChange?.(next);
        } finally {
            shiftingMonth = false;
        }
    }

    function displayText(day: { income: number; expense: number; transfer: number }): string {
        if (day.expense > 0) return String(Math.round(day.expense));
        if (day.income > 0) return String(Math.round(day.income));
        if (day.transfer > 0) return String(Math.round(day.transfer));
        return "";
    }

    function displayClass(day: { income: number; expense: number; transfer: number; hasData: boolean }): string {
        if (!day.hasData) return "empty";
        if (day.expense > 0) return "expense";
        if (day.income > 0) return "income";
        return "transfer";
    }

    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
</script>

<div class="calendar-chart">
    <div class="calendar-header">
        <button class="calendar-nav" onclick={() => void shiftMonth(-1)} aria-label="上个月" disabled={shiftingMonth}>‹</button>
        <span class="calendar-title">{effectiveYearMonth} 收支日历</span>
        <button class="calendar-nav" onclick={() => void shiftMonth(1)} aria-label="下个月" disabled={shiftingMonth}>›</button>
    </div>
    {#if empty}
        <div class="calendar-empty">
            <span>本月暂无流水</span>
        </div>
    {:else}
        <div class="calendar-grid">
            {#each weekdays as wd}
                <div class="calendar-weekday">{wd}</div>
            {/each}
            {#each days as day}
                <div
                    class="calendar-day"
                    class:today={day.isToday}
                    class:current-month={day.isCurrentMonth}
                    class:other-month={!day.isCurrentMonth}
                >
                    <span class="day-number">{day.day}</span>
                    {#if day.isCurrentMonth && displayText(day)}
                        <span class="day-value {displayClass(day)}">{displayText(day)}</span>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .calendar-chart {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        min-width: 0;
    }

    .calendar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
    }

    .calendar-title {
        font-weight: 600;
        font-size: 0.88rem;
        color: var(--b3-theme-on-background);
    }

    .calendar-nav {
        width: 1.6rem;
        height: 1.6rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font: inherit;
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
        transition: background 0.12s;
    }

    .calendar-nav:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
    }

    .calendar-nav:disabled {
        opacity: 0.55;
        cursor: wait;
    }

    .calendar-empty {
        min-height: 6rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.82rem;
    }

    .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.25rem;
    }

    .calendar-weekday {
        text-align: center;
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
        padding: 0.2rem 0;
    }

    .calendar-day {
        aspect-ratio: 1 / 1;
        min-height: 2.2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.05rem;
        border-radius: 8px;
        border: 1px solid transparent;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font-size: 0.72rem;
    }

    .calendar-day.other-month {
        opacity: 0.35;
    }

    .calendar-day.today {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }

    .day-number {
        font-weight: 550;
    }

    .day-value {
        font-size: 0.65rem;
        font-weight: 600;
    }

    .day-value.expense {
        color: #c9553f;
    }

    .day-value.income {
        color: #1f8f55;
    }

    .day-value.transfer {
        color: var(--b3-theme-on-surface-light);
    }
</style>
