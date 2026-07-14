<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import type { WorkspaceTaskStatusFilter } from "../enhancedDiaryWorkspaceNavigation";
    import { isHighPriorityTask } from "../enhancedDiaryWorkspaceOverview";
    import WorkspaceOverviewIcon, { type WorkspaceOverviewIconName } from "./WorkspaceOverviewIcon.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        taskManagementEnabled?: boolean;
        onGoTasks: (filter?: WorkspaceTaskStatusFilter) => void;
        onGoRecords: () => void;
        onGoProjects: () => void;
        onGoReview: () => void;
    }
    interface StatCard { key: string; icon: WorkspaceOverviewIconName; value: number; label: string; detail: string; action: () => void; danger?: boolean; }

    let { state, taskManagementEnabled = true, onGoTasks, onGoRecords, onGoProjects, onGoReview }: Props = $props();
    const todayTasks = $derived(state.tasks.filter((task) => task.isTodayTask));
    const pendingTasks = $derived(state.tasks.filter((task) => !task.completed));
    const overdueTasks = $derived(state.tasks.filter((task) => !task.completed && task.isOverdue));
    const keyRecords = $derived(state.records.filter((record) => record.isKeyRecord).length);
    const pendingReviews = $derived(state.reviewCards.filter((card) => ["not_created", "missing_template", "pending", "overdue"].includes(card.status)).length);

    const cards = $derived.by((): StatCard[] => taskManagementEnabled ? [
        { key: "today", icon: "calendar" as const, value: todayTasks.length, label: "今日任务", detail: `已完成 ${todayTasks.filter((task) => task.completed).length} 条`, action: () => onGoTasks("today") },
        { key: "pending", icon: "tasks" as const, value: pendingTasks.length, label: "待完成", detail: `${pendingTasks.filter(isHighPriorityTask).length} 条高优先级`, action: () => onGoTasks("active") },
        { key: "overdue", icon: "clock" as const, value: overdueTasks.length, label: "已逾期", detail: overdueTasks.length ? `最早截止 ${[...overdueTasks].sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))[0]?.deadline || "待处理"}` : "当前没有逾期任务", action: () => onGoTasks("overdue"), danger: overdueTasks.length > 0 },
        { key: "records", icon: "record" as const, value: state.records.length, label: "今日记录", detail: `${keyRecords} 条关键记录`, action: onGoRecords },
    ] : [
        { key: "records", icon: "record" as const, value: state.records.length, label: "今日记录", detail: "今天已保存的内容", action: onGoRecords },
        { key: "key", icon: "star" as const, value: keyRecords, label: "关键记录", detail: "值得持续回看的内容", action: onGoRecords },
        { key: "projects", icon: "projects" as const, value: state.projects.length, label: "进行中项目", detail: `${state.projects.filter((project) => project.healthTone === "danger" || project.healthTone === "warning").length} 个需要关注`, action: onGoProjects },
        { key: "reviews", icon: "calendar" as const, value: pendingReviews, label: "待处理复盘", detail: pendingReviews ? "仍有复盘需要处理" : "复盘状态已清晰", action: onGoReview },
    ]);
</script>

<section class="wk-card stats-bar" aria-label="工作台核心数据">
    <div class="stats-units">
        {#each cards as card (card.key)}
            <button type="button" class="stat-unit" class:danger={card.danger} onclick={card.action}>
                <span class="stat-icon"><WorkspaceOverviewIcon name={card.icon} size={16} /></span>
                <div class="stat-copy">
                    <strong>{card.value}</strong>
                    <span class="stat-label">{card.label}</span>
                    <small>{card.detail}</small>
                </div>
            </button>
        {/each}
    </div>
</section>

<style>
    .stats-bar { min-width: 0; padding: 0; overflow: hidden; }
    .stats-units { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; min-width: 0; background: var(--wk-divider); }
    .stat-unit { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px 14px; border: 0; background: var(--wk-bg-card); color: var(--wk-ink-secondary); text-align: left; cursor: pointer; transition: background var(--wk-transition-fast); }
    .stat-unit:hover { background: var(--wk-surface-hover); }
    .stat-icon { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--wk-radius-sm); background: var(--wk-primary-subtle); color: var(--wk-primary); }
    .stat-copy { display: grid; gap: 1px; min-width: 0; }
    .stat-copy strong { color: var(--wk-ink); font: 650 26px/1 var(--wk-number-font); font-variant-numeric: tabular-nums; }
    .stat-label { color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); font-weight: 650; }
    .stat-copy small { overflow: hidden; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); text-overflow: ellipsis; white-space: nowrap; }
    .stat-unit.danger .stat-icon { background: var(--wk-error-bg); color: var(--wk-error); }
    .stat-unit.danger .stat-copy strong { color: var(--wk-error); }
    @container (max-width: 820px) { .stats-units { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @container (max-width: 460px) { .stats-units { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { .stat-unit { transition: none; } }
</style>
