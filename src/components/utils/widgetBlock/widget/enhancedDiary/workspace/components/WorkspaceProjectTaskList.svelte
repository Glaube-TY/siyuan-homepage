<script lang="ts">
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import {
        relativeProjectSourcePath,
        type ProjectTaskViewFilter,
    } from "../enhancedDiaryWorkspaceProjectAnalytics";
    import WorkspaceProjectIcon from "./WorkspaceProjectIcon.svelte";
    import {
        buildWorkspaceTaskViewModels,
        formatWorkspaceTaskSchedule,
    } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskIcon from "./WorkspaceTaskIcon.svelte";

    interface Props {
        tasks: EnhancedDiaryWorkspaceTask[];
        projectTitle: string;
        currentTargetId: string;
        currentTargetPath: string[];
        taskManagementEnabled?: boolean;
        viewFilter?: ProjectTaskViewFilter;
        onFilterChange?: (filter: ProjectTaskViewFilter) => void;
        onCreate?: () => void;
        onToggle: (task: EnhancedDiaryWorkspaceTask) => void | Promise<void>;
        onEdit: (task: EnhancedDiaryWorkspaceTask) => void;
        onDelete: (task: EnhancedDiaryWorkspaceTask) => void;
        onOpen: (task: EnhancedDiaryWorkspaceTask) => void;
        onOpenProject: (targetId: string) => void | Promise<void>;
    }

    let {
        tasks,
        projectTitle,
        currentTargetId,
        currentTargetPath,
        taskManagementEnabled = true,
        viewFilter = "all",
        onFilterChange,
        onCreate,
        onToggle,
        onEdit,
        onDelete,
        onOpen,
        onOpenProject,
    }: Props = $props();

    const modelById = $derived(new Map(buildWorkspaceTaskViewModels(tasks).map((model) => [model.task.blockId, model])));
</script>

<div class="project-list-filter wk-segmented" aria-label="任务状态筛选">
    {#each [["all", "全部"], ["pending", "待完成"], ["completed", "已完成"], ["overdue", "逾期"]] as option}
        <button type="button" class="wk-segmented-item" class:active={viewFilter === option[0]} onclick={() => onFilterChange?.(option[0] as ProjectTaskViewFilter)}>{option[1]}</button>
    {/each}
</div>

{#if tasks.length}
    <div class="project-task-list">
        {#each tasks as task (task.blockId)}
            {@const model = modelById.get(task.blockId)!}
            {@const sourcePath = task.projectTargetId && task.projectTargetId !== currentTargetId
                ? relativeProjectSourcePath(task.projectPath, currentTargetPath)
                : []}
            <article class="project-task-item" class:completed={task.completed}>
                <input
                    class="task-status-checkbox"
                    type="checkbox"
                    checked={task.completed}
                    aria-label={task.completed ? "取消完成" : "完成任务"}
                    title={task.completed ? "取消完成" : "完成任务"}
                    onclick={(event) => event.stopPropagation()}
                    onchange={() => void onToggle(task)}
                />
                <button type="button" class="task-body" onclick={() => onOpen(task)}>
                    <strong>{task.taskname}</strong>
                    <span class="task-meta">
                        <span class:danger={model.isOverdue}><WorkspaceTaskIcon name={model.isOverdue ? "overdue" : model.scheduleKind === "none" ? "unscheduled" : "range"} />{formatWorkspaceTaskSchedule(model)}</span>
                        {#if model.priorityLevel}<span>{model.priorityLabel}</span>{/if}
                        {#if task.projectPath?.length}<span><WorkspaceTaskIcon name="project" />{model.projectPathLabel}</span>{/if}
                    </span>
                    {#if task.tags.length}
                        <span class="chip-row">{#each task.tags as tag}<span class="wk-chip">#{tag}#</span>{/each}</span>
                    {/if}
                    {#if sourcePath.length}
                        <span class="project-source"><WorkspaceProjectIcon name="tree" size={15} /><span>来自：{sourcePath.join(" / ")}</span></span>
                    {/if}
                </button>
                <div class="task-actions">
                    {#if sourcePath.length && task.projectTargetId}
                        <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => void onOpenProject(task.projectTargetId!)}><WorkspaceProjectIcon name="open" />进入所属项目</button>
                    {/if}
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => onEdit(task)}><WorkspaceProjectIcon name="edit" />编辑</button>
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => onEdit(task)}><WorkspaceProjectIcon name="tree" />调整归属</button>
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => onOpen(task)}><WorkspaceProjectIcon name="locate" />定位原文</button>
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm danger" onclick={() => onDelete(task)}><WorkspaceProjectIcon name="delete" />删除</button>
                </div>
            </article>
        {/each}
    </div>
{:else}
    <div class="project-list-empty">
        <strong>暂无“{projectTitle}”的项目任务</strong>
        <span>任务仍保存在日记中，创建时会自动关联当前项目。</span>
        {#if taskManagementEnabled && onCreate}<button type="button" class="wk-btn wk-btn-primary" onclick={onCreate}><WorkspaceProjectIcon name="taskAdd" />新建任务</button>{/if}
    </div>
{/if}

<style>
    .project-task-list { display: grid; gap: 8px; min-width: 0; }
    .project-list-filter { justify-self: start; margin-bottom: 9px; }
    .project-task-item { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: start; gap: 8px; padding: 10px; border: 1px solid var(--wk-border); border-radius: 10px; background: var(--wk-surface); min-width: 0; }
    .project-task-item.completed .task-body strong { color: var(--wk-ink-muted); text-decoration: line-through; }
    .task-status-checkbox { width: 15px; height: 15px; margin: 3px 0 0; accent-color: var(--wk-primary); cursor: pointer; }
    .task-body { display: grid; gap: 6px; min-width: 0; min-height: 34px; padding: 0; border: 0; background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .task-body strong { overflow-wrap: anywhere; }
    .task-meta, .chip-row { display: flex; flex-wrap: wrap; gap: 6px 10px; min-width: 0; }
    .task-meta { color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .task-meta > span { display: inline-flex; align-items: center; gap: 4px; }
    .task-meta .danger { color: var(--wk-error); }
    .project-source { display: inline-flex; align-items: flex-start; gap: 5px; min-width: 0; color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .project-source > span { min-width: 0; overflow-wrap: anywhere; }
    .chip-row .wk-chip { min-height: 24px; padding: 2px 7px; }
    .task-actions { grid-column: 2; display: flex; flex-wrap: wrap; gap: 4px; }
    .task-actions .wk-btn { min-height: 32px; gap: 5px; }
    .task-actions .danger { color: var(--b3-theme-error, #d23f31); }
    .project-list-empty { display: grid; justify-items: start; gap: 7px; min-width: 0; padding: 18px; border: 1px dashed var(--wk-border); border-radius: 10px; color: var(--wk-ink-secondary); }
    .project-list-empty span { color: var(--wk-ink-muted); overflow-wrap: anywhere; }
    @container (max-width: 560px) { .task-actions { grid-column: 1 / -1; } }
</style>
