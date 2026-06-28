<script lang="ts">
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import type { TimelineItem } from "../enhancedDiaryWorkspaceNavigation";

    interface Props {
        items: TimelineItem[];
    }

    let { items }: Props = $props();
</script>

<div class="wk-card timeline-card">
    <div class="wk-card-head">
        <h2 class="wk-card-title">今日时间线</h2>
    </div>
    {#if items.length === 0}
        <WorkspaceEmptyState title="今日暂无动态" description="新建任务、快速记录或项目推进后会在这里显示。" />
    {:else}
        <div class="timeline">
            {#each items as item}
                <div class="timeline-item">
                    <span class="timeline-dot type-{item.type}"></span>
                    <div class="timeline-content">
                        <strong>{item.title}</strong>
                        <span>{item.content}</span>
                    </div>
                    <span class="timeline-date">{item.date}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .timeline-card {
        grid-column: 1 / -1;
    }

    .timeline {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .timeline-item {
        display: flex;
        align-items: flex-start;
        gap: var(--wk-gap-sm);
        padding: 10px 0;
        border-bottom: 1px solid var(--wk-border);
    }

    .timeline-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .timeline-item:first-child {
        padding-top: 0;
    }

    .timeline-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 5px;
    }

    .timeline-dot.type-new_task { background: var(--wk-primary); }
    .timeline-dot.type-migrate_task { background: var(--wk-warning); }
    .timeline-dot.type-quick_record { background: var(--wk-info); }
    .timeline-dot.type-project_progress { background: var(--wk-success); }
    .timeline-dot.type-review { background: var(--wk-secondary); }

    .timeline-content {
        flex: 1;
        min-width: 0;
    }

    .timeline-content strong {
        display: block;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
        margin-bottom: 2px;
    }

    .timeline-content span {
        display: block;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .timeline-date {
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-faint);
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
    }
</style>
