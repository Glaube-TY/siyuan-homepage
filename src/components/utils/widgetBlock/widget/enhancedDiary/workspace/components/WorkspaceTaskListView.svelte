<script lang="ts">
    import type { WorkspaceTaskCompletionScope } from "../enhancedDiaryWorkspaceNavigation";
    import type { WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskItem from "./WorkspaceTaskItem.svelte";

    interface Props {
        models: WorkspaceTaskViewModel[];
        completionScope: WorkspaceTaskCompletionScope;
        selectedTaskId: string;
        batchSelecting: boolean;
        selectedTaskIds: string[];
        onSelect: (model: WorkspaceTaskViewModel) => void;
        onToggle: (model: WorkspaceTaskViewModel) => void | Promise<void>;
        onBatchToggle: (model: WorkspaceTaskViewModel) => void;
        onTagClick: (tag: string) => void;
        onProjectClick?: (targetId: string) => void;
    }
    let { models, completionScope, selectedTaskId, batchSelecting, selectedTaskIds, onSelect, onToggle, onBatchToggle, onTagClick, onProjectClick }: Props = $props();
    let limit = $state(300);
    let completedExpanded = $state(false);
    const activeModels = $derived(models.filter((model) => !model.task.completed));
    const completedModels = $derived(models.filter((model) => model.task.completed));
    const directModels = $derived(completionScope === "completed" ? completedModels : activeModels);
    const visibleDirect = $derived(directModels.slice(0, limit));

    function item(model: WorkspaceTaskViewModel) {
        return {
            model,
            selected: selectedTaskId === model.task.blockId,
            batchSelecting,
            batchSelected: selectedTaskIds.includes(model.task.blockId),
        };
    }
</script>

<div class="task-list-view">
    {#if completionScope === "all"}
        <section><div class="group-heading"><strong>待办任务</strong><span>{activeModels.length}</span></div>
            <div class="items">{#each activeModels.slice(0, limit) as model (model.task.blockId)}<WorkspaceTaskItem {...item(model)} onSelect={() => onSelect(model)} onToggle={() => onToggle(model)} onBatchToggle={() => onBatchToggle(model)} {onTagClick} {onProjectClick} />{/each}</div>
        </section>
        <section><button type="button" class="group-heading completed-toggle" onclick={() => (completedExpanded = !completedExpanded)}><strong>已完成任务</strong><span>{completedModels.length} · {completedExpanded ? "收起" : "展开"}</span></button>
            {#if completedExpanded}<div class="items">{#each completedModels.slice(0, limit) as model (model.task.blockId)}<WorkspaceTaskItem {...item(model)} onSelect={() => onSelect(model)} onToggle={() => onToggle(model)} onBatchToggle={() => onBatchToggle(model)} {onTagClick} {onProjectClick} />{/each}</div>{/if}
        </section>
        {#if activeModels.length > limit || (completedExpanded && completedModels.length > limit)}<button class="load-more" type="button" onclick={() => (limit += 200)}>继续加载</button>{/if}
    {:else}
        <div class="items">{#each visibleDirect as model (model.task.blockId)}<WorkspaceTaskItem {...item(model)} onSelect={() => onSelect(model)} onToggle={() => onToggle(model)} onBatchToggle={() => onBatchToggle(model)} {onTagClick} {onProjectClick} />{/each}</div>
        {#if directModels.length > limit}<button class="load-more" type="button" onclick={() => (limit += 200)}>继续加载剩余 {directModels.length - limit} 条</button>{/if}
    {/if}
</div>

<style>
    .task-list-view, section, .items { display: grid; gap: 8px; min-width: 0; }
    section + section { margin-top: 8px; }
    .group-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 2px; color: var(--wk-ink-secondary); }
    .group-heading span { color: var(--wk-ink-faint); font-size: var(--wk-text-sm); }
    .completed-toggle { width: 100%; border: 0; background: transparent; cursor: pointer; text-align: left; }
    .load-more { justify-self: center; padding: 7px 14px; border: 1px solid var(--wk-border); border-radius: 8px; background: var(--wk-surface); color: var(--wk-primary); cursor: pointer; }
</style>
