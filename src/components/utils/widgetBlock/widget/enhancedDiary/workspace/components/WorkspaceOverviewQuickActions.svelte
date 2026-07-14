<script lang="ts">
    import WorkspaceOverviewIcon, { type WorkspaceOverviewIconName } from "./WorkspaceOverviewIcon.svelte";

    interface Props {
        onCreateTask: () => void;
        onCreateRecord: () => void;
        onOpenAndAppendTemplate: () => void | Promise<void>;
        onGoProjects: () => void;
        taskManagementEnabled?: boolean;
        todayDiaryExists?: boolean;
    }
    interface Action { key: string; icon: WorkspaceOverviewIconName; title: string; description: string; run: () => void | Promise<void>; }

    let { onCreateTask, onCreateRecord, onOpenAndAppendTemplate, onGoProjects, taskManagementEnabled = true, todayDiaryExists = true }: Props = $props();
    const actions = $derived.by((): Action[] => [
        ...(taskManagementEnabled ? [{ key: "task", icon: "taskAdd" as const, title: "新建任务", description: "记录下一步行动", run: onCreateTask }] : []),
        { key: "record", icon: "recordAdd", title: "快速记录", description: "保存想法与过程", run: onCreateRecord },
        { key: "diary", icon: "today", title: todayDiaryExists ? "打开今日日记" : "创建今日日记", description: todayDiaryExists ? "回到今天的日记" : "开始今天的记录", run: onOpenAndAppendTemplate },
        { key: "projects", icon: "projects", title: "进入项目中心", description: "继续推进项目", run: onGoProjects },
    ]);
</script>

<section class="wk-card quick-card">
    <header><span>快速开始</span><small>常用操作</small></header>
    <div class="quick-grid">
        {#each actions as action (action.key)}
            <button type="button" onclick={action.run}>
                <span class="icon"><WorkspaceOverviewIcon name={action.icon} size={19} /></span>
                <strong>{action.title}</strong>
                <small>{action.description}</small>
            </button>
        {/each}
    </div>
</section>

<style>
    .quick-card { min-width: 0; padding: 20px; }
    header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 14px; color: var(--wk-ink); font-size: var(--wk-text-lg); font-weight: 650; }
    header small { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); font-weight: 500; }
    .quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; min-width: 0; }
    button { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 1px 8px; align-items: center; min-width: 0; min-height: 64px; padding: 9px; border: 1px solid var(--wk-border-light); border-radius: var(--wk-radius-md); background: transparent; color: var(--wk-ink-secondary); text-align: left; cursor: pointer; transition: border-color var(--wk-transition-fast), background var(--wk-transition-fast), transform var(--wk-transition-fast); }
    button:hover { border-color: var(--wk-primary-border); background: var(--wk-surface-hover); transform: translateY(-1px); }
    .icon { display: inline-flex; grid-row: 1 / 3; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--wk-radius-sm); background: var(--wk-primary-subtle); color: var(--wk-primary); }
    strong, button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    strong { font-size: var(--wk-text-sm); }
    button small { color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    @container (max-width: 420px) { .quick-grid { grid-template-columns: 1fr; } }
</style>
