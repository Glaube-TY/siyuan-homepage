<script lang="ts">
    import WorkspaceCalendarPanel from "./WorkspaceCalendarPanel.svelte";
    import WorkspaceCalendarDayDetail from "./WorkspaceCalendarDayDetail.svelte";
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { EnhancedDiaryWorkspaceDayDetail } from "../enhancedDiaryWorkspaceDayDetail";
    import type { EnhancedDiaryWorkspaceCalendarSettings } from "../../enhancedDiaryTypes";

    interface Props {
        calendarDays: EnhancedDiaryCalendarDay[];
        calendarDate: Date;
        calendarLoading: boolean;
        selectedCalendarDate: string;
        selectedDayDetail: EnhancedDiaryWorkspaceDayDetail | null;
        dayDetailLoading: boolean;
        onSelectDate: (day: EnhancedDiaryCalendarDay) => void;
        onPrevMonth: () => void | Promise<void>;
        onNextMonth: () => void | Promise<void>;
        onOpenDoc: (docId?: string) => void;
        onOpenRecords?: (date: string) => void;
        onOpenReview?: (date: string) => void;
        onCalendarToday?: () => void | Promise<void>;
        onOpenTasks: (date: string) => void;
        displaySettings?: EnhancedDiaryWorkspaceCalendarSettings;
        taskManagementEnabled?: boolean;
    }

    let {
        calendarDays,
        calendarDate,
        calendarLoading,
        selectedCalendarDate,
        selectedDayDetail,
        dayDetailLoading,
        onSelectDate,
        onPrevMonth,
        onNextMonth,
        onOpenDoc,
        onOpenRecords,
        onOpenReview,
        onCalendarToday,
        onOpenTasks,
        displaySettings,
        taskManagementEnabled = true,
    }: Props = $props();
</script>

<div class="wk-card calendar-card">
    <div class="calendar-layout">
        <div class="calendar-col">
            <WorkspaceCalendarPanel
                days={calendarDays}
                year={calendarDate.getFullYear()}
                month={calendarDate.getMonth()}
                loading={calendarLoading}
                selectedDate={selectedCalendarDate}
                onSelectDate={onSelectDate}
                onOpenDoc={onOpenDoc}
                onPrev={onPrevMonth}
                onNext={onNextMonth}
                onToday={onCalendarToday}
                {displaySettings}
                {taskManagementEnabled}
            />
        </div>
        <div class="calendar-detail-col">
            <WorkspaceCalendarDayDetail
                detail={selectedDayDetail}
                loading={dayDetailLoading}
                onOpenDoc={onOpenDoc}
                onOpenRecords={onOpenRecords}
                onOpenTasks={onOpenTasks}
                onOpenReview={onOpenReview}
                {taskManagementEnabled}
            />
        </div>
    </div>
</div>

<style>
    .calendar-card {
        grid-column: 1 / -1;
        padding: var(--wk-gap-sm);
    }

    .calendar-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: var(--wk-gap-md);
        align-items: start;
    }

    @media (max-width: 900px) {
        .calendar-layout {
            grid-template-columns: 1fr;
        }
    }
</style>
