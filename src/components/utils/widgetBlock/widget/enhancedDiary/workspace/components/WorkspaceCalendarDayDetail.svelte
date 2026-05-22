<script lang="ts">
    import type { EnhancedDiaryWorkspaceDayDetail } from "../enhancedDiaryWorkspaceDayDetail";

    interface Props {
        detail: EnhancedDiaryWorkspaceDayDetail | null;
        loading?: boolean;
        onOpenDoc: (docId?: string) => void;
        onClose?: () => void;
        onOpenRecords?: (date: string) => void;
        onOpenTasks?: (date: string) => void;
        onOpenReview?: (date: string) => void;
    }

    let { detail, loading = false, onOpenDoc, onClose, onOpenRecords, onOpenTasks, onOpenReview }: Props = $props();
</script>

<section class="day-detail-panel">
    <div class="detail-header">
        <span class="detail-title">日期详情</span>
        {#if onClose}
            <button type="button" class="close-btn" onclick={onClose} aria-label="关闭详情">✕</button>
        {/if}
    </div>

    {#if loading}
        <div class="detail-loading">
            <span class="loading-spinner"></span>
            日期详情加载中...
        </div>
    {:else if !detail}
        <div class="empty-state">
            <span class="empty-icon">📅</span>
            <p>请选择一个日期查看详情</p>
        </div>
    {:else}
        <div class="detail-content">
            <div class="detail-date-row">
                <span class="detail-date-text">{detail.date}</span>
                <span class="badge" class:badge-diary={detail.hasDiary} class:badge-no-diary={!detail.hasDiary}>
                    {detail.hasDiary ? "有日记" : "无日记"}
                </span>
            </div>

            <div class="stat-grid">
                <div class="stat-card">
                    <span class="stat-value">{detail.newTaskCount}</span>
                    <span class="stat-label">新建任务</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{detail.migratedTaskCount}</span>
                    <span class="stat-label">迁移任务</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{detail.quickRecordCount}</span>
                    <span class="stat-label">快速记录</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{detail.projectCount}</span>
                    <span class="stat-label">项目推进</span>
                </div>
            </div>

            <div class="review-status">
                <span class="review-text">{detail.reviewStatusText}</span>
            </div>

            {#if detail.hasDiary && !detail.templateValid}
                <div class="warning-box">
                    <div class="warning-title">⚠️ 这天日记模板结构不完整</div>
                    <ul class="missing-list">
                        {#each detail.missingSections.slice(0, 5) as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </div>
            {/if}

            <div class="detail-actions">
                {#if detail.docId}
                    <button type="button" class="open-doc-btn" onclick={() => onOpenDoc(detail.docId)}>
                        打开这天日记
                    </button>
                {:else}
                    <span class="no-diary-hint">这天暂无日记</span>
                {/if}
                {#if detail.quickRecordCount > 0 && onOpenRecords}
                    <button type="button" class="open-records-btn" onclick={() => onOpenRecords(detail.date)}>
                        查看这天记录
                    </button>
                {/if}
                {#if (detail.newTaskCount + detail.migratedTaskCount) > 0 && onOpenTasks}
                    <button type="button" class="open-tasks-btn" onclick={() => onOpenTasks(detail.date)}>
                        查看这天任务
                    </button>
                {/if}
                {#if detail.hasDiary && onOpenReview}
                    <button type="button" class="open-review-btn" onclick={() => onOpenReview(detail.date)}>
                        查看复盘中心
                    </button>
                {/if}
            </div>
        </div>
    {/if}
</section>

<style>
    .day-detail-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 16px;
        min-height: 200px;
    }

    .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .detail-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
    }

    .close-btn {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s;
    }

    .close-btn:hover {
        background: var(--b3-theme-background);
        color: var(--b3-theme-primary);
    }

    .detail-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 32px 20px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .loading-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--b3-border-color);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 32px 20px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        opacity: 0.6;
    }

    .empty-icon {
        font-size: 32px;
    }

    .detail-content {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .detail-date-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }

    .detail-date-text {
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        font-variant-numeric: tabular-nums;
    }

    .badge {
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
    }

    .badge-diary {
        background: color-mix(in srgb, var(--b3-theme-primary) 15%, transparent);
        color: var(--b3-theme-primary);
    }

    .badge-no-diary {
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }

    .stat-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
    }

    .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 10px 6px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
    }

    .stat-value {
        font-size: 20px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
        font-variant-numeric: tabular-nums;
    }

    .stat-label {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
    }

    .review-status {
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
    }

    .review-text {
        font-size: 13px;
        color: var(--b3-theme-on-background);
        font-weight: 600;
    }

    .warning-box {
        padding: 10px 14px;
        border-radius: 8px;
        background: color-mix(in srgb, #e6900a 8%, var(--b3-theme-background));
        border: 1px solid color-mix(in srgb, #e6900a 30%, transparent);
    }

    .warning-title {
        font-size: 13px;
        font-weight: 600;
        color: #e6900a;
        margin-bottom: 6px;
    }

    .missing-list {
        margin: 0;
        padding-left: 18px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        line-height: 1.6;
    }

    .detail-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
        padding-top: 4px;
    }

    .open-doc-btn {
        padding: 8px 20px;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 8px;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary, #fff);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s;
    }

    .open-doc-btn:hover {
        filter: brightness(1.1);
    }

    .open-records-btn,
    .open-review-btn {
        padding: 8px 20px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s;
    }

    .open-records-btn:hover,
    .open-review-btn:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .open-tasks-btn {
        padding: 8px 20px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s;
    }

    .open-tasks-btn:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .no-diary-hint {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
    }

    @media (max-width: 760px) {
        .stat-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>
