<script lang="ts">
    import { formatWorkspaceTaskSchedule, type WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskIcon from "./WorkspaceTaskIcon.svelte";

    interface Props {
        model: WorkspaceTaskViewModel;
        mode?: "list" | "compact" | "card";
        selected?: boolean;
        batchSelecting?: boolean;
        batchSelected?: boolean;
        onSelect: () => void;
        onToggle: () => void | Promise<void>;
        onBatchToggle?: () => void;
        onTagClick?: (tag: string) => void;
        onProjectClick?: (targetId: string) => void;
        onPreview?: (model: WorkspaceTaskViewModel, anchor: HTMLElement, source: "pointer" | "focus" | "click" | "keyboard") => void;
        onPreviewPointerLeave?: (model: WorkspaceTaskViewModel) => void;
        onPreviewFocusLeave?: (model: WorkspaceTaskViewModel) => void;
    }
    let {
        model, mode = "list", selected = false, batchSelecting = false, batchSelected = false,
        onSelect, onToggle, onBatchToggle, onTagClick, onProjectClick, onPreview, onPreviewPointerLeave, onPreviewFocusLeave,
    }: Props = $props();
    const task = $derived(model.task);
    const scheduleIcon = $derived(model.isOverdue ? "overdue" : model.scheduleKind === "none" ? "unscheduled" : model.scheduleKind === "range" || model.scheduleKind === "same_day" ? "range" : model.scheduleKind === "start_only" ? "start" : "deadline");

    function activate(anchor: HTMLElement, source: "click" | "keyboard"): void {
        if (onPreview) onPreview(model, anchor, source);
        else onSelect();
    }
    function handleKeydown(event: KeyboardEvent): void {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate(event.currentTarget as HTMLElement, "keyboard");
    }
    function handleFocusOut(event: FocusEvent): void {
        if (event.relatedTarget instanceof Node && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
        onPreviewFocusLeave?.(model);
    }
</script>

<article
    class="task-item"
    class:task-preview-trigger={!!onPreview}
    class:selected
    class:completed={task.completed}
    class:compact={mode === "compact"}
    class:card={mode === "card"}
    onmouseenter={(event) => onPreview?.(model, event.currentTarget, "pointer")}
    onmouseleave={() => onPreviewPointerLeave?.(model)}
    onfocusin={(event) => onPreview?.(model, event.currentTarget, "focus")}
    onfocusout={handleFocusOut}
>
    {#if batchSelecting}
        <input type="checkbox" checked={batchSelected} aria-label="选择任务" onchange={onBatchToggle} />
    {:else}
        <input type="checkbox" checked={task.completed} aria-label={task.completed ? "取消完成" : "完成任务"} onchange={onToggle} />
    {/if}
    <div class="task-content" role="button" tabindex="0" onclick={(event) => activate(event.currentTarget, "click")} onkeydown={handleKeydown}>
        <div class="task-title-row"><strong>{task.taskname}</strong>
            {#if model.priorityLevel > 0}<span class={`priority p${model.priorityLevel}`}>{model.priorityLabel}</span>{/if}
            {#if model.projectArchived}<span class="meta-badge"><WorkspaceTaskIcon name="archive" />已归档</span>{/if}
            {#if model.relationNeedsAttention}<span class="meta-badge warning"><WorkspaceTaskIcon name="relation" />关系需维护</span>{/if}
        </div>
        <div class="task-meta">
            <span class:danger={model.isOverdue}><WorkspaceTaskIcon name={scheduleIcon} />{formatWorkspaceTaskSchedule(model)}</span>
            {#if task.projectTargetId}<button type="button" onclick={(event) => { event.stopPropagation(); onProjectClick?.(task.projectTargetId!); }}><WorkspaceTaskIcon name="project" />{model.projectPathLabel}</button>{/if}
            {#if task.recurrence}<span><WorkspaceTaskIcon name="repeat" />{task.recurrence}</span>{/if}
            {#if task.reminder}<span><WorkspaceTaskIcon name="reminder" />{task.reminder}</span>{/if}
            {#if task.location}<span><WorkspaceTaskIcon name="location" />{task.location}</span>{/if}
        </div>
        {#if task.tags.length}<div class="task-tags">
            {#each task.tags as tag}<button type="button" onclick={(event) => { event.stopPropagation(); onTagClick?.(tag); }}>#{tag}#</button>{/each}
        </div>{/if}
    </div>
    {#if model.riskLevel !== "normal" && !task.completed}<span class={`risk ${model.riskLevel}`}>{model.riskLabel}</span>{/if}
</article>

<style>
    .task-item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: start; gap: 9px; min-width: 0; padding: 11px; border: 1px solid var(--wk-border); border-radius: 10px; background: var(--wk-surface); }
    .task-item.selected { border-color: var(--wk-primary); background: color-mix(in srgb, var(--wk-primary) 5%, var(--wk-surface)); }
    .task-item.card { grid-template-columns: 18px minmax(0, 1fr); }
    .task-item.compact { padding: 8px; }
    input { width: 15px; height: 15px; margin: 3px 0 0; accent-color: var(--wk-primary); cursor: pointer; }
    .task-content { display: grid; gap: 6px; min-width: 0; cursor: pointer; outline: none; }
    .task-title-row, .task-meta, .task-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px; min-width: 0; }
    strong { color: var(--wk-ink); overflow-wrap: anywhere; }
    .completed strong { color: var(--wk-ink-muted); text-decoration: line-through; }
    .priority, .meta-badge, .risk { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 999px; font-size: var(--wk-text-xs); white-space: nowrap; }
    .priority { color: var(--wk-ink-secondary); background: var(--wk-background); }
    .priority.p3, .priority.p4 { color: var(--wk-warning); background: var(--wk-warning-bg); }
    .meta-badge { color: var(--wk-ink-muted); background: var(--wk-background); }
    .meta-badge.warning { color: var(--wk-warning); }
    .task-meta { color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .task-meta > span, .task-meta > button { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
    .task-meta button { max-width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; overflow-wrap: anywhere; }
    .task-meta .danger { color: var(--wk-error); }
    .task-tags button { padding: 2px 6px; border: 1px solid var(--wk-border-light); border-radius: 999px; background: transparent; color: var(--wk-primary); font-size: var(--wk-text-xs); cursor: pointer; }
    .risk { align-self: center; color: var(--wk-ink-muted); background: var(--wk-background); }
    .risk.attention { color: var(--wk-warning); background: var(--wk-warning-bg); }
    .risk.warning, .risk.danger { color: var(--wk-error); background: var(--wk-error-bg); }
    @container (max-width: 620px) { .task-item { grid-template-columns: 18px minmax(0, 1fr); } .risk { grid-column: 2; justify-self: start; } }
</style>
