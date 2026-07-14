<script lang="ts">
    import type { WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskItem from "./WorkspaceTaskItem.svelte";
    interface Props { models: WorkspaceTaskViewModel[]; importanceThreshold?: 2 | 3 | 4; urgencyDays?: number; selectedTaskId: string; onSelect: (model: WorkspaceTaskViewModel) => void; onToggle: (model: WorkspaceTaskViewModel) => void | Promise<void>; onTagClick: (tag: string) => void; onProjectClick?: (id: string) => void; onPreview?: (model: WorkspaceTaskViewModel, anchor: HTMLElement, source: "pointer" | "focus" | "click" | "keyboard") => void; onPreviewPointerLeave?: (model: WorkspaceTaskViewModel) => void; onPreviewFocusLeave?: (model: WorkspaceTaskViewModel) => void; }
    let { models, importanceThreshold = 3, urgencyDays = 3, selectedTaskId, onSelect, onToggle, onTagClick, onProjectClick, onPreview, onPreviewPointerLeave, onPreviewFocusLeave }: Props = $props();
    const definitions = [
        { key: "important-urgent", title: "重要且紧急", description: "优先处理", tone: "danger" },
        { key: "important-not-urgent", title: "重要不紧急", description: "安排推进", tone: "primary" },
        { key: "not-important-urgent", title: "不重要但紧急", description: "快速处理或协作", tone: "warning" },
        { key: "not-important-not-urgent", title: "不重要且不紧急", description: "按节奏维护", tone: "normal" },
    ];
    function key(model: WorkspaceTaskViewModel): string {
        const important = model.priorityLevel >= importanceThreshold;
        const urgent = !model.task.completed && model.deadlineDistanceDays != null && model.deadlineDistanceDays <= urgencyDays;
        return `${important ? "important" : "not-important"}-${urgent ? "urgent" : "not-urgent"}`;
    }
    const groups = $derived(definitions.map((definition) => ({ ...definition, models: models.filter((model) => key(model) === definition.key) })));
</script>

<div class="matrix-head"><span>重要：优先级达到 {importanceThreshold === 2 ? "中" : importanceThreshold === 3 ? "高" : "紧急"}</span><span>紧急：已逾期或 {urgencyDays} 天内截止</span></div>
<div class="matrix">{#each groups as group}<section class={group.tone}><header><strong>{group.title}</strong><span>{group.models.length}</span><small>{group.description}</small></header><div class="quadrant-content" class:empty={group.models.length === 0}>{#each group.models as model (model.task.blockId)}<WorkspaceTaskItem {model} mode="card" selected={selectedTaskId === model.task.blockId} onSelect={() => onSelect(model)} onToggle={() => onToggle(model)} {onTagClick} {onProjectClick} {onPreview} {onPreviewPointerLeave} {onPreviewFocusLeave} />{/each}{#if group.models.length === 0}<p>暂无任务</p>{/if}</div></section>{/each}</div>

<style>
    .matrix-head { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 8px; color: var(--wk-ink-faint); font-size: var(--wk-text-sm); }
    .matrix { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; min-width: 0; }
    section { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; box-sizing: border-box; width: 100%; min-width: 0; min-height: 0; aspect-ratio: 1 / 1; overflow: hidden; padding: 10px; border: 1px solid var(--wk-border); border-radius: 11px; background: var(--wk-background); } section.danger { border-color: var(--wk-error-border); } section.warning { border-color: var(--wk-warning-border); } section.primary { border-color: color-mix(in srgb, var(--wk-primary) 35%, var(--wk-border)); }
    header { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; color: var(--wk-ink-secondary); } header small { grid-column: 1 / -1; color: var(--wk-ink-faint); }
    .quadrant-content { display: grid; align-content: start; gap: 7px; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .quadrant-content.empty { place-items: center; align-content: center; }
    p { margin: 0; color: var(--wk-ink-faint); text-align: center; }
    @container (max-width: 720px) { .matrix { grid-template-columns: 1fr; } section { min-height: 260px; max-height: min(58vh, 440px); aspect-ratio: auto; } }
</style>
