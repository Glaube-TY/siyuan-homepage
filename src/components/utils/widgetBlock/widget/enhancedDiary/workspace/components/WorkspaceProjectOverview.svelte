<script lang="ts">
    import type { EnhancedDiaryProjectRecordIndexItem } from "../../enhancedDiaryProjectRecordIndex";
    import type { EnhancedDiaryProjectContentField, EnhancedDiaryProjectOverviewSnapshot } from "../enhancedDiaryWorkspaceProjectContent";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { ProjectAnalytics, ProjectTaskViewFilter } from "../enhancedDiaryWorkspaceProjectAnalytics";
    import WorkspaceProjectCharts from "./WorkspaceProjectCharts.svelte";
    import WorkspaceProjectIcon from "./WorkspaceProjectIcon.svelte";
    import WorkspaceProjectTimeline from "./WorkspaceProjectTimeline.svelte";

    interface Props {
        analytics: ProjectAnalytics;
        snapshot: EnhancedDiaryProjectOverviewSnapshot;
        taskManagementEnabled?: boolean;
        tags: Array<{ tag: string; count: number }>;
        activeTag?: string;
        onShowTasks: (filter: ProjectTaskViewFilter) => void;
        onShowRecords: (filter: "all" | "key") => void;
        onShowTimeline: (date?: string) => void;
        onOpenTask: (task: EnhancedDiaryWorkspaceTask) => void;
        onOpenRecord: (record: EnhancedDiaryProjectRecordIndexItem) => void;
        onOpenBlock: (blockId: string) => void;
        onSelectChild: (targetId: string) => void;
        onEditField: (field: EnhancedDiaryProjectContentField) => void;
        onSelectTag: (tag: string) => void;
    }

    let {
        analytics,
        snapshot,
        taskManagementEnabled = true,
        tags,
        activeTag = "",
        onShowTasks,
        onShowRecords,
        onShowTimeline,
        onOpenTask,
        onOpenRecord,
        onOpenBlock,
        onSelectChild,
        onEditField,
        onSelectTag,
    }: Props = $props();

    const directions = $derived([
        { field: "项目概览" as const, title: "项目概览", value: snapshot.overview },
        { field: "项目目标" as const, title: "项目目标", value: snapshot.goal },
        { field: "当前重点" as const, title: "当前重点", value: snapshot.focus },
    ]);

    function recordTime(record: EnhancedDiaryProjectRecordIndexItem): string {
        const match = record.headingBlockId.match(/^\d{8}(\d{2})(\d{2})/);
        return match ? `${record.date} ${match[1]}:${match[2]}` : record.date;
    }
</script>

<div class="project-overview">
    <div class="project-stats" class:withoutTasks={!taskManagementEnabled}>
        {#if taskManagementEnabled}
            <button type="button" class="stat-card" onclick={() => onShowTasks("all")}>
                <span class="stat-icon"><WorkspaceProjectIcon name="completed" /></span>
                <span><small>任务进度</small><strong>{analytics.completedTasks} / {analytics.taskTotal}</strong><em>{analytics.completionRate}% 完成</em></span>
            </button>
            <button type="button" class="stat-card" onclick={() => onShowTasks(analytics.overdueTasks ? "overdue" : "pending")}>
                <span class="stat-icon"><WorkspaceProjectIcon name="alert" /></span>
                <span><small>待处理</small><strong>{analytics.pendingTasks}</strong><em class:danger={analytics.overdueTasks > 0}>{analytics.overdueTasks ? `${analytics.overdueTasks} 条逾期` : "当前无逾期"}</em></span>
            </button>
        {/if}
        <article class="stat-card record-stat">
            <button type="button" class="stat-main" onclick={() => onShowRecords("all")}>
                <span class="stat-icon"><WorkspaceProjectIcon name="records" /></span>
                <span><small>项目记录</small><strong>{analytics.recordTotal}</strong></span>
            </button>
            <button type="button" class="key-entry" onclick={() => onShowRecords("key")}><WorkspaceProjectIcon name="key" size={14} />{analytics.keyRecordTotal} 条关键记录</button>
        </article>
        <button type="button" class="stat-card" onclick={() => onShowTimeline()}>
            <span class="stat-icon"><WorkspaceProjectIcon name="activity" /></span>
            <span><small>项目活跃</small><strong>{analytics.activeDays30} 天</strong><em>{analytics.lastActivityDate || "暂无活动"}</em></span>
        </button>
    </div>

    <WorkspaceProjectCharts
        activityDays={analytics.activityDays}
        taskTotal={analytics.taskTotal}
        completedTasks={analytics.completedTasks}
        pendingTasks={analytics.pendingTasks}
        overdueTasks={analytics.overdueTasks}
        completionRate={analytics.completionRate}
        {taskManagementEnabled}
        onSelectDate={(date) => onShowTimeline(date)}
        onSelectTaskStatus={onShowTasks}
    />

    <div class="overview-grid">
        <section class="overview-section direction-section">
            <header><WorkspaceProjectIcon name="target" /><h4>项目内容</h4></header>
            <div class="direction-list overview-scroll direction-scroll">
                {#each directions as item}
                    <article><div><strong>{item.title}</strong>{#if item.value}<p>{item.value}</p>{:else}<p class="empty-copy">尚未填写。</p>{/if}</div><button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => onEditField(item.field)}><WorkspaceProjectIcon name="edit" />填写</button></article>
                {/each}
            </div>
        </section>

        {#if taskManagementEnabled}
            <section class="overview-section next-section">
                <header><WorkspaceProjectIcon name="next" /><h4>项目任务</h4></header>
                {#if analytics.nextTasks.length}
                    <div class="compact-list overview-scroll next-scroll">{#each analytics.nextTasks as task}<button type="button" onclick={() => onOpenTask(task)}><strong>{task.taskname}</strong><span class:danger={task.isOverdue}>{task.deadline || task.startDate || task.sourceDate || "无日期"}{task.isOverdue ? " · 逾期" : ""}</span></button>{/each}</div>
                {:else}<p class="section-empty">当前没有待完成任务。</p>{/if}
            </section>
        {/if}

        <section class="overview-section recent-section">
            <header><WorkspaceProjectIcon name="records" /><h4>最近记录</h4></header>
            {#if analytics.recentRecords.length}
                <div class="compact-list overview-scroll recent-scroll">{#each analytics.recentRecords as record}<button type="button" class:key={record.isKeyRecord} onclick={() => onOpenRecord(record)}><strong>{#if record.isKeyRecord}<WorkspaceProjectIcon name="key" size={15} />{/if}{record.preview || "空记录"}</strong><span>{recordTime(record)} · {record.category}</span></button>{/each}</div>
            {:else}<p class="section-empty">当前项目暂无记录。</p>{/if}
        </section>

        <section class="overview-section activity-section">
            <header><WorkspaceProjectIcon name="clock" /><h4>最近活动</h4><button type="button" class="wk-btn wk-btn-ghost wk-btn-sm section-heading-action" onclick={() => onShowTimeline()}>查看全部</button></header>
            <WorkspaceProjectTimeline events={analytics.timeline} compact onOpen={onOpenBlock} />
        </section>
    </div>

    {#if analytics.childProgress.length}
        <section class="overview-section child-section">
            <header><WorkspaceProjectIcon name="tree" /><h4>子项目进展</h4></header>
            <div class="child-list overview-scroll child-scroll">
                {#each analytics.childProgress as child}
                    <button type="button" onclick={() => onSelectChild(child.id)}>
                        <span class="child-head"><strong>{child.title}</strong><WorkspaceProjectIcon name="next" /></span>
                        <span class="child-meta">{child.completedTasks} / {child.totalTasks} 任务 · {child.recordCount} 条记录 · {child.lastActivityDate || "暂无活动"}</span>
                        <span class="progress-track"><span style={`width:${child.completionRate}%`}></span></span>
                    </button>
                {/each}
            </div>
        </section>
    {/if}

    {#if tags.length}
        <div class="tag-summary"><WorkspaceProjectIcon name="tags" /><span>标签</span>{#each tags as item}<button type="button" class="wk-chip" class:selected={activeTag === item.tag} onclick={() => onSelectTag(activeTag === item.tag ? "" : item.tag)}>#{item.tag}# <small>{item.count}</small></button>{/each}</div>
    {/if}
</div>

<style>
    .project-overview { display: grid; gap: 14px; min-width: 0; }
    .project-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; min-width: 0; }
    .project-stats.withoutTasks { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .stat-card { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 9px; min-width: 0; min-height: 86px; padding: 12px; border: 1px solid var(--wk-border); border-radius: 13px; background: var(--wk-surface); color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .stat-card:hover { border-color: var(--wk-primary); }
    .stat-icon { color: var(--wk-primary); }
    .stat-card > span:last-child { display: grid; gap: 2px; min-width: 0; }
    .stat-card small, .stat-card em { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); font-style: normal; }
    .stat-card strong { color: var(--wk-primary); font-size: var(--wk-text-xl); font-variant-numeric: tabular-nums; }
    .stat-card em.danger, .danger { color: var(--wk-error); }
    .record-stat { grid-template-columns: 1fr; gap: 3px; cursor: default; }
    .stat-main { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 9px; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .stat-main > span:last-child { display: grid; gap: 2px; }
    .key-entry { display: inline-flex; align-items: center; justify-self: start; gap: 4px; padding: 2px 0 0 43px; border: 0; background: transparent; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); cursor: pointer; }
    .overview-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); align-items: start; gap: 12px; min-width: 0; }
    .overview-section { min-width: 0; padding: 14px; border: 1px solid var(--wk-border); border-radius: 13px; background: var(--wk-surface); }
    .overview-section > header { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 11px; color: var(--wk-primary); }
    .section-heading-action { margin-left: auto; }
    h4, p { margin: 0; }
    h4 { color: var(--wk-ink-secondary); font-size: var(--wk-text-md); }
    .direction-list, .compact-list, .child-list { display: grid; gap: 8px; min-width: 0; }
    .overview-scroll { overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .direction-scroll, .next-scroll { max-height: 300px; }
    .recent-scroll { max-height: 340px; }
    .child-scroll { max-height: 380px; }
    .direction-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; min-width: 0; padding-bottom: 8px; border-bottom: 1px solid var(--wk-divider); }
    .direction-list article:last-child { padding-bottom: 0; border-bottom: 0; }
    .direction-list p { margin-top: 4px; color: var(--wk-ink-muted); white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .empty-copy, .section-empty { color: var(--wk-ink-muted); }
    .compact-list button, .child-list button { display: grid; gap: 4px; min-width: 0; min-height: 38px; padding: 7px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .compact-list button:hover, .child-list button:hover { border-color: var(--wk-border); background: var(--wk-background); }
    .compact-list strong { display: flex; align-items: flex-start; gap: 5px; overflow-wrap: anywhere; }
    .compact-list span, .child-meta { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); overflow-wrap: anywhere; }
    .compact-list button.key { border-left: 2px solid var(--wk-primary); }
    .child-section { grid-column: 1 / -1; }
    .child-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .child-head { display: flex; justify-content: space-between; gap: 8px; }
    .progress-track { height: 4px; border-radius: 999px; background: var(--wk-background); overflow: hidden; }
    .progress-track span { display: block; height: 100%; background: var(--wk-primary); }
    .tag-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; min-width: 0; color: var(--wk-ink-muted); }
    .tag-summary .wk-chip { min-height: 30px; }
    @container (max-width: 900px) { .project-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .overview-grid { grid-template-columns: 1fr; } .child-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @container (max-width: 520px) { .project-stats, .project-stats.withoutTasks, .child-list { grid-template-columns: 1fr; } .direction-list article { grid-template-columns: 1fr; } }
</style>
