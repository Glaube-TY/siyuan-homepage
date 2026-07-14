<script lang="ts">
    import WorkspaceIcon, { type WorkspaceIconName } from "./WorkspaceIcon.svelte";

    export type WorkspaceTab = "overview" | "tasks" | "projects" | "records" | "plans" | "review" | "calendar" | "notifications" | "settings";

    interface Props {
        activeTab: WorkspaceTab;
        onSelect: (tab: WorkspaceTab) => void;
        notificationCount?: number;
        taskManagementEnabled?: boolean;
    }

    let { activeTab, onSelect, notificationCount = 0, taskManagementEnabled = true }: Props = $props();

    const mainTabs: Array<{ key: WorkspaceTab; label: string; icon: WorkspaceIconName; requiresTasks?: boolean }> = [
        { key: "overview", label: "总览", icon: "overview" },
        { key: "tasks",    label: "任务", icon: "tasks", requiresTasks: true },
        { key: "projects", label: "项目", icon: "projects" },
        { key: "records",  label: "记录", icon: "records" },
        { key: "plans",    label: "计划", icon: "plans" },
        { key: "review",   label: "复盘", icon: "review" },
    ];

    const auxTabs: Array<{ key: WorkspaceTab; label: string; icon: WorkspaceIconName }> = [
        { key: "calendar",       label: "日历",   icon: "calendar" },
        { key: "notifications",  label: "通知",   icon: "notifications" },
        { key: "settings",       label: "设置",   icon: "settings" },
    ];

    const visibleMainTabs = $derived(mainTabs.filter((tab) => taskManagementEnabled || !tab.requiresTasks));

    function isTabActive(tabKey: WorkspaceTab): boolean {
        return activeTab === tabKey;
    }
</script>

<nav class="workspace-sidebar" aria-label="强化日记工作台导航">
    <div class="nav-group">
        <div class="nav-section-label">工作区</div>
        {#each visibleMainTabs as tab}
            <button
                type="button"
                class:active={isTabActive(tab.key)}
                onclick={() => onSelect(tab.key)}
                title={tab.label}
            >
                <span class="tab-icon" aria-hidden="true"><WorkspaceIcon name={tab.icon} size={16} /></span>
                <span class="tab-label">{tab.label}</span>
            </button>
        {/each}
    </div>

    <div class="nav-divider"></div>

    <div class="nav-group">
        {#each auxTabs as tab}
            <button
                type="button"
                class:active={isTabActive(tab.key)}
                onclick={() => onSelect(tab.key)}
                title={tab.label}
            >
                <span class="tab-icon" aria-hidden="true"><WorkspaceIcon name={tab.icon} size={16} /></span>
                <span class="tab-label">{tab.label}</span>
                {#if tab.key === "notifications" && notificationCount > 0}
                    <span class="notification-badge">{notificationCount > 99 ? "99+" : notificationCount}</span>
                {/if}
            </button>
        {/each}
    </div>
</nav>

<style>
    .workspace-sidebar {
        border: 0;
        border-right: 1px solid var(--wk-divider);
        border-radius: 0;
        background: var(--b3-theme-surface);
        padding: 14px 11px;
        width: 188px;
        box-sizing: border-box;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        box-shadow: none;
    }

    .nav-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .nav-section-label {
        font-size: var(--wk-text-xs);
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--wk-ink-faint);
        padding: 0 10px 10px;
        font-weight: 600;
    }

    .nav-divider {
        height: 1px;
        background: var(--wk-border-light);
        margin: 8px 10px;
    }

    button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 9px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--wk-ink-muted);
        padding: 10px 11px;
        cursor: pointer;
        text-align: left;
        font-size: var(--wk-text-base);
        font-weight: 500;
        transition: background var(--wk-transition-fast), color var(--wk-transition-fast), transform var(--wk-transition-fast);
        position: relative;
    }

    button:hover {
        background: var(--wk-primary-subtle);
        color: var(--wk-ink-secondary);
    }

    button.active {
        background: color-mix(in srgb, var(--b3-theme-primary) 9%, transparent);
        color: var(--wk-primary);
        font-weight: 600;
    }

    button.active::before {
        content: "";
        position: absolute;
        left: 1px;
        top: 24%;
        bottom: 24%;
        width: 3px;
        border-radius: 3px;
        background: var(--wk-primary);
    }

    .tab-icon {
        font-size: 16px;
        flex-shrink: 0;
        line-height: 1;
        opacity: 0.72;
        transition: opacity var(--wk-transition-fast);
    }

    button:hover .tab-icon,
    button.active .tab-icon {
        opacity: 1;
    }

    .tab-label {
        flex: 1;
        min-width: 0;
    }

    .notification-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: var(--wk-radius-pill);
        background: var(--wk-error);
        color: var(--b3-theme-on-error, var(--b3-theme-on-primary));
        font-size: 12px;
        font-weight: 700;
        text-align: center;
        flex-shrink: 0;
        line-height: 1;
    }

    /* Medium width: icon-only mode */
    @container (max-width: 1100px) and (min-width: 901px) {
        .workspace-sidebar {
            width: 56px;
            padding: 10px 6px;
        }

        .tab-label,
        .nav-section-label,
        .nav-divider,
        button.active::before {
            display: none;
        }

        button {
            justify-content: center;
            padding: 10px 6px;
            border-radius: var(--wk-radius-sm);
        }

        .nav-group {
            gap: 4px;
        }
    }

    /* Narrow: horizontal scrollable */
    @container (max-width: 900px) {
        .workspace-sidebar {
            position: fixed;
            z-index: 60;
            left: 12px;
            right: 12px;
            bottom: 10px;
            width: auto;
            flex-direction: row;
            justify-content: space-around;
            gap: 2px;
            overflow-x: auto;
            border: 1px solid var(--wk-border-subtle);
            padding: 7px 8px calc(7px + env(safe-area-inset-bottom));
            border-radius: 20px;
            box-shadow: var(--wk-shadow-sm);
            background: var(--b3-theme-surface);
        }

        .nav-section-label,
        .nav-divider {
            display: none;
        }

        button {
            width: auto;
            min-width: 52px;
            flex-direction: column;
            gap: 3px;
            padding: 7px 9px 6px;
            font-size: var(--wk-text-xs);
            text-align: center;
            border-radius: 13px;
        }

        button.active::before {
            left: 20%;
            right: 20%;
            top: auto;
            bottom: 2px;
            width: auto;
            height: 2px;
            border-radius: 1px 1px 0 0;
        }

        .tab-label {
            font-size: 12px;
        }
    }
</style>
