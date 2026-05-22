<script lang="ts">
    interface Props {
        hasTemplateMissing: boolean;
        onCreateTask: () => void;
        onCreateRecord: () => void;
        onOpenToday: () => void | Promise<void>;
        onAppendTemplate: () => void | Promise<void>;
        onGoReview: () => void;
    }

    let { hasTemplateMissing, onCreateTask, onCreateRecord, onOpenToday, onAppendTemplate, onGoReview }: Props = $props();
</script>

<div class="card">
    <div class="card-head">
        <h2>快速入口</h2>
    </div>
    <div class="quick-actions">
        <button type="button" class="quick-action-btn" onclick={onCreateTask}>
            <span class="quick-action-icon">➕</span>
            <span class="quick-action-label">新建任务</span>
        </button>
        <button type="button" class="quick-action-btn" onclick={onCreateRecord}>
            <span class="quick-action-icon">📝</span>
            <span class="quick-action-label">快速记录</span>
        </button>
        <button type="button" class="quick-action-btn" onclick={onOpenToday}>
            <span class="quick-action-icon">📖</span>
            <span class="quick-action-label">打开今日日记</span>
        </button>
        {#if hasTemplateMissing}
            <button type="button" class="quick-action-btn warn" onclick={onAppendTemplate}>
                <span class="quick-action-icon">🔧</span>
                <span class="quick-action-label">补充模板</span>
            </button>
        {/if}
        <button type="button" class="quick-action-btn" onclick={onGoReview}>
            <span class="quick-action-icon">🔄</span>
            <span class="quick-action-label">查看复盘</span>
        </button>
    </div>
</div>

<style>
    .card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 18px;
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

    .quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .quick-action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        padding: 10px 14px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.12s;
    }

    .quick-action-btn:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .quick-action-btn.warn {
        border-color: rgba(255, 165, 0, 0.35);
        background: rgba(255, 165, 0, 0.06);
        color: #b87300;
    }

    .quick-action-btn.warn:hover {
        border-color: #b87300;
    }

    .quick-action-icon {
        font-size: 16px;
    }

    .quick-action-label {
        font-weight: 500;
    }
</style>
