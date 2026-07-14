<script lang="ts">
    import type { VirtualElement } from "@floating-ui/dom";
    import type { EnhancedDiaryWorkspaceProject } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryWorkspaceTaskSettings } from "../../enhancedDiaryTypes";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import {
        matchesWorkspaceTaskAnalyticsSelection,
        type WorkspaceTaskAnalyticsSelection,
    } from "../enhancedDiaryWorkspaceTaskAnalytics";
    import type {
        WorkspaceTaskCompletionScope,
        WorkspaceTaskRiskFilter,
        WorkspaceTaskScheduleFilter,
        WorkspaceTaskSortKey,
        WorkspaceTaskStatusFilter,
        WorkspaceTaskViewMode,
    } from "../enhancedDiaryWorkspaceNavigation";
    import {
        buildWorkspaceTaskViewModels,
        filterWorkspaceTaskModels,
        normalizeWorkspaceTaskTag,
        sortWorkspaceTaskModels,
        type WorkspaceTaskPriorityLevel,
        type WorkspaceTaskViewModel,
    } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import WorkspaceTaskAgendaView from "./WorkspaceTaskAgendaView.svelte";
    import WorkspaceTaskAnalyticsView from "./WorkspaceTaskAnalyticsView.svelte";
    import WorkspaceTaskCalendarView from "./WorkspaceTaskCalendarView.svelte";
    import WorkspaceTaskDetail from "./WorkspaceTaskDetail.svelte";
    import WorkspaceTaskFloatingDetail from "./WorkspaceTaskFloatingDetail.svelte";
    import WorkspaceTaskGanttView from "./WorkspaceTaskGanttView.svelte";
    import WorkspaceTaskKanbanView from "./WorkspaceTaskKanbanView.svelte";
    import WorkspaceTaskListView from "./WorkspaceTaskListView.svelte";
    import WorkspaceTaskMatrixView from "./WorkspaceTaskMatrixView.svelte";
    import WorkspaceTaskToolbar from "./WorkspaceTaskToolbar.svelte";
    import WorkspaceTaskTimelineView from "./WorkspaceTaskTimelineView.svelte";

    type RiskFilter = "all" | "risk" | "stale" | "deadline" | "relation";
    type SourceKind = EnhancedDiaryWorkspaceTask["sourceKind"];
    type PreviewSource = "pointer" | "focus" | "click" | "keyboard";
    interface FloatingDetailController {
        show: (model: WorkspaceTaskViewModel, anchor: HTMLElement | VirtualElement, source: PreviewSource) => void;
        leavePointerTrigger: (taskId: string) => void;
        leaveFocusTrigger: (taskId: string) => void;
        close: () => void;
    }
    interface Props {
        tasks: EnhancedDiaryWorkspaceTask[];
        projectTargets?: EnhancedDiaryWorkspaceProject[];
        today?: string;
        taskSettings?: EnhancedDiaryWorkspaceTaskSettings;
        onCreate: () => void;
        onToggle: (task: EnhancedDiaryWorkspaceTask) => void | Promise<void>;
        onEdit: (task: EnhancedDiaryWorkspaceTask) => void;
        onDelete: (task: EnhancedDiaryWorkspaceTask) => void;
        onMigrate: (task: EnhancedDiaryWorkspaceTask) => void;
        onPostpone: (task: EnhancedDiaryWorkspaceTask, target: "tomorrow" | "nextWeek") => void | Promise<void>;
        onBatchComplete: (tasks: EnhancedDiaryWorkspaceTask[]) => void | Promise<void>;
        onBatchPostpone: (tasks: EnhancedDiaryWorkspaceTask[], target: "tomorrow" | "nextWeek") => void | Promise<void>;
        onOpenDoc: (docId?: string) => void;
        onOpenBlock: (blockId?: string) => void;
        onOpenProject?: (targetId: string) => void;
        initialStatusFilter?: WorkspaceTaskStatusFilter;
        initialCompletionScope?: WorkspaceTaskCompletionScope;
        initialQuickFilter?: WorkspaceTaskStatusFilter;
        initialTagFilter?: string;
        initialTags?: string[];
        initialDateFilter?: string;
        initialProjectFilter?: string;
        initialSelectedTaskBlockId?: string;
        initialView?: WorkspaceTaskViewMode;
        initialScheduleFilter?: WorkspaceTaskScheduleFilter;
        filterVersion?: number;
        selectVersion?: number;
        initialRiskFilter?: WorkspaceTaskRiskFilter;
    }

    let {
        tasks, projectTargets = [], today, taskSettings, onCreate, onToggle, onEdit, onDelete, onMigrate,
        onPostpone, onBatchComplete, onBatchPostpone, onOpenDoc, onOpenBlock, onOpenProject,
        initialStatusFilter = "active", initialCompletionScope, initialQuickFilter = "active", initialTagFilter = "", initialTags = [], initialDateFilter = "",
        initialProjectFilter = "", initialSelectedTaskBlockId = "", initialView = "list",
        initialScheduleFilter = "all", filterVersion = 0, selectVersion = 0, initialRiskFilter = "all",
    }: Props = $props();

    let search = $state("");
    let completionScope = $state<WorkspaceTaskCompletionScope>("active");
    let view = $state<WorkspaceTaskViewMode>("list");
    let sort = $state<WorkspaceTaskSortKey>("smart");
    let quickFilter = $state<WorkspaceTaskStatusFilter>("active");
    let projectTargetId = $state("");
    let selectedTags = $state<string[]>([]);
    let priorityLevels = $state<WorkspaceTaskPriorityLevel[]>([]);
    let schedule = $state<WorkspaceTaskScheduleFilter>("all");
    let sources = $state<SourceKind[]>([]);
    let risk = $state<RiskFilter>("all");
    let dateFilter = $state("");
    let analyticsFilter = $state<WorkspaceTaskAnalyticsSelection | null>(null);
    let selectedTaskId = $state("");
    let floatingTaskId = $state("");
    let floatingDetail = $state<FloatingDetailController | null>(null);
    let selectedTaskIds = $state<string[]>([]);
    let batchSelecting = $state(false);
    let appliedFilterVersion = $state(-1);
    let appliedSelectVersion = $state(-1);
    let completionScopeBeforeCalendar = $state<WorkspaceTaskCompletionScope | null>(null);
    let calendarCompletionScopeAutoApplied = $state(false);

    const projectStatuses = $derived(new Map(projectTargets.map((project) => [project.targetId, project.status] as const)));
    const allModels = $derived(buildWorkspaceTaskViewModels(tasks, {
        today,
        projectStatuses,
        weekStartDay: taskSettings?.weekStartDay ?? 1,
    }));
    const tagOptions = $derived.by(() => {
        const seen = new Set<string>();
        const result: string[] = [];
        tasks.flatMap((task) => task.tags).forEach((raw) => {
            const tag = normalizeWorkspaceTaskTag(raw); const key = tag.toLocaleLowerCase();
            if (tag && !seen.has(key)) { seen.add(key); result.push(tag); }
        });
        return result.sort((a, b) => a.localeCompare(b, "zh-CN"));
    });

    function applyStatusFilter(status: WorkspaceTaskStatusFilter): void {
        if (status === "completed") { completionScope = "completed"; quickFilter = "active"; }
        else if (status === "all") { completionScope = "all"; quickFilter = "active"; }
        else { completionScope = "active"; quickFilter = status; }
    }

    function closeFloatingTask(): void {
        floatingDetail?.close();
        floatingTaskId = "";
    }
    function showFloatingTask(model: WorkspaceTaskViewModel, anchor: HTMLElement | VirtualElement, source: PreviewSource): void {
        floatingDetail?.show(model, anchor, source);
    }
    function leaveFloatingTaskPointer(model: WorkspaceTaskViewModel): void {
        floatingDetail?.leavePointerTrigger(model.task.blockId);
    }
    function leaveFloatingTaskFocus(model: WorkspaceTaskViewModel): void {
        floatingDetail?.leaveFocusTrigger(model.task.blockId);
    }

    function initializeCalendarCompletionScope(): void {
        completionScopeBeforeCalendar = null;
        calendarCompletionScopeAutoApplied = false;
        if (view !== "calendar") return;
        completionScopeBeforeCalendar = completionScope;
        if (taskSettings?.showCompletedInCalendar && completionScope === "active") {
            completionScope = "all";
            calendarCompletionScopeAutoApplied = true;
        }
    }

    function handleViewChange(nextView: WorkspaceTaskViewMode): void {
        if (nextView === view) return;
        closeFloatingTask();
        const previousView = view;
        if (previousView === "calendar" && nextView !== "calendar") {
            if (calendarCompletionScopeAutoApplied
                && completionScope === "all"
                && completionScopeBeforeCalendar) {
                completionScope = completionScopeBeforeCalendar;
            }
            completionScopeBeforeCalendar = null;
            calendarCompletionScopeAutoApplied = false;
        }
        view = nextView;
        if (previousView !== "calendar" && nextView === "calendar") {
            completionScopeBeforeCalendar = completionScope;
            if (taskSettings?.showCompletedInCalendar && completionScope === "active") {
                completionScope = "all";
                calendarCompletionScopeAutoApplied = true;
            }
        }
    }

    function handleCompletionScopeChange(nextScope: WorkspaceTaskCompletionScope): void {
        closeFloatingTask();
        completionScope = nextScope;
        selectedTaskIds = [];
        if (view === "calendar" && calendarCompletionScopeAutoApplied) {
            completionScopeBeforeCalendar = null;
            calendarCompletionScopeAutoApplied = false;
        }
    }

    function handleQuickFilterChange(nextFilter: WorkspaceTaskStatusFilter): void {
        closeFloatingTask();
        quickFilter = nextFilter;
        completionScope = "active";
        if (view === "calendar" && calendarCompletionScopeAutoApplied) {
            completionScopeBeforeCalendar = null;
            calendarCompletionScopeAutoApplied = false;
        }
    }

    function applyExternalFilters(): void {
        closeFloatingTask();
        if (filterVersion === 0 && taskSettings) {
            completionScope = taskSettings.defaultCompletionScope;
            quickFilter = "active";
            sort = taskSettings.defaultSort;
            view = taskSettings.defaultView;
        } else {
            if (initialCompletionScope) {
                completionScope = initialCompletionScope;
                quickFilter = initialQuickFilter;
            } else applyStatusFilter(initialStatusFilter);
            view = initialView;
        }
        initializeCalendarCompletionScope();
        selectedTags = (initialTags.length ? initialTags : initialTagFilter ? [initialTagFilter] : [])
            .map(normalizeWorkspaceTaskTag).filter(Boolean);
        projectTargetId = initialProjectFilter;
        schedule = initialScheduleFilter;
        dateFilter = initialDateFilter;
        risk = initialRiskFilter === "project" ? "relation" : initialRiskFilter;
        analyticsFilter = null;
        sources = [];
        selectedTaskIds = [];
        batchSelecting = false;
    }

    $effect(() => {
        if (filterVersion === appliedFilterVersion) return;
        appliedFilterVersion = filterVersion;
        applyExternalFilters();
    });
    $effect(() => {
        if (selectVersion === appliedSelectVersion) return;
        appliedSelectVersion = selectVersion;
        if (initialSelectedTaskBlockId) selectedTaskId = initialSelectedTaskBlockId;
    });

    const filteredModels = $derived.by(() => {
        let result = filterWorkspaceTaskModels(allModels, {
            completionScope, search, projectTargetId, tags: selectedTags, priorityLevels, schedule, sources, risk,
        });
        if (dateFilter) result = result.filter((model) =>
            model.task.sourceDate === dateFilter
            || model.validStartDate === dateFilter
            || model.validDeadline === dateFilter
            || (!!model.validStartDate && !!model.validDeadline && !model.hasInvalidRange
                && model.validStartDate <= dateFilter && dateFilter <= model.validDeadline)
        );
        if (quickFilter !== "active" && quickFilter !== "all") result = result.filter((model) => {
            if (quickFilter === "today") return model.task.isTodayTask;
            if (quickFilter === "overdue") return model.isOverdue;
            if (quickFilter === "migrate") return model.task.shouldMigrate;
            if (quickFilter === "high") return model.priorityLevel >= 3;
            if (quickFilter === "unscheduled") return model.isUnscheduled;
            if (quickFilter === "relation") return model.relationNeedsAttention;
            if (quickFilter === "new") return model.task.sourceKind === "new";
            if (quickFilter === "migrated") return model.task.sourceKind === "migrated";
            return true;
        });
        if (analyticsFilter) result = result.filter((model) =>
            matchesWorkspaceTaskAnalyticsSelection(model, analyticsFilter!)
        );
        return sortWorkspaceTaskModels(result, sort);
    });
    const selectedModel = $derived(filteredModels.find((model) => model.task.blockId === selectedTaskId) || null);
    const selectedBatchModels = $derived(filteredModels.filter((model) => selectedTaskIds.includes(model.task.blockId)));
    const activeCount = $derived(allModels.filter((model) => !model.task.completed).length);
    const completedCount = $derived(allModels.filter((model) => model.task.completed).length);
    const todayCount = $derived(allModels.filter((model) => !model.task.completed && model.task.isTodayTask).length);
    const overdueCount = $derived(allModels.filter((model) => model.isOverdue).length);
    const migrateCount = $derived(allModels.filter((model) => model.task.shouldMigrate).length);
    const highPriorityCount = $derived(allModels.filter((model) => !model.task.completed && model.priorityLevel >= 3).length);
    const unscheduledCount = $derived(allModels.filter((model) => !model.task.completed && model.isUnscheduled).length);
    const relationCount = $derived(allModels.filter((model) => !model.task.completed && model.relationNeedsAttention).length);
    const filterCount = $derived((projectTargetId ? 1 : 0) + selectedTags.length + priorityLevels.length + sources.length + (schedule !== "all" ? 1 : 0) + (risk !== "all" ? 1 : 0));

    $effect(() => {
        const ids = new Set(filteredModels.map((model) => model.task.blockId));
        const nextSelectedTaskIds = selectedTaskIds.filter((id) => ids.has(id));
        if (nextSelectedTaskIds.length !== selectedTaskIds.length) {
            selectedTaskIds = nextSelectedTaskIds;
        }
        if (view === "list" && (!selectedTaskId || !ids.has(selectedTaskId))) selectedTaskId = filteredModels[0]?.task.blockId || "";
        if (floatingTaskId && !ids.has(floatingTaskId)) closeFloatingTask();
    });

    function addTagFilter(tag: string): void {
        closeFloatingTask();
        const normalized = normalizeWorkspaceTaskTag(tag);
        if (normalized && !selectedTags.some((value) => value.toLocaleLowerCase() === normalized.toLocaleLowerCase())) selectedTags = [...selectedTags, normalized];
    }
    function priorityFilterLabel(level: WorkspaceTaskPriorityLevel): string {
        return ["无", "低", "中", "高", "紧急"][level];
    }
    function scheduleFilterLabel(value: WorkspaceTaskScheduleFilter): string {
        return ({ range: "完整范围", start_only: "只有开始", deadline_only: "只有截止", unscheduled: "未排期", invalid: "日期异常" } as Record<string, string>)[value] || value;
    }
    function riskFilterLabel(value: RiskFilter): string {
        return ({ risk: "高风险", stale: "停滞", deadline: "截止风险", relation: "项目关系需维护" } as Record<string, string>)[value] || value;
    }
    function clearAdvancedFilters(): void {
        closeFloatingTask();
        projectTargetId = ""; selectedTags = []; priorityLevels = []; schedule = "all"; sources = []; risk = "all"; analyticsFilter = null;
    }
    function toggleBatchModel(model: WorkspaceTaskViewModel): void {
        const id = model.task.blockId;
        selectedTaskIds = selectedTaskIds.includes(id) ? selectedTaskIds.filter((value) => value !== id) : [...selectedTaskIds, id];
    }
    function openProject(id: string): void { closeFloatingTask(); onOpenProject?.(id); }
    function updateTaskControls(update: () => void): void { closeFloatingTask(); update(); }
    function handleTaskToggle(model: WorkspaceTaskViewModel): void | Promise<void> { closeFloatingTask(); return onToggle(model.task); }
    function handleToggleBatch(): void { closeFloatingTask(); batchSelecting = !batchSelecting; selectedTaskIds = []; }
    function handleWindowPointerDown(event: PointerEvent): void {
        if (!floatingTaskId) return;
        const target = event.target;
        if (target instanceof Element && target.closest(".task-preview-trigger, .task-floating-detail")) return;
        closeFloatingTask();
    }
    function handleAnalyticsSelect(selection: WorkspaceTaskAnalyticsSelection): void {
        analyticsFilter = selection;
        handleViewChange("list");
    }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<section class="task-panel">
    <header class="page-heading"><div><h2>任务</h2><p>管理当前行动、时间安排与项目推进</p></div><button type="button" class="wk-btn wk-btn-primary" onclick={onCreate}>新建任务</button></header>
    <WorkspaceTaskToolbar
        {search} {completionScope} {view} {sort} {quickFilter} {activeCount} {completedCount}
        totalCount={allModels.length} {todayCount} {overdueCount} {migrateCount} {highPriorityCount} {unscheduledCount} {relationCount} projects={projectTargets}
        {tagOptions} {projectTargetId} {selectedTags} {priorityLevels} {schedule} {sources} {risk} {filterCount} {batchSelecting}
        onSearchChange={(value) => updateTaskControls(() => (search = value))} onCompletionScopeChange={handleCompletionScopeChange}
        onViewChange={handleViewChange} onSortChange={(value) => updateTaskControls(() => (sort = value))}
        onQuickFilterChange={handleQuickFilterChange}
        onProjectChange={(value) => updateTaskControls(() => (projectTargetId = value))} onTagsChange={(value) => updateTaskControls(() => (selectedTags = value))}
        onPrioritiesChange={(value) => updateTaskControls(() => (priorityLevels = value))} onScheduleChange={(value) => updateTaskControls(() => (schedule = value))}
        onSourcesChange={(value) => updateTaskControls(() => (sources = value))}
        onRiskChange={(value) => updateTaskControls(() => (risk = value))} onClearFilters={clearAdvancedFilters}
        onToggleBatch={handleToggleBatch}
    />

    {#if filterCount > 0 || dateFilter || analyticsFilter}
        <div class="active-filters"><span>当前筛选：</span>
            {#if projectTargetId}<button type="button" onclick={() => updateTaskControls(() => (projectTargetId = ""))}>项目：{projectTargetId === "__none__" ? "未关联" : projectTargets.find((project) => project.targetId === projectTargetId)?.name || projectTargetId} ×</button>{/if}
            {#each selectedTags as tag}<button type="button" onclick={() => updateTaskControls(() => (selectedTags = selectedTags.filter((value) => value !== tag)))}>#{tag}# ×</button>{/each}
            {#each priorityLevels as level}<button type="button" onclick={() => updateTaskControls(() => (priorityLevels = priorityLevels.filter((value) => value !== level)))}>优先级：{priorityFilterLabel(level)} ×</button>{/each}
            {#if sources.length}<button type="button" onclick={() => updateTaskControls(() => (sources = []))}>来源：{sources.map((source) => source === "new" ? "今日新建" : source === "migrated" ? "今日迁入" : "历史任务").join("、")} ×</button>{/if}
            {#if schedule !== "all"}<button type="button" onclick={() => updateTaskControls(() => (schedule = "all"))}>排期：{scheduleFilterLabel(schedule)} ×</button>{/if}
            {#if risk !== "all"}<button type="button" onclick={() => updateTaskControls(() => (risk = "all"))}>风险：{riskFilterLabel(risk)} ×</button>{/if}
            {#if dateFilter}<button type="button" onclick={() => updateTaskControls(() => (dateFilter = ""))}>日期：{dateFilter} ×</button>{/if}
            {#if analyticsFilter}<button type="button" onclick={() => updateTaskControls(() => (analyticsFilter = null))}>{analyticsFilter.label || analyticsFilter.key} ×</button>{/if}
            <button type="button" class="clear-all" onclick={() => { clearAdvancedFilters(); dateFilter = ""; quickFilter = "active"; }}>清除全部</button>
        </div>
    {/if}

    {#if batchSelecting}
        <div class="batch-bar"><strong>已选择 {selectedBatchModels.length} 条</strong><button type="button" onclick={() => (selectedTaskIds = filteredModels.map((model) => model.task.blockId))}>全选当前结果</button><button type="button" onclick={() => (selectedTaskIds = [])}>清空</button><button type="button" disabled={!selectedBatchModels.some((model) => !model.task.completed)} onclick={() => onBatchComplete(selectedBatchModels.filter((model) => !model.task.completed).map((model) => model.task))}>批量完成</button><button type="button" disabled={selectedBatchModels.length === 0} onclick={() => onBatchPostpone(selectedBatchModels.map((model) => model.task), "tomorrow")}>推迟明天</button><button type="button" disabled={selectedBatchModels.length === 0} onclick={() => onBatchPostpone(selectedBatchModels.map((model) => model.task), "nextWeek")}>推迟下周</button></div>
    {/if}

    {#if filteredModels.length === 0 && view !== "analytics"}
        <WorkspaceEmptyState title="没有匹配的任务" description="调整完成范围、搜索或筛选条件后再试。" actionLabel="清除筛选" onAction={() => { search = ""; clearAdvancedFilters(); dateFilter = ""; quickFilter = "active"; }} />
    {:else if view === "list"}
        <div class="list-layout"><div class="list-master-pane"><WorkspaceTaskListView models={filteredModels} {completionScope} {selectedTaskId} {batchSelecting} {selectedTaskIds} onSelect={(model) => (selectedTaskId = model.task.blockId)} onToggle={handleTaskToggle} onBatchToggle={toggleBatchModel} onTagClick={addTagFilter} onProjectClick={openProject} /></div><div class="list-detail-pane"><WorkspaceTaskDetail model={selectedModel} onEdit={() => selectedModel && onEdit(selectedModel.task)} onToggle={() => selectedModel && onToggle(selectedModel.task)} onDelete={() => selectedModel && onDelete(selectedModel.task)} onMigrate={() => selectedModel && onMigrate(selectedModel.task)} onPostpone={(target) => selectedModel && onPostpone(selectedModel.task, target)} onOpenBlock={() => onOpenBlock(selectedModel?.task.blockId)} onOpenDoc={() => onOpenDoc(selectedModel?.task.sourceDocId)} onOpenProject={openProject} onTagClick={addTagFilter} /></div></div>
    {:else if view === "kanban"}
        <WorkspaceTaskKanbanView models={filteredModels} selectedTaskId={floatingTaskId} onSelect={() => undefined} onToggle={handleTaskToggle} onTagClick={addTagFilter} onProjectClick={openProject} onPreview={showFloatingTask} onPreviewPointerLeave={leaveFloatingTaskPointer} onPreviewFocusLeave={leaveFloatingTaskFocus} />
    {:else if view === "agenda"}
        <WorkspaceTaskAgendaView models={filteredModels} selectedTaskId={floatingTaskId} onSelect={() => undefined} onToggle={handleTaskToggle} onTagClick={addTagFilter} onProjectClick={openProject} onPreview={showFloatingTask} onPreviewPointerLeave={leaveFloatingTaskPointer} onPreviewFocusLeave={leaveFloatingTaskFocus} />
    {:else if view === "calendar"}
        <WorkspaceTaskCalendarView models={filteredModels} today={today || ""} weekStartDay={taskSettings?.weekStartDay ?? 1} onSelect={() => undefined} onToggle={handleTaskToggle} onPreview={showFloatingTask} onPreviewPointerLeave={leaveFloatingTaskPointer} onPreviewFocusLeave={leaveFloatingTaskFocus} />
    {:else if view === "timeline"}
        <WorkspaceTaskTimelineView models={filteredModels} today={today || ""} onSelect={() => undefined} onPreview={showFloatingTask} onPreviewPointerLeave={leaveFloatingTaskPointer} onPreviewFocusLeave={leaveFloatingTaskFocus} />
    {:else if view === "gantt"}
        <WorkspaceTaskGanttView models={filteredModels} today={today || ""} onSelect={() => undefined} onOpenProject={openProject} onPreview={showFloatingTask} onPreviewPointerLeave={leaveFloatingTaskPointer} onPreviewFocusLeave={leaveFloatingTaskFocus} />
    {:else if view === "matrix"}
        <WorkspaceTaskMatrixView models={filteredModels} importanceThreshold={taskSettings?.matrixImportanceThreshold || 3} urgencyDays={taskSettings?.matrixUrgencyDays || 3} selectedTaskId={floatingTaskId} onSelect={() => undefined} onToggle={handleTaskToggle} onTagClick={addTagFilter} onProjectClick={openProject} onPreview={showFloatingTask} onPreviewPointerLeave={leaveFloatingTaskPointer} onPreviewFocusLeave={leaveFloatingTaskFocus} />
    {:else}
        <WorkspaceTaskAnalyticsView models={filteredModels} onSelect={handleAnalyticsSelect} />
    {/if}
    <WorkspaceTaskFloatingDetail bind:this={floatingDetail} onActiveChange={(taskId) => (floatingTaskId = taskId)} onEdit={(model) => onEdit(model.task)} onToggle={(model) => onToggle(model.task)} onDelete={(model) => onDelete(model.task)} onMigrate={(model) => onMigrate(model.task)} onPostpone={(model, target) => onPostpone(model.task, target)} onOpenBlock={(model) => onOpenBlock(model.task.blockId)} onOpenDoc={(model) => onOpenDoc(model.task.sourceDocId)} onOpenProject={openProject} onTagClick={addTagFilter} />
</section>

<style>
    .task-panel { container-type: inline-size; display: grid; gap: 14px; min-width: 0; }
    .page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; } h2, p { margin: 0; } h2 { color: var(--wk-ink); font-size: 20px; } p { margin-top: 3px; color: var(--wk-ink-muted); }
    .active-filters, .batch-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border: 1px solid var(--wk-border); border-radius: 9px; background: var(--wk-background); color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .active-filters button, .batch-bar button { padding: 3px 7px; border: 1px solid var(--wk-border); border-radius: 999px; background: var(--wk-surface); color: var(--wk-ink-secondary); cursor: pointer; } .active-filters .clear-all { margin-left: auto; color: var(--wk-primary); }
    .batch-bar button:disabled { opacity: .45; cursor: default; }
    .list-layout { display: grid; grid-template-columns: minmax(0, .94fr) minmax(360px, 1.06fr); align-items: start; gap: 12px; min-width: 0; }
    .list-master-pane, .list-detail-pane { min-width: 0; }
    .list-detail-pane { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow: auto; overscroll-behavior: contain; }
    @container (max-width: 900px) { .list-layout { grid-template-columns: 1fr; } .list-detail-pane { position: static; max-height: none; overflow: visible; } }
    @container (max-width: 520px) { .page-heading { align-items: stretch; flex-direction: column; } .page-heading .wk-btn { align-self: flex-start; } }
</style>
