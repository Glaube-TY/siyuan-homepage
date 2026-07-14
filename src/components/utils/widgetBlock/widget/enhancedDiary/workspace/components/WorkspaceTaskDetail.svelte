<script lang="ts">
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
    <aside class="task-detail" class:floating={variant === "floating"}>
        <div class="detail-heading"><div><span class="eyebrow">任务详情</span><h3 class:completed={task.completed}>{task.taskname}</h3></div><span class={`risk ${model.riskLevel}`}>{model.riskLabel}</span></div>
        <section><h4>基础</h4><dl>
            <div><dt>状态</dt><dd>{task.completed ? "已完成" : "待完成"}</dd></div>
            <div><dt>优先级</dt><dd>{model.priorityLabel}</dd></div>
            <div><dt>风险</dt><dd>{model.riskLabel}</dd></div>
        </dl></section>
        <section><h4>时间</h4><dl>
            <div><dt>排期</dt><dd>{formatWorkspaceTaskSchedule(model)}</dd></div>
            {#if task.startDate}<div><dt>开始日期</dt><dd>{model.validStartDate || `${task.startDate}（格式异常）`}</dd></div>{/if}
            {#if task.deadline}<div><dt>截止日期</dt><dd>{model.validDeadline || `${task.deadline}（格式异常）`}</dd></div>{/if}
            {#if model.hasInvalidStartDate || model.hasInvalidDeadline || model.hasInvalidRange}<div class="warning"><dt>日期检查</dt><dd>{model.riskLabel}</dd></div>{/if}
            {#if model.isStarted}<div><dt>已开始</dt><dd>{Math.abs(Math.min(0, model.startDistanceDays || 0))} 天</dd></div>{/if}
            {#if model.deadlineDistanceDays != null}<div><dt>{model.isOverdue ? "逾期" : "距截止"}</dt><dd>{Math.abs(model.deadlineDistanceDays)} 天</dd></div>{/if}
        </dl></section>
        <section><h4>项目与标签</h4>
            <div class="project-actions">{#if task.projectTargetId}<button class="project-link" type="button" onclick={() => onOpenProject?.(task.projectTargetId!)}><WorkspaceTaskIcon name={model.projectArchived ? "archive" : "project"} />{model.projectPathLabel}{model.projectArchived ? "（已归档）" : "（进行中）"}</button>{:else}<p class="muted">未关联项目</p>{/if}<button class="adjust-project" type="button" onclick={onEdit}>调整归属</button></div>
            {#if model.relationNeedsAttention}<p class="relation-warning"><WorkspaceTaskIcon name="relation" />项目关系需维护</p>{/if}
            {#if task.tags.length}<div class="tags">{#each task.tags as tag}<button type="button" onclick={() => onTagClick?.(tag)}>#{tag}#</button>{/each}</div>{:else}<p class="muted">无标签</p>{/if}
        </section>
        <section><h4>扩展信息</h4><dl>
            <div><dt>重复</dt><dd>{task.recurrence || "-"}</dd></div><div><dt>提醒</dt><dd>{task.reminder || "-"}</dd></div><div><dt>地点</dt><dd>{task.location || "-"}</dd></div>
            <div><dt>来源</dt><dd>{task.sourceDocTitle || task.hpath || "-"}</dd></div><div><dt>来源日期</dt><dd>{task.sourceDate || "-"}</dd></div>
        </dl></section>
        <details><summary>高级信息</summary><pre>{task.markdown}</pre></details>
        <div class="actions">
            <button type="button" class="wk-btn wk-btn-primary" onclick={onToggle}>{task.completed ? "取消完成" : "标记完成"}</button>
            <button type="button" class="wk-btn wk-btn-secondary" onclick={onEdit}>编辑</button>
            {#if !task.completed}<button type="button" class="wk-btn wk-btn-ghost" onclick={onMigrate} disabled={task.isTodayTask || task.sourceKind === "migrated"}>迁移今天</button><button type="button" class="wk-btn wk-btn-ghost" onclick={() => onPostpone("tomorrow")}>推迟明天</button><button type="button" class="wk-btn wk-btn-ghost" onclick={() => onPostpone("nextWeek")}>推迟下周</button>{/if}
            <button type="button" class="wk-btn wk-btn-ghost" onclick={onOpenBlock}><WorkspaceTaskIcon name="open" />打开原块</button>
            <button type="button" class="wk-btn wk-btn-ghost" onclick={onOpenDoc}>打开来源日记</button>
            <button type="button" class="wk-btn wk-btn-ghost danger" onclick={onDelete}>删除</button>
        </div>
    </aside>
{:else}
    <aside class="task-detail empty"><WorkspaceTaskIcon name="list" size={22} /><strong>选择任务查看详情</strong><span>日期、项目、标签与风险会在这里统一展示。</span></aside>
{/if}

<style>
    .task-detail { display: grid; align-content: start; gap: 15px; min-width: 0; padding: 16px; border: 1px solid var(--wk-border); border-radius: 12px; background: var(--wk-surface); }
    .task-detail.floating { gap: 12px; padding: 12px; border: 0; border-radius: 0; background: transparent; }
    .detail-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .task-detail.floating .detail-heading { padding-right: 34px; }
    .eyebrow { color: var(--wk-ink-faint); font-size: var(--wk-text-xs); }
    h3, h4, p { margin: 0; } h3 { margin-top: 3px; color: var(--wk-ink); overflow-wrap: anywhere; } h3.completed { color: var(--wk-ink-muted); text-decoration: line-through; }
    h4 { margin-bottom: 7px; color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); }
    dl { display: grid; gap: 6px; margin: 0; } dl > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; } dt { color: var(--wk-ink-faint); } dd { margin: 0; color: var(--wk-ink-secondary); overflow-wrap: anywhere; }
    .warning, .relation-warning { color: var(--wk-error); } .relation-warning { display: flex; gap: 5px; margin-top: 7px; }
    .project-link { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 0; border: 0; background: transparent; color: var(--wk-primary); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
    .project-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; } .adjust-project { padding: 3px 7px; border: 1px solid var(--wk-border); border-radius: 7px; background: transparent; color: var(--wk-ink-muted); cursor: pointer; }
    .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; } .tags button { padding: 2px 7px; border: 1px solid var(--wk-border); border-radius: 999px; background: transparent; color: var(--wk-primary); cursor: pointer; }
    .muted { color: var(--wk-ink-faint); }
    .risk { padding: 3px 7px; border-radius: 999px; background: var(--wk-background); color: var(--wk-ink-muted); font-size: var(--wk-text-xs); white-space: nowrap; } .risk.attention, .risk.warning { color: var(--wk-warning); background: var(--wk-warning-bg); } .risk.danger { color: var(--wk-error); background: var(--wk-error-bg); }
    summary { color: var(--wk-ink-muted); cursor: pointer; } pre { max-height: 150px; overflow: auto; padding: 8px; border-radius: 7px; background: var(--wk-background); color: var(--wk-ink-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; } .actions .danger { color: var(--wk-error); }
    .empty { justify-items: center; align-content: center; min-height: 200px; text-align: center; color: var(--wk-ink-faint); } .empty strong { color: var(--wk-ink-secondary); }
</style>
