<script lang="ts">
    interface Props {
        today: string;
        loading?: boolean;
        onRefresh: () => void | Promise<void>;
        onOpenToday: () => void | Promise<void>;
        onAppendTemplate: () => void | Promise<void>;
        onOpenCommandPalette?: () => void;
    }

    let {
        today,
        loading = false,
        onRefresh,
        onOpenToday,
        onAppendTemplate,
        onOpenCommandPalette,
    }: Props = $props();
</script>

<header class="workspace-header">
    <div class="header-left">
        <h1>强化日记工作台</h1>
        <p class="subtitle">任务 · 记录 · 复盘一体化管理中心</p>
        <p class="meta-line">本地日记数据 · Markdown 结构 · 思源笔记</p>
    </div>
    <div class="header-right">
        <span class="today-badge">{today}</span>
        <div class="header-actions">
            {#if onOpenCommandPalette}
                <button type="button" class="btn-ghost" onclick={onOpenCommandPalette} title="Ctrl/Cmd + K">
                    命令
                </button>
            {/if}
            <button type="button" class="btn-ghost" onclick={onRefresh} disabled={loading}>
                {loading ? "加载中…" : "刷新"}
            </button>
            <button type="button" class="btn-secondary" onclick={onOpenToday}>打开今日日记</button>
            <button type="button" class="btn-primary" onclick={onAppendTemplate}>补充今日模板</button>
        </div>
    </div>
</header>

<style>
    .workspace-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 22px 24px 20px;
        border-bottom: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
    }

    .header-left {
        min-width: 0;
    }

    h1 {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
        letter-spacing: -0.01em;
    }

    .subtitle {
        margin: 0 0 3px;
        color: var(--b3-theme-on-background);
        opacity: 0.72;
        font-size: 13px;
    }

    .meta-line {
        margin: 0;
        color: var(--b3-theme-on-background);
        opacity: 0.42;
        font-size: 11px;
        letter-spacing: 0.02em;
    }

    .header-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        flex-shrink: 0;
    }

    .today-badge {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
        font-variant-numeric: tabular-nums;
    }

    .header-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
    }

    button {
        border-radius: 7px;
        padding: 7px 13px;
        font-size: 13px;
        cursor: pointer;
        transition: opacity 0.12s, box-shadow 0.12s;
        white-space: nowrap;
    }

    .btn-ghost {
        border: 1px solid var(--b3-border-color);
        background: transparent;
        color: var(--b3-theme-on-surface);
    }

    .btn-ghost:hover:not(:disabled) {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .btn-secondary {
        border: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
    }

    .btn-secondary:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .btn-primary {
        border: 1px solid var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    }

    .btn-primary:hover {
        opacity: 0.88;
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    @media (max-width: 760px) {
        .workspace-header {
            flex-direction: column;
            align-items: stretch;
            padding: 16px;
        }

        .header-right {
            align-items: flex-start;
        }

        .header-actions {
            justify-content: flex-start;
        }
    }
</style>
