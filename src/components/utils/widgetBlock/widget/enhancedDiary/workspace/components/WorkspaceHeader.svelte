<script lang="ts">
    interface Props {
        today: string;
        loading?: boolean;
        onRefresh: () => void | Promise<void>;
        onOpenAndAppendTemplate: () => void | Promise<void>;
        onOpenCommandPalette?: () => void;
    }

    let {
        today,
        loading = false,
        onRefresh,
        onOpenAndAppendTemplate,
        onOpenCommandPalette,
    }: Props = $props();
</script>

<header class="workspace-header">
    <div class="header-left">
        <h1>强化日记工作台</h1>
        <p class="subtitle">{today}</p>
    </div>
    <div class="header-right">
        <div class="header-actions">
            {#if onOpenCommandPalette}
                <button type="button" class="wk-btn wk-btn-ghost" onclick={onOpenCommandPalette} title="Ctrl/Cmd + K">
                    命令
                </button>
            {/if}
            <button type="button" class="wk-btn wk-btn-ghost" onclick={onRefresh} disabled={loading}>
                {loading ? "加载中…" : "刷新"}
            </button>
            <button type="button" class="wk-btn wk-btn-primary" onclick={onOpenAndAppendTemplate}>打开并补模板</button>
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
        border-bottom: 1px solid var(--wk-border);
        background: var(--wk-surface);
    }

    .header-left {
        min-width: 0;
    }

    h1 {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 700;
        color: var(--wk-ink);
        letter-spacing: -0.01em;
    }

    .subtitle {
        margin: 0 0 3px;
        color: var(--wk-ink);
        opacity: 0.72;
        font-size: 13px;
    }

    .header-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        flex-shrink: 0;
    }

    .header-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
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
