<script lang="ts" module>
    import type { WorkspaceTaskCompletionScope, WorkspaceTaskStatusFilter } from "../enhancedDiaryWorkspaceNavigation";

    export const completionScopeLabels: Record<WorkspaceTaskCompletionScope, string> = {
        active: "待办", completed: "已完成", all: "全部",
    };
    export const quickFilterLabels: Partial<Record<WorkspaceTaskStatusFilter, string>> = {
        today: "今日", overdue: "逾期", migrate: "待迁移", high: "高优先级",
        unscheduled: "未排期", relation: "关系需维护", new: "今日新建", migrated: "今日迁入",
    };
</script>

<script lang="ts">
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import type { EnhancedDiaryWorkspaceProject } from "../enhancedDiaryWorkspaceData";
    import type { WorkspaceTaskPriorityLevel } from "../enhancedDiaryWorkspaceTaskModel";
    import type {
        WorkspaceTaskScheduleFilter,
        WorkspaceTaskSortKey,
        WorkspaceTaskViewMode,
    } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceTaskFilterPopover from "./WorkspaceTaskFilterPopover.svelte";
    import WorkspaceTaskIcon, { type WorkspaceTaskIconName } from "./WorkspaceTaskIcon.svelte";
    import WorkspaceTaskSortPopover from "./WorkspaceTaskSortPopover.svelte";

    type RiskFilter = "all" | "risk" | "stale" | "deadline" | "relation";
    type SourceKind = "new" | "migrated" | "normal";
    interface Props {
        search: string;
        completionScope: WorkspaceTaskCompletionScope;
        view: WorkspaceTaskViewMode;
        sort: WorkspaceTaskSortKey;
        quickFilter: WorkspaceTaskStatusFilter;
        activeCount: number;
        completedCount: number;
        totalCount: number;
        todayCount: number;
        overdueCount: number;
        migrateCount: number;
        highPriorityCount: number;
        unscheduledCount: number;
        relationCount: number;
        projects: EnhancedDiaryWorkspaceProject[];
        tagOptions: string[];
        projectTargetId: string;
        selectedTags: string[];
        priorityLevels: WorkspaceTaskPriorityLevel[];
        schedule: WorkspaceTaskScheduleFilter;
        sources: SourceKind[];
        risk: RiskFilter;
        filterCount: number;
        hasActiveFilters: boolean;
        batchSelecting: boolean;
        onSearchChange: (value: string) => void;
        onCompletionScopeChange: (value: WorkspaceTaskCompletionScope) => void;
        onViewChange: (value: WorkspaceTaskViewMode) => void;
        onSortChange: (value: WorkspaceTaskSortKey) => void;
        onQuickFilterChange: (value: WorkspaceTaskStatusFilter) => void;
        onProjectChange: (value: string) => void;
        onTagsChange: (value: string[]) => void;
        onPrioritiesChange: (value: WorkspaceTaskPriorityLevel[]) => void;
        onScheduleChange: (value: WorkspaceTaskScheduleFilter) => void;
        onSourcesChange: (value: SourceKind[]) => void;
        onRiskChange: (value: RiskFilter) => void;
        onClearFilters: () => void;
        onToggleBatch: () => void;
    }


    let props: Props = $props();
    let viewPicker = $state<HTMLDetailsElement | null>(null);
    let viewPickerOpen = $state(false);

    const views: Array<{ value: WorkspaceTaskViewMode; label: string; icon: WorkspaceTaskIconName }> = [
        { value: "list", label: "列表", icon: "list" },
        { value: "kanban", label: "看板", icon: "kanban" },
        { value: "calendar", label: "日历", icon: "calendar" },
        { value: "agenda", label: "事项线", icon: "agenda" },
        { value: "timeline", label: "时间线", icon: "timeline" },
        { value: "gantt", label: "甘特", icon: "gantt" },
        { value: "matrix", label: "四象限", icon: "matrix" },
        { value: "analytics", label: "分析", icon: "analytics" },
    ];
    const primaryViews = views.slice(0, 4);
    const currentView = $derived(views.find((option) => option.value === props.view) ?? views[0]);
    const moreViewActive = $derived(!primaryViews.includes(currentView));

    const quickFilters = [
        { value: "today", icon: "today", count: () => props.todayCount },
        { value: "overdue", icon: "overdue", count: () => props.overdueCount },
        { value: "migrate", icon: "migrate", count: () => props.migrateCount },
        { value: "high", icon: "priority", count: () => props.highPriorityCount },
        { value: "unscheduled", icon: "unscheduled", count: () => props.unscheduledCount },
        { value: "relation", icon: "relation", count: () => props.relationCount },
    ] as const;
    const popupQuickFilters = quickFilters.slice(1);
    const compactFilterCount = $derived(props.filterCount
        + (props.search.trim() ? 1 : 0)
        + (popupQuickFilters.some((option) => option.value === props.quickFilter) ? 1 : 0));
    const scopes = $derived([
        { value: "active", count: props.activeCount },
        { value: "completed", count: props.completedCount },
        { value: "all", count: props.totalCount },
    ] as const);

    function closeViewPicker(restoreFocus: boolean): void {
        viewPickerOpen = false;
        if (restoreFocus) viewPicker?.querySelector("summary")?.focus();
    }

    function handleOutsidePointer(event: PointerEvent): void {
        if (viewPickerOpen && event.target instanceof Node && !viewPicker?.contains(event.target)) {
            closeViewPicker(false);
        }
    }

    function handleEscape(event: KeyboardEvent): void {
        if (viewPickerOpen && event.key === "Escape") closeViewPicker(true);
    }
</script>

<svelte:window onpointerdown={handleOutsidePointer} onkeydown={handleEscape} />

{#snippet searchControl()}
    <input class="task-search" type="search" value={props.search} aria-label="搜索任务、标签、项目"
        placeholder="搜索任务、标签、项目" oninput={(event) => props.onSearchChange(event.currentTarget.value)} />
{/snippet}

{#snippet quickFilterControl(option: typeof quickFilters[number], narrowOnly = false)}
    <button type="button" class="quick-filter" class:narrow-only={narrowOnly}
        class:danger={option.value === "overdue" && option.count() > 0}
        aria-label={`${quickFilterLabels[option.value]} ${option.count()} 项`}
        aria-pressed={props.quickFilter === option.value}
        onclick={() => props.onQuickFilterChange(props.quickFilter === option.value ? "active" : option.value)}>
        <WorkspaceTaskIcon name={option.icon} />
        <span>{quickFilterLabels[option.value]}</span>
        <span class="count">{option.count()}</span>
    </button>
{/snippet}

{#snippet extraActions()}
    <WorkspaceTaskSortPopover value={props.sort} onChange={props.onSortChange} />
    <button type="button" class="batch-button" aria-pressed={props.batchSelecting} onclick={props.onToggleBatch}>
        {props.batchSelecting ? "退出批量" : "批量选择"}
    </button>
{/snippet}

<div class="task-toolbar">
    <div class="view-row segmented" role="group" aria-label="任务视图">
        {#each primaryViews as option (option.value)}
            <button class="primary-view" type="button" aria-pressed={props.view === option.value}
                onclick={() => props.onViewChange(option.value)}>
                <WorkspaceTaskIcon name={option.icon} />{option.label}
            </button>
        {/each}
        <details class="view-picker" bind:this={viewPicker} bind:open={viewPickerOpen}>
            <summary class:active={moreViewActive} aria-expanded={viewPickerOpen}>
                <span class="wide-only">{moreViewActive ? currentView.label : "更多视图"}</span>
                <span class="narrow-only">{currentView.label}</span>
                <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div class="view-options" role="group" aria-label="选择任务视图">
                {#each views as option, index (option.value)}
                    <button type="button" class:narrow-only={index < primaryViews.length} aria-pressed={props.view === option.value}
                        onclick={() => { props.onViewChange(option.value); closeViewPicker(true); }}>
                        <WorkspaceTaskIcon name={option.icon} />{option.label}
                    </button>
                {/each}
            </div>
        </details>
    </div>
    <div class="wide-search">{@render searchControl()}</div>

    <div class="filter-row">
        <div class="quick-filters" role="group" aria-label="快捷筛选">
            {@render quickFilterControl(quickFilters[0])}
            <div class="wide-only">{@render quickFilterControl(quickFilters[1])}</div>
        </div>
        <div class="segmented completion-scope" role="group" aria-label="任务完成范围">
            {#each scopes as option (option.value)}
                <button type="button" aria-pressed={props.completionScope === option.value}
                    onclick={() => props.onCompletionScopeChange(option.value)}>
                    {completionScopeLabels[option.value]} <span class="count">{option.count}</span>
                </button>
            {/each}
        </div>
        <select class="compact-scope" aria-label="任务完成范围" value={props.completionScope}
            onchange={(event) => props.onCompletionScopeChange(event.currentTarget.value as WorkspaceTaskCompletionScope)}>
            {#each scopes as option (option.value)}
                <option value={option.value}>{completionScopeLabels[option.value]} {option.count}</option>
            {/each}
        </select>
        <div class="wide-actions">{@render extraActions()}</div>
        <WorkspaceTaskFilterPopover
            projects={props.projects} tagOptions={props.tagOptions} projectTargetId={props.projectTargetId}
            selectedTags={props.selectedTags} priorityLevels={props.priorityLevels} schedule={props.schedule}
            sources={props.sources} risk={props.risk} activeCount={props.filterCount} compactActiveCount={compactFilterCount}
            canClear={props.hasActiveFilters} onProjectChange={props.onProjectChange}
            onTagsChange={props.onTagsChange} onPrioritiesChange={props.onPrioritiesChange}
            onScheduleChange={props.onScheduleChange} onSourcesChange={props.onSourcesChange}
            onRiskChange={props.onRiskChange} onClear={props.onClearFilters}
        >
            {#snippet shortcuts()}
                <div class="compact-search">{@render searchControl()}</div>
                <div class="filter-shortcuts" role="group" aria-label="更多快捷筛选">
                    {#each popupQuickFilters as option (option.value)}
                        {@render quickFilterControl(option, option.value === "overdue")}
                    {/each}
                </div>
                <div class="compact-actions">{@render extraActions()}</div>
            {/snippet}
        </WorkspaceTaskFilterPopover>
    </div>
</div>

<style>
    .task-toolbar {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        align-items: center;
        gap: 8px 12px;
        min-width: 0;
    }

    .segmented {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        min-width: 0;
        padding: 3px;
        border-radius: var(--wk-radius-sm);
        background: var(--wk-surface-3);
    }

    .segmented button, summary, .quick-filter, .batch-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 32px;
        padding: 4px 8px;
        border: 0;
        border-radius: var(--wk-radius-sm);
        background: transparent;
        color: var(--wk-ink-secondary);
        font: inherit;
        white-space: nowrap;
        cursor: pointer;
    }

    .segmented button:hover, summary:hover, .quick-filter:hover, .batch-button:hover {
        background: var(--wk-background);
        color: var(--wk-ink);
    }

    .segmented button[aria-pressed="true"], summary.active, details[open] > summary {
        background: var(--wk-surface);
        box-shadow: var(--wk-shadow-xs);
        color: var(--wk-ink);
        font-weight: 600;
    }

    .view-picker { position: relative; }
    summary { list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .view-options {
        position: absolute;
        z-index: 20;
        inset: calc(100% + 6px) auto auto 0;
        display: grid;
        min-width: 136px;
        padding: 4px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-surface);
        box-shadow: var(--wk-shadow-popover);
    }
    .view-options button { justify-content: flex-start; }
    .view-options button[aria-pressed="true"] { background: var(--wk-primary-subtle); box-shadow: none; }

    .wide-search { width: min(100%, 320px); justify-self: end; }
    .task-search, .compact-scope {
        box-sizing: border-box;
        min-height: 36px;
        min-width: 0;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-surface);
        color: var(--wk-ink);
        font: inherit;
    }
    .task-search { width: 100%; padding-inline: 10px; }
    .task-search::placeholder { color: var(--wk-ink-muted); }
    .compact-scope { padding-inline: 6px; }

    .filter-row, .quick-filters, .wide-actions, .compact-actions, .filter-shortcuts {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }
    .filter-row { grid-column: 1 / -1; }
    .wide-actions { margin-inline-start: auto; }
    .filter-shortcuts { padding-bottom: 10px; border-bottom: 1px solid var(--wk-border-light); }
    .quick-filter { background: var(--wk-surface-3); }
    .quick-filter[aria-pressed="true"], .batch-button[aria-pressed="true"] {
        background: var(--wk-primary-subtle);
        color: var(--wk-primary);
    }
    .quick-filter.danger { color: var(--wk-error); }
    .count { opacity: .85; font-variant-numeric: tabular-nums; }
    .batch-button { min-height: 34px; border: 1px solid var(--wk-border); }
    .narrow-only, .view-options .narrow-only, .quick-filter.narrow-only,
    .compact-scope, .compact-search, .compact-actions { display: none; }

    button:focus-visible, summary:focus-visible, input:focus-visible, select:focus-visible {
        outline: 2px solid var(--wk-primary);
        outline-offset: -2px;
    }

    @container (max-width: 600px) {
        .task-toolbar { position: relative; display: flex; gap: 5px; }
        .filter-row { display: contents; }
        .view-row { flex: 0 1 auto; max-width: min(132px, 42cqw); padding: 0; background: transparent; }
        .view-picker { min-width: 0; }
        .view-picker > summary { max-width: 100%; justify-content: space-between; }
        summary span { overflow: hidden; text-overflow: ellipsis; }
        summary :global(svg) { flex-shrink: 0; }
        .view-picker > summary, .quick-filters .quick-filter, .task-toolbar .compact-scope {
            box-sizing: border-box;
            min-height: 34px;
            height: 34px;
            padding: 0 7px;
            border: 1px solid var(--wk-border-light);
            border-radius: var(--wk-radius-sm);
            background: var(--wk-surface);
        }
        .view-picker > summary:hover, .quick-filters .quick-filter:hover, .task-toolbar .compact-scope:hover {
            background: var(--wk-surface-3);
        }
        .quick-filters .quick-filter[aria-pressed="true"] { background: var(--wk-primary-subtle); }
        .view-row .primary-view, .wide-only, .wide-search, .wide-actions, .completion-scope { display: none; }
        .narrow-only, .compact-scope, .compact-search { display: initial; }
        .view-options .narrow-only, .quick-filter.narrow-only, .compact-actions { display: inline-flex; }
        .view-row .view-options { min-width: max(126px, 100%); }
        .quick-filters { flex: none; }
        .compact-scope { max-width: min(94px, 28cqw); }
    }

    @container (max-width: 330px) {
        .quick-filters .quick-filter :global(svg) { display: none; }
    }
</style>
