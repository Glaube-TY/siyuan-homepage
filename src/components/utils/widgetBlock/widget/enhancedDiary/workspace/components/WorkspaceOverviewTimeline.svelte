<script lang="ts">
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import type { TimelineItem } from "../enhancedDiaryWorkspaceNavigation";

    interface Props {
        items: TimelineItem[];
    }

    let { items }: Props = $props();
</script>

<div class="card wide">
    <div class="card-head">
        <h2>今日时间线</h2>
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
    .card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 18px;
    }

    .wide {
        grid-column: 1 / -1;
    }

    .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 14px;
    }

    h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .timeline {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .timeline-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--b3-border-color);
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

    .timeline-dot.type-new_task { background: var(--b3-theme-primary); }
    .timeline-dot.type-migrate_task { background: #e6900a; }
    .timeline-dot.type-quick_record { background: #0969da; }
    .timeline-dot.type-project_progress { background: #22863a; }
    .timeline-dot.type-review { background: #6f42c1; }

    .timeline-content {
        flex: 1;
        min-width: 0;
    }

    .timeline-content strong {
        display: block;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        margin-bottom: 2px;
    }

    .timeline-content span {
        display: block;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }

    .timeline-date {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.4;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
    }
</style>
