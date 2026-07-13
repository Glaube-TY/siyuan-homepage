<script lang="ts">
    import type {
        ProjectTimelineEvent,
        ProjectTimelineRange,
        ProjectTimelineTypeFilter,
    } from "../enhancedDiaryWorkspaceProjectAnalytics";
    import WorkspaceProjectIcon, { type ProjectIconName } from "./WorkspaceProjectIcon.svelte";

    interface Props {
        events: ProjectTimelineEvent[];
        typeFilter?: ProjectTimelineTypeFilter;
        range?: ProjectTimelineRange;
        dateFilter?: string;
        compact?: boolean;
        onTypeFilterChange?: (value: ProjectTimelineTypeFilter) => void;
        onRangeChange?: (value: ProjectTimelineRange) => void;
        onClearDate?: () => void;
        onOpen: (blockId: string) => void;
    }

    let {
        events,
        typeFilter = "all",
        range = "30",
        dateFilter = "",
        compact = false,
        onTypeFilterChange,
        onRangeChange,
        onClearDate,
        onOpen,
    }: Props = $props();

    function cutoffDate(days: number): string {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (days - 1));
        const pad = (value: number) => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    const filteredEvents = $derived.by(() => {
        const cutoff = range === "all" ? "" : cutoffDate(range === "30" ? 30 : 90);
        const result = events.filter((event) => {
            if (dateFilter && event.date !== dateFilter) return false;
            if (!dateFilter && cutoff && event.date < cutoff) return false;
            if (typeFilter === "task" && event.kind !== "task") return false;
            if (typeFilter === "record" && event.kind !== "record") return false;
            if (typeFilter === "key" && event.kind !== "key") return false;
            return true;
        });
        return compact ? result.slice(0, 6) : result;
    });

    const groups = $derived.by(() => {
        const grouped = new Map<string, ProjectTimelineEvent[]>();
        filteredEvents.forEach((event) => grouped.set(event.date, [...(grouped.get(event.date) || []), event]));
        return Array.from(grouped, ([date, items]) => ({ date, items }));
    });

    function eventIcon(event: ProjectTimelineEvent): ProjectIconName {
        if (event.kind === "task") return "tasks";
        if (event.kind === "key") return "key";
        return "records";
    }
</script>

<section class="project-timeline" class:compact>
    {#if !compact}
        <div class="timeline-controls">
            <div class="wk-segmented" aria-label="活动类型">
                {#each [["all", "全部"], ["task", "任务"], ["record", "记录"], ["key", "关键记录"]] as option}
                    <button type="button" class="wk-segmented-item" class:active={typeFilter === option[0]} onclick={() => onTypeFilterChange?.(option[0] as ProjectTimelineTypeFilter)}>{option[1]}</button>
                {/each}
            </div>
            <div class="wk-segmented" aria-label="时间范围">
                {#each [["30", "30 天"], ["90", "90 天"], ["all", "全部"]] as option}
                    <button type="button" class="wk-segmented-item" class:active={range === option[0]} onclick={() => onRangeChange?.(option[0] as ProjectTimelineRange)}>{option[1]}</button>
                {/each}
            </div>
            {#if dateFilter}
                <button type="button" class="wk-btn wk-btn-secondary wk-btn-sm" onclick={() => onClearDate?.()}>
                    <WorkspaceProjectIcon name="calendar" />{dateFilter} · 清除
                </button>
            {/if}
        </div>
    {/if}

    {#if groups.length}
        <div class="timeline-groups">
            {#each groups as group (group.date)}
                <section class="timeline-group">
                    <time>{group.date}</time>
                    <div class="timeline-track">
                        {#each group.items as event (event.id)}
                            <article class="timeline-event">
                                <span class="event-icon"><WorkspaceProjectIcon name={eventIcon(event)} /></span>
                                <button type="button" class="event-body" onclick={() => onOpen(event.blockId)}>
                                    <span class="event-heading"><strong>{event.typeLabel}</strong><span class="event-status" class:danger={event.statusTone === "danger"}>{event.statusLabel}</span></span>
                                    <span class="event-title">{event.title}</span>
                                    {#if event.projectPath.length}<span class="event-path">{event.projectPath.join(" / ")}</span>{/if}
                                </button>
                                <button type="button" class="wk-icon-button" title="定位原文" aria-label="定位原文" onclick={() => onOpen(event.blockId)}><WorkspaceProjectIcon name="locate" /></button>
                            </article>
                        {/each}
                    </div>
                </section>
            {/each}
        </div>
    {:else}
        <div class="timeline-empty">当前筛选范围内暂无真实日期的项目活动。</div>
    {/if}
</section>

<style>
    .project-timeline { display: grid; gap: 14px; min-width: 0; }
    .timeline-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
    .timeline-groups { display: grid; gap: 16px; min-width: 0; }
    .timeline-group { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; min-width: 0; }
    .timeline-group > time { padding-top: 5px; color: var(--wk-ink-muted); font-size: var(--wk-text-sm); font-variant-numeric: tabular-nums; }
    .timeline-track { position: relative; display: grid; gap: 9px; min-width: 0; padding-left: 15px; border-left: 1px solid var(--wk-border); }
    .timeline-event { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 34px; align-items: center; gap: 8px; min-width: 0; }
    .event-icon { position: absolute; left: -25px; top: 8px; display: grid; place-items: center; width: 19px; height: 19px; border-radius: 50%; background: var(--wk-surface); color: var(--wk-primary); }
    .event-body { display: grid; gap: 4px; min-width: 0; min-height: 36px; padding: 7px 9px; border: 1px solid var(--wk-border); border-radius: 9px; background: var(--wk-surface); color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .event-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
    .event-status { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .event-status.danger { color: var(--wk-error); }
    .event-title, .event-path { overflow-wrap: anywhere; }
    .event-path { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .timeline-empty { padding: 24px; border: 1px dashed var(--wk-border); border-radius: 12px; color: var(--wk-ink-muted); text-align: center; }
    .compact .timeline-groups { max-height: 390px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .compact .timeline-group { grid-template-columns: 82px minmax(0, 1fr); }
    .compact .event-body { padding: 6px 8px; }
    @container (max-width: 560px) { .timeline-group, .compact .timeline-group { grid-template-columns: 1fr; gap: 6px; } .timeline-track { margin-left: 9px; } }
</style>
