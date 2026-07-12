<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { EnhancedDiaryWorkspaceProject } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { WorkspaceProjectStatusFilter } from "../enhancedDiaryWorkspaceNavigation";
    import { formatLocalDate } from "../enhancedDiaryWorkspaceDate";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        projects: EnhancedDiaryWorkspaceProject[];
        tasks: EnhancedDiaryWorkspaceTask[];
        onGoTasks?: (projectName?: string) => void;
        initialSelectedProjectName?: string;
        selectVersion?: number;
        initialStatusFilter?: WorkspaceProjectStatusFilter;
        filterVersion?: number;
    }

    let { projects, tasks, onGoTasks, initialSelectedProjectName = "", selectVersion = 0, initialStatusFilter = "all", filterVersion = 0 }: Props = $props();

    let searchText: string = $state("");
    let statusFilter: WorkspaceProjectStatusFilter = $state("all");
    let sortKey: "default" | "openDesc" | "todayDesc" | "staleDesc" | "healthDesc" | "nameAsc" = $state("default");
    let selectedProjectName: string | null = $state(null);

    const totalProjectCount = $derived(projects.length);
    const projectsWithOpenTasks = $derived(projects.filter((p) => p.openTaskCount > 0).length);
    const projectsWithTodayProgress = $derived(projects.filter((p) => p.hasTodayProgress).length);

    function getProjectTasks(projectName: string): EnhancedDiaryWorkspaceTask[] {
        return tasks.filter((task) => task.tags.includes(projectName));
    }

    function getProjectLastActivityDate(projectName: string): string {
        const project = projects.find((p) => p.name === projectName);
        return project?.lastActivityDate || "";
    }

    function getProjectInactiveDays(projectName: string): number | null {
        const project = projects.find((p) => p.name === projectName);
        return project?.inactiveDays ?? null;
    }

    function isProjectStale(projectName: string): boolean {
        const project = projects.find((p) => p.name === projectName);
        return project?.healthStatus === "stale" || project?.healthStatus === "idle";
    }

    function getHealthWeight(project: EnhancedDiaryWorkspaceProject): number {
        if (project.healthTone === "danger") return 3;
        if (project.healthTone === "warning") return 2;
        if (project.healthTone === "normal") return 1;
        return 0;
    }

    function getProjectRiskDescription(project: EnhancedDiaryWorkspaceProject): string {
        if (project.healthStatus === "overdue") return `存在 ${project.overdueTaskCount} 个逾期任务，建议优先清理截止风险。`;
        if (project.healthStatus === "pileup") return `仍有 ${project.openTaskCount} 个未完成任务，适合拆分或收敛下一步动作。`;
        if (project.healthStatus === "idle") return "项目有未完成任务，但长时间缺少推进记录，需要重新确认是否继续。";
        if (project.healthStatus === "stale") return `项目已停滞 ${project.inactiveDays ?? "-"} 天，可以补一条推进记录或迁移关键任务。`;
        if (project.healthStatus === "done") return "相关任务已经全部完成，可以在复盘中沉淀结果。";
        return "项目近期没有明显风险，保持当前推进节奏即可。";
    }

    function getProjectTimeline(projectName: string): Array<{
        key: string;
        date: string;
        title: string;
        description: string;
        tone: "progress" | "task" | "done" | "overdue";
    }> {
        const project = projects.find((p) => p.name === projectName);
        const items: Array<{
            key: string;
            date: string;
            title: string;
            description: string;
            tone: "progress" | "task" | "done" | "overdue";
        }> = [];

        if (project?.hasTodayProgress) {
            items.push({
                key: `${projectName}-today-progress`,
                date: formatLocalDate(new Date()),
                title: "今日推进",
                description: project.progressMarkdown?.split("\n").find((line) => line.trim())?.trim() || "今天有项目推进记录",
                tone: "progress",
            });
        }

        getProjectTasks(projectName).forEach((task) => {
            items.push({
                key: task.blockId,
                date: task.sourceDate || task.startDate || task.deadline || "无日期",
                title: task.completed ? "完成任务" : task.isOverdue ? "逾期任务" : "相关任务",
                description: task.taskname,
                tone: task.completed ? "done" : task.isOverdue ? "overdue" : "task",
            });
        });

        return items
            .sort((a, b) => {
                if (a.date === "无日期") return 1;
                if (b.date === "无日期") return -1;
                return b.date.localeCompare(a.date);
            })
            .slice(0, 8);
    }

    const riskyProjectCount = $derived(projects.filter((p) => p.healthTone === "danger" || p.healthTone === "warning").length);

    function matchProjectSearch(project: EnhancedDiaryWorkspaceProject, keyword: string): boolean {
        if (!keyword) return true;
        const kw = keyword.toLowerCase();
        if (project.name.toLowerCase().includes(kw)) return true;
        if (project.progressMarkdown?.toLowerCase().includes(kw)) return true;
        const projectTasks = getProjectTasks(project.name);
        return projectTasks.some(
            (t) =>
                t.taskname.toLowerCase().includes(kw) ||
                t.tags.some((tag) => tag.toLowerCase().includes(kw))
        );
    }

    const filteredProjects = $derived.by(() => {
        let result = projects;

        if (searchText.trim()) {
            const kw = searchText.trim().toLowerCase();
            result = result.filter((p) => matchProjectSearch(p, kw));
        }

        if (statusFilter !== "all") {
            result = result.filter((p) => {
                switch (statusFilter) {
                    case "open": return p.openTaskCount > 0;
                    case "todayProgress": return p.hasTodayProgress;
                    case "todayTask": return p.todayTaskCount > 0;
                    case "stale": return isProjectStale(p.name);
                    case "overdue": return p.overdueTaskCount > 0;
                    case "risk": return p.healthTone === "danger" || p.healthTone === "warning";
                    case "done": return p.taskCount > 0 && p.openTaskCount === 0;
                    default: return true;
                }
            });
        }

        if (sortKey !== "default") {
            result = [...result].sort((a, b) => {
                switch (sortKey) {
                    case "openDesc":
                        return b.openTaskCount - a.openTaskCount
                            || Number(b.hasTodayProgress) - Number(a.hasTodayProgress)
                            || b.todayTaskCount - a.todayTaskCount;
                    case "todayDesc":
                        return Number(b.hasTodayProgress) - Number(a.hasTodayProgress)
                            || b.todayTaskCount - a.todayTaskCount
                            || b.openTaskCount - a.openTaskCount;
                    case "staleDesc":
                        return Number(isProjectStale(b.name)) - Number(isProjectStale(a.name))
                            || (getProjectInactiveDays(b.name) ?? -1) - (getProjectInactiveDays(a.name) ?? -1)
                            || b.openTaskCount - a.openTaskCount;
                    case "healthDesc":
                        return getHealthWeight(b) - getHealthWeight(a)
                            || b.overdueTaskCount - a.overdueTaskCount
                            || b.openTaskCount - a.openTaskCount;
                    case "nameAsc":
                        return a.name.localeCompare(b.name, "zh-CN");
                    default: return 0;
                }
            });
        }

        return result;
    });

    function getSelectedProject(): EnhancedDiaryWorkspaceProject | undefined {
        if (selectedProjectName) {
            return filteredProjects.find((p) => p.name === selectedProjectName) || filteredProjects[0];
        }
        return filteredProjects[0];
    }

    function getSelectedProjectTasks(): EnhancedDiaryWorkspaceTask[] {
        const project = getSelectedProject();
        if (!project) return [];
        return getProjectTasks(project.name);
    }

    const selectedProject = $derived(getSelectedProject());
    const selectedProjectTasks = $derived(getSelectedProjectTasks());

    const selectedLastActivityDate = $derived(
        selectedProject ? getProjectLastActivityDate(selectedProject.name) : ""
    );
    const selectedProjectTimeline = $derived(
        selectedProject ? getProjectTimeline(selectedProject.name) : []
    );

    function formatProgress(lines: string[], maxLines: number = 8): string {
        return lines
            .slice(0, maxLines)
            .join("\n")
            .trim();
    }

    function clearFilters() {
        searchText = "";
        statusFilter = "all";
        sortKey = "default";
    }

    // Controlled popover for advanced filters (contains selects)
    let projectFilterOpen = $state(false);
    let projectFilterEl: HTMLElement | null = $state(null);

    function toggleProjectFilter(): void {
        projectFilterOpen = !projectFilterOpen;
    }

    function handleProjectFilterPointerdown(event: PointerEvent): void {
        if (projectFilterOpen && projectFilterEl && !projectFilterEl.contains(event.target as Node)) {
            projectFilterOpen = false;
        }
    }

    function handleProjectFilterKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            projectFilterOpen = false;
        }
    }

    onMount(() => {
        document.addEventListener("pointerdown", handleProjectFilterPointerdown);
        document.addEventListener("keydown", handleProjectFilterKeydown);
    });

    onDestroy(() => {
        document.removeEventListener("pointerdown", handleProjectFilterPointerdown);
        document.removeEventListener("keydown", handleProjectFilterKeydown);
    });

    let lastProjectSelectVersion = $state(0);
    let lastProjectFilterVersion = $state(0);

    $effect(() => {
        if (filterVersion <= lastProjectFilterVersion) return;
        lastProjectFilterVersion = filterVersion;
        statusFilter = initialStatusFilter;
        searchText = "";
        if (initialStatusFilter === "risk") {
            sortKey = "healthDesc";
        } else if (initialStatusFilter === "stale") {
            sortKey = "staleDesc";
        } else if (initialStatusFilter === "overdue") {
            sortKey = "healthDesc";
        } else {
            sortKey = "default";
        }
        selectedProjectName = null;
    });

    $effect(() => {
        if (selectVersion <= lastProjectSelectVersion) return;
        lastProjectSelectVersion = selectVersion;
        if (initialSelectedProjectName) {
            const found = projects.find((p) => p.name === initialSelectedProjectName);
            if (found) {
                searchText = "";
                statusFilter = "all";
                sortKey = "default";
                selectedProjectName = initialSelectedProjectName;
            }
        }
    });
</script>

<section class="project-panel-root">
    <div class="panel-header wk-page-header">
        <div>
            <h2 class="wk-page-title">项目</h2>
            <p class="panel-subtitle wk-page-description">查看项目当前状态和下一步。</p>
        </div>
    </div>

    {#if projects.length === 0}
        <WorkspaceEmptyState
            title="暂无项目数据"
            description="给任务添加标签，或在今日日记「项目推进」区块下添加三级项目标题后，这里会自动聚合。"
        />
    {:else}
        <div class="project-pulse" aria-label="项目摘要">
            <span><strong>{projectsWithTodayProgress}</strong> 个今天有进展</span>
            <span><strong>{projectsWithOpenTasks}</strong> 个仍在进行</span>
            <span class:danger={riskyProjectCount > 0}><strong>{riskyProjectCount}</strong> 个需要关注</span>
        </div>

        <div class="project-filter-card">
            <div class="project-filter-controls">
                <input
                    type="text"
                    class="project-filter-input"
                    placeholder="搜索项目、任务、推进记录..."
                    bind:value={searchText}
                />
                <button type="button" class="project-filter-clear" onclick={clearFilters}>清空筛选</button>
                <div class="project-advanced-filters" bind:this={projectFilterEl}>
                  <button type="button" onclick={toggleProjectFilter}
                    aria-expanded={projectFilterOpen} aria-haspopup="menu"
                  >筛选与排序</button>
                  {#if projectFilterOpen}
                  <div class="project-filter-popover" role="menu">
                <select class="project-filter-select" bind:value={statusFilter} aria-label="项目状态">
                    <option value="all">全部状态</option>
                    <option value="open">有未完成任务</option>
                    <option value="todayProgress">今日有推进</option>
                    <option value="todayTask">有今日任务</option>
                    <option value="stale">长期未推进</option>
                    <option value="overdue">存在逾期</option>
                    <option value="risk">风险项目</option>
                    <option value="done">全部完成</option>
                </select>
                <select class="project-filter-select" bind:value={sortKey} aria-label="项目排序">
                    <option value="default">默认排序</option>
                    <option value="openDesc">未完成多优先</option>
                    <option value="todayDesc">今日活跃优先</option>
                    <option value="staleDesc">长期未推进优先</option>
                    <option value="healthDesc">健康风险优先</option>
                    <option value="nameAsc">名称排序</option>
                </select>
                  </div>
                  {/if}
                </div>
            </div>
            <div class="project-filter-summary">
                当前显示 <strong>{filteredProjects.length}</strong> / 总计 <strong>{totalProjectCount}</strong> 个项目
            </div>
        </div>

        {#if filteredProjects.length === 0}
            <WorkspaceEmptyState
                title="暂无匹配项目"
                description="请调整筛选条件。"
            />
        {:else}
            <div class="project-layout">
                <div class="project-list-col">
                    <div class="list-label">项目列表</div>
                    <div class="project-list-scroll">
                        {#each filteredProjects as project}
                            <button
                                type="button"
                                class="project-list-item"
                                class:selected={selectedProject?.name === project.name}
                                class:has-today-progress={project.hasTodayProgress}
                                onclick={() => (selectedProjectName = project.name)}
                            >
                                <div class="list-item-main">
                                    <span class="list-item-name">{project.name}</span>
                                    <span class="list-item-badges">
                                        {#if project.hasTodayProgress}
                                            <span class="mini-badge mini-primary">今日推进</span>
                                        {/if}
                                        {#if project.openTaskCount > 0}
                                            <span class="mini-badge mini-warn">{project.openTaskCount}</span>
                                        {/if}
                                        {#if isProjectStale(project.name)}
                                            <span class="mini-badge mini-danger">未推进</span>
                                        {/if}
                                        <span class="mini-badge mini-health tone-{project.healthTone}">{project.healthLabel}</span>
                                    </span>
                                </div>
                                <div class="list-item-meta">
                                    <span>今日 {project.todayTaskCount} 任务</span>
                                    <span class="meta-sep">·</span>
                                    <span>共 {project.taskCount}</span>
                                    {#if getProjectLastActivityDate(project.name)}
                                        <span class="meta-sep">·</span>
                                        <span>最近 {getProjectLastActivityDate(project.name)}</span>
                                    {/if}
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="project-detail-col">
                    {#if selectedProject}
                        <div class="detail-panel">
                            <div class="detail-head">
                                <h3 class="detail-name">{selectedProject.name}</h3>
                                <div class="detail-badges">
                                    <span class="badge badge-health tone-{selectedProject.healthTone}">{selectedProject.healthLabel}</span>
                                    {#if selectedProject.hasTodayProgress}
                                        <span class="badge badge-primary">今日有推进</span>
                                    {/if}
                                </div>
                            </div>

                            <div class="detail-metrics">
                                <div class="metric-item">
                                    <span class="metric-label">未完成</span>
                                    <strong class="metric-value {selectedProject.openTaskCount > 0 ? 'warn' : ''}">{selectedProject.openTaskCount}</strong>
                                </div>
                                <div class="metric-item">
                                    <span class="metric-label">今日任务</span>
                                    <strong class="metric-value">{selectedProject.todayTaskCount}</strong>
                                </div>
                                <div class="metric-item">
                                    <span class="metric-label">逾期任务</span>
                                    <strong class="metric-value {selectedProject.overdueTaskCount > 0 ? 'danger' : ''}">{selectedProject.overdueTaskCount}</strong>
                                </div>
                                <div class="metric-item">
                                    <span class="metric-label">最近推进</span>
                                    <strong class="metric-value small">{selectedLastActivityDate || "-"}</strong>
                                </div>
                            </div>

                            {#if selectedProject.healthTone === "danger" || selectedProject.healthTone === "warning"}
                                <div class="project-health-box tone-{selectedProject.healthTone}">
                                    <div class="project-health-title">
                                        <WorkspaceIcon name={selectedProject.healthTone === "danger" ? "warning" : "projects"} size={15} />
                                        <strong>{selectedProject.healthLabel}</strong>
                                    </div>
                                    <p>{getProjectRiskDescription(selectedProject)}</p>
                                </div>
                            {:else if selectedProject.healthTone === "normal"}
                                <p class="project-health-ok">{selectedProject.healthLabel} — {getProjectRiskDescription(selectedProject)}</p>
                            {/if}

                            <div class="detail-section">
                                <div class="section-label">今日推进</div>
                                {#if selectedProject.progressMarkdown}
                                    {@const progressLines = selectedProject.progressMarkdown.split("\n").filter((l) => l.trim())}
                                    {#if progressLines.length > 0}
                                        <pre class="progress-content">{formatProgress(progressLines)}</pre>
                                    {/if}
                                {:else}
                                    <p class="empty-hint">今天暂无项目推进记录。</p>
                                {/if}
                            </div>

                            <div class="detail-section">
                                <div class="section-label">相关任务</div>
                                {#if selectedProjectTasks.length > 0}
                                    <div class="detail-task-list">
                                        {#each selectedProjectTasks.slice(0, 10) as task}
                                            <div class="detail-task-item" class:completed={task.completed} class:overdue={task.isOverdue}>
                                                <span class="task-status-icon">
                                                    {#if task.completed}
                                                        <WorkspaceIcon name="tasks" size={13} />
                                                    {:else if task.isOverdue}
                                                        <WorkspaceIcon name="warning" size={13} />
                                                    {:else}
                                                        <span class="task-status-dot"></span>
                                                    {/if}
                                                </span>
                                                <span class="task-name">{task.taskname}</span>
                                                <span class="task-meta">
                                                    {#if task.priority}{task.priority} {/if}
                                                    {#if task.startDate}{task.startDate}{/if}
                                                    {#if task.deadline} ~ {task.deadline}{/if}
                                                    {#if task.sourceDate} · {task.sourceDate}{/if}
                                                </span>
                                            </div>
                                        {/each}
                                    </div>
                                    {#if selectedProjectTasks.length > 10}
                                        <div class="more-hint">… 还有 {selectedProjectTasks.length - 10} 条任务，可到任务中心查看</div>
                                    {/if}
                                {:else}
                                    <p class="empty-hint">暂无相关任务。</p>
                                {/if}
                            </div>

                            <div class="detail-section">
                                <div class="section-label">项目时间线</div>
                                {#if selectedProjectTimeline.length > 0}
                                    <div class="project-timeline">
                                        {#each selectedProjectTimeline as item (item.key)}
                                            <div class="timeline-item tone-{item.tone}">
                                                <span class="timeline-dot"></span>
                                                <div class="timeline-content">
                                                    <strong>{item.title}</strong>
                                                    <span>{item.description}</span>
                                                </div>
                                                <time>{item.date}</time>
                                            </div>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="empty-hint">暂无可聚合的项目时间线。</p>
                                {/if}
                            </div>

                            {#if onGoTasks}
                                <button type="button" class="btn-gotasks" onclick={() => onGoTasks?.(selectedProject.name)}>查看任务中心</button>
                            {/if}
                        </div>
                    {:else}
                        <WorkspaceEmptyState title="请选择一个项目" description="从左侧列表选择项目以查看详情。" />
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</section>

<style>
    .project-pulse {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 22px;
        padding: 4px 2px;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
    }

    .project-pulse strong {
        color: var(--wk-ink);
        font-size: var(--wk-text-md);
    }

    .project-pulse .danger strong { color: var(--wk-danger, var(--wk-error)); }

    .project-advanced-filters { position: relative; display: inline-flex; }
    .project-advanced-filters > button {
        padding: 7px 12px;
        border: 1px solid var(--wk-border-subtle, var(--wk-border));
        border-radius: var(--wk-radius-sm, 8px);
        background: transparent;
        color: var(--wk-text-2, var(--wk-ink-secondary));
        cursor: pointer;
        font-size: var(--wk-text-sm);
    }
    .project-filter-popover {
        position: absolute;
        z-index: 20;
        right: 0;
        top: calc(100% + 8px);
        display: grid;
        gap: 8px;
        width: 240px;
        padding: 12px;
        border: 1px solid var(--wk-border-subtle, var(--wk-border));
        border-radius: var(--wk-radius-md, 10px);
        background: var(--wk-surface-1, var(--wk-surface));
        box-shadow: var(--wk-shadow-popover);
    }
    .project-filter-popover select { width: 100%; }
    .project-panel-root :is(button, input, select):focus-visible {
        outline: 2px solid var(--wk-primary);
        outline-offset: 2px;
    }
    .project-panel-root {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .panel-header h2 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
        color: var(--wk-ink-secondary);
    }

    .panel-subtitle {
        margin: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .overview-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
    }

    .stat-card {
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        padding: 14px;
        text-align: center;
    }

    .stat-label {
        display: block;
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.55;
        margin-bottom: 6px;
    }

    .stat-value {
        display: block;
        font-size: 24px;
        font-variant-numeric: tabular-nums;
        color: var(--wk-ink-secondary);
    }

    .stat-value.primary { color: var(--wk-primary); }
    .stat-value.warning { color: var(--wk-primary); }
    .stat-value.danger { color: var(--wk-error); }

    /* filter card */
    .project-filter-card {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--wk-border);
        border-radius: 12px;
        background: var(--wk-surface);
        padding: 14px 16px;
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .project-filter-controls {
        display: grid;
        grid-template-columns: minmax(240px, 1fr) auto minmax(140px, 160px) minmax(140px, 160px);
        gap: 10px;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
    }

    .project-filter-input {
        min-width: 0;
    }

    .project-filter-select {
        min-width: 0;
    }

    .project-filter-clear {
        width: auto;
        min-width: 88px;
        white-space: nowrap;
    }

    .project-filter-input,
    .project-filter-select,
    .project-filter-clear {
        width: 100%;
        min-width: 0;
        height: 36px;
        box-sizing: border-box;
        margin: 0;
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-background);
        color: var(--wk-ink);
        font-size: var(--wk-text-sm);
        line-height: 34px;
        vertical-align: middle;
    }

    .project-filter-input {
        padding: 0 12px;
    }

    .project-filter-input::placeholder {
        color: var(--wk-ink);
        opacity: 0.4;
    }

    .project-filter-select {
        padding: 0 10px;
        cursor: pointer;
        line-height: normal;
    }

    .project-filter-clear {
        padding: 0 12px;
        cursor: pointer;
        white-space: nowrap;
        text-align: center;
    }

    .project-filter-clear:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .project-filter-summary {
        width: 100%;
        box-sizing: border-box;
        font-size: var(--wk-text-sm);
        line-height: 1.5;
        color: var(--wk-ink-muted);
        padding-left: 2px;
    }

    .project-filter-summary strong {
        font-weight: 600;
        opacity: 0.9;
    }

    /* layout */
    .project-layout {
        display: grid;
        grid-template-columns: minmax(280px, 35%) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
        min-height: 400px;
    }

    .project-list-col {
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
        padding: 12px 14px 8px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--wk-border);
    }

    .project-list-scroll {
        overflow-y: auto;
        flex: 1;
        padding: 4px 8px 8px;
    }

    .project-list-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        border: none;
        border-radius: 8px;
        background: transparent;
        padding: 10px 12px;
        cursor: pointer;
        text-align: left;
        transition: background 0.12s;
        border-left: 3px solid transparent;
    }

    .project-list-item:hover {
        background: color-mix(in srgb, var(--wk-primary) 6%, transparent);
    }

    .project-list-item.selected {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        border-left-color: var(--wk-primary);
    }

    .list-item-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .list-item-name {
        font-size: var(--wk-text-base);
        font-weight: 500;
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }

    .list-item-badges {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
    }

    .mini-badge {
        font-size: var(--wk-text-xs);
        padding: 1px 5px;
        border-radius: 999px;
        font-weight: 500;
    }

    .mini-primary {
        background: color-mix(in srgb, var(--wk-primary) 14%, transparent);
        color: var(--wk-primary);
    }

    .mini-warn {
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
    }

    .mini-danger {
        background: color-mix(in srgb, var(--wk-error) 8%, transparent);
        color: var(--wk-error);
    }

    .mini-health.tone-success {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
    }

    .mini-health.tone-warning {
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
    }

    .mini-health.tone-danger {
        background: color-mix(in srgb, var(--wk-error) 8%, transparent);
        color: var(--wk-error);
    }

    .mini-health.tone-normal {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
    }

    .list-item-meta {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        padding-left: 0;
    }

    .meta-sep {
        opacity: 0.4;
    }

    /* detail */
    .project-detail-col {
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
        gap: 6px;
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

    .badge-primary {
        background: color-mix(in srgb, var(--wk-primary) 14%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent);
    }

    .badge-warning {
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent);
    }

    .badge-danger {
        background: color-mix(in srgb, var(--wk-error) 8%, transparent);
        color: var(--wk-error);
        border: 1px solid color-mix(in srgb, var(--wk-error) 8%, transparent);
    }

    .badge-done {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 25%, transparent);
    }

    .badge-health.tone-success {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 25%, transparent);
    }

    .badge-health.tone-warning {
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent);
    }

    .badge-health.tone-danger {
        background: color-mix(in srgb, var(--wk-error) 8%, transparent);
        color: var(--wk-error);
        border: 1px solid color-mix(in srgb, var(--wk-error) 8%, transparent);
    }

    .badge-health.tone-normal {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 25%, transparent);
    }

    .detail-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 28px;
        padding-block: 12px;
        border-block: 1px solid var(--wk-divider);
    }

    .metric-item {
        border: 0;
        border-radius: 0;
        background: transparent;
        padding: 0;
        text-align: left;
    }

    .metric-label {
        display: block;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        margin-bottom: 3px;
    }

    .metric-value {
        display: block;
        font-size: 18px;
        font-variant-numeric: tabular-nums;
        color: var(--wk-ink-secondary);
    }

    .metric-value.small {
        font-size: 13px;
        line-height: 1.3;
        word-break: break-all;
    }

    .metric-value.warn { color: var(--wk-primary); }
    .metric-value.danger { color: var(--wk-error); }

    .project-health-box {
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-background);
        padding: 12px 14px;
    }

    .project-health-box.tone-danger {
        border-left: 3px solid var(--wk-error);
    }

    .project-health-box.tone-warning {
        border-left: 3px solid var(--wk-primary);
    }

    .project-health-box.tone-success {
        border-left: 3px solid var(--wk-primary);
    }

    .project-health-ok {
        margin: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        line-height: 1.5;
    }

    .project-health-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--wk-ink-secondary);
    }

    .project-health-box p {
        margin: 6px 0 0;
        font-size: var(--wk-text-sm);
        line-height: 1.5;
        color: var(--wk-ink-muted);
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

    .progress-content {
        margin: 0;
        font-size: var(--wk-text-base);
        line-height: 1.5;
        color: var(--wk-ink-secondary);
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 12em;
        overflow: hidden;
        font-family: inherit;
    }

    .empty-hint {
        margin: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .detail-task-list {
        display: flex;
        flex-direction: column;
    }

    .detail-task-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        padding: 6px 0;
        border-bottom: 1px solid var(--wk-border);
    }

    .detail-task-item:last-child {
        border-bottom: none;
    }

    .detail-task-item.completed {
        opacity: 0.5;
    }

    .detail-task-item.completed .task-name {
        text-decoration: line-through;
    }

    .detail-task-item.overdue {
        background: color-mix(in srgb, var(--wk-error) 8%, transparent);
        margin: 0 -20px;
        padding-left: 20px;
        padding-right: 20px;
    }

    .detail-task-item.overdue .task-name {
        color: var(--wk-error);
    }

    .task-status-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        color: var(--wk-primary);
    }

    .detail-task-item.overdue .task-status-icon {
        color: var(--wk-error);
    }

    .task-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        border: 1px solid var(--wk-border);
        background: var(--wk-background);
    }

    .task-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--wk-ink-secondary);
    }

    .task-meta {
        flex-shrink: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        white-space: nowrap;
    }

    .more-hint {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        margin-top: 8px;
    }

    .project-timeline {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .timeline-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid var(--wk-border);
    }

    .timeline-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .timeline-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--wk-primary);
        margin-top: 5px;
        flex-shrink: 0;
    }

    .timeline-item.tone-progress .timeline-dot { background: var(--wk-primary); }
    .timeline-item.tone-task .timeline-dot { background: var(--wk-primary); }
    .timeline-item.tone-done .timeline-dot { background: var(--wk-primary); }
    .timeline-item.tone-overdue .timeline-dot { background: var(--wk-error); }

    .timeline-content {
        flex: 1;
        min-width: 0;
    }

    .timeline-content strong {
        display: block;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
        margin-bottom: 2px;
    }

    .timeline-content span {
        display: block;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .timeline-item time {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .btn-gotasks {
        border: 1px solid var(--wk-primary);
        border-radius: 7px;
        background: transparent;
        color: var(--wk-primary);
        padding: 7px 12px;
        font-size: 12px;
        cursor: pointer;
        align-self: flex-start;
    }

    .btn-gotasks:hover {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
    }

    @container (max-width: 1180px) {
        .project-filter-controls {
            grid-template-columns: minmax(0, 1fr) auto;
        }

        .project-filter-select {
            width: 100%;
        }
    }

    @container (max-width: 520px) {
        .project-filter-controls {
            grid-template-columns: 1fr;
        }

        .project-filter-clear {
            width: 100%;
        }
    }

    @container (max-width: 900px) {
        .overview-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .project-layout {
            grid-template-columns: 1fr;
        }

        .project-list-col {
            max-height: 300px;
        }

        .detail-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
