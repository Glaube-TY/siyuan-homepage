<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { EnhancedDiaryWorkspaceDayDetail } from "../enhancedDiaryWorkspaceDayDetail";
    import type { WorkspaceTaskStatusFilter } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceOverviewTodayCard from "./WorkspaceOverviewTodayCard.svelte";
    import WorkspaceOverviewQuickActions from "./WorkspaceOverviewQuickActions.svelte";
    import WorkspaceOverviewActionList from "./WorkspaceOverviewActionList.svelte";
    import WorkspaceOverviewTimeline from "./WorkspaceOverviewTimeline.svelte";
    import type { TimelineItem } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceOverviewCalendarSection from "./WorkspaceOverviewCalendarSection.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        onOpenToday: () => void | Promise<void>;
        onGoTasks: (statusFilter?: WorkspaceTaskStatusFilter) => void;
        onGoReview: () => void;
        onGoNotifications: () => void;
        onCreateTask: () => void;
        onCreateRecord: () => void;
        onAppendTemplate: () => void | Promise<void>;
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
        onCalendarToday: () => void | Promise<void>;
        onOpenTasks: (date: string) => void;
    }

    let {
        state,
        onOpenToday,
        onGoTasks,
        onGoReview,
        onGoNotifications,
        onCreateTask,
        onCreateRecord,
        onAppendTemplate,
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

    const overdueTasks = $derived(state.tasks.filter((task) => task.isOverdue).slice(0, 5));
    const migrateTasks = $derived(state.tasks.filter((task) => task.shouldMigrate).slice(0, 5));
    const hasNoDiaryReminder = $derived(!state.todayDiaryExists);
    const hasTemplateMissing = $derived(!state.templateValid && state.todayDiaryExists);
    const pendingReviewCards = $derived(
        state.reviewCards.filter((card) => ["not_created", "missing_template", "pending", "overdue"].includes(card.status))
    );

    const hasActionItems = $derived(
        hasNoDiaryReminder
        || hasTemplateMissing
        || overdueTasks.length > 0
        || migrateTasks.length > 0
        || pendingReviewCards.length > 0
    );

    const timelineItems = $derived.by((): TimelineItem[] => {
        const items: TimelineItem[] = [];
        if (state.summary.newTaskCount > 0) {
            items.push({
                type: "new_task",
                title: "新建任务",
                content: `今日新增 ${state.summary.newTaskCount} 个任务`,
                date: state.today,
            });
        }
        if (state.summary.migratedTaskCount > 0) {
            items.push({
                type: "migrate_task",
                title: "迁移任务",
                content: `从历史日记迁移 ${state.summary.migratedTaskCount} 个任务`,
                date: state.today,
            });
        }
        if (state.summary.quickRecordCount > 0) {
            items.push({
                type: "quick_record",
                title: "快速记录",
                content: `今日新增 ${state.summary.quickRecordCount} 条记录`,
                date: state.today,
            });
        }
        if (state.summary.projectCount > 0) {
            items.push({
                type: "project_progress",
                title: "项目推进",
                content: `今日推进 ${state.summary.projectCount} 个项目`,
                date: state.today,
            });
        }
        const completedReviews = state.reviewCards.filter((card) => card.status === "completed");
        if (completedReviews.length > 0) {
            items.push({
                type: "review",
                title: "复盘状态",
                content: `${completedReviews.length}/${state.reviewCards.length} 个复盘已完成`,
                date: state.today,
            });
        }
        return items;
    });
</script>

<section class="dashboard">
    <WorkspaceOverviewTodayCard
        {state}
        {onOpenToday}
    />

    <WorkspaceOverviewQuickActions
        {hasTemplateMissing}
        {onCreateTask}
        {onCreateRecord}
        {onOpenToday}
        {onAppendTemplate}
        {onGoReview}
    />

    <WorkspaceOverviewActionList
        {hasActionItems}
        {hasNoDiaryReminder}
        {hasTemplateMissing}
        overdueTasks={overdueTasks}
        migrateTasks={migrateTasks}
        pendingReviewCards={pendingReviewCards}
        {onOpenToday}
        {onAppendTemplate}
        {onGoTasks}
        {onGoReview}
        {onGoNotifications}
    />

    <WorkspaceOverviewTimeline items={timelineItems} />

    <WorkspaceOverviewCalendarSection
        {calendarDays}
        {calendarDate}
        {calendarLoading}
        {selectedCalendarDate}
        {selectedDayDetail}
        {dayDetailLoading}
        {onSelectDate}
        {onPrevMonth}
        {onNextMonth}
        {onOpenDoc}
        {onOpenRecords}
        {onOpenReview}
        onCalendarToday={onCalendarToday}
        {onOpenTasks}
    />
</section>

<style>
    .dashboard {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
</style>
