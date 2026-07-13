<script lang="ts">
    import type { EnhancedDiaryProjectRecordIndexItem } from "../../enhancedDiaryProjectRecordIndex";
    import {
        relativeProjectSourcePath,
        type ProjectRecordViewFilter,
    } from "../enhancedDiaryWorkspaceProjectAnalytics";
    import WorkspaceProjectIcon from "./WorkspaceProjectIcon.svelte";

    interface Props {
        records: EnhancedDiaryProjectRecordIndexItem[];
        projectTitle: string;
        currentTargetId: string;
        currentTargetPath: string[];
        viewFilter?: ProjectRecordViewFilter;
        onFilterChange?: (filter: ProjectRecordViewFilter) => void;
        taskManagementEnabled?: boolean;
        allowCreateTask?: boolean;
        onCreate?: () => void;
        onEdit: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onDelete: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onConvertToTask: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onOpen: (record: EnhancedDiaryProjectRecordIndexItem) => void;
        onOpenProject: (targetId: string) => void | Promise<void>;
    }

    let {
        records,
        projectTitle,
        currentTargetId,
        currentTargetPath,
        viewFilter = "all",
        onFilterChange,
        taskManagementEnabled = true,
        allowCreateTask = true,
        onCreate,
        onEdit,
        onDelete,
        onConvertToTask,
        onOpen,
        onOpenProject,
    }: Props = $props();

    function blockTime(blockId: string): string {
        const match = blockId.match(/^\d{8}(\d{2})(\d{2})/);
        return match ? `${match[1]}:${match[2]}` : "";
    }
</script>

<div class="project-list-filter wk-segmented" aria-label="记录筛选">
    <button type="button" class="wk-segmented-item" class:active={viewFilter === "all"} onclick={() => onFilterChange?.("all")}>全部</button>
    <button type="button" class="wk-segmented-item" class:active={viewFilter === "key"} onclick={() => onFilterChange?.("key")}><WorkspaceProjectIcon name="key" size={15} />关键</button>
</div>

{#if records.length}
    <div class="project-record-list">
        {#each records as record (record.id)}
            {@const sourcePath = record.projectTargetId !== currentTargetId
                ? relativeProjectSourcePath(record.projectPath, currentTargetPath)
                : []}
            <article class="project-record-item">
                <button type="button" class="record-body" onclick={() => onOpen(record)}>
                    <strong>{record.preview || "空记录"}</strong>
                    <span class="record-meta">
                        <span>{record.date}{blockTime(record.headingBlockId) ? ` ${blockTime(record.headingBlockId)}` : ""}</span>
                        <span>{record.category || "未分类"}</span>
                        {#if record.isKeyRecord}<span class="key-mark"><WorkspaceProjectIcon name="key" size={14} />关键记录</span>{/if}
                    </span>
                    {#if record.tags.length}
                        <span class="chip-row">{#each record.tags as tag}<span class="wk-chip">#{tag}#</span>{/each}</span>
                    {/if}
                    {#if sourcePath.length}
                        <span class="project-source"><WorkspaceProjectIcon name="tree" size={15} /><span>来自：{sourcePath.join(" / ")}</span></span>
                    {/if}
                </button>
                <div class="record-actions">
                    {#if sourcePath.length}
                        <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => void onOpenProject(record.projectTargetId)}><WorkspaceProjectIcon name="open" />进入所属项目</button>
                    {/if}
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => void onEdit(record)}><WorkspaceProjectIcon name="edit" />编辑</button>
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => void onEdit(record)}><WorkspaceProjectIcon name="tree" />调整归属</button>
                    {#if taskManagementEnabled && allowCreateTask}<button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => void onConvertToTask(record)}><WorkspaceProjectIcon name="taskAdd" />转为任务</button>{/if}
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={() => onOpen(record)}><WorkspaceProjectIcon name="locate" />定位原文</button>
                    <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm danger" onclick={() => void onDelete(record)}><WorkspaceProjectIcon name="delete" />删除</button>
                </div>
            </article>
        {/each}
    </div>
{:else}
    <div class="project-list-empty">
        <strong>{viewFilter === "key" ? `“${projectTitle}”暂无关键记录` : `暂无“${projectTitle}”的项目记录`}</strong>
        <span>{viewFilter === "key" ? "可在创建或编辑项目记录时开启“关键记录”。" : "记录仍保存在日记中，创建时会自动关联当前项目。"}</span>
        {#if viewFilter !== "key" && onCreate}<button type="button" class="wk-btn wk-btn-primary" onclick={onCreate}><WorkspaceProjectIcon name="recordAdd" />快速记录</button>{/if}
    </div>
{/if}

<style>
    .project-record-list { display: grid; gap: 8px; min-width: 0; }
    .project-list-filter { justify-self: start; margin-bottom: 9px; }
    .project-record-item { display: grid; gap: 8px; min-width: 0; padding: 10px; border: 1px solid var(--wk-border); border-radius: 10px; background: var(--wk-surface); }
    .record-body { display: grid; gap: 7px; min-width: 0; min-height: 34px; padding: 0; border: 0; background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .record-body strong { overflow-wrap: anywhere; white-space: pre-wrap; }
    .record-meta, .chip-row, .record-actions { display: flex; flex-wrap: wrap; gap: 6px 10px; min-width: 0; }
    .record-meta { color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .project-source { display: inline-flex; align-items: flex-start; gap: 5px; min-width: 0; color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }
    .project-source > span { min-width: 0; overflow-wrap: anywhere; }
    .key-mark { display: inline-flex; align-items: center; gap: 3px; color: var(--wk-primary); }
    .chip-row .wk-chip { min-height: 24px; padding: 2px 7px; }
    .record-actions { gap: 4px; }
    .record-actions .wk-btn { min-height: 32px; gap: 5px; }
    .record-actions .danger { color: var(--b3-theme-error, #d23f31); }
    .project-list-empty { display: grid; justify-items: start; gap: 7px; min-width: 0; padding: 18px; border: 1px dashed var(--wk-border); border-radius: 10px; color: var(--wk-ink-secondary); }
    .project-list-empty span { color: var(--wk-ink-muted); overflow-wrap: anywhere; }
</style>
