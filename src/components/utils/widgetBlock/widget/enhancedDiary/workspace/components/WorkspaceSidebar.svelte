<script lang="ts">
    import WorkspaceIcon, { type WorkspaceIconName } from "./WorkspaceIcon.svelte";

    export type WorkspaceTab = "overview" | "tasks" | "projects" | "records" | "review" | "more" | "calendar" | "notifications" | "settings";

    interface Props {
        activeTab: WorkspaceTab;
        onSelect: (tab: WorkspaceTab) => void;
        notificationCount?: number;
        taskManagementEnabled?: boolean;
    }

    let { activeTab, onSelect, notificationCount = 0, taskManagementEnabled = true }: Props = $props();

    const allTabs: Array<{ key: WorkspaceTab; label: string; icon: WorkspaceIconName; requiresTasks?: boolean }> = [
        { key: "overview",       label: "总览",   icon: "overview" },
        { key: "tasks",          label: "任务",   icon: "tasks", requiresTasks: true },
        { key: "projects",       label: "项目",   icon: "projects", requiresTasks: true },
        { key: "records",        label: "记录",   icon: "records" },
        { key: "review",         label: "复盘",   icon: "review" },
        { key: "settings",       label: "设置",   icon: "settings" },
        { key: "more",           label: "更多",   icon: "more" },
    ];

    const tabs = $derived(allTabs.filter((tab) => taskManagementEnabled || !tab.requiresTasks));

    function isTabActive(tabKey: WorkspaceTab): boolean {
        if (tabKey === "more") {
            return activeTab === "more" || activeTab === "calendar" || activeTab === "notifications";
        }
        return activeTab === tabKey;
    }
</script>

<nav class="workspace-sidebar" aria-label="强化日记工作台导航">
    <div class="nav-section-label">导航</div>
    {#each tabs as tab}
        <button
            type="button"
            class:active={isTabActive(tab.key)}
            onclick={() => onSelect(tab.key)}
        >
            <span class="tab-icon" aria-hidden="true"><WorkspaceIcon name={tab.icon} size={15} /></span>
            <span class="tab-label">{tab.label}</span>
            {#if tab.key === "more" && notificationCount > 0}
                <em class="badge">{notificationCount > 99 ? "99+" : notificationCount}</em>
            {/if}
        </button>
    {/each}
</nav>

<style>
    .workspace-sidebar {
        border-right: 1px solid var(--wk-border);
        background: var(--wk-surface);
        padding: 14px 10px;
        width: 200px;
        box-sizing: border-box;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .nav-section-label {
        font-size: var(--wk-text-xs);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--wk-ink-faint);
        padding: 0 10px 8px;
    }

    button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 9px;
        border: none;
        border-radius: var(--wk-radius-sm);
        background: transparent;
        color: var(--wk-ink-secondary);
        padding: 9px 10px;
        cursor: pointer;
        text-align: left;
        font-size: var(--wk-text-base);
        transition: background var(--wk-transition-fast), color var(--wk-transition-fast);
        position: relative;
    }

    button:hover {
        background: color-mix(in srgb, var(--wk-primary) 8%, transparent);
        color: var(--wk-primary);
    }

    button.active {
        background: color-mix(in srgb, var(--wk-primary) 14%, transparent);
        color: var(--wk-primary);
        font-weight: 600;
    }

    button.active::before {
        content: "";
        position: absolute;
        left: 0;
        top: 20%;
        bottom: 20%;
        width: 3px;
        border-radius: 0 3px 3px 0;
        background: var(--wk-primary);
    }

    .tab-icon {
        font-size: 15px;
        flex-shrink: 0;
        line-height: 1;
    }

    .tab-label {
        flex: 1;
        min-width: 0;
    }

    .badge {
        min-width: 18px;
        padding: 1px 5px;
        border-radius: var(--wk-radius-pill);
        background: var(--wk-error);
        color: #fff;
        font-style: normal;
        font-size: var(--wk-text-xs);
        text-align: center;
        flex-shrink: 0;
    }

    @media (max-width: 900px) {
        .workspace-sidebar {
            width: 100%;
            flex-direction: row;
            gap: 4px;
            overflow-x: auto;
            border-right: none;
            border-bottom: 1px solid var(--wk-border);
            padding: 8px 10px;
        }

        .nav-section-label {
            display: none;
        }

        button {
            width: auto;
            min-width: 72px;
            flex-direction: column;
            gap: 3px;
            padding: 7px 10px;
            font-size: var(--wk-text-xs);
            text-align: center;
        }

        button.active::before {
            left: 20%;
            right: 20%;
            top: auto;
            bottom: 0;
            width: auto;
            height: 3px;
            border-radius: 3px 3px 0 0;
        }

        .tab-icon {
            font-size: 16px;
        }
    }
</style>
