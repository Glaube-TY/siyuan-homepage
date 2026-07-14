<script lang="ts">
    import type { EnhancedDiaryWorkspaceRecord } from "../enhancedDiaryWorkspaceRecordService";
    import { sortTodayRecords } from "../enhancedDiaryWorkspaceOverview";
    import WorkspaceOverviewIcon from "./WorkspaceOverviewIcon.svelte";

    interface Props { records: EnhancedDiaryWorkspaceRecord[]; onOpenRecord: (record: EnhancedDiaryWorkspaceRecord) => void; onGoRecords: () => void; onCreateRecord: () => void; }
    let { records, onOpenRecord, onGoRecords, onCreateRecord }: Props = $props();
    const visibleRecords = $derived(sortTodayRecords(records));
    function preview(record: EnhancedDiaryWorkspaceRecord): string { return record.content.trim().replace(/\s+/g, " ") || record.headingTitle || "空记录"; }
</script>

<section class="wk-card records-card">
    <header><div><span><WorkspaceOverviewIcon name="record" size={15} />今日记录</span><h2>今天留下的内容</h2></div><button type="button" onclick={onGoRecords}>查看全部 <WorkspaceOverviewIcon name="arrow" size={14} /></button></header>
    {#if visibleRecords.length}
        <div class="record-list">
            {#each visibleRecords as record (record.headingBlockId || record.id || record.timeText)}
                <button type="button" class="record-row" onclick={() => onOpenRecord(record)}>
                    <span class="record-time">{record.timeText || "--:--"}</span>
                    <span class="record-copy"><strong title={preview(record)}>{preview(record)}</strong><small><span>{record.categoryTitle || "未分类"}</span>{#if record.projectPath?.length}<span title={record.projectPath.join(" / ")}><WorkspaceOverviewIcon name="folder" size={12} />{record.projectPath.join(" / ")}</span>{/if}</small></span>
                    {#if record.isKeyRecord}<span class="key" title="关键记录" aria-label="关键记录"><WorkspaceOverviewIcon name="star" size={15} /></span>{/if}
                    <WorkspaceOverviewIcon name="arrow" size={14} />
                </button>
            {/each}
        </div>
    {:else}
        <div class="empty"><WorkspaceOverviewIcon name="recordAdd" size={25} /><strong>今天还没有记录</strong><button type="button" onclick={onCreateRecord}>快速记录</button></div>
    {/if}
</section>

<style>
    .records-card { min-width: 0; padding: 20px; }
    header { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    header span { display: inline-flex; align-items: center; gap: 6px; color: var(--wk-primary); font-size: var(--wk-text-xs); font-weight: 650; }
    h2 { margin: 4px 0 0; color: var(--wk-ink); font-size: var(--wk-text-lg); }
    header button, .empty button { display: inline-flex; align-items: center; gap: 4px; padding: 3px 0; border: 0; background: transparent; color: var(--wk-primary); font-size: var(--wk-text-xs); cursor: pointer; }
    .record-list { display: grid; min-width: 0; }
    .record-row { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto 14px; align-items: center; gap: 10px; min-width: 0; padding: 10px 8px; border: 0; border-bottom: 1px solid var(--wk-divider); background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .record-row:last-child { border-bottom: 0; }
    .record-row:hover { background: var(--wk-surface-hover); }
    .record-time { color: var(--wk-ink-muted); font: 600 var(--wk-text-xs) var(--wk-number-font); }
    .record-copy { display: grid; gap: 4px; min-width: 0; }
    .record-copy strong { display: -webkit-box; overflow: hidden; color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
    .record-copy small { display: flex; flex-wrap: wrap; gap: 5px 12px; min-width: 0; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .record-copy small span { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .key { display: inline-flex; color: var(--wk-primary); }
    .empty { display: grid; justify-items: center; gap: 8px; padding: 26px 8px; color: var(--wk-ink-muted); text-align: center; }
    .empty strong { color: var(--wk-ink-secondary); }
    @container (max-width: 520px) { .record-row { grid-template-columns: minmax(0, 1fr) auto 14px; } .record-time { grid-column: 1; grid-row: 2; } .record-copy { grid-column: 1; grid-row: 1; } .key { grid-column: 2; grid-row: 1 / 3; } }
</style>
