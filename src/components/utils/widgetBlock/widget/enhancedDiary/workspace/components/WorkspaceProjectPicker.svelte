<script lang="ts">
    import type { EnhancedDiaryProjectIndexPayload } from "../../enhancedDiaryProjectTypes";
    import {
        isEnhancedDiaryProjectEffectivelyActive,
        isEnhancedDiaryProjectEffectivelyArchived,
        resolveEnhancedDiaryProjectTarget,
    } from "../../enhancedDiaryProjectIndex";
    import WorkspaceProjectIcon from "./WorkspaceProjectIcon.svelte";

    interface Props {
        index: EnhancedDiaryProjectIndexPayload;
        value?: string;
        disabled?: boolean;
        allowClear?: boolean;
        statusFilter?: "active" | "archived" | "all";
        preserveSelected?: boolean;
        expandTree?: boolean;
        selectableTargetIds?: string[];
        onChange: (targetId: string) => void;
    }

    let {
        index, value = "", disabled = false, allowClear = true,
        statusFilter = "active", preserveSelected = true, expandTree = false,
        selectableTargetIds, onChange,
    }: Props = $props();
    let collapsed = $state<Set<string>>(new Set());

    const childrenByParent = $derived.by(() => {
        const map = new Map<string, typeof index.nodes[string][]>();
        for (const node of Object.values(index.nodes)) {
            const list = map.get(node.parentTargetId) || [];
            list.push(node);
            map.set(node.parentTargetId, list);
        }
        for (const list of map.values()) list.sort((a, b) => a.order - b.order);
        return map;
    });

    const selectedTarget = $derived(value ? resolveEnhancedDiaryProjectTarget(index, value) : null);
    function matchesLifecycle(id: string): boolean {
        if (statusFilter === "all") return Boolean(resolveEnhancedDiaryProjectTarget(index, id));
        return statusFilter === "active"
            ? isEnhancedDiaryProjectEffectivelyActive(index, id)
            : isEnhancedDiaryProjectEffectivelyArchived(index, id);
    }
    const lifecycleIds = $derived.by(() => {
        if (statusFilter === "all") return null;
        const ids = new Set<string>();
        for (const root of Object.values(index.roots)) {
            if (matchesLifecycle(root.id)) ids.add(root.id);
        }
        for (const node of Object.values(index.nodes)) {
            if (!matchesLifecycle(node.id)) continue;
            ids.add(node.id);
            node.ancestorTargetIds.forEach((id) => ids.add(id));
        }
        if (preserveSelected && value) {
            ids.add(value);
            index.nodes[value]?.ancestorTargetIds.forEach((id) => ids.add(id));
        }
        return ids;
    });
    const lifecycleMatchCount = $derived.by(() => {
        if (statusFilter === "all") return Object.keys(index.roots).length + Object.keys(index.nodes).length;
        const count = Object.keys(index.roots).filter(matchesLifecycle).length +
            Object.keys(index.nodes).filter(matchesLifecycle).length;
        return count || (preserveSelected && value && resolveEnhancedDiaryProjectTarget(index, value) ? 1 : 0);
    });
    function visible(id: string): boolean {
        return !lifecycleIds || lifecycleIds.has(id);
    }
    function selectable(id: string): boolean {
        if (selectableTargetIds && !selectableTargetIds.includes(id)) return false;
        if (statusFilter === "all") return true;
        return matchesLifecycle(id) || (preserveSelected && id === value);
    }
    function archived(id: string): boolean {
        return isEnhancedDiaryProjectEffectivelyArchived(index, id);
    }
    function toggle(id: string): void {
        const next = new Set(collapsed);
        if (next.has(id)) next.delete(id); else next.add(id);
        collapsed = next;
    }
</script>

{#snippet branch(parentId: string, depth: number)}
    {#each childrenByParent.get(parentId) || [] as node}
        {#if visible(node.id)}
            <div class="project-option" class:selected={value === node.id} style={`--depth:${depth}`}>
                {#if (childrenByParent.get(node.id)?.length || 0) > 0}
                    <button type="button" class="tree-toggle" onclick={() => toggle(node.id)} aria-label="展开或折叠">{collapsed.has(node.id) ? "›" : "⌄"}</button>
                {:else}<span class="tree-spacer"></span>{/if}
                <button type="button" class="target-button" class:archived={archived(node.id)} class:context-only={!selectable(node.id)} disabled={disabled || !selectable(node.id)} title={resolveEnhancedDiaryProjectTarget(index, node.id)?.pathTitles.join(" / ")} onclick={() => onChange(node.id)}>{#if archived(node.id)}<WorkspaceProjectIcon name="archive" size={14} />{/if}<span>{node.title}</span></button>
            </div>
            {#if !collapsed.has(node.id)}{@render branch(node.id, depth + 1)}{/if}
        {/if}
    {/each}
{/snippet}

<div class="project-picker" class:disabled>
    <div class="project-tree" class:expanded={expandTree}>
        {#if allowClear}
            <button type="button" class="clear-project" class:selected={!value} disabled={disabled} onclick={() => onChange("")}>不关联项目</button>
        {/if}
        {#each Object.values(index.roots).sort((a, b) => a.order - b.order) as root}
            {#if visible(root.id)}
                <div class="project-option root" class:selected={value === root.id} style="--depth:0">
                    {#if (childrenByParent.get(root.id)?.length || 0) > 0}
                        <button type="button" class="tree-toggle" onclick={() => toggle(root.id)} aria-label="展开或折叠">{collapsed.has(root.id) ? "›" : "⌄"}</button>
                    {:else}<span class="tree-spacer"></span>{/if}
                    <button type="button" class="target-button" class:archived={archived(root.id)} class:context-only={!selectable(root.id)} disabled={disabled || !selectable(root.id)} title={root.title} onclick={() => onChange(root.id)}>{#if archived(root.id)}<WorkspaceProjectIcon name="archive" size={14} />{/if}<span>{root.title}</span></button>
                </div>
                {#if !collapsed.has(root.id)}{@render branch(root.id, 1)}{/if}
            {/if}
        {/each}
        {#if Object.keys(index.roots).length === 0}<p>尚无项目，请先配置位置并创建项目。</p>
        {:else if lifecycleMatchCount === 0}<p>{statusFilter === "archived" ? "暂无已归档项目。" : "暂无进行中项目。"}</p>{/if}
    </div>
    {#if selectedTarget}
        <small class="selected-path">{selectedTarget.pathTitles.join(" / ")}</small>
    {/if}
</div>

<style>
    .project-picker { display: grid; gap: 8px; min-width: 0; max-width: 100%; }
    .project-tree { max-width: 100%; min-width: 0; box-sizing: border-box; max-height: 280px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 8px; padding: 4px; }
    .project-tree.expanded { max-height: none; overflow-x: hidden; overflow-y: visible; }
    .project-tree p { margin: 0; padding: 12px; color: var(--b3-theme-on-surface); }
    .project-option { display: flex; align-items: center; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden; padding-left: calc(var(--depth) * 16px); border-radius: 5px; }
    .project-option.selected, .clear-project.selected { background: var(--b3-list-hover); color: var(--b3-theme-primary); }
    .tree-toggle, .tree-spacer { width: 26px; height: 30px; flex: 0 0 26px; border: 0; background: transparent; color: var(--b3-theme-on-surface); }
    .tree-toggle, .target-button, .clear-project { cursor: pointer; }
    .target-button, .clear-project { border: 0; background: transparent; color: inherit; text-align: left; }
    .target-button { flex: 1; min-width: 0; max-width: 100%; overflow: hidden; padding: 7px 5px; display: flex; align-items: center; gap: 5px; }
    .target-button span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .clear-project { width: 100%; padding: 8px 12px; border-radius: 5px; }
    .selected-path { min-width: 0; max-width: 100%; color: var(--b3-theme-on-surface); overflow-wrap: anywhere; }
    .target-button.archived { opacity: .66; }
    .target-button.context-only { opacity: .48; cursor: default; }
    .disabled { opacity: .6; }
</style>
