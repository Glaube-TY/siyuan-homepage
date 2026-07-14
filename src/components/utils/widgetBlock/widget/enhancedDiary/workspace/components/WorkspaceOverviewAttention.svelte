<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import { countNotifications } from "../enhancedDiaryWorkspaceOverview";
    import WorkspaceOverviewIcon, { type WorkspaceOverviewIconName } from "./WorkspaceOverviewIcon.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        taskManagementEnabled?: boolean;
        onGoOverdue: () => void;
        onGoMigrate: () => void;
        onGoNotifications: () => void;
        onGoReview: () => void;
    }
    interface AttentionItem { key: string; icon: WorkspaceOverviewIconName; count: number; title: string; detail: string; run: () => void; danger?: boolean; }

    let { state, taskManagementEnabled = true, onGoOverdue, onGoMigrate, onGoNotifications, onGoReview }: Props = $props();
    const items = $derived.by((): AttentionItem[] => {
        const result: AttentionItem[] = [];
        const overdue = state.tasks.filter((task) => !task.completed && task.isOverdue).length;
        const migration = state.tasks.filter((task) => !task.completed && task.shouldMigrate).length;
        const project = countNotifications(state.notifications, ["project_relation", "project_index"]);
        const review = countNotifications(state.notifications, ["review_due"]);
        const templateMissing = countNotifications(state.notifications, ["template_missing"]);
        if (taskManagementEnabled && overdue) result.push({ key: "overdue", icon: "clock", count: overdue, title: "逾期任务", detail: "需要尽快确认处理顺序", run: onGoOverdue, danger: true });
        if (taskManagementEnabled && migration) result.push({ key: "migration", icon: "refresh", count: migration, title: "建议迁移", detail: "长期未推进的历史任务", run: onGoMigrate });
        if (project) result.push({ key: "project", icon: "attention", count: project, title: "项目状态", detail: "关系或索引需要检查", run: onGoNotifications });
        if (review || templateMissing) {
            if (templateMissing) {
                result.push({ key: "review-template", icon: "calendar", count: review + templateMissing, title: review ? "复盘与模板" : "模板异常", detail: review ? "复盘与模板均需处理" : "今日日记模板结构缺失", run: onGoNotifications });
            } else {
                result.push({ key: "review", icon: "calendar", count: review, title: "待处理复盘", detail: "复盘状态或模板待完善", run: onGoReview });
            }
        }
        return result.slice(0, 4);
    });
</script>

<section class="wk-card attention-card">
    <header><div><span><WorkspaceOverviewIcon name="attention" size={15} />需要关注</span><h2>当前风险摘要</h2></div></header>
    {#if items.length}
        <div class="attention-list">
            {#each items as item (item.key)}
                <button type="button" onclick={item.run} class:danger={item.danger}>
                    <span class="icon"><WorkspaceOverviewIcon name={item.icon} size={16} /></span>
                    <span class="copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <b>{item.count}</b><WorkspaceOverviewIcon name="arrow" size={14} />
                </button>
            {/each}
        </div>
    {:else}
        <div class="empty"><WorkspaceOverviewIcon name="check" size={25} /><strong>当前没有需要处理的问题</strong></div>
    {/if}
</section>

<style>
    .attention-card { min-width: 0; padding: 20px; }
    header { margin-bottom: 12px; }
    header span { display: inline-flex; align-items: center; gap: 6px; color: var(--wk-primary); font-size: var(--wk-text-xs); font-weight: 650; }
    h2 { margin: 4px 0 0; color: var(--wk-ink); font-size: var(--wk-text-lg); }
    .attention-list { display: grid; gap: 4px; min-width: 0; }
    button { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto 14px; align-items: center; gap: 8px; min-width: 0; padding: 9px 7px; border: 0; border-bottom: 1px solid var(--wk-divider); background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    button:last-child { border-bottom: 0; }
    button:hover { background: var(--wk-surface-hover); }
    .icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--wk-radius-sm); background: var(--wk-primary-subtle); color: var(--wk-primary); }
    .copy { display: grid; gap: 2px; min-width: 0; }
    .copy strong, .copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .copy strong { font-size: var(--wk-text-sm); }
    .copy small { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    b { color: var(--wk-ink); font: 650 var(--wk-text-base) var(--wk-number-font); }
    button.danger .icon, button.danger b { color: var(--wk-error); }
    button.danger .icon { background: var(--wk-error-bg); }
    .empty { display: grid; justify-items: center; gap: 8px; padding: 28px 8px; color: var(--wk-ink-muted); text-align: center; }
    .empty strong { color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); }
</style>
