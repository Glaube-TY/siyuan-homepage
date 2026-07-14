<script lang="ts">
    import type { EnhancedDiaryWorkspaceProject } from "../enhancedDiaryWorkspaceData";
    import type { WorkspaceTaskPriorityLevel } from "../enhancedDiaryWorkspaceTaskModel";
    import type {
        WorkspaceTaskCompletionScope,
        WorkspaceTaskScheduleFilter,
        WorkspaceTaskSortKey,
        WorkspaceTaskStatusFilter,
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
    const views: Array<{ value: WorkspaceTaskViewMode; label: string; icon: WorkspaceTaskIconName }> = [
        { value: "list", label: "列表", icon: "list" },
        { value: "kanban", label: "看板", icon: "kanban" },
        { value: "agenda", label: "事项线", icon: "agenda" },
        { value: "calendar", label: "日历", icon: "calendar" },
        { value: "timeline", label: "时间线", icon: "timeline" },
        { value: "gantt", label: "甘特", icon: "gantt" },
        { value: "matrix", label: "四象限", icon: "matrix" },
        { value: "analytics", label: "分析", icon: "analytics" },
    ];
    const quickFilters: Array<{ value: WorkspaceTaskStatusFilter; label: string; shortLabel: string; ariaLabel: string; icon: WorkspaceTaskIconName; count: () => number }> = [
        { value: "today", label: "今日", shortLabel: "今日", ariaLabel: "今日任务", icon: "today", count: () => props.todayCount },
        { value: "overdue", label: "逾期", shortLabel: "逾期", ariaLabel: "逾期任务", icon: "overdue", count: () => props.overdueCount },
        { value: "migrate", label: "待迁移", shortLabel: "迁移", ariaLabel: "待迁移任务", icon: "migrate", count: () => props.migrateCount },
        { value: "high", label: "高优先级", shortLabel: "高优", ariaLabel: "高优先级任务", icon: "priority", count: () => props.highPriorityCount },
        { value: "unscheduled", label: "未排期", shortLabel: "未排", ariaLabel: "未排期任务", icon: "unscheduled", count: () => props.unscheduledCount },
        { value: "relation", label: "关系需维护", shortLabel: "关系", ariaLabel: "关系需维护任务", icon: "relation", count: () => props.relationCount },
    ];
</script>

<div class="task-toolbar">
    <input class="task-search" type="search" value={props.search} oninput={(event) => props.onSearchChange((event.currentTarget as HTMLInputElement).value)} placeholder="搜索任务、标签、项目……" />
    <div class="view-row" aria-label="任务视图">
        {#each views as option}<button type="button" class:active={props.view === option.value} onclick={() => props.onViewChange(option.value)}><WorkspaceTaskIcon name={option.icon} />{option.label}</button>{/each}
    </div>
    <div class="filter-row">
        <div class="quick-filters" aria-label="快捷筛选">
            {#each quickFilters as option}
                <button type="button" title={`${option.ariaLabel} ${option.count()} 项`} aria-label={`${option.ariaLabel} ${option.count()} 项`} class:active={props.quickFilter === option.value} class:danger={option.value === "overdue" && props.overdueCount > 0} onclick={() => props.onQuickFilterChange(props.quickFilter === option.value ? "active" : option.value)}><WorkspaceTaskIcon name={option.icon} /><span class="quick-label full">{option.label}</span><span class="quick-label short">{option.shortLabel}</span><span class="quick-count">{option.count()}</span></button>
            {/each}
        </div>
        <div class="manual-controls">
            <div class="completion-scope" aria-label="任务完成范围">
                {#each [["active", `待办 ${props.activeCount}`], ["completed", `已完成 ${props.completedCount}`], ["all", `全部 ${props.totalCount}`]] as option}
                    <button type="button" class:active={props.completionScope === option[0]} onclick={() => props.onCompletionScopeChange(option[0] as WorkspaceTaskCompletionScope)}>{option[1]}</button>
                {/each}
            </div>
            <WorkspaceTaskSortPopover value={props.sort} onChange={props.onSortChange} />
            <WorkspaceTaskFilterPopover
                projects={props.projects} tagOptions={props.tagOptions} projectTargetId={props.projectTargetId}
                selectedTags={props.selectedTags} priorityLevels={props.priorityLevels} schedule={props.schedule}
                sources={props.sources} risk={props.risk} activeCount={props.filterCount} onProjectChange={props.onProjectChange}
                onTagsChange={props.onTagsChange} onPrioritiesChange={props.onPrioritiesChange}
                onScheduleChange={props.onScheduleChange} onSourcesChange={props.onSourcesChange}
                onRiskChange={props.onRiskChange} onClear={props.onClearFilters}
            />
            <button type="button" class="batch-button" class:active={props.batchSelecting} onclick={props.onToggleBatch}>{props.batchSelecting ? "退出批量" : "批量选择"}</button>
        </div>
    </div>
</div>

<style>
    .task-toolbar { display: grid; gap: 10px; min-width: 0; }
    .task-search { width: 100%; min-height: 40px; padding: 8px 12px; border: 1px solid var(--wk-border); border-radius: 10px; background: var(--wk-surface); color: var(--wk-ink); box-sizing: border-box; }
    .view-row, .quick-filters, .manual-controls, .completion-scope { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .view-row button, .quick-filters button, .completion-scope button, .batch-button { min-height: 34px; padding: 5px 10px; border: 1px solid var(--wk-border); border-radius: 8px; background: var(--wk-surface); color: var(--wk-ink-secondary); cursor: pointer; }
    .view-row button.active, .quick-filters button.active, .completion-scope button.active, .batch-button.active { border-color: var(--wk-primary); background: color-mix(in srgb, var(--wk-primary) 10%, var(--wk-surface)); color: var(--wk-primary); }
    .view-row { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
    .view-row button { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    .filter-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; overflow: visible; }
    .quick-filters { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; padding: 1px 0; scrollbar-width: none; overscroll-behavior-inline: contain; }
    .quick-filters::-webkit-scrollbar { display: none; }
    .quick-filters button { display: inline-flex; align-items: center; gap: 4px; min-height: 29px; padding: 3px 9px; border-radius: 999px; font-size: var(--wk-text-sm); white-space: nowrap; }
    .quick-filters button.danger { color: var(--wk-error); }
    .quick-label.short { display: none; }
    .manual-controls { justify-content: flex-end; flex-wrap: nowrap; overflow: visible; }
    .completion-scope { gap: 0; }
    .completion-scope button { min-height: 32px; border-radius: 0; white-space: nowrap; }
    .completion-scope button:first-child { border-radius: 7px 0 0 7px; }
    .completion-scope button:last-child { border-radius: 0 7px 7px 0; }
    .completion-scope button + button { margin-left: -1px; }
    @container (max-width: 1120px) { .quick-label.full { display: none; } .quick-label.short { display: inline; } }
    @container (max-width: 760px) { .filter-row { grid-template-columns: minmax(0, 1fr); } .manual-controls { justify-content: flex-start; } }
    @container (max-width: 520px) { .manual-controls { flex-wrap: wrap; } }
</style>
