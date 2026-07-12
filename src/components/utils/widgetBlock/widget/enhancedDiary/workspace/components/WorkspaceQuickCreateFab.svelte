<script lang="ts">
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        onCreateTask: () => void;
        onCreateRecord: () => void;
        onOpenAndAppendTemplate: () => void | Promise<void>;
        taskManagementEnabled?: boolean;
    }

    let {
        onCreateTask,
        onCreateRecord,
        onOpenAndAppendTemplate,
        taskManagementEnabled = true,
    }: Props = $props();

    let expanded = $state(false);

    async function runAction(action: () => void | Promise<void>): Promise<void> {
        expanded = false;
        await action();
    }
</script>

<div class="quick-create-fab">
    {#if expanded}
        <div class="fab-menu">
            {#if taskManagementEnabled}
                <button type="button" onclick={() => runAction(onCreateTask)}>
                    <span>任务</span>
                    <strong>新建任务</strong>
                </button>
            {/if}
            <button type="button" onclick={() => runAction(onCreateRecord)}>
                <span>记录</span>
                <strong>快速记录</strong>
            </button>
            <button type="button" onclick={() => runAction(onOpenAndAppendTemplate)}>
                <span>日记</span>
                <strong>打开并补模板</strong>
            </button>
        </div>
    {/if}

    <button
        type="button"
        class="fab-button"
        class:expanded
        aria-expanded={expanded}
        aria-label={expanded ? "关闭快捷创建" : "打开快捷创建"}
        onclick={() => (expanded = !expanded)}
    >
        <WorkspaceIcon name={expanded ? "close" : "create"} size={22} />
    </button>
</div>

<style>
    .quick-create-fab {
        position: fixed;
        right: 28px;
        bottom: 28px;
        z-index: 50;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: none;
    }

    .fab-menu,
    .fab-button {
        pointer-events: auto;
    }

    .fab-menu {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 210px;
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-background);
        box-shadow: var(--wk-shadow-popover);
        padding: 8px;
    }

    .fab-menu button {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        width: 100%;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--wk-ink-secondary);
        padding: 8px;
        text-align: left;
        cursor: pointer;
    }

    .fab-menu button:hover {
        border-color: color-mix(in srgb, var(--wk-primary) 24%, transparent);
        background: color-mix(in srgb, var(--wk-primary) 7%, transparent);
    }

    .fab-menu span {
        width: fit-content;
        border-radius: 999px;
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 24%, transparent);
        padding: 2px 7px;
        font-size: 12px;
        line-height: 1.4;
    }

    .fab-menu strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        color: var(--wk-ink);
    }

    .fab-button {
        width: 48px;
        height: 48px;
        border: 1px solid var(--wk-primary);
        border-radius: 999px;
        background: var(--wk-primary);
        color: var(--b3-theme-on-primary);
        cursor: pointer;
        box-shadow: var(--wk-shadow-elevated);
        transition: filter 0.14s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .fab-button:hover {
        filter: brightness(1.06);
    }

    @container (max-width: 900px) {
        .quick-create-fab {
            right: 16px;
            bottom: 88px;
        }

        .fab-menu {
            width: min(210px, calc(100cqw - 32px));
        }
    }
</style>
