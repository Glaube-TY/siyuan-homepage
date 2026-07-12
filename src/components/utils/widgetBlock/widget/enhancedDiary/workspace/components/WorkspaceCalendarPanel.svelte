<script lang="ts">
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { EnhancedDiaryWorkspaceCalendarSettings } from "../../enhancedDiaryTypes";
    import WorkspaceCalendarChart from "./WorkspaceCalendarChart.svelte";

    interface Props {
        days: EnhancedDiaryCalendarDay[];
        year: number;
        month: number;
        loading?: boolean;
        selectedDate?: string;
        onSelectDate: (day: EnhancedDiaryCalendarDay) => void;
        onOpenDoc?: (docId?: string) => void;
        onPrev: () => void | Promise<void>;
        onNext: () => void | Promise<void>;
        onToday?: () => void | Promise<void>;
        displaySettings?: EnhancedDiaryWorkspaceCalendarSettings;
        taskManagementEnabled?: boolean;
    }

    let {
        days, year, month, loading = false, selectedDate,
        onSelectDate, onOpenDoc, onPrev, onNext, onToday,
        displaySettings, taskManagementEnabled = true,
    }: Props = $props();
</script>

<section class="calendar-panel">
    <header class="calendar-page-head">
        <h2>日历</h2>
        <p>回看每天的任务、记录与复盘。</p>
    </header>
    <WorkspaceCalendarChart
        {days}
        {year}
        {month}
        {loading}
        {selectedDate}
        {onSelectDate}
        {onPrev}
        {onNext}
        {onToday}
        {displaySettings}
        {taskManagementEnabled}
    />
</section>

<style>
    .calendar-panel {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-md);
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
    }

    .calendar-page-head h2 { margin: 0; font-size: 26px; color: var(--wk-ink); }
    .calendar-page-head p { margin: 5px 0 0; color: var(--wk-ink-muted); font-size: var(--wk-text-base); }
</style>
