<script lang="ts">
    import { createOpenHomepageSetting } from "@/homepage/header/quick-button";

    interface Props {
        title: string;
        message: string;
        plugin: any;
        hint?: string;
    }

    let { title, message, plugin, hint }: Props = $props();

    function handleOpenSettings() {
        const open = createOpenHomepageSetting(plugin);
        open();
    }
</script>

<div class="homepage-global-sql-empty-state">
    <strong>{title}</strong>
    <span>{message}</span>
    <button type="button" class="b3-button b3-button--text" onclick={handleOpenSettings}>
        打开主页设置
    </button>
    {#if hint}
        <small>{hint}</small>
    {/if}
</div>

<style lang="scss">
    .homepage-global-sql-empty-state {
        width: 100%;
        min-height: 88px;
        padding: 16px;
        border: 1px dashed var(--b3-border-color);
        border-radius: 8px;
        color: var(--b3-theme-secondary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-align: center;

        strong {
            color: var(--b3-theme-on-surface);
            font-size: 16px;
            font-weight: 600;
        }

        span {
            font-size: 13px;
            line-height: 1.5;
        }

        small {
            font-size: 12px;
            opacity: 0.8;
        }
    }
</style>
