<script lang="ts">
    import type { GenerateTasksPlusTaskInput } from "../../../tasksPlus/tasksPlusParser";
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryWorkspaceRecord } from "../enhancedDiaryWorkspaceRecordService";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { GoRecordsOptions, WorkspaceTaskStatusFilter } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceOverviewAttention from "./WorkspaceOverviewAttention.svelte";
    import WorkspaceOverviewFocus from "./WorkspaceOverviewFocus.svelte";
    import WorkspaceOverviewPeriodFocus from "./WorkspaceOverviewPeriodFocus.svelte";
    import WorkspaceOverviewProjectPulse from "./WorkspaceOverviewProjectPulse.svelte";
    import WorkspaceOverviewQuickActions from "./WorkspaceOverviewQuickActions.svelte";
    import WorkspaceOverviewRecentRecords from "./WorkspaceOverviewRecentRecords.svelte";
    import WorkspaceOverviewStats from "./WorkspaceOverviewStats.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        onOpenTodayAndAppendTemplate: () => void | Promise<void>;
        onGoTasks: (statusFilter?: WorkspaceTaskStatusFilter) => void;
        onGoRecords: (options?: GoRecordsOptions) => void;
        onGoReview: () => void;
        onGoProjects: () => void;
        onGoNotifications: () => void;
        onGoPlans: () => void;
        onCreateTask: (input?: Partial<GenerateTasksPlusTaskInput>) => void;
        onCreateRecord: () => void;
        onToggleTask: (task: EnhancedDiaryWorkspaceTask) => void | Promise<void>;
        onOpenTask: (task: EnhancedDiaryWorkspaceTask) => void;
        onOpenProject: (targetId: string) => void;
        onOpenDoc: (docId?: string) => void;
        taskManagementEnabled?: boolean;
    }

    let {
        state,
        onOpenTodayAndAppendTemplate,
        onGoTasks,
        onGoRecords,
        onGoReview,
        onGoProjects,
        onGoNotifications,
        onGoPlans,
        onCreateTask,
        onCreateRecord,
        onToggleTask,
        onOpenTask,
        onOpenProject,
        onOpenDoc,
        taskManagementEnabled = true,
    }: Props = $props();

    function openRecord(record: EnhancedDiaryWorkspaceRecord): void {
        onGoRecords({ mode: "today", recordId: record.headingBlockId || record.id || "" });
    }
</script>

<div class="overview-dashboard">
    <WorkspaceOverviewStats
        {state}
        {taskManagementEnabled}
        {onGoTasks}
        onGoRecords={() => onGoRecords({ mode: "today" })}
        {onGoProjects}
        {onGoReview}
    />

    <WorkspaceOverviewPeriodFocus
        plans={state.carryoverPlans}
        onGoPlans={onGoPlans}
    />

    <div class="dashboard-body">
        <div class="main-column">
            {#if taskManagementEnabled}
                <WorkspaceOverviewFocus
                    {state}
                    {taskManagementEnabled}
                    {onToggleTask}
                    {onOpenTask}
                    onGoTasks={() => onGoTasks("active")}
                    onCreateTask={() => onCreateTask()}
                    {onCreateRecord}
                    {onOpenDoc}
                />
            {/if}
            <WorkspaceOverviewRecentRecords
                records={state.records}
                onOpenRecord={openRecord}
                onGoRecords={() => onGoRecords({ mode: "today" })}
                {onCreateRecord}
            />
        </div>
        <div class="side-column">
            <WorkspaceOverviewQuickActions
                onCreateTask={() => onCreateTask()}
                {onCreateRecord}
                onOpenAndAppendTemplate={onOpenTodayAndAppendTemplate}
                {onGoProjects}
                {taskManagementEnabled}
                todayDiaryExists={state.todayDiaryExists}
            />
            <WorkspaceOverviewAttention
                {state}
                {taskManagementEnabled}
                onGoOverdue={() => onGoTasks("overdue")}
                onGoMigrate={() => onGoTasks("migrate")}
                {onGoNotifications}
                {onGoReview}
            />
            <WorkspaceOverviewProjectPulse {state} {onOpenProject} {onGoProjects} />
        </div>
    </div>
</div>

<style>
    .overview-dashboard { display: grid; gap: var(--wk-gap-md); min-width: 0; }
    .dashboard-body { display: grid; grid-template-columns: minmax(0, 1fr) clamp(300px, 28%, 330px); align-items: start; gap: var(--wk-gap-md); min-width: 0; }
    .main-column, .side-column { display: grid; align-items: start; gap: var(--wk-gap-md); min-width: 0; }
    @container (max-width: 900px) { .dashboard-body { grid-template-columns: 1fr; } }
</style>
