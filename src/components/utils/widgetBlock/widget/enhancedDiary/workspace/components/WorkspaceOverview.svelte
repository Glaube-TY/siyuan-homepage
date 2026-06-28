<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { EnhancedDiaryWorkspaceDayDetail } from "../enhancedDiaryWorkspaceDayDetail";
    import type { WorkspaceTaskStatusFilter, WorkspaceProjectStatusFilter } from "../enhancedDiaryWorkspaceNavigation";
    import type { EnhancedDiaryWorkspaceCalendarSettings } from "../../enhancedDiaryTypes";
    import type { GenerateTasksPlusTaskInput } from "../../../tasksPlus/tasksPlusParser";
    import WorkspaceOverviewTodayCard from "./WorkspaceOverviewTodayCard.svelte";
    import WorkspaceOverviewQuickActions from "./WorkspaceOverviewQuickActions.svelte";
    import WorkspaceOverviewActionList from "./WorkspaceOverviewActionList.svelte";
    import WorkspaceOverviewTimeline from "./WorkspaceOverviewTimeline.svelte";
    import type { TimelineItem } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceOverviewCalendarSection from "./WorkspaceOverviewCalendarSection.svelte";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    type FocusAction = "overdue" | "migrate" | "record" | "review" | "projects" | "today";

    interface FocusItem {
        key: string;
        icon: string;
        title: string;
        description: string;
        actionLabel: string;
        tone: "danger" | "warning" | "primary" | "normal";
        action: FocusAction;
    }

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        onOpenToday: () => void | Promise<void>;
        onOpenTodayAndAppendTemplate: () => void | Promise<void>;
        onGoTasks: (statusFilter?: WorkspaceTaskStatusFilter) => void;
        onGoReview: () => void;
        onGoProjects: (statusFilter?: WorkspaceProjectStatusFilter) => void;
        onGoNotifications: () => void;
        onCreateTask: (input?: Partial<GenerateTasksPlusTaskInput>) => void;
        onCreateRecord: () => void;
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
        calendarDisplaySettings?: EnhancedDiaryWorkspaceCalendarSettings;
        taskManagementEnabled?: boolean;
    }

    let {
        state,
        onOpenToday,
        onOpenTodayAndAppendTemplate,
        onGoTasks,
        onGoReview,
        onGoProjects,
        onGoNotifications,
        onCreateTask,
        onCreateRecord,
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
        calendarDisplaySettings,
        taskManagementEnabled = true,
    }: Props = $props();

    const overdueTasks = $derived(taskManagementEnabled ? state.tasks.filter((task) => task.isOverdue).slice(0, 5) : []);
    const migrateTasks = $derived(taskManagementEnabled ? state.tasks.filter((task) => task.shouldMigrate).slice(0, 5) : []);
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

    const riskyProjects = $derived(
        taskManagementEnabled
            ? state.projects.filter((project) => project.healthTone === "danger" || project.healthTone === "warning")
            : []
    );

    const focusItems = $derived.by((): FocusItem[] => {
        const items: FocusItem[] = [];
        if (overdueTasks.length > 0) {
            items.push({
                key: "overdue",
                icon: "warning",
                title: `先处理 ${overdueTasks.length} 个逾期任务`,
                description: "这些任务已经超过截止日期，适合作为今天第一优先级。",
                actionLabel: "查看逾期",
                tone: "danger",
                action: "overdue",
            });
        }
        if (migrateTasks.length > 0) {
            items.push({
                key: "migrate",
                icon: "migrate",
                title: `${migrateTasks.length} 个任务建议迁移`,
                description: "历史任务长期未推进，可以迁移到今天重新进入视野。",
                actionLabel: "查看建议迁移",
                tone: "warning",
                action: "migrate",
            });
        }
        if (state.summary.quickRecordCount === 0) {
            items.push({
                key: "record",
                icon: "records",
                title: "今天还没有过程记录",
                description: "补一条快速记录，给今天的推进留下可回看的线索。",
                actionLabel: "快速记录",
                tone: "primary",
                action: "record",
            });
        }
        if (pendingReviewCards.length > 0) {
            items.push({
                key: "review",
                icon: "review",
                title: "复盘还有待处理项",
                description: `${pendingReviewCards.length} 个复盘状态需要确认，适合在收尾时处理。`,
                actionLabel: "去复盘",
                tone: "normal",
                action: "review",
            });
        }
        if (riskyProjects.length > 0) {
            items.push({
                key: "projects",
                icon: "projects",
                title: `${riskyProjects.length} 个项目需要关注`,
                description: "存在逾期、堆积或停滞迹象，可以进入项目中心查看健康度。",
                actionLabel: "看项目",
                tone: "warning",
                action: "projects",
            });
        }
        if (items.length === 0) {
            items.push({
                key: "steady",
                icon: "diary",
                title: "今天的节奏很稳",
                description: "目前状态平稳，适合继续记录或回到日记。",
                actionLabel: "打开日记",
                tone: "normal",
                action: "today",
            });
        }
        return items.slice(0, 5);
    });

    function runFocusAction(action: FocusAction): void | Promise<void> {
        if (action === "overdue") return onGoTasks("overdue");
        if (action === "migrate") return onGoTasks("migrate");
        if (action === "record") return onCreateRecord();
        if (action === "review") return onGoReview();
        if (action === "projects") return onGoProjects("risk");
        return onOpenToday();
    }

    const timelineItems = $derived.by((): TimelineItem[] => {
        const items: TimelineItem[] = [];
        if (taskManagementEnabled && state.summary.newTaskCount > 0) {
            items.push({
                type: "new_task",
                title: "新建任务",
                content: `今日新增 ${state.summary.newTaskCount} 个任务`,
                date: state.today,
            });
        }
        if (taskManagementEnabled && state.summary.migratedTaskCount > 0) {
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
        if (taskManagementEnabled && state.summary.projectCount > 0) {
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
        {taskManagementEnabled}
        onOpenAndAppendTemplate={onOpenTodayAndAppendTemplate}
    />

    <div class="wk-card focus-card">
        <div class="wk-card-head focus-head">
            <div>
                <h2 class="wk-card-title">今日作战台</h2>
                <p class="wk-card-subtitle">{taskManagementEnabled ? "从任务、记录、项目和复盘中归纳出的今日重点。" : "从记录和复盘中归纳出的今日重点。"}</p>
            </div>
        </div>
        <div class="focus-list">
            {#each focusItems as item}
                <button
                    type="button"
                    class="focus-item tone-{item.tone}"
                    onclick={() => runFocusAction(item.action)}
                >
                    <span class="focus-icon"><WorkspaceIcon name={item.icon} size={18} /></span>
                    <span class="focus-content">
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                    </span>
                    <span class="focus-action">{item.actionLabel}</span>
                </button>
            {/each}
        </div>
    </div>

    <div class="wk-card carryover-card">
        <div class="wk-card-head carryover-head">
            <div>
                <h2 class="wk-card-title">计划承接</h2>
                <p class="wk-card-subtitle">{taskManagementEnabled ? "读取上一周期复盘中的下一步计划，支持手动转为任务。" : "读取上一周期复盘中的下一步计划。"}</p>
            </div>
        </div>
        {#if state.carryoverPlans.length === 0}
            <div class="wk-empty carryover-empty">
                还没有从上周期承接的计划。完成复盘后，这里会显示下一步。
            </div>
        {:else}
            {#each state.carryoverPlans as plan}
                <div class="carryover-item">
                    <div class="carryover-item-head">
                        <span class="carryover-source">{plan.sourceLabel} · {plan.fieldLabel}</span>
                        <button
                            type="button"
                            class="wk-btn wk-btn-ghost wk-btn-sm"
                            onclick={() => onOpenDoc(plan.docId)}
                        >打开来源</button>
                    </div>
                    <div class="carryover-lines">
                        {#each plan.lines.slice(0, 3) as line}
                            <div class="carryover-line">
                                <span class="carryover-line-text">{line}</span>
                                {#if taskManagementEnabled}
                                    <button
                                        type="button"
                                        class="wk-btn wk-btn-secondary wk-btn-sm"
                                        onclick={() => onCreateTask({ taskname: line, tags: ["计划承接", plan.periodLabel] })}
                                    >转为任务</button>
                                {/if}
                            </div>
                        {/each}
                        {#if plan.lines.length > 3}
                            <div class="carryover-more">还有 {plan.lines.length - 3} 条</div>
                        {/if}
                    </div>
                </div>
            {/each}
        {/if}
    </div>

    <WorkspaceOverviewQuickActions
        {onCreateTask}
        {onCreateRecord}
        onOpenAndAppendTemplate={onOpenTodayAndAppendTemplate}
        {onGoReview}
        {taskManagementEnabled}
    />

    <WorkspaceOverviewActionList
        {hasActionItems}
        {hasNoDiaryReminder}
        {hasTemplateMissing}
        overdueTasks={overdueTasks}
        migrateTasks={migrateTasks}
        pendingReviewCards={pendingReviewCards}
        onOpenAndAppendTemplate={onOpenTodayAndAppendTemplate}
        {onGoTasks}
        {onGoReview}
        {onGoNotifications}
        {taskManagementEnabled}
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
        displaySettings={calendarDisplaySettings}
        {taskManagementEnabled}
    />
</section>

<style>
    .dashboard {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-md);
    }

    .focus-head,
    .carryover-head {
        margin-bottom: 0;
    }

    .focus-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--wk-gap-sm);
    }

    .focus-item {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: var(--wk-gap-sm);
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-md);
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 11px 12px;
        text-align: left;
        cursor: pointer;
        transition: border-color var(--wk-transition-fast), box-shadow var(--wk-transition-fast), transform var(--wk-transition-fast);
    }

    .focus-item:hover {
        border-color: var(--wk-primary);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        transform: translateY(-1px);
    }

    .focus-item.tone-danger {
        border-left: 3px solid var(--wk-error);
    }

    .focus-item.tone-warning {
        border-left: 3px solid var(--wk-warning);
    }

    .focus-item.tone-primary {
        border-left: 3px solid var(--wk-primary);
    }

    .focus-icon {
        width: 30px;
        height: 30px;
        border-radius: var(--wk-radius-sm);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
        flex-shrink: 0;
    }

    .focus-content {
        min-width: 0;
        flex: 1;
    }

    .focus-content strong,
    .focus-content small {
        display: block;
    }

    .focus-content strong {
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .focus-content small {
        margin-top: 2px;
        font-size: var(--wk-text-sm);
        line-height: 1.45;
        color: var(--wk-ink-muted);
    }

    .focus-action {
        font-size: var(--wk-text-sm);
        color: var(--wk-primary);
        white-space: nowrap;
        flex-shrink: 0;
    }

    .carryover-empty {
        padding: var(--wk-gap-md);
    }

    .carryover-item {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        padding: 10px 12px;
        margin-bottom: 8px;
    }

    .carryover-item:last-child {
        margin-bottom: 0;
    }

    .carryover-item-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .carryover-source {
        font-size: var(--wk-text-sm);
        font-weight: 600;
        color: var(--wk-ink-secondary);
    }

    .carryover-lines {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-xs);
    }

    .carryover-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--wk-gap-sm);
    }

    .carryover-line-text {
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .carryover-more {
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-faint);
        text-align: center;
        padding-top: 4px;
    }
</style>
