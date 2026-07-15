<script lang="ts">
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        today: string;
        loading?: boolean;
        onRefresh: () => void | Promise<void>;
        onOpenAndAppendTemplate: () => void | Promise<void>;
        onOpenCommandPalette?: () => void;
        /** Daily Pulse stats */
        todayTaskCount?: number;
        overdueTaskCount?: number;
        recordCount?: number;
        projectCount?: number;
        reviewStatusText?: string;
        taskManagementEnabled?: boolean;
        showPulse?: boolean;
        onGoTasks?: (filter?: string) => void;
        onGoRecords?: () => void;
        onGoProjects?: () => void;
        onGoReview?: () => void;
        mobile?: boolean;
        onClose?: () => void;
    }

    let {
        today,
        loading = false,
        onRefresh,
        onOpenAndAppendTemplate,
        onOpenCommandPalette,
        todayTaskCount = 0,
        overdueTaskCount = 0,
        recordCount = 0,
        projectCount = 0,
        reviewStatusText = "0/0",
        taskManagementEnabled = true,
        showPulse = true,
        onGoTasks,
        onGoRecords,
        onGoProjects,
        onGoReview,
        mobile = false,
        onClose,
    }: Props = $props();

    const naturalDate = $derived(formatNaturalDate(today));

    function formatNaturalDate(dateStr: string): string {
        if (!dateStr) return "";
        try {
            const [y, m, d] = dateStr.split("-").map(Number);
            if (!y || !m || !d) return dateStr;
            const dt = new Date(y, m - 1, d);
            const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
            return `${m} 月 ${d} 日 · ${weekdays[dt.getDay()]}`;
        } catch {
            return dateStr;
        }
    }
</script>

<header class="workspace-header" class:workspace-header--mobile={mobile}>
    <div class="header-top">
        <div class="header-left">
            {#if mobile && onClose}
                <button type="button" class="workspace-mobile-close" onclick={onClose} aria-label="关闭强化日记工作台" title="返回">
                    <WorkspaceIcon name="previous" size={20} />
                </button>
            {/if}
            <div class="header-brand">
                <div>
                    <h1>强化日记</h1>
                    <p class="header-date">{naturalDate}</p>
                </div>
            </div>
        </div>
        <div class="header-right">
            {#if onOpenCommandPalette}
                <button type="button" class="command-entry" onclick={onOpenCommandPalette} title="Ctrl/Cmd + K">
                    <WorkspaceIcon name="search" size={15} />
                    <span class="command-label-full">搜索任务、记录和项目</span>
                    <span class="command-label-short">搜索</span>
                    <kbd>Ctrl K</kbd>
                </button>
            {/if}
            <button type="button" class="wk-icon-button" onclick={onRefresh} disabled={loading} title="刷新">
                <WorkspaceIcon name="refresh" size={16} />
            </button>
            <button type="button" class="wk-btn wk-btn-primary open-today-button" onclick={onOpenAndAppendTemplate}>
                <span class="open-today-full">打开今日日记</span><span class="open-today-short">今日日记</span>
            </button>
        </div>
    </div>

    {#if showPulse}<div class="daily-pulse">
        {#if taskManagementEnabled}
            <button type="button" class="wk-inline-stat" onclick={() => onGoTasks?.("today")}>
                <span class="wk-inline-stat-value">{todayTaskCount}</span> 今日任务
            </button>
            <span class="pulse-sep">·</span>
            <button type="button" class="wk-inline-stat" onclick={() => onGoTasks?.("overdue")}>
                <span class="wk-inline-stat-value" class:stat-danger={overdueTaskCount > 0}>{overdueTaskCount}</span> 逾期
            </button>
            <span class="pulse-sep">·</span>
        {/if}
        <button type="button" class="wk-inline-stat" onclick={() => onGoRecords?.()}>
            <span class="wk-inline-stat-value">{recordCount}</span> 记录
        </button>
        {#if taskManagementEnabled}
            <span class="pulse-sep">·</span>
            <button type="button" class="wk-inline-stat" onclick={() => onGoProjects?.()}>
                <span class="wk-inline-stat-value">{projectCount}</span> 项目
            </button>
        {/if}
        <span class="pulse-sep">·</span>
        <button type="button" class="wk-inline-stat" onclick={() => onGoReview?.()}>
            <span class="wk-inline-stat-value">{reviewStatusText}</span> 复盘
        </button>
    </div>{/if}
</header>

<style>
    .workspace-header {
        background: transparent;
        border-bottom: none;
        padding: 20px clamp(20px, 2.5vw, 40px) 16px;
        border-bottom: 1px solid var(--wk-divider);
    }

    .header-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }

    .workspace-mobile-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        flex: 0 0 44px;
        padding: 0;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-bg-card);
        color: var(--wk-ink-secondary);
        cursor: pointer;
    }

    h1 {
        margin: 0 0 2px;
        font-size: 24px;
        font-weight: 720;
        color: var(--wk-ink);
        letter-spacing: -0.02em;
        line-height: 1.22;
    }

    .header-date {
        margin: 4px 0 0;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .command-entry {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 13px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: color-mix(in srgb, var(--wk-bg-card) 88%, transparent);
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: all var(--wk-transition-fast);
        min-width: min(240px, 24vw);
    }

    .command-entry:hover {
        border-color: var(--wk-primary-border);
        color: var(--wk-ink-secondary);
    }

    .command-entry kbd {
        margin-left: auto;
        padding: 1px 6px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid var(--wk-border-light);
        border-radius: 3px;
        background: var(--wk-bg-card);
        color: var(--wk-ink-faint);
        font-family: inherit;
    }

    .command-label-short,
    .open-today-short {
        display: none;
    }

    .daily-pulse {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 14px;
        padding-top: 0;
        border-top: none;
        gap: 20px;
    }

    .pulse-sep {
        display: none;
    }

    .daily-pulse :global(.wk-inline-stat) {
        min-height: 32px;
        padding: 4px 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
    }

    .stat-danger {
        color: var(--wk-error) !important;
    }

    @container (max-width: 760px) {
        .workspace-header {
            padding: 20px 16px 16px;
        }

        .header-top {
            flex-direction: column;
            align-items: stretch;
        }

        .command-entry {
            min-width: 0;
            flex: 1;
        }

        .daily-pulse {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 3px;
        }

        h1 {
            font-size: 22px;
        }
    }

    .workspace-header--mobile {
        padding: max(12px, env(safe-area-inset-top)) 12px 10px;
    }

    .workspace-header--mobile .header-top {
        align-items: center;
        gap: 10px;
    }

    .workspace-header--mobile .header-right {
        min-width: 0;
    }

    .workspace-header--mobile .command-entry,
    .workspace-header--mobile .wk-icon-button,
    .workspace-header--mobile .open-today-button {
        min-width: 44px;
        min-height: 44px;
    }

    .workspace-header--mobile .command-entry {
        width: 44px;
        flex: 0 0 44px;
        justify-content: center;
        padding: 0;
    }

    .workspace-header--mobile .command-entry kbd,
    .workspace-header--mobile .command-label-full,
    .workspace-header--mobile .open-today-full {
        display: none;
    }

    .workspace-header--mobile .command-label-short,
    .workspace-header--mobile .open-today-short {
        display: inline;
    }

    .workspace-header--mobile .command-label-short {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
    }

    .workspace-header--mobile .daily-pulse {
        overflow-x: auto;
        flex-wrap: nowrap;
        gap: 10px;
        margin-top: 10px;
        padding-bottom: 2px;
        scrollbar-width: none;
        overscroll-behavior-inline: contain;
        touch-action: pan-x;
    }

    .workspace-header--mobile .daily-pulse::-webkit-scrollbar {
        display: none;
    }

    .workspace-header--mobile .daily-pulse :global(.wk-inline-stat) {
        min-height: 40px;
        flex: 0 0 auto;
        white-space: nowrap;
    }

    @container (max-width: 620px) {
        .workspace-header--mobile .header-top {
            align-items: stretch;
        }

        .workspace-header--mobile .header-right {
            width: 100%;
        }

        .workspace-header--mobile .open-today-button {
            flex: 1;
        }
    }

    @container (max-width: 360px) {
        .workspace-header--mobile h1 {
            font-size: 19px;
        }

        .workspace-header--mobile .header-date {
            font-size: 12px;
        }
    }
</style>
