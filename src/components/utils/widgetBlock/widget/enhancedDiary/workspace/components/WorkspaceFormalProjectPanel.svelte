<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { isEnhancedDiaryProjectStorageReady, type EnhancedDiaryConfig } from "../../enhancedDiaryTypes";
    import type { EnhancedDiaryProjectIndexPayload } from "../../enhancedDiaryProjectTypes";
    import {
        isEnhancedDiaryProjectActiveBranch,
        isEnhancedDiaryProjectEffectivelyActive,
        isEnhancedDiaryProjectEffectivelyArchived,
        resolveEnhancedDiaryProjectTarget,
    } from "../../enhancedDiaryProjectIndex";
    import {
        createEnhancedDiaryRootProject,
        createEnhancedDiarySubproject,
        EnhancedDiaryProjectCreatedButNotVerifiedError,
        loadEnhancedDiaryProjectIndexForWorkspace,
    } from "../enhancedDiaryWorkspaceProjectService";
    import { rebuildEnhancedDiaryProjectIndex } from "../../enhancedDiaryProjectIndex";
    import {
        loadEnhancedDiaryProjectContent,
        loadEnhancedDiaryProjectOverviewSnapshot,
        saveEnhancedDiaryProjectContent,
        type EnhancedDiaryProjectContentField,
        type EnhancedDiaryProjectOverviewSnapshot,
    } from "../enhancedDiaryWorkspaceProjectContent";
    import WorkspaceProjectPicker from "./WorkspaceProjectPicker.svelte";
    import WorkspaceProjectTaskList from "./WorkspaceProjectTaskList.svelte";
    import WorkspaceProjectRecordList from "./WorkspaceProjectRecordList.svelte";
    import WorkspaceProjectOverview from "./WorkspaceProjectOverview.svelte";
    import WorkspaceProjectTimeline from "./WorkspaceProjectTimeline.svelte";
    import WorkspaceProjectIcon from "./WorkspaceProjectIcon.svelte";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import { readEnhancedDiaryProjectRecordIndex, type EnhancedDiaryProjectRecordIndexItem } from "../../enhancedDiaryProjectRecordIndex";
    import {
        analyzeEnhancedDiaryProject,
        filterProjectRecords,
        filterProjectTasks,
        type ProjectRecordViewFilter,
        type ProjectTaskViewFilter,
        type ProjectTimelineRange,
        type ProjectTimelineTypeFilter,
    } from "../enhancedDiaryWorkspaceProjectAnalytics";

    interface Props {
        config: EnhancedDiaryConfig;
        onOpenDoc?: (docId: string) => void;
        tasks?: EnhancedDiaryWorkspaceTask[];
        onOpenBlock?: (blockId: string) => void;
        initialTargetId?: string;
        selectVersion?: number;
        workspaceMutationVersion?: number;
        taskManagementEnabled?: boolean;
        onCreateTask?: (targetId: string) => void;
        onOpenTaskCenter?: (targetId: string) => void;
        onEditTask?: (task: EnhancedDiaryWorkspaceTask) => void;
        onToggleTask?: (task: EnhancedDiaryWorkspaceTask) => void | Promise<void>;
        onDeleteTask?: (task: EnhancedDiaryWorkspaceTask) => void;
        onCreateRecord?: (targetId: string) => void;
        onEditRecord?: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onDeleteRecord?: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onConvertRecordToTask?: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onArchiveProject?: (targetId: string) => void;
        onRestoreProject?: (targetId: string) => void;
    }
    let {
        config, onOpenDoc, tasks = [], onOpenBlock, initialTargetId = "", selectVersion = 0,
        workspaceMutationVersion = 0, taskManagementEnabled = true,
        onCreateTask, onOpenTaskCenter, onEditTask, onToggleTask, onDeleteTask,
        onCreateRecord, onEditRecord, onDeleteRecord, onConvertRecordToTask,
        onArchiveProject, onRestoreProject,
    }: Props = $props();

    const EMPTY_INDEX: EnhancedDiaryProjectIndexPayload = {
        version: 1, updatedAt: "", containerSignature: "", complete: false, roots: {}, nodes: {},
    };
    const FIELDS: EnhancedDiaryProjectContentField[] = ["项目概览", "项目目标", "当前重点", "阶段总结", "最终总结"];
    const EMPTY_SNAPSHOT: EnhancedDiaryProjectOverviewSnapshot = { overview: "", goal: "", focus: "" };
    let index = $state<EnhancedDiaryProjectIndexPayload>(EMPTY_INDEX);
    let loading = $state(true);
    let busy = $state(false);
    let error = $state("");
    let selectedTargetId = $state("");
    let createMode = $state<"" | "root" | "child">("");
    let projectName = $state("");
    let overview = $state("");
    let goal = $state("");
    let focus = $state("");
    let activeField = $state<EnhancedDiaryProjectContentField>("项目概览");
    let fieldContent = $state("");
    let fieldHistory = $state("");
    let contentLoading = $state(false);
    let overviewSnapshot = $state<EnhancedDiaryProjectOverviewSnapshot>(EMPTY_SNAPSHOT);
    let recordItems = $state<EnhancedDiaryProjectRecordIndexItem[]>([]);
    let detailTab = $state<"overview" | "tasks" | "records" | "timeline" | "content">("overview");
    let taskViewFilter = $state<ProjectTaskViewFilter>("all");
    let recordViewFilter = $state<ProjectRecordViewFilter>("all");
    let timelineTypeFilter = $state<ProjectTimelineTypeFilter>("all");
    let timelineRange = $state<ProjectTimelineRange>("30");
    let timelineDateFilter = $state("");
    let aggregateMode: "all" | "direct" = $state("all");
    let relatedTagFilter = $state("");
    let appliedSelectVersion = $state(0);
    let appliedMutationVersion = $state(0);
    let filterPopoverOpen = $state(false);
    let filterButtonRef = $state<HTMLButtonElement | null>(null);
    let filterPopoverRef = $state<HTMLDivElement | null>(null);
    let projectLifecycleFilter = $state<"active" | "archived" | "all">("active");

    const selectedTarget = $derived(resolveEnhancedDiaryProjectTarget(index, selectedTargetId));
    const selectedRootId = $derived(selectedTarget?.rootProjectId || "");
    const selectedArchived = $derived(isEnhancedDiaryProjectEffectivelyArchived(index, selectedTargetId));
    const selectedUnderArchivedAncestor = $derived(selectedArchived && selectedTarget?.status === "active");
    const storageReady = $derived(isEnhancedDiaryProjectStorageReady(config.projectStorage));
    function directTargetMatchesSelectedLifecycle(projectTargetId: string | undefined): boolean {
        if (!projectTargetId || !selectedTarget) return false;
        if (selectedTarget.status === "archived") return true;
        return isEnhancedDiaryProjectActiveBranch(index, projectTargetId, selectedTarget.id);
    }
    const relatedTasksBase = $derived(tasks.filter((task) => selectedTargetId &&
        directTargetMatchesSelectedLifecycle(task.projectTargetId) &&
        (aggregateMode === "direct" ? task.projectTargetId === selectedTargetId : task.projectTargetId === selectedTargetId || task.projectAncestorTargetIds?.includes(selectedTargetId))));
    const relatedRecordsBase = $derived(recordItems.filter((record) => selectedTargetId &&
        directTargetMatchesSelectedLifecycle(record.projectTargetId) &&
        (aggregateMode === "direct" ? record.projectTargetId === selectedTargetId : record.projectTargetId === selectedTargetId || index.nodes[record.projectTargetId]?.ancestorTargetIds.includes(selectedTargetId))));
    const relatedTasks = $derived(relatedTasksBase.filter((task) => !relatedTagFilter || task.tags.includes(relatedTagFilter)));
    const relatedRecords = $derived(relatedRecordsBase.filter((record) => !relatedTagFilter || record.tags.includes(relatedTagFilter)));
    const visibleTasks = $derived(filterProjectTasks(relatedTasks, taskViewFilter));
    const visibleRecords = $derived(filterProjectRecords(relatedRecords, recordViewFilter));
    const analytics = $derived.by(() => {
        const value = analyzeEnhancedDiaryProject({ tasks: relatedTasks, records: relatedRecords, index, selectedTargetId });
        return selectedArchived ? { ...value, overdueTasks: 0, nextTasks: [] } : value;
    });
    const tagDistribution = $derived.by(() => {
        const counts = new Map<string, number>();
        relatedTasksBase.flatMap((task) => task.tags).concat(relatedRecordsBase.flatMap((record) => record.tags)).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
        return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    });
    const activeFilterCount = $derived(
        (aggregateMode !== "all" ? 1 : 0) + (relatedTagFilter ? 1 : 0)
    );

    function orderedProjectTargetIds(source: EnhancedDiaryProjectIndexPayload = index): string[] {
        const children = new Map<string, typeof source.nodes[string][]>();
        for (const node of Object.values(source.nodes)) {
            const list = children.get(node.parentTargetId) || [];
            list.push(node);
            children.set(node.parentTargetId, list);
        }
        for (const list of children.values()) list.sort((a, b) => a.order - b.order);
        const result: string[] = [];
        const appendChildren = (parentId: string) => {
            for (const child of children.get(parentId) || []) {
                result.push(child.id);
                appendChildren(child.id);
            }
        };
        for (const root of Object.values(source.roots).sort((a, b) => a.order - b.order)) {
            result.push(root.id);
            appendChildren(root.id);
        }
        return result;
    }

    function targetMatchesLifecycleFilter(
        targetId: string,
        filter: "active" | "archived" | "all" = projectLifecycleFilter,
        source: EnhancedDiaryProjectIndexPayload = index,
    ): boolean {
        if (filter === "all") return Boolean(resolveEnhancedDiaryProjectTarget(source, targetId));
        return filter === "active"
            ? isEnhancedDiaryProjectEffectivelyActive(source, targetId)
            : isEnhancedDiaryProjectEffectivelyArchived(source, targetId);
    }

    function firstTargetForLifecycleFilter(
        filter: "active" | "archived" | "all",
        source: EnhancedDiaryProjectIndexPayload = index,
    ): string {
        return orderedProjectTargetIds(source).find((id) => targetMatchesLifecycleFilter(id, filter, source)) || "";
    }

    async function switchProjectLifecycleFilter(filter: "active" | "archived" | "all"): Promise<void> {
        projectLifecycleFilter = filter;
        const nextId = targetMatchesLifecycleFilter(selectedTargetId, filter)
            ? selectedTargetId
            : firstTargetForLifecycleFilter(filter);
        await selectTarget(nextId);
    }

    async function refresh(selectId = selectedTargetId, forceRebuild = false): Promise<void> {
        if (!storageReady) {
            index = EMPTY_INDEX; loading = false; return;
        }
        loading = true; error = "";
        try {
            const previousStatus = resolveEnhancedDiaryProjectTarget(index, selectId)?.status;
            if (forceRebuild) {
                const status = await rebuildEnhancedDiaryProjectIndex(config.projectStorage);
                if (status.lastStatus !== "success") throw new Error(status.lastMessage || "项目索引重建失败");
            }
            index = await loadEnhancedDiaryProjectIndexForWorkspace(config.projectStorage);
            if (config.dailyNotebookId) {
                const recordIndex = await readEnhancedDiaryProjectRecordIndex(config.dailyNotebookId);
                recordItems = Object.values(recordIndex.items);
            }
            const refreshedTarget = resolveEnhancedDiaryProjectTarget(index, selectId);
            if (refreshedTarget && previousStatus && refreshedTarget.status !== previousStatus) {
                projectLifecycleFilter = refreshedTarget.status;
                selectedTargetId = refreshedTarget.id;
            } else if (refreshedTarget && targetMatchesLifecycleFilter(refreshedTarget.id)) {
                selectedTargetId = refreshedTarget.id;
            } else {
                selectedTargetId = firstTargetForLifecycleFilter(projectLifecycleFilter);
            }
            await loadOverviewSnapshot();
            if (detailTab === "content") await loadField();
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "项目索引加载失败";
        } finally { loading = false; }
    }

    async function loadField(): Promise<void> {
        if (!selectedTargetId) { fieldContent = ""; return; }
        contentLoading = true;
        try {
            const loadedContent = await loadEnhancedDiaryProjectContent({
                storage: config.projectStorage, targetId: selectedTargetId, field: activeField,
            });
            if (activeField === "阶段总结") { fieldHistory = loadedContent; fieldContent = ""; }
            else { fieldHistory = ""; fieldContent = loadedContent; }
        } catch (reason) {
            showMessage(reason instanceof Error ? reason.message : "项目内容读取失败", 3500);
        } finally { contentLoading = false; }
    }

    async function loadOverviewSnapshot(): Promise<void> {
        const targetId = selectedTargetId;
        if (!targetId) { overviewSnapshot = EMPTY_SNAPSHOT; return; }
        overviewSnapshot = EMPTY_SNAPSHOT;
        try {
            const snapshot = await loadEnhancedDiaryProjectOverviewSnapshot({ storage: config.projectStorage, targetId });
            if (selectedTargetId === targetId) overviewSnapshot = snapshot;
        } catch (reason) {
            if (selectedTargetId === targetId) overviewSnapshot = EMPTY_SNAPSHOT;
            console.warn("[WorkspaceFormalProjectPanel] project overview snapshot failed", reason);
        }
    }

    async function selectTarget(id: string): Promise<void> {
        selectedTargetId = id;
        await loadOverviewSnapshot();
        if (detailTab === "content") await loadField();
    }

    async function selectField(field: EnhancedDiaryProjectContentField): Promise<void> {
        activeField = field;
        await loadField();
    }

    function clearCreateFields(): void {
        projectName = "";
        overview = "";
        goal = "";
        focus = "";
    }

    function openCreateRoot(): void {
        clearCreateFields();
        createMode = "root";
    }

    function openCreateChild(): void {
        if (selectedArchived) return;
        clearCreateFields();
        createMode = "child";
    }

    function closeCreateForm(): void {
        createMode = "";
        clearCreateFields();
    }

    async function submitCreate(): Promise<void> {
        if (busy || !createMode) return;
        busy = true;
        try {
            const id = createMode === "root"
                ? await createEnhancedDiaryRootProject({
                    storage: config.projectStorage,
                    name: projectName,
                    overview,
                    goal,
                    focus,
                })
                : await createEnhancedDiarySubproject({ storage: config.projectStorage, parentTargetId: selectedTargetId, name: projectName });
            closeCreateForm();
            projectLifecycleFilter = "active";
            await refresh(id);
            showMessage("项目创建成功", 2500);
        } catch (reason) {
            if (reason instanceof EnhancedDiaryProjectCreatedButNotVerifiedError) {
                closeCreateForm();
                projectLifecycleFilter = "active";
                await refresh(reason.docId);
                showMessage(reason.message, 4500);
            } else {
                showMessage(reason instanceof Error ? reason.message : "项目创建失败", 4500);
            }
        } finally { busy = false; }
    }

    async function saveField(): Promise<void> {
        if (!selectedTargetId || busy) return;
        busy = true;
        try {
            const result = await saveEnhancedDiaryProjectContent({
                storage: config.projectStorage, targetId: selectedTargetId, field: activeField, content: fieldContent,
            });
            await Promise.all([loadField(), loadOverviewSnapshot()]);
            if (result.status === "partial") {
                showMessage("内容已经保存，但旧正文清理未完成，请打开项目文档检查。", 4500);
            } else {
                showMessage(activeField === "阶段总结" ? "阶段总结已追加" : `${activeField}已保存`, 2500);
            }
        } catch (reason) {
            showMessage(reason instanceof Error ? reason.message : "项目内容保存失败", 4500);
        } finally { busy = false; }
    }

    function closeFilterPopover(): void { filterPopoverOpen = false; }
    function toggleFilterPopover(event?: MouseEvent): void {
        event?.stopPropagation();
        filterPopoverOpen = !filterPopoverOpen;
    }
    function resetFilters(): void {
        aggregateMode = "all";
        relatedTagFilter = "";
    }
    function showTasks(filter: ProjectTaskViewFilter): void { taskViewFilter = filter; detailTab = "tasks"; }
    function showRecords(filter: ProjectRecordViewFilter): void { recordViewFilter = filter; detailTab = "records"; }
    function showTimeline(date = ""): void { timelineDateFilter = date; detailTab = "timeline"; }
    function editOverviewField(field: EnhancedDiaryProjectContentField): void { activeField = field; detailTab = "content"; void loadField(); }
    function showProjectContent(): void { detailTab = "content"; void loadField(); }
    function formatArchivedAt(value: string): string {
        if (!value) return "时间未记录";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }
    function handleFilterPopoverClick(event: MouseEvent): void {
        const target = event.target as Node | null;
        if (!target) return;
        if (filterPopoverRef?.contains(target) || filterButtonRef?.contains(target)) return;
        closeFilterPopover();
    }
    function handleFilterKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape" && filterPopoverOpen) {
            event.preventDefault();
            closeFilterPopover();
        }
    }

    onMount(() => {
        appliedMutationVersion = workspaceMutationVersion;
        void refresh();
        document.addEventListener("click", handleFilterPopoverClick);
        document.addEventListener("keydown", handleFilterKeydown);
    });
    onDestroy(() => {
        document.removeEventListener("click", handleFilterPopoverClick);
        document.removeEventListener("keydown", handleFilterKeydown);
    });

    $effect(() => {
        if (selectVersion <= appliedSelectVersion || !initialTargetId) return;
        if (loading) return;
        if (!index.updatedAt) return;
        const target = resolveEnhancedDiaryProjectTarget(index, initialTargetId);
        if (target) {
            appliedSelectVersion = selectVersion;
            projectLifecycleFilter = isEnhancedDiaryProjectEffectivelyArchived(index, target.id) ? "archived" : "active";
            void selectTarget(initialTargetId);
            return;
        }
        if (index.complete && Object.keys(index.roots).length > 0) {
            const fallbackId = firstTargetForLifecycleFilter(projectLifecycleFilter);
            appliedSelectVersion = selectVersion;
            void selectTarget(fallbackId);
            if (fallbackId) {
                showMessage("目标项目已失效，已回退到当前状态下的第一个项目；项目关系需要维护。", 4000);
            } else {
                showMessage("目标项目已失效，当前状态筛选下暂无可选项目。", 4000);
            }
        }
    });

    $effect(() => {
        if (workspaceMutationVersion <= appliedMutationVersion || loading) return;
        appliedMutationVersion = workspaceMutationVersion;
        void refresh(selectedTargetId);
    });

    $effect(() => {
        if (!taskManagementEnabled && detailTab === "tasks") detailTab = "overview";
    });
</script>

<section class="formal-project-panel">
    <header class="wk-page-header project-header">
        <div><h2 class="wk-page-title">项目</h2><p class="wk-page-description">项目文档负责长期结构；任务和记录仍保存在日记中。</p></div>
        <div class="header-actions">
            <button type="button" class="wk-btn wk-btn-primary" onclick={openCreateRoot} disabled={!storageReady || busy}><WorkspaceProjectIcon name="projectAdd" />新建项目</button>
            <button type="button" class="wk-btn wk-btn-secondary" onclick={() => refresh(selectedTargetId, true)} disabled={!storageReady || busy}><WorkspaceProjectIcon name="activity" />刷新索引</button>
        </div>
    </header>

    {#if !storageReady}
        <WorkspaceEmptyState title="尚未配置项目位置" description="请在工作台设置的“项目”分类中选择专用笔记本或父文档。" />
    {:else if loading}
        <p class="state-text">正在加载项目索引…</p>
    {:else if error}
        <WorkspaceEmptyState title="项目索引不可用" description={error} />
    {:else}
        {#if createMode}
            <form class="create-card" onsubmit={(event) => { event.preventDefault(); void submitCreate(); }}>
                <div><strong>{createMode === "root" ? "新建根项目" : `在“${selectedTarget?.title || "当前项目"}”下新建子项目`}</strong><small>{createMode === "root" ? "只创建项目文档，不自动插入空结构标题。" : "插件会创建正确层级的标题并设置稳定项目节点属性。"}</small></div>
                <input class="b3-text-field" bind:value={projectName} maxlength="100" required placeholder="请输入具体、可识别的项目名称" />
                {#if createMode === "root"}
                    <textarea class="b3-text-field" bind:value={overview} rows="3" placeholder="简要说明项目背景、范围或需要解决的问题（可选）"></textarea>
                    <textarea class="b3-text-field" bind:value={goal} rows="3" placeholder="说明项目希望达到的结果或完成标准（可选）"></textarea>
                    <textarea class="b3-text-field" bind:value={focus} rows="3" placeholder="说明现阶段最需要推进的内容（可选）"></textarea>
                {/if}
                <div class="form-actions">
                    <button type="button" class="wk-btn wk-btn-secondary" onclick={closeCreateForm}>取消</button>
                    <button type="submit" class="wk-btn wk-btn-primary" disabled={busy}>{busy ? "创建中…" : "创建"}</button>
                </div>
            </form>
        {/if}

        {#if Object.keys(index.roots).length === 0}
            {#if !index.complete}
                <WorkspaceEmptyState title="项目索引尚未建立或未完成" description="请刷新或重建项目索引后再查看项目。" />
                <div class="empty-actions">
                    <button type="button" class="wk-btn wk-btn-secondary" onclick={() => refresh(selectedTargetId, true)} disabled={busy}>重建项目索引</button>
                </div>
            {:else}
                <WorkspaceEmptyState title="暂无项目" description="在当前项目容器中创建第一个根项目。" />
            {/if}
        {:else}
            <div class="project-layout">
                <aside class="tree-card">
                    <div class="tree-head">
                        <h3>项目树</h3>
                        <div class="tree-filters" aria-label="项目状态筛选">
                            <button type="button" class:active={projectLifecycleFilter === "active"} onclick={() => void switchProjectLifecycleFilter("active")}>进行中</button>
                            <button type="button" class:active={projectLifecycleFilter === "archived"} onclick={() => void switchProjectLifecycleFilter("archived")}>已归档</button>
                            <button type="button" class:active={projectLifecycleFilter === "all"} onclick={() => void switchProjectLifecycleFilter("all")}>全部</button>
                        </div>
                    </div>
                    <WorkspaceProjectPicker {index} value={selectedTargetId} allowClear={false} statusFilter={projectLifecycleFilter} preserveSelected={false} onChange={(id) => void selectTarget(id)} />
                </aside>
                <article class="detail-card">
                    {#if selectedTarget}
                        <div class="target-head">
                            <div><div class="target-title"><h3>{selectedTarget.title}</h3>{#if selectedArchived}<span class="archive-badge"><WorkspaceProjectIcon name="archive" size={14} />{selectedUnderArchivedAncestor ? "归档分支" : "已归档"}</span>{/if}</div><p>{selectedTarget.pathTitles.join(" / ")}</p><small><WorkspaceProjectIcon name="clock" size={15} />{selectedUnderArchivedAncestor ? "上级项目已归档，当前项目不能新增内容。" : selectedArchived ? `归档时间：${formatArchivedAt(selectedTarget.archivedAt)}` : `最近活动：${analytics.lastActivityDate || "暂无"}`}</small></div>
                        </div>
                        <div class="project-quick-actions" aria-label="当前项目快速操作">
                            {#if taskManagementEnabled}<button type="button" class="wk-btn wk-btn-secondary" onclick={() => onOpenTaskCenter?.(selectedTargetId)}><WorkspaceProjectIcon name="taskAdd" />进入任务中心</button>{/if}
                            {#if !selectedArchived && taskManagementEnabled}<button type="button" class="wk-btn wk-btn-secondary" onclick={() => onCreateTask?.(selectedTargetId)}><WorkspaceProjectIcon name="taskAdd" />新建任务</button>{/if}
                            {#if !selectedArchived}<button type="button" class="wk-btn wk-btn-secondary" onclick={() => onCreateRecord?.(selectedTargetId)}><WorkspaceProjectIcon name="recordAdd" />快速记录</button>{/if}
                            {#if !selectedArchived}<button type="button" class="wk-btn wk-btn-secondary" onclick={openCreateChild} disabled={busy}><WorkspaceProjectIcon name="projectAdd" />新建子项目</button>{/if}
                            <button type="button" class="wk-btn wk-btn-secondary" onclick={() => selectedTarget.kind === "node" ? onOpenBlock?.(selectedTarget.id) : onOpenDoc?.(selectedRootId)}><WorkspaceProjectIcon name="open" />{selectedTarget.kind === "node" ? "定位子项目" : "打开项目文档"}</button>
                            {#if selectedArchived}
                                <button type="button" class="wk-btn wk-btn-secondary" onclick={() => onRestoreProject?.(selectedTargetId)} disabled={busy}><WorkspaceProjectIcon name="restore" />恢复项目</button>
                            {:else}
                                <button type="button" class="wk-btn wk-btn-secondary" onclick={() => onArchiveProject?.(selectedTargetId)} disabled={busy}><WorkspaceProjectIcon name="archive" />归档项目</button>
                            {/if}
                        </div>
                        <nav class="field-tabs workspace-tabs">
                            <button type="button" class:active={detailTab === "overview"} onclick={() => (detailTab = "overview")}>概览</button>
                            {#if taskManagementEnabled}<button type="button" class:active={detailTab === "tasks"} onclick={() => (detailTab = "tasks")}>任务 {relatedTasks.length}</button>{/if}
                            <button type="button" class:active={detailTab === "records"} onclick={() => (detailTab = "records")}>记录 {relatedRecords.length}</button>
                            <button type="button" class:active={detailTab === "timeline"} onclick={() => (detailTab = "timeline")}>时间线</button>
                            <button type="button" class:active={detailTab === "content"} onclick={showProjectContent}>项目内容</button>
                        </nav>
                        <div class="aggregation-controls">
                            <div class="filter-popover-wrap">
                                <button
                                    type="button"
                                    class="wk-btn wk-btn-secondary filter-popover-btn"
                                    bind:this={filterButtonRef}
                                    onclick={(e) => toggleFilterPopover(e)}
                                    aria-expanded={filterPopoverOpen}
                                >
                                    筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
                                </button>
                                {#if filterPopoverOpen}
                                    <div class="filter-popover" bind:this={filterPopoverRef}>
                                        <div class="filter-popover-head">
                                            <strong>项目筛选</strong>
                                            <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={resetFilters}>重置</button>
                                        </div>
                                        <label class="filter-field">
                                            <span>聚合范围</span>
                                            <select class="filter-select" bind:value={aggregateMode} aria-label="聚合范围">
                                                <option value="all">包含所有后代</option>
                                                <option value="direct">仅当前节点</option>
                                            </select>
                                        </label>
                                        <label class="filter-field">
                                            <span>标签</span>
                                            <select class="filter-select" bind:value={relatedTagFilter} aria-label="标签筛选">
                                                <option value="">全部标签</option>
                                                {#each tagDistribution as item}<option value={item.tag}>{item.tag}</option>{/each}
                                            </select>
                                        </label>
                                    </div>
                                {/if}
                            </div>
                        </div>
                        {#if detailTab === "overview"}
                            <WorkspaceProjectOverview
                                {analytics}
                                snapshot={overviewSnapshot}
                                {taskManagementEnabled}
                                tags={tagDistribution}
                                activeTag={relatedTagFilter}
                                onShowTasks={showTasks}
                                onShowRecords={showRecords}
                                onShowTimeline={showTimeline}
                                onOpenTask={(task) => onOpenBlock?.(task.blockId)}
                                onOpenRecord={(record) => onOpenBlock?.(record.headingBlockId)}
                                onOpenBlock={(blockId) => onOpenBlock?.(blockId)}
                                onSelectChild={(id) => void selectTarget(id)}
                                onEditField={editOverviewField}
                                onSelectTag={(tag) => (relatedTagFilter = tag)}
                            />
                        {:else if detailTab === "content"}
                            <nav class="field-tabs">
                                {#each FIELDS as field}<button type="button" class:active={activeField === field} onclick={() => void selectField(field)}>{field}</button>{/each}
                            </nav>
                            <div class="field-editor">
                            {#if activeField === "阶段总结"}<p>每次保存会追加一条带时间的历史总结，不会覆盖旧内容。</p>{/if}
                            {#if activeField === "阶段总结" && fieldHistory}<pre class="stage-history">{fieldHistory}</pre>{/if}
                            <textarea class="b3-text-field" bind:value={fieldContent} rows="10" disabled={contentLoading} placeholder={contentLoading ? "读取中…" : `填写${activeField}`}></textarea>
                            <button type="button" class="wk-btn wk-btn-primary save-field" onclick={() => void saveField()} disabled={busy || contentLoading}>{activeField === "阶段总结" ? "追加阶段总结" : `保存${activeField}`}</button>
                            </div>
                        {:else if detailTab === "tasks"}
                            <WorkspaceProjectTaskList
                                tasks={visibleTasks}
                                projectTitle={selectedTarget.title}
                                currentTargetId={selectedTargetId}
                                currentTargetPath={selectedTarget.pathTitles}
                                {taskManagementEnabled}
                                viewFilter={taskViewFilter}
                                onFilterChange={(filter) => (taskViewFilter = filter)}
                                onCreate={selectedArchived ? undefined : () => onCreateTask?.(selectedTargetId)}
                                onToggle={(task) => onToggleTask?.(task)}
                                onEdit={(task) => onEditTask?.(task)}
                                onDelete={(task) => onDeleteTask?.(task)}
                                onOpen={(task) => onOpenBlock?.(task.blockId)}
                                onOpenProject={(id) => selectTarget(id)}
                            />
                        {:else if detailTab === "records"}
                            <WorkspaceProjectRecordList
                                records={visibleRecords}
                                projectTitle={selectedTarget.title}
                                currentTargetId={selectedTargetId}
                                currentTargetPath={selectedTarget.pathTitles}
                                viewFilter={recordViewFilter}
                                onFilterChange={(filter) => (recordViewFilter = filter)}
                                {taskManagementEnabled}
                                allowCreateTask={!selectedArchived}
                                onCreate={selectedArchived ? undefined : () => onCreateRecord?.(selectedTargetId)}
                                onEdit={(record) => onEditRecord?.(record)}
                                onDelete={(record) => onDeleteRecord?.(record)}
                                onConvertToTask={(record) => onConvertRecordToTask?.(record)}
                                onOpen={(record) => onOpenBlock?.(record.headingBlockId)}
                                onOpenProject={(id) => selectTarget(id)}
                            />
                        {:else if detailTab === "timeline"}
                            <WorkspaceProjectTimeline
                                events={analytics.timeline}
                                typeFilter={timelineTypeFilter}
                                range={timelineRange}
                                dateFilter={timelineDateFilter}
                                onTypeFilterChange={(filter) => (timelineTypeFilter = filter)}
                                onRangeChange={(range) => (timelineRange = range)}
                                onClearDate={() => (timelineDateFilter = "")}
                                onOpen={(blockId) => onOpenBlock?.(blockId)}
                            />
                        {/if}
                    {/if}
                </article>
            </div>
        {/if}
    {/if}
</section>

<style>
    .formal-project-panel { display: grid; gap: 16px; }
    .project-header, .target-head, .header-actions, .form-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    button:not(.wk-btn) { border: 1px solid var(--wk-border); border-radius: 7px; padding: 7px 11px; background: var(--wk-surface); color: var(--wk-ink-secondary); cursor: pointer; }
    button:not(.wk-btn):disabled { opacity: .55; cursor: not-allowed; }
    .create-card, .tree-card, .detail-card { border: 1px solid var(--wk-border); border-radius: 12px; background: var(--wk-surface); padding: 16px; }
    .create-card { display: grid; gap: 10px; }
    .create-card > div:first-child { display: grid; gap: 3px; }
    .create-card small, .target-head p, .target-head small, .field-editor p, .state-text { color: var(--wk-ink-muted); }
    .project-layout { display: grid; grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); gap: 14px; }
    h3 { margin: 0; color: var(--wk-ink-secondary); }
    .tree-card { display: grid; align-content: start; gap: 12px; }
    .tree-head, .tree-filters, .target-title, .archive-badge { display: flex; align-items: center; gap: 6px; }
    .tree-head { justify-content: space-between; flex-wrap: wrap; }
    .tree-filters button { min-height: 28px; padding: 4px 7px; font-size: 12px; }
    .tree-filters button.active { color: var(--wk-primary); border-color: var(--wk-primary); background: color-mix(in srgb, var(--wk-primary) 9%, transparent); }
    .target-title { flex-wrap: wrap; }
    .archive-badge { border: 1px solid var(--wk-border); border-radius: 999px; padding: 2px 7px; color: var(--wk-ink-muted); font-size: 12px; font-weight: 500; }
    .detail-card { min-width: 0; display: grid; align-content: start; gap: 14px; }
    .target-head p { margin: 4px 0 0; overflow-wrap: anywhere; }
    .target-head small { display: inline-flex; align-items: center; gap: 5px; margin-top: 5px; }
    .project-quick-actions { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
    .project-quick-actions .wk-btn, .header-actions .wk-btn { min-height: 32px; gap: 5px; }
    .field-tabs { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--wk-divider); padding-bottom: 10px; }
    .field-tabs button.active { color: var(--wk-primary); border-color: var(--wk-primary); background: color-mix(in srgb, var(--wk-primary) 9%, transparent); }
    .field-editor { display: grid; gap: 10px; }
    .field-editor p { margin: 0; font-size: 12px; }
    .stage-history { margin: 0; max-height: 220px; overflow: auto; white-space: pre-wrap; padding: 10px; border-radius: 8px; background: var(--wk-background); color: var(--wk-ink-muted); font-family: inherit; }
    .save-field { justify-self: end; }
    .workspace-tabs { border-bottom: 0; padding-bottom: 0; }
    .aggregation-controls { display: flex; gap: 8px; flex-wrap: wrap; }
    .aggregation-controls select { border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); padding: 6px 8px; }
    .empty-actions { display: flex; justify-content: center; margin-top: 10px; }
    .filter-popover-wrap { position: relative; }
    .filter-popover { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; min-width: 220px; max-width: min(320px, calc(100vw - 40px)); border: 1px solid var(--wk-border); border-radius: 12px; background: var(--wk-surface); padding: 12px; box-shadow: var(--wk-shadow-md); display: grid; gap: 10px; }
    .filter-popover-head { display: flex; align-items: center; justify-content: space-between; }
    .filter-field { display: grid; gap: 5px; }
    .filter-field span { font-size: var(--wk-text-sm); color: var(--wk-ink-muted); }
    .filter-select { border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); padding: 6px 8px; }
    @container (max-width: 760px) { .project-layout { grid-template-columns: 1fr; } .project-header { align-items: flex-start; flex-direction: column; } }
</style>
