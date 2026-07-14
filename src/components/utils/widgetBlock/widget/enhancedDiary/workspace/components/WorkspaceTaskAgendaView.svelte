<script lang="ts">
    import type { WorkspaceTaskActionBucket, WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskItem from "./WorkspaceTaskItem.svelte";
    interface Props { models: WorkspaceTaskViewModel[]; selectedTaskId: string; onSelect: (model: WorkspaceTaskViewModel) => void; onToggle: (model: WorkspaceTaskViewModel) => void | Promise<void>; onTagClick: (tag: string) => void; onProjectClick?: (id: string) => void; onPreview?: (model: WorkspaceTaskViewModel, anchor: HTMLElement, source: "pointer" | "focus" | "click" | "keyboard") => void; onPreviewPointerLeave?: (model: WorkspaceTaskViewModel) => void; onPreviewFocusLeave?: (model: WorkspaceTaskViewModel) => void; }
    let { models, selectedTaskId, onSelect, onToggle, onTagClick, onProjectClick, onPreview, onPreviewPointerLeave, onPreviewFocusLeave }: Props = $props();
    const definitions: Array<{ key: WorkspaceTaskActionBucket; title: string; open: boolean }> = [
        { key: "overdue", title: "逾期", open: true }, { key: "today", title: "今天", open: true }, { key: "tomorrow", title: "明天", open: true },
        { key: "this_week", title: "本周剩余", open: true }, { key: "next_week", title: "下周", open: false }, { key: "future", title: "以后", open: false },
        { key: "started", title: "已开始但未设截止", open: false }, { key: "unscheduled", title: "未排期", open: false }, { key: "completed", title: "已完成", open: false },
    ];
    const groups = $derived(definitions.map((definition) => ({ ...definition, models: models.filter((model) => model.actionBucket === definition.key) })).filter((group) => group.models.length > 0));
</script>

<div class="agenda-view">{#each groups as group}<details open={group.open}><summary><strong>{group.title}</strong><span>{group.models.length}</span></summary><div class="items">{#each group.models as model (model.task.blockId)}<WorkspaceTaskItem {model} mode="compact" selected={selectedTaskId === model.task.blockId} onSelect={() => onSelect(model)} onToggle={() => onToggle(model)} {onTagClick} {onProjectClick} {onPreview} {onPreviewPointerLeave} {onPreviewFocusLeave} />{/each}</div></details>{/each}</div>

<style>
    .agenda-view, details, .items { display: grid; gap: 8px; min-width: 0; }
    details { padding: 9px; border: 1px solid var(--wk-border); border-radius: 10px; background: var(--wk-surface); }
    summary { display: flex; align-items: center; gap: 8px; color: var(--wk-ink-secondary); cursor: pointer; } summary span { color: var(--wk-ink-faint); font-size: var(--wk-text-sm); }
    details[open] summary { margin-bottom: 2px; }
</style>
