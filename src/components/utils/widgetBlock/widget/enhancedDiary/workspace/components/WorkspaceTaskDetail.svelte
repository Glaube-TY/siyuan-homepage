<script lang="ts">
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import { formatWorkspaceTaskSchedule, type WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskIcon from "./WorkspaceTaskIcon.svelte";

    interface Props {
        model: WorkspaceTaskViewModel | null;
        variant?: "panel" | "floating";
        onEdit: () => void;
        onToggle: () => void | Promise<void>;
        onDelete: () => void;
        onMigrate: () => void;
        onPostpone: (target: "tomorrow" | "nextWeek") => void | Promise<void>;
        onOpenBlock: () => void;
        onOpenDoc: () => void;
        onOpenProject?: (targetId: string) => void;
        onTagClick?: (tag: string) => void;
    }
    let { model, variant = "panel", onEdit, onToggle, onDelete, onMigrate, onPostpone, onOpenBlock, onOpenDoc, onOpenProject, onTagClick }: Props = $props();
</script>

{#if model}
    {@const task = model.task}
    {@const source = task.sourceDocTitle || task.hpath}
    {@const canMigrate = !task.completed && !task.isTodayTask && task.sourceKind !== "migrated"}
    <aside class="task-detail" class:floating={variant === "floating"}>
        <div class="detail-heading">
            <h3 class:completed={task.completed}>{task.taskname}</h3>
            {#if model.riskLevel === "attention" || model.riskLevel === "warning" || model.riskLevel === "danger"}
                <span class="risk" class:danger={model.riskLevel === "danger"}>{model.riskLabel}</span>
            {/if}
        </div>

        <dl class="metadata">
            <div><dt>状态</dt><dd>{task.completed ? "已完成" : "待完成"}</dd></div>
            {#if model.priorityLevel > 0}<div><dt>优先级</dt><dd>{model.priorityLabel}</dd></div>{/if}
            {#if task.startDate}
                <div><dt>开始</dt><dd>{model.validStartDate || `${task.startDate}（格式异常）`}</dd></div>
            {/if}
            {#if task.deadline}
                <div><dt>截止</dt><dd>{model.validDeadline || `${task.deadline}（格式异常）`}</dd></div>
            {/if}
            {#if model.hasInvalidRange}
                <div><dt>日期检查</dt><dd class="relation-warning">开始日期晚于截止日期</dd></div>
            {:else if model.deadlineDistanceDays != null}
                <div><dt>排期</dt><dd>{formatWorkspaceTaskSchedule(model)}</dd></div>
            {/if}
            {#if task.projectTargetId}
                <div>
                    <dt>项目</dt>
                    <dd>
                        <button class="project-link" type="button" onclick={() => onOpenProject?.(task.projectTargetId!)}>
                            <WorkspaceTaskIcon name={model.projectArchived ? "archive" : "project"} />
                            <span>{model.projectPathLabel}{model.projectArchived ? "（已归档）" : ""}</span>
                        </button>
                    </dd>
                </div>
            {/if}
            {#if model.relationNeedsAttention}
                <div><dt>关系</dt><dd class="relation-warning">项目关系需维护</dd></div>
            {/if}
            {#if task.tags.length}
                <div>
                    <dt>标签</dt>
                    <dd class="tags">
                        {#each task.tags as tag}
                            <button type="button" onclick={() => onTagClick?.(tag)}>#{tag}#</button>
                        {/each}
                    </dd>
                </div>
            {/if}
            {#if task.recurrence}<div><dt>重复</dt><dd>{task.recurrence}</dd></div>{/if}
            {#if task.reminder}<div><dt>提醒</dt><dd>{task.reminder}</dd></div>{/if}
            {#if task.location}<div><dt>地点</dt><dd>{task.location}</dd></div>{/if}
        </dl>

        {#if source || task.sourceDate || task.markdown || (task.blockId && task.sourceDocId)}
            <div class="source-info">
                {#if source || task.sourceDate}
                    <div class="source-meta">
                        <span>来源</span>
                        {#if source}<span>· {source}</span>{/if}
                        {#if task.sourceDate && task.sourceDate !== source}<time datetime={task.sourceDate}>· {task.sourceDate}</time>{/if}
                    </div>
                {/if}
                {#if task.markdown || (task.blockId && task.sourceDocId)}
                    <details>
                        <summary><ChevronRight size={14} aria-hidden="true" />更多信息</summary>
                        {#if task.blockId && task.sourceDocId}
                            <button type="button" class="wk-btn wk-btn-ghost" onclick={onOpenDoc}>打开来源日记</button>
                        {/if}
                        {#if task.markdown}<pre>{task.markdown}</pre>{/if}
                    </details>
                {/if}
            </div>
        {/if}

        <div class="actions">
            <div class="main-actions">
                <button type="button" class="wk-btn wk-btn-primary" onclick={onToggle}>{task.completed ? "取消完成" : "标记完成"}</button>
                <button type="button" class="wk-btn wk-btn-secondary" onclick={onEdit}>编辑</button>
                {#if task.blockId || task.sourceDocId}
                    <button type="button" class="wk-btn wk-btn-ghost" onclick={task.blockId ? onOpenBlock : onOpenDoc}>
                        <WorkspaceTaskIcon name="open" />打开来源
                    </button>
                {/if}
            </div>
            <div class="secondary-actions">
                {#if canMigrate}<button type="button" class="wk-btn wk-btn-ghost" onclick={onMigrate}>迁移今天</button>{/if}
                {#if !task.completed}
                    <button type="button" class="wk-btn wk-btn-ghost" onclick={() => onPostpone("tomorrow")}>推迟明天</button>
                    <button type="button" class="wk-btn wk-btn-ghost" onclick={() => onPostpone("nextWeek")}>推迟下周</button>
                {/if}
                <button type="button" class="wk-btn wk-btn-ghost danger" onclick={onDelete}>删除</button>
            </div>
        </div>
    </aside>
{:else}
    <aside class="task-detail empty"><WorkspaceTaskIcon name="list" size={22} /><strong>选择任务查看详情</strong></aside>
{/if}

<style>
    .task-detail {
        display: grid;
        align-content: start;
        gap: 12px;
        min-width: 0;
        padding: 16px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-md);
        background: var(--wk-surface);
    }

    .task-detail.floating { padding: 12px; border: 0; border-radius: 0; background: transparent; }
    .detail-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 10px; }
    .floating .detail-heading { padding-inline-end: 32px; }
    h3 { min-width: 0; margin: 0; color: var(--wk-ink); font-size: var(--wk-text-lg); overflow-wrap: anywhere; }
    h3.completed { color: var(--wk-ink-muted); text-decoration: line-through; }
    .risk {
        max-width: 100%;
        padding: 3px 7px;
        border-radius: var(--wk-radius-sm);
        background: var(--wk-warning-bg);
        color: var(--wk-warning);
        font-size: var(--wk-text-xs);
        overflow-wrap: anywhere;
    }
    .risk.danger { color: var(--wk-error); background: var(--wk-error-bg); }

    .metadata, .source-info, .actions { padding-top: 10px; border-top: 1px solid var(--wk-border-light); }
    .metadata { display: grid; gap: 6px; margin: 0; }
    .metadata > div { display: grid; grid-template-columns: 4em minmax(0, 1fr); gap: 6px; }
    dt { color: var(--wk-ink-muted); }
    dd { margin: 0; color: var(--wk-ink-secondary); overflow-wrap: anywhere; }
    .relation-warning { color: var(--wk-error); }

    .project-link, .tags button {
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--wk-primary);
        font: inherit;
        cursor: pointer;
        text-align: start;
    }
    .project-link { display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%; }
    .project-link span, .tags button { min-width: 0; overflow-wrap: anywhere; }
    .tags { display: flex; flex-wrap: wrap; gap: 5px 8px; }
    .project-link:hover, .tags button:hover { text-decoration: underline; }

    .source-info { display: grid; gap: 6px; color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .source-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; overflow-wrap: anywhere; }
    summary { display: inline-flex; align-items: center; gap: 4px; list-style: none; cursor: pointer; }
    summary::-webkit-details-marker { display: none; }
    summary :global(svg) { fill: none; }
    details[open] summary :global(svg) { transform: rotate(90deg); }
    pre {
        max-height: 150px;
        overflow: auto;
        padding: 8px;
        border-radius: var(--wk-radius-sm);
        background: var(--wk-surface-3);
        color: var(--wk-ink-secondary);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    .actions { display: grid; gap: 5px; }
    .main-actions, .secondary-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .actions .wk-btn:not(.wk-btn-primary) { border: 1px solid var(--wk-border-light); }
    .actions .wk-btn:not(.wk-btn-primary):hover { border-color: var(--wk-border); background: var(--wk-surface-3); }
    .secondary-actions .wk-btn { min-height: 30px; font-size: var(--wk-text-sm); }
    .secondary-actions .danger { margin-inline-start: auto; color: var(--wk-error); }
    button:focus-visible, summary:focus-visible { outline: 2px solid var(--wk-primary); outline-offset: -2px; }
    .empty { justify-items: center; align-content: center; min-height: 160px; text-align: center; color: var(--wk-ink-muted); }
</style>
