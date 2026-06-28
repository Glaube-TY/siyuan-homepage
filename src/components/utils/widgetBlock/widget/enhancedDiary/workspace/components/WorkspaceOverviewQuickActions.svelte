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

<div class="wk-card">
    <div class="wk-card-head">
        <h2 class="wk-card-title">快速入口</h2>
    </div>
    <div class="quick-actions">
        {#if taskManagementEnabled}
            <button type="button" class="quick-action-btn" onclick={onCreateTask}>
                <span class="quick-action-icon"><WorkspaceIcon name="create" size={16} /></span>
                <span class="quick-action-label">新建任务</span>
            </button>
        {/if}
        <button type="button" class="quick-action-btn" onclick={onCreateRecord}>
            <span class="quick-action-icon"><WorkspaceIcon name="records" size={16} /></span>
            <span class="quick-action-label">快速记录</span>
        </button>
        <button type="button" class="quick-action-btn" onclick={onOpenAndAppendTemplate}>
            <span class="quick-action-icon"><WorkspaceIcon name="diary" size={16} /></span>
            <span class="quick-action-label">打开并补模板</span>
        </button>
        <button type="button" class="quick-action-btn" onclick={onGoReview}>
            <span class="quick-action-icon"><WorkspaceIcon name="review" size={16} /></span>
            <span class="quick-action-label">查看复盘</span>
        </button>
    </div>
</div>

<style>
    .quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .quick-action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 10px 14px;
        cursor: pointer;
        font-size: var(--wk-text-base);
        font-weight: 500;
        transition: border-color var(--wk-transition-fast), color var(--wk-transition-fast),
            background var(--wk-transition-fast);
    }

    .quick-action-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .quick-action-icon {
        font-size: 16px;
    }
</style>
