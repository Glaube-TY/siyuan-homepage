<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";
    import type { WorkspaceTaskStatusFilter, WorkspaceProjectStatusFilter } from "../enhancedDiaryWorkspaceNavigation";
    import type { EnhancedDiaryWorkspaceCalendarSettings } from "../../enhancedDiaryTypes";
    import type { GenerateTasksPlusTaskInput } from "../../../tasksPlus/tasksPlusParser";
    import WorkspaceOverviewTodayCard from "./WorkspaceOverviewTodayCard.svelte";
    import WorkspaceOverviewQuickActions from "./WorkspaceOverviewQuickActions.svelte";
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
        onCreateTask: (input?: Partial<GenerateTasksPlusTaskInput>) => void;
        onCreateRecord: () => void;
        calendarDays: EnhancedDiaryCalendarDay[];
        calendarDate: Date;
        calendarLoading: boolean;
        selectedCalendarDate: string;
        onSelectDate: (day: EnhancedDiaryCalendarDay) => void;
        onPrevMonth: () => void | Promise<void>;
        onNextMonth: () => void | Promise<void>;
        onOpenDoc: (docId?: string) => void;
        onCalendarToday: () => void | Promise<void>;
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
        onCreateTask,
        onCreateRecord,
        calendarDays,
        calendarDate,
        calendarLoading,
        selectedCalendarDate,
        onSelectDate,
        onPrevMonth,
        onNextMonth,
        onOpenDoc,
        onCalendarToday,
        calendarDisplaySettings,
        taskManagementEnabled = true,
    }: Props = $props();

    const overdueTasks = $derived(taskManagementEnabled ? state.tasks.filter((task) => task.isOverdue).slice(0, 5) : []);
    const migrateTasks = $derived(taskManagementEnabled ? state.tasks.filter((task) => task.shouldMigrate).slice(0, 5) : []);
    const pendingReviewCards = $derived(
        state.reviewCards.filter((card) => ["not_created", "missing_template", "pending", "overdue"].includes(card.status))
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
        if (state.summary.projectCount > 0) {
            items.push({
                type: "project_progress",
                title: "项目总览",
                content: `当前配置 ${state.summary.projectCount} 个根项目`,
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
    <div class="dashboard-main">
        <WorkspaceOverviewTodayCard
            {state}
            {taskManagementEnabled}
            onOpenAndAppendTemplate={onOpenTodayAndAppendTemplate}
        />

        <div class="wk-card focus-card">
            <div class="wk-card-head focus-head">
                <div>
                    <h2 class="wk-card-title">先做这些</h2>
                    <p class="wk-card-subtitle">{taskManagementEnabled ? "今天最值得先处理的几件事。" : "今天值得先记下和回顾的内容。"}</p>
                </div>
            </div>
            <div class="focus-list">
                {#each focusItems as item}
                    <button
                        type="button"
                        class="focus-item tone-{item.tone}"
                        onclick={() => runFocusAction(item.action)}
                    >
                        <span class="focus-dot" aria-hidden="true"></span>
                        <span class="focus-icon"><WorkspaceIcon name={item.icon} size={16} /></span>
                        <span class="focus-content">
                            <strong>{item.title}</strong>
                            <small>{item.description}</small>
                        </span>
                        <span class="focus-action">{item.actionLabel} →</span>
                    </button>
                {/each}
            </div>
        </div>

        <WorkspaceOverviewTimeline items={timelineItems} />
    </div>

    <aside class="dashboard-side">
        <WorkspaceOverviewQuickActions
            {onCreateTask}
            {onCreateRecord}
            onOpenAndAppendTemplate={onOpenTodayAndAppendTemplate}
            {onGoReview}
            {taskManagementEnabled}
        />

        <div class="wk-card carryover-card">
            <div class="wk-card-head carryover-head">
                <div>
                    <h2 class="wk-card-title">下一步</h2>
                </div>
            </div>
            {#if state.carryoverPlans.length === 0}
                <p class="carryover-empty-line">暂无承接计划，可在日记中添加「下一步」字段。</p>
            {:else}
                {#each state.carryoverPlans as plan}
                    <div class="carryover-item">
                        <div class="carryover-item-head">
                            <span class="carryover-source">{plan.sourceLabel} · {plan.fieldLabel}</span>
                            <button
                                type="button"
                                class="wk-btn wk-btn-ghost wk-btn-sm"
                                onclick={() => onOpenDoc(plan.docId)}
                            >打开</button>
                        </div>
                        <div class="carryover-lines">
                            {#each plan.lines.slice(0, 3) as line}
                                <div class="carryover-line">
                                    <span class="carryover-line-text">{line}</span>
                                    {#if taskManagementEnabled}
                                        <button
                                            type="button"
                                            class="wk-btn wk-btn-ghost wk-btn-sm"
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

        <WorkspaceOverviewCalendarSection
            {calendarDays}
            {calendarDate}
            {calendarLoading}
            {selectedCalendarDate}
            {onSelectDate}
            {onPrevMonth}
            {onNextMonth}
            onCalendarToday={onCalendarToday}
            displaySettings={calendarDisplaySettings}
            {taskManagementEnabled}
        />
    </aside>
</section>

<style>
    .dashboard {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(260px, .72fr);
        gap: 22px;
        align-items: start;
    }

    .dashboard-main {
        display: flex;
        flex-direction: column;
        gap: 20px;
        min-width: 0;
    }

    .dashboard-side {
        display: flex;
        flex-direction: column;
        gap: 20px;
        min-width: 0;
    }

    .focus-head,
    .carryover-head {
        margin-bottom: 0;
    }

    .focus-list {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-xs);
    }

    .focus-item {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: var(--wk-gap-sm);
        border: 1px solid transparent;
        border-radius: var(--wk-radius-md);
        background: color-mix(in srgb, var(--wk-bg-card) 76%, transparent);
        color: var(--wk-ink);
        padding: 13px 14px;
        text-align: left;
        cursor: pointer;
        transition: border-color var(--wk-transition-fast), box-shadow var(--wk-transition-fast), transform var(--wk-transition-fast);
    }

    .focus-item:hover {
        border-color: var(--wk-primary-border);
        background: var(--wk-surface-hover);
        box-shadow: none;
        transform: translateY(-1px);
    }

    .focus-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--wk-ink-muted);
        transition: background var(--wk-transition-fast);
    }

    .focus-item.tone-danger .focus-dot { background: var(--wk-error); }
    .focus-item.tone-warning .focus-dot { background: var(--wk-warning); }
    .focus-item.tone-primary .focus-dot { background: var(--wk-primary); }

    .focus-icon {
        width: 28px;
        height: 28px;
        border-radius: var(--wk-radius-sm);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--wk-primary-subtle);
        color: var(--wk-primary);
        flex-shrink: 0;
        font-size: 16px;
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
        font-weight: 500;
    }

    .carryover-empty-line {
        margin: 0;
        padding: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .carryover-item {
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-bg-card);
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
        margin-bottom: 6px;
    }

    .carryover-source {
        font-size: var(--wk-text-sm);
        font-weight: 600;
        color: var(--wk-ink-muted);
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

    @container (max-width: 980px) {
        .dashboard {
            grid-template-columns: 1fr;
        }

        .dashboard-side {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
    }

    @container (max-width: 620px) {
        .focus-item { align-items: flex-start; }
        .focus-action { display: none; }
        .focus-content strong { white-space: normal; }
    }
</style>
