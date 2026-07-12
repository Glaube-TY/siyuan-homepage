<script lang="ts">
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { EnhancedDiaryWorkspaceReviewCard } from "../enhancedDiaryWorkspaceViewModel";
    import type { WorkspaceTaskStatusFilter } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        hasActionItems: boolean;
        hasNoDiaryReminder: boolean;
        hasTemplateMissing: boolean;
        overdueTasks: EnhancedDiaryWorkspaceTask[];
        migrateTasks: EnhancedDiaryWorkspaceTask[];
        pendingReviewCards: EnhancedDiaryWorkspaceReviewCard[];
        onOpenAndAppendTemplate: () => void | Promise<void>;
        onGoTasks: (statusFilter?: WorkspaceTaskStatusFilter) => void;
        onGoReview: () => void;
        onGoNotifications: () => void;
        taskManagementEnabled?: boolean;
    }

    let {
        hasActionItems,
        hasNoDiaryReminder,
        hasTemplateMissing,
        overdueTasks,
        migrateTasks,
        pendingReviewCards,
        onOpenAndAppendTemplate,
        onGoTasks,
        onGoReview,
        onGoNotifications,
        taskManagementEnabled = true,
    }: Props = $props();

    const actionableTasks = $derived(taskManagementEnabled ? overdueTasks : []);
    const actionableMigrations = $derived(taskManagementEnabled ? migrateTasks : []);
</script>

<div class="wk-card action-card">
    <div class="wk-card-head">
        <h2 class="wk-card-title">今日行动</h2>
        <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={onGoNotifications}>通知中心 →</button>
    </div>

    {#if !hasActionItems}
        <WorkspaceEmptyState title="今天没有需要行动的项" description={taskManagementEnabled ? "当前清爽，没有逾期或待迁移的任务。" : "日记和复盘都处在正常节奏。"} />
    {:else}
        <div class="action-list">
            {#if hasNoDiaryReminder || hasTemplateMissing}
                <button type="button" class="action-item" onclick={onOpenAndAppendTemplate}>
                    <span class="action-dot {hasNoDiaryReminder ? 'tone-primary' : 'tone-warning'}"></span>
                    <span class="action-icon"><WorkspaceIcon name="diary" size={16} /></span>
                    <span class="action-content">
                        <strong>{hasNoDiaryReminder ? "今天还没写日记" : "日记模板结构不完整"}</strong>
                        <span>打开即可补全，不会覆盖已有内容。</span>
                    </span>
                    <span class="action-label">去处理 →</span>
                </button>
            {/if}

            {#each actionableTasks as task}
                <button type="button" class="action-item" onclick={() => onGoTasks("overdue")}>
                    <span class="action-dot tone-danger"></span>
                    <span class="action-icon"><WorkspaceIcon name="warning" size={16} /></span>
                    <span class="action-content">
                        <strong>{task.taskname}</strong>
                        <span>逾期{task.deadline ? `，截止 ${task.deadline}` : ""}</span>
                    </span>
                    <span class="action-label">处理 →</span>
                </button>
            {/each}

            {#each actionableMigrations as task}
                <button type="button" class="action-item" onclick={() => onGoTasks("migrate")}>
                    <span class="action-dot tone-warning"></span>
                    <span class="action-icon"><WorkspaceIcon name="migrate" size={16} /></span>
                    <span class="action-content">
                        <strong>{task.taskname}</strong>
                        <span>可迁移{task.sourceDate ? `（来自 ${task.sourceDate}）` : ""}</span>
                    </span>
                    <span class="action-label">迁移 →</span>
                </button>
            {/each}

            {#each pendingReviewCards as card}
                <button type="button" class="action-item" onclick={onGoReview}>
                    <span class="action-dot tone-info"></span>
                    <span class="action-icon"><WorkspaceIcon name="review" size={16} /></span>
                    <span class="action-content">
                        <strong>{card.title}</strong>
                        <span>{card.statusLabel} · {card.dateOrRange}</span>
                    </span>
                    <span class="action-label">复盘 →</span>
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .action-list {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-xs);
    }

    .action-item {
        display: flex;
        align-items: center;
        gap: var(--wk-gap-sm);
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-md);
        background: var(--wk-bg-card);
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
        transition: border-color var(--wk-transition-fast), box-shadow var(--wk-transition-fast);
        color: inherit;
        font: inherit;
        width: 100%;
    }

    .action-item:hover {
        border-color: var(--wk-primary-border);
        box-shadow: var(--wk-shadow-sm);
    }

    .action-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--wk-ink-muted);
    }

    .action-dot.tone-danger  { background: var(--wk-error); }
    .action-dot.tone-warning { background: var(--wk-warning); }
    .action-dot.tone-primary { background: var(--wk-primary); }
    .action-dot.tone-info    { background: var(--wk-info); }

    .action-icon {
        font-size: 16px;
        flex-shrink: 0;
        color: var(--wk-ink-muted);
    }

    .action-content {
        flex: 1;
        min-width: 0;
    }

    .action-content strong {
        display: block;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
        margin-bottom: 1px;
    }

    .action-content span {
        display: block;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .action-label {
        font-size: var(--wk-text-sm);
        color: var(--wk-primary);
        white-space: nowrap;
        flex-shrink: 0;
        font-weight: 500;
    }
</style>
