<script lang="ts">
    import type { EnhancedDiaryWorkspaceProject } from "../enhancedDiaryWorkspaceData";
    import type { WorkspaceTaskPriorityLevel } from "../enhancedDiaryWorkspaceTaskModel";
    import type { WorkspaceTaskScheduleFilter } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceTaskIcon from "./WorkspaceTaskIcon.svelte";

    type RiskFilter = "all" | "risk" | "stale" | "deadline" | "relation";
    type SourceKind = "new" | "migrated" | "normal";
    interface Props {
        projects: EnhancedDiaryWorkspaceProject[];
        tagOptions: string[];
        projectTargetId: string;
        selectedTags: string[];
        priorityLevels: WorkspaceTaskPriorityLevel[];
        schedule: WorkspaceTaskScheduleFilter;
        sources: SourceKind[];
        risk: RiskFilter;
        activeCount: number;
        onProjectChange: (value: string) => void;
        onTagsChange: (value: string[]) => void;
        onPrioritiesChange: (value: WorkspaceTaskPriorityLevel[]) => void;
        onScheduleChange: (value: WorkspaceTaskScheduleFilter) => void;
        onSourcesChange: (value: SourceKind[]) => void;
        onRiskChange: (value: RiskFilter) => void;
        onClear: () => void;
    }

    let {
        projects, tagOptions, projectTargetId, selectedTags, priorityLevels, schedule, sources, risk,
        activeCount, onProjectChange, onTagsChange, onPrioritiesChange, onScheduleChange,
        onSourcesChange, onRiskChange, onClear,
    }: Props = $props();
    let detailsElement = $state<HTMLDetailsElement | null>(null);
    let open = $state(false);
    let tagSearch = $state("");
    const visibleTags = $derived(tagOptions.filter((tag) => tag.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase())));
    const priorityOptions: Array<{ value: WorkspaceTaskPriorityLevel; label: string }> = [
        { value: 0, label: "无" }, { value: 1, label: "低" }, { value: 2, label: "中" },
        { value: 3, label: "高" }, { value: 4, label: "紧急" },
    ];

    function toggleTag(tag: string): void {
        onTagsChange(selectedTags.includes(tag) ? selectedTags.filter((value) => value !== tag) : [...selectedTags, tag]);
    }
    function togglePriority(value: WorkspaceTaskPriorityLevel): void {
        onPrioritiesChange(priorityLevels.includes(value)
            ? priorityLevels.filter((level) => level !== value)
            : [...priorityLevels, value]);
    }
    function toggleSource(value: SourceKind): void {
        onSourcesChange(sources.includes(value)
            ? sources.filter((source) => source !== value)
            : [...sources, value]);
    }
    function handleWindowPointerDown(event: PointerEvent): void {
        if (!open) return;
        if (event.target instanceof Node && detailsElement?.contains(event.target)) return;
        open = false;
    }
    function handleWindowKeydown(event: KeyboardEvent): void {
        if (open && event.key === "Escape") open = false;
    }
    function handleClear(): void {
        onClear();
        tagSearch = "";
        open = false;
    }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeydown} />

<details class="task-filter-popover" bind:this={detailsElement} bind:open>
    <summary class:active={activeCount > 0}>
        <WorkspaceTaskIcon name="filter" />筛选{activeCount > 0 ? ` ${activeCount}` : ""}
    </summary>
    <div class="popover-panel">
        <label>项目
            <select value={projectTargetId} onchange={(event) => onProjectChange((event.currentTarget as HTMLSelectElement).value)}>
                <option value="">全部项目</option><option value="__none__">未关联项目</option>
                {#each projects as project}
                    <option value={project.targetId}>{"　".repeat(project.level)}{project.name}{project.status === "archived" ? "（已归档）" : ""}</option>
                {/each}
            </select>
        </label>

        <fieldset><legend>标签（匹配任意）</legend>
            {#if tagOptions.length > 8}<input class="tag-search" type="search" bind:value={tagSearch} placeholder="搜索标签" />{/if}
            <div class="check-grid tag-grid">
                {#each visibleTags as tag}
                    <label><input type="checkbox" checked={selectedTags.includes(tag)} onchange={() => toggleTag(tag)} />#{tag}#</label>
                {/each}
                {#if visibleTags.length === 0}<span class="empty">暂无匹配标签</span>{/if}
            </div>
        </fieldset>

        <fieldset><legend>优先级</legend><div class="check-grid">
            {#each priorityOptions as option}<label><input type="checkbox" checked={priorityLevels.includes(option.value)} onchange={() => togglePriority(option.value)} />{option.label}</label>{/each}
        </div></fieldset>

        <fieldset><legend>任务来源（匹配任意）</legend><div class="check-grid source-grid">
            {#each [["new", "今日新建"], ["migrated", "今日迁入"], ["normal", "历史任务"]] as option}
                <label><input type="checkbox" checked={sources.includes(option[0] as SourceKind)} onchange={() => toggleSource(option[0] as SourceKind)} />{option[1]}</label>
            {/each}
        </div></fieldset>

        <div class="select-grid">
            <label>排期<select value={schedule} onchange={(event) => onScheduleChange((event.currentTarget as HTMLSelectElement).value as WorkspaceTaskScheduleFilter)}>
                <option value="all">全部</option><option value="range">完整范围</option><option value="start_only">只有开始</option><option value="deadline_only">只有截止</option><option value="unscheduled">未排期</option><option value="invalid">日期异常</option>
            </select></label>
            <label>风险<select value={risk} onchange={(event) => onRiskChange((event.currentTarget as HTMLSelectElement).value as RiskFilter)}>
                <option value="all">全部</option><option value="risk">高风险</option><option value="stale">停滞</option><option value="deadline">截止风险</option><option value="relation">项目关系需维护</option>
            </select></label>
        </div>
        <button type="button" class="clear" onclick={handleClear} disabled={activeCount === 0}>清除全部筛选</button>
    </div>
</details>

<style>
    .task-filter-popover { position: relative; }
    summary { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 10px; border: 1px solid var(--wk-border); border-radius: 8px; color: var(--wk-ink-secondary); background: var(--wk-surface); cursor: pointer; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary.active { color: var(--wk-primary); border-color: var(--wk-primary); }
    .popover-panel { position: absolute; z-index: 20; top: calc(100% + 6px); right: 0; display: grid; gap: 12px; width: min(390px, calc(100vw - 36px)); max-height: min(70vh, 620px); overflow: auto; padding: 14px; border: 1px solid var(--wk-border); border-radius: 12px; background: var(--wk-surface); box-shadow: var(--wk-shadow-popover); box-sizing: border-box; }
    label { display: grid; gap: 5px; color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); }
    select, .tag-search { width: 100%; min-height: 34px; padding: 5px 8px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-background); color: var(--wk-ink); box-sizing: border-box; }
    fieldset { min-width: 0; margin: 0; padding: 9px; border: 1px solid var(--wk-border-light); border-radius: 8px; }
    legend { padding: 0 5px; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .check-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
    .check-grid label { display: flex; align-items: center; gap: 4px; min-width: 0; }
    .tag-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: 150px; overflow: auto; }
    .source-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .tag-grid label { overflow-wrap: anywhere; }
    .select-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    .clear { justify-self: end; border: 0; background: transparent; color: var(--wk-primary); cursor: pointer; }
    .clear:disabled { color: var(--wk-ink-faint); cursor: default; }
    .empty { color: var(--wk-ink-faint); font-size: var(--wk-text-sm); }
    @media (max-width: 560px) { .popover-panel { position: fixed; left: 12px; right: 12px; top: 18vh; width: auto; } .check-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
