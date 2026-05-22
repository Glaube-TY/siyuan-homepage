<script lang="ts">
    interface Props {
        onCreateTask: () => void;
        onCreateRecord: () => void;
        onOpenToday: () => void | Promise<void>;
        onAppendTemplate: () => void | Promise<void>;
    }

    let {
        onCreateTask,
        onCreateRecord,
        onOpenToday,
        onAppendTemplate,
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
            <button type="button" onclick={() => runAction(onCreateTask)}>
                <span>任务</span>
                <strong>新建任务</strong>
            </button>
            <button type="button" onclick={() => runAction(onCreateRecord)}>
                <span>记录</span>
                <strong>快速记录</strong>
            </button>
            <button type="button" onclick={() => runAction(onOpenToday)}>
                <span>日记</span>
                <strong>打开今日日记</strong>
            </button>
            <button type="button" onclick={() => runAction(onAppendTemplate)}>
                <span>模板</span>
                <strong>补充今日模板</strong>
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
        {expanded ? "×" : "+"}
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
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
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
        color: var(--b3-theme-on-surface);
        padding: 8px;
        text-align: left;
        cursor: pointer;
    }

    .fab-menu button:hover {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
        background: color-mix(in srgb, var(--b3-theme-primary) 7%, transparent);
    }

    .fab-menu span {
        width: fit-content;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
        padding: 2px 7px;
        font-size: 11px;
        line-height: 1.4;
    }

    .fab-menu strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        color: var(--b3-theme-on-background);
    }

    .fab-button {
        width: 48px;
        height: 48px;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 999px;
        background: var(--b3-theme-primary);
        color: #fff;
        font-size: 28px;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
        transition: transform 0.14s, filter 0.14s;
    }

    .fab-button:hover {
        filter: brightness(1.06);
        transform: translateY(-1px);
    }

    .fab-button.expanded {
        font-size: 26px;
    }

    @media (max-width: 760px) {
        .quick-create-fab {
            right: 16px;
            bottom: 16px;
        }

        .fab-menu {
            width: min(210px, calc(100vw - 32px));
        }
    }
</style>
