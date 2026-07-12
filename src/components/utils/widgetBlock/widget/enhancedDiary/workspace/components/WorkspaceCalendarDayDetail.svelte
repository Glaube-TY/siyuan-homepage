<script lang="ts">
    import type { EnhancedDiaryWorkspaceDayDetail } from "../enhancedDiaryWorkspaceDayDetail";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        detail: EnhancedDiaryWorkspaceDayDetail | null;
        loading?: boolean;
        onOpenDoc: (docId?: string) => void;
        onClose?: () => void;
        onOpenRecords?: (date: string) => void;
        onOpenTasks?: (date: string) => void;
        onOpenReview?: (date: string) => void;
        taskManagementEnabled?: boolean;
    }

    let { detail, loading = false, onOpenDoc, onClose, onOpenRecords, onOpenTasks, onOpenReview, taskManagementEnabled = true }: Props = $props();
</script>

<section class="day-detail-panel">
    <div class="detail-header">
        <span class="detail-title">日期详情</span>
        {#if onClose}
            <button type="button" class="close-btn" onclick={onClose} aria-label="关闭详情">
                <WorkspaceIcon name="close" size={13} />
            </button>
        {/if}
    </div>

    {#if loading}
        <div class="detail-loading">
            <span class="loading-spinner"></span>
            日期详情加载中...
        </div>
    {:else if !detail}
        <div class="empty-state">
            <WorkspaceIcon name="calendar" size={30} className="empty-icon" />
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
                {#if taskManagementEnabled}
                    <div class="stat-card">
                        <span class="stat-value">{detail.newTaskCount}</span>
                        <span class="stat-label">新建任务</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">{detail.migratedTaskCount}</span>
                        <span class="stat-label">迁移任务</span>
                    </div>
                {/if}
                <div class="stat-card">
                    <span class="stat-value">{detail.quickRecordCount}</span>
                    <span class="stat-label">快速记录</span>
                </div>
                {#if taskManagementEnabled}
                    <div class="stat-card">
                        <span class="stat-value">{detail.projectCount}</span>
                        <span class="stat-label">项目推进</span>
                    </div>
                {/if}
            </div>

            <div class="review-status">
                <span class="review-text">{detail.reviewStatusText}</span>
            </div>

            {#if detail.hasDiary && !detail.templateValid}
                <div class="warning-box">
                    <div class="warning-title">
                        <WorkspaceIcon name="warning" size={14} />
                        <span>这天日记模板结构不完整</span>
                    </div>
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
                {#if taskManagementEnabled && (detail.newTaskCount + detail.migratedTaskCount) > 0 && onOpenTasks}
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
        border: 1px solid var(--wk-border-subtle);
        border-radius: var(--wk-radius-xl);
        background: color-mix(in srgb, var(--wk-bg-card) 92%, transparent);
        padding: clamp(20px, 2.4vw, 30px);
        min-height: 200px;
        box-shadow: none;
    }

    .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .detail-title {
        font-size: var(--wk-text-sm);
        font-weight: 700;
        color: var(--wk-ink-muted);
        text-transform: uppercase;
        letter-spacing: .08em;
    }

    .close-btn {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--wk-ink-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s;
    }

    .close-btn:hover {
        background: var(--wk-background);
        color: var(--wk-primary);
    }

    .detail-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 32px 20px;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
    }

    .loading-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--wk-border);
        border-top-color: var(--wk-primary);
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
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
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
        font-size: clamp(20px, 2vw, 28px);
        font-weight: 600;
        color: var(--wk-ink);
        font-variant-numeric: tabular-nums;
    }

    .badge {
        padding: 2px 10px;
        border-radius: 12px;
        font-size: var(--wk-text-xs);
        font-weight: 600;
    }

    .badge-diary {
        background: color-mix(in srgb, var(--wk-primary) 15%, transparent);
        color: var(--wk-primary);
    }

    .badge-no-diary {
        background: var(--wk-background);
        color: var(--wk-ink-muted);
    }

    .stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 0;
        padding: 14px 0;
        border-block: 1px solid var(--wk-divider);
    }

    .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 5px 14px;
        border: 0;
        border-right: 1px solid var(--wk-divider);
        border-radius: 0;
        background: transparent;
    }

    .stat-card:last-child { border-right: 0; }

    .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--wk-ink);
        font-variant-numeric: tabular-nums;
    }

    .stat-label {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .review-status {
        padding: 10px 0;
        border-radius: 0;
        background: transparent;
        border: 0;
    }

    .review-text {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink);
        font-weight: 600;
    }

    .warning-box {
        padding: 8px 12px;
        border-radius: 8px;
        background: transparent;
        border: 1px solid var(--wk-warning-border);
    }

    .warning-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--wk-text-sm);
        font-weight: 600;
        color: var(--wk-warning);
        margin-bottom: 4px;
    }

    .missing-list {
        margin: 0;
        padding-left: 18px;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        line-height: 1.6;
    }

    .detail-actions {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 10px;
        flex-wrap: wrap;
        padding-top: 8px;
    }

    .open-doc-btn {
        padding: 8px 20px;
        border: 1px solid var(--wk-primary);
        border-radius: 8px;
        background: var(--wk-primary);
        color: var(--wk-primary-contrast);
        font-size: var(--wk-text-sm);
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
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s;
    }

    .open-records-btn:hover,
    .open-review-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .open-tasks-btn {
        padding: 8px 20px;
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s;
    }

    .open-tasks-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .no-diary-hint {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    @container (max-width: 760px) {
        .stat-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>
