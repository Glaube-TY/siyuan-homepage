<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { WorkspaceTaskStatusFilter, WorkspaceTaskRiskFilter } from "../enhancedDiaryWorkspaceNavigation";
    import { addDays, daysBetweenLocalDates, formatLocalDate } from "../enhancedDiaryWorkspaceDate";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";

    interface Props {
        tasks: EnhancedDiaryWorkspaceTask[];
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
        initialStatusFilter?: WorkspaceTaskStatusFilter;
        initialTagFilter?: string;
        initialDateFilter?: string;
        initialSelectedTaskBlockId?: string;
        filterVersion?: number;
        selectVersion?: number;
        initialRiskFilter?: WorkspaceTaskRiskFilter;
    }

    let {
        tasks,
        onCreate,
        onToggle,
        onEdit,
        onDelete,
        onMigrate,
        onPostpone,
        onBatchComplete,
        onBatchPostpone,
        onOpenDoc,
        onOpenBlock,
        initialStatusFilter = "all",
        initialTagFilter = "",
        initialDateFilter = "",
        initialSelectedTaskBlockId = "",
        filterVersion = 0,
        selectVersion = 0,
        initialRiskFilter = "all",
    }: Props = $props();

    let searchText = $state("");
    let statusFilter: WorkspaceTaskStatusFilter = $state("all");
    let tagFilter = $state("");
    let dateFilter = $state("");
    let viewMode: "list" | "kanban" | "time" = $state("list");
    let selectedTaskIds: string[] = $state([]);
    let priorityFilter: "all" | "none" | "❗" | "❗❗" | "❗❗❗" | "❗❗❗❗" = $state("all");
    let riskFilter: WorkspaceTaskRiskFilter = $state("all");
    let sortKey: "default" | "deadlineAsc" | "startAsc" | "priorityDesc" | "sourceDateDesc" | "riskDesc" | "nameAsc" = $state("default");
    let lastFilterVersion = $state(0);

    interface TaskGroup {
        key: string;
        title: string;
        description: string;
        tone: "normal" | "primary" | "danger" | "warning" | "success";
        tasks: EnhancedDiaryWorkspaceTask[];
    }

    function normalizeText(value: unknown): string {
        if (value == null) return "";
        return String(value).toLowerCase().trim();
    }

    function sameStringArray(a: string[], b: string[]): boolean {
        return a.length === b.length && a.every((value, index) => value === b[index]);
    }

    function matchTaskSearch(task: EnhancedDiaryWorkspaceTask, keyword: string): boolean {
        if (!keyword) return true;
        const kw = keyword.toLowerCase();
        return (
            normalizeText(task.taskname).includes(kw) ||
            task.tags.some((tag) => tag.toLowerCase().includes(kw)) ||
            normalizeText(task.sourceDate).includes(kw) ||
            normalizeText(task.hpath).includes(kw) ||
            normalizeText(task.sourceDocTitle).includes(kw) ||
            normalizeText(task.priority).includes(kw) ||
            normalizeText(task.deadline).includes(kw) ||
            normalizeText(task.startDate).includes(kw)
        );
    }

    function getPriorityWeight(priority: string | undefined): number {
        if (priority === "❗❗❗❗") return 4;
        if (priority === "❗❗❗") return 3;
        if (priority === "❗❗") return 2;
        if (priority === "❗") return 1;
        return 0;
    }

    function compareDateText(a: string | undefined, b: string | undefined): number {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b);
    }

    function getTaskPlanDate(task: EnhancedDiaryWorkspaceTask): string {
        return task.deadline || task.startDate || "";
    }

    function getTaskBaseDate(task: EnhancedDiaryWorkspaceTask): string {
        return task.sourceDate || task.startDate || task.deadline || "";
    }

    function getTaskStagnantDays(task: EnhancedDiaryWorkspaceTask): number {
        if (task.completed) return 0;
        const baseDate = getTaskBaseDate(task);
        if (!baseDate) return 0;
        return Math.max(0, daysBetweenLocalDates(baseDate, formatLocalDate(new Date())));
    }

    function getTaskDeadlineDistance(task: EnhancedDiaryWorkspaceTask): number | null {
        if (task.completed || !task.deadline) return null;
        return daysBetweenLocalDates(formatLocalDate(new Date()), task.deadline);
    }

    function getTaskRiskScore(task: EnhancedDiaryWorkspaceTask): number {
        if (task.completed) return 0;
        let score = 0;
        const stagnantDays = getTaskStagnantDays(task);
        const deadlineDistance = getTaskDeadlineDistance(task);

        if (task.isOverdue) score += 90;
        if (task.shouldMigrate) score += 35;
        if (stagnantDays >= 14) score += 40;
        else if (stagnantDays >= 7) score += 22;
        if (deadlineDistance != null && deadlineDistance >= 0 && deadlineDistance <= 1) score += 28;
        score += getPriorityWeight(task.priority) * 5;
        if (task.tags.length > 0) score += 6;

        return score;
    }

    function isTaskDeadlineRisk(task: EnhancedDiaryWorkspaceTask): boolean {
        const deadlineDistance = getTaskDeadlineDistance(task);
        return task.isOverdue || (deadlineDistance != null && deadlineDistance >= 0 && deadlineDistance <= 1);
    }

    function getTaskRiskLabel(task: EnhancedDiaryWorkspaceTask): string {
        const stagnantDays = getTaskStagnantDays(task);
        const deadlineDistance = getTaskDeadlineDistance(task);
        if (task.completed) return "已完成";
        if (task.isOverdue) return `逾期 ${Math.abs(deadlineDistance || 0)} 天`;
        if (deadlineDistance === 0) return "今日截止";
        if (deadlineDistance === 1) return "明日截止";
        if (stagnantDays >= 14) return `停滞 ${stagnantDays} 天`;
        if (task.shouldMigrate) return "建议迁移";
        if (stagnantDays >= 7) return `停滞 ${stagnantDays} 天`;
        if (task.tags.length > 0) return "项目任务";
        return "正常推进";
    }

    function getTaskRiskTone(task: EnhancedDiaryWorkspaceTask): "danger" | "warning" | "project" | "normal" {
        const stagnantDays = getTaskStagnantDays(task);
        if (task.isOverdue || stagnantDays >= 14) return "danger";
        if (task.shouldMigrate || isTaskDeadlineRisk(task) || stagnantDays >= 7) return "warning";
        if (task.tags.length > 0) return "project";
        return "normal";
    }

    function isTaskTomorrow(task: EnhancedDiaryWorkspaceTask, tomorrow: string): boolean {
        return task.deadline === tomorrow || task.startDate === tomorrow;
    }

    function isTaskInRange(task: EnhancedDiaryWorkspaceTask, start: string, end: string): boolean {
        const date = getTaskPlanDate(task);
        return !!date && date >= start && date <= end;
    }

    function renderTaskMeta(task: EnhancedDiaryWorkspaceTask): string {
        const parts = [
            task.priority,
            task.startDate ? `开始 ${task.startDate}` : "",
            task.deadline ? `截止 ${task.deadline}` : "",
            sourceLabel(task),
        ].filter(Boolean);
        return parts.join(" · ");
    }

    const filteredTasks = $derived.by(() => {
        let result = tasks;

        if (searchText.trim()) {
            const kw = searchText.trim().toLowerCase();
            result = result.filter((task) => matchTaskSearch(task, kw));
        }

        if (tagFilter) {
            result = result.filter((task) => task.tags.includes(tagFilter));
        }

        if (dateFilter) {
            result = result.filter((task) => (task.sourceDate || "") === dateFilter);
        }

        if (statusFilter !== "all") {
            result = result.filter((task) => {
                switch (statusFilter) {
                    case "active": return !task.completed;
                    case "completed": return task.completed;
                    case "today": return task.isTodayTask;
                    case "overdue": return task.isOverdue;
                    case "migrate": return task.shouldMigrate;
                    case "new": return task.sourceKind === "new";
                    case "migrated": return task.sourceKind === "migrated";
                    default: return true;
                }
            });
        }

        if (priorityFilter !== "all") {
            result = result.filter((task) => {
                if (priorityFilter === "none") return !task.priority;
                return task.priority === priorityFilter;
            });
        }

        if (riskFilter !== "all") {
            result = result.filter((task) => {
                switch (riskFilter) {
                    case "risk": return getTaskRiskScore(task) >= 30;
                    case "stale": return getTaskStagnantDays(task) >= 7;
                    case "deadline": return isTaskDeadlineRisk(task);
                    case "project": return task.tags.length > 0;
                    default: return true;
                }
            });
        }

        if (sortKey !== "default") {
            result = [...result].sort((a, b) => {
                switch (sortKey) {
                    case "deadlineAsc": return compareDateText(a.deadline, b.deadline);
                    case "startAsc": return compareDateText(a.startDate, b.startDate);
                    case "priorityDesc": return getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
                    case "sourceDateDesc": return compareDateText(b.sourceDate, a.sourceDate);
                    case "riskDesc": return getTaskRiskScore(b) - getTaskRiskScore(a);
                    case "nameAsc": return normalizeText(a.taskname).localeCompare(normalizeText(b.taskname));
                    default: return 0;
                }
            });
        }

        return result;
    });

    const todayCount = $derived(tasks.filter((t) => t.isTodayTask).length);
    const activeCount = $derived(tasks.filter((t) => !t.completed).length);
    const completedCount = $derived(tasks.filter((t) => t.completed).length);
    const overdueCount = $derived(tasks.filter((t) => t.isOverdue).length);
    const migrateCount = $derived(tasks.filter((t) => t.shouldMigrate).length);

    let selectedTaskBlockId: string | null = $state(null);

    const selectedTask = $derived(
        selectedTaskBlockId
            ? filteredTasks.find((t) => t.blockId === selectedTaskBlockId) || null
            : null
    );
    const selectedBatchTasks = $derived(
        filteredTasks.filter((task) => selectedTaskIds.includes(task.blockId))
    );

    $effect(() => {
        if (filteredTasks.length === 0) {
            if (selectedTaskBlockId !== null) {
                selectedTaskBlockId = null;
            }
            if (selectedTaskIds.length > 0) {
                selectedTaskIds = [];
            }
            return;
        }
        const found = selectedTaskBlockId
            ? filteredTasks.find((t) => t.blockId === selectedTaskBlockId)
            : null;
        if (!found) {
            selectedTaskBlockId = filteredTasks[0].blockId;
        }
        const filteredTaskIds = new Set(filteredTasks.map((task) => task.blockId));
        const validSelectedIds = selectedTaskIds.filter((id) => filteredTaskIds.has(id));
        if (!sameStringArray(validSelectedIds, selectedTaskIds)) {
            selectedTaskIds = validSelectedIds;
        }
    });

    function toggleBatchSelection(task: EnhancedDiaryWorkspaceTask): void {
        if (selectedTaskIds.includes(task.blockId)) {
            selectedTaskIds = selectedTaskIds.filter((id) => id !== task.blockId);
        } else {
            selectedTaskIds = [...selectedTaskIds, task.blockId];
        }
    }

    function selectAllFilteredTasks(): void {
        selectedTaskIds = filteredTasks.map((task) => task.blockId);
    }

    function clearBatchSelection(): void {
        selectedTaskIds = [];
    }

    function clearFilters(): void {
        searchText = "";
        statusFilter = "all";
        tagFilter = "";
        dateFilter = "";
        priorityFilter = "all";
        riskFilter = "all";
        sortKey = "default";
    }

    $effect(() => {
        if (filterVersion <= lastFilterVersion) return;
        lastFilterVersion = filterVersion;
        statusFilter = initialStatusFilter;
        tagFilter = initialTagFilter || "";
        dateFilter = initialDateFilter || "";
        searchText = "";
        priorityFilter = "all";
        riskFilter = initialRiskFilter;
        selectedTaskBlockId = null;
        if (initialRiskFilter !== "all") {
            sortKey = "riskDesc";
        } else {
            switch (initialStatusFilter) {
                case "overdue": sortKey = "deadlineAsc"; break;
                case "migrate": sortKey = "sourceDateDesc"; break;
                default: sortKey = "default"; break;
            }
        }
    });

    let lastSelectVersion = $state(0);
    $effect(() => {
        if (selectVersion <= lastSelectVersion) return;
        lastSelectVersion = selectVersion;
        if (initialSelectedTaskBlockId) {
            const found = filteredTasks.find((t) => t.blockId === initialSelectedTaskBlockId);
            if (found) {
                selectedTaskBlockId = initialSelectedTaskBlockId;
            }
        }
    });

    let batchSelecting = $state(false);

    function startBatchSelecting(): void {
        batchSelecting = true;
        selectedTaskIds = [];
    }

    function exitBatchSelecting(): void {
        batchSelecting = false;
        selectedTaskIds = [];
    }

    // Controlled popovers
    let moreActionsOpen = $state(false);
    let detailMoreActionsEl: HTMLElement | null = $state(null);
    let advancedFiltersOpen = $state(false);
    let advancedFiltersEl: HTMLElement | null = $state(null);

    function toggleMoreActions(): void {
        moreActionsOpen = !moreActionsOpen;
        if (moreActionsOpen) advancedFiltersOpen = false;
    }

    function closeMoreActions(): void {
        moreActionsOpen = false;
    }

    function toggleAdvancedFilters(): void {
        advancedFiltersOpen = !advancedFiltersOpen;
        if (advancedFiltersOpen) moreActionsOpen = false;
    }

    function closeAllPopovers(): void {
        moreActionsOpen = false;
        advancedFiltersOpen = false;
    }

    function runMoreAction(action: () => void): void {
        closeMoreActions();
        action();
    }

    function handlePopoverPointerdown(event: PointerEvent): void {
        if (moreActionsOpen && detailMoreActionsEl && !detailMoreActionsEl.contains(event.target as Node)) {
            moreActionsOpen = false;
        }
        if (advancedFiltersOpen && advancedFiltersEl && !advancedFiltersEl.contains(event.target as Node)) {
            advancedFiltersOpen = false;
        }
    }

    function handlePopoverKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            closeAllPopovers();
        }
    }

    onMount(() => {
        document.addEventListener("pointerdown", handlePopoverPointerdown);
        document.addEventListener("keydown", handlePopoverKeydown);
    });

    onDestroy(() => {
        document.removeEventListener("pointerdown", handlePopoverPointerdown);
        document.removeEventListener("keydown", handlePopoverKeydown);
    });

    // Close popovers when selected task or view changes
    $effect(() => {
        void selectedTaskBlockId; void viewMode;
        closeAllPopovers();
    });

    const kanbanGroups = $derived.by((): TaskGroup[] => {
        const groups: TaskGroup[] = [
            { key: "today", title: "今天", description: "开始、截止或写入今天的任务", tone: "primary", tasks: [] },
            { key: "overdue", title: "逾期", description: "截止日期早于今天且未完成", tone: "danger", tasks: [] },
            { key: "waiting", title: "等待", description: "未完成但暂不属于今日/逾期/迁移", tone: "normal", tasks: [] },
            { key: "completed", title: "已完成", description: "已打勾的任务", tone: "success", tasks: [] },
            { key: "migrate", title: "建议迁移", description: "长期未推进，建议迁移到今天", tone: "warning", tasks: [] },
        ];
        const byKey = new Map(groups.map((group) => [group.key, group]));

        filteredTasks.forEach((task) => {
            if (task.completed) byKey.get("completed")?.tasks.push(task);
            else if (task.isOverdue) byKey.get("overdue")?.tasks.push(task);
            else if (task.shouldMigrate) byKey.get("migrate")?.tasks.push(task);
            else if (task.isTodayTask) byKey.get("today")?.tasks.push(task);
            else byKey.get("waiting")?.tasks.push(task);
        });

        return groups;
    });

    const timeGroups = $derived.by((): TaskGroup[] => {
        const today = formatLocalDate(new Date());
        const tomorrow = formatLocalDate(addDays(new Date(), 1));
        const weekStart = formatLocalDate(addDays(new Date(), 2));
        const weekEnd = formatLocalDate(addDays(new Date(), 6));
        const groups: TaskGroup[] = [
            { key: "today", title: "今天", description: today, tone: "primary", tasks: [] },
            { key: "tomorrow", title: "明天", description: tomorrow, tone: "normal", tasks: [] },
            { key: "week", title: "本周", description: `${weekStart} 至 ${weekEnd}`, tone: "warning", tasks: [] },
            { key: "future", title: "未来", description: "本周之后的有日期任务", tone: "normal", tasks: [] },
            { key: "none", title: "无日期", description: "没有开始或截止日期", tone: "normal", tasks: [] },
        ];
        const byKey = new Map(groups.map((group) => [group.key, group]));

        filteredTasks.forEach((task) => {
            const planDate = getTaskPlanDate(task);
            if (task.isTodayTask) byKey.get("today")?.tasks.push(task);
            else if (isTaskTomorrow(task, tomorrow)) byKey.get("tomorrow")?.tasks.push(task);
            else if (isTaskInRange(task, weekStart, weekEnd)) byKey.get("week")?.tasks.push(task);
            else if (planDate && planDate > weekEnd) byKey.get("future")?.tasks.push(task);
            else byKey.get("none")?.tasks.push(task);
        });

        return groups;
    });

    function sourceLabel(task: EnhancedDiaryWorkspaceTask): string {
        if (task.sourceKind === "new") return "今日新建";
        if (task.sourceKind === "migrated") return "今日迁移";
        return task.sourceDate || task.hpath || "普通任务";
    }

    function canMigrateTask(task: EnhancedDiaryWorkspaceTask): boolean {
        return !task.isTodayTask && task.sourceKind !== "migrated";
    }

    function getMigrationTooltip(task: EnhancedDiaryWorkspaceTask): string {
        if (task.isTodayTask) return "已经是今日日记任务，无需迁移";
        if (task.sourceKind === "migrated") return "该任务已迁移到今天";
        return "迁移到今天";
    }

    function selectTask(task: EnhancedDiaryWorkspaceTask): void {
        selectedTaskBlockId = task.blockId;
    }

    function handleTaskListItemKeydown(event: KeyboardEvent, task: EnhancedDiaryWorkspaceTask): void {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectTask(task);
    }

    function applyStatusQuickFilter(filter: WorkspaceTaskStatusFilter): void {
        statusFilter = filter;
        riskFilter = "all";
        selectedTaskBlockId = null;
    }
</script>

<section class="task-panel">
    <div class="panel-toolbar wk-page-header">
        <div class="wk-page-header-main">
            <h2 class="wk-page-title">任务</h2>
            <p class="wk-page-description">管理今天和接下来要做的事情。</p>
        </div>
        <button type="button" class="wk-btn wk-btn-primary" onclick={onCreate}>新建任务</button>
    </div>

    <div class="filters-toolbar wk-toolbar">
        <input
            type="text"
            class="search-input"
            placeholder="搜索任务、标签、来源..."
            bind:value={searchText}
        />
        <div class="advanced-filters" bind:this={advancedFiltersEl}>
          <button type="button" class="wk-btn wk-btn-secondary" onclick={toggleAdvancedFilters}
            aria-expanded={advancedFiltersOpen} aria-haspopup="menu"
          >更多筛选</button>
          {#if advancedFiltersOpen}
          <div class="advanced-filter-popover" role="menu">
          <select class="filter-select" bind:value={statusFilter} aria-label="任务状态">
            <option value="all">全部任务</option>
            <option value="active">未完成</option>
            <option value="completed">已完成</option>
            <option value="today">今日任务</option>
            <option value="overdue">逾期任务</option>
            <option value="migrate">建议迁移</option>
            <option value="new">今日新建</option>
            <option value="migrated">今日迁移</option>
        </select>
        <select class="filter-select" bind:value={priorityFilter} aria-label="任务优先级">
            <option value="all">全部优先级</option>
            <option value="none">无优先级</option>
            <option value="❗">❗</option>
            <option value="❗❗">❗❗</option>
            <option value="❗❗❗">❗❗❗</option>
            <option value="❗❗❗❗">❗❗❗❗</option>
        </select>
        <select class="filter-select" bind:value={riskFilter} aria-label="任务风险">
            <option value="all">全部风险</option>
            <option value="risk">高风险任务</option>
            <option value="stale">停滞任务</option>
            <option value="deadline">截止风险</option>
            <option value="project">项目任务</option>
        </select>
        <select class="filter-select" bind:value={sortKey} aria-label="任务排序">
            <option value="default">默认分组</option>
            <option value="deadlineAsc">截止日期最近</option>
            <option value="startAsc">开始日期最近</option>
            <option value="priorityDesc">优先级最高</option>
            <option value="sourceDateDesc">来源日期最新</option>
            <option value="riskDesc">风险最高</option>
            <option value="nameAsc">名称 A-Z</option>
        </select>
          <button type="button" class="clear-btn" onclick={clearFilters}>清空筛选</button>
          </div>
          {/if}
        </div>
    </div>

    <div class="view-mode-tabs wk-segmented" aria-label="任务视图">
        <button
            type="button"
            class:active={viewMode === "list"}
            onclick={() => (viewMode = "list")}
        >列表</button>
        <button
            type="button"
            class:active={viewMode === "kanban"}
            onclick={() => (viewMode = "kanban")}
        >看板</button>
        <button
            type="button"
            class:active={viewMode === "time"}
            onclick={() => (viewMode = "time")}
        >时间</button>
    </div>

    {#if tagFilter}
        <div class="tag-filter-chip">
            当前项目：<strong>{tagFilter}</strong>
            <button type="button" class="clear-tag-btn" onclick={() => { tagFilter = ""; selectedTaskBlockId = null; }}>清除项目筛选</button>
        </div>
    {/if}

    {#if dateFilter}
        <div class="date-filter-chip">
            当前日期：<strong>{dateFilter}</strong>
            <button type="button" class="clear-date-btn" onclick={() => { dateFilter = ""; selectedTaskBlockId = null; }}>清除日期筛选</button>
        </div>
    {/if}

    <div class="stats-summary">
        <button type="button" class="stat-chip-btn" class:active={statusFilter === "today"} onclick={() => applyStatusQuickFilter("today")}>今日任务 {todayCount}</button>
        <button type="button" class="stat-chip-btn" class:active={statusFilter === "active"} onclick={() => applyStatusQuickFilter("active")}>未完成 {activeCount}</button>
        <button type="button" class="stat-chip-btn danger" class:active={statusFilter === "overdue"} onclick={() => applyStatusQuickFilter("overdue")}>逾期 {overdueCount}</button>
        <button type="button" class="stat-chip-btn warning" class:active={statusFilter === "migrate"} onclick={() => applyStatusQuickFilter("migrate")}>待迁移 {migrateCount}</button>
        <button type="button" class="stat-chip-btn" class:active={statusFilter === "completed"} onclick={() => applyStatusQuickFilter("completed")}>已完成 {completedCount}</button>
    </div>

    <div class="result-info">
        当前显示 {filteredTasks.length} / 总计 {tasks.length} 个任务
        <button type="button" class="batch-toggle-btn" onclick={batchSelecting ? exitBatchSelecting : startBatchSelecting}>
            {batchSelecting ? "退出批量选择" : "批量选择"}
        </button>
    </div>

    {#if batchSelecting && selectedBatchTasks.length > 0}
        <div class="batch-toolbar">
            <span>已选择 {selectedBatchTasks.length} 个任务</span>
            <button type="button" onclick={selectAllFilteredTasks}>全选当前结果</button>
            <button type="button" onclick={clearBatchSelection}>清空选择</button>
            <button type="button" onclick={() => onBatchComplete(selectedBatchTasks)}>批量完成</button>
            <button type="button" onclick={() => onBatchPostpone(selectedBatchTasks, "tomorrow")}>推迟明天</button>
            <button type="button" onclick={() => onBatchPostpone(selectedBatchTasks, "nextWeek")}>推迟下周</button>
        </div>
    {/if}

    {#if filteredTasks.length === 0}
        <WorkspaceEmptyState title="暂无匹配任务" description="请调整筛选条件或添加新任务。" />
    {:else if viewMode === "kanban" || viewMode === "time"}
        <div class="task-board" class:time-board={viewMode === "time"}>
            {#each (viewMode === "kanban" ? kanbanGroups : timeGroups) as group}
                <section class="task-group tone-{group.tone}">
                    <div class="task-group-head">
                        <div>
                            <h3>{group.title}</h3>
                            <p>{group.description}</p>
                        </div>
                        <span>{group.tasks.length}</span>
                    </div>

                    {#if group.tasks.length === 0}
                        <div class="task-group-empty">暂无任务</div>
                    {:else}
                        <div class="task-group-list">
                            {#each group.tasks as task (task.blockId)}
                                <article class="task-card" class:completed={task.completed} class:overdue={task.isOverdue}>
                                    {#if batchSelecting}
                                        <label class="task-card-select">
                                            <input
                                                type="checkbox"
                                                checked={selectedTaskIds.includes(task.blockId)}
                                                onchange={() => toggleBatchSelection(task)}
                                            />
                                            <span>选择</span>
                                        </label>
                                    {/if}
                                    <div class="task-card-main">
                                        {#if !batchSelecting}
                                            <input
                                                type="checkbox"
                                                checked={task.completed}
                                                aria-label={task.completed ? "取消完成" : "标记完成"}
                                                onchange={() => onToggle(task)}
                                            />
                                        {/if}
                                        <div class="task-card-content">
                                            <strong>{task.taskname}</strong>
                                            <span>{renderTaskMeta(task)}</span>
                                            {#if !task.completed}
                                                <div class="task-risk-row">
                                                    <small class="risk-chip tone-{getTaskRiskTone(task)}">
                                                        {getTaskRiskLabel(task)}
                                                    </small>
                                                </div>
                                            {/if}
                                            {#if task.tags.length > 0}
                                                <div class="task-card-tags">
                                                    {#each task.tags.slice(0, 4) as tag}
                                                        <small>#{tag}#</small>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                    <div class="task-card-actions">
                                        <button type="button" onclick={() => onEdit(task)}>编辑</button>
                                        <button
                                            type="button"
                                            onclick={() => onMigrate(task)}
                                            disabled={!canMigrateTask(task)}
                                            title={getMigrationTooltip(task)}
                                        >迁移</button>
                                        <button type="button" onclick={() => onPostpone(task, "tomorrow")}>明天</button>
                                        <button type="button" onclick={() => onPostpone(task, "nextWeek")}>下周</button>
                                        <button type="button" onclick={() => onOpenBlock(task.blockId)}>打开块</button>
                                    </div>
                                </article>
                            {/each}
                        </div>
                    {/if}
                </section>
            {/each}
        </div>
    {:else}
        <div class="task-layout">
            <div class="task-list-col">
                <div class="list-label">任务列表 · {filteredTasks.length} 条</div>
                <div class="task-list-scroll">
                    {#each filteredTasks as task (task.blockId)}
                        {@const topBadges = (()=>{const b=[];if(task.completed){b.push({cls:'mini-done',txt:'已完成'});return b;}if(task.isOverdue)b.push({cls:'mini-overdue',txt:'逾期'});else if(task.shouldMigrate)b.push({cls:'mini-mig',txt:'待迁移'});else if(task.isTodayTask)b.push({cls:'mini-today',txt:'今日'});return b.slice(0,2);})()}
                        <div
                            class="task-list-item"
                            class:selected={selectedTaskBlockId === task.blockId}
                            class:completed={task.completed}
                            role="button"
                            tabindex="0"
                            onclick={() => {if (batchSelecting) {toggleBatchSelection(task)} else {selectTask(task)}}}
                            onkeydown={(event) => handleTaskListItemKeydown(event, task)}
                        >
                            <div class="list-item-row">
                                <span class="list-item-check">
                                    {#if batchSelecting}
                                        <input
                                            type="checkbox"
                                            checked={selectedTaskIds.includes(task.blockId)}
                                            onclick={(event) => event.stopPropagation()}
                                            onchange={() => toggleBatchSelection(task)}
                                        />
                                    {:else}
                                        <input
                                            type="checkbox"
                                            checked={task.completed}
                                            onclick={(event) => event.stopPropagation()}
                                            onchange={() => onToggle(task)}
                                        />
                                    {/if}
                                </span>
                                <span class="list-item-name">{task.taskname}</span>
                                {#if topBadges.length > 0}
                                    <span class="list-item-badges">
                                        {#each topBadges as badge}
                                            <span class="mini-badge {badge.cls}">{badge.txt}</span>
                                        {/each}
                                    </span>
                                {/if}
                            </div>
                            <div class="list-item-meta">
                                {#if task.priority}<span class="meta-chip">{task.priority}</span>{/if}
                                {#if task.deadline}<span class="meta-chip">~{task.deadline}</span>{/if}
                                {#if task.startDate}<span class="meta-chip">{task.startDate}</span>{/if}
                                <span class="meta-chip meta-source">{sourceLabel(task)}</span>
                            </div>
                            {#if task.tags.length > 0}
                                <div class="list-item-tags">
                                    {#each task.tags.slice(0, 2) as tag}
                                        <span>#{tag}#</span>
                                    {/each}
                                    {#if task.tags.length > 2}
                                        <span class="tag-overflow">+{task.tags.length - 2}</span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <div class="task-detail-col">
                {#if selectedTask}
                    <div class="detail-panel">
                        <div class="detail-head">
                            <h3 class="detail-name">{selectedTask.taskname}</h3>
                            <div class="detail-badges">
                                {#if selectedTask.completed}
                                    <span class="badge badge-done">已完成</span>
                                {:else}
                                    <span class="badge badge-active">未完成</span>
                                    {#if selectedTask.isOverdue}<span class="badge badge-danger">逾期</span>{/if}
                                {/if}
                            </div>
                        </div>

                        <div class="detail-info-line">
                            {#if selectedTask.priority}<span class="info-chip">{selectedTask.priority}</span>{/if}
                            {#if selectedTask.startDate}<span class="info-chip">开始 {selectedTask.startDate}</span>{/if}
                            {#if selectedTask.deadline}<span class="info-chip">截止 {selectedTask.deadline}</span>{/if}
                            {#if !selectedTask.completed && (selectedTask.isOverdue || selectedTask.shouldMigrate)}
                                <span class="info-chip">{getTaskRiskLabel(selectedTask)}</span>
                            {/if}
                        </div>

                        {#if selectedTask.tags.length > 0}
                            <div class="detail-info-line">
                                <span class="info-label">标签</span>
                                {#each selectedTask.tags as tag}
                                    <span class="detail-tag">#{tag}#</span>
                                {/each}
                            </div>
                        {/if}

                        {#if selectedTask.sourceDocTitle || selectedTask.sourceDate}
                            <div class="detail-info-line">
                                <span class="info-label">来源</span>
                                <span class="info-value">{selectedTask.sourceDocTitle || selectedTask.sourceDate || "-"}</span>
                            </div>
                        {/if}

                        <details class="detail-advanced">
                            <summary>高级信息</summary>
                            <div class="detail-advanced-grid">
                                <div class="adv-item">
                                    <span class="adv-label">重复</span>
                                    <span class="adv-value">{selectedTask.recurrence || "-"}</span>
                                </div>
                                <div class="adv-item">
                                    <span class="adv-label">提醒</span>
                                    <span class="adv-value">{selectedTask.reminder || "-"}</span>
                                </div>
                                <div class="adv-item">
                                    <span class="adv-label">地点</span>
                                    <span class="adv-value">{selectedTask.location || "-"}</span>
                                </div>
                                <div class="adv-item">
                                    <span class="adv-label">来源日期</span>
                                    <span class="adv-value">{selectedTask.sourceDate || "-"}</span>
                                </div>
                                <div class="adv-item">
                                    <span class="adv-label">停滞天数</span>
                                    <span class="adv-value">{getTaskStagnantDays(selectedTask)} 天</span>
                                </div>
                                <div class="adv-item">
                                    <span class="adv-label">项目关联</span>
                                    <span class="adv-value">{selectedTask.tags.length > 0 ? "已关联" : "-"}</span>
                                </div>
                            </div>
                            <div class="detail-section">
                                <div class="section-label">原始任务 Markdown</div>
                                <pre class="detail-markdown">{selectedTask.markdown}</pre>
                            </div>
                        </details>

                        <div class="detail-actions">
                            <button
                                type="button"
                                class="wk-btn wk-btn-secondary"
                                onclick={() => onEdit(selectedTask)}
                            >编辑</button>
                            {#if selectedTask.completed}
                                <button
                                    type="button"
                                    class="wk-btn wk-btn-secondary"
                                    onclick={() => onToggle(selectedTask)}
                                >取消完成</button>
                            {:else}
                                <button
                                    type="button"
                                    class="wk-btn wk-btn-primary"
                                    onclick={() => onToggle(selectedTask)}
                                >标记完成</button>
                            {/if}
                            <div class="detail-more-actions" bind:this={detailMoreActionsEl}>
                                <button
                                    type="button"
                                    class="wk-btn wk-btn-secondary"
                                    onclick={toggleMoreActions}
                                    aria-expanded={moreActionsOpen}
                                    aria-haspopup="menu"
                                >更多操作</button>
                                {#if moreActionsOpen}
                                <div class="more-actions-popover" role="menu">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        class="wk-btn wk-btn-sm wk-btn-ghost"
                                        onclick={() => runMoreAction(() => onMigrate(selectedTask))}
                                        disabled={!canMigrateTask(selectedTask)}
                                        title={getMigrationTooltip(selectedTask)}
                                    >迁移到今天</button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        class="wk-btn wk-btn-sm wk-btn-ghost"
                                        onclick={() => runMoreAction(() => onPostpone(selectedTask, "tomorrow"))}
                                    >推迟到明天</button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        class="wk-btn wk-btn-sm wk-btn-ghost"
                                        onclick={() => runMoreAction(() => onPostpone(selectedTask, "nextWeek"))}
                                    >推迟到下周</button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        class="wk-btn wk-btn-sm wk-btn-ghost"
                                        onclick={() => runMoreAction(() => onOpenBlock(selectedTask.blockId))}
                                    >打开块</button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        class="wk-btn wk-btn-sm wk-btn-ghost"
                                        onclick={() => runMoreAction(() => onOpenDoc(selectedTask.sourceDocId))}
                                    >打开日记</button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        class="wk-btn wk-btn-sm wk-btn-danger"
                                        onclick={() => runMoreAction(() => onDelete(selectedTask))}
                                    >删除</button>
                                </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                {:else}
                    <WorkspaceEmptyState title="请选择一个任务" description="从左侧列表选择任务以查看详情。" />
                {/if}
            </div>
        </div>
    {/if}
</section>

<style>
    .task-panel {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .panel-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--wk-ink);
        letter-spacing: -0.01em;
    }

    .tag-filter-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 8px;
        background: var(--wk-background);
        border: 1px solid var(--wk-border);
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .tag-filter-chip strong {
        color: var(--wk-primary);
        font-weight: 600;
    }

    .clear-tag-btn {
        padding: 2px 8px;
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: transparent;
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        cursor: pointer;
        margin-left: auto;
    }

    .clear-tag-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .date-filter-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 8px;
        background: var(--wk-background);
        border: 1px solid var(--wk-border);
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .date-filter-chip strong {
        color: var(--wk-primary);
        font-weight: 600;
    }

    .clear-date-btn {
        padding: 2px 8px;
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: transparent;
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        cursor: pointer;
        margin-left: auto;
    }

    .clear-date-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    /* stats summary */
    .stats-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .stat-chip-btn {
        font-size: var(--wk-text-sm);
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--wk-background);
        border: 1px solid var(--wk-border);
        color: var(--wk-ink-muted);
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s;
    }

    .stat-chip-btn:hover {
        border-color: var(--wk-primary);
        background: color-mix(in srgb, var(--wk-primary) 8%, var(--wk-background));
    }

    .stat-chip-btn.danger {
        background: var(--wk-error-bg);
        border-color: var(--wk-error-border);
        color: var(--wk-error);
    }

    .stat-chip-btn.danger:hover {
        background: var(--wk-error-bg);
        border-color: var(--wk-error-border);
    }

    .stat-chip-btn.warning {
        background: color-mix(in srgb, var(--wk-primary) 6%, transparent);
        border-color: color-mix(in srgb, var(--wk-primary) 25%, transparent);
        color: var(--wk-primary);
    }

    .stat-chip-btn.warning:hover {
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        border-color: color-mix(in srgb, var(--wk-primary) 45%, transparent);
    }

    .stat-chip-btn.active {
        border-color: var(--wk-primary);
        background: color-mix(in srgb, var(--wk-primary) 12%, var(--wk-background));
        font-weight: 600;
    }

    .stat-chip-btn.danger.active {
        background: var(--wk-error-bg);
        border-color: var(--wk-error);
    }

    .stat-chip-btn.warning.active {
        background: color-mix(in srgb, var(--wk-primary) 18%, transparent);
        border-color: color-mix(in srgb, var(--wk-primary) 55%, transparent);
    }

    .view-mode-tabs {
        display: inline-flex;
        width: fit-content;
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        overflow: hidden;
        background: var(--wk-surface);
    }

    .view-mode-tabs button {
        border: none;
        border-right: 1px solid var(--wk-border);
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 6px 14px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
        min-width: 58px;
    }

    .view-mode-tabs button:last-child {
        border-right: none;
    }

    .view-mode-tabs button:hover {
        background: color-mix(in srgb, var(--wk-primary) 7%, var(--wk-background));
    }

    .view-mode-tabs button.active {
        background: var(--wk-primary);
        color: var(--b3-theme-on-primary);
    }

    .task-board {
        display: grid;
        grid-template-columns: repeat(5, minmax(220px, 1fr));
        gap: 12px;
        align-items: start;
        overflow-x: auto;
        padding-bottom: 4px;
    }

    .task-board.time-board {
        grid-template-columns: repeat(5, minmax(210px, 1fr));
    }

    .task-group {
        min-width: 0;
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        overflow: hidden;
    }

    .task-group.tone-primary {
        border-top: 3px solid var(--wk-primary);
    }

    .task-group.tone-danger {
        border-top: 3px solid var(--wk-error);
    }

    .task-group.tone-warning {
        border-top: 3px solid var(--wk-primary);
    }

    .task-group.tone-success {
        border-top: 3px solid var(--wk-primary);
    }

    .task-group-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 12px 10px;
        border-bottom: 1px solid var(--wk-border);
        background: var(--wk-background);
    }

    .task-group-head h3 {
        margin: 0 0 3px;
        font-size: 13px;
        font-weight: 700;
        color: var(--wk-ink-secondary);
    }

    .task-group-head p {
        margin: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        line-height: 1.4;
    }

    .task-group-head > span {
        min-width: 24px;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--wk-surface);
        border: 1px solid var(--wk-border);
        color: var(--wk-ink-secondary);
        font-size: 12px;
        text-align: center;
        font-variant-numeric: tabular-nums;
    }

    .task-group-empty {
        padding: 18px 12px;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
        text-align: center;
    }

    .task-group-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        max-height: 400px;
        overflow-y: auto;
    }

    .task-card {
        border: 1px solid var(--wk-border);
        border-radius: 9px;
        background: var(--wk-background);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 9px;
    }

    .task-card.completed {
        opacity: 0.62;
    }

    .task-card.overdue {
        background: color-mix(in srgb, var(--wk-error) 8%, transparent);
        border-color: color-mix(in srgb, var(--wk-error) 8%, transparent);
    }

    .task-card-main {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
    }

    .task-card-main input {
        margin-top: 2px;
        width: 14px;
        height: 14px;
        accent-color: var(--wk-primary);
        flex-shrink: 0;
    }

    .task-card-content {
        min-width: 0;
        flex: 1;
    }

    .task-card-content strong {
        display: block;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
        line-height: 1.4;
        word-break: break-word;
    }

    .task-card.completed .task-card-content strong {
        text-decoration: line-through;
    }

    .task-card-content span {
        display: block;
        margin-top: 3px;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        line-height: 1.4;
        word-break: break-word;
    }

    .task-card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
    }

    .task-card-tags small {
        font-size: var(--wk-text-xs);
        padding: 1px 5px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 24%, transparent);
    }

    .task-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        padding-left: 22px;
    }

    .task-card-actions button {
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        padding: 3px 7px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
    }

    .task-card-actions button:hover:not(:disabled) {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    /* layout */
    .task-layout {
        display: grid;
        grid-template-columns: minmax(340px, 42%) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
        min-height: 400px;
    }

    .task-list-col {
        min-width: 0;
        max-width: 100%;
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: 520px;
    }

    .list-label {
        font-size: var(--wk-text-sm);
        font-weight: 600;
        color: var(--wk-ink-muted);
        padding: 10px 14px 8px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--wk-border);
    }

    .task-list-scroll {
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        padding: 4px 8px 8px;
        min-width: 0;
    }

    .task-list-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        border: none;
        border-radius: 8px;
        background: transparent;
        padding: 9px 12px;
        cursor: pointer;
        text-align: left;
        transition: background 0.12s;
        border-left: 3px solid transparent;
    }

    .task-list-item:hover {
        background: color-mix(in srgb, var(--wk-primary) 6%, transparent);
    }

    .task-list-item.selected {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        border-left-color: var(--wk-primary);
    }

    .task-list-item.completed {
        opacity: 0.6;
    }

    .task-list-item.completed .list-item-name {
        text-decoration: line-through;
    }

    .list-item-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }

    .list-item-check {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        cursor: pointer;
    }

    .list-item-check input[type="checkbox"] {
        width: 14px;
        height: 14px;
        accent-color: var(--wk-primary);
        cursor: pointer;
    }

    .list-item-name {
        font-size: var(--wk-text-base);
        font-weight: 500;
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }

    .list-item-badges {
        display: flex;
        gap: 3px;
        flex-shrink: 0;
    }

    .mini-badge {
        font-size: var(--wk-text-xs);
        padding: 1px 4px;
        border-radius: 999px;
        font-weight: 500;
        white-space: nowrap;
    }

    .mini-today { background: color-mix(in srgb, var(--wk-primary) 14%, transparent); color: var(--wk-primary); }
    .mini-overdue { background: color-mix(in srgb, var(--wk-error) 8%, transparent); color: var(--wk-error); }
    .mini-new { background: color-mix(in srgb, var(--wk-primary) 10%, transparent); color: var(--wk-primary); }
    .mini-migrated { background: color-mix(in srgb, var(--wk-primary) 10%, transparent); color: var(--wk-primary); }
    .mini-mig { background: color-mix(in srgb, var(--wk-primary) 10%, transparent); color: var(--wk-primary); }
    .mini-done { background: color-mix(in srgb, var(--wk-primary) 8%, transparent); color: var(--wk-primary); }

    .list-item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
    }

    .meta-chip {
        font-size: var(--wk-text-sm);
        padding: 1px 6px;
        border-radius: 999px;
        border: 1px solid var(--wk-border);
        background: var(--wk-background);
        color: var(--wk-ink-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 160px;
    }

    .meta-source {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .list-item-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
    }

    .list-item-tags span {
        font-size: var(--wk-text-xs);
        padding: 1px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
    }

    .tag-overflow {
        font-size: var(--wk-text-xs);
        padding: 1px 5px;
        border-radius: 999px;
        background: var(--wk-background);
        color: var(--wk-ink-muted);
        border: 1px solid var(--wk-border);
        white-space: nowrap;
    }

    /* detail */
    .task-detail-col {
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        min-height: 200px;
    }

    .detail-panel {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .detail-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
    }

    .detail-name {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--wk-ink-secondary);
        word-break: break-all;
    }

    .detail-badges {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        flex-shrink: 0;
    }

    .badge {
        font-size: var(--wk-text-xs);
        padding: 2px 7px;
        border-radius: 999px;
        font-weight: 500;
        white-space: nowrap;
    }

    .badge-active { background: color-mix(in srgb, var(--wk-primary) 12%, transparent); color: var(--wk-primary); border: 1px solid color-mix(in srgb, var(--wk-primary) 25%, transparent); }
    .badge-done { background: color-mix(in srgb, var(--wk-primary) 10%, transparent); color: var(--wk-primary); border: 1px solid color-mix(in srgb, var(--wk-primary) 25%, transparent); }
    .badge-danger { background: var(--wk-error-bg); color: var(--wk-error); border: 1px solid var(--wk-error-border); }

    /* Natural info layout */
    .detail-info-line {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }

    .info-chip {
        font-size: var(--wk-text-sm);
        padding: 3px 8px;
        border-radius: 6px;
        background: var(--wk-surface-2);
        color: var(--wk-ink-secondary);
        white-space: nowrap;
    }

    .info-label {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        margin-right: 4px;
    }

    .info-value {
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
    }

    .detail-tag {
        font-size: var(--wk-text-xs);
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent);
    }

    /* Advanced info grid (collapsed) */
    .detail-advanced-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 12px;
    }

    .adv-item {
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-background);
        padding: 5px 8px;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .adv-label {
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-muted);
    }

    .adv-value {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
        word-break: break-all;
    }

    /* More actions popover */
    .detail-more-actions {
        position: relative;
        display: inline-flex;
    }

    .more-actions-popover {
        position: absolute;
        z-index: 20;
        bottom: calc(100% + 8px);
        right: 0;
        display: grid;
        gap: 6px;
        min-width: 180px;
        padding: 10px;
        border: 1px solid var(--wk-border-subtle);
        border-radius: var(--wk-radius-md);
        background: var(--wk-bg-card);
        box-shadow: var(--wk-shadow-popover);
    }

    .more-actions-popover .wk-btn {
        justify-content: flex-start;
        text-align: left;
    }

    /* btn styles replaced by wk-btn system */

    .meta-label {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .meta-value {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
        word-break: break-all;
    }

    .detail-advanced {
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-background);
        padding: 12px;
    }

    .detail-advanced summary {
        font-size: var(--wk-text-sm);
        font-weight: 600;
        color: var(--wk-ink-secondary);
        cursor: pointer;
        user-select: none;
    }

    .detail-advanced[open] summary {
        margin-bottom: 12px;
    }

    .detail-section {
        border-top: 1px solid var(--wk-border);
        padding-top: 12px;
    }

    .section-label {
        font-size: var(--wk-text-sm);
        font-weight: 600;
        color: var(--wk-ink-muted);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .detail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
    }

    .detail-tags span {
        font-size: var(--wk-text-xs);
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent);
    }

    .detail-markdown {
        margin: 0;
        font-size: var(--wk-text-sm);
        line-height: 1.5;
        color: var(--wk-ink-secondary);
        white-space: pre-wrap;
        word-break: break-all;
        font-family: inherit;
        max-height: 10em;
        overflow-y: auto;
        padding: 8px;
        background: var(--wk-background);
        border-radius: 6px;
        border: 1px solid var(--wk-border);
    }

    .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-top: 16px;
        margin-top: 4px;
    }

    /* detail-actions uses wk-btn system — old styles removed */

    .panel-toolbar button {
        border: 1px solid var(--wk-primary);
        border-radius: 7px;
        background: var(--wk-primary);
        color: var(--b3-theme-on-primary);
        padding: 7px 14px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
    }

    .panel-toolbar button:hover {
        opacity: 0.88;
    }

    /* filter toolbar */
    .filters-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
    }

    .advanced-filters {
        position: relative;
        display: inline-flex;
    }

    .advanced-filter-popover {
        position: absolute;
        z-index: 20;
        top: calc(100% + 8px);
        right: 0;
        width: min(300px, calc(100vw - 48px));
        display: grid;
        gap: 8px;
        padding: 12px;
        border: 1px solid var(--wk-border-subtle, var(--wk-border));
        border-radius: var(--wk-radius-md, 10px);
        background: var(--wk-surface-1, var(--wk-surface));
        box-shadow: var(--wk-shadow-popover);
    }

    .advanced-filter-popover .filter-select,
    .advanced-filter-popover .clear-btn { width: 100%; }

    .task-panel :is(button, input, select, summary):focus-visible {
        outline: 2px solid var(--wk-primary);
        outline-offset: 2px;
    }

    .search-input {
        flex: 1 1 200px;
        min-width: 160px;
        padding: 6px 12px;
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-background);
        color: var(--wk-ink);
        font-size: var(--wk-text-sm);
        outline: none;
        transition: border-color 0.12s;
    }

    .search-input:focus {
        border-color: var(--wk-primary);
    }

    .filter-select {
        padding: 6px 10px;
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        cursor: pointer;
        outline: none;
        transition: border-color 0.12s;
    }

    .filter-select:focus {
        border-color: var(--wk-primary);
    }

    .clear-btn {
        padding: 6px 14px;
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: all 0.12s;
    }

    .clear-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .result-info {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .batch-toggle-btn {
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 3px 10px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: border-color 0.12s, color 0.12s;
    }

    .batch-toggle-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .batch-toolbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        padding: 10px 12px;
    }

    .batch-toolbar span {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        margin-right: 4px;
    }

    .batch-toolbar button {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 5px 10px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
    }

    .batch-toolbar button:hover:not(:disabled) {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .batch-select,
    .task-card-select {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        width: fit-content;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        cursor: pointer;
    }

    .batch-select input,
    .task-card-select input {
        width: 13px;
        height: 13px;
        accent-color: var(--wk-primary);
        cursor: pointer;
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.4;
    }

    @container (max-width: 900px) {
        .task-layout {
            grid-template-columns: 1fr;
        }

        .task-list-col {
            max-height: 340px;
        }

        .detail-meta-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    /* Premium workspace treatment: keep task behavior, replace the admin-table appearance. */
    .task-panel {
        display: flex;
        flex-direction: column;
        gap: 18px;
        max-width: 1480px;
        margin-inline: auto;
    }

    .task-panel .panel-toolbar {
        padding: 0 0 6px;
        border: 0;
        background: transparent;
    }

    .task-panel .panel-toolbar h2 {
        font-size: clamp(24px, 2.4vw, 32px);
        letter-spacing: -.035em;
    }

    .task-panel .filters-toolbar {
        padding: 8px;
        border: 1px solid var(--wk-border-subtle);
        border-radius: 16px;
        background: color-mix(in srgb, var(--wk-bg-card) 82%, transparent);
        box-shadow: var(--wk-shadow-xs);
    }

    .task-panel .search-input {
        min-height: 38px;
        padding-inline: 14px;
        border: 0;
        background: transparent;
        font-size: 14px;
    }

    .task-panel .view-mode-tabs {
        width: fit-content;
        padding: 4px;
        border: 0;
        border-radius: 13px;
        background: color-mix(in srgb, var(--wk-ink-muted) 9%, transparent);
    }

    .task-panel .view-mode-tabs button {
        min-width: 72px;
        padding: 8px 16px;
        border: 0;
        border-radius: 10px;
        background: transparent;
    }

    .task-panel .view-mode-tabs button.active {
        background: var(--wk-bg-card);
        color: var(--wk-primary);
        box-shadow: var(--wk-shadow-sm);
    }

    .task-panel .stats-summary { gap: 8px; }
    .task-panel .stat-chip-btn {
        padding: 6px 11px;
        border-color: transparent;
        background: var(--wk-surface-2);
        opacity: 1;
    }

    .task-panel .result-info { margin-top: -8px; }

    .task-panel .task-layout {
        grid-template-columns: minmax(340px, 42%) minmax(0, 1fr);
        gap: 18px;
    }

    .task-panel .task-list-col,
    .task-panel .task-detail-col {
        border-color: var(--wk-border-subtle);
        border-radius: var(--wk-radius-md);
        background: var(--b3-theme-surface);
        box-shadow: none;
    }

    .task-panel .list-label {
        padding: 15px 16px 11px;
        border-color: var(--wk-divider);
        text-transform: none;
        letter-spacing: 0;
        font-size: 12px;
    }

    .task-panel .task-list-scroll { padding: 8px; }
    .task-panel .task-list-item {
        padding: 13px 14px;
        border-left: 0;
        border-radius: 13px;
        min-height: 68px;
        justify-content: center;
    }
    .task-panel .task-list-item + .task-list-item { margin-top: 3px; }
    .task-panel .task-list-item.selected {
        background: var(--wk-primary-soft);
        box-shadow: inset 0 0 0 1px var(--wk-primary-border);
    }
    .task-panel .list-item-name { font-size: 13px; font-weight: 600; }

    .task-panel .detail-panel { padding: clamp(20px, 2.4vw, 32px); gap: 22px; }
    .task-panel .detail-name { font-size: clamp(20px, 2vw, 27px); letter-spacing: -.03em; }
    .task-panel .detail-meta-grid { gap: 10px; }
    .task-panel .meta-item {
        padding: 11px 13px;
        border-color: transparent;
        border-radius: 12px;
        background: var(--wk-surface-2);
    }
    .task-panel .detail-advanced { border-color: var(--wk-divider); border-radius: 13px; }
    .task-panel .detail-actions {
        gap: 8px;
        padding-top: 16px;
        border: 0;
    }
    .task-panel .detail-actions .wk-btn {
        min-height: 34px;
        padding: 7px 12px;
        border-radius: 10px;
    }

    @container (max-width: 900px) {
        .task-panel .task-layout { grid-template-columns: 1fr; }
        .task-panel .task-list-col { max-height: 340px; }
        .task-panel .detail-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @container (max-width: 500px) {
        .task-panel .detail-meta-grid { grid-template-columns: 1fr; }
        .task-panel .panel-toolbar { align-items: flex-start; }
        .task-panel .panel-toolbar button { flex-shrink: 0; }
    }
</style>
