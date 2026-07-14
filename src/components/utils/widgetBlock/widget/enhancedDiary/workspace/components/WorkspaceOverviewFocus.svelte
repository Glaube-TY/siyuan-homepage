<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import { selectOverviewFocusTasks, taskDateLabel, taskPriorityLabel } from "../enhancedDiaryWorkspaceOverview";
    import WorkspaceOverviewIcon from "./WorkspaceOverviewIcon.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        taskManagementEnabled?: boolean;
        onToggleTask: (task: EnhancedDiaryWorkspaceTask) => void | Promise<void>;
        onOpenTask: (task: EnhancedDiaryWorkspaceTask) => void;
        onGoTasks: () => void;
        onCreateTask: () => void;
        onCreateRecord: () => void;
        onOpenDoc: (docId?: string) => void;
    }

    let { state, taskManagementEnabled = true, onToggleTask, onOpenTask, onGoTasks, onCreateTask, onCreateRecord, onOpenDoc }: Props = $props();
    const focusTasks = $derived(selectOverviewFocusTasks(state.tasks));
    const pendingTaskCount = $derived(state.tasks.filter((task) => !task.completed).length);
</script>

<section class="wk-card focus-card">
    <header>
        <div><span class="eyebrow"><WorkspaceOverviewIcon name="target" size={15} />今日焦点</span><h2>{taskManagementEnabled ? "优先推进这些任务" : "今日安排"}</h2></div>
        {#if taskManagementEnabled}<span class="count">显示 {focusTasks.length} / 共 {pendingTaskCount}</span>{/if}
    </header>

    {#if taskManagementEnabled}
        {#if focusTasks.length}
            <div class="task-list">
                {#each focusTasks as task (task.blockId)}
                    <article class="task-row">
                        <input type="checkbox" checked={task.completed} aria-label={`完成任务：${task.taskname}`} title="完成任务" onchange={() => void onToggleTask(task)} />
                        <button type="button" class="task-body" onclick={() => onOpenTask(task)}>
                            <strong title={task.taskname}>{task.taskname}</strong>
                            <span class="task-meta">
                                <span class:danger={task.isOverdue}>{taskDateLabel(task)}{task.isOverdue ? " · 已逾期" : ""}</span>
                                {#if task.priority}<span>{taskPriorityLabel(task.priority)}</span>{/if}
                                {#if task.projectPath?.length}<span class="project-path" title={task.projectPath.join(" / ")}><WorkspaceOverviewIcon name="folder" size={13} />{task.projectPath.join(" / ")}</span>{/if}
                            </span>
                        </button>
                    </article>
                {/each}
            </div>
            <button type="button" class="footer-action" onclick={onGoTasks}>查看全部任务 <WorkspaceOverviewIcon name="arrow" size={15} /></button>
        {:else}
            <div class="empty"><WorkspaceOverviewIcon name="check" size={27} /><strong>当前没有待处理任务</strong><button type="button" onclick={onCreateTask}>新建任务</button></div>
        {/if}
    {:else if state.carryoverPlans.length}
        <div class="plan-list">
            {#each state.carryoverPlans.slice(0, 3) as plan (`${plan.period}-${plan.sourceDateOrRange}`)}
                <article>
                    <div><strong>{plan.sourceLabel} · {plan.fieldLabel}</strong><small>{plan.sourceDateOrRange}</small></div>
                    {#each plan.lines.slice(0, 2) as line}<p title={line}>{line}</p>{/each}
                    {#if plan.docId}<button type="button" onclick={() => onOpenDoc(plan.docId)}>打开原文 <WorkspaceOverviewIcon name="arrow" size={14} /></button>{/if}
                </article>
            {/each}
        </div>
    {:else}
        <div class="empty"><WorkspaceOverviewIcon name="recordAdd" size={27} /><strong>今天还没有承接计划</strong><span>先记下下一步，稍后再整理。</span><button type="button" onclick={onCreateRecord}>快速记录</button></div>
    {/if}
</section>

<style>
    .focus-card { min-width: 0; padding: 20px; }
    header { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    h2 { margin: 4px 0 0; color: var(--wk-ink); font-size: var(--wk-text-lg); }
    .eyebrow { display: inline-flex; align-items: center; gap: 6px; color: var(--wk-primary); font-size: var(--wk-text-xs); font-weight: 650; }
    .count { color: var(--wk-ink-muted); font: 600 var(--wk-text-xs) var(--wk-number-font); }
    .task-list, .plan-list { display: grid; gap: 4px; min-width: 0; }
    .task-row { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: start; gap: 10px; min-width: 0; padding: 10px 8px; border-bottom: 1px solid var(--wk-divider); }
    .task-row:last-child { border-bottom: 0; }
    input { width: 15px; height: 15px; margin: 3px 0 0; accent-color: var(--wk-primary); cursor: pointer; }
    .task-body { display: grid; gap: 5px; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .task-body strong { overflow: hidden; font-size: var(--wk-text-base); text-overflow: ellipsis; white-space: nowrap; }
    .task-body:hover strong { color: var(--wk-primary); }
    .task-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 12px; min-width: 0; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .task-meta > span { min-width: 0; }
    .project-path { display: inline-flex; align-items: center; gap: 4px; max-width: min(100%, 360px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .danger { color: var(--wk-error); }
    .footer-action, .plan-list button, .empty button { display: inline-flex; align-items: center; gap: 5px; width: max-content; min-height: 30px; padding: 4px 0; border: 0; background: transparent; color: var(--wk-primary); font-size: var(--wk-text-sm); cursor: pointer; }
    .footer-action { margin-top: 10px; margin-left: auto; }
    .empty { display: grid; justify-items: center; gap: 7px; padding: 20px 10px 10px; color: var(--wk-ink-muted); text-align: center; }
    .empty strong { color: var(--wk-ink-secondary); }
    .empty span { font-size: var(--wk-text-sm); }
    .plan-list article { display: grid; gap: 7px; min-width: 0; padding: 10px; border: 1px solid var(--wk-border-light); border-radius: var(--wk-radius-md); }
    .plan-list article > div { display: flex; justify-content: space-between; gap: 8px; min-width: 0; }
    .plan-list small { color: var(--wk-ink-muted); }
    .plan-list p { margin: 0; overflow: hidden; color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); text-overflow: ellipsis; white-space: nowrap; }
    @container (max-width: 520px) { .task-meta { display: grid; gap: 4px; } .project-path { max-width: 100%; } }
</style>
