<script lang="ts">
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { EnhancedDiaryWorkspaceReviewCard } from "../enhancedDiaryWorkspaceViewModel";
    import type { WorkspaceTaskStatusFilter } from "../enhancedDiaryWorkspaceNavigation";

    interface Props {
        hasActionItems: boolean;
        hasNoDiaryReminder: boolean;
        hasTemplateMissing: boolean;
        overdueTasks: EnhancedDiaryWorkspaceTask[];
        migrateTasks: EnhancedDiaryWorkspaceTask[];
        pendingReviewCards: EnhancedDiaryWorkspaceReviewCard[];
        onOpenToday: () => void | Promise<void>;
        onAppendTemplate: () => void | Promise<void>;
        onGoTasks: (statusFilter?: WorkspaceTaskStatusFilter) => void;
        onGoReview: () => void;
        onGoNotifications: () => void;
    }

    let {
        hasActionItems,
        hasNoDiaryReminder,
        hasTemplateMissing,
        overdueTasks,
        migrateTasks,
        pendingReviewCards,
        onOpenToday,
        onAppendTemplate,
        onGoTasks,
        onGoReview,
        onGoNotifications,
    }: Props = $props();
</script>

<div class="card wide">
    <div class="card-head">
        <h2>今日行动</h2>
        <button type="button" class="btn-link" onclick={onGoNotifications}>全部通知 →</button>
    </div>

    {#if !hasActionItems}
        <WorkspaceEmptyState title="暂无待处理行动" description="所有任务都已处理，继续保持！" />
    {:else}
        <div class="action-list">
            {#if hasNoDiaryReminder}
                <div class="action-item level-danger">
                    <span class="action-icon">📅</span>
                    <div class="action-content">
                        <strong>今日无日记</strong>
                        <span>今天还没有创建日记，建议先打开或创建今日日记。</span>
                    </div>
                    <button type="button" class="action-btn" onclick={onOpenToday}>打开日记</button>
                </div>
            {/if}

            {#if hasTemplateMissing}
                <div class="action-item level-warning">
                    <span class="action-icon">🔧</span>
                    <div class="action-content">
                        <strong>模板缺失</strong>
                        <span>今日日记模板结构不完整，可能影响写入操作。</span>
                    </div>
                    <button type="button" class="action-btn" onclick={onAppendTemplate}>补充模板</button>
                </div>
            {/if}

            {#each overdueTasks as task}
                <div class="action-item level-danger">
                    <span class="action-icon">⚠️</span>
                    <div class="action-content">
                        <strong>{task.taskname}</strong>
                        <span>逾期任务{task.deadline ? `，截止 ${task.deadline}` : ""}，建议尽快处理。</span>
                    </div>
                    <button type="button" class="action-btn" onclick={() => onGoTasks("overdue")}>去处理</button>
                </div>
            {/each}

            {#each migrateTasks as task}
                <div class="action-item level-warning">
                    <span class="action-icon">📦</span>
                    <div class="action-content">
                        <strong>{task.taskname}</strong>
                        <span>建议迁移到今日{task.sourceDate ? `（来自 ${task.sourceDate}）` : ""}。</span>
                    </div>
                    <button type="button" class="action-btn" onclick={() => onGoTasks("migrate")}>去任务中心</button>
                </div>
            {/each}

            {#each pendingReviewCards as card}
                <div class="action-item level-info">
                    <span class="action-icon">🔄</span>
                    <div class="action-content">
                        <strong>{card.title}</strong>
                        <span>{card.statusLabel}，{card.dateOrRange} 需要处理。</span>
                    </div>
                    <button type="button" class="action-btn" onclick={onGoReview}>去复盘</button>
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

    .btn-link {
        border: none;
        background: transparent;
        color: var(--b3-theme-primary);
        padding: 4px 6px;
        font-size: 12px;
        cursor: pointer;
        border-radius: 7px;
    }

    .btn-link:hover {
        opacity: 0.75;
    }

    .action-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .action-item {
        display: flex;
        align-items: center;
        gap: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        padding: 12px 14px;
        transition: all 0.12s;
    }

    .action-item.level-danger {
        border-left: 3px solid var(--b3-theme-error, #d32f2f);
    }

    .action-item.level-warning {
        border-left: 3px solid #e6900a;
    }

    .action-item.level-info {
        border-left: 3px solid var(--b3-theme-primary);
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
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        margin-bottom: 2px;
    }

    .action-content span {
        display: block;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }

    .action-btn {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: all 0.12s;
    }

    .action-btn:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }
</style>
