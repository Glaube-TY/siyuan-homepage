<script lang="ts">
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        onCreateTask: () => void;
        onCreateRecord: () => void;
        onOpenAndAppendTemplate: () => void | Promise<void>;
        onGoReview: () => void;
        taskManagementEnabled?: boolean;
    }

    let { onCreateTask, onCreateRecord, onOpenAndAppendTemplate, onGoReview, taskManagementEnabled = true }: Props = $props();
</script>

<div class="quick-card">
    <div class="wk-section-label">快捷入口</div>
    <div class="quick-actions">
        {#if taskManagementEnabled}
            <button type="button" class="quick-item" onclick={onCreateTask}>
                <span class="quick-icon"><WorkspaceIcon name="create" size={15} /></span>
                <span>新建任务</span>
                <span class="quick-shortcut">Ctrl N</span>
            </button>
        {/if}
        <button type="button" class="quick-item" onclick={onCreateRecord}>
            <span class="quick-icon"><WorkspaceIcon name="records" size={15} /></span>
            <span>快速记录</span>
        </button>
        <button type="button" class="quick-item" onclick={onOpenAndAppendTemplate}>
            <span class="quick-icon"><WorkspaceIcon name="diary" size={15} /></span>
            <span>打开日记</span>
        </button>
        <button type="button" class="quick-item" onclick={onGoReview}>
            <span class="quick-icon"><WorkspaceIcon name="review" size={15} /></span>
            <span>查看复盘</span>
        </button>
    </div>
</div>

<style>
    .quick-card {
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-lg);
        background: var(--wk-bg-card);
        box-shadow: none;
        padding: var(--wk-gap-md);
    }

    .quick-actions {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .quick-item {
        display: flex;
        align-items: center;
        gap: 9px;
        border: none;
        border-radius: var(--wk-radius-sm);
        background: transparent;
        color: var(--wk-ink-muted);
        padding: 8px 10px;
        cursor: pointer;
        font-size: var(--wk-text-base);
        font-weight: 500;
        text-align: left;
        transition: background var(--wk-transition-fast), color var(--wk-transition-fast);
        width: 100%;
    }

    .quick-item:hover {
        background: var(--wk-primary-subtle);
        color: var(--wk-primary);
    }

    .quick-icon {
        font-size: 15px;
        flex-shrink: 0;
        opacity: 0.7;
        transition: opacity var(--wk-transition-fast);
    }

    .quick-item:hover .quick-icon {
        opacity: 1;
    }

    .quick-shortcut {
        margin-left: auto;
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-faint);
        font-weight: 400;
    }
</style>
