<script lang="ts">
    import WorkspaceCalendarChart from "./WorkspaceCalendarChart.svelte";
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { EnhancedDiaryWorkspaceCalendarSettings } from "../../enhancedDiaryTypes";

    interface Props {
        calendarDays: EnhancedDiaryCalendarDay[];
        calendarDate: Date;
        calendarLoading: boolean;
        selectedCalendarDate: string;
        onSelectDate: (day: EnhancedDiaryCalendarDay) => void;
        onPrevMonth: () => void | Promise<void>;
        onNextMonth: () => void | Promise<void>;
        onCalendarToday?: () => void | Promise<void>;
        displaySettings?: EnhancedDiaryWorkspaceCalendarSettings;
        taskManagementEnabled?: boolean;
    }

    let {
        calendarDays,
        calendarDate,
        calendarLoading,
        selectedCalendarDate,
        onSelectDate,
        onPrevMonth,
        onNextMonth,
        onCalendarToday,
        displaySettings,
        taskManagementEnabled = true,
    }: Props = $props();
</script>

<div class="wk-card calendar-card">
    <WorkspaceCalendarChart
        days={calendarDays}
        year={calendarDate.getFullYear()}
        month={calendarDate.getMonth()}
        loading={calendarLoading}
        selectedDate={selectedCalendarDate}
        onSelectDate={onSelectDate}
        onPrev={onPrevMonth}
        onNext={onNextMonth}
        onToday={onCalendarToday}
        variant="compact"
        {displaySettings}
        {taskManagementEnabled}
    />
</div>

<style>
    .calendar-card {
        padding: var(--wk-gap-sm);
    }

</style>
