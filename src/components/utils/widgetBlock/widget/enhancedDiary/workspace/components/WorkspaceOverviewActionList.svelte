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
        <button type="button" class="wk-btn wk-btn-ghost wk-btn-sm" onclick={onGoNotifications}>全部通知 →</button>
    </div>

    {#if !hasActionItems}
        <WorkspaceEmptyState title="今天没有待办" description={taskManagementEnabled ? "当前清爽，没有逾期或待迁移的任务。" : "日记和复盘都处在正常节奏。"} />
    {:else}
        <div class="action-list">
            {#if hasNoDiaryReminder || hasTemplateMissing}
                <div class="action-item {hasNoDiaryReminder ? 'level-danger' : 'level-warning'}">
                    <span class="action-icon"><WorkspaceIcon name="diary" size={18} /></span>
                    <div class="action-content">
                        <strong>{hasNoDiaryReminder ? "今天还没写日记" : "日记结构不完整"}</strong>
                        <span>{hasNoDiaryReminder ? "打开即可补全今日模板，不会覆盖已有内容。" : "补充模板只会追加缺失部分，已有内容不受影响。"}</span>
                    </div>
                    <button type="button" class="wk-btn wk-btn-secondary wk-btn-sm" onclick={onOpenAndAppendTemplate}>打开并补模板</button>
                </div>
            {/if}

            {#each actionableTasks as task}
                <div class="action-item level-danger">
                    <span class="action-icon"><WorkspaceIcon name="warning" size={18} /></span>
                    <div class="action-content">
                        <strong>{task.taskname}</strong>
                        <span>逾期{task.deadline ? `，截止 ${task.deadline}` : ""}，该处理了。</span>
                    </div>
                    <button type="button" class="wk-btn wk-btn-secondary wk-btn-sm" onclick={() => onGoTasks("overdue")}>去处理</button>
                </div>
            {/each}

            {#each actionableMigrations as task}
                <div class="action-item level-warning">
                    <span class="action-icon"><WorkspaceIcon name="migrate" size={18} /></span>
                    <div class="action-content">
                        <strong>{task.taskname}</strong>
                        <span>可以迁移到今天{task.sourceDate ? `（来自 ${task.sourceDate}）` : ""}。</span>
                    </div>
                    <button type="button" class="wk-btn wk-btn-secondary wk-btn-sm" onclick={() => onGoTasks("migrate")}>去任务中心</button>
                </div>
            {/each}

            {#each pendingReviewCards as card}
                <div class="action-item level-info">
                    <span class="action-icon"><WorkspaceIcon name="review" size={18} /></span>
                    <div class="action-content">
                        <strong>{card.title}</strong>
                        <span>{card.statusLabel}，{card.dateOrRange} 待处理。</span>
                    </div>
                    <button type="button" class="wk-btn wk-btn-secondary wk-btn-sm" onclick={onGoReview}>去复盘</button>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .action-card {
        grid-column: 1 / -1;
    }

    .action-list {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-sm);
    }

    .action-item {
        display: flex;
        align-items: center;
        gap: var(--wk-gap-sm);
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-md);
        background: var(--wk-background);
        padding: 12px 14px;
        transition: border-color var(--wk-transition-fast), box-shadow var(--wk-transition-fast);
    }

    .action-item.level-danger {
        border-left: 3px solid var(--wk-error);
    }

    .action-item.level-warning {
        border-left: 3px solid var(--wk-warning);
    }

    .action-item.level-info {
        border-left: 3px solid var(--wk-primary);
    }

    .action-icon {
        font-size: 18px;
        flex-shrink: 0;
    }

    .action-content {
        flex: 1;
        min-width: 0;
    }

    .action-content strong {
        display: block;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
        margin-bottom: 2px;
    }

    .action-content span {
        display: block;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }
</style>
