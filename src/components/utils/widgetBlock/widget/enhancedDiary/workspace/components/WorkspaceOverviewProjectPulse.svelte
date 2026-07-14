<script lang="ts">
    import type { EnhancedDiaryWorkspaceProject, EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import { selectOverviewFocusTasks, sortOverviewProjects } from "../enhancedDiaryWorkspaceOverview";
    import WorkspaceOverviewIcon from "./WorkspaceOverviewIcon.svelte";

    interface Props { state: EnhancedDiaryWorkspaceState; onOpenProject: (targetId: string) => void; onGoProjects: () => void; }
    let { state, onOpenProject, onGoProjects }: Props = $props();
    const projects = $derived(sortOverviewProjects(state.projects).slice(0, 3));

    function completion(project: EnhancedDiaryWorkspaceProject): number {
        return project.taskCount ? Math.round((project.taskCount - project.openTaskCount) / project.taskCount * 100) : 0;
    }
    function nextStep(project: EnhancedDiaryWorkspaceProject): string {
        const task = selectOverviewFocusTasks(state.tasks.filter((item) => item.projectTargetId === project.targetId || item.projectAncestorTargetIds?.includes(project.targetId)))[0];
        return task?.taskname || project.progressMarkdown?.trim() || "暂无明确下一步";
    }
    function lastActivity(project: EnhancedDiaryWorkspaceProject): string {
        return project.lastActivityDate ? `最近活动 ${project.lastActivityDate}` : "暂无活动记录";
    }
</script>

<section class="wk-card pulse-card">
    <header><div><span><WorkspaceOverviewIcon name="activity" size={15} />项目脉搏</span><h2>进行中的根项目</h2></div></header>
    {#if projects.length}
        <div class="project-list">
            {#each projects as project (project.targetId)}
                <button type="button" class="project-row" onclick={() => onOpenProject(project.targetId)}>
                    <div class="row-head">
                        <div class="project-name">
                            <strong title={project.name}>{project.name}</strong>
                            <span class:danger={project.healthTone === "danger"} class:warning={project.healthTone === "warning"}>{project.healthLabel}</span>
                        </div>
                    </div>
                    <div class="row-metrics">
                        <span><b>{project.openTaskCount}</b> 待完成</span>
                        <span class:danger={project.overdueTaskCount > 0}><b>{project.overdueTaskCount}</b> 逾期</span>
                        <span><b>{project.recordCount}</b> 记录</span>
                    </div>
                    <div class="row-progress">
                        {#if project.taskCount}
                            <span class="progress"><span class:danger={project.healthTone === "danger"} style={`width: ${completion(project)}%`}></span></span>
                            <b>{completion(project)}%</b>
                        {:else}
                            <span class="no-task">暂无任务</span>
                        {/if}
                    </div>
                    <div class="foot">
                        <p class="next-step" title={nextStep(project)}><WorkspaceOverviewIcon name="target" size={12} />{nextStep(project)}</p>
                        <p class="last-activity" title={lastActivity(project)}><WorkspaceOverviewIcon name="activity" size={12} />{lastActivity(project)}</p>
                    </div>
                </button>
            {/each}
        </div>
        <button type="button" class="footer-action" onclick={onGoProjects}>查看全部项目 <WorkspaceOverviewIcon name="arrow" size={14} /></button>
    {:else}
        <div class="empty"><WorkspaceOverviewIcon name="projects" size={25} /><strong>当前没有进行中项目</strong><button type="button" onclick={onGoProjects}>进入项目中心</button></div>
    {/if}
</section>

<style>
    .pulse-card { min-width: 0; padding: 20px; }
    header { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    header span { display: inline-flex; align-items: center; gap: 6px; color: var(--wk-primary); font-size: var(--wk-text-xs); font-weight: 650; }
    h2 { margin: 4px 0 0; color: var(--wk-ink); font-size: var(--wk-text-lg); }
    .project-list { display: grid; gap: 8px; min-width: 0; }
    .project-row { display: grid; gap: 6px; min-width: 0; padding: 10px; border: 1px solid var(--wk-border-light); border-radius: var(--wk-radius-md); background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; transition: border-color var(--wk-transition-fast), background var(--wk-transition-fast), transform var(--wk-transition-fast); }
    .project-row:hover { border-color: var(--wk-primary-border); background: var(--wk-surface-hover); transform: translateY(-1px); }
    .row-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .project-name { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
    .project-name strong { overflow: hidden; flex: 1 1 auto; min-width: 0; color: var(--wk-ink); font-size: var(--wk-text-sm); text-overflow: ellipsis; white-space: nowrap; }
    .project-name span { flex-shrink: 0; padding: 1px 5px; border-radius: var(--wk-radius-pill); background: var(--wk-primary-subtle); color: var(--wk-primary); font-size: var(--wk-text-xs); }
    .project-name span.warning { background: var(--wk-warning-bg); color: var(--wk-warning); }
    .project-name span.danger { background: var(--wk-error-bg); color: var(--wk-error); }
    .row-metrics { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .row-metrics b { color: var(--wk-ink-secondary); font-family: var(--wk-number-font); }
    .row-metrics .danger, .row-metrics .danger b { color: var(--wk-error); }
    .row-progress { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .row-progress b { flex-shrink: 0; color: var(--wk-ink-secondary); font: 600 var(--wk-text-xs) var(--wk-number-font); }
    .progress { flex: 1 1 auto; height: 3px; overflow: hidden; border-radius: var(--wk-radius-pill); background: var(--wk-surface-2); }
    .progress > span { display: block; height: 100%; background: var(--wk-primary); }
    .progress > span.danger { background: var(--wk-error); }
    .no-task { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .foot { display: grid; gap: 2px; min-width: 0; }
    .next-step, .last-activity { display: flex; align-items: center; gap: 4px; min-width: 0; margin: 0; overflow: hidden; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); text-overflow: ellipsis; white-space: nowrap; }
    .next-step :global(svg), .last-activity :global(svg) { flex-shrink: 0; }
    .footer-action, .empty button { display: inline-flex; align-items: center; gap: 4px; padding: 3px 0; border: 0; background: transparent; color: var(--wk-primary); font-size: var(--wk-text-xs); cursor: pointer; }
    .footer-action { margin-top: 10px; margin-left: auto; }
    .empty { display: grid; justify-items: center; gap: 8px; padding: 24px 8px; color: var(--wk-ink-muted); text-align: center; }
    .empty strong { color: var(--wk-ink-secondary); }
    @media (prefers-reduced-motion: reduce) { .project-row { transition: none; } }
</style>
