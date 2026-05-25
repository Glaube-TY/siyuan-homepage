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
        onGoTasks: (statusFilter?: WorkspaceTaskStatusFilter) => void;
        onGoReview: () => void;
        onGoProjects: (statusFilter?: WorkspaceProjectStatusFilter) => void;
        onGoNotifications: () => void;
        onCreateTask: (input?: Partial<GenerateTasksPlusTaskInput>) => void;
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
        calendarDisplaySettings?: EnhancedDiaryWorkspaceCalendarSettings;
    }

    let {
        state,
        onOpenToday,
        onGoTasks,
        onGoReview,
        onGoProjects,
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
        calendarDisplaySettings,
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

    const riskyProjects = $derived(
        state.projects.filter((project) => project.healthTone === "danger" || project.healthTone === "warning")
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
                description: "暂无明显风险，可以继续记录过程或回到今日日记。",
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

    <div class="focus-card">
        <div class="focus-head">
            <div>
                <h2>今日作战台</h2>
                <p>根据现有任务、记录、项目和复盘状态推导，不自动写入内容。</p>
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

    <div class="carryover-card">
        <div class="carryover-head">
            <div>
                <h2>计划承接</h2>
                <p>读取上一周期复盘中的下一步计划，支持手动转为任务。</p>
            </div>
        </div>
        {#if state.carryoverPlans.length === 0}
            <div class="carryover-empty">
                暂无可承接计划。完成复盘后，这里会展示上一周期写下的下一步。
            </div>
        {:else}
            {#each state.carryoverPlans as plan}
                <div class="carryover-item">
                    <div class="carryover-item-head">
                        <span class="carryover-source">{plan.sourceLabel} · {plan.fieldLabel}</span>
                        <button
                            type="button"
                            class="btn-carryover-open"
                            onclick={() => onOpenDoc(plan.docId)}
                        >打开来源</button>
                    </div>
                    <div class="carryover-lines">
                        {#each plan.lines.slice(0, 3) as line}
                            <div class="carryover-line">
                                <span class="carryover-line-text">{line}</span>
                                <button
                                    type="button"
                                    class="btn-carryover-task"
                                    onclick={() => onCreateTask({ taskname: line, tags: ["计划承接", plan.periodLabel] })}
                                >转为任务</button>
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
        displaySettings={calendarDisplaySettings}
    />
</section>

<style>
    .dashboard {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .focus-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 16px;
    }

    .focus-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
    }

    .focus-head h2 {
        margin: 0 0 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .focus-head p {
        margin: 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.62;
    }

    .focus-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
    }

    .focus-item {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 11px 12px;
        text-align: left;
        cursor: pointer;
        transition: all 0.12s ease;
    }

    .focus-item:hover {
        border-color: var(--b3-theme-primary);
        transform: translateY(-1px);
    }

    .focus-item.tone-danger {
        border-left: 3px solid var(--b3-theme-error, #d32f2f);
    }

    .focus-item.tone-warning {
        border-left: 3px solid #e6900a;
    }

    .focus-item.tone-primary {
        border-left: 3px solid var(--b3-theme-primary);
    }

    .focus-icon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
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
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .focus-content small {
        margin-top: 2px;
        font-size: 12px;
        line-height: 1.45;
        color: var(--b3-theme-on-surface);
        opacity: 0.62;
    }

    .focus-action {
        font-size: 12px;
        color: var(--b3-theme-primary);
        white-space: nowrap;
        flex-shrink: 0;
    }

    .carryover-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 16px;
    }

    .carryover-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
    }

    .carryover-head h2 {
        margin: 0 0 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .carryover-head p {
        margin: 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.62;
    }

    .carryover-empty {
        padding: 16px;
        text-align: center;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
    }

    .carryover-item {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
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
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .btn-carryover-open {
        font-size: 11px;
        color: var(--b3-theme-primary);
        background: none;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        padding: 2px 8px;
        cursor: pointer;
    }

    .btn-carryover-open:hover {
        border-color: var(--b3-theme-primary);
    }

    .carryover-lines {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .carryover-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .carryover-line-text {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .btn-carryover-task {
        font-size: 11px;
        color: var(--b3-theme-primary);
        background: none;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        padding: 2px 8px;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .btn-carryover-task:hover {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
    }

    .carryover-more {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
        text-align: center;
        padding-top: 4px;
    }
</style>
