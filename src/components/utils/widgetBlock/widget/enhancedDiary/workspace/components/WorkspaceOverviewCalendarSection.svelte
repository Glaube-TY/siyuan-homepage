<script lang="ts">
    import WorkspaceCalendarPanel from "./WorkspaceCalendarPanel.svelte";
    import WorkspaceCalendarDayDetail from "./WorkspaceCalendarDayDetail.svelte";
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { EnhancedDiaryWorkspaceDayDetail } from "../enhancedDiaryWorkspaceDayDetail";

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
    }: Props = $props();
</script>

<div class="card wide calendar-card">
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
            />
        </div>
    </div>
</div>

<style>
    .card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 18px;
    }

    .wide {
        grid-column: 1 / -1;
    }

    .calendar-card {
        padding: 14px;
    }

    .calendar-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 16px;
        align-items: start;
    }

    @media (max-width: 900px) {
        .calendar-layout {
            grid-template-columns: 1fr;
        }
    }
</style>
