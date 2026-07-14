<script lang="ts">
    import type { WorkspaceTaskViewModel, WorkspaceTaskKanbanBucket } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskItem from "./WorkspaceTaskItem.svelte";
    interface Props { models: WorkspaceTaskViewModel[]; selectedTaskId: string; onSelect: (model: WorkspaceTaskViewModel) => void; onToggle: (model: WorkspaceTaskViewModel) => void | Promise<void>; onTagClick: (tag: string) => void; onProjectClick?: (id: string) => void; onPreview?: (model: WorkspaceTaskViewModel, anchor: HTMLElement, source: "pointer" | "focus" | "click" | "keyboard") => void; onPreviewPointerLeave?: (model: WorkspaceTaskViewModel) => void; onPreviewFocusLeave?: (model: WorkspaceTaskViewModel) => void; }
    let { models, selectedTaskId, onSelect, onToggle, onTagClick, onProjectClick, onPreview, onPreviewPointerLeave, onPreviewFocusLeave }: Props = $props();
    const definitions: Array<{ key: WorkspaceTaskKanbanBucket; title: string; description: string }> = [
        { key: "overdue", title: "逾期", description: "已经超过截止日期" }, { key: "today", title: "今天", description: "今天需要行动" },
        { key: "recent", title: "近期", description: "未来 7 天内" }, { key: "future", title: "以后", description: "7 天以后" },
        { key: "unscheduled", title: "未排期", description: "没有有效日期" }, { key: "completed", title: "已完成", description: "当前已完成任务" },
    ];
    const groups = $derived(definitions.map((definition) => ({ ...definition, models: models.filter((model) => model.kanbanBucket === definition.key) })).filter((group) => group.models.length > 0));
</script>

<div class="kanban-view">{#each groups as group}<section class:danger={group.key === "overdue"}><header><strong>{group.title}</strong><span>{group.models.length}</span><small>{group.description}</small></header><div class="cards">{#each group.models as model (model.task.blockId)}<WorkspaceTaskItem {model} mode="card" selected={selectedTaskId === model.task.blockId} onSelect={() => onSelect(model)} onToggle={() => onToggle(model)} {onTagClick} {onProjectClick} {onPreview} {onPreviewPointerLeave} {onPreviewFocusLeave} />{/each}</div></section>{/each}</div>

<style>
    .kanban-view { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(270px, 330px); gap: 10px; min-width: 0; overflow-x: auto; padding-bottom: 6px; }
    section { display: grid; align-content: start; gap: 8px; padding: 10px; border: 1px solid var(--wk-border); border-radius: 11px; background: var(--wk-background); }
    section.danger { border-color: var(--wk-error-border); }
    header { display: grid; grid-template-columns: 1fr auto; gap: 2px 7px; color: var(--wk-ink-secondary); } header small { grid-column: 1 / -1; color: var(--wk-ink-faint); } header span { color: var(--wk-ink-muted); }
    .cards { display: grid; gap: 7px; }
</style>
